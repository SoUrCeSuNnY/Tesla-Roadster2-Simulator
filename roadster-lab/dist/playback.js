import {Quaternion} from './vendor/three.module.js';

const lerp=(a,b,t)=>a+(b-a)*t;
function capture(body,t){
  return {t,pos:body.p.toArray(),rot:body.q.toArray(),velocity:body.v.toArray(),omega:body.omega.toArray(),
    steer:body.steer,throttles:Array.from(body.throttles),mode:body.mode,
    wheels:body.wheels.map(w=>({steer:w.steer,spin:w.spin,length:w.length,contact:w.contact,force:w.force,compression:w.compression})),
    gas:body.gas,pressure:body.pressure,g:body.g,altitude:body.altitude,slip:body.slip,thrust:body.thrust,crashed:body.crashed};
}
function apply(body,frame){
  body.p.fromArray(frame.pos);body.q.fromArray(frame.rot);body.v.fromArray(frame.velocity);body.omega.fromArray(frame.omega);
  body.throttles.set(frame.throttles);
  for(const key of ['steer','mode','gas','pressure','g','altitude','slip','thrust','crashed'])body[key]=frame[key];
  body.wheels.forEach((w,i)=>Object.assign(w,frame.wheels[i]));
}
/** Bounded 30 Hz flight recorder. Timeline uses simulation time; replay uses wall time.
 * A new recording replaces the old take; reset stops recording and enables playback.
 * During playback caller must skip physics, and advance() applies visual telemetry.
 */
export class Playback {
  constructor({sampleRate=30,maxSeconds=120}={}){
    if(!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(maxSeconds)||maxSeconds<=0)throw new RangeError('Invalid recorder limits');
    this.interval=1/sampleRate;this.maxSeconds=maxSeconds;this.maxFrames=Math.floor(sampleRate*maxSeconds)+1;
    this.frames=[];this.recording=false;this.playing=false;this.ready=false;this.elapsed=0;this.cursor=0;
  }
  get duration(){return this.frames.at(-1)?.t||0;}
  get progress(){return this.duration?Math.min(1,this.cursor/this.duration):0;}
  startRecording(body){
    if(this.playing)return false;
    this.frames=[capture(body,0)];this.elapsed=0;this.nextSample=this.interval;this.recording=true;this.ready=false;return true;
  }
  stopRecording(body){
    if(!this.recording)return;
    if(body&&this.elapsed>this.duration+1e-8&&this.frames.length<this.maxFrames)this.frames.push(capture(body,Math.min(this.elapsed,this.maxSeconds)));
    this.recording=false;
  }
  record(dt,body){
    if(!this.recording||!Number.isFinite(dt)||dt<=0)return;
    this.elapsed=Math.min(this.maxSeconds,this.elapsed+dt);
    if(this.elapsed+1e-8>=this.nextSample&&this.frames.length<this.maxFrames){
      this.frames.push(capture(body,this.elapsed));this.nextSample=this.elapsed+this.interval;
    }
    if(this.elapsed>=this.maxSeconds||this.frames.length>=this.maxFrames)this.stopRecording(body);
  }
  onReset(body){this.stopRecording(body);this.ready=this.frames.length>1&&this.duration>0;}
  start(body){
    if(this.playing||!this.ready||this.frames.length<2)return false;
    this.saved=capture(body,0);this.playing=true;this.cursor=0;this.index=0;apply(body,this.frames[0]);return true;
  }
  sample(t){
    if(!this.frames.length)return null;
    const time=Math.max(0,Math.min(this.duration,Number.isFinite(t)?t:0));
    let low=0,high=this.frames.length-1;
    while(low+1<high){const mid=(low+high)>>1;if(this.frames[mid].t<=time)low=mid;else high=mid;}
    const a=this.frames[low],b=this.frames[high],alpha=b.t>a.t?(time-a.t)/(b.t-a.t):0;
    const result={...a,t:time};
    for(const key of ['pos','velocity','omega','throttles'])result[key]=a[key].map((value,i)=>lerp(value,b[key][i],alpha));
    result.rot=new Quaternion().fromArray(a.rot).slerp(new Quaternion().fromArray(b.rot),alpha).normalize().toArray();
    for(const key of ['steer','gas','pressure','g','altitude','slip','thrust'])result[key]=lerp(a[key],b[key],alpha);
    result.wheels=a.wheels.map((w,i)=>({...w,steer:lerp(w.steer,b.wheels[i].steer,alpha),spin:lerp(w.spin,b.wheels[i].spin,alpha),length:lerp(w.length,b.wheels[i].length,alpha)}));
    if(alpha===1){result.mode=b.mode;result.crashed=b.crashed;}
    return result;
  }
  advance(dt,body){
    if(!this.playing)return false;
    if(Number.isFinite(dt)&&dt>0)this.cursor=Math.min(this.duration,this.cursor+dt);
    apply(body,this.sample(this.cursor));return this.cursor>=this.duration;
  }
  exit(body){if(!this.playing)return false;apply(body,this.saved);this.saved=null;this.playing=false;return true;}
}
