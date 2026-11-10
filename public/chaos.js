// Reversible scene choreography. Actual shop props fly; the street stays still.
export function initChaos(THREE, {scene, staticRoot, animatedRoot, elder, objects = [], stormObjects = []}) {
  scene.updateMatrixWorld(true);
  const looseRoot = new THREE.Group(), heavyRoot = new THREE.Group();
  looseRoot.name='flying-merchandise';heavyRoot.name='flying-shop';scene.add(looseRoot,heavyRoot);
  const seen=new Set(), loose=[], heavy=[];
  function register(object,parent,list){
    if(!object||seen.has(object)||object===staticRoot||object===animatedRoot||object===elder)return;
    seen.add(object);parent.attach(object);
    list.push({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone(),phase:list.length*2.399963,seed:((list.length*37+13)%97)/97});
  }
  for(const object of objects.slice(0,80))register(object,looseRoot,loose);
  const uniqueHeavy=[...new Set(stormObjects)].filter(Boolean);
  for(const object of uniqueHeavy){
    if(uniqueHeavy.some(other=>other!==object&&isAncestor(other,object)))continue;
    register(object,heavyRoot,heavy);
  }
  const elderBase=elder?{position:elder.position.clone(),quaternion:elder.quaternion.clone(),scale:elder.scale.clone()}:null;
  const spiral=new THREE.Group();spiral.name='storm-vortex';spiral.visible=false;scene.add(spiral);
  const resources=[];
  for(let strand=0;strand<4;strand++){
    const points=[];
    for(let i=0;i<=170;i++){const p=i/170,angle=p*Math.PI*9+strand*Math.PI/2,radius=.35+p*3.1;points.push(new THREE.Vector3(Math.cos(angle)*radius,p*9,Math.sin(angle)*radius*.7));}
    const geometry=new THREE.BufferGeometry().setFromPoints(points),material=new THREE.LineBasicMaterial({color:strand%2?'#d8d4bc':'#aaa890',transparent:true,opacity:.42,depthWrite:false});
    spiral.add(new THREE.Line(geometry,material));resources.push(geometry,material);
  }
  spiral.position.set(-.65,.05,.1);
  let wind=null,storm=null,wasLoose=false,wasHeavy=false;
  const rotation=new THREE.Quaternion(),euler=new THREE.Euler();
  const clamp=value=>Math.min(1,Math.max(0,value));
  const smooth=value=>{const p=clamp(value);return p*p*(3-2*p);};
  function envelope(age,duration){return smooth(age/1.3)*smooth((duration-age)/3.5);}
  function restore(records){for(const r of records){r.object.position.copy(r.position);r.object.quaternion.copy(r.quaternion);r.object.scale.copy(r.scale);}}
  function trigger(action,time=0){
    if(action==='storm')storm={start:time,duration:22};
    else if(action==='wind'||action==='windstrong')wind={start:time,duration:action==='wind'?13:16,strength:action==='wind'?1:1.75};
  }
  function fly(record,age,strength,env,isStorm,isHeavy=false){
    const {object,position,quaternion,phase,seed}=record;
    if(isStorm){
      const radius=(isHeavy?1.6:1.0)+seed*(isHeavy?3.0:2.4),angle=age*(isHeavy?1.25:2.4)+phase;
      const lift=(isHeavy?2.7:2.0)+Math.min(age,13)*(isHeavy?.28:.39)+Math.sin(age*1.7+phase)*.5;
      object.position.set(position.x+(Math.cos(angle)*radius-position.x*.35)*env,position.y+lift*env,position.z+Math.sin(angle)*radius*.55*env);
      euler.set(Math.sin(age+phase)*.65*env,age*(.6+seed)*env,Math.sin(age*1.8+phase)*(isHeavy?.7:2.3)*env);
    }else{
      const gust=Math.sin(age*1.75+phase),lift=.8+Math.abs(Math.sin(age*1.4+phase))*(1.4+seed*1.8);
      object.position.set(position.x+gust*(2.1+seed*1.7)*strength*env,position.y+lift*strength*env,position.z+Math.cos(age*1.3+phase)*.9*strength*env);
      euler.set(age*(.9+seed)*env,age*(1.3+seed)*env,gust*2*env);
    }
    rotation.setFromEuler(euler);object.quaternion.copy(quaternion).multiply(rotation);
  }
  function update(time=0,dt=0){
    if(storm&&time-storm.start>=storm.duration)storm=null;
    if(wind&&time-wind.start>=wind.duration)wind=null;
    const active=storm||wind;
    if(active){const age=time-active.start,env=envelope(age,active.duration);for(const r of loose)fly(r,age,active.strength||2,env,Boolean(storm));wasLoose=true;}
    else if(wasLoose){restore(loose);wasLoose=false;}
    if(storm){
      const age=time-storm.start,env=envelope(age,storm.duration);
      for(const r of heavy)fly(r,age,2,env,true,true);
      if(elder&&elderBase){elder.position.set(elderBase.position.x+Math.sin(age*2.05)*3.3*env,elderBase.position.y+(2.4+Math.min(age,13)*.4)*env,elderBase.position.z+Math.cos(age*2.05)*1.65*env);euler.set(Math.sin(age*1.2)*.5*env,age*2.3*env,Math.sin(age*1.8)*1.2*env);rotation.setFromEuler(euler);elder.quaternion.copy(elderBase.quaternion).multiply(rotation);}
      spiral.visible=true;spiral.rotation.y=time*2;spiral.scale.setScalar(Math.max(.02,env));wasHeavy=true;
    }else if(wasHeavy){restore(heavy);if(elder&&elderBase){elder.position.copy(elderBase.position);elder.quaternion.copy(elderBase.quaternion);elder.scale.copy(elderBase.scale);}spiral.visible=false;wasHeavy=false;}
  }
  function isAncestor(parent,object){let node=object.parent;while(node){if(node===parent)return true;node=node.parent;}return false;}
  return {trigger,update,activeStorm:time=>Boolean(storm&&time<storm.start+storm.duration),dispose(){restore(loose);restore(heavy);if(elder&&elderBase){elder.position.copy(elderBase.position);elder.quaternion.copy(elderBase.quaternion);}for(const resource of resources)resource.dispose();spiral.removeFromParent();}};
}
