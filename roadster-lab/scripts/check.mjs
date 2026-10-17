import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRoadster} from '../dist/model.js';
import {THRUSTERS,GALLERY} from '../dist/data.js';
const m=createRoadster();let triangles=0,meshes=0;
m.car.traverse(o=>{if(o.isMesh){meshes++;for(const v of o.geometry.attributes.position.array)assert(Number.isFinite(v),'Non-finite geometry');triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
assert.equal(new Set(THRUSTERS.map(t=>t.id)).size,10);assert.equal(THRUSTERS.filter(t=>t.level==='observed').length,4);assert.equal(m.markers.length,10);assert.equal(m.plumes.length,10);
for(const t of THRUSTERS){assert(Math.abs(Math.hypot(...t.exhaust)-1)<1e-8);assert(m.markers.find(n=>n.data.id===t.id));}
assert.equal(m.layers.cabin.children.filter(o=>o.name==='Driver_seat_base').length,1);
assert(m.layers.tankPassenger.children.length>0);assert(m.layers.fans.children.some(o=>o.name==='Suction_fan_not_thruster'));
for(const g of GALLERY)assert((await fs.stat(path.join('dist/assets',g.file))).size>1000);
for(const f of ['dist/main.js','dist/model.js','dist/vendor/GLTFExporter.js','dist/vendor/OrbitControls.js']){const s=await fs.readFile(f,'utf8');for(const x of s.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(x[1].startsWith('.'))await fs.access(path.resolve(path.dirname(f),x[1]));}}
const glb=await fs.readFile('dist/roadster-rocket.glb');assert.equal(glb.subarray(0,4).toString(),'glTF');assert.equal(glb.readUInt32LE(4),2);assert.equal(glb.readUInt32LE(8),glb.length);const jsonLength=glb.readUInt32LE(12);const doc=JSON.parse(glb.subarray(20,20+jsonLength).toString());assert(doc.nodes.some(n=>n.name==='Passenger_COPV_400L_schematic'));assert.equal(doc.nodes.filter(n=>/^R[1-4]_/.test(n.name)).length,4);
console.log(JSON.stringify({status:'PASS',triangles,meshes,thrusterPoints:10,officialPhotos:GALLERY.length,glbBytes:glb.length,exportedNodes:doc.nodes.length}));
