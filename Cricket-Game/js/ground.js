// Kaathu Cricket: the stadium (outfield, pitch, stumps, boundary, stands with crowd, sight screens, floodlights, sky).
import * as THREE from 'three';
import { BOWL_Z, CENTER, BOUNDARY } from './play.js';

function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Three stumps and two bails at z, as a group so they can be knocked over.
export function makeStumps(z) {
  const g = new THREE.Group(); g.position.set(0, 0, z);
  const wood = new THREE.MeshStandardMaterial({ color: 0xf1e3c2, roughness: 0.5 });
  const stumps = [], bails = [];
  for (const x of [-0.114, 0, 0.114]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.71, 10), wood);
    s.position.set(x, 0.355, 0); s.castShadow = true; g.add(s); stumps.push(s);
  }
  for (const x of [-0.057, 0.057]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.11, 6).rotateZ(Math.PI / 2), wood);
    b.position.set(x, 0.72, 0); g.add(b); bails.push(b);
  }
  g.userData = { stumps, bails, hit: 0 };
  return g;
}
// Knock the stumps over (t = seconds since hit) or reset them (t < 0).
export function animateStumps(g, t) {
  const { stumps, bails } = g.userData;
  stumps.forEach((s, k) => {
    const dir = k - 1;
    if (t < 0) { s.position.set(-0.114 + 0.114 * k, 0.355, 0); s.rotation.set(0, 0, 0); return; }
    const a = Math.min(1, t * 4);
    s.rotation.set(a * (0.5 + Math.abs(dir) * 0.2), 0, -dir * a * 0.4);
    s.position.z = a * 0.15;
  });
  bails.forEach((b, k) => {
    if (t < 0) { b.position.set(k ? 0.057 : -0.057, 0.72, 0); b.rotation.set(0, 0, 0); return; }
    const tt = Math.min(t, 1.2);
    b.position.set((k ? 1 : -1) * (0.057 + tt * 1.2), Math.max(0.01, 0.72 + tt * 3 - 4.9 * tt * tt), tt * 1.8);
    b.rotation.set(tt * 9, tt * 5, 0);
  });
}

export function buildGround(low) {
  const group = new THREE.Group();
  const r = rng(7);
  const shadows = (m, cast, recv) => { if (!low) { m.castShadow = cast; m.receiveShadow = recv; } return m; };

  // outfield with mowing stripes (circle centred on the pitch)
  const grass = canvasTex(1024, 1024, (g, w, h) => {
    for (let k = 0; k < 24; k++) { g.fillStyle = k % 2 ? '#4f9a3a' : '#5aa844'; g.fillRect(0, (k * h) / 24, w, h / 24 + 1); }
    for (let k = 0; k < 9000; k++) { g.fillStyle = r() < 0.5 ? 'rgba(30,70,20,0.18)' : 'rgba(150,200,110,0.12)'; g.fillRect(r() * w, r() * h, 2, 2); }
  });
  const field = new THREE.Mesh(new THREE.CircleGeometry(BOUNDARY + 9, 96), new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
  field.rotation.x = -Math.PI / 2; field.position.set(CENTER.x, 0, CENTER.z);
  group.add(shadows(field, false, true));
  // the square (lighter, closely mown) and the pitch
  const sq = new THREE.Mesh(new THREE.PlaneGeometry(18, 30), new THREE.MeshStandardMaterial({ color: 0x6fb556, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  sq.rotation.x = -Math.PI / 2; sq.position.set(0, 0.005, CENTER.z);
  group.add(shadows(sq, false, true));
  const pitchTex = canvasTex(128, 1024, (g, w, h) => {
    const m = h / 24; // pixels per metre along the pitch (24 m long texture, centred)
    g.fillStyle = '#c9b07a'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2500; k++) { g.fillStyle = r() < 0.5 ? 'rgba(120,95,50,0.25)' : 'rgba(235,215,170,0.25)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 1 + r() * 2); }
    // worn patches where bowlers land
    for (const y of [h / 2 - 7 * m, h / 2 + 7 * m]) { g.fillStyle = 'rgba(140,110,70,0.35)'; g.beginPath(); g.ellipse(w / 2, y, w * 0.28, m * 1.6, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffffff';
    const lineAt = (zm, half) => g.fillRect(w / 2 - (half / 3.05) * w, h / 2 + zm * m - 2, (2 * half / 3.05) * w, 4);
    for (const s of [-1, 1]) {
      const ends = s * 10.06;          // stumps
      lineAt(ends, 1.32);              // bowling crease
      lineAt(ends - s * 1.22, 1.52);   // popping crease
      for (const x of [-1.32, 1.32]) g.fillRect(w / 2 + (x / 3.05) * w - 2, h / 2 + (ends - s * 1.22) * m - (s > 0 ? 0 : 2.44 * m), 4, 2.44 * m); // return creases
    }
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 24), new THREE.MeshStandardMaterial({ map: pitchTex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  pitch.rotation.x = -Math.PI / 2; pitch.position.set(0, 0.01, CENTER.z);
  group.add(shadows(pitch, false, true));

  // the 30-yard fielding circle, drawn as white dashes
  const dash = new THREE.MeshBasicMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (let k = 0; k < 72; k++) {
    const a = (k / 72) * Math.PI * 2, R = 30;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.3), dash);
    d.rotation.set(-Math.PI / 2, 0, a + Math.PI / 2); // lying flat, along the circle
    d.position.set(CENTER.x + Math.sin(a) * R, 0.012, CENTER.z + Math.cos(a) * R);
    group.add(d);
  }
  const stumpsBat = makeStumps(0), stumpsBowl = makeStumps(BOWL_Z);
  group.add(stumpsBat, stumpsBowl);

  // boundary rope and advertising boards
  const rope = new THREE.Mesh(new THREE.TorusGeometry(BOUNDARY, 0.09, 6, 160), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }));
  rope.rotation.x = Math.PI / 2; rope.position.set(CENTER.x, 0.09, CENTER.z);
  group.add(rope);
  const ads = ['KAATHU', 'SUDESH GAMES', 'SIXER COLA', 'PITCH TEA', 'MARINA FM', 'VEGAM'].map((s, k) => canvasTex(512, 64, (g, w, h) => {
    g.fillStyle = ['#1f5fbf', '#d7263d', '#1a1236', '#2e9e5b', '#f28c1b', '#ffd23f'][k]; g.fillRect(0, 0, w, h);
    g.fillStyle = k === 5 ? '#1a1236' : '#ffffff'; g.font = 'bold 40px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, w / 2, h / 2 + 2);
  }));
  const adMats = ads.map((t) => new THREE.MeshBasicMaterial({ map: t }));
  const adR = BOUNDARY + 6, nAds = 56;
  for (let k = 0; k < nAds; k++) {
    const a = (k / nAds) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry((2 * Math.PI * adR) / nAds - 0.2, 1.0), adMats[k % adMats.length]);
    m.position.set(CENTER.x + Math.sin(a) * adR, 0.5, CENTER.z + Math.cos(a) * adR);
    m.lookAt(CENTER.x, 0.5, CENTER.z);
    group.add(m);
  }

  // stands: stepped rings with a crowd (one instanced mesh), gaps behind each end for the sight screens
  const standMat = new THREE.MeshStandardMaterial({ color: 0x8e8f99, roughness: 0.85, side: THREE.DoubleSide });
  const seatCols = [0x1f5fbf, 0xd7263d, 0xf2f2f2];
  const tiers = 10, r0 = BOUNDARY + 12, step = 2.2, rise = 1.1;
  const gap = 0.16; // radians left open behind each end
  const segs = [[gap, Math.PI - gap], [Math.PI + gap, 2 * Math.PI - gap]];
  for (let k = 0; k < tiers; k++) {
    for (const [a0, a1] of segs) {
      const top = new THREE.Mesh(new THREE.RingGeometry(r0 + k * step, r0 + (k + 1) * step, 72, 1, a0 - Math.PI / 2, a1 - a0), new THREE.MeshStandardMaterial({ color: seatCols[k % 3], roughness: 0.8, side: THREE.DoubleSide }));
      top.rotation.x = -Math.PI / 2; top.position.set(CENTER.x, (k + 1) * rise, CENTER.z);
      group.add(top);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(r0 + k * step, r0 + k * step, rise, 72, 1, true, a0, a1 - a0), standMat);
      face.position.set(CENTER.x, (k + 0.5) * rise, CENTER.z);
      group.add(face);
    }
  }
  const backR = r0 + tiers * step;
  for (const [a0, a1] of segs) {
    const back = new THREE.Mesh(new THREE.CylinderGeometry(backR, backR, tiers * rise + 6, 72, 1, true, a0, a1 - a0), standMat);
    back.position.set(CENTER.x, (tiers * rise + 6) / 2, CENTER.z);
    group.add(back);
    const roof = new THREE.Mesh(new THREE.RingGeometry(backR - 14, backR, 72, 1, a0 - Math.PI / 2, a1 - a0), new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.5, side: THREE.DoubleSide }));
    roof.rotation.x = -Math.PI / 2; roof.position.set(CENTER.x, tiers * rise + 6, CENTER.z);
    group.add(roof);
  }
  const fanCount = low ? 1600 : 3600;
  const fans = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.8, 0.45), new THREE.MeshLambertMaterial(), fanCount);
  const fanCols = [0xe74c3c, 0xf1c40f, 0x3498db, 0xffffff, 0x2ecc71, 0xff7f50, 0x9b59b6, 0x1f5fbf, 0xf28c1b, 0x222222];
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  let placed = 0;
  while (placed < fanCount) {
    const k = (r() * tiers) | 0, seg = segs[(r() * 2) | 0], a = seg[0] + r() * (seg[1] - seg[0]);
    const rr = r0 + k * step + 0.6 + r() * (step - 1.2);
    m4.makeRotationY(a + Math.PI); m4.setPosition(CENTER.x + Math.sin(a) * rr, (k + 1) * rise + 0.4, CENTER.z + Math.cos(a) * rr);
    fans.setMatrixAt(placed, m4); fans.setColorAt(placed, col.set(fanCols[(r() * fanCols.length) | 0]));
    placed++;
  }
  fans.userData.cheer = 0;
  group.add(fans);

  // sight screens behind each end
  const screenMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.9 });
  for (const z of [CENTER.z + BOUNDARY + 8, CENTER.z - BOUNDARY - 8]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 0.5), screenMat);
    s.position.set(0, 4.5, z); group.add(s);
  }
  // floodlight towers
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.5, metalness: 0.6 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  for (const a of [0.8, 2.35, 3.95, 5.5]) {
    const rr = backR + 6, x = CENTER.x + Math.sin(a) * rr, z = CENTER.z + Math.cos(a) * rr;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 46, 8), poleMat); pole.position.set(x, 23, z); group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 0.6), lampMat); head.position.set(x, 47, z); head.lookAt(CENTER.x, 0, CENTER.z); group.add(head);
  }
  // umpire's markers / pitch-side: a few practice cones near the rope add depth
  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3a7bd5) }, hor: { value: new THREE.Color(0xcfe8ff) } },
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, hor; varying vec3 v; void main(){ gl_FragColor = vec4(mix(hor, top, pow(clamp(v.y * 1.5, 0.0, 1.0), 0.6)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  group.add(sky);
  return { group, stumpsBat, stumpsBowl, fans };
}
