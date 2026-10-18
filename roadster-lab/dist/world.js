import * as THREE from './vendor/three.module.js';

// Seconds, shared by the visible signals and NPCs. Both axes are red during clearance.
export const GRID_SPACING = 480;
export const INTERSECTIONS = Object.freeze([0,1,2,3].map(id=>Object.freeze({id,x:(id%2)*GRID_SPACING,z:Math.floor(id/2)*GRID_SPACING})));

export function trafficPhase(time = 0, intersectionId = 0) {
  const shifted=time+intersectionId*4;
  const t = ((shifted % 38) + 38) % 38;
  return {
    x: t < 14 ? 'green' : t < 17 ? 'amber' : 'red',
    z: t >= 19 && t < 33 ? 'green' : t >= 33 && t < 36 ? 'amber' : 'red'
  };
}

export function createWorld(scene) {
  const root = new THREE.Group();
  root.name = 'Sunset city';
  scene.add(root);
  scene.background = new THREE.Color(0xa8bacd);
  scene.fog = new THREE.FogExp2(0xa8bacd, 0.0025);
  const sky = new THREE.HemisphereLight(0xc5dcff, 0x6c625c, 1.8);
  const sun = new THREE.DirectionalLight(0xffc298, 2.6);
  sun.position.set(130, 250, 315);sun.target.position.set(240,0,240);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -540, right: 540, top: 540, bottom: -540, near: 1, far: 1200 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.08;
  root.add(sky, sun, sun.target);

  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.85, flatShading: true, ...extra
  });
  const m = {
    grass: material(0x627e71), asphalt: material(0x303e50), curb: material(0xb6bec5),
    paving: material(0x8797a6), white: material(0xe0e2d6), yellow: material(0xe6bd75),
    metal: material(0x34485b, { metalness: 0.45 }), trunk: material(0x65574e),
    leaf: material(0x416f67), leafLight: material(0x658a77), soil: material(0x455c57),
    glass: material(0x3e637e, { metalness: 0.35, roughness: 0.35 }),
    window: material(0xf2ce96, { emissive: 0xe7ad64, emissiveIntensity: 0.3 }),
    lamp: material(0xffdfac, { emissive: 0xffc576, emissiveIntensity: 1.8 }),
    walls: [0x71879c, 0x91a8b7, 0xb5b0a7, 0x637b94, 0xa48d89, 0x7e99a3].map(c => material(c))
  };
  const geometry = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    crown: new THREE.IcosahedronGeometry(0.5, 0),
    cone: new THREE.ConeGeometry(0.5, 1, 7),
    lamp: new THREE.SphereGeometry(0.26, 8, 6)
  };
  // Batch static detail by material/geometry: thousands of windows, few draw calls.
  const batches = new Map();
  const transform = new THREE.Object3D();
  let tileX=0,tileZ=0;
  const surfaces=[];
  function shape(kind, mat, x, y, z, sx, sy, sz, rotation = 0) {
    if(mat===m.asphalt||mat===m.grass||mat===m.paving||mat===m.curb&&y<0)surfaces.push({kind:mat===m.asphalt?'road':mat===m.grass?'grass':mat===m.paving?'sidewalk':'curb',x:x+tileX,z:z+tileZ,width:sx,depth:sz,top:y+sy/2});
    const key = `${kind}:${mat.uuid}`;
    if (!batches.has(key)) batches.set(key, { kind, mat, matrices: [] });
    transform.position.set(x+tileX, y, z+tileZ);
    transform.rotation.set(0, rotation, 0);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    batches.get(key).matrices.push(transform.matrix.clone());
  }
  const box = (mat, x, y, z, sx, sy, sz, rotation = 0) => shape('box', mat, x, y, z, sx, sy, sz, rotation);

  const signals=[];
  const signalMaterials={};
  for(const state of ['red','amber','green'])signalMaterials[state]=new THREE.MeshBasicMaterial({color:0xffffff});
  for(const tile of INTERSECTIONS){
  tileX=tile.x;tileZ=tile.z;
  // Every ground surface has its top at exactly y=0. No heightfield or collision mesh.
  box(m.asphalt, 0, -0.1, 0, 480, 0.2, 30);
  for (const side of [-1, 1]) box(m.asphalt, 0, -0.1, side * 127.5, 30, 0.2, 225);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    // Disjoint coplanar footprints: grass begins beyond the sidewalks and
    // excludes the 26x26 plaza. Shared y=0 must not mean overlapping faces.
    for(const [x0,x1,z0,z1] of [[21,240,21,25],[21,240,51,240],[21,25,25,51],[51,240,25,51]])
      box(m.grass,sx*(x0+x1)/2,-.1,sz*(z0+z1)/2,x1-x0,.2,z1-z0);
    box(m.paving, sx * 127.6875, -0.08, sz * 18.1875, 224.625, 0.16, 5.625);
    box(m.paving, sx * 18.1875, -0.08, sz * 130.5, 5.625, 0.16, 219);
    box(m.curb, sx * 127.6875, -0.12, sz * 15.1875, 224.625, 0.24, 0.375);
    box(m.curb, sx * 15.1875, -0.12, sz * 127.5, 0.375, 0.24, 225);
  }
  for (let d = -234; d <= 234; d += 12) {
    if (Math.abs(d) < 29) continue;
    for (const lane of [-7.5, 7.5]) {
      box(m.white, d, 0.012, lane, 5, 0.018, 0.14);
      box(m.white, lane, 0.012, d, 0.14, 0.018, 5);
    }
  }
  for (const side of [-1, 1]) {
    for (const offset of [-0.22, 0.22]) {
      box(m.yellow, side * 134, 0.012, offset, 212, 0.018, 0.12);
      box(m.yellow, offset, 0.012, side * 134, 0.12, 0.018, 212);
    }
    // Four zebra crossings; stop bars sit upstream of the crossing.
    for (let d = -13; d <= 13; d += 2.4) {
      box(m.white, side * 19, 0.015, d, 3.6, 0.02, 1.05);
      box(m.white, d, 0.015, side * 19, 1.05, 0.02, 3.6);
    }
    box(m.white, side * 23, 0.015, -side * 7.5, 0.4, 0.02, 14);
    box(m.white, side * 7.5, 0.015, side * 23, 14, 0.02, 0.4);
  }

  // Deterministic scenery: no assets, canvas textures, or random layout changes.
  let seed = 1627;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  function building(x, z, width, depth, height, index) {
    const wall = m.walls[index % m.walls.length];
    box(wall, x, height / 2, z, width, height, depth);
    box(m.curb, x, height + 0.22, z, width + 0.7, 0.44, depth + 0.7);
    box(m.metal, x + width * 0.17, height + 1, z, width * 0.28, 1.5, depth * 0.25);
    box(m.glass, x, 1.8, z - depth / 2 - 0.035, width * 0.72, 3, 0.08);
    box(m.metal, x, 3.5, z - depth / 2 - 0.8, width * 0.85, 0.18, 1.8);
    for (let y = 5; y < height - 1; y += 3.8) {
      for (let dx = -width / 2 + 2; dx < width / 2 - 1; dx += 3.6) {
        for (const side of [-1, 1]) box(random() > 0.8 ? m.window : m.glass, x + dx, y, z + side * (depth / 2 + 0.025), 1.65, 2, 0.06);
      }
      for (let dz = -depth / 2 + 2; dz < depth / 2 - 1; dz += 3.6) {
        for (const side of [-1, 1]) box(random() > 0.8 ? m.window : m.glass, x + side * (width / 2 + 0.025), y, z + dz, 0.06, 2, 1.65);
      }
    }
  }
  let index = 0;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let ix = 0; ix < 4; ix++) for (let iz = 0; iz < 4; iz++) {
      // Leave one landscaped plaza near the intersection in every block.
      if (ix === 0 && iz === 0) continue;
      const x = sx * (43 + ix * 51 + random() * 5);
      const z = sz * (43 + iz * 51 + random() * 5);
      building(x, z, 22 + random() * 14, 22 + random() * 14,
        12 + random() * 38 + (ix + iz > 3 ? 12 : 0), index++);
    }
    box(m.paving, sx * 38, -0.06, sz * 38, 26, 0.12, 26);
    box(m.soil, sx * 38, 0.28, sz * 38, 12, 0.56, 12);
    // Benches around the small corner gardens.
    for (const offset of [-9, 9]) {
      box(m.trunk, sx * 38 + offset, 0.7, sz * 38, 1.2, 0.2, 4);
      for (const dz of [-1.4, 1.4]) box(m.metal, sx * 38 + offset, 0.35, sz * 38 + dz, 0.7, 0.7, 0.25);
    }
  }
  function tree(x, z, scale = 1) {
    shape('cylinder', m.trunk, x, 1.8 * scale, z, 0.5 * scale, 3.6 * scale, 0.5 * scale);
    shape('crown', m.leaf, x, 5 * scale, z, 5.2 * scale, 6 * scale, 5.2 * scale);
    shape('crown', m.leafLight, x + scale, 6.4 * scale, z - 0.4 * scale, 3.8 * scale, 4 * scale, 3.8 * scale);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    tree(sx * 38, sz * 38, 1.3);
    for (let d = 55; d < 230; d += 27) {
      tree(sx * d, sz * 25, 0.8 + random() * 0.25);
      tree(sx * 25, sz * d, 0.8 + random() * 0.25);
    }
  }
  for (let d = -220; d <= 220; d += 40) {
    if (Math.abs(d) < 28) continue;
    for (const side of [-1, 1]) {
      for (const axis of ['x', 'z']) {
        const x = axis === 'x' ? d : side * 17;
        const z = axis === 'x' ? side * 17 : d;
        shape('cylinder', m.metal, x, 4.4, z, 0.18, 8.8, 0.18);
        box(m.metal, x, 8.8, z, axis === 'x' ? 0.3 : 3.5, 0.18, axis === 'x' ? 3.5 : 0.3);
        box(m.lamp, x, 8.68, z, 0.65, 0.08, 0.65);
      }
    }
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    for (let d = 17; d < 30; d += 3) {
      shape('cylinder', m.metal, sx * d, 0.65, sz * 16.4, 0.22, 1.3, 0.22);
      shape('cylinder', m.metal, sx * 16.4, 0.65, sz * d, 0.22, 1.3, 0.22);
    }
  }

  // Traffic poles, arms, housings and all lamps join global material batches.
  // Four tiles therefore add instances, not four copies of every draw call.
  for(let approach=0;approach<4;approach++){
    const angle=approach*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
    const baseX=-22*c+16.8*s,baseZ=22*s+16.8*c;
    const signalShape=(kind,mat,x,y,z,sx,sy,sz)=>shape(kind,mat,baseX+c*x+s*z,y,baseZ-s*x+c*z,sx,sy,sz,angle);
    signalShape('cylinder',m.metal,0,3.75,0,.28,7.5,.28);
    signalShape('box',m.metal,0,7.4,-6.4,.18,.18,13);
    for(const offset of [-5.5,-12]){
      signalShape('box',m.metal,0,6.5,offset,.65,2.2,.9);
      for(const [state,color,y] of [['red',0xff5148,7.18],['amber',0xffc34d,6.5],['green',0x65efbc,5.82]]){
        const mat=signalMaterials[state],key=`lamp:${mat.uuid}`;
        const index=batches.get(key)?.matrices.length||0;
        signalShape('lamp',mat,-.36,y,offset,1,1,1);
        signals.push({intersection:tile.id,axis:approach%2===0?'x':'z',state,color,key,index});
      }
    }
  }
  } // End tile assembly: every static item shares the same global batches.
  for (const { kind, mat, matrices } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry[kind], mat, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = mat !== m.asphalt && mat !== m.grass && mat !== m.white && mat !== m.yellow;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    root.add(mesh);batches.get(`${kind}:${mat.uuid}`).mesh=mesh;
  }
  const lampColor=new THREE.Color();
  function update(time = 0) {
    for(const signal of signals){
      const active=trafficPhase(time,signal.intersection)[signal.axis]===signal.state;
      batches.get(signal.key).mesh.setColorAt(signal.index,lampColor.setHex(active?signal.color:0x080b10));
    }
    for(const mat of Object.values(signalMaterials))batches.get(`lamp:${mat.uuid}`).mesh.instanceColor.needsUpdate=true;
  }
  update(0);
  return {update,root,intersections:INTERSECTIONS,surfaces,batchCount:batches.size,bounds:{min:-240,max:720},signals,groundHeight:(_x,_z)=>0};
}
