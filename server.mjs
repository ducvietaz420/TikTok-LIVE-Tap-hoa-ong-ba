import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createWorld, snapshot, updateSettings, applyEvent, setGiftRules } from './lib/world.mjs';
import { createEventNormalizer } from './lib/events.mjs';
import { fetchAvatar } from './lib/avatar.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3210;
const baseURL = `http://127.0.0.1:${port}`;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root,'.runtime');
const tikfinityURL = process.env.TIKFINITY_URL || 'ws://localhost:21213/';
const wsConfig = new URL(tikfinityURL);
if(wsConfig.protocol!=='ws:'||!['localhost','127.0.0.1','[::1]'].includes(wsConfig.hostname)) throw new Error('TikFinity phải là WebSocket trên máy cục bộ.');
const clients = new Set();
let saved = {};
try { saved = JSON.parse(await readFile(path.join(dataDir,'state.json'),'utf8')); } catch {}
const defaultGiftRules = JSON.parse(await readFile(path.join(root,'public','gift-map.json'),'utf8'));
const world = createWorld(saved, {giftRules:defaultGiftRules});
let persistTimer;
function persist() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try { await mkdir(dataDir, {recursive:true}); await writeFile(path.join(dataDir,'state.json'), JSON.stringify({settings:world.settings,points:world.points,supporters:world.supporters,giftRules:world.giftRules,shopLevelOverride:world.shopLevelOverride},null,2)); }
    catch (e) { console.error('Không lưu được cài đặt:', e.message); }
  },250);
}
function broadcast(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(payload);
}
const publishState = () => broadcast('state', snapshot(world));
const cooldowns = new Map();
function receive(event) {
  // Likes and chat commands can arrive in bursts. Ledger is still updated for every real gift.
  const now = Date.now();
  const key = event.type === 'chat' ? `chat:${event.userId || event.user}` : event.type;
  const limited = ['like','chat','follow','share'].includes(event.type) && now - (cooldowns.get(key) || 0) < (event.type === 'chat' ? 12000 : 3000);
  if (event.type === 'chat' && limited) return;
  const effect = applyEvent(world,event,now);
  if (!effect) { if (['gift','like','follow'].includes(event.type)) {publishState();persist();} return; }
  if (!limited) { cooldowns.set(key, now); broadcast('effect',effect); }
  if (cooldowns.size > 1000) for (const [k,t] of cooldowns) if (now-t>60000) cooldowns.delete(k);
  publishState(); persist();
}
const normalizer = createEventNormalizer();
let socket, reconnectTimer, stopped = false;
function connectTikfinity() {
  if (stopped) return;
  world.connection = 'connecting'; publishState();
  try {
    const activeSocket = new WebSocket(tikfinityURL);
    socket = activeSocket;
    activeSocket.addEventListener('open',()=>{if(socket!==activeSocket)return;world.connection='connected';publishState();console.log('Đã kết nối TikFinity · 21213');});
    activeSocket.addEventListener('message', event=> {
      if(socket!==activeSocket)return;
      try { for (const item of normalizer(event.data)) receive(item); } catch(e) { console.error('Sự kiện không hợp lệ:',e.message); }
    });
    activeSocket.addEventListener('error',()=>{});
    activeSocket.addEventListener('close',()=> {
      if(socket!==activeSocket)return;
      world.connection='disconnected';publishState();clearTimeout(reconnectTimer);
      if (!stopped) reconnectTimer=setTimeout(connectTikfinity,4000);
    });
  } catch { world.connection='disconnected';publishState();reconnectTimer=setTimeout(connectTikfinity,4000); }
}
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.ico':'image/x-icon','.ttf':'font/ttf','.woff2':'font/woff2'};
function json(res,body,status=200) {res.writeHead(status,{'Content-Type':types['.json']});res.end(JSON.stringify(body));}
async function body(req) {
  let value=''; for await (const chunk of req) {value+=chunk;if(value.length>40000) throw new Error('Nội dung quá dài');}
  return JSON.parse(value || '{}');
}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  const allowedHost = new Set([`127.0.0.1:${port}`,`localhost:${port}`]);
  if (!allowedHost.has(req.headers.host)) return json(res,{error:'Máy chủ không hợp lệ'},403);
  const url = new URL(req.url,baseURL);
  try {
    if(url.pathname==='/api/avatar'&&req.method==='GET'){
      try{const avatar=await fetchAvatar(url.searchParams.get('url'));res.setHeader('Cache-Control','private, max-age=300');res.writeHead(200,{'Content-Type':avatar.mimeType,'Content-Length':avatar.body.length});res.end(avatar.body);}
      catch{const placeholder=await readFile(path.join(root,'public','avatar-placeholder.svg'));res.writeHead(200,{'Content-Type':types['.svg'],'Content-Length':placeholder.length});res.end(placeholder);}
      return;
    }
    if (url.pathname==='/api/state' && req.method==='GET') return json(res,snapshot(world));
    if (url.pathname==='/api/health' && req.method==='GET') return json(res,{app:'tap-hoa-ong-ba',ok:true});
    if (url.pathname==='/events' && req.method==='GET') {
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','Cache-Control':'no-cache'});
      res.write(`event: state\ndata: ${JSON.stringify(snapshot(world))}\n\n`); clients.add(res);
      req.on('close',()=>clients.delete(res)); return;
    }
    if (req.method==='POST' && url.pathname.startsWith('/api/')) {
      if (req.headers.origin && ![baseURL,`http://localhost:${port}`].includes(req.headers.origin)) return json(res,{error:'Chỉ chấp nhận điều khiển từ máy này'},403);
      if (!String(req.headers['content-type']||'').includes('application/json')) return json(res,{error:'Cần JSON'},415);
      const data=await body(req);
      if (url.pathname==='/api/settings') {updateSettings(world,data);publishState();persist();return json(res,snapshot(world));}
      if(url.pathname==='/api/test-viewer'){
        const key='demo:'+randomUUID();
        broadcast('effect',{action:'viewer',user:'Khách vừa vào · DEMO',userId:key,viewerKey:key,avatar:'/avatar-demo.svg',voice:null,demo:true,at:Date.now(),text:'Khách thử avatar đi ngang tiệm'});
        return json(res,{ok:true,demo:true});
      }
      if (url.pathname==='/api/gifts') {
        setGiftRules(world,data.restore ? defaultGiftRules : data.rules);
        publishState();persist();return json(res,snapshot(world));
      }
      if (url.pathname==='/api/test-gift') {
        const rule=world.giftRules.find(item=>item.id===data.ruleId);
        if(!rule?.giftId) return json(res,{error:'Quà này chưa được gán'},400);
        const effect=applyEvent(world,{type:'gift',giftId:rule.giftId,giftName:rule.giftName,coins:rule.diamonds||0,count:1,user:'Bạn đang thử quà',userId:'local-preview',demo:true});
        if(effect&&rule.action==='sit'){effect.user='Khách thử avatar';effect.avatar='/avatar-demo.svg';}
        if(effect)broadcast('effect',effect);
        return json(res,{ok:true,action:effect?.action||null,demo:true});
      }
      if (url.pathname==='/api/action') {
        const actions=['wave','tea','cat','stock','rain','upgrade','heart','fireworks','speak','share'];
        if (!actions.includes(data.action)) return json(res,{error:'Hành động không hợp lệ'},400);
        if (data.action==='rain') updateSettings(world,{weather:world.settings.weather==='rain'?'sunny':'rain'});
        if (data.action==='upgrade') data.action='fireworks'; // Preview must never change real gift points.
        const sharing=data.action==='share';
        broadcast('effect',{action:sharing?'wave':data.action,voice:sharing?'share':data.action==='speak'?'ambient':({tea:'tea',wave:'greeting',stock:'gift',rain:'rain'}[data.action]||null),text:sharing?'Cảm ơn Khách thử chia sẻ đã chia sẻ LIVE!':'Đang thử hiệu ứng',demo:true,at:Date.now()});
        publishState();persist();return json(res,{ok:true});
      }
      if (url.pathname==='/api/reset') {
        world.points=0;world.shopLevelOverride=1;world.supporters=[];world.likes=0;world.followers=0;world.lastEvent=null;publishState();persist();return json(res,{ok:true});
      }
      if (url.pathname==='/api/reconnect') {const old=socket;socket=null;old?.close();clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connectTikfinity,100);return json(res,{ok:true});}
      return json(res,{error:'Không có thao tác này'},404);
    }
    if(req.method!=='GET'&&req.method!=='HEAD') return json(res,{error:'Không hỗ trợ'},405);
    let filePath;
    if(url.pathname==='/voice-lines.json') filePath=path.join(root,'voice-lines.json');
    else {
      let name=decodeURIComponent(url.pathname);
      if(name==='/'||name==='/control') name='/control.html';
      if(name==='/overlay') name='/overlay.html';
      const publicRoot=path.join(root,'public'); filePath=path.resolve(publicRoot,'.'+name);
      if(!filePath.startsWith(publicRoot+path.sep)) return json(res,{error:'Không hợp lệ'},403);
    }
    const info=await stat(filePath);if(!info.isFile()) return json(res,{error:'Không tìm thấy'},404);
    res.writeHead(200,{'Content-Type':types[path.extname(filePath)]||'application/octet-stream','Content-Length':info.size});
    res.end(req.method==='HEAD'?undefined:await readFile(filePath));
  } catch(e) {if(!res.headersSent) json(res,{error:e.code==='ENOENT'?'Không tìm thấy':e.message},e.code==='ENOENT'?404:400);else res.end();}
});
const heartbeat=setInterval(()=>{for(const client of clients) client.write(': heartbeat\n\n');},15000);
server.listen(port,'127.0.0.1',()=> {console.log(`TẠP HOÁ ÔNG BA · ${baseURL}\nMàn hình phát: ${baseURL}/overlay\nChờ TikFinity: ${tikfinityURL}`);connectTikfinity();});
server.on('error', e=>{console.error(e.code==='EADDRINUSE'?`Cổng ${port} đang được sử dụng. Mở ${baseURL} hoặc chọn cổng PORT khác.`:e.message);process.exitCode=1;clearInterval(heartbeat);});
function shutdown(){stopped=true;clearInterval(heartbeat);clearTimeout(reconnectTimer);socket?.close();for(const client of clients)client.end();server.close();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
