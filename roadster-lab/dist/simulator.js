import * as THREE from './vendor/three.module.js';
import {createRoadster} from './model.js';
import {VehiclePhysics,STEP} from './physics.js';
import {FlightController} from './controller.js';
import {createWorld} from './world.js';
import {NPCManager} from './npc.js';
import {createUI} from './ui.js';
import {AudioSystem} from './audio.js';
import {VehicleEffects} from './effects.js';
import {Keybinds,ACTIONS,formatKey} from './keybinds.js';
import {createKeybindPanel} from './keybind-panel.js';
import {TakeoffPitchLock} from './takeoff-lock.js';

const host=document.querySelector('#viewport');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,1800);
let renderer;
try{
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
}catch(error){
  host.innerHTML='<div style="padding:15vh 12vw;color:#edf5fc;font:20px system-ui"><h1>WebGL2 unavailable</h1><p>Please enable hardware acceleration or open this simulator in a current browser.</p><a href="viewer.html">Open the asset viewer →</a></div>';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
host.appendChild(renderer.domElement);
const world=createWorld(scene),npcs=new NPCManager(scene),body=new VehiclePhysics(),controller=new FlightController();
const model=createRoadster();scene.add(model.car);
const effects=new VehicleEffects(scene,model),audio=new AudioSystem();
let settings={assisted:true,rate:180,invincible:false,infinite:false},time=0,cameraMode=0;
const keys=new Set(),physicalKeys=new Set(),pitchLock=new TakeoffPitchLock();
// Physical release state survives focus/modal clearing of active driving keys.
window.addEventListener('keydown',event=>{if(!event.repeat)physicalKeys.add(event.code);},true);
let accumulator=0,last=performance.now(),frame=0;
const cameraTarget=new THREE.Vector3(),cameraDesired=new THREE.Vector3();
function reset(){body.reset();controller.reset();pitchLock.reset();effects.reset();keys.clear();accumulator=0;ui.dismissLanding();syncModel();updateCamera(1,true);host.focus({preventScroll:true});}
const ui=createUI({onReset:reset,onRefill:()=>body.refill(),onSettings:value=>{settings=value;if(settings.infinite)body.refill();controller.reset();}});
const keybinds=new Keybinds();
let bindingsActive=false;
const keybindPanel=createKeybindPanel(keybinds,{onActive:value=>{bindingsActive=value;keys.clear();controller.reset();},onClose:()=>{keys.clear();host.focus({preventScroll:true});}});
document.querySelector('#sim-keybinds').addEventListener('click',()=>keybindPanel.open());
keybinds.subscribe(()=>keys.clear());
const input=()=>{
  const activeKeys=bindingsActive?new Set():keys;
  pitchLock.update(body.mode,physicalKeys,keybinds);
  return pitchLock.filter(keybinds.input(activeKeys,body.mode),body.mode);
};
const telemetry=()=>({...body.snapshot(),assistActive:controller.assistActive,controlMode:controller.mode,
  pitchLocked:pitchLock.locked,pitchLockKeys:[...pitchLock.blocked].map(formatKey).join(' / '),time});
const isControl=code=>ACTIONS.some(action=>keybinds.matches(action.id,code));
const drivingTarget=target=>!target?.closest?.('#sim-hud, input, select, textarea, button, summary, a, [contenteditable]:not([contenteditable="false"])');
window.addEventListener('keydown',event=>{
  if(bindingsActive||!drivingTarget(event.target))return;
  if(isControl(event.code)){
    event.preventDefault();
    // Focus/modal suppression requires a fresh press, not an OS auto-repeat.
    if(!event.repeat||keys.has(event.code))keys.add(event.code);
    audio.unlock();
  }
  if(!event.repeat&&keybinds.matches('reset',event.code))reset();
  if(!event.repeat&&keybinds.matches('camera',event.code)){cameraMode=(cameraMode+1)%3;updateCamera(1,true);}
});
// Capture releases before a cockpit widget can stop bubbling.
window.addEventListener('keyup',event=>{keys.delete(event.code);physicalKeys.delete(event.code);pitchLock.update(body.mode,physicalKeys,keybinds);ui.update(telemetry());if(isControl(event.code)&&!bindingsActive&&drivingTarget(event.target))event.preventDefault();},true);
window.addEventListener('focusin',event=>{if(event.target.closest?.('#sim-hud'))keys.clear();});
window.addEventListener('keydown',event=>{if(event.code==='Escape'&&!bindingsActive){keys.clear();host.focus({preventScroll:true});event.preventDefault();}},true);
host.addEventListener('pointerdown',()=>host.focus({preventScroll:true}));
window.addEventListener('pointerdown',()=>audio.unlock());
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{keys.clear();accumulator=0;last=performance.now();});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
function syncModel(){
  model.car.quaternion.copy(body.q);
  model.car.position.copy(body.p).sub(body.comLocal.clone().applyQuaternion(body.q));
  model.layers.wheels.children.forEach((wheel,i)=>{
    const w=body.wheels[i];wheel.position.y=.80-w.length;
    // model wheel's local axle is Z. Steering rotates +Y, spin +Z.
    wheel.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),w.steer);
    wheel.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-w.spin));
  });
  model.materials.body.color.setHex(body.crashed?0xa9635d:0xe4e9e9);
}
function updateCamera(dt,snap=false){
  // Chase follows horizontal heading, never a tumbling body-up vector.
  const front=new THREE.Vector3(1,0,0).applyQuaternion(body.q);front.y=0;
  if(front.lengthSq()<.02)front.set(1,0,0);front.normalize();
  const side=new THREE.Vector3().crossVectors(front,new THREE.Vector3(0,1,0));
  cameraTarget.copy(body.p).add(new THREE.Vector3(0,.7,0)).addScaledVector(front,2.3);
  if(cameraMode===0)cameraDesired.copy(body.p).addScaledVector(front,-10.5).addScaledVector(side,5.4).add(new THREE.Vector3(0,4.5,0));
  else if(cameraMode===1)cameraDesired.copy(body.p).addScaledVector(front,-13).add(new THREE.Vector3(0,6,0));
  else cameraDesired.copy(body.p).add(new THREE.Vector3(-.01,32,.01));
  cameraDesired.y=Math.max(1.3,cameraDesired.y);
  camera.position.lerp(cameraDesired,snap?1:1-Math.exp(-dt*5));camera.up.set(0,1,0);camera.lookAt(cameraTarget);
}
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  if(document.hidden)return;
  accumulator+=dt;
  while(accumulator>=STEP){
    const controls=input(),throttles=controller.update(STEP,body,controls,settings);
    body.step(STEP,controls,throttles,settings);
    pitchLock.update(body.mode,physicalKeys,keybinds);time+=STEP;
    npcs.update(STEP,time,body);accumulator-=STEP;
    while(body.events.length){const event=body.events.shift();ui.landing(event);audio.impact(Math.min(1,event.g/8));}
  }
  syncModel();world.update(time);effects.update(dt,body);updateCamera(dt);
  audio.update({speed:body.v.length(),thrust:body.thrust,slip:body.slip});
  if(frame++%2===0)ui.update(telemetry());
  renderer.render(scene,camera);
}
syncModel();updateCamera(1,true);ui.update({...body.snapshot(),time});
// A small explicit diagnostic surface enables repeatable integration testing.
window.rocketLab={body,controller,scene,model,npcs,world,audio,ui,reset,input,keys,physicalKeys,keybinds,keybindPanel,pitchLock,get settings(){return {...settings};},get time(){return time;},get frame(){return frame;}};
requestAnimationFrame(animate);
