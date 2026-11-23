// Theevu Yudham: the island. Terrain from layered noise with flattened areas for the town, the
// fishing village, the farm and the hill-top military camp; roads between them; concrete houses and
// two-floor buildings you can walk into (doors, windows, stairs); trees, rocks and bushes; the sea.
// Also the collision world used by players and bullets: boxes (walls, floors, steps), circles
// (trees, rocks) and the terrain height field.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HALF = 560;        // the world is 1120 m square
export const ISLAND_R = 430;
export const WATER_Y = 0;

/* ------------------------------------------------------------------ noise */
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(x, y) { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f) * a; f *= 2.03; a *= 0.5; } return s; }
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// named areas: flattened ground at a fixed height
export const AREAS = [
  { id: 'town', name: 'Kovil Town', x: 0, z: 0, r: 120, h: 7 },
  { id: 'village', name: 'Meenavar Kuppam', x: 60, z: 300, r: 85, h: 3.2 },
  { id: 'camp', name: 'Malai Camp', x: -40, z: -310, r: 75, h: 22 },
  { id: 'farm', name: 'Thottam Farm', x: 290, z: -20, r: 70, h: 8 },
  { id: 'hills', name: 'Kaadu Hills', x: -280, z: 60, r: 55, h: 30 },
];
const ROADS = [['town', 'village'], ['town', 'camp'], ['town', 'farm'], ['town', 'hills']];

function rawHeight(x, z) {
  const r = Math.hypot(x, z), a = Math.atan2(z, x);
  const coast = ISLAND_R + (fbm(Math.cos(a) * 2 + 7, Math.sin(a) * 2 + 3, 3) - 0.5) * 110;
  const land = smooth(-40, 90, coast - r);          // 0 in the sea .. 1 inland
  let h = -7 + land * 9.5;
  // rolling ground, higher hills to the west and north
  h += land * (fbm(x / 160 + 11, z / 160 + 5) - 0.35) * 22;
  h += land * smooth(-60, -300, x) * fbm(x / 90 + 3, z / 90 + 9) * 42;
  h += land * smooth(-120, -320, z) * 14;
  return h;
}
// roads as polylines (gentle curve through a midpoint)
const roadLines = ROADS.map(([a, b]) => {
  const A = AREAS.find((q) => q.id === a), B = AREAS.find((q) => q.id === b);
  const mx = (A.x + B.x) / 2 + (B.z - A.z) * 0.12, mz = (A.z + B.z) / 2 - (B.x - A.x) * 0.12;
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, u = 1 - t;
    pts.push([u * u * A.x + 2 * u * t * mx + t * t * B.x, u * u * A.z + 2 * u * t * mz + t * t * B.z]);
  }
  return pts;
});
function roadDist(x, z) {
  let best = 1e9, bt = 0, bl = null;
  for (const line of roadLines) {
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, az] = line[i], [bx, bz] = line[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - x, az + dz * t - z);
      if (d < best) { best = d; bt = (i + t) / (line.length - 1); bl = line; }
    }
  }
  return { d: best, t: bt, line: bl };
}
function groundHeight(x, z) {
  let h = rawHeight(x, z);
  for (const A of AREAS) {
    const d = Math.hypot(x - A.x, z - A.z), w = smooth(A.r, A.r * 0.55, d);
    if (w > 0) h += (A.h - h) * w;
  }
  return h;
}
function finalHeight(x, z) {
  let h = groundHeight(x, z);
  // roads: smooth the ground along them
  const rd = roadDist(x, z);
  if (rd.d < 14) {
    const line = rd.line, i = Math.min(line.length - 1, Math.round(rd.t * (line.length - 1)));
    const along = groundHeight(line[i][0], line[i][1]);
    h += (Math.max(along, 1.2) - h) * smooth(14, 5, rd.d);
  }
  return h;
}

/* ------------------------------------------------------------------ collision world */
class Grid {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 100003 + j; }
  add(item, minx, minz, maxx, maxz) {
    const c = this.cell;
    for (let i = Math.floor(minx / c); i <= Math.floor(maxx / c); i++) for (let j = Math.floor(minz / c); j <= Math.floor(maxz / c); j++) {
      const k = this.key(i, j); let a = this.map.get(k); if (!a) this.map.set(k, (a = [])); a.push(item);
    }
  }
  query(minx, minz, maxx, maxz, out, stamp) {
    const c = this.cell;
    for (let i = Math.floor(minx / c); i <= Math.floor(maxx / c); i++) for (let j = Math.floor(minz / c); j <= Math.floor(maxz / c); j++) {
      const a = this.map.get(this.key(i, j)); if (!a) continue;
      for (const it of a) if (it.stamp !== stamp) { it.stamp = stamp; out.push(it); }
    }
    return out;
  }
}

export class World {
  constructor(quality = 'med') {
    this.q = quality;
    this.boxes = []; this.circles = [];
    this.grid = new Grid(16);
    this.stamp = 0;
    this.N = quality === 'low' ? 150 : quality === 'high' ? 240 : 190;
    this.cellSize = (2 * HALF) / this.N;
    this.h = new Float32Array((this.N + 1) * (this.N + 1));
    for (let j = 0; j <= this.N; j++) for (let i = 0; i <= this.N; i++) this.h[j * (this.N + 1) + i] = finalHeight(-HALF + i * this.cellSize, -HALF + j * this.cellSize);
    this.group = new THREE.Group();
    this.spawns = [];
    this.lootSpots = [];   // [x, y, z]: floors inside buildings, around the camp, in the open
    this.targets = [];
  }

  // terrain height (bilinear on the same grid the mesh uses)
  heightAt(x, z) {
    const N = this.N, s = this.cellSize;
    let fx = (x + HALF) / s, fz = (z + HALF) / s;
    fx = Math.min(N - 0.0001, Math.max(0, fx)); fz = Math.min(N - 0.0001, Math.max(0, fz));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, W = N + 1;
    const a = this.h[j * W + i], b = this.h[j * W + i + 1], c = this.h[(j + 1) * W + i], d = this.h[(j + 1) * W + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }

  addBox(minx, miny, minz, maxx, maxy, maxz, solid = true) {
    const b = { min: [minx, miny, minz], max: [maxx, maxy, maxz], stamp: 0 };
    if (solid) { this.boxes.push(b); this.grid.add(b, minx, minz, maxx, maxz); }
    return b;
  }
  addCircle(x, z, r, y0, y1) {
    const c = { x, z, r, y0, y1, circle: true, stamp: 0 };
    this.circles.push(c); this.grid.add(c, x - r, z - r, x + r, z + r);
  }
  near(minx, minz, maxx, maxz) { return this.grid.query(minx, minz, maxx, maxz, [], ++this.stamp); }

  // The highest floor under (x, z) that is not above y (terrain, floors, roofs, steps).
  groundBelow(x, z, y, r = 0.3) {
    let g = this.heightAt(x, z);
    for (const b of this.near(x - r, z - r, x + r, z + r)) {
      if (b.circle) continue;
      if (x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2] && b.max[1] <= y + 0.6 && b.max[1] > g) g = b.max[1];
    }
    return g;
  }

  // Ray against boxes, trees/rocks and the ground. Returns { t, point, normal, kind } or null.
  raycast(o, d, maxT = 400) {
    let best = maxT, nx = 0, ny = 1, nz = 0, kind = null;
    // walk the grid cells along the ray (coarse: test items in cells the ray passes)
    const step = this.grid.cell * 0.9, seen = ++this.stamp;
    const cand = [];
    for (let t = 0; t <= Math.min(maxT, best) + step; t += step) {
      const x = o[0] + d[0] * t, z = o[2] + d[2] * t;
      this.grid.query(x - step, z - step, x + step, z + step, cand, seen);
    }
    for (const it of cand) {
      if (it.circle) {
        // vertical cylinder
        const ox = o[0] - it.x, oz = o[2] - it.z, a = d[0] * d[0] + d[2] * d[2];
        if (a < 1e-9) continue;
        const b = ox * d[0] + oz * d[2], c = ox * ox + oz * oz - it.r * it.r, disc = b * b - a * c;
        if (disc < 0) continue;
        const t = (-b - Math.sqrt(disc)) / a;
        if (t < 0 || t >= best) continue;
        const y = o[1] + d[1] * t;
        if (y < it.y0 || y > it.y1) continue;
        best = t; const px = ox + d[0] * t, pz = oz + d[2] * t, l = Math.hypot(px, pz) || 1; nx = px / l; ny = 0; nz = pz / l; kind = 'tree';
      } else {
        let t0 = 0, t1 = best, ax = -1;
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const inv = 1 / d[k];
          let ta = (it.min[k] - o[k]) * inv, tb = (it.max[k] - o[k]) * inv;
          if (ta > tb) { const s = ta; ta = tb; tb = s; }
          if (ta > t0) { t0 = ta; ax = k; }
          if (tb < t1) t1 = tb;
          if (t0 > t1) { ok = false; break; }
        }
        if (!ok || ax < 0 || t0 >= best) continue;
        best = t0; nx = ny = nz = 0; const sgn = -Math.sign(d[ax]); if (ax === 0) nx = sgn; else if (ax === 1) ny = sgn; else nz = sgn; kind = 'wall';
      }
    }
    // ground: march, then refine
    // (short rays are checked at their end too, so small steps like a bouncing grenade still find the ground)
    const gstep = Math.min(1.5, best);
    let prevT = 0, prevAbove = o[1] - Math.max(WATER_Y, this.heightAt(o[0], o[2]));
    for (let t = gstep; t <= best + 1e-9; t = t >= best ? Infinity : Math.min(best, t + gstep)) {
      const y = o[1] + d[1] * t, x = o[0] + d[0] * t, z = o[2] + d[2] * t;
      const above = y - Math.max(WATER_Y, this.heightAt(x, z));
      if (above < 0 && prevAbove >= 0) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2, yy = o[1] + d[1] * m, gg = Math.max(WATER_Y, this.heightAt(o[0] + d[0] * m, o[2] + d[2] * m)); if (yy - gg < 0) hi = m; else lo = m; }
        best = hi; nx = 0; ny = 1; nz = 0;
        kind = this.heightAt(o[0] + d[0] * hi, o[2] + d[2] * hi) < WATER_Y ? 'water' : 'ground';
        break;
      }
      prevT = t; prevAbove = above;
    }
    if (!kind) return null;
    return { t: best, point: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best], normal: [nx, ny, nz], kind };
  }

  /* ---------------------------------------------------------------- building */
  build(renderer) {
    this.buildTerrain();
    this.buildWater();
    this.buildRoads();
    this.buildTown();
    this.buildTrees();
    this.buildSky();
    this.makeMapImage();
    return this.group;
  }

  buildTerrain() {
    const N = this.N, W = N + 1;
    const geo = new THREE.PlaneGeometry(2 * HALF, 2 * HALF, N, N).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xd9c38f), wetSand = new THREE.Color(0xb59c6a), g1 = new THREE.Color(0x5f8a3a), g2 = new THREE.Color(0x7a9a45), rock = new THREE.Color(0x77736a), dirt = new THREE.Color(0x8a7350), c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const i = k % W, j = Math.floor(k / W), h = this.h[j * W + i];
      pos.setY(k, h);
      const x = pos.getX(k), z = pos.getZ(k);
      const hx = this.h[j * W + Math.min(N, i + 1)] - this.h[j * W + Math.max(0, i - 1)], hz = this.h[Math.min(N, j + 1) * W + i] - this.h[Math.max(0, j - 1) * W + i];
      const slope = Math.hypot(hx, hz) / (2 * this.cellSize);
      const n = fbm(x / 40, z / 40, 3);
      if (h < 0.4) c.copy(wetSand); else if (h < 2.4) c.copy(sand).lerp(g1, smooth(1.6, 2.4, h) * 0.6);
      else { c.copy(g1).lerp(g2, n); c.lerp(dirt, smooth(0.62, 0.8, n) * 0.5); }
      c.lerp(rock, smooth(0.45, 0.9, slope));
      for (const A of AREAS) { const d = Math.hypot(x - A.x, z - A.z); if (d < A.r * 0.8 && A.id !== 'village') c.lerp(dirt, 0.25 * smooth(A.r * 0.8, A.r * 0.4, d)); }
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = this.q !== 'low';
    this.group.add(m);
  }

  buildWater() {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1f6f9a, roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.86 }));
    water.position.y = WATER_Y;
    this.group.add(water);
    this.water = water;
  }

  buildRoads() {
    const geos = [];
    for (const line of roadLines) {
      // a ribbon draped on the ground, sampled every ~3 m
      const pts = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [ax, az] = line[i], [bx, bz] = line[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
        for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
      }
      pts.push(line[line.length - 1]);
      const pos = [], idx = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        for (const s of [-1, 1]) {
          const x = pts[i][0] - tz * 3.2 * s, z = pts[i][1] + tx * 3.2 * s;
          pos.push(x, this.heightAt(x, z) + 0.06, z);
        }
        if (i) { const q = i * 2; idx.push(q - 2, q - 1, q, q - 1, q + 1, q); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      geos.push(g);
    }
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ color: 0x4a4744, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.receiveShadow = this.q !== 'low';
    this.group.add(m);
  }

  /* -------------------------------- buildings: every wall, floor and step is a box */
  buildTown() {
    const parts = [];   // { min, max, color }
    const R = rng(42);
    const put = (minx, miny, minz, maxx, maxy, maxz, color, solid = true) => {
      parts.push({ min: [minx, miny, minz], max: [maxx, maxy, maxz], color });
      if (solid) this.addBox(minx, miny, minz, maxx, maxy, maxz);
    };
    // a wall along x (axis 0) or z (axis 1) from a to b at fixed coord f, with openings [{c, w, y0, y1}]
    const wall = (axis, f, a, b, y0, y1, th, openings, color) => {
      const cuts = openings.slice().sort((p, q) => p.c - q.c);
      let s = a;
      const seg = (p, q, ya, yb) => {
        if (q - p < 0.01 || yb - ya < 0.01) return;
        if (axis === 0) put(p, ya, f - th / 2, q, yb, f + th / 2, color); else put(f - th / 2, ya, p, f + th / 2, yb, q, color);
      };
      for (const o of cuts) {
        const p = o.c - o.w / 2, q = o.c + o.w / 2;
        seg(s, p, y0, y1);
        seg(p, q, y0, y0 + o.y0);          // below a window
        seg(p, q, y0 + o.y1, y1);          // lintel
        s = q;
      }
      seg(s, b, y0, y1);
    };
    const WALLS = [0xe8d7b5, 0xf1c9c4, 0xc9dceb, 0xf3e3a3, 0xcfe6c3, 0xefefe9, 0xe6b98f];
    const FLOOR = 0x9d968c, ROOF = 0x8c857c, STEP = 0xa39b8f;
    const door = (c) => ({ c, w: 1.3, y0: 0, y1: 2.3 }), win = (c) => ({ c, w: 1.2, y0: 1.0, y1: 2.1 });

    // House: w x d, 1 or 2 floors, door on the +z side (rot flips sides)
    const house = (cx, cz, w, d, floors, rot = 0) => {
      const y0 = this.heightAt(cx, cz), color = WALLS[(R() * WALLS.length) | 0], th = 0.25, H = 3.1;
      // swap axes for rotated houses
      if (rot % 2) { const t = w; w = d; d = t; }
      const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
      put(x0 - 0.3, y0 - 1.2, z0 - 0.3, x1 + 0.3, y0 + 0.15, z1 + 0.3, FLOOR);     // plinth
      const base = y0 + 0.15;
      for (let f = 0; f < floors; f++) {
        const ya = base + f * H, yb = ya + H - (f < floors - 1 ? 0.2 : 0);
        const doorSide = rot % 4;  // 0:+z 1:+x 2:-z 3:-x
        const winsX = [], winsZ = [];
        for (let x = x0 + 1.8; x < x1 - 1.2; x += 3.2) winsX.push(x);
        for (let z = z0 + 1.8; z < z1 - 1.2; z += 3.2) winsZ.push(z);
        const front = (side) => (f === 0 && side === doorSide ? [door(side % 2 ? cz : cx)] : []);
        const fx = (side) => front(side).concat((side % 2 ? winsZ : winsX).filter((v) => !front(side).some((o) => Math.abs(o.c - v) < 1.5)).map(win));
        wall(0, z1, x0, x1, ya, yb, th, fx(0), color);
        wall(0, z0, x0, x1, ya, yb, th, fx(2), color);
        wall(1, x1, z0 + th / 2, z1 - th / 2, ya, yb, th, fx(1), color);
        wall(1, x0, z0 + th / 2, z1 - th / 2, ya, yb, th, fx(3), color);
        if (f < floors - 1) {
          // stairs along the -x wall going towards -z, with a hole in the floor above them
          const sx0 = x0 + th / 2, sx1 = sx0 + 1.2, rise = H / 12, run = 0.3;
          let zz = z1 - 1.0;
          for (let s = 0; s < 12; s++) { put(sx0, ya, zz - run, sx1, ya + rise * (s + 1), zz, STEP); zz -= run; }
          const holeZ0 = zz, holeZ1 = z1 - 1.0 - 4 * run;
          // floor slab around the hole
          put(x0, yb, z0, x1, yb + 0.2, holeZ0, FLOOR);
          put(x0, yb, holeZ1, x1, yb + 0.2, z1, FLOOR);
          put(sx1, yb, holeZ0, x1, yb + 0.2, holeZ1, FLOOR);
        } else {
          put(x0 - 0.15, yb, z0 - 0.15, x1 + 0.15, yb + 0.25, z1 + 0.15, ROOF);
          // parapet
          for (const [a, b, c2, d2] of [[x0 - 0.15, z0 - 0.15, x1 + 0.15, z0 + 0.05], [x0 - 0.15, z1 - 0.05, x1 + 0.15, z1 + 0.15], [x0 - 0.15, z0, x0 + 0.05, z1], [x1 - 0.05, z0, x1 + 0.15, z1]]) put(a, yb + 0.25, b, c2, yb + 0.85, d2, color);
        }
      }
      // a few spots inside and around to start from, and places where loot lies
      this.spawns.push([cx, base + 0.05, cz]);
      for (let f = 0; f < floors; f++) {
        const fy = base + f * H + 0.02, xa = f ? x0 + 1.9 : x0 + 0.7;
        for (let n = 0; n < 2; n++) this.lootSpots.push([xa + R() * (x1 - 0.7 - xa), fy, z0 + 0.7 + R() * (z1 - z0 - 1.4)]);
      }
    };
    const hut = (cx, cz, rot) => house(cx, cz, 5 + R() * 1.5, 4.5 + R() * 1.5, 1, rot);

    // Kovil Town: a grid of streets with 1 and 2 floor buildings and a temple-like tower
    const T = AREAS[0];
    for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
      if (Math.abs(gx) <= 0 && Math.abs(gz) <= 0) continue;
      if (R() < 0.18) continue;
      const cx = T.x + gx * 26 + (R() - 0.5) * 4, cz = T.z + gz * 26 + (R() - 0.5) * 4;
      if (Math.hypot(cx - T.x, cz - T.z) > T.r * 0.82) continue;
      house(cx, cz, 8 + R() * 4, 7 + R() * 3, R() < 0.55 ? 2 : 1, (R() * 4) | 0);
    }
    // temple tower in the town square
    {
      const y0 = this.heightAt(T.x, T.z);
      for (let i = 0; i < 5; i++) { const s = 7 - i * 1.2; put(T.x - s / 2, y0 + i * 2.2, T.z - s / 2, T.x + s / 2, y0 + (i + 1) * 2.2, T.z + s / 2, i % 2 ? 0xd9a441 : 0xe9c46a); }
      put(T.x - 0.5, y0 + 11, T.z - 0.5, T.x + 0.5, y0 + 12.5, T.z + 0.5, 0xc7882e);
    }
    // Meenavar Kuppam: small huts near the beach, boats on the sand
    const V = AREAS[1];
    for (let i = 0; i < 16; i++) {
      const a = R() * Math.PI * 2, r = 12 + R() * V.r * 0.65;
      hut(V.x + Math.cos(a) * r, V.z + Math.sin(a) * r, (R() * 4) | 0);
    }
    for (let i = 0; i < 6; i++) {
      const x = V.x - 40 + i * 14, z = V.z + 80 + R() * 10, y = this.heightAt(x, z);
      if (y > 0.3) put(x - 0.9, y, z - 3, x + 0.9, y + 0.8, z + 3, [0x2a6fb0, 0xc0392b, 0x27ae60][i % 3]);
    }
    // Thottam Farm: a farmhouse, a barn, hay stacks
    const F = AREAS[3];
    house(F.x, F.z, 10, 8, 2, 1);
    house(F.x + 25, F.z + 10, 14, 9, 1, 0);
    for (let i = 0; i < 8; i++) {
      const x = F.x - 30 + R() * 60, z = F.z - 30 + R() * 60, y = this.heightAt(x, z);
      put(x - 1.2, y, z - 1.2, x + 1.2, y + 1.8, z + 1.2, 0xd8b45a);
    }
    // Malai Camp: barracks, a watch tower, sandbag walls and crates, a shooting range
    const C = AREAS[2];
    house(C.x - 20, C.z, 16, 7, 1, 0);
    house(C.x + 20, C.z - 5, 16, 7, 1, 2);
    house(C.x, C.z + 25, 10, 8, 2, 0);
    {
      const x = C.x + 30, z = C.z + 30, y = this.heightAt(x, z);
      for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) put(x + dx - 0.2, y, z + dz - 0.2, x + dx + 0.2, y + 7, z + dz + 0.2, 0x6b5a45);
      put(x - 2.2, y + 7, z - 2.2, x + 2.2, y + 7.3, z + 2.2, 0x7a6a52);
      put(x - 2.2, y + 7.3, z - 2.2, x + 2.2, y + 8.3, z - 2.0, 0x7a6a52); put(x - 2.2, y + 7.3, z + 2.0, x + 2.2, y + 8.3, z + 2.2, 0x7a6a52);
      // stairs up the open side of the tower: the top step meets the platform
      const zt = z - 1.0;
      for (let s = 0; s < 24; s++) put(x + 2.2, y, zt + (23 - s) * 0.3, x + 3.4, y + (s + 1) * 0.29, zt + (24 - s) * 0.3, 0x6b5a45);
    }
    for (let i = 0; i < 14; i++) {
      const x = C.x - 45 + R() * 90, z = C.z - 40 + R() * 80, y = this.heightAt(x, z), s = 1 + R() * 0.4;
      put(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2, 0x7d6b45);
      this.lootSpots.push([x, y + s + 0.02, z]);                       // on top of the crate
      this.lootSpots.push([x + s / 2 + 0.6, y + 0.02, z]);             // beside it
    }
    for (let i = 0; i < 8; i++) {
      const x = C.x - 50 + i * 14, z = C.z - 45, y = this.heightAt(x, z);
      put(x - 2.5, y, z - 0.5, x + 2.5, y + 1.1, z + 0.5, 0xb8a47a);
    }
    // scattered houses along the roads and in the hills
    for (const line of roadLines) {
      for (let i = 6; i < line.length - 6; i += 7) {
        if (R() < 0.35) continue;
        const [ax, az] = line[i], [bx, bz] = line[i + 1];
        let tx = bx - ax, tz = bz - az; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
        const s = R() < 0.5 ? 1 : -1, cx = ax - tz * 16 * s, cz = az + tx * 16 * s;
        if (this.heightAt(cx, cz) < 2) continue;
        house(cx, cz, 7 + R() * 3, 6 + R() * 2, R() < 0.3 ? 2 : 1, Math.abs(tx) > Math.abs(tz) ? (s > 0 ? 2 : 0) : (s > 0 ? 1 : 3));
      }
    }
    const H2 = AREAS[4];
    house(H2.x, H2.z, 9, 8, 2, 1);
    house(H2.x - 20, H2.z + 18, 6, 5, 1, 0);

    // one merged mesh with vertex colours for all of it
    const geos = [];
    const col = new THREE.Color();
    for (const p of parts) {
      const w = p.max[0] - p.min[0], h = p.max[1] - p.min[1], d = p.max[2] - p.min[2];
      const g = new THREE.BoxGeometry(w, h, d).translate((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
      col.setHex(p.color);
      const n = g.attributes.position.count, c = new Float32Array(n * 3);
      // slightly darker undersides and sides for depth
      const nor = g.attributes.normal;
      for (let k = 0; k < n; k++) { const s = nor.getY(k) < -0.5 ? 0.6 : Math.abs(nor.getX(k)) > 0.5 ? 0.88 : 1; c[k * 3] = col.r * s; c[k * 3 + 1] = col.g * s; c[k * 3 + 2] = col.b * s; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    const m = new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.castShadow = this.q !== 'low'; m.receiveShadow = this.q !== 'low';
    this.group.add(m);
    this.parts = parts;
  }

  buildTrees() {
    const R = rng(7);
    const count = this.q === 'low' ? 650 : this.q === 'high' ? 1800 : 1200;
    const trunks = [], crowns = [], palms = [], rocks = [], bushes = [];
    const blocked = (x, z) => {
      for (const A of AREAS) if (Math.hypot(x - A.x, z - A.z) < A.r * 0.85) return true;
      if (roadDist(x, z).d < 7) return true;
      for (const b of this.near(x - 2, z - 2, x + 2, z + 2)) if (!b.circle) return true;
      return false;
    };
    for (let i = 0, tries = 0; i < count && tries < count * 6; tries++) {
      const x = (R() * 2 - 1) * ISLAND_R, z = (R() * 2 - 1) * ISLAND_R, y = this.heightAt(x, z);
      if (y < 0.8 || blocked(x, z)) continue;
      // denser forest in the east and the hills
      const forest = fbm(x / 120 + 30, z / 120 + 4, 2);
      if (R() > forest * 1.6 - 0.2) continue;
      const s = 0.8 + R() * 0.6;
      if (y < 3) { palms.push([x, y, z, s, R() * 6.28]); this.addCircle(x, z, 0.3, y, y + 8 * s); }
      else { trunks.push([x, y, z, s]); crowns.push([x, y, z, s, R()]); this.addCircle(x, z, 0.35 * s, y, y + 4 * s); }
      i++;
    }
    for (let i = 0; i < count * 0.25; i++) {
      const x = (R() * 2 - 1) * ISLAND_R, z = (R() * 2 - 1) * ISLAND_R, y = this.heightAt(x, z);
      if (y < 0.5 || blocked(x, z)) continue;
      const s = 0.6 + R() * 1.6;
      rocks.push([x, y, z, s, R() * 6.28]);
      this.addCircle(x, z, s * 0.85, y - 1, y + s * 1.1);
    }
    for (let i = 0; i < count * 0.6; i++) {
      const x = (R() * 2 - 1) * ISLAND_R, z = (R() * 2 - 1) * ISLAND_R, y = this.heightAt(x, z);
      if (y < 1 || blocked(x, z)) continue;
      bushes.push([x, y, z, 0.6 + R() * 0.7]);
    }
    const shadow = this.q !== 'low';
    const inst = (geo, mat, list, fn) => {
      const m = new THREE.InstancedMesh(geo, mat, list.length), o = new THREE.Object3D();
      list.forEach((t, k) => { fn(o, t); o.updateMatrix(); m.setMatrixAt(k, o.matrix); });
      m.castShadow = shadow; m.receiveShadow = false; this.group.add(m);
      return m;
    };
    inst(new THREE.CylinderGeometry(0.18, 0.3, 4, 6).translate(0, 2, 0), new THREE.MeshLambertMaterial({ color: 0x5b4330 }), trunks, (o, [x, y, z, s]) => { o.position.set(x, y, z); o.scale.setScalar(s); o.rotation.set(0, 0, 0); });
    inst(new THREE.IcosahedronGeometry(2.2, 0).translate(0, 4.6, 0), new THREE.MeshLambertMaterial({ color: 0x3f6f2c, flatShading: true }), crowns, (o, [x, y, z, s, r]) => { o.position.set(x, y, z); o.scale.set(s * (0.9 + r * 0.3), s * (1 + r * 0.4), s * (0.9 + r * 0.3)); o.rotation.set(0, r * 6, 0); });
    // palms: tall curved trunk and a ring of leaves
    const palmTrunk = new THREE.CylinderGeometry(0.14, 0.22, 7.5, 6).translate(0, 3.75, 0);
    palmTrunk.rotateZ(0.08);
    const leaves = [];
    for (let k = 0; k < 7; k++) { const l = new THREE.BoxGeometry(0.5, 0.06, 3).translate(0, 0, 1.5).rotateX(0.35).rotateY((k / 7) * Math.PI * 2).translate(0.3, 7.5, 0); leaves.push(l); }
    inst(palmTrunk, new THREE.MeshLambertMaterial({ color: 0x8a6b45 }), palms, (o, [x, y, z, s, r]) => { o.position.set(x, y, z); o.scale.setScalar(s); o.rotation.set(0, r, 0); });
    inst(mergeGeometries(leaves), new THREE.MeshLambertMaterial({ color: 0x4f8a33, side: THREE.DoubleSide }), palms, (o, [x, y, z, s, r]) => { o.position.set(x, y, z); o.scale.setScalar(s); o.rotation.set(0, r, 0); });
    inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x8a867c, flatShading: true }), rocks, (o, [x, y, z, s, r]) => { o.position.set(x, y + s * 0.2, z); o.scale.set(s, s * 0.75, s * 1.1); o.rotation.set(r, r * 2, 0); });
    inst(new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.45, 0), new THREE.MeshLambertMaterial({ color: 0x4d7a2e, flatShading: true }), bushes, (o, [x, y, z, s]) => { o.position.set(x, y, z); o.scale.set(s, s * 0.7, s); o.rotation.set(0, s * 5, 0); });
    this.treeList = trunks.concat(palms);
  }

  buildSky() {
    const g = new THREE.SphereGeometry(1800, 24, 12), pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x3d7fd1), hor = new THREE.Color(0xcfe3f2), c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) { const t = Math.max(0, pos.getY(k) / 1800); c.copy(hor).lerp(top, Math.pow(t, 0.6)); col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -1;
    this.sky = sky;
    this.group.add(sky);
  }

  // a top-down picture of the island for the minimap and the big map
  makeMapImage(size = 512) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), img = g.createImageData(size, size), s = (2 * HALF) / size;
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = -HALF + (i + 0.5) * s, z = -HALF + (j + 0.5) * s, h = this.heightAt(x, z), k = (j * size + i) * 4;
      let r, gg, b;
      if (h < 0) { const d = Math.min(1, -h / 7); r = 40 - d * 15; gg = 120 - d * 40; b = 165 - d * 30; }
      else if (h < 2.2) { r = 214; gg = 196; b = 146; }
      else { const t = Math.min(1, h / 40); r = 96 + t * 50; gg = 138 + t * 10; b = 70 + t * 40; }
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const X = (x) => ((x + HALF) / (2 * HALF)) * size;
    g.strokeStyle = '#5a554f'; g.lineWidth = 3;
    for (const line of roadLines) { g.beginPath(); line.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z)))); g.stroke(); }
    g.fillStyle = '#e8e2d6';
    for (const p of this.parts) { if (p.max[1] - p.min[1] < 0.5) continue; g.fillRect(X(p.min[0]), X(p.min[2]), Math.max(1, X(p.max[0]) - X(p.min[0])), Math.max(1, X(p.max[2]) - X(p.min[2]))); }
    g.font = 'bold 13px Rubik, Arial, sans-serif'; g.textAlign = 'center';
    for (const A of AREAS) { g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(A.name, X(A.x) + 1, X(A.z) - A.r * size / (2 * HALF) * 0.55 + 1); g.fillStyle = '#fff'; g.fillText(A.name, X(A.x), X(A.z) - A.r * size / (2 * HALF) * 0.55); }
    this.mapCanvas = c;
  }
}
