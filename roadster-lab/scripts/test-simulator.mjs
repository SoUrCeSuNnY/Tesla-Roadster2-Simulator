// Run from any directory: node --test /path/to/roadster-lab/scripts/test-simulator.mjs
// Real rigid-body/controller integration and keybind units; no DOM, browser, or physics mocks.
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {Quaternion, Vector3} from '../dist/vendor/three.module.js';
import {THRUSTERS} from '../dist/data.js';
import {FlightController, MAX_PRESSURE, MAX_THRUST} from '../dist/controller.js';
import {ACTIONS, DEFAULT_BINDINGS, DEFAULT_INVERSIONS, Keybinds, formatKey} from '../dist/keybinds.js';
import {TakeoffPitchLock} from '../dist/takeoff-lock.js';
import {
  VehiclePhysics, G0, DRY_MASS, TANK_VOLUME, TANK_TEMPERATURE, INITIAL_GAS, STEP
} from '../dist/physics.js';

const DEG = Math.PI / 180;
const ISP = 68;
const zero = () => Array(10).fill(0);
const rating = t => MAX_THRUST[t.id[0] === 'R' ? 'rear' : t.id[0] === 'L' ? 'lift' : 'yaw'];
function near(actual, expected, tolerance, message = '') {
  assert(Number.isFinite(actual), `${message}: non-finite value ${actual}`);
  assert(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected} ± ${tolerance}, got ${actual}`);
}
function finite(body) {
  for (const n of [...body.p.toArray(), ...body.v.toArray(), ...body.q.toArray(),
    ...body.omega.toArray(), body.mass, body.gas, body.pressure, body.g, body.altitude]) {
    assert(Number.isFinite(n), `Non-finite simulation state: ${n}`);
  }
  near(body.q.length(), 1, 1e-10, 'unit quaternion');
  assert(body.gas >= 0 && body.gas <= INITIAL_GAS);
  assert(body.pressure >= 0 && body.pressure <= MAX_PRESSURE);
  assert(body.mass >= DRY_MASS);
  for (const throttle of body.throttles) assert(throttle >= 0 && throttle <= 1);
}
function run(body, frames, input = {}, settings = {}, controller = null, throttles = []) {
  for (let i = 0; i < frames; i++) {
    const out = controller ? controller.update(STEP, body, input, settings) : throttles;
    body.step(STEP, input, out, settings);
    finite(body);
  }
  return body;
}
function airborne(height = 1000) {
  const body = new VehiclePhysics();
  body.p.y = height;
  body.mode = 'FLIGHT';
  body.flightArmed = true;
  return body;
}
// Start just inside the FIRST wheel contact, preserving a prescribed impact
// velocity/attitude. Unlike a drop from arbitrary COM height this does not add
// gravity's acceleration before the threshold under test is sampled.
function atContact({speed = 0, tilt = 0, height} = {}, body = airborne()) {
  body.q.setFromAxisAngle(new Vector3(1, 0, 0), tilt * DEG);
  const up = new Vector3(0, 1, 0).applyQuaternion(body.q);
  body.p.y = height ?? Math.max(...body.wheels.map(w =>
    (.5 + .445) * up.y - w.anchor.clone().applyQuaternion(body.q).y)) - 1e-5;
  body.v.y = -speed;
  return body;
}
function landing(options, settings = {}) {
  const body = atContact(options);
  run(body, 40, {}, settings);
  assert(body.events.length > 0, 'Touchdown must produce a landing event');
  return {body, event: body.events[0]};
}
const commands = [
  // Pilot-requested roll inversion: Q commands -X, E commands +X.
  ['rollLeft', 'x', -1], ['rollRight', 'x', 1],
  // Flight yaw is unchanged by the ground steering inversion: D +Y, A -Y.
  ['right', 'y', 1], ['left', 'y', -1],
  ['back', 'z', 1], ['forward', 'z', -1]
];

test('SI constants, gas equation, nozzle ratings and geometry', () => {
  assert.equal(G0, 9.80665);
  assert.equal(DRY_MASS, 1500);
  assert.equal(TANK_VOLUME, .6);
  assert.equal(TANK_TEMPERATURE, 293.15);
  assert.equal(MAX_PRESSURE, 80e6);
  assert.equal(STEP, 1 / 60);
  near(INITIAL_GAS, MAX_PRESSURE * .6 / (1.38 * 287.05 * 293.15), 1e-10, 'gas equation');
  near(INITIAL_GAS, 413, 1, 'approximately 413 kg, not an assumed 600 kg');
  assert.deepEqual(MAX_THRUST, {rear: 20000, lift: 20000, yaw: 5000});
  assert.deepEqual(THRUSTERS.map(t => t.id), ['R1', 'R2', 'R3', 'R4', 'L1', 'L2', 'L3', 'L4', 'Y1', 'Y2']);
  for (const t of THRUSTERS) near(Math.hypot(...t.exhaust), 1, 1e-12, t.id);
  assert.equal(THRUSTERS.reduce((sum, t) => sum + rating(t), 0), 170000);
  const body = new VehiclePhysics();
  near(body.mass, 1500 + INITIAL_GAS, 1e-10);
  assert.equal(body.wheels.length, 4);
});

test('unpowered rest remains stable for ten seconds', () => {
  const body = new VehiclePhysics(), start = body.p.clone();
  run(body, 600);
  assert(body.p.distanceTo(start) < .02, 'No lateral drift, bounce or sinking at rest');
  assert(body.v.length() < 1e-6);
  assert(body.omega.length() < 1e-6);
  assert(body.getAttitude().tilt < .1 * DEG);
  near(body.g, 1, .001);
  assert(body.wheels.every(w => w.contact && w.force > 0));
  assert.equal(body.mode, 'GROUND');
  assert.equal(body.crashed, false);
  assert.equal(body.events.length, 0);
  assert.equal(body.gas, INITIAL_GAS);
});

test('motor accelerates, brakes through zero, and reverses without using gas', () => {
  const body = new VehiclePhysics();
  run(body, 120, {forward: true});
  assert(body.v.x > 7 && body.p.x > -32, 'Rear-wheel forward propulsion');
  const forwardSpeed = body.v.x;
  run(body, 30, {back: true});
  assert(body.v.x >= 0 && body.v.x < forwardSpeed * .6, 'Back input initially brakes');
  run(body, 150, {back: true});
  assert(body.v.x < -3, 'Back input reverses after stopping');
  assert.equal(body.gas, INITIAL_GAS);
  assert.equal(body.crashed, false);
});

for (const [drive, direction] of [['forward', 1], ['back', -1]]) {
  for (const [turn, sign] of [['right', -1], ['left', 1]]) {
    test(`Ackermann ${turn} steering has correct yaw sign while ${drive}`, () => {
      const body = new VehiclePhysics();
      run(body, 90, {[drive]: true, [turn]: true});
      assert(body.steer * sign > .45);
      assert(body.omega.y * sign * direction > .4, 'Reverse must reverse yaw response');
      // COM displacement can initially swing outward in reverse; use the
      // established velocity and body yaw, not the accumulated transient path.
      assert(body.v.z * sign < -.5, 'Established turn travels opposite its internal steering sign along world Z');
      const front = body.wheels.filter(w => w.x > 0);
      const inside = front.find(w => Math.sign(w.z) === -sign);
      const outside = front.find(w => Math.sign(w.z) === sign);
      assert(Math.abs(inside.steer) > Math.abs(outside.steer), 'Inside wheel turns more');
      assert(body.wheels.filter(w => w.x < 0).every(w => w.steer === 0));
      assert.equal(body.crashed, false);
    });
  }
}

for (const [index, nozzle] of THRUSTERS.entries()) {
  test(`${nozzle.id}: actual force, r × F torque and propellant impulse at full/half pressure`, () => {
    for (const fraction of [1, .5]) {
      const body = airborne(), dt = 1e-5, throttle = zero();
      body.gas = INITIAL_GAS * fraction ** (1 / 1.25);
      body.pressure = MAX_PRESSURE * fraction;
      const initialMass = body.mass, initialGas = body.gas;
      throttle[index] = 1;
      const force = new Vector3(...nozzle.exhaust).multiplyScalar(-rating(nozzle) * fraction);
      const torque = new Vector3(...nozzle.position).sub(body.comLocal).cross(force);
      body.step(dt, {}, throttle);
      // Tiny real timesteps isolate each nozzle without removing gravity, drag,
      // pressure loss or quaternion integration from the implementation.
      for (const axis of ['x', 'y', 'z']) {
        const gravity = axis === 'y' ? -G0 * dt : 0;
        near(body.v[axis] - gravity, force[axis] / initialMass * dt, 2e-9, `${nozzle.id} force ${axis}`);
        const inertia = initialMass * {x: .52, y: 2.1, z: 2.05}[axis];
        near(body.omega[axis], torque[axis] / inertia * dt, 2e-9, `${nozzle.id} torque ${axis}`);
      }
      near(initialGas - body.gas, force.length() * dt / (G0 * ISP), 2e-9, 'impulse / exhaust velocity');
      near(body.mass, DRY_MASS + body.gas, 1e-10);
      near(body.pressure, MAX_PRESSURE * (body.gas / INITIAL_GAS) ** 1.25, 1e-7);
      finite(body);
    }
  });
}

test('blowdown conserves gas/impulse and reduces force as pressure falls', () => {
  const body = airborne(10000), throttle = Array(10).fill(1);
  let gas = INITIAL_GAS, lastPressure = MAX_PRESSURE, expectedThrust = 0;
  for (let frame = 0; frame < 120; frame++) {
    // Independent scalar mass-flow oracle; there are four solver microsteps.
    for (let sub = 0; sub < 4; sub++) {
      const force = 170000 * (gas / INITIAL_GAS) ** 1.25;
      gas = Math.max(0, gas - force / (G0 * ISP) * STEP / 4);
      expectedThrust = force / 170000;
    }
    body.step(STEP, {}, throttle);
    finite(body);
    near(body.gas, gas, 1e-9, 'integrated gas loss');
    near(body.thrust, expectedThrust, 1e-12, 'reported force');
    assert(body.pressure < lastPressure);
    lastPressure = body.pressure;
  }
  assert(body.gas < INITIAL_GAS * .4 && body.gas > 0);
  assert(body.thrust < .4);
});

test('empty tank is ballistic; long burns never create negative mass or pressure', () => {
  const empty = airborne();
  empty.gas = 0;
  empty.pressure = 0;
  const initialHeight = empty.p.y;
  run(empty, 60, {}, {}, null, Array(10).fill(1));
  assert.equal(empty.thrust, 0);
  assert.equal(empty.gas, 0);
  assert.equal(empty.pressure, 0);
  assert.equal(empty.mass, DRY_MASS);
  assert(empty.p.y < initialHeight - 4 && empty.v.y < -9);
  // Stay far from ground so collision/safety resets cannot refill the tank.
  const burn = airborne(1e6);
  run(burn, 3600, {}, {}, null, Array(10).fill(1));
  assert.equal(burn.events.length, 0);
  assert(burn.gas < 1 && burn.gas >= 0);
});

test('infinite gas restores and holds pressure/mass; refill and reset preserve their contracts', () => {
  const body = airborne();
  run(body, 60, {}, {}, null, Array(10).fill(1));
  assert(body.gas < INITIAL_GAS);
  run(body, 120, {}, {infinite: true}, null, Array(10).fill(1));
  assert.equal(body.gas, INITIAL_GAS);
  assert.equal(body.pressure, MAX_PRESSURE);
  assert.equal(body.thrust, 1);
  run(body, 1, {}, {}, null, Array(10).fill(1));
  assert(body.gas < INITIAL_GAS);
  const p = body.p.clone(), v = body.v.clone(), q = body.q.clone(), omega = body.omega.clone();
  body.refill();
  assert.equal(body.gas, INITIAL_GAS);
  assert.equal(body.pressure, MAX_PRESSURE);
  assert(body.p.equals(p) && body.v.equals(v) && body.q.equals(q) && body.omega.equals(omega));
  body.crashed = true;
  body.events.push({grade: 'CRASH'});
  body.reset();
  assert.deepEqual(body.p.toArray(), [-38, .65, 5.5]);
  assert.equal(body.crashed, false);
  assert.equal(body.mode, 'GROUND');
  assert.equal(body.pending, null);
  assert.equal(body.events.length, 0);
  assert(body.throttles.every(t => t === 0));
  finite(body);
});

for (const speed of [0, 8]) {
  for (const phase of ['pending', 'reported']) {
    test(`reset clears real ${phase} ${speed === 0 ? 'landing' : 'crash'} state without delayed events`, () => {
      const body = atContact({speed});
      run(body, phase === 'pending' ? 1 : 40);
      assert.equal(body.crashed, speed > 6);
      assert.equal(body.flightArmed, false);
      if (phase === 'pending') {
        assert(body.pending && body.pending.time > 0, 'Real contact must start the observation window');
        near(body.pending.verticalSpeed, -speed, 1e-12);
        if (speed > 6) assert.match(body.pending.reason, /Vertical impact exceeds 6 m\/s/);
        assert.equal(body.events.length, 0);
      } else {
        assert.equal(body.pending, null);
        assert.equal(body.events.length, 1);
        assert.equal(body.events[0].grade, speed > 6 ? 'CRASH' : 'S');
      }
      body.reset();
      assert.equal(body.pending, null);
      assert.equal(body.crashed, false);
      assert.equal(body.events.length, 0);
      assert.equal(body.flightArmed, false);
      assert.equal(body.mode, 'GROUND');
      assert.deepEqual(body.p.toArray(), [-38, .65, 5.5]);
      finite(body);
      run(body, 40);
      assert.equal(body.pending, null);
      assert.equal(body.crashed, false);
      assert.equal(body.events.length, 0, 'Reset must cancel the old landing report');
    });
  }
}

test('flight engages after approximately .15 s without contact and touchdown returns to ground', () => {
  const body = new VehiclePhysics();
  body.p.y = 2;
  run(body, 8);
  assert.equal(body.mode, 'GROUND');
  assert.equal(body.flightArmed, false);
  run(body, 2);
  assert.equal(body.mode, 'FLIGHT');
  assert.equal(body.flightArmed, true);
  assert(body.airTime >= .15 && body.airTime <= .15 + 2 * STEP);
  let touched = false;
  for (let i = 0; i < 120; i++) {
    run(body, 1);
    if (body.pending) {
      touched = true;
      assert.equal(body.mode, 'GROUND');
      assert.equal(body.flightArmed, false);
      assert.equal(body.airTime, 0);
      assert.equal(body.events.length, 0, 'Grade must wait for the load observation window');
      break;
    }
  }
  assert(touched, 'Actual ballistic fall must contact the plane');
  run(body, 15);
  assert.equal(body.events.length, 1);
  assert.equal(body.pending, null);
});

test('ground controller only requests boost/lift; flight boost/lift move the real body', () => {
  const controller = new FlightController(), ground = new VehiclePhysics();
  for (const [key] of commands) assert(controller.update(STEP, ground, {[key]: true}).every(t => t === 0));
  assert.deepEqual(Array.from(controller.update(STEP, ground, {boost: true, lift: true})), [1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
  for (const key of ['boost', 'lift']) {
    const body = airborne();
    run(body, 10, {[key]: true}, {}, new FlightController());
    assert(key === 'boost' ? body.v.x > 5 : body.v.y > 4);
    assert(body.gas < INITIAL_GAS);
  }
});

for (const [key, axis, sign] of commands) {
  test(`direct and assisted flight ${key} preserve body torque sign (${axis}: ${sign})`, () => {
    for (const assisted of [false, true]) {
      const body = airborne(), controller = new FlightController();
      const out = controller.update(STEP, body, {[key]: true}, {assisted});
      assert(out.some(t => t > 0));
      body.step(STEP, {[key]: true}, out);
      assert(body.omega[axis] * sign > .01, `${key}, assisted=${assisted}: ${body.omega.toArray()}`);
      for (const other of ['x', 'y', 'z'].filter(a => a !== axis)) {
        assert(Math.abs(body.omega[other]) < Math.abs(body.omega[axis]) * .03 + 1e-6, 'Allocator cancels parasitic torque');
      }
    }
  });
  test(`assisted ${key} tracks 90 deg/s and stabilizes after release`, () => {
    const body = airborne(), controller = new FlightController();
    run(body, 180, {[key]: true}, {assisted: true, rate: 90, infinite: true}, controller);
    near(body.omega[axis], sign * Math.PI / 2, .1, 'commanded angular rate');
    run(body, 240, {}, {assisted: true, rate: 90, infinite: true}, controller);
    assert(body.omega.length() < .08, `Release should stabilize body rates: ${body.omega.toArray()}`);
  });
}

for (const axis of ['x', 'y', 'z']) {
  test(`assisted neutral input damps existing ${axis} rotation`, () => {
    const body = airborne();
    body.omega[axis] = 1;
    run(body, 180, {}, {assisted: true, infinite: true}, new FlightController());
    assert(body.omega.length() < .05);
  });
}

test('opposing inputs cancel and zero pressure disables flight control', () => {
  const controller = new FlightController(), body = airborne();
  const both = {forward: true, back: true, left: true, right: true, rollLeft: true, rollRight: true};
  for (const assisted of [false, true]) {
    assert(controller.update(STEP, body, both, {assisted}).every(t => t === 0));
  }
  body.gas = 0;
  body.pressure = 0;
  assert(controller.update(STEP, body, {...both, boost: true, lift: true}, {assisted: true}).every(t => t === 0));
  controller.reset();
  assert(controller.throttles.every(t => t === 0));
  assert.equal(controller.assistActive, false);
});

for (const [speed, grade] of [[1.4999, 'S'], [1.5, 'A'], [2.9999, 'A'], [3, 'B'], [6, 'B'], [6.0001, 'CRASH']]) {
  test(`touchdown at ${speed} m/s is ${grade} (strict speed thresholds)`, () => {
    const {body, event} = landing({speed});
    near(event.verticalSpeed, -speed, 1e-12);
    assert.equal(event.grade, grade);
    assert.equal(body.crashed, grade === 'CRASH');
    if (grade === 'CRASH') assert.match(event.reason, /Vertical impact exceeds 6 m\/s/);
  });
}
for (const [tilt, grade] of [[4.9999, 'S'], [5, 'A'], [5.0001, 'A'], [14.9999, 'A'], [15, 'B'], [15.0001, 'B'], [44.9999, 'B'], [45, 'B'], [45.0001, 'CRASH']]) {
  test(`touchdown at ${tilt} degrees is ${grade} (strict attitude thresholds)`, () => {
    const {body, event} = landing({tilt});
    near(event.tilt / DEG, tilt, 1e-10);
    assert.equal(event.grade, grade);
    assert.equal(body.crashed, grade === 'CRASH');
    if (grade === 'CRASH') assert.match(event.reason, /Contact attitude exceeds 45/);
  });
}

for (const tilt of [44.9999, 45, 45.0001, 60]) {
  for (const invincible of [false, true]) {
    test(`unarmed ground contact at ${tilt} degrees respects strict rollover threshold (invincible=${invincible})`, () => {
      const body = atContact({tilt});
      body.mode = 'GROUND';
      body.flightArmed = false;
      assert.equal(body.pending, null);
      assert.equal(body.events.length, 0);
      near(body.getAttitude().tilt / DEG, tilt, 1e-10);
      run(body, 1, {}, {invincible});
      assert(body.wheels.some(w => w.contact), 'Use actual wheel contact, not an airborne attitude');
      assert.equal(body.mode, 'GROUND');
      assert.equal(body.flightArmed, false);
      assert.equal(body.pending, null, 'Ground rollover must not require a landing window');
      const crashed = tilt > 45 && !invincible;
      assert.equal(body.crashed, crashed);
      assert.equal(body.events.length, crashed ? 1 : 0);
      if (crashed) {
        const event = body.events[0];
        assert.equal(event.grade, 'CRASH');
        assert.match(event.reason, /Contact attitude exceeds 45/);
        near(event.tilt / DEG, tilt, 1e-10, 'Crash records the contact attitude');
        run(body, 5);
        assert.equal(body.events.length, 1, 'Persistent rollover must not duplicate crash events');
      }
    });
  }
}

test('rollover after a completed normal landing creates a new crash event', () => {
  const {body, event} = landing({speed: 0});
  assert.equal(event.grade, 'S');
  assert.equal(body.crashed, false);
  assert.equal(body.mode, 'GROUND');
  assert.equal(body.flightArmed, false);
  assert.equal(body.pending, null, 'The normal landing report window has finished');
  assert.equal(body.events.length, 1);
  const normalEvent = {...event};
  body.v.set(0, 0, 0);
  body.omega.set(0, 0, 0);
  atContact({tilt: 60}, body);
  run(body, 1);
  assert(body.wheels.some(w => w.contact));
  assert.equal(body.flightArmed, false);
  assert.equal(body.pending, null);
  assert.equal(body.crashed, true);
  assert.equal(body.events.length, 2);
  assert.deepEqual(body.events[0], normalEvent, 'Later damage must preserve the completed landing report');
  assert.equal(body.events[1].grade, 'CRASH');
  assert.match(body.events[1].reason, /Contact attitude exceeds 45/);
  near(body.events[1].tilt / DEG, 60, 1e-10);
  run(body, 5);
  assert.equal(body.events.length, 2);
});

test('S landing requires peak load below 2 G, not only low speed and tilt', () => {
  const {event} = landing({speed: 1.4, height: .65});
  assert(-event.verticalSpeed < 1.5 && event.tilt < 5 * DEG);
  assert(event.g > 2);
  assert.equal(event.grade, 'A');
});

test('bottom-out above 6 G crashes independently of speed/tilt; load alone does not', () => {
  const hard = landing({speed: 4, height: .3});
  assert.equal(hard.event.stopHit, true);
  assert(hard.event.g > 6 && -hard.event.verticalSpeed <= 6);
  assert.equal(hard.event.grade, 'CRASH');
  assert.match(hard.event.reason, /Suspension bottom-out exceeds 6 G/);
  const loadOnly = landing({speed: 6});
  assert(loadOnly.event.g > 6);
  assert.equal(loadOnly.event.stopHit, false);
  assert.equal(loadOnly.event.grade, 'B');
});

for (const [label, options] of [['speed', {speed: 8}], ['tilt', {tilt: 60}], ['bottom-out', {speed: 4, height: .3}]]) {
  test(`invincible suppresses ${label} crash without suppressing contact/events`, () => {
    const {body, event} = landing(options, {invincible: true});
    assert.equal(body.crashed, false);
    assert.notEqual(event.grade, 'CRASH');
    assert.match(event.reason, /Invincible/);
    assert.equal(body.mode, 'GROUND');
  });
}

test('crashed body refuses motor and nozzle inputs; refill does not repair a crash', () => {
  const {body} = landing({speed: 8});
  run(body, 120);
  body.refill();
  assert.equal(body.crashed, true);
  const x = body.p.x;
  run(body, 60, {forward: true, boost: true, lift: true}, {}, new FlightController());
  assert(body.throttles.every(t => t === 0));
  assert.equal(body.thrust, 0);
  assert.equal(body.gas, INITIAL_GAS);
  assert(Math.abs(body.p.x - x) < .05);
});

test('assisted landing pulse brakes an actual descent and shuts off after touchdown', () => {
  const body = airborne(5), controller = new FlightController();
  body.v.y = -3;
  run(body, 1); // Compute actual wheel altitude before controller observation.
  const altitude = body.altitude, velocity = body.v.y;
  const out = controller.update(STEP, body, {}, {assisted: true});
  assert(altitude > 0 && altitude < 8);
  assert.equal(controller.assistActive, true);
  assert(out.slice(4, 8).every(t => t > 0), 'Automatic landing lift pulse');
  assert(out.slice(0, 4).every(t => t === 0) && out.slice(8).every(t => t === 0));
  const sumLift = out.slice(4, 8).reduce((sum, t) => sum + t * MAX_THRUST.lift, 0);
  assert(sumLift > body.mass * G0, 'Pulse must provide net upward acceleration');
  body.step(STEP, {}, out);
  assert(body.v.y > velocity, 'Pulse must actually reduce descent speed');
  let activeFrames = 1;
  for (let i = 0; i < 240; i++) {
    run(body, 1, {}, {assisted: true}, controller);
    if (controller.assistActive) activeFrames++;
    if (body.events.length) break;
  }
  assert(activeFrames > 5);
  assert.equal(body.events[0]?.grade, 'S');
  assert.equal(body.mode, 'GROUND');
  assert.equal(body.crashed, false);
  assert(body.gas < INITIAL_GAS);
  assert(controller.update(STEP, body, {}, {assisted: true}).every(t => t === 0));
  assert.equal(controller.assistActive, false);
  const unassisted = airborne(5);
  unassisted.v.y = -3;
  run(unassisted, 180, {}, {}, new FlightController());
  assert.equal(unassisted.events[0]?.grade, 'CRASH', 'Same descent without assist is unrecoverable');
});

test('landing assist is gated by clearance, descent, attitude and assisted setting', () => {
  const controller = new FlightController();
  for (const [height, vy, tilt, assisted] of [[12, -3, 0, true], [5, 1, 0, true], [5, -3, 60, true], [5, -3, 0, false]]) {
    const body = airborne(height);
    body.q.setFromAxisAngle(new Vector3(1, 0, 0), tilt * DEG);
    body.v.y = vy;
    run(body, 1);
    const out = controller.update(STEP, body, {}, {assisted});
    assert.equal(controller.assistActive, false, JSON.stringify({height, vy, tilt, assisted}));
    assert(out.every(t => t === 0));
  }
});

test('invalid dt is ignored, long dt is clamped and throttle values are sanitized', () => {
  const body = new VehiclePhysics(), before = body.snapshot(), position = body.p.clone();
  for (const dt of [0, -1, NaN, Infinity]) body.step(dt, {forward: true}, Array(10).fill(1));
  assert.deepEqual(body.snapshot(), before);
  assert(body.p.equals(position));
  const a = airborne(), b = airborne();
  a.step(1, {}, Array(10).fill(1));
  b.step(STEP, {}, Array(10).fill(1));
  assert(a.p.equals(b.p) && a.v.equals(b.v));
  assert.equal(a.gas, b.gas);
  body.step(STEP, {}, [NaN, Infinity, -1, 2, undefined, .5]);
  assert.deepEqual(Array.from(body.throttles), [0, 0, 0, 1, 0, .5, 0, 0, 0, 0]);
  finite(body);
});

function memoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [['roadster.keybinds.v1', initial]]);
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

test('Keybinds exposes exactly 12 default actions and their labels/contexts', () => {
  const expected = {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD',
    pitchDown: 'KeyW', pitchUp: 'KeyS', rollLeft: 'KeyQ', rollRight: 'KeyE',
    lift: 'Space', boost: 'ShiftLeft', reset: 'KeyR', camera: 'KeyC'
  };
  const bindings = new Keybinds(null);
  assert.deepEqual(DEFAULT_BINDINGS, expected);
  assert.deepEqual(bindings.bindings, expected);
  assert.equal(ACTIONS.length, 12);
  assert.deepEqual(ACTIONS.map(a => a.id), Object.keys(expected));
  assert.deepEqual(ACTIONS.map(a => [a.label, a.context]), [
    ['Forward', 'Ground'], ['Reverse', 'Ground'], ['Steer / yaw left', 'Shared'],
    ['Steer / yaw right', 'Shared'], ['Pitch down', 'Flight'], ['Pitch up', 'Flight'],
    ['Roll left', 'Flight'], ['Roll right', 'Flight'], ['Lift', 'Shared'],
    ['Boost', 'Shared'], ['Reset', 'Shared'], ['Camera', 'Shared']
  ]);
  for (const [action, code] of Object.entries(expected)) assert(bindings.matches(action, code));
  const neutral = {
    forward: false, back: false, left: false, right: false,
    rollLeft: false, rollRight: false, lift: false, boost: false
  };
  for (const keys of [undefined, null, new Set(), [], {}]) {
    assert.deepEqual(bindings.input(keys, 'GROUND'), neutral);
    assert.deepEqual(bindings.input(keys, 'FLIGHT'), neutral);
  }
});

test('formatKey supplies readable letters, numbers, modifiers, arrows and punctuation', () => {
  for (const [code, label] of [
    ['KeyW', 'W'], ['Digit7', '7'], ['Space', 'Space'], ['F12', 'F12'],
    ['ShiftLeft', 'Shift'], ['ShiftRight', 'Shift'], ['ControlRight', 'Ctrl'],
    ['AltRight', 'Alt'], ['MetaRight', 'Meta'], ['ArrowUp', '↑'], ['ArrowDown', '↓'],
    ['ArrowLeft', '←'], ['ArrowRight', '→'], ['Backquote', '`'], ['Backslash', '\\'],
    ['BracketLeft', '['], ['BracketRight', ']'], ['Comma', ','], ['Equal', '='],
    ['Minus', '-'], ['Period', '.'], ['Quote', "'"], ['Semicolon', ';'], ['Slash', '/'],
    ['PageDown', 'Page Down'], ['NumpadEnter', 'Numpad Enter'], ['Numpad0', 'Numpad 0']
  ]) assert.equal(formatKey(code), label, code);
  for (const code of [null, undefined, 1, {}, '', 'Escape', 'Tab', 'KeyAA', '__proto__']) {
    assert.equal(formatKey(code), '');
  }
});

test('custom ground drive and flight pitch bindings remain independent', () => {
  const bindings = new Keybinds(null);
  assert(bindings.set('forward', 'ArrowUp'));
  assert(bindings.set('back', 'ArrowDown'));
  for (const keys of [new Set(['ArrowUp']), ['ArrowUp'], {ArrowUp: true}]) {
    assert.equal(bindings.input(keys, 'GROUND').forward, true);
    assert.equal(bindings.input(keys, 'FLIGHT').forward, false);
  }
  assert.equal(bindings.input(['KeyW'], 'GROUND').forward, false);
  assert.equal(bindings.input(['KeyW'], 'FLIGHT').forward, true);
  assert.equal(bindings.input(['ArrowDown'], 'GROUND').back, true);
  assert.equal(bindings.input(['ArrowDown'], 'FLIGHT').back, false);
  assert.equal(bindings.input(['KeyS'], 'FLIGHT').back, true);
  assert(bindings.set('pitchDown', 'KeyI'));
  assert(bindings.set('pitchUp', 'KeyK'));
  assert.equal(bindings.input(['KeyI'], 'FLIGHT').forward, true);
  assert.equal(bindings.input(['KeyI'], 'GROUND').forward, false);
  assert.equal(bindings.input(['KeyK'], 'FLIGHT').back, true);
  assert.equal(bindings.input(['KeyK'], 'GROUND').back, false);
  assert.equal(bindings.input(['KeyW', 'KeyS'], 'FLIGHT').forward, false);
  assert.equal(bindings.input(['KeyW', 'KeyS'], 'FLIGHT').back, false);
  assert.equal(bindings.bindings.forward, 'ArrowUp');
  assert.equal(bindings.bindings.back, 'ArrowDown');
  assert.equal(bindings.input(Object.create({ArrowUp: true}), 'GROUND').forward, false);
  assert.equal(bindings.input({ArrowUp: false}, 'GROUND').forward, false);
});

test('lift and steering are shared across modes and either Shift side triggers boost', () => {
  const bindings = new Keybinds(null);
  for (const mode of ['GROUND', 'FLIGHT']) {
    const input = bindings.input(['Space', 'KeyA', 'KeyD'], mode);
    assert.equal(input.lift, true);
    assert.equal(input.left, true);
    assert.equal(input.right, true);
    for (const code of ['ShiftLeft', 'ShiftRight']) {
      assert(bindings.matches('boost', code));
      for (const keys of [new Set([code]), [code], {[code]: true}]) {
        assert.equal(bindings.input(keys, mode).boost, true);
      }
    }
  }
  assert(bindings.set('lift', 'ShiftRight'));
  assert.equal(bindings.bindings.lift, 'ShiftLeft');
  for (const mode of ['GROUND', 'FLIGHT']) {
    for (const code of ['ShiftLeft', 'ShiftRight']) {
      assert.equal(bindings.input([code], mode).lift, true);
    }
    assert.equal(bindings.input(['Space'], mode).lift, false);
  }
  for (const modifier of ['Control', 'Alt', 'Meta']) {
    assert(bindings.set('boost', `${modifier}Right`));
    assert.equal(bindings.bindings.boost, `${modifier}Left`);
    assert(bindings.matches('boost', `${modifier}Right`));
    assert.equal(bindings.input([`${modifier}Right`], 'FLIGHT').boost, true);
    assert.equal(bindings.input([`${modifier}Left`], 'GROUND').boost, true);
  }
});

test('Keybinds persists a versioned snapshot and reloads normalized custom assignments', () => {
  const storage = memoryStorage(), bindings = new Keybinds(storage);
  assert(bindings.set('forward', 'ArrowUp'));
  assert(bindings.set('pitchDown', 'KeyI'));
  assert(bindings.set('lift', 'ControlRight'));
  const saved = JSON.parse(storage.getItem('roadster.keybinds.v1'));
  assert.deepEqual(saved, {version: 1, bindings: bindings.bindings, inversions: DEFAULT_INVERSIONS});
  const reloaded = new Keybinds(storage);
  assert.deepEqual(reloaded.bindings, bindings.bindings);
  assert.equal(reloaded.input(['ArrowUp'], 'GROUND').forward, true);
  assert.equal(reloaded.input(['KeyI'], 'FLIGHT').forward, true);
  assert(reloaded.matches('lift', 'ControlRight'));
  reloaded.reset();
  assert.deepEqual(new Keybinds(storage).bindings, DEFAULT_BINDINGS);
});

test('Keybinds ignores malformed storage and unsupported versions/shapes', () => {
  for (const raw of [
    null, '', '{', 'undefined', 'null', 'true', '42', '[]', '{}',
    '{"bindings":{"forward":"KeyI"}}',
    ...[0, 2, '1', null].map(version => JSON.stringify({version, bindings: {forward: 'KeyI'}})),
    ...[null, false, 'KeyI', [], 42].map(bindings => JSON.stringify({version: 1, bindings}))
  ]) {
    assert.deepEqual(new Keybinds(memoryStorage(raw)).bindings, DEFAULT_BINDINGS, String(raw));
  }
  const saved = JSON.stringify({version: 1, bindings: JSON.parse(
    '{"forward":"ArrowUp","boost":"ShiftRight","back":"Escape","left":"Tab",' +
    '"right":42,"lift":null,"pitchDown":"NotAKey","unknown":"KeyZ",' +
    '"__proto__":"KeyX","constructor":"KeyY","toString":"KeyZ"}'
  )});
  const bindings = new Keybinds(memoryStorage(saved));
  assert.deepEqual(bindings.bindings, {...DEFAULT_BINDINGS, forward: 'ArrowUp'});
  assert.equal(Object.getPrototypeOf(bindings.bindings), Object.prototype);
});

test('Keybinds falls back to in-memory state when storage getItem/setItem throws', () => {
  let reads = 0, writes = 0;
  const bindings = new Keybinds({
    getItem() { reads++; throw new Error('Storage blocked'); },
    setItem() { writes++; throw new Error('Storage full'); }
  });
  assert.equal(reads, 1);
  assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
  let notifications = 0;
  bindings.subscribe(() => notifications++);
  assert(bindings.set('forward', 'KeyI'));
  assert.equal(bindings.input(['KeyI'], 'GROUND').forward, true);
  bindings.reset();
  assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
  assert.equal(writes, 2);
  assert.equal(notifications, 2);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true, get() { throw new Error('Access denied'); }
    });
    const fallback = new Keybinds();
    assert.deepEqual(fallback.bindings, DEFAULT_BINDINGS);
    assert(fallback.set('forward', 'KeyI'));
    assert(fallback.matches('forward', 'KeyI'));
    fallback.reset();
    assert.deepEqual(fallback.bindings, DEFAULT_BINDINGS);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('Keybinds rejects reserved/invalid codes and unknown/prototype action keys without side effects', () => {
  let writes = 0, notifications = 0;
  const bindings = new Keybinds({getItem: () => null, setItem: () => writes++});
  bindings.subscribe(() => notifications++);
  for (const code of [
    'Escape', 'Tab', '', 'KeyAA', 'keyW', 'Keyw', 'Key1', 'Digit10', 'F0', 'F25',
    'Shift', 'ArrowNorth', 'Spacebar', ' KeyW', 'KeyW\n', '__proto__', 'constructor',
    'toString', null, undefined, 1, {}, ['KeyW']
  ]) {
    assert.equal(bindings.set('forward', code), false, String(code));
    assert.equal(bindings.matches('forward', code), false);
  }
  for (const action of ['unknown', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '', null, undefined, 1, {}]) {
    assert.equal(bindings.set(action, 'KeyI'), false);
    assert.equal(bindings.matches(action, 'KeyI'), false);
  }
  assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
  assert.equal(writes, 0);
  assert.equal(notifications, 0);
});

test('Keybinds snapshots and subscriber snapshots are independent copies', () => {
  const bindings = new Keybinds(null), snapshot = bindings.bindings;
  snapshot.forward = 'KeyZ';
  delete snapshot.back;
  snapshot.unknown = 'KeyX';
  assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
  assert.notEqual(bindings.bindings, bindings.bindings);
  bindings.subscribe(value => { value.forward = 'KeyZ'; });
  let observed;
  bindings.subscribe(value => { observed = value; });
  assert(bindings.set('forward', 'KeyI'));
  assert.equal(observed.forward, 'KeyI');
  observed.forward = 'KeyX';
  assert.equal(bindings.bindings.forward, 'KeyI');
  assert.equal(DEFAULT_BINDINGS.forward, 'KeyW');
});

test('Keybinds subscriptions notify actual changes, unsubscribe, and reset to defaults', () => {
  const bindings = new Keybinds(null), snapshots = [];
  assert.throws(() => bindings.subscribe(null), TypeError);
  bindings.subscribe(() => { throw new Error('Subscriber failure'); });
  const unsubscribe = bindings.subscribe(value => snapshots.push(value));
  assert.equal(snapshots.length, 0);
  assert(bindings.set('forward', 'KeyI'));
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].forward, 'KeyI');
  assert(bindings.set('forward', 'KeyI'));
  assert.equal(bindings.set('forward', 'Escape'), false);
  assert.equal(snapshots.length, 1);
  bindings.reset();
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots[1], DEFAULT_BINDINGS);
  assert.equal(snapshots[0].forward, 'KeyI', 'Earlier notifications remain snapshots');
  bindings.reset();
  assert.equal(snapshots.length, 2, 'Resetting defaults is not a change');
  unsubscribe();
  unsubscribe();
  assert(bindings.set('back', 'KeyK'));
  bindings.reset();
  assert.equal(snapshots.length, 2);
  assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
});

test('Keybinds allows duplicate valid assignments and activates every matching action', () => {
  const bindings = new Keybinds(null);
  for (const action of Object.keys(DEFAULT_BINDINGS)) assert(bindings.set(action, 'KeyZ'));
  assert.deepEqual(bindings.bindings, Object.fromEntries(ACTIONS.map(a => [a.id, 'KeyZ'])));
  for (const mode of ['GROUND', 'FLIGHT']) {
    assert(Object.values(bindings.input(['KeyZ'], mode)).every(value => value === true));
    assert(Object.values(bindings.input(['KeyW'], mode)).every(value => value === false));
  }
  assert(bindings.matches('reset', 'KeyZ'));
  assert(bindings.matches('camera', 'KeyZ'));
});

// Compose heading first so the prescribed pitch/roll are unchanged by world yaw.
function landingBody({heading = 0, roll = 0, pitch = 0} = {}) {
  const body = airborne(7);
  body.q.setFromAxisAngle(new Vector3(0, 1, 0), heading * DEG)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), pitch * DEG))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), roll * DEG));
  body.v.y = -.2;
  body.step(1e-5); // Obtain real wheel clearance without an appreciable attitude change.
  return body;
}
function nozzleTorque(body, throttles) {
  const torque = new Vector3();
  for (const [i, nozzle] of THRUSTERS.entries()) {
    const force = new Vector3(...nozzle.exhaust)
      .multiplyScalar(-rating(nozzle) * throttles[i] * body.pressure / MAX_PRESSURE);
    torque.add(new Vector3(...nozzle.position).sub(body.comLocal).cross(force));
  }
  return torque;
}

for (const [angle, axis] of [['roll', 'x'], ['pitch', 'z']]) {
  test(`LANDING neutral ${angle} produces real restoring torque at every heading`, () => {
    for (const heading of [0, 45, 90, 180, 270]) {
      for (const tilt of [-20, 20]) {
        const body = landingBody({heading, [angle]: tilt}), controller = new FlightController();
        near(body.getAttitude()[angle], tilt * DEG, 1e-12);
        const out = controller.update(STEP, body, {}, {assisted: true});
        assert.equal(controller.mode, 'LANDING');
        assert.equal(controller.landingActive, true);
        assert.deepEqual(controller.targetAngles, {roll: 0, pitch: 0});
        near(controller.targetRates[axis === 'x' ? 0 : 2], -tilt * DEG * 3 / 12, 1e-12);
        const torque = nozzleTorque(body, out), initialMass = body.mass, dt = 1e-5;
        assert(torque[axis] * tilt < -100, `${angle}, heading=${heading}: ${torque.toArray()}`);
        body.step(dt, {}, out);
        assert(body.omega[axis] * tilt < 0, 'The actual body must turn toward level');
        for (const component of ['x', 'y', 'z']) {
          near(body.omega[component] * initialMass * {x: .52, y: 2.1, z: 2.05}[component] / dt,
            torque[component], .05, `actual torque ${component}, heading=${heading}`);
        }
        finite(body);
      }
    }
  });
}

test('LANDING neutral targets settle a combined pitch/roll disturbance across headings', () => {
  for (const heading of [0, 90, 225]) {
    const body = landingBody({heading, roll: 18, pitch: -14}), controller = new FlightController();
    run(body, 300, {}, {assisted: true, infinite: true, rate: 90}, controller);
    assert.equal(controller.mode, 'LANDING');
    assert.deepEqual(controller.targetAngles, {roll: 0, pitch: 0});
    near(body.getAttitude().roll, 0, .3 * DEG);
    near(body.getAttitude().pitch, 0, .3 * DEG);
    assert(body.omega.length() < .01);
    assert.equal(body.events.length, 0, 'Settling must happen in flight, not through wheel contact');
  }
});

for (const [key, angle, axis, sign] of [
  ['rollLeft', 'roll', 'x', -1], ['rollRight', 'roll', 'x', 1],
  ['forward', 'pitch', 'z', -1], ['back', 'pitch', 'z', 1]
]) {
  test(`LANDING ${key} settles at ${sign * 30} degrees and restores level on release`, () => {
    for (const heading of [0, 90, 225]) {
      const body = landingBody({heading}), controller = new FlightController();
      const settings = {assisted: true, rate: 90, infinite: true};
      run(body, 300, {[key]: true}, settings, controller);
      assert.equal(controller.mode, 'LANDING');
      near(controller.targetAngles[angle], sign * 30 * DEG, 1e-12, 'radian target, not a rate');
      near(body.getAttitude()[angle], sign * 30 * DEG, .3 * DEG, `settled at heading=${heading}`);
      assert(body.omega.length() < .01, 'Holding the key must stop rotation at the target angle');
      run(body, 30, {}, settings, controller);
      assert.deepEqual(controller.targetAngles, {roll: 0, pitch: 0});
      assert(body.omega[axis] * sign < -.1, 'Release must produce actual restoring rotation');
      run(body, 270, {}, settings, controller);
      assert.equal(controller.mode, 'LANDING');
      near(body.getAttitude().roll, 0, .3 * DEG);
      near(body.getAttitude().pitch, 0, .3 * DEG);
      assert(body.omega.length() < .01);
      assert.equal(body.events.length, 0);
    }
  });
}

test('LANDING blends pitch/roll over .2 seconds without blending yaw rate', () => {
  const body = landingBody(), controller = new FlightController();
  const input = {forward: true, rollRight: true, right: true};
  // Controller-only observations of a real, level body isolate the blend clock.
  for (let frame = 1; frame <= 12; frame++) {
    controller.update(STEP, body, input, {assisted: true, rate: 180});
    assert.equal(controller.mode, 'LANDING');
    near(controller.targetAngles.roll, Math.PI / 6, 1e-12);
    near(controller.targetAngles.pitch, -Math.PI / 6, 1e-12);
    near(controller.targetRates[0], Math.PI - Math.PI / 2 * frame / 12, 1e-12);
    near(controller.targetRates[2], -Math.PI + Math.PI / 2 * frame / 12, 1e-12);
    near(controller.targetRates[1], Math.PI, 1e-12, 'yaw always uses the requested rate');
  }
  body.v.y = .3;
  for (let frame = 1; frame <= 12; frame++) {
    controller.update(STEP, body, input, {assisted: true, rate: 180});
    assert.equal(controller.mode, 'RATE');
    near(controller.targetRates[0], Math.PI / 2 + Math.PI / 2 * frame / 12, 1e-12);
    near(controller.targetRates[2], -Math.PI / 2 - Math.PI / 2 * frame / 12, 1e-12);
    near(controller.targetRates[1], Math.PI, 1e-12);
  }
  controller.reset();
  assert.equal(controller.mode, 'GROUND');
  assert.equal(controller.landingActive, false);
  assert.deepEqual(controller.targetAngles, {roll: 0, pitch: 0});
  assert.deepEqual(Array.from(controller.targetRates), [0, 0, 0]);
});

test('LANDING yaw remains a body-rate command while bank and level pitch settle', () => {
  for (const [key, sign] of [['left', -1], ['right', 1]]) {
    const body = landingBody({heading: 90}), controller = new FlightController();
    run(body, 300, {rollRight: true, [key]: true},
      {assisted: true, rate: 90, infinite: true}, controller);
    assert.equal(controller.mode, 'LANDING');
    near(controller.targetRates[1], sign * Math.PI / 2, 1e-12);
    near(body.omega.y, sign * Math.PI / 2, .04, 'actual yaw rate');
    near(body.getAttitude().roll, 30 * DEG, .5 * DEG);
    near(body.getAttitude().pitch, 0, .5 * DEG, 'banked yaw must not create a pitch drift');
    assert.equal(body.events.length, 0);
  }
});

test('LANDING hysteresis survives small reversals but exits on ascent, clearance, tilt, ground or direct', () => {
  for (const exit of ['ascent', 'clearance', 'tilt', 'ground', 'direct']) {
    const body = landingBody(), controller = new FlightController();
    controller.update(STEP, body, {}, {assisted: true});
    assert.equal(controller.mode, 'LANDING');
    for (const vy of [-.01, 0, .1, .249]) {
      body.v.y = vy;
      body.altitude = 8.25;
      controller.update(STEP, body, {}, {assisted: true});
      assert.equal(controller.mode, 'LANDING', `${exit}: vy=${vy}`);
      assert.equal(controller.assistActive, false, 'Hysteresis must not pulse lift during ascent');
    }
    if (exit === 'ascent') body.v.y = .251;
    if (exit === 'clearance') body.altitude = 8.501;
    if (exit === 'tilt') body.q.setFromAxisAngle(new Vector3(1, 0, 0), Math.acos(.599));
    if (exit === 'ground') body.mode = 'GROUND';
    controller.update(STEP, body, {}, {assisted: exit !== 'direct'});
    assert.equal(controller.landingActive, false, exit);
    assert.equal(controller.assistActive, false, exit);
    assert.equal(controller.mode, exit === 'ground' ? 'GROUND' : exit === 'direct' ? 'DIRECT' : 'RATE');
  }
});

const inversionAxes = ['pitch', 'yaw', 'roll'];
function invertedBindings(mask, storage = null) {
  const bindings = new Keybinds(storage);
  inversionAxes.forEach((axis, i) => assert(bindings.setInversion(axis, !!(mask & (1 << i)))));
  return bindings;
}

test('all eight inversion combinations swap only their own flight booleans, never ground or throttle', () => {
  const defaults = new Keybinds(null), keys = new Set(['KeyW', 'KeyA', 'KeyQ', 'Space', 'ShiftRight']);
  for (let mask = 0; mask < 8; mask++) {
    const bindings = invertedBindings(mask);
    const flight = bindings.input(keys, 'FLIGHT');
    assert.deepEqual(flight, {
      forward: !(mask & 1), back: !!(mask & 1),
      left: !(mask & 2), right: !!(mask & 2),
      rollLeft: !(mask & 4), rollRight: !!(mask & 4), lift: true, boost: true
    });
    assert.deepEqual(bindings.input(keys, 'GROUND'), defaults.input(keys, 'GROUND'));
    const both = bindings.input(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE'], 'FLIGHT');
    for (const [action] of commands) assert.equal(both[action], true, 'Opposite keys still cancel after swapping');
    for (const mode of ['GROUND', 'FLIGHT']) {
      for (const assisted of [false, true]) {
        const a = mode === 'GROUND' ? new VehiclePhysics() : airborne();
        const b = mode === 'GROUND' ? new VehiclePhysics() : airborne();
        const throttleKeys = ['Space', 'ShiftRight'];
        run(a, 10, defaults.input(throttleKeys, mode), {assisted}, new FlightController());
        run(b, 10, bindings.input(throttleKeys, mode), {assisted}, new FlightController());
        assert(a.p.equals(b.p) && a.v.equals(b.v) && a.q.equals(b.q));
        assert.deepEqual(Array.from(a.throttles), Array.from(b.throttles));
        assert.equal(a.gas, b.gas);
        assert(b.gas < INITIAL_GAS && b.v.x > 0 && b.v.y > 0);
      }
    }
  }
});

for (const [key, axis, sign] of commands) {
  test(`${key} inversion independently reverses real direct and assisted controller torque`, () => {
    const code = DEFAULT_BINDINGS[key === 'forward' ? 'pitchDown' : key === 'back' ? 'pitchUp' : key];
    const inversion = {x: 'roll', y: 'yaw', z: 'pitch'}[axis];
    for (const assisted of [false, true]) {
      for (let mask = 0; mask < 8; mask++) {
        const bindings = invertedBindings(mask), body = airborne(), controller = new FlightController();
        const input = bindings.input([code], 'FLIGHT');
        const out = controller.update(STEP, body, input, {assisted});
        const torque = nozzleTorque(body, out);
        const expectedSign = sign * (bindings.inversions[inversion] ? -1 : 1);
        assert(torque[axis] * expectedSign > 100, `mask=${mask}, assisted=${assisted}`);
        body.step(STEP, input, out);
        assert(body.omega[axis] * expectedSign > .01, `mask=${mask}, assisted=${assisted}`);
        for (const other of ['x', 'y', 'z'].filter(a => a !== axis)) {
          assert(Math.abs(body.omega[other]) < Math.abs(body.omega[axis]) * .03 + 1e-6);
        }
        finite(body);
      }
    }
  });
}

test('flight inversions never alter actual ground drive or left/right steering', () => {
  for (const drive of ['KeyW', 'KeyS']) {
    for (const steer of ['KeyA', 'KeyD']) {
      const baseline = new VehiclePhysics(), defaults = new Keybinds(null);
      run(baseline, 90, defaults.input([drive, steer], 'GROUND'), {}, new FlightController());
      assert(Math.abs(baseline.steer) > .45);
      assert(baseline.v.length() > 1);
      for (let mask = 1; mask < 8; mask++) {
        const body = new VehiclePhysics(), bindings = invertedBindings(mask);
        run(body, 90, bindings.input([drive, steer], 'GROUND'), {}, new FlightController());
        assert(body.p.equals(baseline.p) && body.v.equals(baseline.v) && body.q.equals(baseline.q));
        assert(body.omega.equals(baseline.omega));
        assert.equal(body.steer, baseline.steer);
        assert.equal(body.gas, INITIAL_GAS);
      }
    }
  }
});

test('inversions validate axes and strict booleans, copy snapshots and notify only changes', () => {
  let writes = 0, notifications = 0;
  const bindings = new Keybinds({getItem: () => null, setItem: () => writes++});
  bindings.subscribe(() => notifications++);
  assert.deepEqual(DEFAULT_INVERSIONS, {pitch: false, yaw: false, roll: false});
  assert.deepEqual(bindings.inversions, DEFAULT_INVERSIONS);
  const snapshot = bindings.inversions;
  snapshot.pitch = true;
  delete snapshot.yaw;
  assert.deepEqual(bindings.inversions, DEFAULT_INVERSIONS);
  assert.notEqual(bindings.inversions, bindings.inversions);
  for (const axis of ['unknown', '__proto__', 'constructor', 'toString', '', null, undefined, 1, {}]) {
    assert.equal(bindings.setInversion(axis, true), false);
  }
  for (const value of [undefined, null, 0, 1, 'true', 'false', [], {}]) {
    assert.equal(bindings.setInversion('pitch', value), false);
  }
  assert.equal(writes, 0);
  assert.equal(notifications, 0);
  for (const axis of inversionAxes) {
    assert(bindings.setInversion(axis, false));
    assert(bindings.setInversion(axis, true));
    assert(bindings.setInversion(axis, true));
  }
  assert.equal(writes, 3);
  assert.equal(notifications, 3);
  assert.deepEqual(bindings.inversions, {pitch: true, yaw: true, roll: true});
  bindings.reset();
  assert.deepEqual(bindings.inversions, DEFAULT_INVERSIONS);
  assert.equal(notifications, 4, 'Resetting only inversions is a change');
  bindings.reset();
  assert.equal(notifications, 4);
});

test('version 1 persists all inversion combinations and reset saves false with default bindings', () => {
  for (let mask = 0; mask < 8; mask++) {
    const storage = memoryStorage(), bindings = invertedBindings(mask, storage);
    bindings.set('pitchDown', 'KeyK');
    const saved = JSON.parse(storage.getItem('roadster.keybinds.v1'));
    assert.deepEqual(saved, {version: 1, bindings: bindings.bindings, inversions: bindings.inversions});
    const reloaded = new Keybinds(storage);
    assert.deepEqual(reloaded.inversions, bindings.inversions);
    assert.deepEqual(reloaded.input(['KeyK', 'KeyA', 'KeyQ'], 'FLIGHT'),
      bindings.input(['KeyK', 'KeyA', 'KeyQ'], 'FLIGHT'));
    reloaded.reset();
    const reset = new Keybinds(storage);
    assert.deepEqual(reset.inversions, DEFAULT_INVERSIONS);
    assert.deepEqual(reset.bindings, DEFAULT_BINDINGS);
    assert.deepEqual(JSON.parse(storage.getItem('roadster.keybinds.v1')),
      {version: 1, bindings: DEFAULT_BINDINGS, inversions: DEFAULT_INVERSIONS});
  }
});

test('old version 1 bindings load with false inversions; invalid inversion values are ignored individually', () => {
  const load = inversions => new Keybinds(memoryStorage(JSON.stringify({
    version: 1, bindings: {forward: 'KeyI'}, ...(inversions === undefined ? {} : {inversions})
  })));
  for (const inversions of [undefined, null, false, true, 1, 'true', [], [true, true, true],
    {pitch: 'true', yaw: 1, roll: {}}, {unknown: true, constructor: true, __proto__: null}]) {
    const bindings = load(inversions);
    assert.equal(bindings.bindings.forward, 'KeyI');
    assert.deepEqual(bindings.inversions, DEFAULT_INVERSIONS, JSON.stringify(inversions));
  }
  for (const axis of inversionAxes) {
    const bindings = load({pitch: 'true', yaw: 1, roll: [], [axis]: true});
    assert.deepEqual(bindings.inversions, {...DEFAULT_INVERSIONS, [axis]: true});
  }
});

test('storage failures do not prevent inversion changes, input effects or reset', () => {
  let reads = 0, writes = 0, notifications = 0;
  const bindings = new Keybinds({
    getItem() { reads++; throw new Error('Storage blocked'); },
    setItem() { writes++; throw new Error('Storage full'); }
  });
  assert.equal(reads, 1);
  assert.deepEqual(bindings.inversions, DEFAULT_INVERSIONS);
  bindings.subscribe(() => notifications++);
  for (const axis of inversionAxes) assert(bindings.setInversion(axis, true));
  const input = bindings.input(['KeyW', 'KeyA', 'KeyQ'], 'FLIGHT');
  assert(input.back && input.right && input.rollRight);
  assert(!input.forward && !input.left && !input.rollLeft);
  bindings.reset();
  assert.deepEqual(bindings.inversions, DEFAULT_INVERSIONS);
  assert.deepEqual(bindings.bindings, DEFAULT_BINDINGS);
  assert.equal(writes, 4);
  assert.equal(notifications, 4);
});

for (const inverted of [false, true]) {
  test(`held W takeoff locks both physical pitch directions even with inversion=${inverted}`, () => {
    const bindings = new Keybinds(null), lock = new TakeoffPitchLock();
    bindings.setInversion('pitch', inverted);
    const body = new VehiclePhysics(), controller = new FlightController();
    const keys = new Set(['KeyW', 'Space']);
    lock.update(body.mode, keys, bindings);
    for (let frame = 0; frame < 120 && body.mode !== 'FLIGHT'; frame++) {
      const input = lock.filter(bindings.input(keys, body.mode), body.mode);
      run(body, 1, input, {}, controller);
      lock.update(body.mode, keys, bindings); // Same post-physics ordering as the app.
    }
    assert.equal(body.mode, 'FLIGHT', 'Use a real lift-off transition');
    assert.equal(lock.locked, true);
    assert.deepEqual([...lock.blocked], ['KeyW']);
    for (const extra of [[], ['KeyS'], ['KeyD', 'KeyQ', 'ShiftLeft']]) {
      const held = new Set([...keys, ...extra]);
      lock.update('FLIGHT', held, bindings);
      const raw = bindings.input(held, 'FLIGHT'), before = {...raw};
      const filtered = lock.filter(raw, 'FLIGHT');
      assert.deepEqual(filtered, {...raw, forward: false, back: false});
      assert.deepEqual(raw, before, 'Filtering must not mutate the input snapshot');
      assert(filtered.lift);
    }
    keys.delete('KeyW');
    assert.equal(lock.update('FLIGHT', keys, bindings), false);
    assert.equal(lock.locked, false);
    keys.add('KeyW');
    for (let frame = 0; frame < 20; frame++) {
      assert.equal(lock.update('FLIGHT', keys, bindings), false, 'Repeated FLIGHT updates must not relock');
    }
    const input = lock.filter(bindings.input(keys, 'FLIGHT'), 'FLIGHT');
    assert.equal(input[inverted ? 'back' : 'forward'], true);
    const fresh = airborne(), flight = new FlightController();
    run(fresh, 1, {...input, lift: false}, {}, flight);
    assert(fresh.omega.z * (inverted ? 1 : -1) > .01, 'A re-press must reach the actual controller');
  });
}

test('custom forward I and pitch-down K lock whichever physical codes were held until all release', () => {
  for (const held of [['KeyI'], ['KeyK'], ['KeyI', 'KeyK']]) {
    for (const inverted of [false, true]) {
      const bindings = new Keybinds(null), lock = new TakeoffPitchLock();
      bindings.set('forward', 'KeyI');
      bindings.set('pitchDown', 'KeyK');
      bindings.setInversion('pitch', inverted);
      const keys = new Set(held);
      assert.equal(lock.update('GROUND', keys, bindings), false);
      assert.equal(lock.update('FLIGHT', keys, bindings), true);
      assert.deepEqual([...lock.blocked].sort(), [...held].sort());
      keys.add('KeyS');
      const input = bindings.input(keys, 'FLIGHT');
      assert.deepEqual(lock.filter(input, 'FLIGHT'), {...input, forward: false, back: false});
      // New keys held after the transition must not become additional blockers.
      keys.add('KeyI');
      keys.add('KeyK');
      lock.update('FLIGHT', keys, bindings);
      assert.deepEqual([...lock.blocked].sort(), [...held].sort());
      for (const [i, code] of held.entries()) {
        keys.delete(code);
        assert.equal(lock.update('FLIGHT', keys, bindings), i < held.length - 1);
      }
      assert.equal(lock.locked, false);
      keys.add('KeyK');
      assert.equal(lock.update('FLIGHT', keys, bindings), false);
      const repressed = lock.filter(bindings.input(keys, 'FLIGHT'), 'FLIGHT');
      assert.equal(repressed[inverted ? 'back' : 'forward'], true);
    }
  }
});

test('unrelated held keys never lock; ground/reset clear lock and allow the next transition', () => {
  const bindings = new Keybinds(null);
  for (const held of [[], ['KeyS'], ['KeyQ', 'KeyA', 'Space', 'ShiftRight', 'KeyR', 'KeyC']]) {
    const lock = new TakeoffPitchLock(), keys = new Set(held);
    lock.update('GROUND', keys, bindings);
    assert.equal(lock.update('FLIGHT', keys, bindings), false);
    const input = bindings.input(keys, 'FLIGHT');
    assert.equal(lock.filter(input, 'FLIGHT'), input);
    keys.add('KeyW');
    assert.equal(lock.update('FLIGHT', keys, bindings), false, 'Late forward input is deliberate, not a transition');
  }
  for (const clear of ['ground', 'reset']) {
    const lock = new TakeoffPitchLock(), keys = new Set(['KeyW']);
    assert.equal(lock.update('FLIGHT', keys, bindings), true);
    const groundInput = bindings.input(keys, 'GROUND');
    assert.equal(lock.filter(groundInput, 'GROUND'), groundInput, 'Ground drive is never filtered');
    if (clear === 'ground') lock.update('GROUND', keys, bindings);
    else lock.reset();
    assert.equal(lock.locked, false);
    assert.equal(lock.blocked.size, 0);
    assert.equal(lock.previousMode, 'GROUND');
    assert.equal(lock.update('FLIGHT', keys, bindings), true, 'A new takeoff must lock again');
  }
});
