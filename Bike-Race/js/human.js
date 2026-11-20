// Kaathu Riders: smooth skinned people, copied from the Kadal Nagaram game (GTA-Game/js/characters.js).// Each person is one skinned mesh with painted clothes, a simple skeleton and a natural walk/run cycle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const HQ = typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches;
// bones: body = root at the feet (used for knock-downs), spine/head for upper-body motion
const B = { body: 0, lLeg: 1, lKnee: 2, rLeg: 3, rKnee: 4, lArm: 5, lElbow: 6, rArm: 7, rElbow: 8, spine: 9, head: 10, hips: 11, lFoot: 12, rFoot: 13 };
const _mx = new THREE.Matrix4(), _eu = new THREE.Euler();

// Our own original hero look: mustard leaf-print shirt with an open collar, olive chinos, gold chain,
// wrist watch, sunglasses, stubble and white sneakers.
export const PLAYER_LOOK = {
  skin: 0x9a6443, hair: 0x120d0a, hairStyle: 'wavy', top: 0xc9962a, pattern: 'leaf', sleeves: 'short', untucked: true, openCollar: true,
  bottom: 'pants', pantsStyle: 'chinos', bottomColor: 0x5e5f3f, shoes: 0xf2f2ee, glasses: true, mustache: false, stubble: true,
  chain: true, watch: true, build: 'athletic',
};

/* ------------------------------------------------------------------ texture atlas
   Each person gets one painted canvas. Regions (fractions of the canvas, y measured from the top):
   torso [0,0,.5,.5]  legs [.5,0,.25,.5]  arms [.75,0,.25,.5]  head [0,.5,.5,.5]
   hair [.5,.5,.25,.25]  shoe [.75,.5,.25,.125]  skin [.75,.625,.25,.125]  skirt [.5,.75,.5,.25] */
const REG = {
  torso: [0, 0, 0.5, 0.5], legs: [0.5, 0, 0.25, 0.5], arms: [0.75, 0, 0.25, 0.5], head: [0, 0.5, 0.5, 0.5],
  hair: [0.5, 0.5, 0.25, 0.25], shoe: [0.75, 0.5, 0.25, 0.125], skin: [0.75, 0.625, 0.25, 0.125], skirt: [0.5, 0.75, 0.5, 0.25],
};
const hex = (c) => '#' + new THREE.Color(c).getHexString();
const shade = (c, k) => { const o = new THREE.Color(c); o.offsetHSL(0, 0, k); return '#' + o.getHexString(); };

function paintPerson(L, S) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const R = Math.random;
  const rect = (reg) => [reg[0] * S, reg[1] * S, reg[2] * S, reg[3] * S];
  const noise = (x, y, w, h, n, a, light = '#ffffff', dark = '#000000') => {
    for (let k = 0; k < n; k++) { g.globalAlpha = a * R(); g.fillStyle = R() < 0.5 ? light : dark; g.fillRect(x + R() * w, y + R() * h, 1 + R() * 1.5, 1 + R() * 1.5); }
    g.globalAlpha = 1;
  };
  // horizontal volume shading for a cylindrical region: darker at the sides (u = .25 / .75), dark at the back seam
  const volume = (x, y, w, h, strength = 0.35) => {
    const gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, `rgba(0,0,0,${strength})`); gr.addColorStop(0.25, `rgba(0,0,0,${strength * 0.55})`);
    gr.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    gr.addColorStop(0.75, `rgba(0,0,0,${strength * 0.55})`); gr.addColorStop(1, `rgba(0,0,0,${strength})`);
    g.fillStyle = gr; g.fillRect(x, y, w, h);
  };
  const skin = hex(L.skin);
  const female = L.bottom === 'saree' || L.bottom === 'churidar';

  // ---------- skin + hands
  {
    const [x, y, w, h] = rect(REG.skin); g.fillStyle = skin; g.fillRect(x, y, w, h);
    // tiny swatches for the gold chain and the watch strap (sampled as single points)
    g.fillStyle = '#e0b43a'; g.fillRect(S * 0.978, S * 0.73, S * 0.02, S * 0.02);
    g.fillStyle = '#1c1c1e'; g.fillRect(S * 0.958, S * 0.73, S * 0.02, S * 0.02);
  }
  // ---------- shoes
  { const [x, y, w, h] = rect(REG.shoe); g.fillStyle = hex(L.shoes ?? 0x2b2118); g.fillRect(x, y, w, h); noise(x, y, w, h, 80, 0.15); g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y + h * 0.8, w, h * 0.2); }
  // ---------- hair
  {
    const [x, y, w, h] = rect(REG.hair); g.fillStyle = hex(L.hair); g.fillRect(x, y, w, h);
    g.strokeStyle = shade(L.hair, 0.12); g.globalAlpha = 0.5;
    for (let k = 0; k < S / 3; k++) { const sx = x + R() * w; g.beginPath(); g.moveTo(sx, y + R() * h); g.lineTo(sx + (R() - 0.5) * 4, y + R() * h); g.stroke(); }
    g.globalAlpha = 1;
  }
  // ---------- torso (v: bottom = crotch, top = neck)
  {
    const [x, y, w, h] = rect(REG.torso);
    const vy = (v) => y + h * (1 - v);               // v (0 bottom .. 1 top) -> canvas y
    const shirtBottom = L.untucked ? 0.1 : 0.22;
    const top = female && L.bottom === 'saree' ? L.top : L.top;
    g.fillStyle = hex(top); g.fillRect(x, y, w, h);
    if (L.pattern === 'checks') {
      g.globalAlpha = 0.35; g.fillStyle = shade(top, -0.18);
      for (let k = 0; k < w; k += S / 32) g.fillRect(x + k, y, S / 80, h);
      for (let k = 0; k < h; k += S / 32) g.fillRect(x, y + k, w, S / 80);
      g.globalAlpha = 0.25; g.fillStyle = shade(top, 0.25);
      for (let k = S / 64; k < w; k += S / 32) g.fillRect(x + k, y, S / 160, h);
      g.globalAlpha = 1;
    } else if (L.pattern === 'stripes') {
      g.globalAlpha = 0.3; g.fillStyle = shade(top, -0.2);
      for (let k = 0; k < w; k += S / 40) g.fillRect(x + k, y, S / 120, h);
      g.globalAlpha = 1;
    } else if (L.pattern === 'tee') {
      g.globalAlpha = 0.85; g.fillStyle = shade(top, 0.3);
      g.beginPath(); g.arc(x + w * 0.5, vy(0.62), w * 0.06, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    } else if (L.pattern === 'leaf') {
      // scattered small leaf motifs in two tones
      for (let k = 0; k < S / 2.2; k++) {
        const lx = x + R() * w, ly = y + R() * h, sz = S / 70 + R() * S / 90, a = R() * Math.PI;
        g.fillStyle = R() < 0.5 ? shade(top, -0.22) : shade(top, 0.18);
        g.beginPath(); g.ellipse(lx, ly, sz, sz * 0.38, a, 0, 7); g.fill();
        g.strokeStyle = shade(top, -0.3); g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(lx - Math.cos(a) * sz, ly - Math.sin(a) * sz); g.lineTo(lx + Math.cos(a) * sz, ly + Math.sin(a) * sz); g.stroke();
      }
    }
    noise(x, y, w, h, S * 2, 0.08);
    if (L.openCollar) {
      // open collar: skin V at the neck with lapels
      g.fillStyle = skin;
      g.beginPath(); g.moveTo(x + w * 0.44, vy(1)); g.lineTo(x + w * 0.5, vy(0.8)); g.lineTo(x + w * 0.56, vy(1)); g.closePath(); g.fill();
      g.fillStyle = shade(top, -0.12);
      g.beginPath(); g.moveTo(x + w * 0.4, vy(1)); g.lineTo(x + w * 0.44, vy(1)); g.lineTo(x + w * 0.5, vy(0.8)); g.lineTo(x + w * 0.47, vy(0.86)); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x + w * 0.6, vy(1)); g.lineTo(x + w * 0.56, vy(1)); g.lineTo(x + w * 0.5, vy(0.8)); g.lineTo(x + w * 0.53, vy(0.86)); g.closePath(); g.fill();
    }
    if (L.pattern !== 'tee' && !female && !L.openCollar) {
      // placket + buttons, collar, pocket
      g.fillStyle = shade(top, 0.08); g.fillRect(x + w * 0.495, vy(0.98), w * 0.012, h * 0.85);
      g.fillStyle = '#f2f2f2';
      for (let v = 0.3; v < 0.95; v += 0.11) { g.beginPath(); g.arc(x + w * 0.5, vy(v), S / 220 + 0.6, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = shade(top, -0.12);
      g.beginPath(); g.moveTo(x + w * 0.42, vy(1)); g.lineTo(x + w * 0.5, vy(0.9)); g.lineTo(x + w * 0.58, vy(1)); g.closePath(); g.fill();
      g.fillRect(x, vy(1), w, h * 0.035);
      g.strokeStyle = shade(top, -0.2); g.lineWidth = Math.max(1, S / 300);
      g.strokeRect(x + w * 0.56, vy(0.82), w * 0.06, h * 0.1);
    } else {
      g.fillStyle = shade(top, -0.15);
      g.beginPath(); g.ellipse(x + w * 0.5, vy(1), w * 0.07, h * 0.06, 0, 0, Math.PI * 2); g.fill();
    }
    // creases
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = Math.max(1, S / 256);
    for (let k = 0; k < 7; k++) { const cx = x + w * (0.3 + R() * 0.4); g.beginPath(); g.moveTo(cx, vy(0.25 + R() * 0.2)); g.quadraticCurveTo(cx + 6, vy(0.4), cx + (R() - 0.5) * 10, vy(0.55 + R() * 0.2)); g.stroke(); }
    // trousers + belt at the bottom
    if (L.bottom === 'pants' || L.bottom === 'shorts') {
      g.fillStyle = hex(L.bottomColor); g.fillRect(x, vy(shirtBottom), w, h * shirtBottom);
      noise(x, vy(shirtBottom), w, h * shirtBottom, S, 0.15);
      if (!L.untucked) { g.fillStyle = '#2a1d14'; g.fillRect(x, vy(shirtBottom + 0.02), w, h * 0.035); g.fillStyle = '#c9a227'; g.fillRect(x + w * 0.485, vy(shirtBottom + 0.02), w * 0.03, h * 0.035); }
      else { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, vy(shirtBottom + 0.01), w, h * 0.015); }
    } else if (L.bottom === 'veshti' || L.bottom === 'saree') {
      const col = L.bottom === 'veshti' ? '#f3efe2' : hex(L.saree);
      g.fillStyle = col; g.fillRect(x, vy(0.2), w, h * 0.2);
      if (L.bottom === 'saree') {               // midriff skin + pallu sash
        g.fillStyle = skin; g.fillRect(x, vy(0.42), w, h * 0.22);
        g.fillStyle = hex(L.saree);
        g.beginPath(); g.moveTo(x + w * 0.35, vy(1)); g.lineTo(x + w * 0.5, vy(1)); g.lineTo(x + w * 0.75, vy(0.2)); g.lineTo(x + w * 0.58, vy(0.2)); g.closePath(); g.fill();
        g.fillStyle = '#d4a017'; g.fillRect(x + w * 0.62, vy(0.6), w * 0.02, h * 0.4);
      }
    } else if (L.bottom === 'churidar') {
      g.fillStyle = hex(L.top); g.fillRect(x, vy(0.25), w, h * 0.25);
    }
    volume(x, y, w, h, 0.4);
    const ao = g.createLinearGradient(0, y, 0, y + h); ao.addColorStop(0, 'rgba(0,0,0,0.25)'); ao.addColorStop(0.15, 'rgba(0,0,0,0)'); ao.addColorStop(0.9, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = ao; g.fillRect(x, y, w, h);
  }
  // ---------- arms (v: 0 wrist .. 1 shoulder)
  {
    const [x, y, w, h] = rect(REG.arms);
    g.fillStyle = skin; g.fillRect(x, y, w, h);
    const sleeve = L.sleeves === 'none' ? 0.93 : L.sleeves === 'long' ? 0.05 : female ? 0.75 : 0.6;
    g.fillStyle = hex(L.top); g.fillRect(x, y, w, h * (1 - sleeve));
    if (L.pattern === 'checks') {
      g.globalAlpha = 0.35; g.fillStyle = shade(L.top, -0.18);
      for (let k = 0; k < w; k += S / 32) g.fillRect(x + k, y, S / 80, h * (1 - sleeve));
      for (let k = 0; k < h * (1 - sleeve); k += S / 32) g.fillRect(x, y + k, w, S / 80);
      g.globalAlpha = 1;
    }
    g.fillStyle = shade(L.top, -0.15); g.fillRect(x, y + h * (1 - sleeve) - h * 0.02, w, h * 0.025);
    noise(x, y, w, h, S, 0.06);
    volume(x, y, w, h, 0.35);
  }
  // ---------- legs (v: 0 ankle .. 1 hip)
  {
    const [x, y, w, h] = rect(REG.legs);
    const vy = (v) => y + h * (1 - v);
    const skirt = L.bottom === 'veshti' || L.bottom === 'saree';
    g.fillStyle = skirt ? skin : hex(L.bottom === 'churidar' ? (L.bottomColor ?? 0xf2efe6) : L.bottomColor); g.fillRect(x, y, w, h);
    if (L.bottom === 'shorts') { g.fillStyle = skin; g.fillRect(x, vy(0.5), w, h * 0.5); }
    if (L.bottom === 'pants' && L.pantsStyle === 'chinos') {
      noise(x, y, w, h, S * 2, 0.08);
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + w * 0.495, y, w * 0.01, h);        // front crease
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + w * 0.505, y, w * 0.006, h);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(x + w * 0.24, y, w * 0.012, h); g.fillRect(x + w * 0.74, y, w * 0.012, h);
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, vy(0.05), w, h * 0.05);
    } else if (L.bottom === 'pants') {
      noise(x, y, w, h, S * 3, 0.18, '#ffffff', '#000000');
      const fade = g.createRadialGradient(x + w * 0.5, vy(0.75), 1, x + w * 0.5, vy(0.75), w * 0.4);
      fade.addColorStop(0, 'rgba(255,255,255,0.18)'); fade.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = fade; g.fillRect(x, y, w, h);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + w * 0.24, y, w * 0.02, h); g.fillRect(x + w * 0.74, y, w * 0.02, h);
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      for (let k = 0; k < 5; k++) { const yy = vy(0.42 + k * 0.025); g.beginPath(); g.moveTo(x + w * 0.4, yy); g.quadraticCurveTo(x + w * 0.5, yy + 3, x + w * 0.6, yy); g.stroke(); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, vy(0.04), w, h * 0.04);
    }
    volume(x, y, w, h, 0.4);
  }
  // ---------- skirt (veshti / saree)
  {
    const [x, y, w, h] = rect(REG.skirt);
    const col = L.bottom === 'saree' ? hex(L.saree) : L.bottom === 'churidar' ? hex(L.top) : '#f3efe2';
    g.fillStyle = col; g.fillRect(x, y, w, h);
    g.globalAlpha = 0.18; g.fillStyle = '#000';
    for (let k = 0; k < w; k += S / 40) g.fillRect(x + k + R() * 3, y, S / 160, h);
    g.globalAlpha = 1;
    g.fillStyle = '#d4a017'; g.fillRect(x, y + h * 0.88, w, h * 0.06);
    if (L.bottom === 'saree') { g.fillStyle = shade(L.saree, 0.2); for (let k = 0; k < 40; k++) { g.beginPath(); g.arc(x + R() * w, y + R() * h * 0.8, S / 200 + 0.5, 0, 7); g.fill(); } }
    volume(x, y, w, h, 0.35);
  }
  // ---------- head (v: 0 neck base .. 1 crown); face centred at u = .5
  {
    const [x, y, w, h] = rect(REG.head);
    const U = (u) => x + w * u, V = (v) => y + h * (1 - v);
    g.fillStyle = skin; g.fillRect(x, y, w, h);
    noise(x, y, w, h, S, 0.05);
    // cheeks / jaw shading
    const cheek = g.createRadialGradient(U(0.5), V(0.5), 1, U(0.5), V(0.5), w * 0.22);
    cheek.addColorStop(0, 'rgba(255,190,160,0.12)'); cheek.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cheek; g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, V(0.2), w, h * 0.12);
    // ears
    for (const u of [0.25, 0.75]) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(U(u), V(0.55), w * 0.02, h * 0.07, 0, 0, 7); g.fill(); }
    // eyes
    for (const s of [-1, 1]) {
      const ex = U(0.5 + s * 0.055), ey = V(0.6);
      g.fillStyle = 'rgba(60,30,20,0.35)'; g.beginPath(); g.ellipse(ex, ey - h * 0.008, w * 0.032, h * 0.03, 0, 0, 7); g.fill();
      g.fillStyle = '#f4efe6'; g.beginPath(); g.ellipse(ex, ey, w * 0.026, h * 0.017, 0, 0, 7); g.fill();
      g.fillStyle = '#2b1a10'; g.beginPath(); g.arc(ex, ey, h * 0.014, 0, 7); g.fill();
      g.fillStyle = '#000'; g.beginPath(); g.arc(ex, ey, h * 0.007, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.fillRect(ex + 1, ey - 2, 1.5, 1.5);
      g.strokeStyle = hex(L.hair); g.lineWidth = Math.max(1.5, h * 0.012);
      g.beginPath(); g.moveTo(ex - w * 0.032, V(0.66)); g.quadraticCurveTo(ex, V(0.685), ex + w * 0.032, V(0.665)); g.stroke();
    }
    // nose
    g.strokeStyle = 'rgba(70,35,20,0.45)'; g.lineWidth = Math.max(1, h * 0.008);
    g.beginPath(); g.moveTo(U(0.49), V(0.58)); g.lineTo(U(0.485), V(0.49)); g.quadraticCurveTo(U(0.5), V(0.465), U(0.515), V(0.49)); g.stroke();
    g.fillStyle = 'rgba(40,20,10,0.4)'; g.fillRect(U(0.483), V(0.475), w * 0.008, h * 0.008); g.fillRect(U(0.51), V(0.475), w * 0.008, h * 0.008);
    // mouth
    g.fillStyle = female ? '#9b3b45' : shade(L.skin, -0.15);
    g.beginPath(); g.ellipse(U(0.5), V(0.4), w * 0.035, h * 0.013, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,10,10,0.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(U(0.468), V(0.4)); g.lineTo(U(0.532), V(0.4)); g.stroke();
    if (L.stubble) {
      for (let k = 0; k < S * 1.5; k++) {
        const a = R() * Math.PI - Math.PI / 2, rr = R();
        const u = 0.5 + Math.sin(a) * 0.1 * (0.6 + rr * 0.4), v = 0.33 + Math.cos(a) * 0.15 * rr + (R() < 0.3 ? 0.11 : 0);
        g.globalAlpha = 0.35; g.fillStyle = hex(L.hair); g.fillRect(U(u), V(v), 1.2, 1.2);
      }
      g.globalAlpha = 1;
    }
    if (L.mustache) { g.fillStyle = hex(L.hair); g.beginPath(); g.ellipse(U(0.5), V(0.445), w * 0.045, h * 0.016, 0, 0, 7); g.fill(); }
    if (!female && !L.mustache && R() < 0.5) { g.globalAlpha = 0.25; noise(U(0.4), V(0.45), w * 0.2, h * 0.15, S / 2, 0.6, hex(L.hair), hex(L.hair)); g.globalAlpha = 1; }
    if (female) { g.fillStyle = '#b3122e'; g.beginPath(); g.arc(U(0.5), V(0.7), h * 0.009, 0, 7); g.fill(); }
    // hairline: all round the top, lower at the back
    g.fillStyle = hex(L.hair);
    if (L.hairStyle !== 'bald') {
      g.beginPath(); g.moveTo(x, V(0.35));
      for (let u = 0; u <= 1.001; u += 0.02) {
        const front = Math.cos((u - 0.5) * Math.PI * 2);        // 1 at the face, -1 at the back
        const v = 0.8 - Math.max(0, -front) * 0.42 + (front > 0.85 ? 0.04 : 0);
        g.lineTo(U(u), V(v));
      }
      g.lineTo(x + w, y); g.lineTo(x, y); g.closePath(); g.fill();
    } else { g.globalAlpha = 0.35; g.fillRect(x, V(0.7), w, h * 0.1); g.globalAlpha = 1; }
    if (L.glasses) {
      g.fillStyle = '#0b0b0b';
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(U(0.5 + s * 0.055), V(0.6), w * 0.04, h * 0.03, 0, 0, 7); g.fill(); }
      g.fillRect(U(0.42), V(0.625), w * 0.16, h * 0.01);
    }
    if (L.band) { g.fillStyle = hex(L.band); g.fillRect(x, V(0.8), w, h * 0.06); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ geometry */
// A lathe-like tube through rings {y, hw, hd, cx, cz}; UVs cover a texture region (seam at the back).
function tube(rings, radial, reg, weightAt) {
  const pos = [], uv = [], si = [], sw = [], idx = [];
  const n = rings.length;
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    const v = i / (n - 1);
    for (let j = 0; j <= radial; j++) {
      const th = -Math.PI + (j / radial) * Math.PI * 2;
      pos.push((r.cx || 0) + Math.sin(th) * r.hw, r.y, (r.cz || 0) + Math.cos(th) * r.hd);
      uv.push(reg[0] + (j / radial) * reg[2], 1 - reg[1] - reg[3] + v * reg[3]);
      const [a, b, w] = weightAt(r.y);
      si.push(a, b, 0, 0); sw.push(1 - w, w, 0, 0);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Any built-in geometry rigidly bound to one bone; UVs squeezed into a region (or one point of it).
function rigid(geo, bone, reg, x, y, z, rx = 0, ry = 0, rz = 0, point = false) {
  if (rx || ry || rz) geo.applyMatrix4(_mx.makeRotationFromEuler(_eu.set(rx, ry, rz)));
  geo.translate(x, y, z);
  const n = geo.attributes.position.count, uv = geo.attributes.uv;
  for (let i = 0; i < n; i++) {
    const u = point ? 0.5 : uv.getX(i), v = point ? 0.5 : uv.getY(i);
    uv.setXY(i, reg[0] + u * reg[2], 1 - reg[1] - reg[3] + v * reg[3]);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, k) => (k % 4 === 0 ? bone : 0)), 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
  return geo;
}
const blend = (y, y0, y1, a, b) => (y >= y1 ? [a, b, 0] : y <= y0 ? [a, b, 1] : [a, b, (y1 - y) / (y1 - y0)]);

export function makeHuman(L, { shadow = true, texSize = 256, kind = 'ped' } = {}) {
  const female = L.bottom === 'saree' || L.bottom === 'churidar';
  const skirt = L.bottom === 'veshti' || L.bottom === 'saree';
  const ath = L.build === 'athletic' ? 1 : 0;
  const loose = L.bottom === 'pants' ? 0.008 : 0;
  const parts = [];
  const GOLD = [0.985, 0.74, 0.005, 0.005], DARK = [0.965, 0.74, 0.005, 0.005];

  // torso (crotch -> neck): lower half follows the hips, upper half the spine
  const hip = female ? 0.19 : 0.178, waist = female ? 0.145 : 0.162 + ath * 0.004;
  const chest = female ? 0.185 : 0.205 + ath * 0.015, sh = female ? 0.185 : 0.215 + ath * 0.022, depth = 0.125 + ath * 0.015;
  const tr = [
    { y: 0.86, hw: 0.15, hd: 0.11 }, { y: 0.93, hw: hip, hd: 0.125 }, { y: 1.0, hw: hip - 0.012, hd: 0.118 },
    { y: 1.08, hw: waist, hd: 0.112 }, { y: 1.2, hw: waist + 0.014, hd: 0.118 + ath * 0.006 }, { y: 1.32, hw: chest, hd: female ? 0.135 : depth },
    { y: 1.42, hw: sh, hd: depth - 0.004 }, { y: 1.48, hw: sh - 0.012, hd: 0.108 }, { y: 1.52, hw: 0.13, hd: 0.085 },
    { y: 1.555, hw: 0.068 + ath * 0.006, hd: 0.064 },
  ];
  if (L.untucked && !skirt) tr.splice(1, 0, { y: 0.9, hw: hip + 0.014, hd: 0.132 });
  parts.push(tube(tr, 20, REG.torso, (y) => blend(y, 1.05, 1.25, B.spine, B.hips)));
  // neck + head
  const nk = 0.054 + ath * 0.008;
  const head = [
    { y: 1.52, hw: nk, hd: nk }, { y: 1.6, hw: nk + 0.002, hd: nk + 0.004, cz: 0.005 }, { y: 1.65, hw: 0.072, hd: 0.082, cz: 0.012 },
    { y: 1.7, hw: 0.084, hd: 0.098, cz: 0.012 }, { y: 1.76, hw: 0.09, hd: 0.104, cz: 0.008 }, { y: 1.82, hw: 0.088, hd: 0.1 },
    { y: 1.86, hw: 0.076, hd: 0.088 }, { y: 1.895, hw: 0.05, hd: 0.06 }, { y: 1.91, hw: 0.001, hd: 0.001 },
  ];
  parts.push(tube(head, 20, REG.head, (y) => blend(y, 1.55, 1.6, B.head, B.spine)));
  parts.push(rigid(new THREE.ConeGeometry(0.017, 0.045, 5), B.head, REG.skin, 0, 1.725, 0.11, Math.PI / 2 + 0.35, 0, 0, true));
  for (const s of [-1, 1]) parts.push(rigid(new THREE.SphereGeometry(0.022, 8, 6).scale(0.5, 1.1, 0.9), B.head, REG.skin, s * 0.09, 1.74, 0.005, 0, 0, 0, true));
  // hair
  if (L.hairStyle !== 'bald') {
    const cap = new THREE.SphereGeometry(0.098, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.5).scale(0.98, 0.95, 1.1);
    parts.push(rigid(cap, B.head, REG.hair, 0, 1.79, -0.012));
    if (L.hairStyle === 'wavy') {
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2, r = k % 3 === 0 ? 0.02 : 0.05;
        parts.push(rigid(new THREE.SphereGeometry(0.042, 8, 6).scale(1, 0.6, 1), B.head, REG.hair, Math.cos(a) * r, 1.875 + (k % 2) * 0.008, Math.sin(a) * r + 0.012));
      }
      parts.push(rigid(new THREE.SphereGeometry(0.05, 8, 6).scale(1.3, 0.55, 0.8), B.head, REG.hair, 0, 1.87, 0.06));
    }
    if (L.hairStyle === 'long') {
      parts.push(rigid(new THREE.BoxGeometry(0.17, 0.32, 0.05), B.head, REG.hair, 0, 1.66, -0.095));
      parts.push(rigid(new THREE.CapsuleGeometry(0.035, 0.32, 3, 6), B.spine, REG.hair, 0, 1.38, -0.13));
    }
    if (L.hairStyle === 'bun') parts.push(rigid(new THREE.SphereGeometry(0.055, 10, 8), B.head, REG.hair, 0, 1.78, -0.12));
  }
  if (L.chain) parts.push(rigid(new THREE.TorusGeometry(0.068, 0.005, 5, 28).scale(1, 1, 1.25), B.spine, GOLD, 0, 1.52, 0.015, Math.PI / 2 - 0.35, 0, 0, true));
  // arms: shoulder cap, continuous sleeve/arm tube with elbow blend, hand
  const ax = 0.22 + ath * 0.022, ua = 0.058 + ath * 0.01, fa = 0.044 + ath * 0.007;
  for (const s of [-1, 1]) {
    const x = s * ax, arm = s < 0 ? B.lArm : B.rArm, el = s < 0 ? B.lElbow : B.rElbow;
    parts.push(rigid(new THREE.SphereGeometry(ua + 0.004, 10, 8).scale(1, 0.85, 1), arm, [0.85, 0.005, 0.01, 0.01], s * (ax - 0.012), 1.46, 0, 0, 0, 0, true));
    const ar = [
      { y: 1.5, hw: ua, hd: ua }, { y: 1.4, hw: ua - 0.001, hd: ua - 0.003 }, { y: 1.3, hw: ua - 0.009, hd: ua - 0.01 },
      { y: 1.23, hw: fa, hd: fa - 0.001 }, { y: 1.13, hw: fa - 0.002, hd: fa - 0.004 }, { y: 0.97, hw: fa - 0.011, hd: fa - 0.013 }, { y: 0.885, hw: fa - 0.015, hd: fa - 0.016 },
    ].map((r) => ({ ...r, cx: x }));
    parts.push(tube(ar, 10, REG.arms, (y) => (y > 1.36 ? blend(y, 1.36, 1.48, arm, B.spine) : blend(y, 1.17, 1.28, el, arm))));
    const hand = [
      { y: 0.885, hw: 0.026, hd: 0.03 }, { y: 0.85, hw: 0.021, hd: 0.047 }, { y: 0.79, hw: 0.02, hd: 0.045 },
      { y: 0.74, hw: 0.016, hd: 0.033 }, { y: 0.715, hw: 0.001, hd: 0.001 },
    ].map((r) => ({ ...r, cx: x }));
    parts.push(tube(hand, 8, [REG.skin[0] + 0.05, REG.skin[1] + 0.03, 0.01, 0.01], () => [el, el, 0]));
    if (L.watch && s < 0) parts.push(rigid(new THREE.CylinderGeometry(fa - 0.008, fa - 0.008, 0.028, 12), el, DARK, x, 0.915, 0, 0, 0, 0, true));
  }
  // legs: continuous trouser/leg tube with hip, knee and ankle blends; shoes on the ankle bones
  for (const s of [-1, 1]) {
    const x = s * 0.1, leg = s < 0 ? B.lLeg : B.rLeg, kn = s < 0 ? B.lKnee : B.rKnee, ft = s < 0 ? B.lFoot : B.rFoot;
    const th = 0.092 + ath * 0.008;
    const lr = [
      { y: 0.97, hw: th }, { y: 0.86, hw: th - 0.002 }, { y: 0.72, hw: th - 0.015 }, { y: 0.58, hw: 0.065 }, { y: 0.5, hw: 0.06 },
      { y: 0.42, hw: 0.061 }, { y: 0.27, hw: 0.053 }, { y: 0.14, hw: 0.044 + loose }, { y: 0.085, hw: 0.046 + loose * 1.5 },
    ].map((r) => ({ y: r.y, hw: r.hw + loose, hd: r.hw + loose, cx: x }));
    parts.push(tube(lr, 12, REG.legs, (y) => (y > 0.75 ? blend(y, 0.88, 0.97, leg, B.hips) : y > 0.2 ? blend(y, 0.45, 0.56, kn, leg) : blend(y, 0.09, 0.13, ft, kn))));
    const shoe = new RoundedBoxGeometry(0.105, 0.085, 0.27, 2, 0.035);
    parts.push(rigid(shoe, ft, REG.shoe, x, 0.043, 0.05));
  }
  // veshti / saree / kurta skirt
  if (skirt || L.bottom === 'churidar') {
    const sk = L.bottom === 'churidar'
      ? [{ y: 1.02, hw: hip + 0.005, hd: 0.13 }, { y: 0.8, hw: hip + 0.03, hd: 0.15 }, { y: 0.62, hw: hip + 0.05, hd: 0.17 }]
      : [{ y: 1.0, hw: hip + 0.008, hd: 0.13 }, { y: 0.8, hw: hip + 0.03, hd: 0.155 }, { y: 0.45, hw: hip + 0.07, hd: 0.2 }, { y: 0.1, hw: hip + 0.1, hd: 0.23 }];
    parts.push(tube(sk, 18, REG.skirt, () => [B.hips, B.hips, 0]));
  }
  if (L.band) parts.push(rigid(new THREE.CylinderGeometry(0.093, 0.093, 0.03, 16).scale(1, 1, 1.12), B.head, REG.hair, 0, 1.8, 0, 0, 0, 0, true));

  const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  const mk = (x, y, z, parent) => { const b = new THREE.Bone(); b.position.set(x, y, z); if (parent) parent.add(b); return b; };
  const body = mk(0, 0, 0);
  const hips = mk(0, 0.95, 0, body);
  const lLeg = mk(-0.1, -0.02, 0, hips), lKnee = mk(0, -0.43, 0, lLeg), lFoot = mk(0, -0.42, 0, lKnee);
  const rLeg = mk(0.1, -0.02, 0, hips), rKnee = mk(0, -0.43, 0, rLeg), rFoot = mk(0, -0.42, 0, rKnee);
  const spine = mk(0, 0.17, 0, hips);
  const lArm = mk(-ax, 0.35, 0, spine), lElbow = mk(0, -0.245, 0, lArm);
  const rArm = mk(ax, 0.35, 0, spine), rElbow = mk(0, -0.245, 0, rArm);
  const headB = mk(0, 0.44, 0, spine);
  // order must match B
  const bones = [body, lLeg, lKnee, rLeg, rKnee, lArm, lElbow, rArm, rElbow, spine, headB, hips, lFoot, rFoot];
  const mat = new THREE.MeshStandardMaterial({ map: paintPerson(L, texSize), roughness: 0.8 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.add(body);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = shadow;
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, body, hips, spine, head: headB, lLeg, rLeg, lArm, rArm, lKnee, rKnee, lFoot, rFoot, lElbow, rElbow, skirt, gait: 0 };
}

// Natural gait. phase advances ~2π per two steps; amt 0..1 = how much the person is moving;
// h.gait 0 = walk .. 1 = run. punch/kick are 0..1 progress; side picks the punching arm.
export function animateHuman(h, phase, amt, punch = 0, side = 1, kick = 0, block = false) {
  const run = h.gait || 0, k = h.skirt ? 0.6 : 1;
  const idle = 1 - Math.min(1, amt);
  const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
  const sp = Math.sin(phase), cp = Math.cos(phase);
  const thA = (0.4 + run * 0.38) * amt * k, knA = (0.85 + run * 0.75) * amt * k;
  const legs = [[h.lLeg, h.lKnee, h.lFoot, 0, -1], [h.rLeg, h.rKnee, h.rFoot, Math.PI, 1]];
  for (const [th, kn, ft, off, s] of legs) {
    const p = phase + off;
    const thigh = -Math.sin(p) * thA - run * 0.12 * amt;           // negative = forward
    const swing = Math.max(0, Math.cos(p + 0.7));                    // early swing: knee lifts
    const load = Math.max(0, Math.sin(p - 1.4)) * 0.12 * amt * k;    // small flex after heel strike
    const knee = 0.05 * amt + knA * swing * swing + load;
    th.rotation.set(thigh, 0, s * 0.035 * idle);                     // relaxed stance, feet slightly apart
    kn.rotation.x = knee;
    ft.rotation.set(-(thigh + knee) - 0.25 * swing * amt, 0, -s * 0.035 * idle);  // keep the sole level
  }
  // pelvis: turn with the leading leg, shift over the standing leg, bob twice per cycle
  h.hips.rotation.set(run * 0.12 * amt, sp * (0.1 - run * 0.03) * amt, -cp * 0.045 * amt);
  h.hips.position.set(sp * 0.018 * amt * (1 - run), 0.95 + Math.cos(phase * 2) * (0.012 + run * 0.022) * amt - run * 0.03 * amt, 0);
  // chest counter-rotates, slight forward lean, breathing when idle
  h.spine.rotation.set(0.02 + amt * (0.03 + run * 0.12) + Math.sin(t * 1.7) * 0.012 * idle, -sp * 0.17 * amt, cp * 0.025 * amt);
  h.spine.position.y = 0.17;
  h.head.rotation.set(-amt * (0.02 + run * 0.1) + Math.sin(t * 0.7) * 0.02 * idle, sp * 0.13 * amt + Math.sin(t * 0.4) * 0.08 * idle, 0);
  // arms swing opposite to the legs, elbows bend more when the arm comes forward / when running
  const arA = (0.36 + run * 0.4) * amt;
  const la = sp * arA, ra = -sp * arA;
  h.lArm.rotation.set(la, 0, -(0.1 + run * 0.08) - 0.04 * idle);
  h.rArm.rotation.set(ra, 0, 0.1 + run * 0.08 + 0.04 * idle);
  const base = -0.2 - run * 1.15 * amt;
  h.lElbow.rotation.x = base - Math.max(0, -la) * 0.7;
  h.rElbow.rotation.x = base - Math.max(0, -ra) * 0.7;

  if (block) {
    h.lArm.rotation.set(-1.3, 0, -0.25); h.rArm.rotation.set(-1.3, 0, 0.25);
    h.lElbow.rotation.x = h.rElbow.rotation.x = -2.0; h.spine.rotation.x = 0.12;
  }
  if (punch > 0) {
    const p = Math.sin(punch * Math.PI);
    const arm = side > 0 ? h.rArm : h.lArm, el = side > 0 ? h.rElbow : h.lElbow;
    arm.rotation.set((-Math.PI / 2) * p, 0, 0); el.rotation.x = -1.5 * (1 - p);
    (side > 0 ? h.lArm : h.rArm).rotation.x = -1.1; (side > 0 ? h.lElbow : h.rElbow).rotation.x = -1.9;
    h.spine.rotation.y = side * 0.35 * p;
  }
  if (kick > 0) {
    const p = Math.sin(kick * Math.PI);
    h.rLeg.rotation.x = -1.5 * p; h.rKnee.rotation.x = 0.9 * (1 - p); h.rFoot.rotation.x = 0.3 * p;
    h.lArm.rotation.x = h.rArm.rotation.x = -0.6; h.spine.rotation.x = -0.15 * p;
  }
  if (h.proc) h.applyProc();
}

export function seatedPose(h) {
  h.hips.rotation.set(0, 0, 0); h.hips.position.set(0, 0.95, 0);
  h.lLeg.rotation.set(-1.3, 0, 0); h.rLeg.rotation.set(-1.3, 0, 0);
  h.lKnee.rotation.x = h.rKnee.rotation.x = 1.25;
  h.lFoot.rotation.set(0.05, 0, 0); h.rFoot.rotation.set(0.05, 0, 0);
  h.lArm.rotation.set(-1.0, 0, -0.1); h.rArm.rotation.set(-1.0, 0, 0.1);
  h.lElbow.rotation.x = h.rElbow.rotation.x = -0.35;
  h.spine.rotation.set(0.1, 0, 0); h.spine.position.y = 0.17;
  h.head.rotation.set(-0.1, 0, 0);
  if (h.proc) h.applyProc();
}

const pick = (a) => a[(Math.random() * a.length) | 0];
const SKINS = [0x8d5524, 0xa0623a, 0x6b4226, 0xb87a4b, 0x7a4a2a, 0x5c3a21, 0x9c6a48];
const HAIRS = [0x0d0d0d, 0x1a120c, 0x2b1d14, 0x6e6e6e];
const TOPS = [0xf5f5f5, 0x2a9d8f, 0xc8553d, 0x457b9d, 0xe9c46a, 0x6a4c93, 0x264653, 0xa4161a, 0x3a86ff, 0x8ecae6, 0xfaf3dd, 0x7f8c8d, 0xd4a373];
const PANTS = [0x1d3557, 0x2b2b2b, 0x6b4f3a, 0x3d405b, 0x34507a, 0x8d99ae, 0xc2b280];
const SAREES = [0xc1121f, 0x7b2cbf, 0x0077b6, 0xf77f00, 0x2d6a4f, 0xd81159, 0xffb703, 0x8f2d56];
const SHOES = [0x2b2118, 0x111111, 0x5c4033, 0x8b5a2b];

export function randomLook() {
  const skin = pick(SKINS), hair = pick(HAIRS);
  if (Math.random() < 0.4) {
    const bottom = pick(['saree', 'saree', 'churidar']), saree = pick(SAREES);
    return {
      skin, hair: pick(HAIRS.slice(0, 3)), hairStyle: pick(['long', 'bun', 'long']), top: bottom === 'saree' ? new THREE.Color(saree).offsetHSL(0.05, 0, -0.08).getHex() : pick(SAREES.concat(TOPS)),
      pattern: 'plain', sleeves: 'short', bottom, saree, bottomColor: pick([0xf2efe6, 0xffffff, 0xe9d8a6]), shoes: pick(SHOES),
    };
  }
  const bottom = pick(['pants', 'pants', 'pants', 'veshti', 'shorts']);
  return {
    skin, hair, hairStyle: Math.random() < 0.12 ? 'bald' : 'short', top: pick(TOPS), pattern: pick(['plain', 'checks', 'stripes', 'tee', 'plain']),
    sleeves: Math.random() < 0.3 ? 'long' : 'short', untucked: Math.random() < 0.5, bottom, bottomColor: pick(PANTS), shoes: pick(SHOES),
    mustache: Math.random() < 0.6, glasses: Math.random() < 0.08,
  };
}
export function thugLook() {
  return { skin: pick(SKINS), hair: 0x0d0d0d, hairStyle: 'short', top: 0x151515, pattern: 'tee', sleeves: 'none', untucked: true, bottom: 'pants', bottomColor: 0x2a2a2a, shoes: 0x111111, mustache: true, band: 0xc1121f };
}

