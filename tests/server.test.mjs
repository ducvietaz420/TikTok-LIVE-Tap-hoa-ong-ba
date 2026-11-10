import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(predicate, description, timeout = 5000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try { const result = await predicate(); if (result) return result; }
    catch (error) { lastError = error; }
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}

function websocketText(value) {
  const payload = Buffer.from(JSON.stringify(value));
  assert.ok(payload.length < 65536);
  const header = Buffer.alloc(payload.length < 126 ? 2 : 4);
  header[0] = 0x81;
  if (payload.length < 126) header[1] = payload.length;
  else { header[1] = 126; header.writeUInt16BE(payload.length, 2); }
  return Buffer.concat([header, payload]);
}

test('local bridge carries viewer arrivals and configured gifts through SSE without mixing real and demo ledgers', { timeout: 30000 }, async t => {
  const mock = http.createServer();
  const sockets = new Set();
  mock.on('upgrade', (request, socket) => {
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
  });
  const mockPort = await listen(mock);
  const reserve = http.createServer();
  const appPort = await listen(reserve);
  await new Promise(resolve => reserve.close(resolve));
  const dataRoot = path.resolve(root, '.runtime');
  await mkdir(dataRoot, { recursive: true });
  const dataDir = await mkdtemp(path.join(dataRoot, 'test-server-'));
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(appPort), DATA_DIR: dataDir, TIKFINITY_URL: `ws://127.0.0.1:${mockPort}/` },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', chunk => { output = (output + chunk).slice(-10000); });
  }
  const exited = once(child, 'exit');
  let sseRequest;
  t.after(async () => {
    sseRequest?.destroy();
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await Promise.race([exited, sleep(2000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await Promise.race([exited, sleep(2000)]);
    }
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => mock.close(resolve));
    // Only remove the freshly created test directory inside this checkout.
    assert.ok(path.resolve(dataDir).startsWith(dataRoot + path.sep));
    assert.ok(path.basename(dataDir).startsWith('test-server-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${appPort}`;
  const get = async route => {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(1500) });
    assert.equal(response.status, 200, `${route}: ${output}`);
    return response;
  };
  const state = async () => (await get('/api/state')).json();
  const post = (route, data, extraHeaders = {}) => fetch(base + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(data), signal: AbortSignal.timeout(1500),
  });
  await until(async () => {
    if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
    return (await (await get('/api/health')).json()).ok;
  }, 'HTTP server startup');
  assert.deepEqual(await (await get('/api/health')).json(), { app: 'tap-hoa-ong-ba', ok: true });
  await until(async () => (await state()).connection === 'connected', `mock websocket connection; ${output}`);
  assert.equal((await state()).points, 0, 'test has an isolated persistent ledger');
  const initialSettings=(await state()).settings;
  assert.equal(initialSettings.residentsEnabled,true,'ambient residents are enabled by default');
  assert.equal(initialSettings.residentInterval,5,'residents cross at a regular five-second interval by default');
  assert.equal((await state()).visitorsEntered,0,'real entry count begins at zero');

  const sse = [];
  sseRequest = http.get(base + '/events', response => {
    response.setEncoding('utf8');
    let pending = '';
    response.on('data', chunk => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf('\n\n')) !== -1) {
        const block = pending.slice(0, end); pending = pending.slice(end + 2);
        const type = block.match(/^event: (.+)$/m)?.[1];
        const data = block.match(/^data: (.+)$/m)?.[1];
        if (type && data) sse.push({ type, data: JSON.parse(data) });
      }
    });
  });
  sseRequest.on('error', () => {});
  await until(() => sse.find(item => item.type === 'state'), 'initial SSE state');
  assert.equal(sse[0].data.points, 0);
  const send = value => {
    assert.equal(sockets.size, 1, 'one active bridge connection');
    [...sockets][0].write(websocketText(value));
  };

  assert.equal((await post('/api/settings',{residentsEnabled:false,residentInterval:1})).status,200);
  assert.equal((await state()).settings.residentInterval,3,'resident frequency is bounded at the lower limit');
  assert.equal((await post('/api/settings',{residentInterval:100})).status,200);
  assert.equal((await state()).settings.residentInterval,15,'resident frequency is bounded at the upper limit');
  const firstAvatar='https://p16-sign-va.tiktokcdn.com/tos-maliva-avt/viewer-an.jpeg';
  const firstEntry={event:'member',data:{msgId:'entry-an-1',userId:'viewer-an',nickname:'An vừa vào',profilePictureUrl:firstAvatar}};
  send(firstEntry);
  const entered=await until(()=>sse.find(item=>item.type==='effect'&&item.data.action==='viewer'&&!item.data.demo&&item.data.userId==='viewer-an'),'a viewer enters before sending any gift or chat');
  assert.equal(entered.data.user,'An vừa vào');
  assert.equal(entered.data.avatar,'/api/avatar?url='+encodeURIComponent(firstAvatar),'the entering viewer keeps their own avatar');
  assert.equal(entered.data.voice,null,'entering a room does not play a gift thank-you');
  assert.equal((await state()).visitorsEntered,1);
  assert.equal((await state()).settings.residentsEnabled,false,'turning off ambient residents does not block real viewers');
  assert.equal((await state()).points,0);assert.equal((await state()).likes,0);assert.equal((await state()).followers,0);
  send({...firstEntry,data:{...firstEntry.data,msgId:'entry-an-repeat'}});
  const secondAvatar='https://p16-sign-va.tiktokcdn.com/tos-maliva-avt/viewer-mai.jpeg';
  send({event:'member',data:{msgId:'entry-mai-1',userId:'viewer-mai',nickname:'Mai vừa vào',profilePictureUrl:secondAvatar}});
  await until(async()=>(await state()).visitorsEntered===2,'a different viewer enters independently of the duplicate');
  await until(()=>sse.find(item=>item.type==='effect'&&item.data.action==='viewer'&&item.data.userId==='viewer-mai'),'the second arrival reaches the SSE client');
  const realArrivals=sse.filter(item=>item.type==='effect'&&item.data.action==='viewer'&&!item.data.demo);
  assert.equal(realArrivals.length,2,'repeated entry messages for the same viewer do not create another actor');
  assert.equal(realArrivals.filter(item=>item.data.userId==='viewer-an').length,1);
  const secondEntered=realArrivals.find(item=>item.data.userId==='viewer-mai');
  assert.ok(secondEntered,'a second viewer produces their own actor');
  assert.equal(secondEntered.data.avatar,'/api/avatar?url='+encodeURIComponent(secondAvatar));
  assert.notEqual(secondEntered.data.viewerKey,entered.data.viewerKey,'entry identities are kept separate');
  const beforeViewerDemo=await state();
  const demoViewerResponse=await post('/api/test-viewer',{});
  assert.equal(demoViewerResponse.status,200);
  assert.equal((await demoViewerResponse.json()).ok,true);
  const demoViewer=await until(()=>sse.find(item=>item.type==='effect'&&item.data.action==='viewer'&&item.data.demo),'local viewer demo');
  assert.equal(demoViewer.data.avatar,'/avatar-demo.svg');
  const afterViewerDemo=await state();
  for(const metric of ['visitorsEntered','points','likes','followers'])assert.equal(afterViewerDemo[metric],beforeViewerDemo[metric],`viewer demo does not change ${metric}`);
  assert.equal((await post('/api/settings',{residentsEnabled:true,residentInterval:5})).status,200);

  const giftRules=(await state()).giftRules;
  assert.equal(giftRules.length,16,'all sixteen interaction rows are loaded by the server');
  for(const rule of giftRules){
    assert.match(rule.giftId,/^[1-9]\d*$/,`${rule.id} must have an assigned real gift ID`);
    assert.match(rule.icon,/^\/gifts\/.+\.(png|webp|jpg|jpeg|gif|svg)$/i,`${rule.id} must have a local gift picture`);
  }
  const firstRule=giftRules[0];
  const previewResponse=await post('/api/test-gift',{ruleId:firstRule.id});
  assert.equal(previewResponse.status,200);
  assert.deepEqual(await previewResponse.json(),{ok:true,action:firstRule.action,demo:true});
  const preview=await until(()=>sse.find(item=>item.type==='effect'&&item.data.demo&&item.data.ruleId===firstRule.id),'mapped gift preview');
  assert.equal(preview.data.giftIcon,firstRule.icon);
  assert.equal(preview.data.giftId,firstRule.giftId);
  assert.equal((await state()).points,0,'test-gift endpoint never adds gift points');
  assert.equal((await state()).shopLevelOverride,1,'test-gift endpoint never upgrades the real shop');
  const icon=await get(firstRule.icon);
  assert.match(icon.headers.get('content-type'),/^image\//);
  assert.ok((await icon.arrayBuffer()).byteLength>100,'real local gift image is served');

  const invalidRules=structuredClone(giftRules);
  invalidRules[0].label='Partial edit must not survive';
  invalidRules[1].giftId=invalidRules[0].giftId;
  assert.equal((await post('/api/gifts',{rules:invalidRules})).status,400);
  assert.deepEqual((await state()).giftRules,giftRules,'duplicate-ID rejection does not mutate any row');
  const editedRules=structuredClone(giftRules);editedRules[0].label='Tên hành động đã lưu';
  assert.equal((await post('/api/gifts',{rules:editedRules})).status,200);
  await until(async()=>JSON.parse(await readFile(path.join(dataDir,'state.json'),'utf8')).giftRules[0].label==='Tên hành động đã lưu','gift configuration persisted to the isolated state file');
  assert.equal((await post('/api/gifts',{restore:true})).status,200);
  assert.deepEqual((await state()).giftRules,giftRules,'restore returns exactly to the bundled preset');

  assert.equal((await post('/api/action', { action: 'stock' })).status, 200);
  await until(() => sse.find(item => item.type === 'effect' && item.data.demo && item.data.action === 'stock'), 'manual demo effect over SSE');
  assert.equal((await state()).points, 0);
  const streak = { event: 'gift', data: { msgId: 'gift-final', groupId: 'streak-a', userId: 'an', nickname: 'An', giftId: 99, giftName: 'Tea', giftType: 1, diamondCount: 5, repeatCount: 3, repeatEnd: false } };
  send(streak);
  send({ event: 'follow', data: { msgId: 'follow-a', userId: 'an', nickname: 'An' } });
  await until(async () => (await state()).followers === 1, 'follow after incomplete streak');
  assert.equal((await state()).points, 0, 'incomplete repeatable gift is not counted');
  streak.data.repeatEnd = true;
  send(streak);
  await until(async () => (await state()).points === 15, 'final gift total');
  await until(() => sse.find(item => item.type === 'effect' && !item.data.demo && item.data.action === 'stock'), 'real gift effect over SSE');
  send(streak);
  send({ event: 'like', data: { msgId: 'like-a', nickname: 'An', userId: 'an', likeCount: 7 } });
  await until(async () => (await state()).likes === 7, 'like after duplicate gift');
  assert.equal((await state()).points, 15, 'duplicate final gift is ignored');
  assert.deepEqual((await state()).supporters, [{ id: 'an', user: 'An', points: 15 }]);
  send({ event: 'chat', data: { msgId: 'tea-a', userId: 'linh', nickname: 'Linh', comment: 'Trà!' } });
  await until(() => sse.find(item => item.type === 'effect' && item.data.action === 'tea' && item.data.user === 'Linh'), 'Vietnamese tea chat command');

  assert.equal((await post('/api/settings', { paused: true })).status, 200);
  const effectsBeforePause = sse.filter(item => item.type === 'effect').length;
  send({ event: 'gift', data: { ...streak.data, msgId: 'paused-gift', groupId: 'streak-b', repeatCount: 2 } });
  send({ event: 'like', data: { msgId: 'like-paused', userId: 'an', likeCount: 2 } });
  await until(async () => { const value = await state(); return value.points === 25 && value.likes === 9; }, 'paused real gift and like ledger');
  assert.equal(sse.filter(item => item.type === 'effect').length, effectsBeforePause, 'pause suppresses effects while preserving points');
  assert.equal((await state()).supporters[0].points, 25);

  assert.equal((await post('/api/settings',{paused:false})).status,200);
  assert.equal((await post('/api/reset',{})).status,200);
  for(const [index,rule] of giftRules.entries()){
    const user=`Mapped-${index}`;
    send({event:'gift',data:{msgId:`mapped-${index}`,userId:`mapped-user-${index}`,nickname:user,giftId:rule.giftId,giftName:rule.giftName,giftType:0,diamondCount:1,repeatCount:1}});
    const routed=await until(()=>sse.find(item=>item.type==='effect'&&!item.data.demo&&item.data.user===user),`${rule.id} exact gift ID reaction`);
    assert.equal(routed.data.action,rule.action,rule.id);
    assert.equal(routed.data.ruleId,rule.id,rule.id);
    assert.equal(routed.data.giftId,rule.giftId,rule.id);
    assert.equal(routed.data.giftIcon,rule.icon,rule.id);
  }
  assert.equal((await state()).points,16,'incoming diamond metadata, not configured prices, controls the ledger');
  assert.equal((await state()).shopLevelOverride,2,'one real upgrade gift raises the permanent shop level once');
  assert.equal((await post('/api/reset',{})).status,200);
  const upgradeRule=giftRules.find(rule=>rule.action==='upgrade');
  send({event:'gift',data:{msgId:'real-upgrade-final',groupId:'upgrade-streak',userId:'upgrader',nickname:'Upgrade test',giftId:upgradeRule.giftId,giftName:upgradeRule.giftName,giftType:1,diamondCount:1,repeatCount:2,repeatEnd:true}});
  await until(async()=>{const current=await state();return current.points===2&&current.shopLevelOverride===3;},'real final upgrade streak raises permanent shop by two');
  assert.equal((await state()).level,3);
  const pointsBeforeUpgradePreview=(await state()).points;
  assert.equal((await post('/api/test-gift',{ruleId:upgradeRule.id})).status,200);
  assert.equal((await state()).points,pointsBeforeUpgradePreview);
  assert.equal((await state()).shopLevelOverride,3,'upgrade preview cannot raise the permanent level');
  assert.equal((await post('/api/reset',{})).status,200);
  const reset=await state();
  assert.equal(reset.points,0);assert.equal(reset.shopLevelOverride,1);assert.equal(reset.level,1);
  assert.deepEqual(reset.supporters,[]);

  const shareMessage={event:'share',data:{msgId:'share-real-1',nickname:'Bạn chia sẻ',userId:'sharer-1'}};
  send(shareMessage);
  const thankYou=await until(()=>sse.find(item=>item.type==='effect'&&item.data.voice==='share'&&!item.data.demo),'share acknowledgement reaches the overlay');
  assert.equal(thankYou.data.action,'wave');
  assert.equal(thankYou.data.text,'Cảm ơn Bạn chia sẻ đã chia sẻ LIVE!');
  send(shareMessage);
  await sleep(50);
  assert.equal(sse.filter(item=>item.type==='effect'&&item.data.voice==='share'&&!item.data.demo).length,1,'duplicate share receipt is not thanked twice');
  assert.equal((await state()).points,0,'sharing does not add gift points');
  assert.equal((await post('/api/action',{action:'share'})).status,200);
  await until(()=>sse.find(item=>item.type==='effect'&&item.data.voice==='share'&&item.data.demo),'demo share acknowledgement can be tested from the dashboard');

  const denied = await post('/api/settings', { shopName: 'External overwrite' }, { Origin: 'https://unrelated.example' });
  assert.equal(denied.status, 403);
  assert.equal((await state()).settings.shopName, 'TẠP HOÁ ÔNG BA');
  assert.equal((await get('/overlay')).headers.get('content-type'), 'text/html; charset=utf-8');
  const manifest = await (await get('/voice-lines.json')).json();
  assert.ok(manifest.ambient.length >= 1);
  const audio = await get(manifest.ambient[0].src);
  assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  assert.ok((await audio.arrayBuffer()).byteLength > 2048, 'included voice clip is actually served');
  const music=await get('/music/tiem-vui.wav');
  assert.equal(music.headers.get('content-type'),'audio/wav');
  assert.equal(Buffer.from(await music.arrayBuffer()).toString('ascii',0,4),'RIFF','included music is a playable WAV');
  assert.ok(manifest.share?.length >= 1,'share acknowledgements have dedicated voice clips');
  const shareAudio=await get(manifest.share[0].src);
  assert.equal(shareAudio.headers.get('content-type'),'audio/mpeg');
  assert.ok((await shareAudio.arrayBuffer()).byteLength>2048,'share audio is included locally');
});
