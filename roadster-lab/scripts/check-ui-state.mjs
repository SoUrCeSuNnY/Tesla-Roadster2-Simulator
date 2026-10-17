// DOM state smoke test, not a browser/WebGL render test.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const all=[];
class Element{
 constructor(){this.dataset={};this.style={};this.attributes={};this.children=[];this.hidden=false;this.className='';this.innerHTML='';this.textContent='';all.push(this);this.classList={toggle:(name,on)=>{const s=new Set(this.className.split(' ').filter(Boolean));on?s.add(name):s.delete(name);this.className=[...s].join(' ');}};}
 setAttribute(k,v){this.attributes[k]=v;}appendChild(e){this.children.push(e);return e;}addEventListener(k,v){this['on'+k]=v;}getContext(){return null;}click(){this.clicked=true;}cloneNode(){const e=new Element();e.dataset={...this.dataset};e.className=this.className;e.textContent=this.textContent;return e;}
}
const ids={};const html=await fs.readFile('dist/viewer.html','utf8');for(const m of html.matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element();
for(const mode of ['exterior','xray','exploded']){const b=new Element();b.dataset.mode=mode;}
for(const view of ['front','rear','top','bottom']){const b=new Element();b.dataset.camera=view;}
globalThis.document={querySelector:s=>ids[s.slice(1)],querySelectorAll:s=>{const field={'[data-nozzle]':'nozzle','[data-mode]':'mode','[data-camera]':'camera'}[s];return all.filter(e=>e.dataset[field]);},createElement:()=>new Element(),createElementNS:()=>new Element()};
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}};
const prior=console.error;console.error=()=>{};await import('../dist/main.js');console.error=prior;
assert.equal(ids['nozzle-list'].children.length,10);assert.equal(ids.labels.children.length,10);assert(ids.fallback.hidden===false,'Expected explicit WebGL fallback in a non-browser test');
const modes=all.filter(e=>e.dataset.mode);modes.find(e=>e.dataset.mode==='xray').onclick();assert.equal(ids['view-label'].textContent,'02 / INSIDE');
modes.find(e=>e.dataset.mode==='exploded').onclick();assert.equal(ids['explode-value'].textContent,'65%');
ids.explode.oninput({target:{value:'.81'}});assert.equal(ids['explode-value'].textContent,'81%');
ids['nozzle-list'].children.find(b=>b.dataset.nozzle==='Y1').onclick();assert(ids.detail.innerHTML.includes('左前侧向喷口'));assert(ids.detail.innerHTML.includes('布局推断'));
await ids['export-glb'].onclick();assert(ids['export-note'].textContent.includes('已导出标准装配态'));assert.equal(ids['export-glb'].disabled,false);
console.log(JSON.stringify({status:'PASS',scope:'DOM state only; no browser or WebGL verification',checks:['10 selectors','10 labels','mode switch','explosion slider','evidence selection','GLB export','static fallback']}));
