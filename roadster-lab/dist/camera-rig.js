import * as THREE from './vendor/three.module.js';

export const CAMERA_VIEWS=Object.freeze(['3/4 CHASE','DIRECT CHASE','TOP-DOWN','ORBIT']);
const clamp=THREE.MathUtils.clamp;
/** Lightweight follow-orbit, no controls dependency. DOM binding is optional. */
// Render-only interpolation; never writes back into the physics body.
export class RenderPose {
  constructor(body){this.previousP=new THREE.Vector3();this.previousQ=new THREE.Quaternion();this.p=new THREE.Vector3();this.q=new THREE.Quaternion();this.reset(body);}
  reset(body){this.capture(body);this.p.copy(body.p);this.q.copy(body.q);}
  capture(body){this.previousP.copy(body.p);this.previousQ.copy(body.q);}
  sample(body,alpha){const t=clamp(alpha,0,1);this.p.lerpVectors(this.previousP,body.p,t);this.q.copy(this.previousQ).slerp(body.q,t);return this;}
}

export class CameraRig {
  constructor(camera,element=null){
    this.camera=camera;this.mode=0;this.theta=0;this.phi=1.1;this.radius=12;
    this.lastBodyP=new THREE.Vector3();this.bodyReady=false;
    this.heading=0;this.headingReady=false;this.followOffset=new THREE.Vector3();this.followReady=false;
    this.target=new THREE.Vector3();this.desired=new THREE.Vector3();this.pointers=new Map();this.listeners=[];
    if(element)this.bind(element);
  }
  get name(){return CAMERA_VIEWS[this.mode];}
  cycle(){this.setMode((this.mode+1)%4);return this.mode;}
  setMode(mode){
    if(!Number.isInteger(mode)||mode<0||mode>3)return false;
    if(mode===3&&this.mode!==3){
      const offset=this.camera.position.clone().sub(this.target);
      if(offset.lengthSq()>.001){this.radius=clamp(offset.length(),3,35);this.phi=clamp(Math.acos(clamp(offset.y/offset.length(),-1,1)),.1,Math.PI/2-.04);this.theta=Math.atan2(offset.z,offset.x);}
    }
    this.transitioning=mode!==this.mode;this.transitionElapsed=0;this.mode=mode;this.pointers.clear();return true;
  }
  rebase(body){this.lastBodyP.copy(body.p);this.bodyReady=true;this.transitioning=true;this.transitionElapsed=0;}
  rotate(dx,dy){if(this.mode!==3)return;this.theta-=dx*.006;this.phi=clamp(this.phi+dy*.006,.1,Math.PI/2-.04);}
  zoom(factor){if(this.mode===3&&Number.isFinite(factor)&&factor>0)this.radius=clamp(this.radius*factor,3,35);}
  update(dt,body,snap=false){
    // During a view transition carry the camera with vehicle translation first,
    // so moving targets converge instead of sustaining a world-space lag.
    if(this.transitioning&&!snap&&this.bodyReady)this.camera.position.add(body.p.clone().sub(this.lastBodyP));
    this.lastBodyP.copy(body.p);this.bodyReady=true;
    const front=new THREE.Vector3(1,0,0).applyQuaternion(body.q);front.y=0;
    const blend=snap?1:1-Math.exp(-Math.max(0,dt)*5);
    if(this.transitioning&&!snap)this.transitionElapsed=(this.transitionElapsed||0)+Math.max(0,dt);
    // Retain heading near vertical: resetting to +X there causes 180° jumps.
    if(front.lengthSq()>=.02){
      const heading=Math.atan2(front.z,front.x);
      if(snap||!this.headingReady)this.heading=heading;
      else this.heading+=Math.atan2(Math.sin(heading-this.heading),Math.cos(heading-this.heading))*blend;
      this.headingReady=true;
    }
    front.set(Math.cos(this.heading),0,Math.sin(this.heading));
    const side=new THREE.Vector3().crossVectors(front,new THREE.Vector3(0,1,0));
    this.target.copy(body.p).add(new THREE.Vector3(0,.7,0));
    if(this.mode===3){
      this.desired.set(Math.sin(this.phi)*Math.cos(this.theta),Math.cos(this.phi),Math.sin(this.phi)*Math.sin(this.theta)).multiplyScalar(this.radius).add(this.target);
      // Position and look target follow together: orbit never trails the car.
      if(this.transitioning&&!snap)this.camera.position.lerp(this.desired,blend);
      else this.camera.position.copy(this.desired);
    }else{
      this.target.addScaledVector(front,2.3);
      if(this.mode===0)this.desired.copy(body.p).addScaledVector(front,-10.5).addScaledVector(side,5.4).add(new THREE.Vector3(0,4.5,0));
      else if(this.mode===1)this.desired.copy(body.p).addScaledVector(front,-13).add(new THREE.Vector3(0,6,0));
      else this.desired.copy(body.p).add(new THREE.Vector3(-.01,32,.01));
      this.desired.y=Math.max(1.3,this.desired.y);
      if(this.transitioning&&!snap)this.camera.position.lerp(this.desired,blend);
      else {
        // Damp the relative boom, not world translation against an instant
        // look target. Both ends now share the same interpolated vehicle pose.
        const offset=this.desired.clone().sub(body.p);
        if(snap||!this.followReady)this.followOffset.copy(offset);
        else this.followOffset.lerp(offset,blend);
        this.followReady=true;this.camera.position.copy(body.p).add(this.followOffset);
      }
    }
    this.camera.up.set(0,1,0);
    const previous=this.camera.quaternion.clone();
    this.camera.lookAt(this.target);
    if(this.transitioning&&!snap){
      const goal=this.camera.quaternion.clone();
      this.camera.quaternion.copy(previous).slerp(goal,blend);
      if(this.transitionElapsed>=1.5||(this.camera.position.distanceTo(this.desired)<.01&&this.camera.quaternion.angleTo(goal)<.001)){this.transitioning=false;this.followOffset.copy(this.camera.position).sub(body.p);this.followReady=true;}
    }else this.transitioning=false;
  }
  bind(element){
    const on=(event,handler,options)=>{element.addEventListener(event,handler,options);this.listeners.push(()=>element.removeEventListener(event,handler,options));};
    on('pointerdown',event=>{
      if(this.mode!==3||(event.pointerType==='mouse'&&event.button!==0))return;
      this.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});element.setPointerCapture?.(event.pointerId);event.preventDefault();
    });
    on('pointermove',event=>{
      if(this.mode!==3||!this.pointers.has(event.pointerId))return;
      const old=this.pointers.get(event.pointerId),next={x:event.clientX,y:event.clientY};
      const other=[...this.pointers.entries()].find(([id])=>id!==event.pointerId)?.[1];
      if(other){
        const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);
        if(after>1&&before>1)this.zoom(before/after);
      }else this.rotate(next.x-old.x,next.y-old.y);
      this.pointers.set(event.pointerId,next);event.preventDefault();
    });
    const release=event=>{this.pointers.delete(event.pointerId);};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])on(event,release);
    on('wheel',event=>{if(this.mode!==3)return;event.preventDefault();this.zoom(Math.exp(clamp(event.deltaY,-500,500)*.0015));},{passive:false});
  }
  dispose(){this.listeners.forEach(remove=>remove());this.listeners=[];this.pointers.clear();}
}
