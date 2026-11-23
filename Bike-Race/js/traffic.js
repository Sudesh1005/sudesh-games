// Kaathu Riders: road traffic (cars, autos, buses, trucks). Each lane flows at its own steady speed,
// so vehicles never run into each other; riders have to weave through them.
import * as THREE from 'three';
import { Batch, M, rng } from './road.js';

const TYPES = {
  car: { len: 4.2, wid: 1.8, weight: 5 },
  auto: { len: 2.9, wid: 1.4, weight: 2.5 },
  bus: { len: 11, wid: 2.5, weight: 1.1 },
  truck: { len: 8.5, wid: 2.4, weight: 1.5 },
};
const CAR_COLS = [0xe8e8e8, 0x202226, 0xb3242b, 0x2563c9, 0x8a8f96, 0xd9c7a0, 0x2f7d4a, 0xf2f2f2];
const BUS_COLS = [[0x1e6fd9, 0xf2f2f2], [0xd9302b, 0xf6d13a], [0x2e9e5b, 0xf2f2f2]];
const TRUCK_COLS = [0xf28c1b, 0xf2c230, 0x2e9e5b, 0xc8323a];

function wheel(B, x, y, z, r) {
  const g = new THREE.CylinderGeometry(r, r, 0.3, 12).rotateZ(Math.PI / 2);
  B.add(g, 0x151517, M(x, y, z)); g.dispose();
}

// Returns { body, lights } geometries for one vehicle design; front is +z.
function design(type, c1, c2) {
  const B = new Batch(), L = new Batch();
  const box = (w, h, d, col, x, y, z, b = B) => { const g = new THREE.BoxGeometry(w, h, d); b.add(g, col, M(x, y, z)); g.dispose(); };
  if (type === 'car') {
    box(1.8, 0.65, 4.2, c1, 0, 0.6, 0);
    box(1.6, 0.55, 2.1, 0x1a2230, 0, 1.18, -0.25);
    box(1.62, 0.06, 1.7, c1, 0, 1.47, -0.3);
    for (const [x, z] of [[0.82, 1.3], [-0.82, 1.3], [0.82, -1.3], [-0.82, -1.3]]) wheel(B, x, 0.34, z, 0.34);
    for (const x of [-0.6, 0.6]) { box(0.38, 0.14, 0.05, 0xfff4d6, x, 0.72, 2.11, L); box(0.38, 0.14, 0.05, 0xff2020, x, 0.78, -2.11, L); }
  } else if (type === 'auto') {
    box(1.4, 0.75, 2.6, 0x1f1f22, 0, 0.62, -0.1);
    box(1.35, 0.55, 1.2, c1, 0, 0.75, 0.8);
    box(1.45, 0.08, 2.5, c2, 0, 1.72, -0.15);
    box(1.4, 0.75, 0.08, c2, 0, 1.33, -1.35);
    box(0.08, 0.75, 0.08, 0x1f1f22, 0.62, 1.33, 1.0); box(0.08, 0.75, 0.08, 0x1f1f22, -0.62, 1.33, 1.0);
    box(1.2, 0.5, 0.06, 0x1a2230, 0, 1.33, 1.05);
    wheel(B, 0, 0.27, 1.1, 0.27); wheel(B, 0.62, 0.27, -0.8, 0.27); wheel(B, -0.62, 0.27, -0.8, 0.27);
    box(0.3, 0.14, 0.05, 0xfff4d6, 0, 0.92, 1.42, L);
    for (const x of [-0.5, 0.5]) box(0.2, 0.12, 0.05, 0xff2020, x, 0.62, -1.42, L);
  } else if (type === 'bus') {
    box(2.5, 2.6, 11, c1, 0, 1.75, 0);
    box(2.54, 0.9, 9.4, 0x1a2230, 0, 2.25, -0.4);
    box(2.3, 1.1, 0.06, 0x1a2230, 0, 2.2, 5.51);
    box(2.52, 0.35, 11.02, c2, 0, 1.2, 0);
    box(2.4, 0.12, 10.6, 0xdddddd, 0, 3.1, 0);
    for (const z of [3.6, -3.4]) for (const x of [1.1, -1.1]) wheel(B, x, 0.5, z, 0.5);
    for (const x of [-0.9, 0.9]) { box(0.4, 0.2, 0.05, 0xfff4d6, x, 0.8, 5.52, L); box(0.3, 0.3, 0.05, 0xff2020, x, 0.9, -5.52, L); }
  } else {
    box(2.4, 2.2, 2.2, c1, 0, 1.55, 3.0);
    box(2.2, 0.8, 0.06, 0x1a2230, 0, 2.05, 4.11);
    box(2.45, 2.8, 5.8, c2, 0, 2.0, -1.2);
    box(2.0, 0.35, 8.2, 0x2b2b2e, 0, 0.55, -0.1);
    for (const z of [3.0, -1.8, -3.2]) for (const x of [1.05, -1.05]) wheel(B, x, 0.48, z, 0.48);
    for (const x of [-0.85, 0.85]) { box(0.4, 0.2, 0.05, 0xfff4d6, x, 0.9, 4.12, L); box(0.3, 0.2, 0.05, 0xff2020, x, 0.8, -4.12, L); }
  }
  return { body: B.geometry(), lights: L.geometry() };
}

export class Traffic {
  constructor(road, density, scene, opts = {}) {
    this.road = road; this.scene = scene; this.list = [];
    const r = rng(road.def.seed * 13 + 5);
    this.bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, envMapIntensity: opts.env ?? 1 });
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    // a small set of designs shared by all vehicles
    this.designs = {
      car: CAR_COLS.map((c) => design('car', c)),
      auto: [design('auto', 0x2e9e5b, 0xf2c230), design('auto', 0xf2c230, 0x1f1f22)],
      bus: BUS_COLS.map(([a, b]) => design('bus', a, b)),
      truck: TRUCK_COLS.map((c, k) => design('truck', c, TRUCK_COLS[(k + 1) % TRUCK_COLS.length])),
    };
    const spacing = { light: 150, normal: 100, heavy: 66 }[density] || 100;
    const names = Object.keys(TYPES), total = names.reduce((a, n) => a + TYPES[n].weight, 0);
    const pick = () => { let x = r() * total; for (const n of names) { x -= TYPES[n].weight; if (x <= 0) return n; } return 'car'; };
    for (let k = 0; k < (density === 'none' ? 0 : road.lanes); k++) { // 'none': an empty road
      const opp = road.isOpp(k), lat = road.laneLat(k);
      const base = road.opp ? 11 : 15; // highway traffic moves faster
      const speed = opp ? 14 + r() * 4 : base + (road.same > 1 ? (k / (road.same - 1)) * 9 : 0) + r() * 2;
      let s = (opp ? 220 : 240) + r() * spacing;
      const end = opp ? road.length - 10 : road.finishS - 110;
      while (s < end) {
        let type = pick();
        if (road.laneW < 3.7 && type === 'bus' && r() < 0.5) type = 'car';
        const T = TYPES[type], set = this.designs[type], d = set[(r() * set.length) | 0];
        const mesh = new THREE.Mesh(d.body, this.bodyMat);
        if (d.lights) mesh.add(new THREE.Mesh(d.lights, this.lightMat));
        if (!opts.low) mesh.castShadow = true;
        mesh.visible = false;
        scene.add(mesh);
        this.list.push({ type, s, lat: lat + (r() - 0.5) * 0.4, speed, dir: opp ? -1 : 1, hl: T.len / 2, hw: T.wid / 2, mesh, active: true, near: 0 });
        s += T.len + spacing * (0.55 + r() * 0.9);
      }
    }
    this._p = {};
  }

  update(dt, camS) {
    const road = this.road, p = this._p;
    for (const v of this.list) {
      if (!v.active) continue;
      v.s += v.speed * v.dir * dt;
      if (v.s > road.length - 6 || v.s < 6) { v.active = false; v.mesh.visible = false; continue; }
      const vis = Math.abs(v.s - camS) < 680;
      v.mesh.visible = vis;
      if (vis) {
        road.at(v.s, v.lat, p);
        v.mesh.position.set(p.x, 0, p.z);
        v.mesh.rotation.y = Math.atan2(p.tx, p.tz) + (v.dir < 0 ? Math.PI : 0);
      }
    }
  }

  // Closest vehicle a rider at (s, lat) moving at `speed` would reach in this lane: seconds to impact (capped).
  timeTo(s, lat, speed, look = 220) {
    let best = 9;
    for (const v of this.list) {
      if (!v.active || Math.abs(v.lat - lat) > v.hw + 1.1) continue;
      const gap = v.s - v.hl - s - 1;
      if (gap < -2 || gap > look) continue;
      const closing = speed - v.speed * v.dir;
      if (closing <= 0.5) continue;
      best = Math.min(best, Math.max(0, gap) / closing);
    }
    return best;
  }

  // Speed along the road of the nearest vehicle just ahead in this lane (or null).
  ahead(s, lat, range) {
    let best = null, bg = range;
    for (const v of this.list) {
      if (!v.active || Math.abs(v.lat - lat) > v.hw + 0.9) continue;
      const gap = v.s - v.hl - s;
      if (gap > -1.5 && gap < bg) { bg = gap; best = v; }
    }
    return best ? { gap: bg, v: best.speed * best.dir } : null;
  }

  dispose() {
    for (const v of this.list) this.scene.remove(v.mesh);
    for (const set of Object.values(this.designs)) for (const d of set) { d.body.dispose(); if (d.lights) d.lights.dispose(); }
    this.bodyMat.dispose(); this.lightMat.dispose();
    this.list = [];
  }
}
