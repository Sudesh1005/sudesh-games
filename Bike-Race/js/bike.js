// Kaathu Riders: detailed bike models with a realistic rider, leaning, wheelies, crashes and arcade riding physics.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BikeRider } from './rider.js';

// vmax m/s, accel m/s², grip = cornering limit (m/s²), steer = max turn rate (rad/s), size = model scale
export const BIKES = [
  { id: 'swift', name: 'Swift 160', desc: 'Light and nimble', vmax: 52, accel: 17.5, grip: 25, steer: 2.5, size: 0.92, fairing: false },
  { id: 'kaali', name: 'Kaali 400', desc: 'Balanced street bike', vmax: 58, accel: 16, grip: 23, steer: 2.3, size: 1.0, fairing: true },
  { id: 'thunder', name: 'Thunderbolt 650', desc: 'Fastest, but heavier', vmax: 65, accel: 14.5, grip: 21, steer: 2.1, size: 1.06, fairing: true },
];
export const PAINTS = [0xd7263d, 0xf5b700, 0x1b8ef2, 0x22b573, 0xf0f0f0, 0x8e44ff, 0xff6a1a, 0x23252b];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

let blobTex = null;
function shadowTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

// A box stretched between two points (for limbs and fork legs).
function limb(a, b, w, d, mat) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

// A cylinder between two points (fork tubes, frame, exhaust).
function rod(a, b, r, mat, seg = 10) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.99);

export function buildBikeMesh(st, color, opts = {}) {
  const low = !!opts.low, env = opts.env ?? 1, k = st.size;
  const V = (x, y, z) => new THREE.Vector3(x * k, y * k, z * k);
  const root = new THREE.Group();
  const lean = new THREE.Group(); root.add(lean);
  const pitch = new THREE.Group(); pitch.position.z = -0.72 * k; lean.add(pitch); // wheelies pivot on the rear wheel
  const body = new THREE.Group(); body.position.z = 0.72 * k; pitch.add(body);

  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.22, clearcoat: low ? 0 : 1, clearcoatRoughness: 0.08, envMapIntensity: env });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.55, metalness: 0.35, envMapIntensity: env });
  const matte = new THREE.MeshStandardMaterial({ color: 0x232428, roughness: 0.85, metalness: 0.1 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.32, metalness: 0.9, envMapIntensity: env });
  const alloy = new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.3, metalness: 0.85, envMapIntensity: env });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe4e8ee, roughness: 0.12, metalness: 1, envMapIntensity: env * 1.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a531, roughness: 0.25, metalness: 0.9, envMapIntensity: env });
  const red = new THREE.MeshStandardMaterial({ color: 0xc81e2a, roughness: 0.35, metalness: 0.4 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.92 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.75 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1c2733, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.55, envMapIntensity: env });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.5 });
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf3d33a, roughness: 0.5 });
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * k, y * k, z * k); m.scale.setScalar(k); if (!low) m.castShadow = true; parent.add(m); return m; };
  const addM = (m, parent = body) => { if (!low) m.castShadow = true; parent.add(m); return m; };

  // wheels: fat tyre, five-spoke alloy rim, brake disc (front: twin discs and a gold caliper)
  const R = 0.33;
  const tireGeo = new THREE.TorusGeometry(R - 0.075, 0.075, low ? 8 : 12, low ? 22 : 32).rotateY(Math.PI / 2);
  tireGeo.scale(1.25, 1, 1);
  const rimGeo = new THREE.TorusGeometry(R - 0.13, 0.018, 6, 28).rotateY(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12).rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.03, R - 0.15, 0.028);
  const discGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.008, 24).rotateZ(Math.PI / 2);
  const wheels = [];
  const mkWheel = (parent, z, front) => {
    const hold = new THREE.Group(); hold.position.set(0, R * k, z * k); parent.add(hold);
    const spin = new THREE.Group(); hold.add(spin);
    add(tireGeo, tire, 0, 0, 0, spin); add(rimGeo, alloy, 0, 0, 0, spin); add(hubGeo, metal, 0, 0, 0, spin);
    for (let a = 0; a < 5; a++) {
      const sp = add(spokeGeo, alloy, 0, 0, 0, spin), ang = (a * Math.PI * 2) / 5;
      sp.rotation.x = ang; sp.position.set(0, Math.cos(ang) * (R - 0.04) * 0.5 * k, Math.sin(ang) * (R - 0.04) * 0.5 * k);
    }
    for (const x of front ? [-0.075, 0.075] : [-0.07]) add(discGeo, chrome, x, 0, 0, spin);
    // caliper (doesn't spin)
    for (const x of front ? [-0.09, 0.09] : [-0.085]) add(rbox(0.04, 0.1, 0.07, 0.015), front ? gold : red, x, 0.09, -0.1, hold);
    wheels.push(spin);
    return hold;
  };
  mkWheel(body, -0.72, false);
  const steerPivot = new THREE.Group(); steerPivot.position.set(0, 0, 0.72 * k); body.add(steerPivot);
  mkWheel(steerPivot, 0, true);

  // front end (turns with the front wheel): upside-down fork, clip-on bars, headlight, mudguard
  for (const x of [-0.1, 0.1]) {
    addM(rod(V(x, R, 0), V(x, 0.72, -0.13), 0.028 * k, gold), steerPivot);
    addM(rod(V(x, 0.7, -0.125), V(x, 1.02, -0.24), 0.034 * k, alloy), steerPivot);
  }
  add(rbox(0.28, 0.05, 0.1, 0.02), alloy, 0, 1.0, -0.23, steerPivot); // top yoke
  for (const s of [-1, 1]) {
    addM(rod(V(0.09 * s, 1.03, -0.22), V(0.3 * s, 1.02, -0.27), 0.017 * k, dark), steerPivot);
    addM(rod(V(0.24 * s, 1.02, -0.26), V(0.33 * s, 1.02, -0.28), 0.024 * k, matte), steerPivot); // grips
    add(rbox(0.05, 0.03, 0.08, 0.01), metal, 0.25 * s, 1.05, -0.2, steerPivot); // levers
  }
  add(new THREE.SphereGeometry(0.3, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.72, 0.3, 1.25), paint, 0, R * 2 + 0.01, 0.01, steerPivot); // mudguard
  add(rbox(0.16, 0.1, 0.05, 0.02), dark, 0, 1.08, -0.19, steerPivot); // dash
  const dash = add(new THREE.PlaneGeometry(0.12, 0.07), new THREE.MeshBasicMaterial({ color: 0x4fd1ff }), 0, 1.115, -0.17, steerPivot);
  dash.rotation.x = -1.0;
  if (!st.fairing) {
    // naked bike: round headlamp and a small fly screen
    add(new THREE.CylinderGeometry(0.105, 0.09, 0.1, 20).rotateX(Math.PI / 2), dark, 0, 0.9, -0.06, steerPivot);
    add(new THREE.CircleGeometry(0.092, 20), headMat, 0, 0.9, -0.005, steerPivot);
    add(new THREE.TorusGeometry(0.098, 0.01, 6, 22), chrome, 0, 0.9, -0.005, steerPivot);
    add(rbox(0.22, 0.14, 0.02, 0.01), glass, 0, 1.04, -0.08, steerPivot).rotation.x = -0.5;
    for (const s of [-1, 1]) { // indicators + mirrors
      add(rbox(0.05, 0.03, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: 0xff9a1a, emissive: 0x552200 }), 0.15 * s, 0.86, -0.08, steerPivot);
      addM(rod(V(0.22 * s, 1.05, -0.24), V(0.28 * s, 1.25, -0.22), 0.009 * k, dark), steerPivot);
      add(new THREE.SphereGeometry(0.06, 12, 8).scale(1.2, 0.7, 0.35), dark, 0.29 * s, 1.27, -0.22, steerPivot);
    }
  }

  // frame: twin spars from the steering head to the swingarm pivot
  for (const s of [-1, 1]) {
    addM(rod(V(0.12 * s, 0.98, 0.5), V(0.15 * s, 0.68, -0.2), 0.038 * k, st.fairing ? alloy : paint));
    addM(rod(V(0.15 * s, 0.68, -0.2), V(0.14 * s, 0.4, -0.15), 0.03 * k, alloy));
  }
  // swingarm, rear shock with a spring, chain
  for (const s of [-1, 1]) addM(rod(V(0.11 * s, R, -0.72), V(0.13 * s, 0.45, -0.15), 0.035 * k, alloy));
  addM(rod(V(0, 0.48, -0.3), V(0, 0.9, -0.45), 0.03 * k, metal));
  for (let i = 0; i < 6; i++) {
    const c = add(new THREE.TorusGeometry(0.045, 0.011, 5, 12), red, 0, 0.53 + i * 0.06, -0.32 - i * 0.02);
    c.rotation.x = Math.PI / 2 - 0.32;
  }
  add(new THREE.BoxGeometry(0.02, 0.025, 0.6), dark, -0.13, 0.36, -0.44).rotation.x = 0.06;
  add(new THREE.CylinderGeometry(0.11, 0.11, 0.015, 18).rotateZ(Math.PI / 2), chrome, -0.13, R, -0.72); // sprocket

  // engine: cylinder block with cooling fins, crankcase, covers
  add(rbox(0.36, 0.26, 0.42, 0.06), alloy, 0, 0.42, 0.08);
  add(rbox(0.3, 0.3, 0.24, 0.05), metal, 0, 0.66, 0.24).rotation.x = -0.35;
  if (!low) for (let i = 0; i < 5; i++) add(rbox(0.34, 0.012, 0.27, 0.005), metal, 0, 0.58 + i * 0.045, 0.27 - i * 0.015).rotation.x = -0.35;
  add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 20).rotateZ(Math.PI / 2), chrome, 0.19, 0.4, 0.05); // clutch cover
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 16).rotateZ(Math.PI / 2), chrome, -0.19, 0.42, 0.12);
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12).rotateX(Math.PI / 2), dark, 0, 0.32, 0.36); // oil filter
  // exhaust: header pipes into a can on the right
  addM(rod(V(0.02, 0.62, 0.36), V(0.08, 0.3, 0.3), 0.03 * k, chrome));
  addM(rod(V(0.08, 0.3, 0.3), V(0.18, 0.3, -0.3), 0.03 * k, chrome));
  addM(rod(V(0.18, 0.3, -0.3), V(0.22, 0.5, -0.72), 0.03 * k, chrome));
  addM(rod(V(0.21, 0.46, -0.6), V(0.24, 0.62, -1.02), 0.065 * k, st.fairing ? dark : chrome, 16));
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 12).rotateX(Math.PI / 2 + 0.36), dark, 0.24, 0.625, -1.03);

  // fuel tank (smooth and rounded), seat, tail
  const tank = add(new THREE.SphereGeometry(0.3, 24, 16).scale(0.8, 0.55, 1.05), paint, 0, 0.92, 0.18);
  tank.rotation.x = 0.12;
  add(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 14), chrome, 0, 1.08, 0.2); // filler cap
  if (!low) for (const s of [-1, 1]) add(rbox(0.012, 0.08, 0.3, 0.005), st.fairing ? dark : chrome, 0.235 * s, 0.9, 0.18); // tank badge
  add(rbox(0.3, 0.09, 0.5, 0.04), seatMat, 0, 0.94, -0.3).rotation.x = 0.05;
  add(rbox(0.2, 0.06, 0.22, 0.03), seatMat, 0, 1.06, -0.6).rotation.x = -0.2; // pillion
  const tail = add(new THREE.SphereGeometry(0.3, 20, 12).scale(0.48, 0.3, 1.15), paint, 0, 0.93, -0.66);
  tail.rotation.x = -0.2;
  add(new THREE.SphereGeometry(0.05, 12, 8).scale(1.6, 0.45, 0.4), tailMat, 0, 1.0, -0.99);
  addM(rod(V(0, 0.92, -0.85), V(0, 0.7, -1.02), 0.012 * k, dark)); // plate hanger
  add(new THREE.BoxGeometry(0.2, 0.11, 0.008), plateMat, 0, 0.66, -1.04).rotation.x = 0.25;
  add(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.55, 0.25, 0.9), dark, 0, R * 2 + 0.06, -0.78); // hugger
  // foot pegs and side panels
  for (const s of [-1, 1]) {
    addM(rod(V(0.14 * s, 0.42, -0.12), V(0.25 * s, 0.42, -0.12), 0.014 * k, metal));
    addM(rod(V(0.1 * s, 0.5, -0.05), V(0.16 * s, 0.42, -0.12), 0.012 * k, alloy));
    add(rbox(0.03, 0.2, 0.34, 0.02), paint, 0.15 * s, 0.78, -0.34);
  }
  if (st.fairing) {
    // sports fairing: nose with twin headlights, screen, side panels, belly pan
    const nose = add(new THREE.SphereGeometry(0.3, 24, 16).scale(0.52, 0.55, 1.1), paint, 0, 0.9, 0.6);
    nose.rotation.x = 0.45;
    // lower fairing wrapping the engine
    add(new THREE.SphereGeometry(0.3, 24, 16).scale(0.85, 0.75, 1.55), paint, 0, 0.6, 0.22).rotation.x = 0.12;
    for (const s of [-1, 1]) {
      const l = add(new THREE.SphereGeometry(0.05, 14, 8).scale(1.5, 0.42, 0.35), headMat, 0.075 * s, 0.84, 0.92);
      l.rotation.set(0.5, 0.5 * s, -0.25 * s);
      add(new THREE.SphereGeometry(0.06, 12, 8).scale(0.2, 0.6, 1.6), dark, 0.245 * s, 0.6, 0.36).rotation.x = 0.3; // vent
      addM(rod(V(0.17 * s, 1.0, 0.55), V(0.24 * s, 1.07, 0.53), 0.008 * k, dark));
      add(new THREE.SphereGeometry(0.05, 10, 8).scale(1.3, 0.6, 0.4), dark, 0.27 * s, 1.08, 0.53); // mirrors
    }
    const screen = add(new THREE.SphereGeometry(0.26, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.32).scale(0.85, 0.5, 1.2), glass, 0, 1.06, 0.48);
    screen.rotation.x = 0.75;
  }

  // rider
  const seat = { y: 0.97 * k, z: -0.24 * k };
  const rider = new BikeRider(color, { low, env, seat, sport: st.fairing, model: opts.model !== false });
  body.add(rider.root);

  // nitro flame out of the exhaust
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = add(new THREE.ConeGeometry(0.06, 0.6, 8).rotateX(-Math.PI / 2 - 0.36), flameMat, 0.24, 0.7, -1.3);
  flame.castShadow = false; flame.visible = false;

  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  blob.position.y = 0.04; root.add(blob);

  return { root, lean, pitch, body, wheels, steerPivot, headMat, tailMat, flame, rider, seat };
}

export class Bike {
  constructor(stats, color, opts = {}) {
    this.stats = stats; this.color = color; this.opts = opts;
    const m = buildBikeMesh(stats, color, opts);
    Object.assign(this, { mesh: m.root, leanG: m.lean, pitchG: m.pitch, bodyG: m.body, wheels: m.wheels, steerPivot: m.steerPivot, headMat: m.headMat, tailMat: m.tailMat, flame: m.flame, rider: m.rider, seat: m.seat });
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.fx = 0; this.fz = 1;
    this.speed = 0; this.fwd = 0; this.steer = 0; this.spin = 0; this.lean = 0; this.wheelie = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, nitro: false };
    this.nitro = 0.6; this.boosting = false; this.offroad = false; this.impact = 0;
    this.loc = { i: -1, along: 0, lat: 0, s: 0 };
    this.s = 0; this.finished = false; this.finishTime = 0;
    this.crashed = false; this.crashT = 0; this.crashSpin = 0; this.crashSide = 1; this.ghost = 0; this.crashes = 0; this.needsRespawn = false;
    this.nearMiss = 0;
  }

  // swap the built-in rider for a realistic character model once those have loaded
  upgradeRider() {
    if (this.rider.bones) return;
    this.bodyG.remove(this.rider.root);
    this.rider.root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    this.rider = new BikeRider(this.color, { low: this.opts.low, env: this.opts.env ?? 1, seat: this.seat, sport: this.stats.fairing });
    this.bodyG.add(this.rider.root);
  }

  place(road, s, lat) {
    const p = road.at(s, lat, {});
    this.x = p.x; this.z = p.z; this.h = Math.atan2(p.tx, p.tz);
    this.vx = this.vz = 0; this.speed = 0; this.fwd = 0; this.steer = 0; this.lean = 0;
    this.fx = Math.sin(this.h); this.fz = Math.cos(this.h);
    this.loc.i = -1; road.locate(this.x, this.z, this.loc);
    this.s = this.loc.s;
    this.crashed = false; this.needsRespawn = false;
  }

  crash() {
    if (this.crashed || this.ghost > 0 || this.finished) return false;
    this.crashed = true; this.crashT = 1.7; this.crashes++;
    this.crashSpin = (Math.random() - 0.5) * 5; this.crashSide = Math.random() < 0.5 ? -1 : 1;
    this.boosting = false;
    return true;
  }

  update(dt, road, running) {
    const s = this.stats, inp = this.input;
    if (!running) { this.vx = this.vz = 0; this.speed = 0; this.fwd = 0; return; }
    if (this.ghost > 0) this.ghost -= dt;
    if (this.crashed) {
      // sliding along the ground
      const sp = Math.hypot(this.vx, this.vz), ns = Math.max(0, sp - 16 * dt), f = sp > 0 ? ns / sp : 0;
      this.vx *= f; this.vz *= f;
      this.h += this.crashSpin * dt * Math.min(1, sp / 10);
      this.crashT -= dt;
      if (this.crashT <= 0) this.needsRespawn = true;
    } else {
      const ts = clamp(inp.steer, -1, 1);
      const rate = ts !== 0 && Math.sign(ts) !== Math.sign(this.steer) ? 8 : 5;
      this.steer += clamp(ts - this.steer, -rate * dt, rate * dt);
      const sp = Math.hypot(this.vx, this.vz);
      const fwdOld = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h), dir = fwdOld >= -0.1 ? 1 : -1;
      let yaw = s.steer * Math.min(1, sp / 4);
      if (sp > 1) yaw = Math.min(yaw, (s.grip * (this.offroad ? 0.7 : 1)) / sp);
      this.h -= this.steer * yaw * dir * dt;
      const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
      let fwd = this.vx * fx + this.vz * fz, lat = this.vx * rx + this.vz * rz;
      this.boosting = inp.nitro && this.nitro > 0.01 && fwd > 3;
      if (this.boosting) this.nitro = Math.max(0, this.nitro - dt / 3);
      const vmax = s.vmax * (this.offroad ? 0.55 : 1) * (this.boosting ? 1.22 : 1), acc = s.accel * (this.boosting ? 1.8 : 1);
      const gas = inp.throttle > 0 || this.boosting;
      if (gas && !inp.brake) {
        if (fwd < -0.5) fwd = Math.min(0, fwd + 25 * dt);
        else if (fwd < vmax) fwd += acc * Math.max(inp.throttle, this.boosting ? 1 : 0) * (1 - fwd / vmax) * dt;
      }
      if (inp.brake) fwd = fwd > 0.5 ? Math.max(0, fwd - 30 * dt) : Math.max(-6, fwd - 8 * dt);
      if (fwd > vmax) fwd -= (fwd - vmax) * 1.3 * dt;
      if (!gas && !inp.brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), (2 + 0.011 * fwd * fwd) * dt);
      if (this.offroad) fwd -= fwd * 0.6 * dt;
      lat *= Math.exp(-13 * dt);
      this.nitro = Math.min(1, this.nitro + dt * 0.015);
      this.vx = fx * fwd + rx * lat; this.vz = fz * fwd + rz * lat;
      this.fx = fx; this.fz = fz; this.fwd = fwd;
    }
    this.x += this.vx * dt; this.z += this.vz * dt;

    // barriers and road ends
    road.locate(this.x, this.z, this.loc);
    const lim = road.half + road.shoulder - 0.45, L = this.loc.lat, i = this.loc.i;
    if (Math.abs(L) > lim) {
      const sg = Math.sign(L), nx = road.rx[i] * sg, nz = road.rz[i] * sg, pen = Math.abs(L) - lim;
      this.x -= nx * pen; this.z -= nz * pen; this.loc.lat -= sg * pen;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= vn * nx * 1.3; this.vz -= vn * nz * 1.3;
        this.impact = Math.max(this.impact, vn);
        if (vn > 11) this.crash();
      }
      this.vx *= 1 - 1.5 * dt; this.vz *= 1 - 1.5 * dt;
    }
    if ((i === 0 && this.loc.along < 0) || (i === road.N - 1 && this.loc.along > 0)) {
      const tx = road.tx[i], tz = road.tz[i], a = this.loc.along;
      this.x -= tx * a; this.z -= tz * a; this.loc.along = 0;
      const vt = this.vx * tx + this.vz * tz;
      if ((i === 0 && vt < 0) || (i > 0 && vt > 0)) { this.vx -= vt * tx; this.vz -= vt * tz; }
    }
    this.loc.s = this.loc.i * road.seg + this.loc.along;
    this.s = this.loc.s;
    this.offroad = Math.abs(this.loc.lat) > road.half + 0.2;
    this.speed = Math.hypot(this.vx, this.vz);
  }

  sync(dt, night) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.h;
    const k = Math.min(1, dt * 8);
    if (this.crashed) {
      this.lean += (this.crashSide * 1.45 - this.lean) * Math.min(1, dt * 7);
      this.wheelie += (0 - this.wheelie) * k;
    } else {
      this.lean += (this.steer * clamp(this.speed / 22, 0, 1) * 0.72 - this.lean) * k;
      const w = this.boosting && this.speed > 12 ? -0.3 : this.input.brake && this.fwd > 5 ? 0.04 : 0;
      this.wheelie += (w - this.wheelie) * Math.min(1, dt * 4);
    }
    this.leanG.rotation.z = this.lean;
    this.pitchG.rotation.x = this.wheelie;
    this.spin += (this.fwd * dt) / 0.33;
    for (const w of this.wheels) w.rotation.x = this.spin;
    this.steerPivot.rotation.y = this.crashed ? 0.6 * this.crashSide : -this.steer * 0.32 * (1 - clamp(this.speed / this.stats.vmax, 0, 0.8));
    this.tailMat.emissiveIntensity = this.input.brake && this.fwd > 0.5 ? 4 : night ? 1.5 : 0.5;
    this.headMat.emissiveIntensity = night ? 3 : 0.6;
    this.rider.pose({ lean: this.lean, steer: this.steer, tuck: this.boosting ? 1 : clamp((this.speed - 30) / 30, 0, 0.5), crash: this.crashed ? 1 : 0 });
    this.flame.visible = this.boosting && !this.crashed;
    if (this.flame.visible) this.flame.scale.set(1, 1, 0.7 + Math.random() * 0.8);
    this.mesh.visible = this.ghost > 0 && !this.crashed ? Math.floor(this.ghost * 10) % 2 === 0 : true;
  }
}
