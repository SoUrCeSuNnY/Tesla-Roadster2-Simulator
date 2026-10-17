/** A physical-key release interlock, independent of axis inversion and rebinding.
 * Observe after each physics step, so the first FLIGHT controller tick is safe.
 */
export class TakeoffPitchLock {
  constructor(){this.reset();}
  reset(){this.previousMode='GROUND';this.blocked=new Set();}
  get locked(){return this.blocked.size>0;}
  update(mode,keys,keybinds){
    if(mode==='FLIGHT'&&this.previousMode==='GROUND'){
      for(const code of keys)if(keybinds.matches('pitchDown',code)||keybinds.matches('forward',code))this.blocked.add(code);
    }
    for(const code of this.blocked)if(!keys.has(code))this.blocked.delete(code);
    if(mode!=='FLIGHT')this.blocked.clear();
    this.previousMode=mode;
    return this.locked;
  }
  filter(input,mode){return this.locked&&mode==='FLIGHT'?{...input,forward:false,back:false}:input;}
}
