// Kaathu Riders: routes, themes, road geometry, scenery and road queries.
// Routes are point-to-point roads (not loops) with lanes; same-direction lanes are on the left.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const THEMES = {
  beach: {
    label: 'Day · Seaside', skyTop: 0x2a74d0, skyHorizon: 0xcfeeff, fog: 0xd6eefc, fogNear: 260, fogFar: 1300,
    sunDir: [0.45, 0.8, 0.35], sun: 0xfff2dc, sunInt: 2.8, sunGlow: 0xfff3c8,
    hemiSky: 0xd8ecff, hemiGround: 0x9a8a62, hemiInt: 1.0, exposure: 1.0, env: 1.0, night: false,
    ground: ['#86a94e', '#739a45', '#94b95b'], asphalt: '#47494f', shoulder: '#a39a86',
  },
  city: {
    label: 'Night · City', skyTop: 0x04030c, skyHorizon: 0x2b1a4d, fog: 0x1c1233, fogNear: 120, fogFar: 820,
    sunDir: [-0.35, 0.7, 0.55], sun: 0x8ea6ff, sunInt: 0.7, sunGlow: 0x6070d0,
    hemiSky: 0x7a7ab8, hemiGround: 0x2a2236, hemiInt: 0.85, exposure: 1.15, env: 0.35, night: true,
    ground: ['#3a3a40', '#34343a', '#404047'], asphalt: '#3a3b41', shoulder: '#6c6a70',
  },
  hills: {
    label: 'Sunset · Hills', skyTop: 0x34407e, skyHorizon: 0xffa25e, fog: 0xe6a47a, fogNear: 200, fogFar: 1100,
    sunDir: [0.85, 0.16, 0.35], sun: 0xffb27a, sunInt: 2.4, sunGlow: 0xffc890,
    hemiSky: 0xffc8a0, hemiGround: 0x4a4030, hemiInt: 0.9, exposure: 1.0, env: 0.8, night: false,
    ground: ['#5f7f3a', '#56733a', '#6b8a43'], asphalt: '#434349', shoulder: '#8a7a62',
  },
};

// lanes: [same direction, oncoming]. seg = spacing of the random bends, turn = how sharp, maxHead = how far the road may swing.
export const ROUTES = [
  {
    id: 'city', name: 'City Rush', theme: 'city', lanes: [2, 2], laneW: 3.6, length: 3000, seg: [110, 170], turn: 0.55, maxHead: 1.0, seed: 11,
    blurb: 'Night ride through downtown. Two-way road, so watch for oncoming buses.',
  },
  {
    id: 'coast', name: 'Coastal Highway', theme: 'beach', lanes: [3, 0], laneW: 3.7, length: 3400, seg: [150, 220], turn: 0.28, maxHead: 0.3, seed: 23,
    blurb: 'Flat-out three-lane highway by the sea, weaving between trucks.',
  },
  {
    id: 'ghat', name: 'Ghat Climb', theme: 'hills', lanes: [1, 1], laneW: 3.9, length: 2500, seg: [75, 115], turn: 0.75, maxHead: 1.3, seed: 37,
    blurb: 'Narrow mountain road full of bends, with traffic coming the other way.',
  },
];

const sq = (v) => v * v;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function routePoints(def) {
  const r = rng(def.seed);
  const pts = [[0, -60], [0, 0], [0, 120]];
  let x = 0, z = 120, h = 0, len = 180;
  while (len < def.length) {
    const s = lerp(def.seg[0], def.seg[1], r());
    h = clamp(h + (r() * 2 - 1) * def.turn, -def.maxHead, def.maxHead); // heading stays within ±maxHead of +z, so the road never crosses itself
    x += Math.sin(h) * s; z += Math.cos(h) * s;
    pts.push([x, z]); len += s;
  }
  for (const s of [160, 110]) { x += Math.sin(h) * s; z += Math.cos(h) * s; pts.push([x, z]); }
  return pts;
}

/* ------------------------------------------------------------------ road data + queries */
export class Road {
  constructor(def) {
    this.def = def;
    this.theme = THEMES[def.theme];
    this.laneW = def.laneW; this.same = def.lanes[0]; this.opp = def.lanes[1];
    this.lanes = this.same + this.opp;
    this.width = this.laneW * this.lanes; this.half = this.width / 2;
    this.shoulder = def.theme === 'city' ? 3.2 : 2.6;
    const curve = new THREE.CatmullRomCurve3(routePoints(def).map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    this.length = curve.getLength();
    const segs = Math.round(this.length / 2);
    this.seg = this.length / segs;
    const sp = curve.getSpacedPoints(segs);
    const N = (this.N = segs + 1);
    const F = () => new Float32Array(N);
    this.px = F(); this.pz = F(); this.tx = F(); this.tz = F(); this.rx = F(); this.rz = F(); this.curv = F();
    for (let i = 0; i < N; i++) { this.px[i] = sp[i].x; this.pz[i] = sp[i].z; }
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
      const dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a], l = Math.hypot(dx, dz) || 1;
      this.tx[i] = dx / l; this.tz[i] = dz / l; this.rx[i] = -this.tz[i]; this.rz[i] = this.tx[i];
    }
    const K = 4;
    for (let i = 0; i < N; i++) {
      const a = Math.max(0, i - K), b = Math.min(N - 1, i + K);
      const cr = this.tx[a] * this.tz[b] - this.tz[a] * this.tx[b], dt = this.tx[a] * this.tx[b] + this.tz[a] * this.tz[b];
      this.curv[i] = Math.abs(Math.atan2(cr, dt)) / Math.max(1, (b - a) * this.seg);
    }
    this.minX = Infinity; this.maxX = -Infinity; this.minZ = Infinity; this.maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      this.minX = Math.min(this.minX, this.px[i]); this.maxX = Math.max(this.maxX, this.px[i]);
      this.minZ = Math.min(this.minZ, this.pz[i]); this.maxZ = Math.max(this.maxZ, this.pz[i]);
    }
    this.startS = 60;
    this.finishS = this.length - 90;
  }

  laneLat(k) { return -this.half + this.laneW * (k + 0.5); }
  isOpp(k) { return k >= this.same; }

  // Nearest sample to (x, z). out.i is a search hint (-1 = search everything).
  locate(x, z, out) {
    const { N, px, pz } = this;
    let best = 0, bd = Infinity;
    if (out.i >= 0) {
      const a = Math.max(0, out.i - 14), b = Math.min(N - 1, out.i + 14);
      for (let i = a; i <= b; i++) { const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    }
    if (out.i < 0 || bd > 900) {
      bd = Infinity;
      for (let i = 0; i < N; i++) { const dx = x - px[i], dz = z - pz[i], d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } }
    }
    const dx = x - px[best], dz = z - pz[best];
    out.i = best;
    out.along = dx * this.tx[best] + dz * this.tz[best];
    out.lat = dx * this.rx[best] + dz * this.rz[best];
    out.s = best * this.seg + out.along;
    return out;
  }

  // Position and direction at distance s along the road, `lat` metres to the right.
  at(s, lat, out) {
    const f = clamp(s / this.seg, 0, this.N - 1.001), i = Math.floor(f), k = f - i;
    out.tx = this.tx[i]; out.tz = this.tz[i];
    out.x = lerp(this.px[i], this.px[i + 1], k) + this.rx[i] * lat;
    out.z = lerp(this.pz[i], this.pz[i + 1], k) + this.rz[i] * lat;
    out.i = i;
    return out;
  }

  dist2(x, z) {
    let b = Infinity;
    for (let i = 0; i < this.N; i += 3) { const dx = x - this.px[i], dz = z - this.pz[i], d = dx * dx + dz * dz; if (d < b) b = d; }
    return b;
  }

  speedProfile(grip, vmax, brake) {
    const N = this.N, v = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = Math.min(vmax, Math.sqrt(grip / Math.max(this.curv[i], 1e-5)));
    for (let k = N - 2; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] * v[k + 1] + 2 * brake * this.seg));
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
export function M(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Collects many small vertex-coloured pieces and merges them into one mesh.
export class Batch {
  constructor() { this.parts = []; }
  add(geo, color, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (color !== null && color !== undefined) paint(g, color);
    if (matrix) g.applyMatrix4(matrix);
    this.parts.push(g);
    return g;
  }
  geometry() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return g;
  }
  mesh(material) { const g = this.geometry(); return g ? new THREE.Mesh(g, material) : null; }
}

function ribbon(t, lat0, lat1, y, vLen, k0 = 0, k1 = t.N - 1) {
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (let i = k0; i <= k1; i++) {
    const d = i * t.seg;
    pos.push(t.px[i] + t.rx[i] * lat0, y, t.pz[i] + t.rz[i] * lat0, t.px[i] + t.rx[i] * lat1, y, t.pz[i] + t.rz[i] * lat1);
    uv.push(0, d / vLen, 1, d / vLen);
    if (i < k1) idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function wallGeo(t, lat, h, uLen) {
  const pos = [], uv = [], idx = [];
  let n = 0;
  for (let i = 0; i < t.N; i++) {
    const d = i * t.seg, x = t.px[i] + t.rx[i] * lat, z = t.pz[i] + t.rz[i] * lat;
    pos.push(x, 0, z, x, h, z);
    uv.push(d / uLen, 0, d / uLen, 1);
    if (i < t.N - 1) idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    n += 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function decalMat(map, off = -2, extra = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off }, extra));
}

function textTex(text, bg, fg, w = 512, h = 128, aniso = 4) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `bold ${Math.round(h * 0.55)}px Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 2);
  }, aniso, false);
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
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  m.renderOrder = -1; m.frustumCulled = false;
  return m;
}

function makeStars(rnd) {
  const n = 1400, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = rnd() * Math.PI * 2, y = 0.08 + rnd() * 0.92, r = Math.sqrt(1 - y * y);
    a[i * 3] = Math.cos(u) * r * 1400; a[i * 3 + 1] = y * 1400; a[i * 3 + 2] = Math.sin(u) * r * 1400;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 }));
  p.frustumCulled = false;
  return p;
}

/* ------------------------------------------------------------------ road surface */
function roadTexture(t, aniso) {
  const L = t.lanes, W = L * 64, H = 512;
  return canvasTex(W, H, (g) => {
    g.fillStyle = t.theme.asphalt; g.fillRect(0, 0, W, H);
    const r = rng(7);
    for (let k = 0; k < 4000 * L; k++) {
      const v = (40 + r() * 80) | 0;
      g.fillStyle = `rgba(${v},${v},${v + 4},${0.15 + r() * 0.2})`;
      g.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
    }
    g.fillStyle = '#ececec'; g.fillRect(3, 0, 4, H); g.fillRect(W - 7, 0, 4, H);
    for (let k = 1; k < L; k++) {
      const x = k * 64;
      if (k === t.same && t.opp > 0) { g.fillStyle = '#f2c230'; g.fillRect(x - 5, 0, 3, H); g.fillRect(x + 2, 0, 3, H); }
      else { g.fillStyle = '#ececec'; g.fillRect(x - 2, 0, 4, 160); g.fillRect(x - 2, 256, 4, 160); }
    }
  }, aniso);
}

function groundTexture(th, aniso) {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = th.ground[0]; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let k = 0; k < 2600; k++) { g.fillStyle = th.ground[1 + (k % 2)]; g.globalAlpha = 0.25 + r() * 0.35; g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
    g.globalAlpha = 1;
  }, aniso);
  t.repeat.set(300, 300);
  return t;
}

function railMaterial(kind, aniso) {
  if (kind === 'city') {
    const map = canvasTex(64, 32, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#2a2a33'; g.fillRect(0, 2, w, 5); g.fillRect(0, 16, w, 3); g.fillRect(0, 0, 4, h); g.fillRect(32, 0, 3, h);
    }, aniso);
    return new THREE.MeshStandardMaterial({ map, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
  }
  if (kind === 'median') {
    const map = canvasTex(64, 32, (g, w, h) => { g.fillStyle = '#b9b6ad'; g.fillRect(0, 0, w, h); g.fillStyle = '#9b988f'; g.fillRect(0, 24, w, 8); g.fillStyle = '#f2c230'; g.fillRect(0, 4, w, 3); }, aniso);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.9, side: THREE.DoubleSide });
  }
  const map = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#9ea3ab'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9cdd3'; g.fillRect(0, 8, w, 5); g.fillRect(0, 19, w, 5);
    g.fillStyle = '#6d7077'; g.fillRect(0, 0, w, 3); g.fillRect(60, 0, 6, h);
  }, aniso);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide });
}

/* ------------------------------------------------------------------ main builder */
export function buildRoadScene(t, opts = {}) {
  const low = !!opts.low, aniso = opts.aniso || 4;
  const th = t.theme, rnd = rng(t.def.seed * 7 + 1);
  const group = new THREE.Group();
  const shadowy = (m, cast, receive) => { if (!low) { m.castShadow = !!cast; m.receiveShadow = !!receive; } return m; };
  const sky = makeSky(th);
  group.add(sky);
  group.userData.follow = [sky];
  if (th.night) { const st = makeStars(rnd); group.add(st); group.userData.follow.push(st); }

  const edge = t.half + t.shoulder;
  const clearOf = (x, z, r) => t.dist2(x, z) > sq(edge + r);
  const band = (minOff, maxOff) => {
    const i = (rnd() * t.N) | 0, side = rnd() < 0.5 ? -1 : 1, d = lerp(minOff, maxOff, rnd());
    return [t.px[i] + t.rx[i] * side * d, t.pz[i] + t.rz[i] * side * d, i, side];
  };

  // ground
  const cx = (t.minX + t.maxX) / 2, cz = (t.minZ + t.maxZ) / 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: groundTexture(th, aniso), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz);
  group.add(shadowy(ground, false, true));

  // road + shoulders
  group.add(shadowy(new THREE.Mesh(ribbon(t, -t.half, t.half, 0.02, 12), decalMat(roadTexture(t, aniso))), false, true));
  const shTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = th.shoulder; g.fillRect(0, 0, w, h);
    const r = rng(5);
    if (th.night) { g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let k = 0; k <= 64; k += 16) { g.beginPath(); g.moveTo(0, k); g.lineTo(w, k); g.moveTo(k, 0); g.lineTo(k, h); g.stroke(); } }
    else for (let k = 0; k < 500; k++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, aniso);
  const shMat = decalMat(shTex, -1);
  group.add(shadowy(new THREE.Mesh(ribbon(t, -edge, -t.half, 0.025, 3), shMat), false, true));
  group.add(shadowy(new THREE.Mesh(ribbon(t, t.half, edge, 0.025, 3), shMat), false, true));

  // barriers along both edges
  const left = railMaterial(th.night ? 'city' : 'armco', aniso);
  const right = th === THEMES.beach ? railMaterial('median', aniso) : left;
  group.add(shadowy(new THREE.Mesh(wallGeo(t, -edge, 1.0, 4), left), true, true));
  group.add(shadowy(new THREE.Mesh(wallGeo(t, edge, th === THEMES.beach ? 1.1 : 1.0, 4), right), true, true));

  // start / finish lines and gantries
  const chk = canvasTex(256, 64, (g, w, h) => { const c = 16; for (let x = 0; x < w / c; x++) for (let y = 0; y < h / c; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * c, y * c, c, c); } }, aniso, false);
  const B = new Batch(), F = new Batch(), E = new Batch();
  for (const [s, label, col] of [[t.startS, 'START', '#4dd2ff'], [t.finishS, 'FINISH', '#ffd23f']]) {
    const i = Math.round(s / t.seg), ang = Math.atan2(t.tx[i], t.tz[i]);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(t.width, 2.4), decalMat(chk, -4));
    line.rotation.set(-Math.PI / 2, ang, 0, 'YXZ'); line.position.set(t.px[i], 0.03, t.pz[i]);
    group.add(line);
    const off = edge + 0.6;
    const pillar = new THREE.BoxGeometry(0.8, 7.5, 0.8); pillar.translate(0, 3.75, 0);
    for (const sd of [-1, 1]) B.add(pillar, 0x2c2a35, M(t.px[i] + t.rx[i] * sd * off, 0, t.pz[i] + t.rz[i] * sd * off, ang));
    const tex = textTex(label, '#17131f', col, 1024, 128, aniso);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(off * 2 + 0.8, 1.7, 0.7),
      new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: th.night ? 0.9 : 0.25, roughness: 0.6 }));
    beam.position.set(t.px[i], 7.2, t.pz[i]); beam.rotation.y = ang;
    group.add(beam);
  }
  crowd(t, B, rnd, Math.round(t.finishS / t.seg), edge);

  // distance-to-finish signs every kilometre
  for (let km = 1; km * 1000 < t.finishS - 200; km++) {
    const i = Math.round((t.finishS - km * 1000) / t.seg), lat = -(edge + 1.2);
    const tex = textTex(`FINISH ${km} KM`, '#1f6b3a', '#ffffff', 512, 128, aniso);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: th.night ? 0.6 : 0.05, side: THREE.DoubleSide }));
    board.position.set(t.px[i] + t.rx[i] * lat, 3.4, t.pz[i] + t.rz[i] * lat);
    board.rotation.y = Math.atan2(-t.tx[i], -t.tz[i]); // face oncoming riders
    group.add(board);
    const post = new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6); post.translate(0, 1.4, 0);
    B.add(post, 0x666a70, M(t.px[i] + t.rx[i] * lat, 0, t.pz[i] + t.rz[i] * lat));
  }

  const C = { t, th, rnd, B, F, E, group, clearOf, band, low, aniso, edge, shadowy };
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

function crowd(t, B, rnd, i, edge) {
  const ang = Math.atan2(t.tx[i], t.tz[i]);
  const cols = [0xe74c3c, 0xf1c40f, 0x3498db, 0xffffff, 0x2ecc71, 0xff7f50, 0x9b59b6, 0x222222];
  const person = new THREE.BoxGeometry(0.45, 1.6, 0.35); person.translate(0, 0.8, 0);
  for (const side of [-1, 1]) for (let k = 0; k < 60; k++) {
    const s = (rnd() - 0.5) * 40, d = edge + 0.8 + rnd() * 3;
    const j = Math.max(0, Math.min(t.N - 1, i + Math.round(s / t.seg)));
    B.add(person, cols[(rnd() * cols.length) | 0], M(t.px[j] + t.rx[j] * side * d, 0, t.pz[j] + t.rz[j] * side * d, ang + rnd()));
  }
}

/* ------------------------------------------------------------------ theme scenery */
function sceneryBeach(C) {
  const { t, B, rnd, group, clearOf, band, low, aniso } = C;
  // the sea lies beyond the road's left (+x) side
  const coast = t.maxX + 60, zMid = (t.minZ + t.maxZ) / 2, zLen = t.maxZ - t.minZ + 3000;
  const sandTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#e8d29a'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let k = 0; k < 900; k++) { g.fillStyle = r() < 0.5 ? '#dcc488' : '#f2e0ae'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, aniso);
  sandTex.repeat.set(3, zLen / 20);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(60, zLen), new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(coast + 30, 0.01, zMid);
  group.add(C.shadowy(sand, false, true));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, zLen), new THREE.MeshStandardMaterial({ color: 0x1f78b4, roughness: 0.12, metalness: 0.25 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(coast + 60 + 1500, 0.03, zMid);
  group.add(sea);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(3, zLen), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
  foam.rotation.x = -Math.PI / 2; foam.position.set(coast + 60, 0.04, zMid);
  group.add(foam);

  const trunk = new THREE.CylinderGeometry(0.2, 0.32, 1, 6); trunk.translate(0, 0.5, 0);
  const leaf = new THREE.BoxGeometry(0.75, 0.06, 3.6); leaf.translate(0, 0, 1.8);
  const nut = new THREE.IcosahedronGeometry(0.3, 0);
  const n = Math.round((t.length / 1000) * (low ? 45 : 80));
  for (let k = 0, tries = 0; k < n && tries < n * 10; tries++) {
    const [x, z] = band(6, 160);
    if (x > coast + 55 || !clearOf(x, z, 4)) continue;
    k++;
    const h = 7 + rnd() * 5, tilt = (rnd() - 0.5) * 0.35, yaw = rnd() * Math.PI * 2;
    B.add(trunk, 0x8a6a48, M(x, 0, z, yaw, 1, h, 1, 0, tilt));
    const tx = x - h * Math.sin(tilt) * Math.cos(yaw), ty = h * Math.cos(tilt), tz = z + h * Math.sin(tilt) * Math.sin(yaw);
    for (let j = 0; j < 7; j++) B.add(leaf, j % 2 ? 0x3f8a2e : 0x4f9e35, M(tx, ty, tz, yaw + (j * Math.PI * 2) / 7, 1, 1, 0.8 + rnd() * 0.4, 0.35 + rnd() * 0.25));
    B.add(nut, 0x6b4a2a, M(tx + 0.2, ty - 0.3, tz));
  }
  const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5); pole.translate(0, 1.2, 0);
  const canopy = new THREE.ConeGeometry(1.7, 0.7, 8); canopy.translate(0, 2.55, 0);
  const bright = [0xff5a5a, 0xffd23f, 0x3aa0ff, 0x38d39f, 0xff8c42, 0xc06cff];
  for (let k = 0; k < (t.length / 1000) * 20; k++) {
    const x = coast + 12 + rnd() * 40, z = lerp(t.minZ, t.maxZ, rnd());
    B.add(pole, 0xdddddd, M(x, 0, z));
    B.add(canopy, bright[k % bright.length], M(x, 0, z, rnd() * 3));
  }
  const hut = new THREE.BoxGeometry(4, 3, 4); hut.translate(0, 1.5, 0);
  const roof = new THREE.ConeGeometry(3.6, 2, 4); roof.translate(0, 4, 0);
  const bush = new THREE.IcosahedronGeometry(1, 0);
  for (let k = 0, tries = 0; k < (t.length / 1000) * (low ? 30 : 60) && tries < 6000; tries++) {
    const [x, z, i] = band(8, 220);
    if (x > coast - 5 || !clearOf(x, z, 4)) continue;
    k++;
    if (rnd() < 0.18) {
      const ry = Math.atan2(t.tx[i], t.tz[i]);
      B.add(hut, [0xf3e3c3, 0xd9f0ff, 0xffd6c9][k % 3], M(x, 0, z, ry)); B.add(roof, 0xb5523b, M(x, 0, z, ry + Math.PI / 4));
    } else {
      const s = 1 + rnd() * 1.6;
      B.add(bush, rnd() < 0.5 ? 0x4c8a34 : 0x5d9a3c, M(x, s * 0.4, z, rnd() * 3, s, s * 0.7, s));
    }
  }
}

function windowTextures(rnd, aniso) {
  const W = 256, H = 256, lit = [];
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
  const { t, B, E, rnd, group, clearOf, low, aniso, edge } = C;
  const { map, emi } = windowTextures(rnd, aniso);
  const BB = new Batch(), placed = [];
  const tints = [0xffffff, 0xd8dcff, 0xffe9d6, 0xcfe7e0, 0xe2d6ff];
  const neon = [0xff2bd6, 0x20e0ff, 0xffd23f, 0x7dff6a, 0xff5a36];
  const tryBuilding = (x, z, w, d, h, ry) => {
    const rad = Math.hypot(w, d) / 2;
    if (!clearOf(x, z, 3 + rad)) return;
    for (let k = Math.max(0, placed.length - 60); k < placed.length; k++) { const b = placed[k]; if (sq(b.x - x) + sq(b.z - z) < sq(b.r + rad + 2)) return; }
    placed.push({ x, z, r: rad });
    const g = buildingGeo(w, h, d);
    BB.add(g, tints[(rnd() * tints.length) | 0], M(x, 0, z, ry)); g.dispose();
    if (rnd() < 0.3) E.add(new THREE.BoxGeometry(w * 0.7, 2.4, 0.4), neon[(rnd() * neon.length) | 0], M(x, h + 1.4, z, ry));
  };
  const rows = low ? 2 : 3;
  for (let i = 0; i < t.N; i += 7) {
    const ry = Math.atan2(t.tx[i], t.tz[i]);
    for (const side of [-1, 1]) {
      let off = edge + 4;
      for (let row = 0; row < rows; row++) {
        const w = 12 + rnd() * 14, d = 12 + rnd() * 14, h = row === 0 ? 14 + rnd() * rnd() * 70 : 22 + rnd() * 80;
        off += d / 2;
        tryBuilding(t.px[i] + t.rx[i] * side * off, t.pz[i] + t.rz[i] * side * off, w, d, h, ry);
        off += d / 2 + 6 + rnd() * 10;
      }
    }
  }
  const bm = BB.mesh(new THREE.MeshStandardMaterial({ map, emissiveMap: emi, emissive: 0xffffff, emissiveIntensity: 1.2, vertexColors: true, roughness: 0.75, metalness: 0.1 }));
  if (bm) group.add(C.shadowy(bm, true, true));

  const pole = new THREE.CylinderGeometry(0.12, 0.16, 8, 6); pole.translate(0, 4, 0);
  const arm = new THREE.BoxGeometry(0.12, 0.12, 3);
  const head = new THREE.BoxGeometry(0.5, 0.16, 0.9);
  const poolTex = canvasTex(64, 64, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    r.addColorStop(0, 'rgba(255,205,140,0.6)'); r.addColorStop(1, 'rgba(255,205,140,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, h);
  }, 1, false);
  const PB = new Batch();
  const pool = new THREE.PlaneGeometry(15, 15); pool.rotateX(-Math.PI / 2);
  let side = 1;
  for (let i = 0; i < t.N; i += 14) {
    const ry = Math.atan2(t.rx[i], t.rz[i]);
    const lp = side * (edge - 0.6), lh = side * (edge - 3.2), lm = (lp + lh) / 2;
    B.add(pole, 0x2a2a30, M(t.px[i] + t.rx[i] * lp, 0, t.pz[i] + t.rz[i] * lp));
    B.add(arm, 0x2a2a30, M(t.px[i] + t.rx[i] * lm, 7.95, t.pz[i] + t.rz[i] * lm, ry));
    E.add(head, 0xffe6b0, M(t.px[i] + t.rx[i] * lh, 7.85, t.pz[i] + t.rz[i] * lh, ry));
    const lq = side * (t.half - 2.5);
    PB.add(pool, null, M(t.px[i] + t.rx[i] * lq, 0.05, t.pz[i] + t.rz[i] * lq));
    side = -side;
  }
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
  const { t, B, F, rnd, clearOf, band, low } = C;
  const km = t.length / 1000;
  for (let k = 0, tries = 0; k < km * 16 && tries < 2000; tries++) {
    const [x, z] = band(260, 700), r = 90 + rnd() * 150, h = 70 + rnd() * 160;
    if (!clearOf(x, z, r + 40)) continue;
    k++;
    const g = mountainGeo(r, h, rnd, h > 160);
    F.add(g, null, M(x, -2, z, rnd() * 6)); g.dispose();
  }
  for (let k = 0, tries = 0; k < km * 10 && tries < 2000; tries++) {
    const [x, z] = band(40, 200), r = 22 + rnd() * 30;
    if (!clearOf(x, z, r + 10)) continue;
    k++;
    const g = mountainGeo(r, 12 + rnd() * 24, rnd, false);
    F.add(g, null, M(x, -1, z, rnd() * 6)); g.dispose();
  }
  const trunk = new THREE.CylinderGeometry(0.25, 0.35, 2, 5); trunk.translate(0, 1, 0);
  const c1 = new THREE.ConeGeometry(2.2, 4, 7); c1.translate(0, 3.6, 0);
  const c2 = new THREE.ConeGeometry(1.7, 3.4, 7); c2.translate(0, 5.5, 0);
  const c3 = new THREE.ConeGeometry(1.1, 2.6, 7); c3.translate(0, 7.3, 0);
  const greens = [0x2f5a2c, 0x376634, 0x2a4f2a, 0x41703a];
  for (let k = 0, tries = 0; k < km * (low ? 70 : 130) && tries < 9000; tries++) {
    const [x, z] = band(3, 180);
    if (!clearOf(x, z, 3)) continue;
    k++;
    const s = 0.8 + rnd() * 0.8, col = greens[(rnd() * greens.length) | 0], m = M(x, 0, z, rnd() * 6, s, s, s);
    B.add(trunk, 0x5a4030, m); B.add(c1, col, m); B.add(c2, col, m); B.add(c3, col, m);
  }
  const rock = new THREE.DodecahedronGeometry(1, 0);
  for (let k = 0, tries = 0; k < km * 30 && tries < 3000; tries++) {
    const [x, z] = band(3, 120);
    if (!clearOf(x, z, 2)) continue;
    k++;
    const s = 0.6 + rnd() * 2.2;
    F.add(rock, rnd() < 0.5 ? 0x7d7468 : 0x8c8378, M(x, s * 0.3, z, rnd() * 6, s, s * 0.7, s * 1.2));
  }
}
