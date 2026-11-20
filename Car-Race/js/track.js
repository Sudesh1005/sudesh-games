// Vegam Racing: track layouts, themes, road geometry, scenery and track queries.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const THEMES = {
  beach: {
    label: 'Day · Seaside', skyTop: 0x2a74d0, skyHorizon: 0xcfeeff, fog: 0xd6eefc, fogNear: 260, fogFar: 1400,
    sunDir: [0.45, 0.8, -0.4], sun: 0xfff2dc, sunInt: 2.8, sunGlow: 0xfff3c8,
    hemiSky: 0xd8ecff, hemiGround: 0x9a8a62, hemiInt: 1.0, exposure: 1.0, env: 1.0, night: false,
    ground: ['#7fa64a', '#6c9440', '#8fb556'], asphalt: '#46484e', wall: 'tyre',
  },
  city: {
    label: 'Night · City', skyTop: 0x04030c, skyHorizon: 0x2b1a4d, fog: 0x1c1233, fogNear: 140, fogFar: 900,
    sunDir: [-0.35, 0.7, 0.55], sun: 0x8ea6ff, sunInt: 0.7, sunGlow: 0x6070d0,
    hemiSky: 0x7a7ab8, hemiGround: 0x2a2236, hemiInt: 0.8, exposure: 1.15, env: 0.35, night: true,
    ground: ['#3a3a40', '#34343a', '#404047'], asphalt: '#3a3b41', wall: 'neon',
  },
  hills: {
    label: 'Sunset · Hills', skyTop: 0x34407e, skyHorizon: 0xffa25e, fog: 0xe6a47a, fogNear: 220, fogFar: 1200,
    sunDir: [0.85, 0.16, 0.35], sun: 0xffb27a, sunInt: 2.4, sunGlow: 0xffc890,
    hemiSky: 0xffc8a0, hemiGround: 0x4a4030, hemiInt: 0.9, exposure: 1.0, env: 0.8, night: false,
    ground: ['#5f7f3a', '#56733a', '#6b8a43'], asphalt: '#434349', wall: 'armco',
  },
};

export const TRACKS = [
  {
    id: 'marina', name: 'Marina Circuit', theme: 'beach', width: 15,
    blurb: 'Seaside sprint with long straights and fast sweepers.',
    points: [[0, 0], [150, 0], [250, 30], [290, 120], [240, 200], [140, 210], [60, 260], [-40, 300], [-160, 280], [-240, 200], [-250, 90], [-150, 0]],
  },
  {
    id: 'neon', name: 'Neon City', theme: 'city', width: 14,
    blurb: 'Night street circuit with tight corners between glowing towers.',
    points: [[0, 0], [160, 0], [210, 40], [210, 140], [170, 180], [80, 180], [40, 220], [40, 300], [0, 340], [-100, 340], [-150, 300], [-150, 200], [-200, 150], [-200, 50], [-150, 0]],
  },
  {
    id: 'ghat', name: 'Ghat Hills', theme: 'hills', width: 13,
    blurb: 'Twisty sunset run through pine forest below the mountains.',
    points: [[0, 0], [140, -20], [230, 20], [260, 110], [200, 170], [220, 260], [160, 330], [60, 310], [20, 230], [-60, 200], [-140, 250], [-220, 200], [-230, 100], [-160, 40], [-90, 10]],
  },
];

const sq = (v) => v * v;
const lerp = (a, b, k) => a + (b - a) * k;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ------------------------------------------------------------------ track data + queries */
export class Track {
  constructor(def) {
    this.def = def;
    this.theme = THEMES[def.theme];
    this.half = def.width / 2;
    this.runoff = 4.5; // grass between the curb and the wall
    const curve = new THREE.CatmullRomCurve3(def.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    this.length = curve.getLength();
    const N = (this.N = Math.round(this.length / 2));
    this.seg = this.length / N;
    const sp = curve.getSpacedPoints(N);
    const F = () => new Float32Array(N);
    this.px = F(); this.pz = F(); this.tx = F(); this.tz = F(); this.rx = F(); this.rz = F(); this.curv = F(); this.scurv = F();
    for (let i = 0; i < N; i++) { this.px[i] = sp[i].x; this.pz[i] = sp[i].z; }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a], l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l;
      this.rx[i] = -this.tz[i]; this.rz[i] = this.tx[i]; // right-hand side when driving along the track
    }
    const K = 4;
    for (let i = 0; i < N; i++) {
      const a = (i - K + N) % N, b = (i + K) % N;
      const cr = this.tx[a] * this.tz[b] - this.tz[a] * this.tx[b];
      const dt = this.tx[a] * this.tx[b] + this.tz[a] * this.tz[b];
      this.scurv[i] = Math.atan2(cr, dt) / (2 * K * this.seg); // > 0: bends to the right
      this.curv[i] = Math.abs(this.scurv[i]);
    }
    this.minX = Infinity; this.maxX = -Infinity; this.minZ = Infinity; this.maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      this.minX = Math.min(this.minX, this.px[i]); this.maxX = Math.max(this.maxX, this.px[i]);
      this.minZ = Math.min(this.minZ, this.pz[i]); this.maxZ = Math.max(this.maxZ, this.pz[i]);
    }
    this.cx = (this.minX + this.maxX) / 2; this.cz = (this.minZ + this.maxZ) / 2;
    // which side of the start straight is outside the loop (for the grandstand)
    this.outSign = this.inside(this.px[0] + this.rx[0] * 30, this.pz[0] + this.rz[0] * 30) ? -1 : 1;
  }

  inside(x, z) {
    const { px, pz, N } = this;
    let c = false;
    for (let i = 0, j = N - 1; i < N; j = i++) {
      if ((pz[i] > z) !== (pz[j] > z) && x < ((px[j] - px[i]) * (z - pz[i])) / (pz[j] - pz[i]) + px[i]) c = !c;
    }
    return c;
  }

  // Nearest track sample to (x, z). `out.i` is used as a search hint (-1 = search everything).
  locate(x, z, out) {
    const { N, px, pz } = this;
    let best = 0, bd = Infinity;
    if (out.i >= 0) {
      for (let k = -14; k <= 14; k++) {
        const i = (out.i + k + N) % N, dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (out.i < 0 || bd > 900) {
      bd = Infinity;
      for (let i = 0; i < N; i++) { const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    }
    const dx = x - px[best], dz = z - pz[best];
    out.i = best;
    out.along = dx * this.tx[best] + dz * this.tz[best];
    out.lat = dx * this.rx[best] + dz * this.rz[best];
    return out;
  }

  dist2(x, z) {
    let b = Infinity;
    for (let i = 0; i < this.N; i += 3) { const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz; if (d < b) b = d; }
    return b;
  }

  // Fastest safe speed at each sample for a car with this cornering grip, with braking zones before corners.
  speedProfile(grip, vmax, brake) {
    const N = this.N, v = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = Math.min(vmax, Math.sqrt(grip / Math.max(this.curv[i], 1e-5)));
    for (let pass = 0; pass < 2; pass++) {
      for (let k = N - 1; k >= 0; k--) { const n = (k + 1) % N; v[k] = Math.min(v[k], Math.sqrt(v[n] * v[n] + 2 * brake * this.seg)); }
    }
    return v;
  }
}

/* ------------------------------------------------------------------ helpers */
function canvasTex(w, h, draw, aniso = 4, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const _c = new THREE.Color();
function paint(g, hex) {
  _c.set(hex);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function M(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Collects many small vertex-coloured pieces and merges them into one mesh (one draw call).
class Batch {
  constructor() { this.parts = []; }
  add(geo, color, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (color !== null && color !== undefined) paint(g, color);
    if (matrix) g.applyMatrix4(matrix);
    this.parts.push(g);
    return g;
  }
  mesh(material) {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return new THREE.Mesh(g, material);
  }
}

// Flat strip along the track between two lateral offsets. Samples k0..k1 (may wrap past N).
function ribbon(t, lat0, lat1, y, vLen, k0 = 0, k1 = t.N) {
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (let k = k0; k <= k1; k++) {
    const i = ((k % t.N) + t.N) % t.N, d = k * t.seg;
    pos.push(t.px[i] + t.rx[i] * lat0, y, t.pz[i] + t.rz[i] * lat0, t.px[i] + t.rx[i] * lat1, y, t.pz[i] + t.rz[i] * lat1);
    uv.push(0, d / vLen, 1, d / vLen);
    if (k < k1) idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Vertical wall along the track at a lateral offset.
function wallGeo(t, lat, h, uLen) {
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (let k = 0; k <= t.N; k++) {
    const i = k % t.N, d = k * t.seg, x = t.px[i] + t.rx[i] * lat, z = t.pz[i] + t.rz[i] * lat;
    pos.push(x, 0, z, x, h, z);
    uv.push(d / uLen, 0, d / uLen, 1);
    if (k < t.N) idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function decalMat(map, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }, extra));
}

/* ------------------------------------------------------------------ sky */
function makeSky(th) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(th.skyTop) }, hor: { value: new THREE.Color(th.skyHorizon) }, bot: { value: new THREE.Color(th.fog) },
      sunDir: { value: new THREE.Vector3(...th.sunDir).normalize() }, sunCol: { value: new THREE.Color(th.sunGlow) },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, hor, bot, sunDir, sunCol; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0.0 ? mix(hor, top, pow(min(h * 1.6, 1.0), 0.7)) : mix(hor, bot, min(-h * 6.0, 1.0));
        float s = max(dot(d, sunDir), 0.0);
        c += sunCol * (pow(s, 700.0) * 2.5 + pow(s, 14.0) * 0.35);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), mat);
  m.renderOrder = -1; m.frustumCulled = false;
  return m;
}

function makeStars(rnd, cx, cz) {
  const n = 1400, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * Math.PI * 2, y = 0.08 + rnd() * 0.92, r = Math.sqrt(1 - y * y);
    a[i * 3] = cx + Math.cos(u) * r * 1900; a[i * 3 + 1] = y * 1900; a[i * 3 + 2] = cz + Math.sin(u) * r * 1900;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  p.frustumCulled = false;
  return p;
}

/* ------------------------------------------------------------------ track surfaces */
function roadTexture(th, aniso) {
  return canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = th.asphalt; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let k = 0; k < 9000; k++) {
      const v = (40 + r() * 80) | 0;
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.15 + r() * 0.2})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0.15, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.18)'); grd.addColorStop(0.85, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ececec'; g.fillRect(5, 0, 5, h); g.fillRect(w - 10, 0, 5, h);
  }, aniso);
}

function wallMaterial(kind, aniso) {
  if (kind === 'neon') {
    const map = canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#5d6069'; g.fillRect(0, 0, w, h); g.fillStyle = '#4c4f57'; g.fillRect(0, 26, w, 6); g.fillStyle = '#20e0ff'; g.fillRect(0, 12, w, 5); }, aniso);
    const emi = canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#20e0ff'; g.fillRect(0, 12, w, 5); }, aniso);
    return new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.8, side: THREE.DoubleSide });
  }
  if (kind === 'armco') {
    const map = canvasTex(128, 32, (g, w, h) => {
      g.fillStyle = '#9ea3ab'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c9cdd3'; g.fillRect(0, 8, w, 5); g.fillRect(0, 19, w, 5);
      g.fillStyle = '#6d7077'; g.fillRect(0, 0, w, 3); g.fillRect(60, 0, 6, h);
    }, aniso);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
  }
  const map = canvasTex(128, 32, (g, w, h) => {
    for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#f3f3f3' : '#d4262e'; g.fillRect(k * 32, 0, 32, h); }
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 2);
  }, aniso);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.85, side: THREE.DoubleSide });
}

function textTex(text, bg, fg, w = 512, h = 128, aniso = 4) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `bold ${Math.round(h * 0.55)}px Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  }, aniso, false);
}

/* ------------------------------------------------------------------ main builder */
export function buildTrackScene(t, opts = {}) {
  const low = !!opts.low, aniso = opts.aniso || 4;
  const th = t.theme, rnd = rng(hashStr(t.def.id));
  const group = new THREE.Group();
  const shadowy = (m, cast, receive) => { if (!low) { m.castShadow = !!cast; m.receiveShadow = !!receive; } return m; };

  group.add(makeSky(th));
  if (th.night) group.add(makeStars(rnd, t.cx, t.cz));

  const pad = 170;
  const area = { x0: t.minX - pad, x1: t.maxX + pad, z0: t.minZ - pad, z1: t.maxZ + pad };
  const clearOf = (x, z, r) => t.dist2(x, z) > sq(t.half + t.runoff + r);

  // ground
  const groundTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = th.ground[0]; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let k = 0; k < 2600; k++) { g.fillStyle = th.ground[1 + (k % 2)]; g.globalAlpha = 0.25 + r() * 0.35; g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
    g.globalAlpha = 1;
  }, aniso);
  groundTex.repeat.set(260, 260);
  const seaEdge = t.minZ - 75;
  const groundGeo = new THREE.PlaneGeometry(5200, 5200);
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(t.cx, 0, th === THEMES.beach ? seaEdge + 2600 : t.cz);
  group.add(shadowy(ground, false, true));

  // road, curbs, walls
  const road = new THREE.Mesh(ribbon(t, -t.half, t.half, 0.02, 20), decalMat(roadTexture(th, aniso)));
  group.add(shadowy(road, false, true));

  const curbTex = canvasTex(32, 64, (g, w, h) => { g.fillStyle = '#d42a2a'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#f2f2f2'; g.fillRect(0, h / 2, w, h / 2); }, aniso);
  const curbMat = decalMat(curbTex, { polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const on = new Uint8Array(t.N);
  for (let i = 0; i < t.N; i++) if (t.curv[i] > 1 / 130) for (let k = -6; k <= 6; k++) on[(i + k + t.N) % t.N] = 1;
  let s0 = on.indexOf(0);
  if (s0 < 0) {
    for (const side of [-1, 1]) group.add(shadowy(new THREE.Mesh(ribbon(t, side < 0 ? -t.half - 1.3 : t.half, side < 0 ? -t.half : t.half + 1.3, 0.025, 4), curbMat), false, true));
  } else {
    for (let k = s0; k < s0 + t.N; k++) {
      if (!on[k % t.N]) continue;
      let e = k; while (e + 1 < s0 + t.N && on[(e + 1) % t.N]) e++;
      group.add(shadowy(new THREE.Mesh(ribbon(t, -t.half - 1.3, -t.half, 0.025, 4, k, e + 1), curbMat), false, true));
      group.add(shadowy(new THREE.Mesh(ribbon(t, t.half, t.half + 1.3, 0.025, 4, k, e + 1), curbMat), false, true));
      k = e;
    }
  }

  const wMat = wallMaterial(th.wall, aniso);
  for (const side of [-1, 1]) group.add(shadowy(new THREE.Mesh(wallGeo(t, side * (t.half + t.runoff), 1.1, 4), wMat), true, true));

  // start line + grid boxes
  const chk = canvasTex(256, 64, (g, w, h) => { const c = 16; for (let x = 0; x < w / c; x++) for (let y = 0; y < h / c; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * c, y * c, c, c); } }, aniso, false);
  const ang0 = Math.atan2(t.tx[0], t.tz[0]);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(t.width, 2.4), decalMat(chk, { polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  line.rotation.set(-Math.PI / 2, ang0, 0, 'YXZ');
  line.position.set(t.px[0], 0.03, t.pz[0]);
  group.add(line);

  const DB = new Batch();
  const slot = new THREE.PlaneGeometry(2.8, 0.3); slot.rotateX(-Math.PI / 2);
  for (let k = 0; k < 6; k++) {
    const row = k >> 1, col = k & 1, i = (t.N - 3 - row * 5 - col * 2 + 2 + t.N) % t.N;
    const lat = (col ? 1 : -1) * Math.min(3.4, t.half * 0.45);
    DB.add(slot, 0xf2f2f2, M(t.px[i] + t.rx[i] * lat, 0.03, t.pz[i] + t.rz[i] * lat, Math.atan2(t.tx[i], t.tz[i])));
  }
  group.add(DB.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })));

  // scenery batches: B = lit, F = flat-shaded (rocks/mountains), E = glowing (lamps/neon)
  const B = new Batch(), F = new Batch(), E = new Batch();
  const C = { t, th, rnd, B, F, E, group, area, clearOf, low, aniso, seaEdge, shadowy };

  gantry(C, ang0);
  grandstand(C, ang0);
  boards(C);
  if (th === THEMES.beach) sceneryBeach(C);
  else if (th === THEMES.city) sceneryCity(C);
  else sceneryHills(C);

  const bm = B.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  if (bm) group.add(shadowy(bm, true, true));
  const fm = F.mesh(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  if (fm) group.add(shadowy(fm, true, true));
  const em = E.mesh(new THREE.MeshBasicMaterial({ vertexColors: true }));
  if (em) group.add(em);
  return group;
}

/* ------------------------------------------------------------------ shared trackside pieces */
function gantry(C, ang0) {
  const { t, B, group, aniso, th } = C;
  const off = t.half + 2.2, x0 = t.px[0], z0 = t.pz[0];
  const pillar = new THREE.BoxGeometry(0.8, 7.5, 0.8); pillar.translate(0, 3.75, 0);
  for (const s of [-1, 1]) B.add(pillar, 0x2c2a35, M(x0 + t.rx[0] * s * off, 0, z0 + t.rz[0] * s * off, ang0));
  const tex = textTex('VEGAM RACING', '#17131f', '#ffd23f', 1024, 128, aniso);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(off * 2 + 0.8, 1.6, 0.7),
    new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: th.night ? 0.9 : 0.25, roughness: 0.6 }));
  beam.position.set(x0, 7.2, z0); beam.rotation.y = ang0;
  group.add(beam);
}

function grandstand(C, ang0) {
  const { t, B, rnd } = C;
  const ang = ang0 + (t.outSign > 0 ? Math.PI : 0); // local +x points away from the track
  const base = t.half + t.runoff + 4;
  const m0 = M(t.px[0] + t.rx[0] * t.outSign * base, 0, t.pz[0] + t.rz[0] * t.outSign * base, ang);
  const L = 70;
  const at = (geo, color, x, y, z, ry = 0) => B.add(geo, color, new THREE.Matrix4().multiplyMatrices(m0, M(x, y, z, ry)));
  const crowd = [0xe74c3c, 0xf1c40f, 0x3498db, 0xffffff, 0x2ecc71, 0xff7f50, 0x9b59b6, 0x222222];
  const person = new THREE.BoxGeometry(0.45, 0.75, 0.4);
  for (let k = 0; k < 6; k++) {
    const hgt = (k + 1) * 0.55;
    at(new THREE.BoxGeometry(1.6, hgt, L), k % 2 ? 0x9a9aa4 : 0x2b6cd6, k * 1.6 + 0.8, hgt / 2, 0);
    for (let p = 0; p < 34; p++) at(person, crowd[(rnd() * crowd.length) | 0], k * 1.6 + 0.7, hgt + 0.37, (rnd() - 0.5) * (L - 1));
  }
  at(new THREE.BoxGeometry(0.4, 8.5, L), 0x55525f, 6 * 1.6 + 0.2, 4.25, 0);
  at(new THREE.BoxGeometry(11.5, 0.3, L + 2), 0xe8e8ee, 5.2, 8.6, 0);
  for (let z = -L / 2; z <= L / 2; z += 14) at(new THREE.BoxGeometry(0.3, 8.6, 0.3), 0x55525f, 0.2, 4.3, z);
}

function boards(C) {
  const { t, group, aniso, th } = C;
  const texts = [['VEGAM', '#ffd23f', '#1a1236'], ['NITRO X', '#1a1236', '#4dd2ff'], ['SPEED OIL', '#d7263d', '#ffffff'], ['RACE FM 98.3', '#ffffff', '#d7263d']];
  const mats = texts.map(([s, bg, fg]) => {
    const m = textTex(s, bg, fg, 512, 128, aniso);
    return new THREE.MeshStandardMaterial({ map: m, emissiveMap: m, emissive: 0xffffff, emissiveIntensity: th.night ? 0.7 : 0.08, roughness: 0.7, side: THREE.DoubleSide });
  });
  const geo = new THREE.PlaneGeometry(10, 2.4);
  let side = 1, n = 0;
  for (let i = 40; i < t.N - 30; i += 55) {
    let straight = true;
    for (let k = -8; k <= 8; k++) if (t.curv[(i + k) % t.N] > 1 / 400) { straight = false; break; }
    if (!straight) continue;
    const lat = side * (t.half + t.runoff + 0.4);
    const b = new THREE.Mesh(geo, mats[n++ % mats.length]);
    b.position.set(t.px[i] + t.rx[i] * lat, 1.8, t.pz[i] + t.rz[i] * lat);
    b.rotation.y = Math.atan2(-side * t.rx[i], -side * t.rz[i]);
    group.add(b);
    side = -side;
  }
}

/* ------------------------------------------------------------------ theme scenery */
function sceneryBeach(C) {
  const { t, B, rnd, group, area, clearOf, low, seaEdge, aniso } = C;
  // sand, surf and sea along the southern edge
  const sandTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e8d29a'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let k = 0; k < 900; k++) { g.fillStyle = r() < 0.5 ? '#dcc488' : '#f2e0ae'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, aniso);
  sandTex.repeat.set(140, 3);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(5200, 70), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(t.cx, 0.01, seaEdge - 35);
  group.add(C.shadowy(sand, false, true));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5200, 2600), new THREE.MeshStandardMaterial({ color: 0x1f78b4, roughness: 0.12, metalness: 0.25 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(t.cx, -0.05, seaEdge - 70 - 1300);
  group.add(sea);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(5200, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(t.cx, 0.02, seaEdge - 69);
  group.add(foam);

  const trunk = new THREE.CylinderGeometry(0.2, 0.32, 1, 6); trunk.translate(0, 0.5, 0);
  const leaf = new THREE.BoxGeometry(0.75, 0.06, 3.6); leaf.translate(0, 0, 1.8);
  const nut = new THREE.IcosahedronGeometry(0.3, 0);
  const n = low ? 90 : 170;
  for (let k = 0, tries = 0; k < n && tries < n * 10; tries++) {
    const x = lerp(area.x0, area.x1, rnd()), z = lerp(seaEdge - 50, area.z1, rnd());
    if (!clearOf(x, z, 6)) continue;
    k++;
    const h = 7 + rnd() * 5, tilt = (rnd() - 0.5) * 0.35, yaw = rnd() * Math.PI * 2;
    B.add(trunk, 0x8a6a48, M(x, 0, z, yaw, 1, h, 1, 0, tilt));
    const tx = x - h * Math.sin(tilt) * Math.cos(yaw), ty = h * Math.cos(tilt), tz = z + h * Math.sin(tilt) * Math.sin(yaw);
    for (let j = 0; j < 7; j++) B.add(leaf, j % 2 ? 0x3f8a2e : 0x4f9e35, M(tx, ty, tz, yaw + (j * Math.PI * 2) / 7, 1, 1, 0.8 + rnd() * 0.4, 0.35 + rnd() * 0.25));
    B.add(nut, 0x6b4a2a, M(tx + 0.2, ty - 0.3, tz));
  }
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5); pole.translate(0, 1.2, 0);
  const canopy = new THREE.ConeGeometry(1.7, 0.7, 8); canopy.translate(0, 2.55, 0);
  const towel = new THREE.BoxGeometry(1, 0.03, 1.9);
  const bright = [0xff5a5a, 0xffd23f, 0x3aa0ff, 0x38d39f, 0xff8c42, 0xc06cff];
  for (let k = 0; k < 40; k++) {
    const x = lerp(area.x0 + 60, area.x1 - 60, rnd()), z = seaEdge - 12 - rnd() * 45;
    B.add(pole, 0xdddddd, M(x, 0, z));
    B.add(canopy, bright[k % bright.length], M(x, 0, z, rnd() * 3));
    B.add(towel, bright[(k + 2) % bright.length], M(x + 1.4, 0.02, z, rnd() * 3));
  }
  const bush = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0, tries = 0; k < (low ? 50 : 110) && tries < 1500; tries++) {
    const x = lerp(area.x0, area.x1, rnd()), z = lerp(seaEdge + 5, area.z1, rnd());
    if (!clearOf(x, z, 3)) continue;
    k++;
    const s = 1 + rnd() * 1.6;
    B.add(bush, rnd() < 0.5 ? 0x4c8a34 : 0x5d9a3c, M(x, s * 0.4, z, rnd() * 3, s, s * 0.7, s));
  }
}

function windowTextures(rnd, aniso) {
  const W = 256, H = 256;
  const lit = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) lit.push(rnd() < 0.42 ? ['#ffd88a', '#ffe7b0', '#bfe3ff', '#ffc070'][(rnd() * 4) | 0] : null);
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = '#4a4f5c'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 8; r++) {
      g.fillStyle = '#3c404b'; g.fillRect(0, r * 32 + 29, W, 3);
      for (let c = 0; c < 4; c++) { g.fillStyle = lit[r * 4 + c] ? '#d8c9a0' : '#1b2230'; g.fillRect(c * 64 + 10, r * 32 + 7, 44, 19); }
    }
  }, aniso);
  const emi = canvasTex(W, H, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) { const l = lit[r * 4 + c]; if (l) { g.fillStyle = l; g.fillRect(c * 64 + 10, r * 32 + 7, 44, 19); } }
  }, aniso);
  return { map, emi };
}

function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const k = f * 4 + v;
    if (f === 2 || f === 3) { uv.setXY(k, 0.004, 0.996); continue; }
    uv.setXY(k, uv.getX(k) * ((f < 2 ? d : w) / 16), uv.getY(k) * (h / 24));
  }
  return g;
}

function sceneryCity(C) {
  const { t, B, E, rnd, group, area, clearOf, low, aniso } = C;
  const { map, emi } = windowTextures(rnd, aniso);
  const BB = new Batch();
  const placed = [];
  const tints = [0xffffff, 0xd8dcff, 0xffe9d6, 0xcfe7e0, 0xe2d6ff];
  const neon = [0xff2bd6, 0x20e0ff, 0xffd23f, 0x7dff6a, 0xff5a36];
  const tryBuilding = (x, z, w, d, h, ry) => {
    const rad = Math.hypot(w, d) / 2;
    if (!clearOf(x, z, 5 + rad)) return false;
    for (const b of placed) if (sq(b.x - x) + sq(b.z - z) < sq(b.r + rad + 2)) return false;
    placed.push({ x, z, r: rad });
    const g = buildingGeo(w, h, d);
    BB.add(g, tints[(rnd() * tints.length) | 0], M(x, 0, z, ry)); g.dispose();
    if (rnd() < 0.3) E.add(new THREE.BoxGeometry(w * 0.7, 2.4, 0.4), neon[(rnd() * neon.length) | 0], M(x, h + 1.4, z, ry));
    return true;
  };
  for (let i = 0; i < t.N; i += 8) {
    for (const side of [-1, 1]) {
      const w = 12 + rnd() * 16, d = 12 + rnd() * 16, h = 16 + rnd() * rnd() * 90;
      const off = t.half + t.runoff + 7 + rnd() * 25 + Math.max(w, d) / 2;
      tryBuilding(t.px[i] + t.rx[i] * side * off, t.pz[i] + t.rz[i] * side * off, w, d, h, Math.atan2(t.tx[i], t.tz[i]));
    }
  }
  const step = low ? 52 : 40;
  for (let x = area.x0; x < area.x1; x += step) for (let z = area.z0; z < area.z1; z += step) {
    if (rnd() < 0.2) continue;
    const w = 14 + rnd() * 18, d = 14 + rnd() * 18;
    tryBuilding(x + (rnd() - 0.5) * 10, z + (rnd() - 0.5) * 10, w, d, 18 + rnd() * rnd() * 70, 0);
  }
  const bm = BB.mesh(new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 1.2, vertexColors: true, roughness: 0.75, metalness: 0.1 }));
  if (bm) group.add(C.shadowy(bm, true, true));

  // street lamps with light pools on the road
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 8, 6); pole.translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(0.12, 0.12, 3);
  const head = new THREE.BoxGeometry(0.5, 0.16, 0.9);
  const poolTex = canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,205,140,0.6)'); r.addColorStop(1, 'rgba(255,205,140,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, 1, false);
  const PB = new Batch();
  const pool = new THREE.PlaneGeometry(16, 16); pool.rotateX(-Math.PI / 2);
  let side = 1;
  for (let i = 0; i < t.N; i += 15) {
    const ry = Math.atan2(t.rx[i], t.rz[i]);
    const lp = side * (t.half + t.runoff + 1.0), lh = side * (t.half + t.runoff - 1.8);
    B.add(pole, 0x2a2a30, M(t.px[i] + t.rx[i] * lp, 0, t.pz[i] + t.rz[i] * lp));
    const lm = (lp + lh) / 2;
    B.add(arm, 0x2a2a30, M(t.px[i] + t.rx[i] * lm, 7.95, t.pz[i] + t.rz[i] * lm, ry));
    E.add(head, 0xffe6b0, M(t.px[i] + t.rx[i] * lh, 7.85, t.pz[i] + t.rz[i] * lh, ry));
    const lq = side * (t.half - 1.5);
    PB.add(pool, null, M(t.px[i] + t.rx[i] * lq, 0.05, t.pz[i] + t.rz[i] * lq));
    side = -side;
  }
  // PB pieces have no colour attribute; merge them on their own
  const pm = PB.mesh(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }));
  if (pm) group.add(pm);
}

function mountainGeo(r, h, rnd, snow) {
  const g = new THREE.ConeGeometry(r, h, 10, 4, true); g.translate(0, h / 2, 0);
  const p = g.attributes.position, cols = new Float32Array(p.count * 3);
  const lowC = new THREE.Color(0x4f6b38), midC = new THREE.Color(0x6f5f4a), snowC = new THREE.Color(0xf4efe8), c = new THREE.Color();
  const seed = rnd() * 100;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = y / h;
    if (k < 0.99) {
      const s = Math.sin(x * 12.9898 + z * 78.233 + y * 3.17 + seed) * 43758.5453, f = s - Math.floor(s);
      const s2 = Math.sin(x * 39.34 + z * 11.13 + seed) * 24634.6345, f2 = s2 - Math.floor(s2);
      p.setXYZ(i, x * (0.85 + f * 0.3), y + (f2 - 0.5) * h * 0.08 * (1 - k), z * (0.85 + f2 * 0.3));
    }
    c.copy(lowC).lerp(midC, Math.min(1, k * 1.3));
    if (snow && k > 0.72) c.copy(snowC);
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

function sceneryHills(C) {
  const { t, B, F, rnd, area, clearOf, low } = C;
  const ext = Math.max(t.maxX - t.minX, t.maxZ - t.minZ) / 2;
  for (let k = 0; k < 36; k++) {
    const a = (k / 36) * Math.PI * 2 + rnd() * 0.15, R = ext + 260 + rnd() * 420;
    const r = 90 + rnd() * 140, h = 70 + rnd() * 150;
    const g = mountainGeo(r, h, rnd, h > 150);
    F.add(g, null, M(t.cx + Math.cos(a) * R, -2, t.cz + Math.sin(a) * R, rnd() * 6)); g.dispose();
  }
  for (let k = 0, tries = 0; k < 14 && tries < 400; tries++) {
    const x = lerp(area.x0, area.x1, rnd()), z = lerp(area.z0, area.z1, rnd()), r = 25 + rnd() * 30;
    if (!clearOf(x, z, r + 12)) continue;
    k++;
    const g = mountainGeo(r, 14 + rnd() * 22, rnd, false);
    F.add(g, null, M(x, -1, z, rnd() * 6)); g.dispose();
  }
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2, 5); trunk.translate(0, 1, 0);
  const c1 = new THREE.ConeGeometry(2.2, 4, 7); c1.translate(0, 3.6, 0);
  const c2 = new THREE.ConeGeometry(1.7, 3.4, 7); c2.translate(0, 5.5, 0);
  const c3 = new THREE.ConeGeometry(1.1, 2.6, 7); c3.translate(0, 7.3, 0);
  const greens = [0x2f5a2c, 0x376634, 0x2a4f2a, 0x41703a];
  for (let k = 0, tries = 0; k < (low ? 150 : 280) && tries < 4000; tries++) {
    const x = lerp(area.x0, area.x1, rnd()), z = lerp(area.z0, area.z1, rnd());
    if (!clearOf(x, z, 5)) continue;
    k++;
    const s = 0.8 + rnd() * 0.8, ry = rnd() * 6, col = greens[(rnd() * greens.length) | 0];
    const m = M(x, 0, z, ry, s, s, s);
    B.add(trunk, 0x5a4030, m); B.add(c1, col, m); B.add(c2, col, m); B.add(c3, col, m);
  }
  const rock = new THREE.DodecahedronGeometry(1, 0);
  for (let k = 0, tries = 0; k < 70 && tries < 1500; tries++) {
    const x = lerp(area.x0, area.x1, rnd()), z = lerp(area.z0, area.z1, rnd());
    if (!clearOf(x, z, 3)) continue;
    k++;
    const s = 0.6 + rnd() * 2.2;
    F.add(rock, rnd() < 0.5 ? 0x7d7468 : 0x8c8378, M(x, s * 0.3, z, rnd() * 6, s, s * 0.7, s * 1.2));
  }
}
