// Kaathu Riders: bike + rider models, leaning, wheelies, crashes and arcade riding physics.
import * as THREE from 'three';

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

export function buildBikeMesh(st, color, opts = {}) {
  const low = !!opts.low, env = opts.env ?? 1, k = st.size;
  const V = (x, y, z) => new THREE.Vector3(x * k, y * k, z * k);
  const root = new THREE.Group();
  const lean = new THREE.Group(); root.add(lean);
  const pitch = new THREE.Group(); pitch.position.z = -0.72 * k; lean.add(pitch); // wheelies pivot on the rear wheel
  const body = new THREE.Group(); body.position.z = 0.72 * k; pitch.add(body);

  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.28, envMapIntensity: env });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.6, metalness: 0.3, envMapIntensity: env });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.9, envMapIntensity: env });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.2, metalness: 1, envMapIntensity: env });
  const tire = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.7 });
  const jacket = new THREE.MeshStandardMaterial({ color, roughness: 0.65 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.8 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: color === 0xf0f0f0 ? 0xd7263d : 0xf4f4f4, roughness: 0.25, metalness: 0.2, envMapIntensity: env });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.5 });
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * k, y * k, z * k); if (!low) m.castShadow = true; parent.add(m); return m; };
  const addM = (m, parent = body) => { if (!low) m.castShadow = true; parent.add(m); return m; };

  // wheels
  const R = 0.33;
  const tireGeo = new THREE.TorusGeometry(R * k - 0.06, 0.075, 8, 22).rotateY(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(R * k - 0.1, R * k - 0.1, 0.05, 16).rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.04, 0.05, (R * k - 0.1) * 2);
  const wheels = [];
  const mkWheel = (parent, z) => {
    const spin = new THREE.Group(); spin.position.set(0, R * k, z * k); parent.add(spin);
    add(tireGeo, tire, 0, 0, 0, spin); add(rimGeo, metal, 0, 0, 0, spin);
    for (let a = 0; a < 3; a++) add(spokeGeo, dark, 0, 0, 0, spin).rotation.x = (a * Math.PI) / 3;
    wheels.push(spin);
    return spin;
  };
  mkWheel(body, -0.72);
  const steerPivot = new THREE.Group(); steerPivot.position.set(0, 0, 0.72 * k); body.add(steerPivot);
  mkWheel(steerPivot, 0);
  // fork + bars (turn with the front wheel)
  for (const x of [-0.09, 0.09]) addM(limb(V(x, R, 0), V(x, 1.0, -0.22), 0.05, 0.05, chrome), steerPivot);
  add(new THREE.BoxGeometry(0.62, 0.04, 0.04), dark, 0, 1.03, -0.24, steerPivot);
  add(new THREE.BoxGeometry(0.18, 0.12, 0.06), headMat, 0, 0.86, -0.05, steerPivot);
  add(new THREE.BoxGeometry(0.22, 0.04, 0.5), paint, 0, R * 2 + 0.03, 0, steerPivot); // mudguard

  // frame, engine, tank, seat, tail
  addM(limb(V(0, 0.55, -0.6), V(0, 0.95, 0.45), 0.08, 0.08, dark));
  addM(limb(V(0, R, -0.72), V(0, 0.62, -0.1), 0.06, 0.12, metal)); // swingarm
  add(new THREE.BoxGeometry(0.34, 0.36, 0.52), metal, 0, 0.5, 0.05);
  add(new THREE.BoxGeometry(0.3, 0.12, 0.4), dark, 0, 0.3, 0.08);
  add(new THREE.BoxGeometry(0.44, 0.24, 0.56), paint, 0, 0.9, 0.2);
  add(new THREE.BoxGeometry(0.32, 0.1, 0.56), dark, 0, 0.92, -0.33);
  add(new THREE.BoxGeometry(0.3, 0.14, 0.42), paint, 0, 0.98, -0.72).rotation.x = -0.25;
  add(new THREE.BoxGeometry(0.16, 0.06, 0.05), tailMat, 0, 1.0, -0.94);
  addM(limb(V(0.17, 0.42, -0.1), V(0.2, 0.62, -0.95), 0.1, 0.1, chrome)); // exhaust
  if (st.fairing) {
    add(new THREE.BoxGeometry(0.5, 0.42, 0.5), paint, 0, 0.78, 0.6).rotation.x = 0.35;
    add(new THREE.BoxGeometry(0.36, 0.22, 0.03), glass, 0, 1.13, 0.5).rotation.x = -0.6;
    add(new THREE.BoxGeometry(0.52, 0.3, 0.7), paint, 0, 0.55, 0.15);
  }

  // rider: crouched, hands on the bars
  const rider = new THREE.Group(); body.add(rider);
  const hip = V(0, 1.02, -0.32), shoulder = V(0, 1.5, 0.08);
  for (const s of [-1, 1]) {
    const knee = V(0.2 * s, 0.86, 0.12), foot = V(0.2 * s, 0.42, -0.12), hand = V(0.27 * s, 1.05, 0.48), elbow = V(0.26 * s, 1.24, 0.22);
    addM(limb(V(0.12 * s, hip.y / k, hip.z / k), knee, 0.15, 0.17, pants), rider);
    addM(limb(knee, foot, 0.13, 0.14, pants), rider);
    addM(limb(V(0.2 * s, shoulder.y / k - 0.04, shoulder.z / k), elbow, 0.11, 0.12, jacket), rider);
    addM(limb(elbow, hand, 0.1, 0.1, jacket), rider);
    add(new THREE.BoxGeometry(0.12, 0.08, 0.22), dark, 0.2 * s, 0.4, -0.08, rider);
  }
  addM(limb(hip, shoulder, 0.42, 0.26, jacket), rider);
  const helmet = add(new THREE.SphereGeometry(0.17, 14, 10), helmetMat, 0, 1.68, 0.2, rider);
  add(new THREE.BoxGeometry(0.22, 0.08, 0.04), glass, 0, 1.68, 0.36, rider);

  // nitro flame out of the exhaust
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = add(new THREE.ConeGeometry(0.09, 0.6, 8).rotateX(-Math.PI / 2), flameMat, 0.2, 0.62, -1.22);
  flame.castShadow = false; flame.visible = false;

  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.4).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  blob.position.y = 0.04; root.add(blob);

  return { root, lean, pitch, wheels, steerPivot, headMat, tailMat, flame, helmet };
}

export class Bike {
  constructor(stats, color, opts = {}) {
    this.stats = stats; this.color = color;
    const m = buildBikeMesh(stats, color, opts);
    Object.assign(this, { mesh: m.root, leanG: m.lean, pitchG: m.pitch, wheels: m.wheels, steerPivot: m.steerPivot, headMat: m.headMat, tailMat: m.tailMat, flame: m.flame });
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.fx = 0; this.fz = 1;
    this.speed = 0; this.fwd = 0; this.steer = 0; this.spin = 0; this.lean = 0; this.wheelie = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, nitro: false };
    this.nitro = 0.6; this.boosting = false; this.offroad = false; this.impact = 0;
    this.loc = { i: -1, along: 0, lat: 0, s: 0 };
    this.s = 0; this.finished = false; this.finishTime = 0;
    this.crashed = false; this.crashT = 0; this.crashSpin = 0; this.crashSide = 1; this.ghost = 0; this.crashes = 0; this.needsRespawn = false;
    this.nearMiss = 0;
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
    this.flame.visible = this.boosting && !this.crashed;
    if (this.flame.visible) this.flame.scale.set(1, 1, 0.7 + Math.random() * 0.8);
    this.mesh.visible = this.ghost > 0 && !this.crashed ? Math.floor(this.ghost * 10) % 2 === 0 : true;
  }
}
