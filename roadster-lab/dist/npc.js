import * as THREE from './vendor/three.module.js';
import { trafficPhase } from './world.js';

const EXTENT = 238;
const STOP = EXTENT - 26;

// Right-hand traffic: straight cars use the inner lane, right turns the outer.
function route(approach, turning) {
  const lane = turning ? 9.5 : 3.75;
  const radius = 15 - lane;
  const entryLength = EXTENT - 15;
  const arcLength = radius * Math.PI / 2;
  const angle = approach * Math.PI / 2;
  const c = Math.cos(angle), s = Math.sin(angle);
  return {
    axis: approach % 2 === 0 ? 'x' : 'z',
    length: turning ? entryLength * 2 + arcLength : EXTENT * 2,
    sample(distance, position, tangent) {
      let x, z, dx, dz;
      if (!turning || distance <= entryLength) {
        x = -EXTENT + distance; z = lane; dx = 1; dz = 0;
      } else if (distance < entryLength + arcLength) {
        const a = (distance - entryLength) / radius - Math.PI / 2;
        x = -15 + radius * Math.cos(a); z = 15 + radius * Math.sin(a);
        dx = -Math.sin(a); dz = Math.cos(a);
      } else {
        x = -lane; z = 15 + distance - entryLength - arcLength; dx = 0; dz = 1;
      }
      position.set(c * x + s * z, 0, -s * x + c * z);
      tangent.set(c * dx + s * dz, 0, -s * dx + c * dz);
    }
  };
}

export class NPCManager {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'City traffic';
    scene.add(this.group);
    this.cars = [];
    this._position = new THREE.Vector3();
    this._tangent = new THREE.Vector3();
    this._player = new THREE.Vector3();
    const standard = (color, extra = {}) => new THREE.MeshStandardMaterial({
      color, roughness: 0.6, metalness: 0.15, flatShading: true, ...extra
    });
    const dark = standard(0x23303e);
    const glass = standard(0x60869b, { metalness: 0.45, roughness: 0.25 });
    const tire = standard(0x192331, { metalness: 0, roughness: 1 });
    const rim = standard(0xa8b7c4, { metalness: 0.7 });
    const headlight = standard(0xffe2b7, { emissive: 0xffd6a0, emissiveIntensity: 1 });
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.24, 10);
    const hubGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.255, 8);
    const colors = [0x719eb4, 0xd9b391, 0xc46d62, 0xd5dfe2, 0x6a8b83, 0xd7ba70];
    for (let i = 0; i < 6; i++) {
      const car = new THREE.Group();
      car.name = `City car ${i + 1}`;
      const paint = standard(colors[i]);
      const brakeMaterial = standard(0xc34546, { emissive: 0xff342c, emissiveIntensity: 0.45 });
      function box(mat, x, y, z, sx, sy, sz) {
        const mesh = new THREE.Mesh(boxGeometry, mat);
        mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        car.add(mesh);
        return mesh;
      }
      // Local +Z is forward, wheels sit on the same y=0 plane as the player.
      box(paint, 0, 0.72, 0, 1.85, 0.65, 4.3);
      box(dark, 0, 0.4, 0, 1.8, 0.22, 4.1);
      box(glass, 0, 1.25, -0.15, 1.58, 0.65, 2.05);
      box(paint, 0, 1.62, -0.23, 1.65, 0.14, 1.95);
      for (const side of [-1, 1]) {
        box(paint, side * 0.81, 1.25, -0.25, 0.08, 0.68, 0.12);
        box(paint, side * 1.02, 1.1, 0.65, 0.25, 0.17, 0.3);
        box(headlight, side * 0.65, 0.8, 2.16, 0.45, 0.16, 0.05);
        box(brakeMaterial, side * 0.65, 0.8, -2.16, 0.45, 0.17, 0.05);
      }
      box(dark, 0, 0.56, 2.17, 0.9, 0.18, 0.06);
      const wheels = [];
      for (const x of [-0.91, 0.91]) for (const z of [-1.35, 1.35]) {
        const pivot = new THREE.Group();
        pivot.position.set(x, 0.38, z);
        const wheel = new THREE.Mesh(wheelGeometry, tire);
        const hub = new THREE.Mesh(hubGeometry, rim);
        wheel.rotation.z = hub.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        pivot.add(wheel, hub); car.add(pivot); wheels.push(pivot);
      }
      const turning = i >= 4;
      const path = route(turning ? (i === 4 ? 1 : 3) : i, turning);
      const state = {
        mesh: car, route: path, distance: 80 + i * 21,
        speed: 8 + i * 0.4, cruise: 10 + (i % 3), wheels,
        brakeMaterial, committed: false, turning, wheelAngle: 0
      };
      path.sample(state.distance, car.position, this._tangent);
      car.rotation.y = Math.atan2(this._tangent.x, this._tangent.z);
      this.cars.push(state);
      this.group.add(car);
    }
  }

  // dt and time are seconds. player may be an Object3D, { position }, or { x, z }.
  update(dt, time = 0, player = null) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const elapsed = Math.min(dt, 0.25);
    const steps = Math.ceil(elapsed / (1 / 60));
    const h = elapsed / steps;
    let hasPlayer = false;
    if (player) {
      if (player.isObject3D) player.getWorldPosition(this._player);
      else {
        const p = player.position || player;
        this._player.set(p.x, 0, p.z);
      }
      hasPlayer = Number.isFinite(this._player.x) && Number.isFinite(this._player.z);
    }
    for (let step = 0; step < steps; step++) {
      const phase = trafficPhase(time - elapsed + (step + 1) * h);
      for (const car of this.cars) {
        const path = car.route;
        const remaining = STOP - car.distance;
        const signal = phase[path.axis];
        // At amber, a car too close to brake comfortably clears the junction.
        if (remaining >= 0 && signal === 'amber' && remaining < car.speed * car.speed / 7 + 1) car.committed = true;
        if (car.distance > STOP + 0.05) car.committed = true;
        let target = car.cruise;
        let stopDistance = Infinity;
        if (!car.committed && signal !== 'green' && remaining >= 0) stopDistance = remaining;
        if (car.turning && car.distance > 200 && car.distance < 243) target = 5;
        path.sample(car.distance, this._position, this._tangent);
        // Lightweight avoidance: following cars and a player ahead in this lane.
        const obstacle = position => {
          const dx = position.x - this._position.x, dz = position.z - this._position.z;
          const forward = dx * this._tangent.x + dz * this._tangent.z;
          const lateral = Math.abs(dx * this._tangent.z - dz * this._tangent.x);
          if (forward > 0 && forward < 45 && lateral < 2.2) stopDistance = Math.min(stopDistance, Math.max(0, forward - 6));
        };
        if (hasPlayer) obstacle(this._player);
        for (const other of this.cars) if (other !== car) obstacle(other.mesh.position);
        // sqrt(2ad) gives a continuous braking envelope, with a final exact stop.
        target = Math.min(target, Math.sqrt(2 * 3.5 * Math.max(0, stopDistance - 0.15)));
        const oldSpeed = car.speed;
        car.speed += THREE.MathUtils.clamp(target - car.speed, -5 * h, 2.2 * h);
        let travel = (oldSpeed + car.speed) * 0.5 * h;
        if (travel >= stopDistance) { travel = stopDistance; car.speed = 0; }
        car.distance += travel;
        car.brakeMaterial.emissiveIntensity = car.speed < oldSpeed - 0.001 || car.speed < 0.2 ? 2.4 : 0.45;
        if (car.distance >= path.length) {
          car.distance %= path.length;
          car.committed = false;
        }
        path.sample(car.distance, car.mesh.position, this._tangent);
        car.mesh.rotation.y = Math.atan2(this._tangent.x, this._tangent.z);
        car.wheelAngle += travel / 0.38;
        for (const wheel of car.wheels) wheel.rotation.x = car.wheelAngle;
      }
    }
  }
}
