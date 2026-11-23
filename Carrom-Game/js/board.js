// Carrom Raja: the 3D carrom board, coins and striker, drawn to real proportions.
// Everything is generated in code: plywood playing surface with the printed markings, a varnished
// rosewood frame, pockets with nets, ivory/ebony coins with turned rings, the red queen and a striker,
// all under a hanging lamp in a dim room.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { H, COIN_R, STRIKER_R, POCKET_R, PC, BASE_OUT, BASE_IN, BASE_HALF, U_MAX, POCKETS } from './physics.js';

const FW = 0.08;          // frame width
const FTOP = 0.02;        // frame top above the playing surface
export const COIN_T = 0.0075, STRIKER_T = 0.0078;

function rand(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ playing surface */
function surfaceTexture(size, renderer) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), k = size / (2 * H), R = rand(11);
  const X = (x) => (x + H) * k;
  // light birch plywood with soft grain
  const bg = g.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#e6c48c'); bg.addColorStop(0.5, '#ddb97e'); bg.addColorStop(1, '#d6b073');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const y0 = R() * size, amp = 4 + R() * 14, wl = 300 + R() * 700, ph = R() * 6;
    g.strokeStyle = `rgba(${150 + R() * 40},${100 + R() * 30},${50 + R() * 20},${0.04 + R() * 0.08})`;
    g.lineWidth = 0.6 + R() * 2.2;
    g.beginPath();
    for (let x = 0; x <= size; x += 16) { const y = y0 + Math.sin(x / wl * 6.28 + ph) * amp + Math.sin(x / 97 + ph) * 1.5; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  // a few darker plywood figure patches
  for (let i = 0; i < 18; i++) {
    const x = R() * size, y = R() * size, r = 40 + R() * 160, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(170,120,60,0.10)'); gr.addColorStop(1, 'rgba(170,120,60,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  const BLACK = '#1c1512', RED = '#c2262b', lw = 0.0026 * k;
  g.lineCap = 'round';
  g.save(); g.translate(size / 2, size / 2);
  for (let side = 0; side < 4; side++) {
    g.save(); g.rotate((side * Math.PI) / 2);
    // base lines: two lines with a red circle at each end
    g.strokeStyle = BLACK; g.lineWidth = lw * 1.4;
    for (const z of [BASE_OUT, BASE_IN]) { g.beginPath(); g.moveTo(-BASE_HALF * k + COIN_R * k, z * k); g.lineTo(BASE_HALF * k - COIN_R * k, z * k); g.stroke(); }
    for (const s of [-1, 1]) {
      const cx = s * U_MAX * k, cz = ((BASE_OUT + BASE_IN) / 2) * k;
      g.fillStyle = RED; g.beginPath(); g.arc(cx, cz, COIN_R * k, 0, Math.PI * 2); g.fill();
      g.lineWidth = lw * 1.2; g.strokeStyle = BLACK; g.stroke();
      g.beginPath(); g.arc(cx, cz, COIN_R * k * 0.55, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,230,200,0.7)'; g.lineWidth = lw * 0.8; g.stroke();
    }
    // diagonal arrow from the corner towards the centre, arrowhead at the pocket end and a curl at the other
    g.save(); g.rotate(Math.PI / 4);
    const d0 = 0.103 * k, d1 = 0.33 * k, cornerD = Math.SQRT2 * H * k;
    g.strokeStyle = BLACK; g.lineWidth = lw * 1.2;
    g.beginPath(); g.moveTo(0, cornerD - d0); g.lineTo(0, cornerD - d1); g.stroke();
    g.beginPath(); g.moveTo(-0.009 * k, cornerD - d0 - 0.014 * k); g.lineTo(0, cornerD - d0); g.lineTo(0.009 * k, cornerD - d0 - 0.014 * k); g.stroke();
    g.beginPath(); g.arc(0, cornerD - d1 - 0.0125 * k, 0.0125 * k, -Math.PI * 0.5 + 0.5, Math.PI * 1.5 - 0.5); g.stroke();
    g.restore();
    g.restore();
  }
  // centre: outer circle, a red-and-black rosette and the small red centre circle
  const RO = 0.085 * k;
  g.strokeStyle = BLACK; g.lineWidth = lw * 1.6; g.beginPath(); g.arc(0, 0, RO, 0, Math.PI * 2); g.stroke();
  g.lineWidth = lw * 0.9; g.beginPath(); g.arc(0, 0, RO - 0.004 * k, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 8; i++) {
    g.save(); g.rotate((i * Math.PI) / 4);
    g.beginPath();
    g.moveTo(0, -0.02 * k);
    g.quadraticCurveTo(0.022 * k, -0.05 * k, 0, -0.077 * k);
    g.quadraticCurveTo(-0.022 * k, -0.05 * k, 0, -0.02 * k);
    g.fillStyle = i % 2 ? 'rgba(194,38,43,0.85)' : 'rgba(28,21,18,0.85)'; g.fill();
    g.restore();
  }
  g.beginPath(); g.arc(0, 0, 0.02 * k, 0, Math.PI * 2); g.fillStyle = '#ead1a0'; g.fill(); g.strokeStyle = BLACK; g.lineWidth = lw; g.stroke();
  g.beginPath(); g.arc(0, 0, COIN_R * k, 0, Math.PI * 2); g.fillStyle = RED; g.fill(); g.stroke();
  g.restore();
  // pockets: dark holes with a soft shadow inside
  for (const [px, pz] of POCKETS) {
    const x = X(px), y = X(pz), r = POCKET_R * k;
    const sh = g.createRadialGradient(x, y, r * 0.9, x, y, r * 1.5);
    sh.addColorStop(0, 'rgba(60,35,15,0.45)'); sh.addColorStop(1, 'rgba(60,35,15,0)');
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, r * 1.5, 0, Math.PI * 2); g.fill();
    const hole = g.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
    hole.addColorStop(0, '#050403'); hole.addColorStop(0.8, '#0d0907'); hole.addColorStop(1, '#2a1a10');
    g.fillStyle = hole; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,12,8,0.9)'; g.lineWidth = lw * 1.2; g.stroke();
  }
  // darker edge under the frame
  const eg = g.createLinearGradient(0, 0, 0.03 * k, 0);
  for (const rot of [0, 1, 2, 3]) {
    g.save(); g.translate(size / 2, size / 2); g.rotate((rot * Math.PI) / 2); g.translate(-size / 2, -size / 2);
    eg.addColorStop(0, 'rgba(90,60,30,0.28)'); eg.addColorStop(1, 'rgba(90,60,30,0)');
    g.fillStyle = eg; g.fillRect(0, 0, 0.03 * k, size);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function woodTexture(w, h, base, seed) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), R = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const y0 = R() * h, amp = 1 + R() * 5, wl = 200 + R() * 600, ph = R() * 6;
    g.strokeStyle = `rgba(${R() < 0.5 ? '20,8,4' : '120,50,25'},${0.08 + R() * 0.18})`;
    g.lineWidth = 0.5 + R() * 2;
    g.beginPath();
    for (let x = 0; x <= w; x += 12) { const y = y0 + Math.sin(x / wl * 6.28 + ph) * amp; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), R = rand(5);
  // red-oxide floor tiles
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 0.85 + R() * 0.2;
    g.fillStyle = `rgb(${Math.round(120 * v)},${Math.round(42 * v)},${Math.round(32 * v)})`;
    g.fillRect(x * 128, y * 128, 128, 128);
    g.strokeStyle = 'rgba(30,10,8,0.6)'; g.lineWidth = 3; g.strokeRect(x * 128, y * 128, 128, 128);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6);
  return t;
}

/* ------------------------------------------------------------------ coins */
function coinFace(kind, size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), m = size / 2;
  const cols = { w: ['#f4ead2', '#d9c7a0', 'rgba(150,120,80,0.55)'], b: ['#221a16', '#080605', 'rgba(255,230,200,0.16)'], q: ['#d8333a', '#93141b', 'rgba(255,220,200,0.35)'], s: ['#fbfbf8', '#dcdcd6', 'rgba(40,80,170,0.8)'] }[kind];
  const gr = g.createRadialGradient(m * 0.7, m * 0.6, m * 0.1, m, m, m);
  gr.addColorStop(0, cols[0]); gr.addColorStop(1, cols[1]);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  g.strokeStyle = cols[2];
  if (kind === 's') {
    // striker: blue rings and a star
    g.lineWidth = size * 0.03;
    for (const r of [0.86, 0.72]) { g.beginPath(); g.arc(m, m, m * r, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = 'rgba(200,40,50,0.85)';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, r = (i % 2 ? 0.22 : 0.55) * m; g.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r); }
    g.closePath(); g.fill();
  } else {
    // turned grooves
    g.lineWidth = size * 0.018;
    for (const r of [0.88, 0.62, 0.3]) { g.beginPath(); g.arc(m, m, m * r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = size * 0.008; g.strokeStyle = 'rgba(255,255,255,0.15)';
    for (const r of [0.9, 0.64, 0.32]) { g.beginPath(); g.arc(m, m, m * r, Math.PI, Math.PI * 1.5); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function coinGeometry(r, t) {
  const e = Math.min(0.0016, t * 0.25);
  const pts = [
    [0, 0], [r - e, 0], [r - e * 0.3, e * 0.3], [r, e], [r, t - e], [r - e * 0.3, t - e * 0.3], [r - e, t], [0, t],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 40);
}

export function makeCoinMesh(kind, cache) {
  const key = kind;
  if (!cache[key]) {
    const s = kind === 's', r = s ? STRIKER_R : COIN_R, t = s ? STRIKER_T : COIN_T;
    const side = { w: 0xe9dcbc, b: 0x110d0b, q: 0xb81d24, s: 0xf2f2ee }[kind];
    cache[key] = {
      body: coinGeometry(r, t),
      top: new THREE.CircleGeometry(r - 0.0012, 40).rotateX(-Math.PI / 2).translate(0, t + 0.00005, 0),
      side: new THREE.MeshPhysicalMaterial({ color: side, roughness: kind === 'b' ? 0.35 : 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
      face: new THREE.MeshPhysicalMaterial({ map: coinFace(kind), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    };
  }
  const C = cache[key];
  const g = new THREE.Group();
  const b = new THREE.Mesh(C.body, C.side), f = new THREE.Mesh(C.top, C.face);
  b.castShadow = true; b.receiveShadow = true; f.receiveShadow = true;
  g.add(b, f);
  return g;
}

/* ------------------------------------------------------------------ the whole scene */
export function buildBoard(renderer, low) {
  const group = new THREE.Group();
  const surfTex = surfaceTexture(low ? 1536 : 2048, renderer);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(2 * H, 2 * H).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ map: surfTex, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.35 }));
  surface.receiveShadow = true;
  group.add(surface);

  // frame: four varnished rosewood rails with rounded edges
  const frameMat = new THREE.MeshPhysicalMaterial({ map: woodTexture(1024, 128, '#4a1f12', 3), roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  const frameMat2 = frameMat.clone(); frameMat2.map = frameMat.map.clone(); frameMat2.map.rotation = Math.PI / 2; frameMat2.map.center.set(0.5, 0.5); frameMat2.map.needsUpdate = true;
  const L = 2 * H + 2 * FW, th = 0.045;
  for (const [x, z, rot] of [[0, H + FW / 2, 0], [0, -H - FW / 2, 0], [H + FW / 2, 0, 1], [-H - FW / 2, 0, 1]]) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(rot ? FW : L, th, rot ? L : FW, 3, 0.012), rot ? frameMat2 : frameMat);
    m.position.set(x, FTOP - th / 2, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }
  // corner inlays on the frame
  const inlay = new THREE.MeshStandardMaterial({ color: 0xd8b878, roughness: 0.4, metalness: 0.3 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.002, 24), inlay);
    d.position.set(sx * (H + FW / 2), FTOP + 0.0005, sz * (H + FW / 2)); group.add(d);
  }
  // board base, pocket nets underneath and the stand
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.7 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2 * H + 0.02, 0.012, 2 * H + 0.02), baseMat);
  base.position.y = -0.008; base.receiveShadow = true; group.add(base);
  const netMat = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.9, side: THREE.DoubleSide });
  for (const [px, pz] of POCKETS) {
    const net = new THREE.Mesh(new THREE.SphereGeometry(POCKET_R * 1.3, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), netMat);
    net.position.set(px, -0.014, pz); group.add(net);
  }
  // the pocket openings themselves: matt black, so the varnish shine never greys them out
  const holeMat = new THREE.MeshBasicMaterial({ color: 0x040302 });
  for (const [px, pz] of POCKETS) {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(POCKET_R * 0.97, 32).rotateX(-Math.PI / 2), holeMat);
    hole.position.set(px, 0.0002, pz); group.add(hole);
  }
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3b2215, roughness: 0.6 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.62, 0.05), legMat);
    leg.position.set(sx * (H - 0.02), -0.33, sz * (H - 0.02)); leg.castShadow = true; group.add(leg);
  }

  // room: tiled floor, warm lamp overhead
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.85, color: 0x6a5a55 }));
  floor.position.y = -0.64; floor.receiveShadow = true; group.add(floor);

  // aim guide (dots), pull line and ghost striker ring, all drawn on top of the board
  const dotGeo = new THREE.CircleGeometry(0.0028, 10).rotateX(-Math.PI / 2);
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const dotMat2 = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, depthWrite: false });
  const aim = new THREE.Group(); aim.visible = false; group.add(aim);
  const dots = [], dots2 = [];
  for (let i = 0; i < 70; i++) { const d = new THREE.Mesh(dotGeo, dotMat); d.position.y = 0.0006; aim.add(d); dots.push(d); }
  for (let i = 0; i < 24; i++) { const d = new THREE.Mesh(dotGeo, dotMat2); d.position.y = 0.0007; aim.add(d); dots2.push(d); }
  const ghost = new THREE.Mesh(new THREE.RingGeometry(STRIKER_R - 0.0015, STRIKER_R, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  ghost.position.y = 0.0008; aim.add(ghost);
  const power = new THREE.Mesh(new THREE.RingGeometry(STRIKER_R + 0.004, STRIKER_R + 0.009, 48, 1, 0, Math.PI * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4dd27a, transparent: true, opacity: 0.85, depthWrite: false }));
  power.position.y = 0.0009; aim.add(power);
  const bad = new THREE.Mesh(new THREE.RingGeometry(STRIKER_R + 0.002, STRIKER_R + 0.006, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, depthWrite: false }));
  bad.position.y = 0.0009; bad.visible = false; group.add(bad);

  return { group, aim, dots, dots2, ghost, power, bad, frameW: FW, frameTop: FTOP };
}
