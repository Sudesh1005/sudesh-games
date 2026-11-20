// City generation, collision and road-network helpers for Kadal Nagaram.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

export const N = 8;               // blocks per side
export const ROAD = 14;           // road width
export const BLOCK = 56;          // block size
export const CELL = ROAD + BLOCK; // road-centre to road-centre
export const HALF = (N * CELL) / 2;
export const SIDEWALK = 0.15;
export const LANE = 3.4;          // lane offset from road centre (keep-left traffic)
export const BEACH_X0 = HALF + ROAD / 2;
export const WATER_X = HALF + 85;
export const BOUNDS = { minX: -HALF - 40, maxX: WATER_X - 3, minZ: -HALF - 40, maxZ: HALF + 40 };

export const rc = (i) => -HALF + i * CELL;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ colliders: boxes + wall segments */
const grid = new Map();
const CS = 50;
const cellOf = (v) => Math.floor(v / CS);
const key = (a, b) => (a + 2000) * 5000 + (b + 2000);
function insert(o) {
  for (let a = cellOf(o.minX); a <= cellOf(o.maxX); a++)
    for (let c = cellOf(o.minZ); c <= cellOf(o.maxZ); c++) {
      const k = key(a, c);
      let arr = grid.get(k);
      if (!arr) grid.set(k, (arr = []));
      arr.push(o);
    }
}
export function addCollider(minX, minZ, maxX, maxZ, h = 20) {
  const b = { minX, minZ, maxX, maxZ, h };
  insert(b); return b;
}
// A thin wall from (ax,az) to (bx,bz): used for real-map buildings and coastlines.
export function addSegment(ax, az, bx, bz, h = 20) {
  const s = { seg: true, ax, az, bx, bz, h, minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minZ: Math.min(az, bz), maxZ: Math.max(az, bz) };
  insert(s); return s;
}

const tmpList = [];
export function nearby(x, z) {
  tmpList.length = 0;
  const a0 = cellOf(x), c0 = cellOf(z);
  for (let a = a0 - 1; a <= a0 + 1; a++)
    for (let c = c0 - 1; c <= c0 + 1; c++) {
      const arr = grid.get(key(a, c));
      if (arr) for (let k = 0; k < arr.length; k++) tmpList.push(arr[k]);
    }
  return tmpList;
}

function segClosest(b, x, z) {
  const dx = b.bx - b.ax, dz = b.bz - b.az, L2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((x - b.ax) * dx + (z - b.az) * dz) / L2, 0, 1);
  return [b.ax + dx * t, b.az + dz * t, dx, dz];
}

// Push a circle {x,z} of radius r out of every collider. Returns the last hit normal or null.
export function resolveCircle(p, r) {
  let hit = null;
  const list = nearby(p.x, p.z);
  for (let k = 0; k < list.length; k++) {
    const b = list[k];
    if (p.x < b.minX - r || p.x > b.maxX + r || p.z < b.minZ - r || p.z > b.maxZ + r) continue;
    if (b.seg) {
      const [cx, cz, sx, sz] = segClosest(b, p.x, p.z);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d;
        p.x += (dx / d) * push; p.z += (dz / d) * push;
        hit = { nx: dx / d, nz: dz / d };
      } else {
        const l = Math.hypot(sx, sz) || 1;
        p.x += (-sz / l) * r; p.z += (sx / l) * r;
        hit = { nx: -sz / l, nz: sx / l };
      }
      continue;
    }
    const cx = clamp(p.x, b.minX, b.maxX), cz = clamp(p.z, b.minZ, b.maxZ);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2), push = r - d;
      p.x += (dx / d) * push; p.z += (dz / d) * push;
      hit = { nx: dx / d, nz: dz / d };
    } else {
      const l = p.x - b.minX, rr = b.maxX - p.x, t = p.z - b.minZ, bt = b.maxZ - p.z;
      const m = Math.min(l, rr, t, bt);
      if (m === l) { p.x = b.minX - r; hit = { nx: -1, nz: 0 }; }
      else if (m === rr) { p.x = b.maxX + r; hit = { nx: 1, nz: 0 }; }
      else if (m === t) { p.z = b.minZ - r; hit = { nx: 0, nz: -1 }; }
      else { p.z = b.maxZ + r; hit = { nx: 0, nz: 1 }; }
    }
  }
  return hit;
}

export function pointBlocked(x, z, y, m = 0.3) {
  const list = nearby(x, z);
  for (let k = 0; k < list.length; k++) {
    const b = list[k];
    if (y >= b.h + 0.5 || x < b.minX - m || x > b.maxX + m || z < b.minZ - m || z > b.maxZ + m) continue;
    if (!b.seg) return true;
    const [cx, cz] = segClosest(b, x, z);
    if ((x - cx) ** 2 + (z - cz) ** 2 < m * m) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ per-world hooks */
let groundFn = null, districtFn = null;
export function setWorldFns(ground, district) { groundFn = ground; districtFn = district; }
export const groundHeight = (x, z) => (groundFn ? groundFn(x, z) : 0);
export const districtAt = (x, z) => (districtFn ? districtFn(x, z) : '');

/* ------------------------------------------------------------------ road graph (any shape) */
export const GRAPH = { x: [], z: [], adj: [], ew: new Map(), cells: new Map() };
export function addNode(x, z) {
  GRAPH.x.push(x); GRAPH.z.push(z); GRAPH.adj.push([]);
  return GRAPH.x.length - 1;
}
export function addEdge(a, b, w = 14) {
  if (a === b) return;
  if (!GRAPH.adj[a].includes(b)) { GRAPH.adj[a].push(b); GRAPH.adj[b].push(a); }
  const cur = GRAPH.ew.get(a * 1e6 + b) || 0;
  GRAPH.ew.set(a * 1e6 + b, Math.max(cur, w)); GRAPH.ew.set(b * 1e6 + a, Math.max(cur, w));
}
export function indexGraph() {
  GRAPH.cells.clear();
  for (let i = 0; i < GRAPH.x.length; i++) {
    if (!GRAPH.adj[i].length) continue;
    const k = key(cellOf(GRAPH.x[i]), cellOf(GRAPH.z[i]));
    let arr = GRAPH.cells.get(k);
    if (!arr) GRAPH.cells.set(k, (arr = []));
    arr.push(i);
  }
}
export const nodePos = (id) => ({ x: GRAPH.x[id], z: GRAPH.z[id] });
export const neighbors = (id) => GRAPH.adj[id];
export const nodeCount = () => GRAPH.x.length;
export function nearestNode(x, z) {
  const a0 = cellOf(x), c0 = cellOf(z);
  let best = -1, bd = Infinity;
  for (let r = 0; r < 80; r++) {
    for (let a = a0 - r; a <= a0 + r; a++) for (let c = c0 - r; c <= c0 + r; c++) {
      if (Math.max(Math.abs(a - a0), Math.abs(c - c0)) !== r) continue;
      const arr = GRAPH.cells.get(key(a, c));
      if (!arr) continue;
      for (const i of arr) { const d = (GRAPH.x[i] - x) ** 2 + (GRAPH.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    if (best >= 0 && r >= 1) break;
  }
  return best;
}
export const edgeWidth = (a, b) => GRAPH.ew.get(a * 1e6 + b) ?? 14;
export const laneOffset = (a, b) => clamp(edgeWidth(a, b) / 4, 1.4, LANE);
export function randomNode() {
  for (let t = 0; t < 200; t++) { const i = (Math.random() * GRAPH.x.length) | 0; if (GRAPH.adj[i].length) return i; }
  return 0;
}
export function randomEdge() {
  const a = randomNode(), nb = GRAPH.adj[a];
  return [a, nb[(Math.random() * nb.length) | 0]];
}
export const gridNode = (i, j) => i * (N + 1) + j;

// Point on the keep-left lane of edge a->b at fraction t.
export function laneSpot(a, b, t, off) {
  if (off === undefined) off = laneOffset(a, b);
  const A = nodePos(a), B = nodePos(b);
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1;
  const lx = dz / len, lz = -dx / len;
  return { x: A.x + dx * t + lx * off, z: A.z + dz * t + lz * off, heading: Math.atan2(dx, dz) };
}
// Parking spot at the left kerb of edge a->b.
export const curbSpot = (a, b, t) => laneSpot(a, b, t, Math.max(laneOffset(a, b), edgeWidth(a, b) / 2 - 1.3));

/* ------------------------------------------------------------------ walking paths */
export function makePath(pts, closed = true) {
  const p = closed ? pts.concat([pts[0]]) : pts.concat(pts.slice(0, -1).reverse());
  const cum = [0];
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z));
  let cx = 0, cz = 0;
  for (const q of pts) { cx += q.x; cz += q.z; }
  return { pts: p, cum, P: cum[cum.length - 1] || 1, cx: cx / pts.length, cz: cz / pts.length };
}
export function pathPoint(path, s) {
  const P = path.P, cum = path.cum, pts = path.pts;
  s = ((s % P) + P) % P;
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const L = cum[hi] - cum[lo] || 1, t = (s - cum[lo]) / L;
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * t, z: pts[lo].z + (pts[hi].z - pts[lo].z) * t };
}
export function pathProject(path, x, z) {
  const pts = path.pts, cum = path.cum;
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i].x, az = pts[i].z, dx = pts[i + 1].x - ax, dz = pts[i + 1].z - az, L2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = (ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2;
    if (d < bd) { bd = d; best = cum[i] + t * Math.sqrt(L2); }
  }
  return best;
}
export const ringPoint = pathPoint;
export const ringProject = pathProject;

/* ------------------------------------------------------------------ fictional grid city helpers */
export function inBlock(x, z) {
  const lx = x + HALF, lz = z + HALF;
  const i = Math.floor(lx / CELL), j = Math.floor(lz / CELL);
  if (i < 0 || j < 0 || i >= N || j >= N) return null;
  const fx = lx - i * CELL, fz = lz - j * CELL;
  if (fx > ROAD / 2 && fx < CELL - ROAD / 2 && fz > ROAD / 2 && fz < CELL - ROAD / 2) return [i, j];
  return null;
}

// Sidewalk point at the middle of a block's west or east side, plus the adjacent kerb/lane.
export function sidewalkSpot(i, j, side) {
  const z = rc(j) + CELL / 2;
  if (side === 'w') return { x: rc(i) + ROAD / 2 + 1.6, z, roadX: rc(i) + LANE, parkX: rc(i) + 5.6, heading: 0, face: -Math.PI / 2, park: { x: rc(i) + 5.6, z: z + 4, heading: 0 } };
  return { x: rc(i + 1) - ROAD / 2 - 1.6, z, roadX: rc(i + 1) - LANE, parkX: rc(i + 1) - 5.6, heading: Math.PI, face: Math.PI / 2, park: { x: rc(i + 1) - 5.6, z: z + 4, heading: Math.PI } };
}

export function blockRing(i, j, inset) {
  const x0 = rc(i) + ROAD / 2 + inset, x1 = rc(i + 1) - ROAD / 2 - inset;
  const z0 = rc(j) + ROAD / 2 + inset, z1 = rc(j + 1) - ROAD / 2 - inset;
  return makePath([{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }], true);
}

export const SPECIAL = { '2,2': 'temple', '5,4': 'park', '1,6': 'park', '4,1': 'police', '3,6': 'hospital', '6,6': 'market' };

function gridDistrict(x, z) {
  if (x > BEACH_X0 - 1) return 'Kadal Karai Beach';
  const i = clamp(Math.floor((x + HALF) / CELL), 0, N - 1), j = clamp(Math.floor((z + HALF) / CELL), 0, N - 1);
  if (Math.abs(i - 2) <= 1 && Math.abs(j - 2) <= 1) return 'Kovil Theru';
  if (Math.abs(i - 6) <= 1 && Math.abs(j - 6) <= 1) return 'Santhai Market';
  if (i >= N - 1) return 'Sea Breeze Road';
  if (z < 0) return x < 0 ? 'Old Town' : 'Harbour Side';
  return x < 0 ? 'Green Gardens' : 'Central Nagar';
}
const gridGround = (x, z) => (inBlock(x, z) ? SIDEWALK : 0);

// Hand-placed mission locations for the fictional city.
function gridMissionLayout() {
  const g = (n) => n.map(([i, j]) => nodePos(gridNode(i, j)));
  const L = {
    fish: { spot: sidewalkSpot(7, 3, 'e'), points: g([[8, 2], [6, 4], [6, 6]]) },
    auto: { spot: sidewalkSpot(3, 3, 'w'), points: g([[3, 5], [1, 5], [1, 8], [4, 8], [4, 6]]) },
    escape: { spot: sidewalkSpot(5, 2, 'w') },
    race: { spot: sidewalkSpot(7, 6, 'e'), points: g([[8, 8], [8, 4], [8, 0], [6, 0], [6, 2], [4, 2], [4, 4]]) },
    biryani: { spot: sidewalkSpot(1, 2, 'w'), points: g([[1, 0], [3, 0], [3, 1], [5, 1], [5, 3]]) },
    brawl: { spot: sidewalkSpot(4, 4, 'w') },
    run: { spot: sidewalkSpot(7, 1, 'e'), points: [{ x: BEACH_X0 + 15, z: rc(1) + 20 }, { x: BEACH_X0 + 42, z: rc(2) + 20 }, { x: BEACH_X0 + 30, z: rc(3) + 10 }, { x: BEACH_X0 + 10, z: rc(4) }] },
    thief: { spot: sidewalkSpot(2, 5, 'w'), route: [gridNode(2, 5), gridNode(2, 6)] },
  };
  return L;
}


/* ------------------------------------------------------------------ geometry helpers */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function signTexture(text, bg, fg) {
  const c = makeCanvas(512, 128), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg; g.font = 'bold 76px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const _c = new THREE.Color();
export function colorize(g, hex, jitter = 0) {
  _c.set(hex);
  if (jitter) _c.offsetHSL(0, 0, (Math.random() - 0.5) * jitter);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
export function mergeAll(list) {
  return mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
}

// Palm: curved segmented trunk, drooping fronds, coconuts.
export function palmGeometry() {
  const parts = [];
  let x = 0, y = 0;
  for (let i = 0; i < 7; i++) {
    const r0 = 0.25 - i * 0.017, h = 1.05;
    const g = colorize(new THREE.CylinderGeometry(r0 - 0.02, r0, h, 6, 1, true), i % 2 ? 0x8b6b4a : 0x765a3c);
    g.translate(x, y + h / 2, 0); parts.push(g);
    y += h * 0.98; x += i * 0.035;
  }
  const top = new THREE.Vector3(x, y, 0);
  const greens = [0x2f7d32, 0x3c8d2f, 0x4e9a35, 0x2a6b2c];
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.random() * 0.3;
    let p = top.clone(), pitch = -0.35 + Math.random() * 0.2;
    for (let s = 0; s < 3; s++) {
      const len = 1.35, wd = 0.62 - s * 0.16;
      const g = colorize(new THREE.BoxGeometry(wd, 0.035, len), greens[(k + s) % greens.length], 0.08);
      g.translate(0, 0, len / 2); g.rotateX(pitch); g.rotateY(a); g.translate(p.x, p.y, p.z);
      parts.push(g);
      p = p.add(new THREE.Vector3(Math.sin(a) * Math.cos(pitch) * len, -Math.sin(pitch) * len, Math.cos(a) * Math.cos(pitch) * len));
      pitch += 0.42;
    }
  }
  for (let k = 0; k < 4; k++) {
    const g = colorize(new THREE.SphereGeometry(0.15, 6, 4), k % 2 ? 0x6b4a22 : 0x7d8c2a);
    g.translate(top.x + Math.cos(k * 1.6) * 0.22, top.y - 0.25, Math.sin(k * 1.6) * 0.22); parts.push(g);
  }
  return mergeAll(parts);
}

// Leafy roadside/park tree: trunk + clustered canopy.
export function treeGeometry(seed) {
  const parts = [], r = mulberry32(seed);
  const t = colorize(new THREE.CylinderGeometry(0.18, 0.32, 3.4, 6, 1, true), 0x6e5236); t.translate(0, 1.7, 0); parts.push(t);
  for (let k = 0; k < 3; k++) {
    const b = colorize(new THREE.CylinderGeometry(0.06, 0.1, 1.6, 4, 1, true), 0x6e5236);
    b.translate(0, 0.8, 0); b.rotateZ(0.6); b.rotateY(k * 2.1); b.translate(0, 2.8, 0); parts.push(b);
  }
  const greens = [0x3f7d32, 0x4b8b36, 0x356e2b, 0x5a9a3e];
  for (let k = 0; k < 7; k++) {
    const g = colorize(new THREE.SphereGeometry(1.1 + r() * 0.6, 7, 5), greens[k % 4], 0.06);
    g.scale(1, 0.8, 1);
    g.translate((r() - 0.5) * 2.4, 4.2 + r() * 1.6, (r() - 0.5) * 2.4); parts.push(g);
  }
  return mergeAll(parts);
}

// Street lamp: pole + arm toward +z (head drawn separately so it can glow).
export function lampGeometry() {
  const parts = [];
  const pole = colorize(new THREE.CylinderGeometry(0.07, 0.12, 7, 8), 0x4b4f57); pole.translate(0, 3.5, 0); parts.push(pole);
  const base = colorize(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 8), 0x3a3d44); base.translate(0, 0.25, 0); parts.push(base);
  const arm = colorize(new THREE.BoxGeometry(0.07, 0.07, 2.0), 0x4b4f57); arm.translate(0, 6.95, 0.95); parts.push(arm);
  const brace = colorize(new THREE.BoxGeometry(0.05, 0.05, 0.9), 0x4b4f57); brace.rotateX(0.7); brace.translate(0, 6.6, 0.3); parts.push(brace);
  const hood = colorize(new THREE.BoxGeometry(0.34, 0.12, 0.62), 0x30333a); hood.translate(0, 6.98, 2.0); parts.push(hood);
  return mergeAll(parts);
}

export const PALETTE = [0xf3d98b, 0xf0a8a0, 0xa9dbd8, 0xc3e2a6, 0xf5efe2, 0xe8a76c, 0xc8b6e6, 0x9fc7ef];

/* ------------------------------------------------------------------ world */
export function buildWorld(scene, low) {
  const rng = mulberry32(20261119);
  const R = (a = 0, b = 1) => a + (b - a) * rng();
  const out = { spots: {}, parked: [], policeParked: [], coinSpots: [], heartSpots: [], footprints: [], kind: 'grid', name: 'Kadal Nagaram' };
  const blockTypes = {};
  out.blockTypes = blockTypes;

  // road graph: grid intersections
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) addNode(rc(i), rc(j));
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    if (i < N) addEdge(gridNode(i, j), gridNode(i + 1, j), ROAD);
    if (j < N) addEdge(gridNode(i, j), gridNode(i, j + 1), ROAD);
  }
  indexGraph();
  setWorldFns(gridGround, gridDistrict);
  out.pathNear = (ref, r = 2) => {
    const ci = clamp(Math.floor((ref.x + HALF) / CELL), 0, N - 1), cj = clamp(Math.floor((ref.z + HALF) / CELL), 0, N - 1);
    return blockRing(clamp(ci + Math.round((Math.random() * 2 - 1) * r), 0, N - 1), clamp(cj + Math.round((Math.random() * 2 - 1) * r), 0, N - 1), 1.3);
  };
  out.missionLayout = gridMissionLayout;
  const std =(color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const texRepeat = (t, x, y) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; };

  const box = new THREE.BoxGeometry(1, 1, 1);
  const boxB = new THREE.BoxGeometry(1, 1, 1); boxB.translate(0, 0.5, 0);
  const add = (geo, mat, sx, sy, sz, x, y, z, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.castShadow = shadow; m.receiveShadow = true;
    scene.add(m); return m;
  };

  /* textures */
  const T = {
    asphalt: TX.asphalt(), pavers: TX.pavers(), kerb: TX.kerb(), grass: TX.grass(), sand: TX.sand(),
    concrete: TX.concrete(), water: TX.waterNormal(), facade: TX.facade(), signs: TX.signAtlas(), glow: TX.glow(),
  };

  /* merged detail geometry (vertex coloured) */
  const detail = [];
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(0, 0, 0, 'YXZ');
  function dGeo(g, color, x, y, z, ry = 0, rx = 0, jitter = 0) {
    colorize(g, color, jitter);
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), _s));
    detail.push(g); return g;
  }
  const dBox = (w, h, d, x, y, z, color, ry = 0, rx = 0, jitter = 0) => dGeo(new THREE.BoxGeometry(w, h, d), color, x, y, z, ry, rx, jitter);
  // place a box in a building-face frame: (u = along face, v = up, n = outward)
  const faceBox = (F, w, h, d, u, v, n, color, rx = 0) => {
    dBox(w, h, d, F.cx + F.tx * u + F.nx * n, v, F.cz + F.tz * u + F.nz * n, color, F.ry, rx);
  };

  /* ground, roads, beach, sea */
  const grassMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.grass.map, 500, 500), normalMap: texRepeat(T.grass.normal, 500, 500), roughness: 0.95 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), grassMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; ground.receiveShadow = true; scene.add(ground);
  const S = N * CELL + ROAD;
  const roadMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.asphalt.map, S / 7, S / 7), normalMap: texRepeat(T.asphalt.normal, S / 7, S / 7), roughness: 0.92 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(S, S), roadMat);
  road.rotation.x = -Math.PI / 2; road.receiveShadow = true; scene.add(road);
  const sandW = WATER_X - BEACH_X0;
  const sandMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.sand.map, sandW / 8, 3000 / 8), normalMap: texRepeat(T.sand.normal, sandW / 8, 3000 / 8), roughness: 1 });
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(sandW, 3000), sandMat);
  sand.rotation.x = -Math.PI / 2; sand.position.set(BEACH_X0 + sandW / 2, 0.012, 0); sand.receiveShadow = true; scene.add(sand);
  const waterNormal = texRepeat(T.water, 120, 180);
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0e5d7c, roughness: 0.06, metalness: 0.25, normalMap: waterNormal, normalScale: new THREE.Vector2(0.5, 0.5) });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(2000, 3000), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.set(WATER_X + 1000, 0.03, 0); scene.add(water);
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3000), foamMat);
  foam.rotation.x = -Math.PI / 2; foam.position.set(WATER_X + 0.6, 0.04, 0); scene.add(foam);
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(10, 3000), new THREE.MeshStandardMaterial({ color: 0x9c8455, roughness: 0.25, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  wet.rotation.x = -Math.PI / 2; wet.position.set(WATER_X - 5, 0.02, 0); scene.add(wet);

  /* road markings */
  const dashes = [], zebra = [], lamps = [], palms = [], trees = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
    for (let z = rc(j) + 12; z < rc(j + 1) - 12; z += 6) dashes.push([rc(i), 0.02, z + 1.5, 1, 0]);
    for (let x = rc(j) + 12; x < rc(j + 1) - 12; x += 6) dashes.push([x + 1.5, 0.02, rc(i), 1, Math.PI / 2]);
  }
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = rc(i), z = rc(j);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + dx, nj = j + dz;
      if (ni < 0 || nj < 0 || ni > N || nj > N) continue;
      for (let k = -5; k <= 5; k++) {
        if (dx) zebra.push([x + dx * 8.8, 0.02, z + k * 1.2, 1, Math.PI / 2]);
        else zebra.push([x + k * 1.2, 0.02, z + dz * 8.8, 1, 0]);
      }
    }
  }

  /* sidewalks with painted kerbs */
  const swGeo = new THREE.BoxGeometry(BLOCK, SIDEWALK, BLOCK); swGeo.translate(0, SIDEWALK / 2, 0);
  const kerbMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.kerb, BLOCK / 2, 1), roughness: 0.85 });
  const paveMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.pavers.map, BLOCK / 2, BLOCK / 2), normalMap: texRepeat(T.pavers.normal, BLOCK / 2, BLOCK / 2), roughness: 0.85 });
  const sw = new THREE.InstancedMesh(swGeo, [kerbMat, kerbMat, paveMat, paveMat, kerbMat, kerbMat], N * N);
  sw.receiveShadow = true; sw.frustumCulled = false; scene.add(sw);
  const m4 = new THREE.Matrix4();

  /* buildings: facades merged per colour so the whole city is a handful of draw calls */
  const facadeMats = new Map(), facadeGeos = new Map(), roofGeos = [], signGeos = [];
  function facadeMat(color, v) {
    const k = color + '|' + v;
    let m = facadeMats.get(k);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color, map: T.facade.map, roughnessMap: T.facade.rough, metalnessMap: T.facade.rough, roughness: 1, metalness: 0.55,
        normalMap: T.facade.normal, normalScale: new THREE.Vector2(0.9, 0.9),
        emissive: 0xffe0b0, emissiveMap: T.facade.ems[v], emissiveIntensity: 0,
      });
      facadeMats.set(k, m); facadeGeos.set(k, []);
    }
    return k;
  }
  function addBuilding(x, z, w, d, floors, color, opts = {}) {
    const h = floors * 3.5, base = SIDEWALK;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    const uv = g.attributes.uv;
    for (let i = 0; i < 24; i++) {
      const face = i >> 2;
      if (face === 2 || face === 3) continue;
      const width = face < 2 ? d : w;
      uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(width / 9)), uv.getY(i) * floors / 2);
    }
    const idx = g.index.array, ni = [];
    for (const f of [0, 1, 4, 5]) for (let k = 0; k < 6; k++) ni.push(idx[f * 6 + k]);
    g.setIndex(ni);
    g.translate(x, base, z);
    facadeGeos.get(facadeMat(color, (rng() * 2) | 0)).push(g);
    const roof = new THREE.PlaneGeometry(w, d); roof.rotateX(-Math.PI / 2);
    const ruv = roof.attributes.uv;
    for (let i = 0; i < ruv.count; i++) ruv.setXY(i, ruv.getX(i) * w / 6, ruv.getY(i) * d / 6);
    roof.translate(x, base + h + 0.01, z); roofGeos.push(roof);
    addCollider(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h);
    out.footprints.push([x - w / 2, z - d / 2, w, d]);

    // parapet, stair room, tanks, dish
    const pc = new THREE.Color(color).offsetHSL(0, -0.05, -0.08).getHex(), top = base + h;
    dBox(w + 0.1, 0.9, 0.22, x, top + 0.45, z - d / 2 + 0.11, pc);
    dBox(w + 0.1, 0.9, 0.22, x, top + 0.45, z + d / 2 - 0.11, pc);
    dBox(0.22, 0.9, d, x - w / 2 + 0.11, top + 0.45, z, pc);
    dBox(0.22, 0.9, d, x + w / 2 - 0.11, top + 0.45, z, pc);
    if (rng() < 0.6) dBox(3, 2.6, 2.6, x + (rng() - 0.5) * (w - 4), top + 1.3, z + (rng() - 0.5) * (d - 4), color);
    const tanks = 1 + ((rng() * 2) | 0);
    for (let k = 0; k < tanks; k++) {
      const tx = x + (rng() - 0.5) * (w - 3), tz = z + (rng() - 0.5) * (d - 3);
      dGeo(new THREE.CylinderGeometry(0.75, 0.8, 1.5, 12), 0x1c1c1c, tx, top + 0.95, tz);
      dBox(1.4, 0.2, 1.4, tx, top + 0.1, tz, 0x7d7d7d);
    }
    if (rng() < 0.3) dGeo(new THREE.CylinderGeometry(0.5, 0.05, 0.25, 12), 0xeeeeee, x + w / 4, top + 1.2, z, 0, 0.7);

    // road-facing side: shop front, sign board, awning, balconies
    if (!opts.block) return;
    const { x0, z0, x1, z1 } = opts.block;
    const faces = [
      { dist: x - w / 2 - x0, nx: -1, nz: 0, fw: d }, { dist: x1 - (x + w / 2), nx: 1, nz: 0, fw: d },
      { dist: z - d / 2 - z0, nx: 0, nz: -1, fw: w }, { dist: z1 - (z + d / 2), nx: 0, nz: 1, fw: w },
    ].sort((a, b) => a.dist - b.dist);
    const f = faces[0];
    const F = {
      cx: x + f.nx * w / 2, cz: z + f.nz * d / 2, nx: f.nx, nz: f.nz,
      tx: -f.nz, tz: f.nx, ry: Math.atan2(f.nx, f.nz),
    };
    // tangent (tx,tz) is the face's local +x direction when facing outward
    F.tx = Math.cos(F.ry); F.tz = -Math.sin(F.ry);
    if (opts.shop !== false && rng() < 0.8) {
      const sw2 = Math.min(f.fw * 0.85, 14);
      faceBox(F, sw2, 2.7, 0.08, 0, base + 1.35, 0.04, 0x7f8388);
      for (let k = -2; k <= 2; k++) faceBox(F, sw2, 0.03, 0.1, 0, base + 1.35 + k * 0.5, 0.06, 0x6a6e73);
      const awn = [0xc0392b, 0x2471a3, 0x1e8449, 0xd68910, 0x6c3483][(rng() * 5) | 0];
      faceBox(F, sw2 + 0.4, 0.07, 1.5, 0, base + 3.05, 0.7, awn, 0.28);
      const k = (rng() * T.signs.count) | 0, [u0, v0, u1, v1] = T.signs.uv(k);
      const sg = new THREE.PlaneGeometry(Math.min(sw2, 7), Math.min(sw2, 7) * 0.375);
      const suv = sg.attributes.uv;
      for (let i = 0; i < suv.count; i++) suv.setXY(i, u0 + suv.getX(i) * (u1 - u0), v0 + suv.getY(i) * (v1 - v0));
      sg.rotateY(F.ry);
      sg.translate(F.cx + F.nx * 0.12, base + 3.75 + Math.min(sw2, 7) * 0.1, F.cz + F.nz * 0.12);
      signGeos.push(sg);
      faceBox(F, Math.min(sw2, 7) + 0.2, Math.min(sw2, 7) * 0.375 + 0.2, 0.08, 0, base + 3.75 + Math.min(sw2, 7) * 0.1, 0.06, 0x222222);
    }
    if (floors >= 4 && rng() < 0.55) {
      const bw = Math.min(f.fw * 0.45, 6), off = (rng() - 0.5) * (f.fw - bw) * 0.6;
      const rail = rng() < 0.5 ? 0xf2f2f2 : 0x3a3a3a;
      for (let fl = 2; fl < floors; fl++) {
        const y = base + fl * 3.5;
        faceBox(F, bw, 0.16, 1.1, off, y, 0.55, pc);
        faceBox(F, bw, 0.9, 0.06, off, y + 0.53, 1.07, rail);
        faceBox(F, 0.06, 0.9, 1.1, off - bw / 2 + 0.03, y + 0.53, 0.55, rail);
        faceBox(F, 0.06, 0.9, 1.1, off + bw / 2 - 0.03, y + 0.53, 0.55, rail);
      }
    }
  }

  const lotMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.asphalt.map, 3, 3), normalMap: texRepeat(T.asphalt.normal, 3, 3), roughness: 0.9 });
  function cityBlock(i, j, x0, z0) {
    const SW = 3, L = (BLOCK - 2 * SW) / 2;
    const block = { x0, z0, x1: x0 + BLOCK, z1: z0 + BLOCK };
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const lx = x0 + SW + a * L + L / 2, lz = z0 + SW + b * L + L / 2;
      if (rng() < 0.1) {
        add(box, lotMat, L - 2, 0.02, L - 2, lx, SIDEWALK + 0.01, lz, false);
        for (let k = -2; k <= 2; k++) dBox(0.12, 0.01, 4.5, lx + k * 2.6, SIDEWALK + 0.025, lz - L / 2 + 4, 0xeeeeee);
        out.parked.push({ x: lx, z: lz, heading: rng() < 0.5 ? 0 : Math.PI / 2 });
        continue;
      }
      const w = L * R(0.62, 0.94), d = L * R(0.62, 0.94);
      const x = lx + ((L - w) / 2) * R(-0.8, 0.8), z = lz + ((L - d) / 2) * R(-0.8, 0.8);
      const dc = Math.min(1, Math.hypot(lx - 40, lz) / HALF);
      let floors = 2 + rng() * (11 * (1 - dc) + 3);
      if (i === N - 1) floors = Math.max(floors, 4 + rng() * 6);
      floors = clamp(Math.round(floors), 2, 14);
      addBuilding(x, z, w, d, floors, PALETTE[(rng() * PALETTE.length) | 0], { block });
    }
  }

  const parkMat = new THREE.MeshStandardMaterial({ map: texRepeat(T.grass.map, 10, 10), normalMap: texRepeat(T.grass.normal, 10, 10), roughness: 0.95 });
  function parkBlock(cx, cz, fountain) {
    add(box, parkMat, BLOCK - 6, 0.04, BLOCK - 6, cx, SIDEWALK + 0.02, cz, false);
    // walking paths
    dBox(BLOCK - 6, 0.02, 2.2, cx, SIDEWALK + 0.05, cz, 0xcbbfa6);
    dBox(2.2, 0.02, BLOCK - 6, cx, SIDEWALK + 0.05, cz, 0xcbbfa6);
    if (fountain) {
      dGeo(new THREE.CylinderGeometry(4.2, 4.6, 0.8, 28), 0xb8ae9c, cx, SIDEWALK + 0.4, cz);
      add(new THREE.CylinderGeometry(3.7, 3.7, 0.1, 28), new THREE.MeshStandardMaterial({ color: 0x2f8fb5, roughness: 0.05, metalness: 0.3 }), 1, 1, 1, cx, SIDEWALK + 0.75, cz, false);
      dGeo(new THREE.CylinderGeometry(0.4, 0.6, 2.4, 12), 0xd9d0bf, cx, SIDEWALK + 1.2, cz);
      dGeo(new THREE.CylinderGeometry(1.2, 0.5, 0.3, 16), 0xd9d0bf, cx, SIDEWALK + 2.4, cz);
      addCollider(cx - 4.4, cz - 4.4, cx + 4.4, cz + 4.4, 1);
    }
    for (let k = 0; k < 16; k++) {
      const x = cx + R(-BLOCK / 2 + 7, BLOCK / 2 - 7), z = cz + R(-BLOCK / 2 + 7, BLOCK / 2 - 7);
      if (Math.abs(x - cx) < 2.5 || Math.abs(z - cz) < 2.5) continue;
      if (fountain && Math.hypot(x - cx, z - cz) < 8) continue;
      (rng() < 0.3 ? palms : trees).push([x, SIDEWALK, z, R(0.8, 1.25), R(0, 6)]);
      addCollider(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 6);
    }
    for (let k = 0; k < 4; k++) {           // benches
      const a = (k * Math.PI) / 2, bx = cx + Math.sin(a) * 9, bz = cz + Math.cos(a) * 9;
      dBox(2, 0.1, 0.5, bx + Math.cos(a) * 2.2, SIDEWALK + 0.5, bz - Math.sin(a) * 2.2, 0x8a5a2b, a);
      dBox(2, 0.5, 0.08, bx + Math.cos(a) * 2.2, SIDEWALK + 0.8, bz - Math.sin(a) * 2.2 + 0, 0x8a5a2b, a);
    }
  }

  function templeBlock(cx, cz) {
    add(box, new THREE.MeshStandardMaterial({ map: texRepeat(T.pavers.map, 14, 14), color: 0xe8d6b0, roughness: 0.9 }), BLOCK - 7, 0.05, BLOCK - 7, cx, SIDEWALK + 0.03, cz, false);
    const inset = BLOCK / 2 - 3.5, gap = 5, segL = inset - gap;
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      const mx = cx + t * (gap + segL / 2), mz = cz + s * inset;
      dBox(segL, 1.6, 0.6, mx, SIDEWALK + 0.8, mz, 0xe7d2a6);
      for (let k = 0; k < segL; k += 2) dBox(0.62, 0.35, 0.62, mx - segL / 2 + k + 0.3, SIDEWALK + 1.75, mz, k % 4 ? 0xc0392b : 0xf2f2f2);
      addCollider(mx - segL / 2, mz - 0.3, mx + segL / 2, mz + 0.3, 1.6);
      const wx = cx + s * inset, wz = cz + t * (gap + segL / 2);
      dBox(0.6, 1.6, segL, wx, SIDEWALK + 0.8, wz, 0xe7d2a6);
      for (let k = 0; k < segL; k += 2) dBox(0.62, 0.35, 0.62, wx, SIDEWALK + 1.75, wz - segL / 2 + k + 0.3, k % 4 ? 0xc0392b : 0xf2f2f2);
      addCollider(wx - 0.3, wz - segL / 2, wx + 0.3, wz + segL / 2, 1.6);
    }
    // gopuram with niches and sculpted tiers
    const gx = cx, gz = cz - 9;
    const cols = [0xc96f3b, 0xe0a458, 0xd4834a, 0xe9b96b, 0xd9a066];
    const fig = [0x2e86de, 0xe74c3c, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xffffff];
    dBox(22, 2.2, 14, gx, SIDEWALK + 1.1, gz, 0xcdbb98);
    dBox(4, 3.2, 14.2, gx, SIDEWALK + 1.6, gz, 0x4a2c1a);              // entrance doorway
    let y = SIDEWALK + 2.2, w = 19, d = 11.5;
    for (let k = 0; k < 7; k++) {
      dBox(w, 3.2, d, gx, y + 1.6, gz, cols[k % cols.length]);
      dBox(w + 0.6, 0.35, d + 0.6, gx, y + 3.1, gz, 0x8a4b2a);
      for (let n = -w / 2 + 1; n < w / 2 - 0.5; n += 1.4) {
        const c = fig[Math.abs(Math.round(n * 3 + k)) % fig.length];
        dBox(0.6, 1.3, 0.35, gx + n, y + 1.7, gz + d / 2 + 0.12, c);
        dBox(0.6, 1.3, 0.35, gx + n, y + 1.7, gz - d / 2 - 0.12, c);
      }
      for (let n = -d / 2 + 1; n < d / 2 - 0.5; n += 1.4) {
        const c = fig[Math.abs(Math.round(n * 5 + k)) % fig.length];
        dBox(0.35, 1.3, 0.6, gx + w / 2 + 0.12, y + 1.7, gz + n, c);
        dBox(0.35, 1.3, 0.6, gx - w / 2 - 0.12, y + 1.7, gz + n, c);
      }
      y += 3.35; w -= 2.2; d -= 1.3;
    }
    const barrel = new THREE.CylinderGeometry(1.6, 1.6, w + 2, 16); barrel.rotateZ(Math.PI / 2);
    dGeo(barrel, 0xd98e48, gx, y + 1.2, gz);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.9, roughness: 0.25 });
    for (let k = -2; k <= 2; k++) add(new THREE.ConeGeometry(0.35, 1.4, 12), gold, 1, 1, 1, gx + k * 1.3, y + 3.3, gz);
    addCollider(gx - 11, gz - 7, gx + 11, gz + 7, 30);
    add(new THREE.CylinderGeometry(0.18, 0.28, 9, 12), gold, 1, 1, 1, cx, SIDEWALK + 4.5, cz + 2);
    addCollider(cx - 0.4, cz + 1.6, cx + 0.4, cz + 2.4, 9);
    // temple tank with steps
    const tx = cx, tz = cz + 14;
    for (let s = 0; s < 3; s++) dBox(18 - s * 1.4, 0.25, 12 - s * 1.4, tx, SIDEWALK + 0.6 - s * 0.25, tz, 0xb7a789);
    add(boxB, new THREE.MeshStandardMaterial({ color: 0x1f6f8b, roughness: 0.05, metalness: 0.3 }), 13.6, 0.1, 7.6, tx, SIDEWALK + 0.0, tz, false);
    addCollider(tx - 9, tz - 6, tx + 9, tz + 6, 1);
  }

  function civic(i, j, cx, cz, text, wall, accent, spot) {
    const bx = cx + 4, w = 30, d = 26, floors = 4, h = floors * 3.5;
    addBuilding(bx, cz, w, d, floors, wall);
    dBox(w + 0.3, 1.0, d + 0.3, bx, SIDEWALK + 3.8, cz, accent);
    dBox(8, 0.25, 4, bx - w / 2 - 2, SIDEWALK + 3.3, cz, 0xdddddd);                       // porch roof
    dBox(0.3, 3.2, 0.3, bx - w / 2 - 5.5, SIDEWALK + 1.6, cz - 1.7, 0xdddddd);
    dBox(0.3, 3.2, 0.3, bx - w / 2 - 5.5, SIDEWALK + 1.6, cz + 1.7, 0xdddddd);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshStandardMaterial({ map: signTexture(text, '#ffffff', '#' + accent.toString(16).padStart(6, '0')), emissive: 0xffffff, emissiveIntensity: 0.15 }));
    sign.rotation.y = -Math.PI / 2; sign.position.set(bx - w / 2 - 0.1, SIDEWALK + 10, cz); scene.add(sign);
    out.signMats = out.signMats || []; out.signMats.push(sign.material);
    out.spots[spot] = sidewalkSpot(i, j, 'w');
    if (spot === 'police') out.policeParked.push({ x: cx - 17, z: cz - 6, heading: 0 }, { x: cx - 17, z: cz + 6, heading: 0 });
    void h;
  }

  function marketBlock(cx, cz) {
    add(box, new THREE.MeshStandardMaterial({ map: texRepeat(T.pavers.map, 14, 14), color: 0xd9a07a, roughness: 0.9 }), BLOCK - 6, 0.04, BLOCK - 6, cx, SIDEWALK + 0.02, cz, false);
    const canopies = [0xe63946, 0xffbe0b, 0x2a9d8f, 0x3a86ff, 0xf77f00, 0x8338ec];
    const goods = [0xff6b35, 0x7cb518, 0xffd23f, 0xd62828, 0x9b5de5, 0xf15bb5];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) {
      const x = cx - 15 + a * 10, z = cz - 12 + b * 12;
      dBox(3.6, 1.0, 2.4, x, SIDEWALK + 0.5, z, 0x8b5a3c);
      for (const px of [-1.7, 1.7]) for (const pz of [-1.1, 1.1]) dBox(0.1, 2.6, 0.1, x + px, SIDEWALK + 1.3, z + pz, 0x6b4a2f);
      dBox(4.4, 0.1, 3.4, x, SIDEWALK + 2.65, z, canopies[(a + b * 4) % canopies.length], 0, 0.1);
      for (let k = 0; k < 6; k++) dGeo(new THREE.SphereGeometry(0.25, 8, 6), goods[(k + a + b) % goods.length], x - 1.3 + (k % 3) * 1.2, SIDEWALK + 1.15, z - 0.5 + ((k / 3) | 0), 0, 0, 0.1);
      addCollider(x - 1.9, z - 1.3, x + 1.9, z + 1.3, 2.8);
    }
  }

  let bi = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x0 = rc(i) + ROAD / 2, z0 = rc(j) + ROAD / 2, x1 = x0 + BLOCK, z1 = z0 + BLOCK;
    const cx = x0 + BLOCK / 2, cz = z0 + BLOCK / 2;
    m4.makeTranslation(cx, 0, cz); sw.setMatrixAt(bi++, m4);
    // lamps along each side, arm pointing at the road
    for (const t of [0.12, 0.5, 0.88]) {
      lamps.push([x0 + BLOCK * t, SIDEWALK, z0 + 0.6, 1, Math.PI]);
      lamps.push([x0 + BLOCK * t, SIDEWALK, z1 - 0.6, 1, 0]);
      lamps.push([x0 + 0.6, SIDEWALK, z0 + BLOCK * t, 1, -Math.PI / 2]);
      lamps.push([x1 - 0.6, SIDEWALK, z0 + BLOCK * t, 1, Math.PI / 2]);
    }
    // street trees along sidewalks
    for (const t of [0.3, 0.7]) {
      if (rng() < 0.45) trees.push([x0 + BLOCK * t, SIDEWALK, z0 + 1.6, R(0.55, 0.75), R(0, 6)]);
      if (rng() < 0.45) trees.push([x0 + BLOCK * t, SIDEWALK, z1 - 1.6, R(0.55, 0.75), R(0, 6)]);
    }
    const type = SPECIAL[i + ',' + j] || 'city';
    blockTypes[i + ',' + j] = type;
    if (type === 'city') cityBlock(i, j, x0, z0);
    else if (type === 'park') parkBlock(cx, cz, i === 5);
    else if (type === 'temple') templeBlock(cx, cz);
    else if (type === 'police') civic(i, j, cx, cz, 'POLICE', 0xdfe8f5, 0x1d4fa8, 'police');
    else if (type === 'hospital') civic(i, j, cx, cz, 'HOSPITAL', 0xf6f6f6, 0xd62839, 'hospital');
    else if (type === 'market') marketBlock(cx, cz);
  }
  sw.instanceMatrix.needsUpdate = true;

  /* lighthouse */
  const lhx = BEACH_X0 + 42, lhz = rc(2) + 10;
  const red = std(0xc81d25, { roughness: 0.5 }), white = std(0xf4f4f4, { roughness: 0.5 });
  for (let k = 0; k < 8; k++) {
    const r0 = 3.0 - k * 0.1, r1 = 3.0 - (k + 1) * 0.1;
    add(new THREE.CylinderGeometry(r1, r0, 3.5, 24), k % 2 ? white : red, 1, 1, 1, lhx, 1.75 + k * 3.5, lhz);
  }
  add(new THREE.CylinderGeometry(2.9, 2.9, 0.4, 24), std(0x222222), 1, 1, 1, lhx, 28.2, lhz);
  for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; dBox(0.06, 1, 0.06, lhx + Math.cos(a) * 2.8, 28.9, lhz + Math.sin(a) * 2.8, 0x222222); }
  const lhLampMat = new THREE.MeshStandardMaterial({ color: 0xfff6c8, emissive: 0xffe08a, emissiveIntensity: 0.3, roughness: 0.2 });
  add(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 16), lhLampMat, 1, 1, 1, lhx, 29.6, lhz, false);
  add(new THREE.ConeGeometry(2.1, 1.8, 16), red, 1, 1, 1, lhx, 31.7, lhz);
  const beamGeo = new THREE.ConeGeometry(5, 70, 20, 1, true); beamGeo.translate(0, -35, 0); beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(lhx, 29.6, lhz); scene.add(beam);
  addCollider(lhx - 3.1, lhz - 3.1, lhx + 3.1, lhz + 3.1, 40);

  /* fishing boats */
  const boatCols = [0x1d6fd1, 0xd62828, 0xf4a300, 0x2a9d8f, 0x6a4c93, 0xe76f51];
  for (let k = 0; k < 7; k++) {
    const x = WATER_X - 9 - R(0, 6), z = -230 + k * 72 + R(-12, 12);
    dBox(2.3, 0.9, 6.0, x, 0.45, z, boatCols[k % boatCols.length]);
    const bow = new THREE.ConeGeometry(1.15, 1.6, 4, 1); bow.rotateY(Math.PI / 4); bow.scale(1, 1, 0.6); bow.rotateX(Math.PI / 2);
    dGeo(bow, boatCols[k % boatCols.length], x, 0.45, z + 3.7);
    dBox(2.4, 0.12, 6.1, x, 0.92, z, 0xf1e3c4);
    dBox(0.12, 4.5, 0.12, x, 3.2, z + 1, 0x5b3a1e);
    dBox(1.2, 0.6, 1.4, x, 1.25, z - 1.6, 0xeeeeee);
    for (let n = 0; n < 3; n++) dBox(1.6, 0.05, 0.2, x, 0.97, z - 2.4 + n * 0.25, 0x333333);
    addCollider(x - 1.2, z - 3.3, x + 1.2, z + 4.3, 1.2);
  }

  /* beach palms and umbrellas */
  for (let z = -HALF - 30; z < HALF + 30; z += 19) {
    const x = BEACH_X0 + 6 + R(-1, 1.5), zz = z + R(-3, 3);
    palms.push([x, 0, zz, R(0.85, 1.2), R(0, 6)]);
    addCollider(x - 0.4, zz - 0.4, x + 0.4, zz + 0.4, 7);
    if (rng() < 0.5) {
      const x2 = BEACH_X0 + R(20, 55), z2 = z + R(-8, 8);
      if (Math.hypot(x2 - lhx, z2 - lhz) > 8) { palms.push([x2, 0, z2, R(0.8, 1.15), R(0, 6)]); addCollider(x2 - 0.4, z2 - 0.4, x2 + 0.4, z2 + 0.4, 7); }
    }
  }
  const umbCols = [0xff006e, 0xffbe0b, 0x3a86ff, 0x06d6a0, 0xfb5607];
  for (let k = 0; k < 16; k++) {
    const x = BEACH_X0 + R(28, 70), z = R(-HALF, HALF);
    if (Math.hypot(x - lhx, z - lhz) < 8) continue;
    dGeo(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), 0xeeeeee, x, 1.3, z);
    dGeo(new THREE.ConeGeometry(1.9, 0.7, 12), umbCols[k % umbCols.length], x, 2.6, z);
    dBox(0.8, 0.08, 1.9, x + 1.2, 0.3, z, 0xffffff, R(0, 3));
  }

  /* outskirts trees (outside playable bounds) */
  for (let k = 0; k < 300; k++) {
    const side = k % 3;
    let x, z;
    if (side === 0) { x = R(BOUNDS.minX - 90, BOUNDS.minX - 6); z = R(BOUNDS.minZ - 90, BOUNDS.maxZ + 90); }
    else if (side === 1) { x = R(BOUNDS.minX - 90, BEACH_X0 - 4); z = R(BOUNDS.minZ - 90, BOUNDS.minZ - 6); }
    else { x = R(BOUNDS.minX - 90, BEACH_X0 - 4); z = R(BOUNDS.maxZ + 6, BOUNDS.maxZ + 90); }
    (rng() < 0.3 ? palms : trees).push([x, 0, z, R(0.9, 1.5), R(0, 6)]);
  }

  /* instanced street furniture & vegetation */
  const e = new THREE.Euler(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  function instanced(geo, mat, list, shadow = false, receive = true) {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, k) => {
      p.set(it[0], it[1], it[2]); e.set(0, it[4] || 0, 0); q.setFromEuler(e);
      const sc = it[3] || 1; s.set(sc, sc, sc);
      m4.compose(p, q, s); im.setMatrixAt(k, m4);
    });
    im.castShadow = shadow; im.receiveShadow = receive; im.frustumCulled = false;
    scene.add(im); return im;
  }
  const lineM = std(0xeeeeee, { roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  instanced(new THREE.BoxGeometry(0.25, 0.02, 3), lineM, dashes);
  instanced(new THREE.BoxGeometry(0.6, 0.02, 2.8), lineM, zebra);

  const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  instanced(lampGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 }), lamps, !low);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const bulbGeo = new THREE.BoxGeometry(0.26, 0.04, 0.5); bulbGeo.translate(0, 6.9, 2.0);
  instanced(bulbGeo, lampMat, lamps);
  const poolGeo = new THREE.PlaneGeometry(8, 8); poolGeo.rotateX(-Math.PI / 2); poolGeo.translate(0, 0.06, 2.6);
  const poolMat = new THREE.MeshBasicMaterial({ map: T.glow, color: 0xffc77a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  instanced(poolGeo, poolMat, lamps, false, false);

  instanced(palmGeometry(), vc, palms, !low);
  const treeA = treeGeometry(7), treeB = treeGeometry(19);
  instanced(treeA, vc, trees.filter((_, k) => k % 2 === 0), !low);
  instanced(treeB, vc, trees.filter((_, k) => k % 2 === 1), !low);

  /* merge buildings, roofs, signs, details */
  for (const [k, geos] of facadeGeos) {
    if (!geos.length) continue;
    const m = new THREE.Mesh(mergeGeometries(geos), facadeMats.get(k));
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  const roofMat = new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.95 });
  const roofs = new THREE.Mesh(mergeGeometries(roofGeos), roofMat); roofs.receiveShadow = true; scene.add(roofs);
  const signMat = new THREE.MeshStandardMaterial({ map: T.signs.tex, emissive: 0xffffff, emissiveMap: T.signs.tex, emissiveIntensity: 0.05, roughness: 0.5 });
  if (signGeos.length) scene.add(new THREE.Mesh(mergeGeometries(signGeos), signMat));
  const det = new THREE.Mesh(mergeAll(detail), vc);
  det.castShadow = !low; det.receiveShadow = true; scene.add(det);

  /* gameplay spots */
  out.spots.spawn = sidewalkSpot(2, 3, 'w');
  for (let k = 0; k < 34; k++) {
    const i = (rng() * N) | 0, j = (rng() * N) | 0, r = blockRing(i, j, 1.5);
    const pt = ringPoint(r, rng() * r.P);
    (k < 28 ? out.coinSpots : out.heartSpots).push(pt);
  }

  /* minimap image (1 px per metre) */
  const MAP = { minX: BOUNDS.minX - 60, minZ: BOUNDS.minZ - 60, maxX: WATER_X + 220, maxZ: BOUNDS.maxZ + 60 };
  const mc = makeCanvas(Math.ceil(MAP.maxX - MAP.minX), Math.ceil(MAP.maxZ - MAP.minZ)), g = mc.getContext('2d');
  const X = (x) => x - MAP.minX, Z = (z) => z - MAP.minZ;
  g.fillStyle = '#56733f'; g.fillRect(0, 0, mc.width, mc.height);
  g.fillStyle = '#e3cc8f'; g.fillRect(X(BEACH_X0), 0, WATER_X - BEACH_X0, mc.height);
  g.fillStyle = '#2a86ad'; g.fillRect(X(WATER_X), 0, mc.width, mc.height);
  g.fillStyle = '#34363c'; g.fillRect(X(-HALF - ROAD / 2), Z(-HALF - ROAD / 2), S, S);
  const typeCol = { city: '#9c968b', park: '#6fa04a', temple: '#d6894a', police: '#4a78c8', hospital: '#e9e9e9', market: '#c9744a' };
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    g.fillStyle = typeCol[blockTypes[i + ',' + j]];
    g.fillRect(X(rc(i) + ROAD / 2), Z(rc(j) + ROAD / 2), BLOCK, BLOCK);
  }
  g.fillStyle = '#d9d3c7';
  for (const f of out.footprints) g.fillRect(X(f[0]), Z(f[1]), f[2], f[3]);
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(X(lhx), Z(lhz), 4, 0, Math.PI * 2); g.fill();
  out.map = { canvas: mc, minX: MAP.minX, minZ: MAP.minZ };

  const facadeList = [...facadeMats.values()];
  out.update = (dt, night, t) => {
    for (let k = 0; k < facadeList.length; k++) facadeList[k].emissiveIntensity = night * 1.1;
    lampMat.emissiveIntensity = night * 4;
    poolMat.opacity = night * 0.5;
    signMat.emissiveIntensity = 0.05 + night * 0.9;
    lhLampMat.emissiveIntensity = 0.3 + night * 3;
    beam.visible = night > 0.25;
    beam.rotation.y = t * 0.9;
    beamMat.opacity = 0.13 * night;
    foamMat.opacity = 0.5 + Math.sin(t * 1.4) * 0.25;
    foam.position.x = WATER_X + 0.6 + Math.sin(t * 1.4) * 0.8;
    waterNormal.offset.x = t * 0.004; waterNormal.offset.y = t * 0.002;
  };
  return out;
}

