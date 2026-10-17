import fs from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.js';
import {GLTFExporter} from '../dist/vendor/GLTFExporter.js';
import {createRoadster} from '../dist/model.js';
// GLTFExporter uses the standard browser FileReader API to assemble GLB bytes.
globalThis.FileReader=class{
  readAsArrayBuffer(blob){blob.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();});}
  readAsDataURL(blob){blob.arrayBuffer().then(r=>{this.result='data:'+blob.type+';base64,'+Buffer.from(r).toString('base64');this.onloadend?.();});}
};
const {car,layers,plumes,pickables}=createRoadster();layers.pipes.visible=false;
for(const o of [...plumes,...pickables])o.parent.remove(o);
const binary=await new GLTFExporter().parseAsync(car,{binary:true,onlyVisible:true});await fs.writeFile('dist/roadster-rocket.glb',new Uint8Array(binary));
// Also provide OBJ + MTL for broad DCC compatibility.
car.updateMatrixWorld(true);let obj='mtllib roadster-rocket.mtl\n',mtl='',offset=1,mi=0;const materials=new Map();
car.traverse(o=>{if(!o.isMesh||!o.visible||o.material.visible===false)return;let visible=true;o.traverseAncestors(p=>{if(!p.visible)visible=false;});if(!visible)return;const g=o.geometry,mat=o.material;let name=materials.get(mat.uuid);if(!name){name='mat_'+mi++;materials.set(mat.uuid,name);const c=mat.color.clone().convertLinearToSRGB();mtl+=`newmtl ${name}\nKd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}\nd ${mat.opacity}\n\n`;}
obj+=`o ${o.name.replace(/[^a-zA-Z0-9_]/g,'_')||'part'}\nusemtl ${name}\n`;const p=g.attributes.position;for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);obj+=`v ${v.x.toFixed(6)} ${v.y.toFixed(6)} ${v.z.toFixed(6)}\n`;}
const ix=g.index;for(let i=0;i<(ix?ix.count:p.count);i+=3)obj+=`f ${[0,1,2].map(k=>offset+(ix?ix.getX(i+k):i+k)).join(' ')}\n`;offset+=p.count;
});await fs.writeFile('dist/roadster-rocket.obj',obj);await fs.writeFile('dist/roadster-rocket.mtl',mtl);

// Deterministic software projections for geometry inspection and WebGL fallback.
async function preview(name,position,exploded=false){
 const fresh=createRoadster();fresh.layers.pipes.visible=false;if(exploded){fresh.layers.body.position.y=.9;fresh.layers.canopy.position.y=1.7;fresh.layers.aero.position.y=1.2;fresh.layers.tankRear.position.y=.65;fresh.layers.tankPassenger.position.y=.6;fresh.layers.cabin.position.y=.4;}
 fresh.car.updateMatrixWorld(true);const camera=new THREE.PerspectiveCamera(36,1.5,.05,100);camera.position.set(...position);camera.lookAt(0,exploded?1.1:.55,0);camera.updateMatrixWorld(true);camera.updateProjectionMatrix();
 const triangles=[],light=new THREE.Vector3(2,7,4).normalize();fresh.car.traverse(o=>{if(!o.isMesh||!o.visible||o.material.visible===false||o.material.transparent)return;let visible=true;o.traverseAncestors(p=>{if(!p.visible)visible=false;});if(!visible)return;const p=o.geometry.attributes.position,idx=o.geometry.index;for(let i=0;i<(idx?idx.count:p.count);i+=3){const vs=[0,1,2].map(k=>new THREE.Vector3().fromBufferAttribute(p,idx?idx.getX(i+k):i+k).applyMatrix4(o.matrixWorld));const n=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).normalize();const shade=.42+.58*Math.abs(n.dot(light));const c=o.material.color.clone().multiplyScalar(shade);const ps=vs.map(v=>v.clone().project(camera));triangles.push({vertices:ps.map(v=>[(v.x*.5+.5)*1200,(-.5*v.y+.5)*800,v.z]),depth:vs.reduce((s,v)=>s+v.clone().applyMatrix4(camera.matrixWorldInverse).z,0)/3,points:ps.map(v=>`${((v.x*.5+.5)*1200).toFixed(2)},${((-.5*v.y+.5)*800).toFixed(2)}`).join(' '),color:'#'+c.getHexString()});}});
 triangles.sort((a,b)=>a.depth-b.depth);const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><radialGradient id="bg"><stop stop-color="#f0f3ee"/><stop offset="1" stop-color="#dce5e3"/></radialGradient><radialGradient id="shadow"><stop stop-color="#7a9699" stop-opacity=".23"/><stop offset="1" stop-color="#a1b4b2" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="800" fill="url(#bg)"/><ellipse cx="590" cy="590" rx="440" ry="110" fill="url(#shadow)"/>${triangles.map(t=>`<polygon points="${t.points}" fill="${t.color}" stroke="${t.color}" stroke-width=".35"/>`).join('')}</svg>`;await fs.writeFile(`research/${name}.svg`,svg);await fs.writeFile(`research/${name}-triangles.json`,JSON.stringify(triangles));
}
await fs.mkdir('research',{recursive:true});await preview('front',[6.5,3.6,6.8]);await preview('rear',[-6.5,2.8,6.8]);await preview('exploded',[6.7,4.7,7.2],true);await preview('bottom',[4.5,-3.8,5.3]);console.log(JSON.stringify({glbBytes:binary.byteLength,objVertices:offset-1,previews:4}));
