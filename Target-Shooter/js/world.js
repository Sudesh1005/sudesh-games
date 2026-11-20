// Target Shooter: the indoor shooting range and the drone arena (meshes, collision boxes, spawn points).
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function noise(g, w, h, n, cols, alpha = 0.25, size = 3) {
  const r = rng(n);
  for (let k = 0; k < n; k++) { g.fillStyle = cols[k % cols.length]; g.globalAlpha = alpha * (0.4 + r()); g.fillRect(r() * w, r() * h, 1 + r() * size, 1 + r() * size); }
  g.globalAlpha = 1;
}

const TEX = {
  concrete: () => canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#8d8e92'; g.fillRect(0, 0, w, h); noise(g, w, h, 5000, ['#7a7b80', '#a0a1a6', '#6c6d72']); }),
  panel: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9cbd0'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, ['#b9bbc0', '#d6d8dc'], 0.3, 2);
    g.fillStyle = '#9fa2a8'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  }),
  sand: () => canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#b8955f'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, ['#a3824f', '#caa877', '#8f7146'], 0.5, 2); }),
  wood: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#a0723f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) { g.fillStyle = '#7d5530'; g.fillRect(0, y, w, 3); }
    noise(g, w, h, 900, ['#8a6034', '#b5864f'], 0.35, 4);
    g.strokeStyle = '#6b4626'; g.lineWidth = 9; g.strokeRect(4, 4, w - 8, h - 8);
    g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.stroke();
  }, false),
  metal: () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#3f6b4c'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, 0, 5, h); }
    g.fillStyle = '#e8b52e'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
    noise(g, w, h, 500, ['#2f5a3c', '#5a8a66'], 0.3, 3);
  }, false),
  grid: () => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4a4d55'; g.fillRect(0, 0, w, h); noise(g, w, h, 3000, ['#41444b', '#555860'], 0.4, 3);
    g.strokeStyle = '#2d2f35'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,210,63,0.35)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
  }),
  hazard: () => canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#6a6c72'; g.fillRect(0, 0, w, h); noise(g, w, h, 800, ['#5d5f65', '#77797f'], 0.4, 3);
    for (let x = -64; x < w; x += 32) { g.fillStyle = '#e8b52e'; g.beginPath(); g.moveTo(x, h - 14); g.lineTo(x + 16, h - 14); g.lineTo(x + 30, h); g.lineTo(x + 14, h); g.fill(); }
  }),
};

function label(text, w = 256, h = 96, fg = '#ffffff', bg = 'rgba(0,0,0,0)') {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `bold ${Math.round(h * 0.6)}px Impact, "Arial Black", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
  }, false);
}

class Builder {
  constructor(low) { this.group = new THREE.Group(); this.boxes = []; this.hit = []; this.low = low; }
  box(w, h, d, x, y, z, mat, { solid = true, shoot = true, shadow = true, uv = 0 } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (uv) { // world-scaled texture coordinates for tiling materials
      const a = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const k = f * 4 + v; a.setXY(k, a.getX(k) * dims[f][0] / uv, a.getY(k) * dims[f][1] / uv); }
    }
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    if (!this.low && shadow) { m.castShadow = true; m.receiveShadow = true; }
    this.group.add(m);
    if (solid) this.boxes.push({ min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2) });
    if (shoot) this.hit.push(m);
    return m;
  }
  plane(w, h, x, y, z, rx, ry, mat, shoot = true) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0, 'YXZ');
    if (!this.low) m.receiveShadow = true;
    this.group.add(m);
    if (shoot) this.hit.push(m);
    return m;
  }
}

/* ------------------------------------------------------------------ indoor range */
export function buildRange(low) {
  const B = new Builder(low);
  const L = 62, W = 24, H = 6;
  const floorT = TEX.concrete(); floorT.repeat.set(W / 4, L / 4);
  const floor = B.plane(W, L + 8, 0, 0, -L / 2 + 4, -Math.PI / 2, 0, new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.9 }));
  floor.userData.floor = true;
  const wallT = TEX.panel(); wallT.repeat.set(L / 4, H / 4);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallT, roughness: 0.8 });
  B.box(0.4, H, L + 8, -W / 2 - 0.2, H / 2, -L / 2 + 4, wallMat);
  B.box(0.4, H, L + 8, W / 2 + 0.2, H / 2, -L / 2 + 4, wallMat);
  const backT = TEX.panel(); backT.repeat.set(W / 4, H / 4);
  B.box(W, H, 0.4, 0, H / 2, 8.2, new THREE.MeshStandardMaterial({ map: backT, roughness: 0.8 }));
  const ceilT = TEX.panel(); ceilT.repeat.set(W / 4, L / 4);
  B.plane(W, L + 8, 0, H, -L / 2 + 4, Math.PI / 2, 0, new THREE.MeshStandardMaterial({ map: ceilT, roughness: 0.9, color: 0x9a9ca2 }));
  // sand berm and dark back wall behind the targets
  const sandT = TEX.sand(); sandT.repeat.set(6, 2);
  const berm = B.box(W, 3, 6, 0, 1.5, -L - 1, new THREE.MeshStandardMaterial({ map: sandT, roughness: 1 }));
  berm.rotation.x = -0.35;
  B.box(W, H, 0.5, 0, H / 2, -L - 4, new THREE.MeshStandardMaterial({ color: 0x2a2b30, roughness: 0.9 }));
  // shooting counter + booth dividers
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.6 });
  B.box(W, 1.05, 0.7, 0, 0.525, -0.6, woodMat);
  B.box(W, 0.06, 0.9, 0, 1.08, -0.65, new THREE.MeshStandardMaterial({ color: 0x2b2c31, roughness: 0.4, metalness: 0.4 }));
  const divMat = new THREE.MeshStandardMaterial({ color: 0x3c4a5c, roughness: 0.6 });
  for (const x of [-10, -6, -2, 2, 6, 10]) B.box(0.08, 2.2, 2.4, x, 1.1, 0.6, divMat);
  // lane lines + distance markers on the floor
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e3d6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const x of [-10, -6, -2, 2, 6, 10]) B.plane(0.12, L - 4, x, 0.01, -L / 2 - 1, -Math.PI / 2, 0, lineMat, false);
  for (const d of [10, 20, 30, 40, 50]) {
    B.plane(W, 0.15, 0, 0.012, -d, -Math.PI / 2, 0, new THREE.MeshBasicMaterial({ color: 0xffd23f, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), false);
    const sign = B.plane(2.2, 0.8, 0, H - 0.7, -d, 0, 0, new THREE.MeshBasicMaterial({ map: label(d + ' m', 256, 96, '#ffd23f', '#1a1236') }), false);
    sign.userData.sign = true;
  }
  // ceiling light strips (glowing) + real lights
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  for (let z = 4; z > -L; z -= 8) for (const x of [-6, 6]) B.box(0.4, 0.06, 5, x, H - 0.05, z, stripMat, { solid: false, shoot: false, shadow: false });
  const lights = [];
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0x4a4a52, 1.25);
  const dir = new THREE.DirectionalLight(0xfff2dc, 1.4);
  dir.position.set(4, 14, 10); dir.target.position.set(0, 0, -25);
  if (!low) { dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048); Object.assign(dir.shadow.camera, { left: -16, right: 16, top: 40, bottom: -40, near: 1, far: 90 }); dir.shadow.bias = -0.0005; }
  lights.push(hemi, dir, dir.target);
  const spot = new THREE.SpotLight(0xffffff, 300, 80, 0.5, 0.6, 1.2);
  spot.position.set(0, H - 0.3, 2); spot.target.position.set(0, 1, -35);
  lights.push(spot, spot.target);
  for (const l of lights) B.group.add(l);
  return {
    group: B.group, boxes: B.boxes, hit: B.hit,
    bounds: { x0: -W / 2 + 0.6, x1: W / 2 - 0.6, z0: 0.1, z1: 7.4 },
    spawn: { x: 0, y: 0, z: 3, yaw: 0 },
    bg: 0x2a2b30, fog: null, lanes: [-8, -4, 0, 4, 8], dists: [10, 17, 25, 35, 48],
  };
}

/* ------------------------------------------------------------------ drone arena */
export function buildArena(low) {
  const B = new Builder(low), r = rng(91), S = 32, H = 5;
  const floorT = TEX.grid(); floorT.repeat.set(S / 2, S / 2);
  const floor = B.plane(S * 2, S * 2, 0, 0, 0, -Math.PI / 2, 0, new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.85 }));
  floor.userData.floor = true;
  const wallT = TEX.hazard(); wallT.repeat.set(S / 4, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallT, roughness: 0.85 });
  B.box(S * 2 + 1, H, 0.6, 0, H / 2, -S - 0.3, wallMat); B.box(S * 2 + 1, H, 0.6, 0, H / 2, S + 0.3, wallMat);
  B.box(0.6, H, S * 2 + 1, -S - 0.3, H / 2, 0, wallMat); B.box(0.6, H, S * 2 + 1, S + 0.3, H / 2, 0, wallMat);
  // cover: crates, containers, pillars, low walls (symmetric so every side has cover)
  const crateMat = new THREE.MeshStandardMaterial({ map: TEX.wood(), roughness: 0.75 });
  const contMat = new THREE.MeshStandardMaterial({ map: TEX.metal(), roughness: 0.55, metalness: 0.4 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x8d9097, roughness: 0.7 });
  const lowT = TEX.concrete(); lowT.repeat.set(2, 1);
  const lowMat = new THREE.MeshStandardMaterial({ map: lowT, roughness: 0.9 });
  const quads = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (const [sx, sz] of quads) {
    B.box(6, 2.6, 2.4, sx * 18, 1.3, sz * 8, contMat);
    B.box(1.4, 6, 1.4, sx * 10, 3, sz * 10, pillarMat);
    B.box(5, 1.1, 0.5, sx * 6, 0.55, sz * 18, lowMat, { uv: 2 });
    B.box(0.5, 1.1, 5, sx * 22, 0.55, sz * 20, lowMat, { uv: 2 });
    for (let k = 0; k < 3; k++) {
      const x = sx * (4 + r() * 24), z = sz * (4 + r() * 24);
      if (Math.abs(x) < 4 && Math.abs(z) < 4) continue;
      B.box(1.2, 1.0, 1.2, x, 0.5, z, crateMat);
      if (r() < 0.5) B.box(1.2, 1.0, 1.2, x + 1.25, 0.5, z, crateMat);
      if (r() < 0.35) B.box(1.2, 1.0, 1.2, x, 1.5, z, crateMat);
    }
  }
  B.box(4, 1.0, 4, 0, 0.5, 0, lowMat, { uv: 2 }); // centre platform
  // drone portals in the corners, high on the walls
  const portals = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
  for (const [sx, sz] of quads) {
    const p = new THREE.Vector3(sx * (S - 3), 6.5, sz * (S - 3));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 28), ringMat);
    ring.position.copy(p); ring.lookAt(0, 6.5, 0);
    B.group.add(ring);
    const pole = B.box(0.3, 6.5, 0.3, sx * (S - 1.2), 3.25, sz * (S - 1.2), pillarMat);
    pole.userData.pole = true;
    portals.push(p);
  }
  // sky, lights
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x1d2a5a) }, hor: { value: new THREE.Color(0xf09060) } },
    vertexShader: 'varying vec3 v; void main(){ v = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, hor; varying vec3 v; void main(){ gl_FragColor = vec4(mix(hor, top, pow(clamp(v.y * 1.4, 0.0, 1.0), 0.6)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  B.group.add(sky);
  const hemi = new THREE.HemisphereLight(0xc8d2ff, 0x5a4a40, 1.1);
  const sun = new THREE.DirectionalLight(0xffc89a, 2.2);
  sun.position.set(30, 30, 20); sun.target.position.set(0, 0, 0);
  if (!low) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 1, far: 120 }); sun.shadow.bias = -0.0005; }
  for (const l of [hemi, sun, sun.target]) B.group.add(l);
  return {
    group: B.group, boxes: B.boxes, hit: B.hit,
    bounds: { x0: -S + 0.5, x1: S - 0.5, z0: -S + 0.5, z1: S - 0.5 },
    spawn: { x: 0, y: 1, z: 6, yaw: 0 }, portals, size: S,
    bg: 0xc08a70, fog: [0xc08a70, 60, 160],
  };
}
