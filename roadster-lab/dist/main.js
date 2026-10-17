import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';
import {createRoadster} from './model.js';
import {THRUSTERS,PARTS,GALLERY,SOURCES} from './data.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
let selected='R1',mode='exterior',expansion=0,showLabels=true,showJets=false;
const model=createRoadster(),{car,layers,markers,plumes,materials}=model;
const scene=new THREE.Scene();scene.add(car);
const camera=new THREE.PerspectiveCamera(37,1,.05,100);camera.position.set(6.5,3.6,6.8);
const mount=$('#canvas-mount'),host=$('#viewport');
let renderer,controls;
function select(id){selected=id;const d=THRUSTERS.find(t=>t.id===id);$$('[data-nozzle]').forEach(b=>{b.classList.toggle('active',b.dataset.nozzle===id);b.setAttribute('aria-pressed',String(b.dataset.nozzle===id));});$('#detail').innerHTML=`<p class="detail-kicker ${d.level==='inferred'?'inferred':''}">${d.id} / ${d.level==='observed'?'公开可见 · 坐标近似':'布局推断 · 非官方点位'}</p><h3>${d.name}</h3><p class="role">${d.role}</p><p>${d.evidence}</p><p class="coordinates">模型坐标 [${d.position.join(', ')}] · ${d.source}</p>`;}
for(const d of THRUSTERS){const b=document.createElement('button');b.textContent=d.id;b.className=d.level==='inferred'?'inferred':'';b.dataset.nozzle=d.id;b.title=d.name;b.addEventListener('click',()=>select(d.id));$('#nozzle-list').appendChild(b);const label=b.cloneNode(true);label.className=`marker ${d.level==='inferred'?'inferred':''}`;label.setAttribute('aria-label',`${d.id} ${d.name} ${d.level==='inferred'?'推断位置':'公开可见'}`);label.onclick=()=>select(d.id);$('#labels').appendChild(label);markers.find(m=>m.data.id===d.id).element=label;}
$('#parts').innerHTML=PARTS.map((p,i)=>`<article class="part"><span>0${i+1} / ${p.source}</span><h3>${p.name}</h3><div class="part-label">${p.label}</div><p>${p.note}</p></article>`).join('');
$('#gallery').innerHTML=GALLERY.map(g=>`<article><a class="reference-image" href="https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/${g.file}" target="_blank" rel="noopener noreferrer"><img src="assets/${g.file}" loading="lazy" alt="Tesla 官方参考图：${g.title}"></a><h3>${g.title} ↗</h3><p>${g.caption}</p></article>`).join('');
$('#sources').innerHTML=SOURCES.map(s=>`<article class="source"><a href="${s.url}" target="_blank" rel="noopener noreferrer"><span>${s.id}</span>${s.title}<span>↗</span></a><p>${s.kind}<br>${s.note}</p></article>`).join('');select(selected);

const explosion={body:[0,1.05,0],canopy:[0,1.85,0],aero:[-.12,1.5,0],cabin:[0,.48,0],tankRear:[-.20,.85,0],tankPassenger:[0,.78,-.28],battery:[0,-.35,0],chassis:[0,-.1,0],motors:[-.15,.12,0],suspension:[0,.1,0],fans:[-.45,0,0],wheels:[0,0,0],thrusters:[0,0,0],pipes:[0,0,0]};
function updateModel(){
  for(const [name,g]of Object.entries(layers)){g.position.set(...explosion[name]).multiplyScalar(expansion);g.visible=true;}
  for(const material of [materials.body,materials.glass]){material.transparent=mode==='xray';material.opacity=mode==='xray'?.14:1;material.depthWrite=mode!=='xray';material.needsUpdate=true;}
  layers.pipes.visible=mode!=='exterior'||expansion>.05;
  if(mode==='xray')layers.canopy.visible=false;
  // Move the wheels away from the car in the exploded view.
  layers.wheels.children.forEach(w=>{w.position.z=Math.sign(w.position.z)*(1.005+expansion*.45);});
  plumes.forEach(p=>p.visible=showJets);
  $('#explode').value=expansion;$('#explode-value').textContent=`${Math.round(expansion*100)}%`;
  $('#view-label').textContent=({exterior:'01 / EXTERIOR',xray:'02 / INSIDE',exploded:'03 / EXPLODED'})[mode];
  $$('[data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
}
$$('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;expansion=mode==='exploded'?.65:0;updateModel();if(controls)controls.target.set(0,mode==='exploded'?1.05:.6,0);});
$('#explode').oninput=e=>{expansion=+e.target.value;mode=expansion>0?'exploded':'exterior';updateModel();if(controls)controls.target.set(0,.6+expansion*.7,0);};
$('#show-labels').onchange=e=>showLabels=e.target.checked;$('#show-jets').onchange=e=>{showJets=e.target.checked;updateModel();};
const presets={front:[6.5,3.6,6.8],rear:[-6.6,2.8,5.9],top:[.01,9,.01],bottom:[4.5,-3.8,5.3]};let cameraGoal=null;
$$('[data-camera]').forEach(b=>b.onclick=()=>{cameraGoal=new THREE.Vector3(...presets[b.dataset.camera]);if(controls){controls.autoRotate=false;$('#rotate').setAttribute('aria-pressed','false');controls.target.set(0,b.dataset.camera==='bottom'?.35:.6,0);controls.minPolarAngle=0;controls.maxPolarAngle=Math.PI;}});
$('#rotate').onclick=()=>{if(!controls)return;controls.autoRotate=!controls.autoRotate;$('#rotate').setAttribute('aria-pressed',String(controls.autoRotate));};
updateModel();
try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;mount.appendChild(renderer.domElement);
 controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.6,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=4;controls.maxDistance=15;controls.maxPolarAngle=Math.PI;controls.autoRotateSpeed=.65;controls.addEventListener('start',()=>cameraGoal=null);
 scene.add(new THREE.HemisphereLight(0xf1f7f8,0x8e9c99,2.8));const key=new THREE.DirectionalLight(0xfff8eb,4);key.position.set(3,8,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:.1,far:25});key.shadow.bias=-.001;scene.add(key);const fill=new THREE.DirectionalLight(0xc6e4f4,2);fill.position.set(-5,3,-3);scene.add(fill);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.12}));ground.rotation.x=-Math.PI/2;ground.position.y=-.08;ground.receiveShadow=true;scene.add(ground);
 const grid=new THREE.GridHelper(18,36,0xc6d3d2,0xc6d3d2);grid.position.y=-.09;grid.material.transparent=true;grid.material.opacity=.25;scene.add(grid);
 const ro=new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);});ro.observe(host);
 const pos=new THREE.Vector3();
 renderer.setAnimationLoop(()=>{
   if(cameraGoal){camera.position.lerp(cameraGoal,.09);if(camera.position.distanceTo(cameraGoal)<.01)cameraGoal=null;}controls.update();car.updateMatrixWorld(true);
   const projected=[];
   for(const m of markers){m.object.getWorldPosition(pos);pos.project(camera);const visible=showLabels&&pos.z<1&&pos.z>0&&Math.abs(pos.x)<1.05&&Math.abs(pos.y)<1.05;m.element.hidden=!visible;if(!visible)continue;projected.push({m,x:(pos.x*.5+.5)*host.clientWidth,y:(-.5*pos.y+.5)*host.clientHeight});}
   // Keep nearby marker buttons legible; connector offsets do not change model points.
   for(let i=0;i<projected.length;i++){const p=projected[i];for(let j=0;j<i;j++){const q=projected[j];if(Math.abs(p.x-q.x)<32&&Math.abs(p.y-q.y)<27)p.y=q.y+28;}p.m.element.style.left=p.x+'px';p.m.element.style.top=p.y+'px';p.m.element.style.opacity=mode==='exterior'&&p.m.data.level==='inferred'?'0.78':'1';}
   renderer.render(scene,camera);
 });
 const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
 renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(model.pickables);if(hits.length)select(hits[0].object.userData.thrusterId);});
 let triangles=0,meshes=0;car.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?o.geometry.index.count:o.geometry.attributes.position.count)/3;}});$('#mesh-stats').textContent=`${Math.round(triangles).toLocaleString()} TRIANGLES / ${meshes} MESHES / THREE.JS r170`;
}catch(e){console.error('WebGL initialization failed',e);$('#fallback').hidden=false;$('#labels').hidden=true;$('#mesh-stats').textContent='STATIC FALLBACK / WEBGL UNAVAILABLE';}
$('#export-glb').onclick=async()=>{
 const button=$('#export-glb');button.disabled=true;const old=button.innerHTML;button.textContent='正在导出…';
 try{const{GLTFExporter}=await import('./vendor/GLTFExporter.js');const fresh=createRoadster();fresh.layers.pipes.visible=false;fresh.plumes.forEach(p=>p.parent.remove(p));fresh.pickables.forEach(p=>p.parent.remove(p));const data=await new GLTFExporter().parseAsync(fresh.car,{binary:true,onlyVisible:true});const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'}));a.download='roadster-rocket.glb';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);$('#export-note').textContent='已导出标准装配态 · 全部坐标为示意';}catch(e){console.error(e);const a=document.createElement('a');a.href='roadster-rocket.glb';a.download='roadster-rocket.glb';a.click();$('#export-note').textContent='已下载预生成的标准装配态 GLB';}finally{button.disabled=false;button.innerHTML=old;}
};
