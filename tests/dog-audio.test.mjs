import test from 'node:test';
import assert from 'node:assert/strict';
import {createDogBarkPlayer,DOG_BARK_ONSETS} from '../public/dog-audio.js';

function wavHeader(){const bytes=new Uint8Array(48);bytes.set([...Buffer.from('RIFF')],0);bytes.set([...Buffer.from('WAVE')],8);return bytes.buffer;}
function fakeContext(decode){const sources=[];return{currentTime:20,state:'running',sources,decodeAudioData:decode,createGain(){return{gain:{value:0},connect(){}};},createBufferSource(){const node={connect(){},start(time){this.startedAt=time;}};sources.push(node);return node;}};}
test('natural bark playback reuses the downloaded recording for two timed pairs before the leg lift',async()=>{
  let fetches=0,decodes=0;const recording={duration:.326803};
  const player=createDogBarkPlayer({fetchImpl:async()=>{fetches++;return{ok:true,arrayBuffer:async()=>wavHeader()};}});
  const context=fakeContext(async()=>{decodes++;return recording;});
  await player.preload();await player.schedule({context,output:{},startTime:20});
  assert.equal(fetches,1);assert.equal(decodes,1);assert.equal(context.sources.length,4);
  assert.deepEqual(context.sources.map(x=>x.startedAt),DOG_BARK_ONSETS.map(x=>20+x));
  assert.ok(context.sources.every(source=>source.buffer===recording));
  assert.ok(DOG_BARK_ONSETS.at(-1)+recording.duration<5.9);
  await player.schedule({context,output:{},startTime:25});assert.equal(fetches,1);assert.equal(decodes,1);
});
test('a cancelled or replaced reaction never plays a recording that finishes loading late',async()=>{
  let resolveDecode;const ready=new Promise(resolve=>{resolveDecode=resolve;});let current=true;
  const player=createDogBarkPlayer({fetchImpl:async()=>({ok:true,arrayBuffer:async()=>wavHeader()})});
  const context=fakeContext(()=>ready),pending=player.schedule({context,output:{},isCurrent:()=>current});
  current=false;resolveDecode({duration:.326803});assert.deepEqual(await pending,[]);assert.equal(context.sources.length,0);
});
