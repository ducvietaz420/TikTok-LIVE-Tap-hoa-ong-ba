import { initScene } from './scene.js';
import {createDogBarkPlayer,DOG_BARK_ONSETS} from './dog-audio.js';
import {createBackgroundMusicPlayer} from './background-music.js';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const preview = params.has('preview');
if(params.has('capture')) $('stage').classList.add('capture');
if(preview) $('overlay-tools').hidden=true;
let scene, state, talking=false, clips={}, soundReady=false, localMuted=false, currentAudio=null, currentClip=null, nextSpeechAt=Date.now()+12000, audioContext, windGain, effectsGain;
let queue=[], alertTimer, unlockAttempt=false, giftRulesKey='', activeGiftTimer, reactionSpeechTimer;
const effectSources=new Set();
let effectEpoch=0;
const dogBarkPlayer=createDogBarkPlayer();
const backgroundMusic=createBackgroundMusicPlayer({
  createAudio:()=>$('background-music'),
  onPlaying:()=>{if(!localMuted&&!preview){soundReady=true;$('sound-toggle').textContent='♫ Âm thanh đang bật';$('overlay-tools').classList.remove('needs-audio');}},
  onBlocked:()=>{if(!localMuted&&!preview){$('overlay-tools').classList.add('needs-audio');$('sound-toggle').textContent='♫ Bấm để bật tiếng';}},
  onError:error=>{console.warn('Nhạc nền:',error?.message||error);$('sound-toggle').title='Chưa tải được nhạc nền. Bấm tắt rồi bật âm thanh để thử lại.';}
});
function updateBackgroundMusic(){
  if(!state)return;
  backgroundMusic.update({enabled:state.settings.musicEnabled!==false,volume:state.settings.musicVolume??.28,masterVolume:state.settings.volume,paused:state.settings.paused,muted:localMuted,preview,talking});
}
dogBarkPlayer.preload().catch(error=>console.warn(error.message));
function trackEffect(source){effectSources.add(source);source.onended=()=>effectSources.delete(source);return source;}
function cancelEffectSounds(){effectEpoch++;for(const source of effectSources){try{source.stop();}catch{}}effectSources.clear();}
try { scene=initScene($('scene')); } catch(e) { console.error(e);$('scene-error').hidden=false; }
fetch('/voice-lines.json').then(r=>r.json()).then(data=>{clips=data;for(const group of Object.values(clips))for(const clip of group)clip.text=String(clip.text).normalize('NFC');}).catch(console.error);
const format = n => new Intl.NumberFormat('vi-VN').format(n || 0);
function setState(next) {
  state=next;$('shop-name').textContent=state.settings.shopName;
  $('level').textContent=`TIỆM CẤP ${state.level} / 5`;$('points').textContent=format(state.points);
  $('progress').style.width=`${state.progress*100}%`;
  $('goal-value').textContent=`${format(state.points)} / ${format(state.target)}`;
  $('goal-caption').textContent=['Kệ hàng mới','Thêm một mái hiên','Tiệm vui đông khách','Góc phố rộn ràng','Tiệm nhỏ đầy yêu thương'][state.level-1];
  $('connection-dot').className=`connection-dot ${state.connection}`;
  $('connection-dot').title=state.connection==='connected'?'Đã nối TikFinity':'Chờ TikFinity';
  $('pause-label').hidden=!state.settings.paused;
  const rulesKey=JSON.stringify(state.giftRules||[]);
  if(rulesKey!==giftRulesKey){giftRulesKey=rulesKey;renderGiftBoard(state.giftRules||[]);}
  $('supporters').replaceChildren();
  if(!state.supporters.length){const p=document.createElement('p');p.className='empty-support';p.innerHTML='Chén trà đã rót,<br>mời bạn ghé chơi.';$('supporters').append(p);}
  state.supporters.slice(0,3).forEach((p,i)=>{const row=document.createElement('div');row.className='supporter';const rank=document.createElement('span');rank.className='rank';rank.textContent=i+1;const text=document.createElement('p');text.textContent=p.user;const points=document.createElement('small');points.textContent=`${format(p.points)} điểm`;text.append(points);row.append(rank,text);$('supporters').append(row);});
  scene?.setQuality(state.settings.quality);
  if(currentAudio) currentAudio.volume=state.settings.volume;
  if(!state.settings.voiceEnabled||state.settings.paused){clearTimeout(reactionSpeechTimer);finishSpeech(true);if(state.settings.paused)cancelEffectSounds();}
  if(windGain&&audioContext)windGain.gain.setTargetAtTime(state.settings.ambientEnabled&&!state.settings.paused&&!localMuted?state.settings.volume*.025:0,audioContext.currentTime,.5);
  if(effectsGain&&audioContext)effectsGain.gain.setTargetAtTime(!state.settings.paused&&!localMuted?state.settings.volume:0,audioContext.currentTime,.05);
  updateBackgroundMusic();
}
function renderGiftBoard(rules) {
  $('gift-rows').replaceChildren();
  for(const rule of rules){
    const row=document.createElement('div');row.className='gift-row';row.dataset.ruleId=rule.id;row.style.setProperty('--gift-color',rule.color||'#8b714d');row.title=`${rule.giftName||'Chưa gán quà'} → ${rule.label}`;
    const icon=document.createElement('img');icon.className='gift-icon';icon.alt=rule.giftName||'Quà tặng';if(rule.icon)icon.src=rule.icon;
    const copy=document.createElement('span');copy.className='gift-copy';const label=document.createElement('b');label.textContent=rule.label;const gift=document.createElement('small');gift.textContent=rule.giftName||'Chưa gán quà';copy.append(label,gift);
    const price=document.createElement('span');price.className='gift-price';price.textContent=Number.isFinite(rule.diamonds)?String(rule.diamonds):'–';price.title='Giá quà tham khảo · xu';
    row.append(icon,copy,price);$('gift-rows').append(row);
  }
}
function effectSound(action){
  if(preview||localMuted||!soundReady||!state?.settings.volume)return;
  if(!['dog','music','storm','stone','wind','windstrong','live'].includes(action))return;
  startAmbience();const ctx=audioContext;if(!ctx)return;
  ctx.resume();const base=ctx.currentTime;
  if(!effectsGain){effectsGain=ctx.createGain();effectsGain.connect(ctx.destination);}effectsGain.gain.value=state.settings.volume;
  function tone(frequency,start,length,type='sine',amplitude=.1){const osc=trackEffect(ctx.createOscillator()),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,base+start);gain.gain.setValueAtTime(0,base+start);gain.gain.linearRampToValueAtTime(amplitude,base+start+.018);gain.gain.exponentialRampToValueAtTime(.0001,base+start+length);osc.connect(gain).connect(effectsGain);osc.start(base+start);osc.stop(base+start+length+.03);}
  function noise(start,length,frequency,amplitude){const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*length),ctx.sampleRate),values=buffer.getChannelData(0);for(let i=0;i<values.length;i++)values[i]=Math.random()*2-1;const source=trackEffect(ctx.createBufferSource());source.buffer=buffer;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=frequency;const gain=ctx.createGain();gain.gain.setValueAtTime(amplitude,base+start);gain.gain.exponentialRampToValueAtTime(.0001,base+start+length);source.connect(filter).connect(gain).connect(effectsGain);source.start(base+start);}
  function pluck(frequency,start){const duration=1.1,count=Math.ceil(ctx.sampleRate*duration),period=Math.round(ctx.sampleRate/frequency),ring=new Float32Array(period),buffer=ctx.createBuffer(1,count,ctx.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<period;i++)ring[i]=Math.random()*2-1;for(let i=0;i<count;i++){const index=i%period,value=(ring[index]+ring[(index+1)%period])*.497;ring[index]=value;samples[i]=value*.12*(1-i/count);}const source=trackEffect(ctx.createBufferSource());source.buffer=buffer;source.connect(effectsGain);source.start(base+start);}
  if(action==='music'){const chords=[[130.81,196,261.63,329.63],[110,164.81,220,261.63],[87.31,130.81,174.61,220],[98,146.83,196,246.94]],pattern=[0,2,1,3,0,2,1,3];chords.forEach((chord,verse)=>pattern.forEach((index,i)=>pluck(chord[index],2+verse*2+i*.25)));}
  if(action==='dog'){const epoch=effectEpoch;dogBarkPlayer.schedule({context:ctx,output:effectsGain,startTime:base,isCurrent:()=>epoch===effectEpoch&&!localMuted&&!state?.settings.paused,track:trackEffect}).catch(error=>console.error('Tiếng chó sủa:',error.message));noise(6.75,3.5,1800,.025);}
  if(action==='storm'){noise(0,3,190,.24);noise(.25,.7,450,.1);noise(3,4,550,.1);noise(8,4,650,.09);}
  if(action==='stone'){noise(5,.17,470,.15);tone(100,5,.17,'triangle',.08);}
  if(action==='wind'||action==='windstrong'){noise(0,3,650,action==='wind'?.06:.1);noise(4,3.5,900,action==='wind'?.045:.075);}
  if(action==='live'){tone(523,.8,.16,'sine',.035);tone(784,1,.24,'sine',.035);}
}
function finishSpeech(stop=false) {
  if(stop){if(currentAudio){currentAudio.onended=null;currentAudio.onerror=null;currentAudio.pause();currentAudio=null;}queue=[];}
  talking=false;$('dialogue').hidden=true;currentClip=null;
  updateBackgroundMusic();
  nextSpeechAt=Date.now()+(state?.settings.speechInterval||55)*1000;
}
function selectClip(group) {const list=clips[group]||clips.ambient||[];return list[Math.floor(Math.random()*list.length)];}
async function say(group='ambient') {
  if(preview||localMuted||!state||!state.settings.voiceEnabled||state.settings.paused) return;
  const clip=selectClip(group);if(!clip)return;
  if(talking){if(group!=='ambient'&&queue.length<2)queue.push(group);return;}
  currentClip=clip;talking=true;$('dialogue-text').textContent=clip.text.normalize('NFC');$('dialogue').hidden=false;
  updateBackgroundMusic();
  const audio=new Audio(clip.src);currentAudio=audio;audio.volume=state.settings.volume;
  audio.onended=()=>{if(currentAudio!==audio)return;currentAudio=null;finishSpeech();if(queue.length)say(queue.shift());};
  audio.onerror=()=>{if(currentAudio!==audio)return;finishSpeech(true);$('sound-toggle').textContent='♫ Thử lại âm thanh';};
  try {await audio.play();if(currentAudio!==audio)return;soundReady=true;$('sound-toggle').textContent='♫ Âm thanh đang bật';$('overlay-tools').classList.remove('needs-audio');}
  catch {if(currentAudio!==audio)return;audio.pause();currentAudio=null;talking=false;updateBackgroundMusic();$('overlay-tools').classList.add('needs-audio');$('sound-toggle').textContent='♫ Bấm để bật tiếng';setTimeout(()=>{if(!talking)$('dialogue').hidden=true;},8500);}
}
function startAmbience() {
  if(preview||audioContext)return;
  try {audioContext=new(window.AudioContext||window.webkitAudioContext)();const buffer=audioContext.createBuffer(1,audioContext.sampleRate*3,audioContext.sampleRate);const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1);const noise=audioContext.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=420;windGain=audioContext.createGain();windGain.gain.value=state?.settings.ambientEnabled?state.settings.volume*.025:0;noise.connect(filter).connect(windGain).connect(audioContext.destination);noise.start();audioContext.resume();}catch(e){console.warn(e);}
}
$('sound-toggle').onclick=async()=> {
  if(preview)return;
  unlockAttempt=true;
  if(soundReady&&!localMuted){localMuted=true;clearTimeout(reactionSpeechTimer);finishSpeech(true);cancelEffectSounds();updateBackgroundMusic();if(windGain)windGain.gain.value=0;if(effectsGain)effectsGain.gain.value=0;$('sound-toggle').textContent='♫ Bật âm thanh';return;}
  localMuted=false;soundReady=true;updateBackgroundMusic();
  // Start music inside this user gesture, even when the voice is disabled.
  const musicUnlock=backgroundMusic.unlock();
  startAmbience();if(audioContext?.state==='suspended')await audioContext.resume();if(localMuted)return;
  if(windGain)windGain.gain.value=state?.settings.ambientEnabled&&!state.settings.paused?state.settings.volume*.025:0;
  if(effectsGain)effectsGain.gain.value=!state?.settings.paused?state?.settings.volume||0:0;
  const musicStarted=await musicUnlock;if(localMuted)return;
  const musicWanted=state?.settings.musicEnabled!==false&&(state?.settings.musicVolume??.28)>0&&state?.settings.volume>0&&!state?.settings.paused;
  if(musicWanted&&!musicStarted&&!state?.settings.voiceEnabled){soundReady=false;$('sound-toggle').textContent='♫ Thử lại âm thanh';$('overlay-tools').classList.add('needs-audio');return;}
  $('sound-toggle').textContent='♫ Âm thanh đang bật';$('overlay-tools').classList.remove('needs-audio');await say('greeting');
};
$('fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():$('stage').requestFullscreen();
const stream=new EventSource('/events');
stream.addEventListener('state',event=>{setState(JSON.parse(event.data));if(!preview&&!unlockAttempt&&clips.ambient){unlockAttempt=true;say('greeting');}});
stream.addEventListener('effect',event=> {
  const effect=JSON.parse(event.data);
  if(effect.action==='viewer'){scene?.trigger(effect);return;}
  if(state?.settings.paused)return;
  if(effect.action==='dog')effect.barkOnsets=[...DOG_BARK_ONSETS];
  if(effect.ruleId||effect.giftId||effect.action==='music'){unlockAttempt=true;clearTimeout(reactionSpeechTimer);finishSpeech(true);cancelEffectSounds();}
  scene?.trigger(effect);
  if(effect.levelUp&&effect.action!=='upgrade')scene?.trigger('upgrade');
  effectSound(effect.action);
  const voiceGroup=clips[effect.action]?.length?effect.action:effect.voice;
  if(voiceGroup){const delay={dog:6800,stone:5100,live:600,storm:900}[effect.action]||100;reactionSpeechTimer=setTimeout(()=>say(voiceGroup),delay);}
  for(const row of $('gift-rows').children)row.classList.toggle('active',row.dataset.ruleId===effect.ruleId);
  clearTimeout(activeGiftTimer);activeGiftTimer=setTimeout(()=>{for(const row of $('gift-rows').children)row.classList.remove('active');},6500);
  $('event-label').textContent=effect.demo?'THỬ HIỆU ỨNG · KHÔNG TÍNH ĐIỂM':effect.voice==='share'?'CẢM ƠN BẠN ĐÃ CHIA SẺ LIVE':'MỘT NGƯỜI BẠN GHÉ TIỆM';
  $('event-text').textContent=effect.text;$('event-alert').hidden=false;clearTimeout(alertTimer);alertTimer=setTimeout(()=>$('event-alert').hidden=true,6000);
});
stream.onerror=()=>{$('connection-dot').className='connection-dot';$('connection-dot').title='Mất kết nối bộ cảnh';};
let lastTime=performance.now();
function animate(now) {if(now-lastTime<1000/30){requestAnimationFrame(animate);return;}const dt=Math.min((now-lastTime)/1000,.08);lastTime=now;scene?.update(dt,{talking:talking&&!state?.settings.paused,level:state?.level||1,weather:state?.settings.weather||'sunny',night:state?.settings.night||false,paused:state?.settings.paused||false,residentsEnabled:state?.settings.residentsEnabled!==false,residentInterval:state?.settings.residentInterval||5});if(!preview&&state?.settings.autoSpeech&&!state.settings.paused&&Date.now()>nextSpeechAt&&!talking){nextSpeechAt=Date.now()+state.settings.speechInterval*1000;say('ambient');}requestAnimationFrame(animate);}
requestAnimationFrame(animate);
window.addEventListener('resize',()=>scene?.resize());
window.addEventListener('keydown',event=>{if(event.key==='f')$('fullscreen').click();if(event.key==='m')$('sound-toggle').click();});
window.addEventListener('beforeunload',()=>{clearTimeout(reactionSpeechTimer);stream.close();backgroundMusic.dispose();currentAudio?.pause();audioContext?.close();scene?.dispose?.();});
