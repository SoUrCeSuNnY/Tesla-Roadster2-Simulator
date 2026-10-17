import {ACTIONS,formatKey} from './keybinds.js';

/** Native modal isolates keyboard capture from driving, including HUD shortcuts. */
export function createKeybindPanel(keybinds,{onActive=()=>{},onClose=()=>{}}={}){
  const dialog=document.createElement('dialog');dialog.id='sim-keybind-dialog';
  dialog.setAttribute('aria-labelledby','sim-keybind-title');
  dialog.innerHTML=`<div class="sim-bind-header"><div><span class="sim-eyebrow">PERSONAL FLIGHT DECK</span><h2 id="sim-keybind-title">KEYBINDS</h2></div><button type="button" id="sim-keybind-close" aria-label="Close keybinds">×</button></div>
  <p id="sim-bind-status" aria-live="polite">Select an action, then press a key. Escape cancels capture.</p>
  <div class="sim-bind-list">${ACTIONS.map(a=>`<div class="sim-bind-row"><span>${a.label}<small>${a.context}</small></span><button type="button" data-bind="${a.id}" aria-label="Rebind ${a.label}"></button></div>`).join('')}</div>
  <fieldset class="sim-inversions"><legend>FLIGHT AXES ONLY</legend>${['pitch','yaw','roll'].map(axis=>`<label><input type="checkbox" id="sim-invert-${axis}" data-invert="${axis}"> Invert ${axis[0].toUpperCase()+axis.slice(1)}</label>`).join('')}</fieldset>
  <p class="sim-bind-note">Shared keys are allowed. W/S defaults differ by mode. Modifier keys work on either side. Escape and Tab are reserved. Driving input is disabled while this panel is open.</p>
  <div class="sim-bind-footer"><button type="button" id="sim-keybind-defaults">Reset to Defaults</button><button type="button" id="sim-keybind-done">Done</button></div>`;
  document.body.appendChild(dialog);
  let capturing=null;
  const status=dialog.querySelector('#sim-bind-status');
  function refresh(){
    const bindings=keybinds.bindings;
    for(const checkbox of dialog.querySelectorAll('[data-invert]'))checkbox.checked=keybinds.inversions[checkbox.dataset.invert];
    for(const button of dialog.querySelectorAll('[data-bind]')){
      const active=button.dataset.bind===capturing;
      button.textContent=active?'Press any key…':formatKey(bindings[button.dataset.bind]);
      button.classList.toggle('sim-bind-capturing',active);button.setAttribute('aria-pressed',String(active));
    }
    for(const node of document.querySelectorAll('[data-key-action]'))node.textContent=formatKey(bindings[node.dataset.keyAction]);
  }
  function cancelCapture(){capturing=null;status.textContent='Select an action, then press a key. Escape cancels capture.';refresh();}
  function close(){cancelCapture();dialog.close();}
  dialog.addEventListener('close',()=>{onActive(false);onClose();});
  dialog.addEventListener('cancel',event=>{if(capturing){event.preventDefault();cancelCapture();}});
  dialog.querySelector('#sim-keybind-close').addEventListener('click',close);
  dialog.querySelector('#sim-keybind-done').addEventListener('click',close);
  dialog.querySelector('#sim-keybind-defaults').addEventListener('click',()=>{keybinds.reset();cancelCapture();status.textContent='Default bindings restored.';});
  for(const checkbox of dialog.querySelectorAll('[data-invert]'))checkbox.addEventListener('change',()=>keybinds.setInversion(checkbox.dataset.invert,checkbox.checked));
  for(const button of dialog.querySelectorAll('[data-bind]'))button.addEventListener('click',()=>{capturing=button.dataset.bind;status.textContent=`${ACTIONS.find(a=>a.id===capturing).label}: Press any key… (Escape to cancel)`;refresh();});
  // Capture before the simulator and before native button activation. Releasing
  // the newly bound key cannot start driving: the modal stays open until Done.
  const capture=event=>{
    if(!dialog.open)return;
    if(!capturing)return;
    if(event.code==='Tab')return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.code==='Escape'){cancelCapture();return;}
    if(event.repeat)return;
    const action=capturing;
    if(keybinds.set(action,event.code)){
      capturing=null;status.textContent=`${ACTIONS.find(a=>a.id===action).label} → ${formatKey(keybinds.bindings[action])}. Saved automatically.`;refresh();
    }else status.textContent='Unsupported key. Please press another key, or Escape to cancel.';
  };
  window.addEventListener('keydown',capture,true);
  const unsubscribe=keybinds.subscribe(refresh);refresh();
  const open=()=>{if(dialog.open)return;cancelCapture();onActive(true);dialog.showModal();};
  return {open,close,get active(){return dialog.open;},refresh,dispose(){unsubscribe();window.removeEventListener('keydown',capture,true);dialog.remove();}};
}
