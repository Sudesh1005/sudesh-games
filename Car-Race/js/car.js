// Vegam Racing: car models and arcade driving physics.
import * as THREE from 'three';

// vmax in m/s, accel in m/s², grip = how hard it can corner (m/s²), steer = max turn rate (rad/s).
export const CARS = [
  { id: 'kaveri', name: 'Kaveri GT', desc: 'Balanced all-rounder', vmax: 64, accel: 21, grip: 23, steer: 2.0, len: 4.4, wid: 1.9, h: 1.0 },
  { id: 'thunder', name: 'Thunder R', desc: 'Top speed king', vmax: 70, accel: 18.5, grip: 21, steer: 1.8, len: 4.7, wid: 1.96, h: 0.94 },
  { id: 'zip', name: 'Mini Zip', desc: 'Quick and nimble', vmax: 59, accel: 25, grip: 26, steer: 2.3, len: 3.9, wid: 1.8, h: 1.08 },
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

function accentFor(color) {
  if (color === 0xf0f0f0) return 0xd7263d;
  if (color === 0x23252b) return 0xffd23f;
  return 0xf4f4f4;
}

function extrudeSide(shape, depth, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2); // shape x (length) -> world z (forward), extrusion -> width
  return g;
}

export function buildCarMesh(st, color, opts = {}) {
  const L = st.len, W = st.wid, H = st.h, sx = L / 4.4, low = !!opts.low, env = opts.env ?? 1;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const accent = accentFor(color);
  const paint = low
    ? new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.3, envMapIntensity: env })
    : new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: env });
  const dark = new THREE.MeshStandardMaterial({ color: 0x141519, roughness: 0.7, metalness: 0.2, envMapIntensity: env });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b1220, metalness: 0.6, roughness: 0.08, envMapIntensity: env * 1.4 });
  const acc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.3, envMapIntensity: env });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.25, envMapIntensity: env });
  const tire = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d6, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 0.4 });
  const P = (x, y) => [x * sx, y * H];
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (!low) m.castShadow = true; parent.add(m); return m; };

  // lower body (side profile extruded across the width)
  const s = new THREE.Shape();
  s.moveTo(...P(-2.2, 0.3));
  s.lineTo(...P(1.9, 0.3));
  s.quadraticCurveTo(...P(2.26, 0.3), ...P(2.25, 0.52));
  s.lineTo(...P(2.05, 0.66));
  s.quadraticCurveTo(...P(1.4, 0.76), ...P(0.75, 0.8));
  s.lineTo(...P(-1.55, 0.84));
  s.quadraticCurveTo(...P(-2.05, 0.86), ...P(-2.25, 0.92));
  s.lineTo(...P(-2.25, 0.4));
  s.lineTo(...P(-2.2, 0.3));
  add(extrudeSide(s, W - 0.18, 0.09), paint, 0, 0, 0);

  // cabin glass + roof
  const c = new THREE.Shape();
  c.moveTo(...P(0.85, 0.78));
  c.quadraticCurveTo(...P(0.3, 1.12), ...P(-0.1, 1.2));
  c.lineTo(...P(-0.85, 1.2));
  c.quadraticCurveTo(...P(-1.45, 1.1), ...P(-1.8, 0.84));
  c.lineTo(...P(-1.8, 0.78));
  c.lineTo(...P(0.85, 0.78));
  const cw = W * 0.76;
  add(extrudeSide(c, cw - 0.12, 0.06), glass, 0, 0, 0);
  add(new THREE.BoxGeometry(cw * 0.9, 0.05, 0.8 * sx), paint, 0, 1.2 * H + 0.05, -0.47 * sx);

  // details
  add(new THREE.BoxGeometry(W * 0.9, 0.14, L * 0.88), dark, 0, 0.27 * H, 0);
  add(new THREE.BoxGeometry(W * 0.62, 0.13, 0.06), dark, 0, 0.4 * H, 2.25 * sx + 0.07);
  for (const sgn of [-1, 1]) {
    add(new THREE.BoxGeometry(0.42, 0.1, 0.08), headMat, sgn * W * 0.3, 0.56 * H, 2.18 * sx + 0.07);
    add(new THREE.BoxGeometry(0.46, 0.1, 0.06), tailMat, sgn * W * 0.3, 0.74 * H, -2.25 * sx - 0.1);
    add(new THREE.BoxGeometry(0.02, 0.09, L * 0.66), acc, sgn * (W / 2 + 0.005), 0.55 * H, 0.05);
    add(new THREE.BoxGeometry(0.07, 0.24, 0.14), dark, sgn * W * 0.3, 0.99 * H, -1.98 * sx);
    add(new THREE.BoxGeometry(0.12, 0.08, 0.16), paint, sgn * (W / 2 + 0.04), 0.95 * H, 0.62 * sx); // mirrors
  }
  add(new THREE.BoxGeometry(W * 0.96, 0.06, 0.4), acc, 0, 1.12 * H, -2.0 * sx);
  add(new THREE.BoxGeometry(W * 0.22, 0.012, 1.6 * sx), acc, 0, 0.82 * H, 1.35 * sx).rotation.x = 0.07;
  for (const sgn of [-0.3, 0.3]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8).rotateX(Math.PI / 2), chrome, sgn, 0.36 * H, -2.25 * sx - 0.12);

  // wheels: pivot (steering) > spinner (rolling)
  const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 22).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.29, 12).rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.3, 0.06, 0.42);
  const wheels = [], pivots = [];
  for (const [wx, wz, front] of [[1, 1, true], [-1, 1, true], [1, -1, false], [-1, -1, false]]) {
    const pivot = new THREE.Group();
    pivot.position.set(wx * (W / 2 - 0.13), 0.36, wz > 0 ? L * 0.31 : -L * 0.3);
    root.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    add(tireGeo, tire, 0, 0, 0, spin);
    add(rimGeo, chrome, 0, 0, 0, spin);
    add(spokeGeo, dark, 0, 0, 0, spin);
    add(spokeGeo, dark, 0, 0, 0, spin).rotation.x = Math.PI / 2;
    wheels.push(spin);
    if (front) pivots.push(pivot);
  }

  // nitro flames
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x6fd0ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flameGeo = new THREE.ConeGeometry(0.13, 0.8, 8).rotateX(-Math.PI / 2);
  const flames = [];
  for (const sgn of [-0.3, 0.3]) { const f = add(flameGeo, flameMat, sgn, 0.36 * H, -2.25 * sx - 0.6); f.castShadow = false; f.visible = false; flames.push(f); }

  // soft blob shadow (always on, cheap on phones)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, L * 1.15).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }));
  blob.position.y = 0.04; root.add(blob);

  return { root, body, wheels, pivots, headMat, tailMat, flames };
}

export class Car {
  constructor(stats, color, opts = {}) {
    this.stats = stats; this.color = color;
    const m = buildCarMesh(stats, color, opts);
    this.mesh = m.root; this.body = m.body; this.wheels = m.wheels; this.pivots = m.pivots;
    this.headMat = m.headMat; this.tailMat = m.tailMat; this.flames = m.flames;
    this.x = 0; this.z = 0; this.h = 0; this.vx = 0; this.vz = 0; this.fx = 0; this.fz = 1;
    this.speed = 0; this.fwd = 0; this.lat = 0; this.steer = 0; this.spin = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, hand: false, nitro: false };
    this.nitro = 1; this.boosting = false; this.offroad = false; this.drift = 0; this.impact = 0;
    this.loc = { i: -1, along: 0, lat: 0 };
    this.lap = 0; this.maxLap = 0; this.idx = 0; this.prog = 0; this.startProg = 0;
    this.finished = false; this.finishTime = 0; this.lapStart = 0; this.bestLap = Infinity; this.lapTimes = [];
    this.cOff = stats.len / 2 - 1.05; // two collision circles per car
    this.roll = 0; this.pitch = 0; this.prevFwd = 0; this.accelSig = 0;
  }

  // Put the car on the track at sample i, `lat` metres right of the centre line.
  place(track, i, lat, resetIdx = true) {
    i = ((Math.round(i) % track.N) + track.N) % track.N;
    this.x = track.px[i] + track.rx[i] * lat; this.z = track.pz[i] + track.rz[i] * lat;
    this.h = Math.atan2(track.tx[i], track.tz[i]);
    this.vx = this.vz = 0; this.speed = 0; this.fwd = 0; this.lat = 0; this.steer = 0;
    this.fx = Math.sin(this.h); this.fz = Math.cos(this.h);
    this.loc.i = -1; track.locate(this.x, this.z, this.loc);
    if (resetIdx) { this.idx = this.loc.i; this.prog = this.lap * track.N + this.loc.i + this.loc.along / track.seg; }
  }

  update(dt, track, running) {
    const s = this.stats, inp = this.input;
    if (!running) { this.vx = this.vz = 0; this.speed = 0; this.fwd = 0; return; }
    const ts = clamp(inp.steer, -1, 1);
    const rate = ts !== 0 && Math.sign(ts) !== Math.sign(this.steer) ? 7 : 4.5;
    this.steer += clamp(ts - this.steer, -rate * dt, rate * dt);

    const sp = Math.hypot(this.vx, this.vz);
    const fwdOld = this.vx * Math.sin(this.h) + this.vz * Math.cos(this.h);
    const dir = fwdOld >= -0.1 ? 1 : -1;
    const off = this.offroad;
    // turn rate: limited by the steering at low speed and by tyre grip at high speed
    let yaw = s.steer * Math.min(1, sp / 5);
    if (sp > 1) yaw = Math.min(yaw, (s.grip * (off ? 0.75 : 1) * (inp.hand ? 1.8 : 1)) / sp);
    this.h -= this.steer * yaw * dir * dt;

    const fx = Math.sin(this.h), fz = Math.cos(this.h), rx = -fz, rz = fx;
    let fwd = this.vx * fx + this.vz * fz, lat = this.vx * rx + this.vz * rz;

    this.boosting = inp.nitro && this.nitro > 0.01 && fwd > 3;
    if (this.boosting) this.nitro = Math.max(0, this.nitro - dt / 3.2);
    const vmax = s.vmax * (off ? 0.6 : 1) * (this.boosting ? 1.2 : 1);
    const acc = s.accel * (this.boosting ? 1.7 : 1);
    const gas = inp.throttle > 0 || this.boosting;
    if (gas && !inp.brake) {
      if (fwd < -0.5) fwd = Math.min(0, fwd + 28 * dt);
      else if (fwd < vmax) fwd += acc * Math.max(inp.throttle, this.boosting ? 1 : 0) * (1 - fwd / vmax) * dt;
    }
    if (inp.brake) {
      if (fwd > 0.5) fwd = Math.max(0, fwd - 34 * dt);
      else fwd = Math.max(-14, fwd - 12 * dt);
    }
    if (fwd > vmax) fwd -= (fwd - vmax) * 1.2 * dt;
    if (!gas && !inp.brake) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), (2.2 + 0.012 * fwd * fwd) * dt);
    if (off) fwd -= fwd * 0.5 * dt;
    if (inp.hand) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 7 * dt);

    // sideways grip: the handbrake lets the car slide (drift)
    lat *= Math.exp(-(inp.hand ? 1.6 : off ? 5 : 11) * dt);
    this.drift = Math.abs(lat);
    if (inp.hand && this.drift > 3 && fwd > 12) this.nitro = Math.min(1, this.nitro + dt * 0.25);
    this.nitro = Math.min(1, this.nitro + dt * 0.02);

    this.vx = fx * fwd + rx * lat; this.vz = fz * fwd + rz * lat;
    this.x += this.vx * dt; this.z += this.vz * dt;

    // walls
    track.locate(this.x, this.z, this.loc);
    const lim = track.half + track.runoff - s.wid * 0.55, L = this.loc.lat;
    if (Math.abs(L) > lim) {
      const i = this.loc.i, sg = Math.sign(L), nx = track.rx[i] * sg, nz = track.rz[i] * sg;
      const pen = Math.abs(L) - lim;
      this.x -= nx * pen; this.z -= nz * pen;
      this.loc.lat -= sg * pen;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= vn * nx * 1.35; this.vz -= vn * nz * 1.35;
        const k = 1 - Math.min(0.45, vn * 0.025);
        this.vx *= k; this.vz *= k;
        this.impact = Math.max(this.impact, vn);
      }
      this.vx *= 1 - 1.2 * dt; this.vz *= 1 - 1.2 * dt;
    }
    this.offroad = Math.abs(this.loc.lat) > track.half + 1.3;
    this.fx = fx; this.fz = fz; this.fwd = fwd; this.lat = lat;
    this.speed = Math.hypot(this.vx, this.vz);
    this.accelSig = (fwd - this.prevFwd) / dt; this.prevFwd = fwd;
  }

  // Copy the physics state onto the 3D model.
  sync(dt, night) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.h;
    const k = Math.min(1, dt * 6);
    this.roll += (clamp(-this.steer * this.speed * 0.0016, -0.06, 0.06) - this.roll) * k;
    this.pitch += (clamp(-this.accelSig * 0.002, -0.035, 0.045) - this.pitch) * k;
    this.body.rotation.set(this.pitch, 0, this.roll);
    this.spin += (this.fwd * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x = this.spin;
    for (const p of this.pivots) p.rotation.y = -this.steer * 0.42;
    this.tailMat.emissiveIntensity = this.input.brake && this.fwd > 0.5 ? 4 : night ? 1.4 : 0.4;
    this.headMat.emissiveIntensity = night ? 3 : 0.6;
    for (const f of this.flames) {
      f.visible = this.boosting;
      if (this.boosting) f.scale.set(1, 1, 0.7 + Math.random() * 0.7);
    }
  }
}
