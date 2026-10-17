import * as THREE from './vendor/three.module.js';
import {MAX_PRESSURE} from './controller.js';

const clamp=THREE.MathUtils.clamp;
const PARTICLES=192, MARKS=256;

/** Owns only exhaust, smoke and skid marks; vehicle/wheel poses belong to the caller. */
export class VehicleEffects {
  constructor(scene,model){
    this.model=model;
    this.root=new THREE.Group();this.root.name='Vehicle_effects';scene.add(this.root);
    this._point=new THREE.Vector3();this._direction=new THREE.Vector3();
    this._up=new THREE.Vector3();this._forward=new THREE.Vector3();
    this._rotation=new THREE.Quaternion();this._lastVelocity=new THREE.Vector3();
    this._hasVelocity=false;this._acceleration=0;
    this._particleCursor=0;this._markCursor=0;this._tracks=[];
    this._jets=model.plumes.map(jet=>{
      const meshes=[],arrows=[];
      jet.traverse(o=>{if(o instanceof THREE.ArrowHelper)arrows.push(o);});
      // Detach helpers so making the plume visible can never reveal thrust arrows.
      for(const arrow of arrows){arrow.visible=false;arrow.removeFromParent();}
      jet.traverse(o=>{
        if(!o.isMesh)return;
        const materials=Array.isArray(o.material)?o.material:[o.material];
        for(const material of materials){
          material.color.set(0xffffff);material.transparent=true;
          material.opacity=.24;material.depthWrite=false;
        }
        o.castShadow=false;o.receiveShadow=false;meshes.push(o);
      });
      return {jet,meshes,emission:0,scale:jet.scale.clone()};
    });
    const vaporGeometry=new THREE.SphereGeometry(1,7,5);
    this._particles=Array.from({length:PARTICLES},()=>{
      const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false});
      const mesh=new THREE.Mesh(vaporGeometry,material);mesh.visible=false;this.root.add(mesh);
      return {mesh,velocity:new THREE.Vector3(),age:0,life:0,size:0,growth:0,opacity:0};
    });
    const markGeometry=new THREE.PlaneGeometry(1,1);
    this._marks=Array.from({length:MARKS},()=>{
      const material=new THREE.MeshBasicMaterial({color:0x202329,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
      const mesh=new THREE.Mesh(markGeometry,material);mesh.visible=false;this.root.add(mesh);
      return {mesh,age:0,life:24,opacity:0};
    });
    this.reset();
  }

  _emit(position,direction,velocity,power,smoke=false){
    const p=this._particles[this._particleCursor];
    this._particleCursor=(this._particleCursor+1)%PARTICLES;
    p.age=0;p.life=smoke?1.1+Math.random()*.7:.45+Math.random()*.55;
    p.size=smoke?.10+Math.random()*.09:.055+Math.random()*.055;
    p.growth=smoke?.5:.65+power*.45;p.opacity=smoke?.24:.17+power*.14;
    p.mesh.position.copy(position);
    p.velocity.copy(velocity).multiplyScalar(smoke?.12:.7);
    p.velocity.addScaledVector(direction,smoke?.5:3+power*10);
    p.velocity.x+=(Math.random()-.5)*(smoke?.8:1.8);
    p.velocity.z+=(Math.random()-.5)*(smoke?.8:1.8);
    p.velocity.y+=(smoke?.5:.1)+Math.random()*.6;
    p.mesh.scale.setScalar(p.size);p.mesh.material.opacity=p.opacity;p.mesh.visible=true;
  }

  _mark(a,b,power){
    const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const mark=this._marks[this._markCursor];this._markCursor=(this._markCursor+1)%MARKS;
    mark.age=0;mark.opacity=.16+power*.36;
    mark.mesh.position.set((a.x+b.x)*.5,.02,(a.z+b.z)*.5);
    mark.mesh.rotation.set(-Math.PI/2,0,Math.atan2(-dx,-dz));
    mark.mesh.scale.set(.23,length,1);mark.mesh.material.opacity=mark.opacity;mark.mesh.visible=true;
  }

  update(dt,body){
    if(!Number.isFinite(dt)||dt<=0)return;
    // Bound emission work after suspended tabs; never allocate meshes during updates.
    dt=Math.min(dt,.1);
    for(const p of this._particles){
      if(!p.mesh.visible)continue;
      p.age+=dt;
      if(p.age>=p.life){p.mesh.visible=false;continue;}
      p.mesh.position.addScaledVector(p.velocity,dt);
      p.velocity.multiplyScalar(Math.exp(-dt*1.6));p.velocity.y+=dt*.35;
      const size=p.size+p.age*p.growth;
      p.mesh.scale.setScalar(size);
      p.mesh.material.opacity=p.opacity*Math.pow(1-p.age/p.life,2);
      // Downward lift exhaust spreads along the ground rather than disappearing below it.
      if(p.mesh.position.y<size*.25){p.mesh.position.y=size*.25;p.velocity.y=Math.max(0,p.velocity.y);}
    }
    for(const mark of this._marks){
      if(!mark.mesh.visible)continue;
      mark.age+=dt;
      if(mark.age>=mark.life){mark.mesh.visible=false;continue;}
      mark.mesh.material.opacity=mark.opacity*Math.min(1,(mark.life-mark.age)/6);
    }

    // Nozzle transforms already include the externally positioned car root. Do not
    // add body.p here: unlike wheel anchors, these are model-space, not COM-space.
    this.model.car.updateWorldMatrix(true,true);
    const pressure=clamp(Number.isFinite(body.pressure)?body.pressure/MAX_PRESSURE:0,0,1);
    this._jets.forEach((entry,i)=>{
      const throttle=Number.isFinite(body.throttles[i])?body.throttles[i]:0;
      const power=clamp(throttle,0,1)*pressure,{jet}=entry;
      jet.visible=power>0;
      jet.scale.copy(entry.scale);jet.scale.y*=power*3;
      jet.scale.x*=.7+.3*power;jet.scale.z*=.7+.3*power;
      for(const mesh of entry.meshes){
        const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
        for(const material of materials)material.opacity=.12+power*.2;
      }
      if(!jet.visible){entry.emission=0;return;}
      jet.getWorldPosition(this._point);jet.getWorldQuaternion(this._rotation);
      this._direction.set(0,1,0).applyQuaternion(this._rotation);
      this._point.addScaledVector(this._direction,.1);
      entry.emission+=dt*32*power;
      while(entry.emission>=1){
        this._emit(this._point,this._direction,body.v,power);entry.emission--;
      }
    });

    this._up.set(0,1,0).applyQuaternion(body.q);
    this._forward.set(1,0,0).applyQuaternion(body.q);this._forward.y=0;this._forward.normalize();
    const acceleration=this._hasVelocity?this._direction.copy(body.v).sub(this._lastVelocity).dot(this._forward)/dt:0;
    this._acceleration+=(acceleration-this._acceleration)*(1-Math.exp(-dt*10));
    this._lastVelocity.copy(body.v);this._hasVelocity=true;
    const speed=Math.hypot(body.v.x,body.v.z);
    for(let i=0;i<body.wheels.length;i++){
      const wheel=body.wheels[i];
      const track=this._tracks[i]||(this._tracks[i]={point:new THREE.Vector3(),active:false,emission:0});
      const slip=clamp(Number.isFinite(wheel.slip)?wheel.slip:(body.slip||0),0,1);
      // Physics supplies aggregate slip, not pedal state. Also recognize hard
      // longitudinal acceleration/braking from velocity, never from requested thrust.
      const hard=(wheel.x<0||this._acceleration<0)&&speed>.6?clamp((Math.abs(this._acceleration)-5)/10,0,1)*.65:0;
      const power=Math.max(clamp((slip-.12)/.88,0,1),hard);
      if(!wheel.contact||!(wheel.force>0)||this._up.y<=.15||power<=0){
        track.active=false;track.emission=0;continue;
      }
      // anchor is relative to COM (.65 m above the model origin). Project down
      // the suspension axis exactly as the ground-contact solver does.
      this._point.copy(wheel.anchor).applyQuaternion(body.q).add(body.p);
      this._point.addScaledVector(this._up,-this._point.y/this._up.y);this._point.y=.07;
      track.emission+=dt*power*24;
      this._direction.set(0,1,0);
      while(track.emission>=1){
        this._emit(this._point,this._direction,body.v,power,true);track.emission--;
      }
      if(wheel.x>=0){track.active=false;continue;}
      if(track.active){
        const distance=track.point.distanceTo(this._point);
        if(distance>=.08){
          // Do not connect separate contacts or teleport/reset positions.
          if(distance<2.5)this._mark(track.point,this._point,power);
          track.point.copy(this._point);
        }
      }else track.point.copy(this._point);
      track.active=true;
    }
  }

  reset(){
    for(const p of this._particles){p.mesh.visible=false;p.mesh.material.opacity=0;p.age=0;p.life=0;}
    for(const mark of this._marks){mark.mesh.visible=false;mark.mesh.material.opacity=0;mark.age=0;}
    for(const entry of this._jets){entry.jet.visible=false;entry.jet.scale.copy(entry.scale);entry.emission=0;}
    for(const track of this._tracks){track.active=false;track.emission=0;}
    this._particleCursor=0;this._markCursor=0;this._hasVelocity=false;this._acceleration=0;
    this._lastVelocity.set(0,0,0);
  }
}
