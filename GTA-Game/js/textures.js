// Procedural canvas textures: asphalt, pavers, kerbs, grass, sand, concrete, facades, water, shop signs, plates.
import * as THREE from 'three';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const R = Math.random;

function finish(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Height canvas (grey) -> tangent-space normal map canvas.
export function normalFromHeight(hc, strength = 2.5) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = mk(w, h), og = out.getContext('2d');
  const img = og.createImageData(w, h), d = img.data;
  const H = (x, y) => src[((((y + h) % h) * w) + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
    const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * w + x) * 4;
    d[i] = (-dx / len * 0.5 + 0.5) * 255;
    d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    d[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  return out;
}

function speckle(gs, w, h, n, colFn, smin, smax, alpha) {
  for (let k = 0; k < n; k++) {
    const x = R() * w, y = R() * h, s = smin + R() * (smax - smin), a = alpha * (0.4 + R() * 0.6);
    for (const [g, fn] of gs) { g.globalAlpha = a; g.fillStyle = fn(); g.fillRect(x, y, s, s); }
  }
  for (const [g] of gs) g.globalAlpha = 1;
}
function blotches(g, w, h, n, rgb, rmin, rmax, alpha) {
  for (let k = 0; k < n; k++) {
    const x = R() * w, y = R() * h, r = rmin + R() * (rmax - rmin);
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${rgb},${alpha})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}

export function asphalt() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d');
  g.fillStyle = '#3d3e43'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#7a7a7a'; hg.fillRect(0, 0, S, S);
  blotches(g, S, S, 26, '0,0,0', 30, 120, 0.12);
  blotches(g, S, S, 18, '255,255,255', 30, 100, 0.035);
  speckle([[g, () => { const v = 35 + R() * 75; return `rgb(${v},${v},${v + 4})`; }], [hg, () => { const v = 120 + R() * 135; return `rgb(${v},${v},${v})`; }]], S, S, 22000, 0, 1, 2.6, 0.45);
  g.strokeStyle = 'rgba(18,18,20,0.55)'; hg.strokeStyle = 'rgba(0,0,0,0.9)';
  for (let k = 0; k < 6; k++) {
    let x = R() * S, y = R() * S;
    g.lineWidth = hg.lineWidth = 1 + R();
    g.beginPath(); hg.beginPath(); g.moveTo(x, y); hg.moveTo(x, y);
    for (let s = 0; s < 18; s++) { x += (R() - 0.5) * 16; y += (R() - 0.3) * 10; g.lineTo(x, y); hg.lineTo(x, y); }
    g.stroke(); hg.stroke();
  }
  return { map: finish(c), normal: finish(normalFromHeight(hc, 3), false) };
}

export function pavers() {
  const S = 256, T = 64, c = mk(S, S), g = c.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d');
  g.fillStyle = '#7d776d'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#202020'; hg.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += T) for (let x = 0; x < S; x += T) {
    const v = 188 + R() * 26, tint = R() * 10;
    g.fillStyle = `rgb(${v},${v - 6 - tint},${v - 18 - tint})`;
    g.fillRect(x + 2, y + 2, T - 4, T - 4);
    hg.fillStyle = '#c8c8c8'; hg.fillRect(x + 2, y + 2, T - 4, T - 4);
    hg.fillStyle = '#e0e0e0'; hg.fillRect(x + 5, y + 5, T - 10, T - 10);
  }
  speckle([[g, () => (R() < 0.5 ? '#6d665b' : '#e2dccf')], [hg, () => '#9a9a9a']], S, S, 5000, 0, 1, 2, 0.35);
  blotches(g, S, S, 10, '60,50,40', 10, 50, 0.12);
  return { map: finish(c), normal: finish(normalFromHeight(hc, 2), false) };
}

export function kerb() {
  const c = mk(256, 32), g = c.getContext('2d');
  for (let k = 0; k < 2; k++) { g.fillStyle = k ? '#1d1d1f' : '#e7c13d'; g.fillRect(k * 128, 0, 128, 32); }
  speckle([[g, () => (R() < 0.5 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.4)')]], 256, 32, 900, 0, 1, 2, 0.4);
  blotches(g, 256, 32, 6, '40,30,20', 6, 20, 0.25);
  return finish(c);
}

export function grass() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d');
  g.fillStyle = '#577f37'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  blotches(g, S, S, 30, '120,140,60', 30, 110, 0.22);
  blotches(g, S, S, 20, '40,60,20', 30, 90, 0.25);
  for (let k = 0; k < 26000; k++) {
    const x = R() * S, y = R() * S, l = 2 + R() * 5;
    const v = R();
    g.strokeStyle = v < 0.33 ? 'rgba(52,92,30,0.7)' : v < 0.66 ? 'rgba(104,150,62,0.6)' : 'rgba(150,170,80,0.45)';
    g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 2, y - l); g.stroke();
    hg.strokeStyle = `rgba(255,255,255,${0.3 * R()})`; hg.beginPath(); hg.moveTo(x, y); hg.lineTo(x, y - l); hg.stroke();
  }
  return { map: finish(c), normal: finish(normalFromHeight(hc, 1.5), false) };
}

export function sand() {
  const S = 512, c = mk(S, S), g = c.getContext('2d'), hc = mk(S, S), hg = hc.getContext('2d');
  g.fillStyle = '#dcc48c'; g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, S, S);
  blotches(g, S, S, 24, '255,240,200', 40, 130, 0.18);
  blotches(g, S, S, 18, '150,120,70', 30, 100, 0.12);
  for (let y = 0; y < S; y += 7) {
    hg.strokeStyle = 'rgba(255,255,255,0.35)'; hg.lineWidth = 2; hg.beginPath();
    g.strokeStyle = 'rgba(170,140,90,0.10)'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x <= S; x += 8) {
      const yy = y + Math.sin(x * 0.045 + y * 0.3) * 3;
      if (x === 0) { hg.moveTo(x, yy); g.moveTo(x, yy); } else { hg.lineTo(x, yy); g.lineTo(x, yy); }
    }
    hg.stroke(); g.stroke();
  }
  speckle([[g, () => (R() < 0.5 ? '#b89c64' : '#fff4d8')], [hg, () => '#d0d0d0']], S, S, 16000, 0, 1, 1.8, 0.5);
  return { map: finish(c), normal: finish(normalFromHeight(hc, 2), false) };
}

export function concrete() {
  const S = 256, c = mk(S, S), g = c.getContext('2d');
  g.fillStyle = '#a19b92'; g.fillRect(0, 0, S, S);
  blotches(g, S, S, 16, '60,55,50', 20, 70, 0.18);
  blotches(g, S, S, 10, '255,255,255', 20, 60, 0.1);
  speckle([[g, () => (R() < 0.5 ? '#7c766d' : '#c4beb4')]], S, S, 6000, 0, 1, 2, 0.4);
  return finish(c);
}

export function waterNormal() {
  const S = 256, hc = mk(S, S), hg = hc.getContext('2d');
  const img = hg.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    const h = Math.sin(u * 3 + v * 2) * 0.3 + Math.sin(u * 7 - v * 5) * 0.2 + Math.sin(u * 13 + v * 11) * 0.12 + Math.sin(v * 9) * 0.15;
    const val = (h * 0.5 + 0.5) * 255, i = (y * S + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = val; d[i + 3] = 255;
  }
  hg.putImageData(img, 0, 0);
  return finish(normalFromHeight(hc, 4), false);
}

// One 4-window x 2-floor facade tile (9 m x 7 m) shared by every building; colour comes from the material.
export function facade() {
  const W = 256, H = 128, cw = 64, ch = 64;
  const map = mk(W, H), g = map.getContext('2d');
  const rm = mk(W, H), r = rm.getContext('2d');       // G = roughness, B = metalness
  const hc = mk(W, H), hg = hc.getContext('2d');      // height
  const ems = [mk(W, H), mk(W, H)];
  g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, W, H);
  blotches(g, W, H, 14, '120,110,95', 10, 40, 0.10);
  speckle([[g, () => (R() < 0.5 ? '#d8d2c4' : '#ffffff')]], W, H, 3000, 0, 1, 2, 0.3);
  r.fillStyle = 'rgb(0,235,0)'; r.fillRect(0, 0, W, H);
  hg.fillStyle = '#909090'; hg.fillRect(0, 0, W, H);
  for (const e of ems) { const eg = e.getContext('2d'); eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H); }
  const curtains = ['#c0392b', '#2e86de', '#f6b93b', '#78e08f', '#e056fd', '#f8efba'];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
    const x = col * cw, y = row * ch;
    // floor ledge
    g.fillStyle = '#e4dfd4'; g.fillRect(x, y + ch - 5, cw, 5);
    hg.fillStyle = '#c8c8c8'; hg.fillRect(x, y + ch - 5, cw, 5);
    const fx = x + 10, fy = y + 9, fw = 44, fh = 42;
    g.fillStyle = '#ebebeb'; g.fillRect(fx - 2, fy - 2, fw + 4, fh + 4);
    hg.fillStyle = '#d0d0d0'; hg.fillRect(fx - 2, fy - 2, fw + 4, fh + 4);
    r.fillStyle = 'rgb(0,140,0)'; r.fillRect(fx - 2, fy - 2, fw + 4, fh + 4);
    const gr = g.createLinearGradient(0, fy, 0, fy + fh);
    gr.addColorStop(0, '#9cbcd0'); gr.addColorStop(0.55, '#4b6476'); gr.addColorStop(1, '#2a3a46');
    g.fillStyle = gr; g.fillRect(fx + 2, fy + 2, fw - 4, fh - 4);
    hg.fillStyle = '#404040'; hg.fillRect(fx + 2, fy + 2, fw - 4, fh - 4);
    r.fillStyle = 'rgb(0,20,90)'; r.fillRect(fx + 2, fy + 2, fw - 4, fh - 4);
    const curtain = R() < 0.3 ? curtains[(R() * curtains.length) | 0] : null;
    if (curtain) { g.globalAlpha = 0.75; g.fillStyle = curtain; g.fillRect(fx + 2, fy + 2, (fw - 4) * (0.3 + R() * 0.4), fh - 4); g.globalAlpha = 1; }
    // mullions
    g.fillStyle = '#e6e6e6'; g.fillRect(fx + fw / 2 - 1.5, fy, 3, fh); g.fillRect(fx, fy + 14, fw, 2.5);
    hg.fillStyle = '#c0c0c0'; hg.fillRect(fx + fw / 2 - 1.5, fy, 3, fh);
    // window grill
    if (R() < 0.35) {
      g.fillStyle = 'rgba(40,40,40,0.85)'; hg.fillStyle = '#e8e8e8';
      for (let k = 1; k < 6; k++) { g.fillRect(fx + (fw / 6) * k, fy, 1.5, fh); hg.fillRect(fx + (fw / 6) * k, fy, 1.5, fh); }
      g.fillRect(fx, fy + fh / 2, fw, 1.5);
    }
    // sill
    g.fillStyle = '#d9d5cc'; g.fillRect(fx - 4, fy + fh + 2, fw + 8, 4);
    hg.fillStyle = '#f0f0f0'; hg.fillRect(fx - 4, fy + fh + 2, fw + 8, 4);
    // AC unit
    if (R() < 0.22) {
      const ax = fx + (R() < 0.5 ? 2 : fw - 22), ay = fy + fh - 14;
      g.fillStyle = '#d4d6d8'; g.fillRect(ax, ay, 20, 13);
      g.fillStyle = '#9a9ea3'; for (let k = 0; k < 4; k++) g.fillRect(ax + 2, ay + 2 + k * 3, 16, 1);
      hg.fillStyle = '#ffffff'; hg.fillRect(ax, ay, 20, 13);
      r.fillStyle = 'rgb(0,120,60)'; r.fillRect(ax, ay, 20, 13);
    }
    // night lighting variants
    ems.forEach((e, k) => {
      if (R() < (k ? 0.35 : 0.6)) {
        const eg = e.getContext('2d');
        const warm = R() < 0.75;
        const lg = eg.createLinearGradient(0, fy, 0, fy + fh);
        lg.addColorStop(0, warm ? '#ffe2a8' : '#d6ecff'); lg.addColorStop(1, warm ? '#c98a3a' : '#7aa3c8');
        eg.fillStyle = lg; eg.fillRect(fx + 2, fy + 2, fw - 4, fh - 4);
        if (curtain) { eg.globalAlpha = 0.6; eg.fillStyle = curtain; eg.fillRect(fx + 2, fy + 2, (fw - 4) * 0.4, fh - 4); eg.globalAlpha = 1; }
      }
    });
  }
  return {
    map: finish(map), rough: finish(rm, false), normal: finish(normalFromHeight(hc, 2.2), false),
    ems: ems.map((e) => finish(e)),
  };
}

export const SHOPS = [
  ['Selvi Tiffin Centre', 'உணவகம்', '#c0392b'], ['Kaveri Bakery', 'பேக்கரி', '#d35400'],
  ['Raja Mobiles', 'மொபைல்ஸ்', '#2471a3'], ['Vel Hardware', 'ஹார்டுவேர்', '#196f3d'],
  ['Thendral Fancy', 'ஃபேன்சி ஸ்டோர்', '#8e44ad'], ['Murugan Tea Stall', 'டீ கடை', '#b9770e'],
  ['Lakshmi Textiles', 'ஜவுளி', '#922b21'], ['Kumar Medicals', 'மருந்தகம்', '#1e8449'],
  ['Anbu Provisions', 'மளிகை', '#1a5276'], ['Kalai Studio', 'ஸ்டுடியோ', '#212f3d'],
  ['Nila Sweets', 'இனிப்பகம்', '#e67e22'], ['Siva Electricals', 'எலக்ட்ரிகல்ஸ்', '#2e4053'],
  ['Malar Flowers', 'பூக்கடை', '#c2185b'], ['Ganesh Xerox', 'ஜெராக்ஸ்', '#0e6655'],
  ['Arun Opticals', 'கண்ணாடி', '#5b2c6f'], ['Meena Jewellery', 'நகை', '#9a7d0a'],
];

export function signAtlas() {
  const cols = 4, rows = 4, cw = 256, ch = 96, c = mk(cw * cols, ch * rows), g = c.getContext('2d');
  SHOPS.forEach(([en, ta, bg], k) => {
    const x = (k % cols) * cw, y = ((k / cols) | 0) * ch;
    const gr = g.createLinearGradient(0, y, 0, y + ch);
    gr.addColorStop(0, bg); gr.addColorStop(1, '#111');
    g.fillStyle = gr; g.fillRect(x, y, cw, ch);
    g.strokeStyle = '#ffd86b'; g.lineWidth = 4; g.strokeRect(x + 4, y + 4, cw - 8, ch - 8);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 30; g.font = `bold ${fs}px Arial, sans-serif`;
    while (g.measureText && g.measureText(en).width > cw - 24 && fs > 14) { fs -= 2; g.font = `bold ${fs}px Arial, sans-serif`; }
    g.fillText(en.toUpperCase(), x + cw / 2, y + 34);
    g.fillStyle = '#ffe08a'; g.font = `bold 24px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif`;
    g.fillText(ta, x + cw / 2, y + 70);
  });
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const uv = (k) => {
    const col = k % cols, row = (k / cols) | 0;
    return [col / cols, 1 - (row + 1) / rows, (col + 1) / cols, 1 - row / rows];
  };
  return { tex: t, count: SHOPS.length, uv };
}

export function plateAtlas() {
  const cols = 2, rows = 4, cw = 256, ch = 60, c = mk(cw * cols, ch * rows), g = c.getContext('2d');
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  for (let k = 0; k < cols * rows; k++) {
    const x = (k % cols) * cw, y = ((k / cols) | 0) * ch;
    g.fillStyle = k % 4 === 3 ? '#f5d000' : '#f6f6f2'; g.fillRect(x, y, cw, ch);
    g.strokeStyle = '#111'; g.lineWidth = 4; g.strokeRect(x + 3, y + 3, cw - 6, ch - 6);
    const txt = `TN ${String(1 + ((R() * 98) | 0)).padStart(2, '0')} ${L[(R() * L.length) | 0]}${L[(R() * L.length) | 0]} ${(1000 + R() * 8999) | 0}`;
    g.fillStyle = '#111'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, x + cw / 2, y + ch / 2 + 2);
  }
  const base = finish(c);
  const tiles = [];
  for (let k = 0; k < cols * rows; k++) {
    const t = base.clone(); t.needsUpdate = true;
    t.repeat.set(1 / cols, 1 / rows);
    t.offset.set((k % cols) / cols, 1 - (((k / cols) | 0) + 1) / rows);
    tiles.push(t);
  }
  return tiles;
}

export function decal(text, color = '#1d4fa8') {
  const c = mk(256, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = color; g.font = 'bold 46px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = finish(c); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function glow() {
  const c = mk(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return finish(c);
}
