export const DOG_BARK_ONSETS=Object.freeze([3.2,3.65,4.6,5.05]);
export const DOG_BARK_URL='/sfx/dog-bark.wav';

// Decode the downloaded recording once, then reuse it for each natural bark.
export function createDogBarkPlayer({fetchImpl=(...args)=>fetch(...args),url=DOG_BARK_URL}={}){
  let filePromise;
  const decoded=new WeakMap();
  function preload(){
    if(!filePromise)filePromise=(async()=>{
      const response=await fetchImpl(url,{signal:AbortSignal.timeout(5000)});
      if(!response.ok)throw Error('Không tải được bản ghi tiếng chó sủa.');
      const bytes=await response.arrayBuffer(),header=new Uint8Array(bytes);
      if(bytes.byteLength<44||bytes.byteLength>1000000||String.fromCharCode(...header.slice(0,4))!=='RIFF'||String.fromCharCode(...header.slice(8,12))!=='WAVE')throw Error('Bản ghi tiếng chó không phải WAV hợp lệ.');
      return bytes;
    })().catch(error=>{filePromise=null;throw error;});
    return filePromise;
  }
  async function bufferFor(context){
    if(!decoded.has(context))decoded.set(context,preload().then(bytes=>context.decodeAudioData(bytes.slice(0))).catch(error=>{decoded.delete(context);throw error;}));
    return decoded.get(context);
  }
  async function schedule({context,output,startTime=context.currentTime,isCurrent=()=>true,track=source=>source}){
    const buffer=await bufferFor(context);
    if(!isCurrent()||context.state==='closed')return[];
    const level=context.createGain();level.gain.value=.7;level.connect(output);
    const sources=[];
    for(const onset of DOG_BARK_ONSETS){
      const time=startTime+onset;
      if(context.currentTime>=time+buffer.duration)continue;
      const source=track(context.createBufferSource());source.buffer=buffer;source.connect(level);
      source.start(Math.max(context.currentTime+.005,time));sources.push(source);
    }
    return sources;
  }
  return{preload,schedule};
}
