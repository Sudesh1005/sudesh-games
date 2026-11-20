// Vehicles: hatchback, sports coupe, auto-rickshaw, police sedan and motorbike, with arcade physics.
// Each type's geometry is built once (smooth extruded bodies) and shared by every copy.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { resolveCircle, groundHeight, BOUNDS, clamp } from './world.js';
import * as TX from './textures.js';

export const TYPES = {
  car:    { len: 4.2, wid: 1.9, maxSpeed: 28, accel: 11, brake: 22, turn: 1.9, colors: [0xf2f2f2, 0xb8bcc2, 0x1d3557, 0xa4161a, 0x2a9d8f, 0xd98e04, 0x5a189a, 0x222222, 0x6c757d] },
  sport:  { len: 4.4, wid: 2.0, maxSpeed: 42, accel: 17, brake: 28, turn: 2.1, colors: [0xd62828, 0xffb703, 0x00b4d8, 0x8338ec, 0x111111] },
  auto:   { len: 2.8, wid: 1.4, maxSpeed: 18, accel: 9, brake: 18, turn: 2.6, colors: [0xf2c200] },
  police: { len: 4.4, wid: 2.0, maxSpeed: 36, accel: 15, brake: 26, turn: 2.0, colors: [0xf4f4f4] },
  bike:   { len: 2.2, wid: 0.8, maxSpeed: 38, accel: 16, brake: 24, turn: 2.4, colors: [0xc1121f, 0x111111, 0x1d4ed8, 0xf59e0b, 0x0f766e] },
};

const HQ = typeof matchMedia === 'undefined' || !matchMedia('(pointer: coarse)').matches;
const M = {
  glass: new THREE.MeshStandardMaterial({ color: 0x0a0f15, roughness: 0.04, metalness: 0.9 }),
  plastic: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.65 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe5e7ea, roughness: 0.12, metalness: 1 }),
  rim: new THREE.MeshStandardMaterial({ color: 0xbfc4ca, roughness: 0.28, metalness: 0.95 }),
  tire: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.95 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.5, metalness: 0.6 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x4a2a17, roughness: 0.7 }),
  canvas: new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.95, side: THREE.DoubleSide }),
  green: new THREE.MeshStandardMaterial({ color: 0x1f7a3a, roughness: 0.45, metalness: 0.2 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x1b3c8c, roughness: 0.4, metalness: 0.3 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff8e6, emissive: 0xfff2c0, emissiveIntensity: 0.3, roughness: 0.1 }),
  headOff: new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.1, metalness: 0.3 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0xff1a1a, emissiveIntensity: 0.4, roughness: 0.2 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xff9f1c, emissive: 0xff8c00, emissiveIntensity: 0.25, roughness: 0.2 }),
  burnt: new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 1 }),
  sirenR: new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff2030, emissiveIntensity: 3 }),
  sirenB: new THREE.MeshStandardMaterial({ color: 0x2050ff, emissive: 0x2050ff, emissiveIntensity: 3 }),
  sirenOff: new THREE.MeshStandardMaterial({ color: 0x5a5a66, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 }),
};
let plateMats = null, policeDecal = null, beamMat = null;
function lazyTextures() {
  if (plateMats) return;
  beamMat = new THREE.MeshBasicMaterial({
    map: TX.glow(), color: 0xfff1cf, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  plateMats = TX.plateAtlas().map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.5 }));
  policeDecal = new THREE.MeshStandardMaterial({ map: TX.decal('POLICE'), transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
}
const paints = new Map();
function paintMat(c) {
  let m = paints.get(c);
  if (!m) {
    m = HQ
      ? new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.5, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.06 })
      : new THREE.MeshStandardMaterial({ color: c, metalness: 0.45, roughness: 0.4 });
    paints.set(c, m);
  }
  return m;
}

export function setVehicleNight(n, t) {
  M.head.emissiveIntensity = 0.3 + n * 4;
  if (beamMat) { beamMat.opacity = n * 0.75; beamMat.visible = n > 0.05; }
  M.tail.emissiveIntensity = 0.4 + n * 1.6;
  const on = Math.floor(t * 6) % 2 === 0;
  M.sirenR.emissiveIntensity = on ? 5 : 0.3;
  M.sirenB.emissiveIntensity = on ? 0.3 : 5;
}

/* ------------------------------------------------------------------ geometry helpers */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
function place(g, x, y, z, rx = 0, ry = 0, rz = 0) {
  return g.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _one));
}
const rbox = (w, h, d, r = 0.04, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) =>
  place(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)), x, y, z, rx, ry, rz);
const cyl = (rt, rb, h, x, y, z, rx = 0, ry = 0, rz = 0, seg = 14) => place(new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz);
function tube(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return g.applyMatrix4(_m.compose(A.add(B).multiplyScalar(0.5), _q, _one));
}
const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { if (g.attributes.uv === undefined) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));

// Extrude a side profile (z, y points) across the width (x).
function sideExtrude(build, width, bevel = 0.06) {
  const s = new THREE.Shape(); build(s);
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 3, curveSegments: 14 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}
const shapeFrom = (pts) => (s) => { s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); };

function wheelGeo(r, w, sport) {
  const tire = merge([
    cyl(r, r, w, 0, 0, 0, 0, 0, Math.PI / 2, 24),
    cyl(r * 0.94, r * 0.94, w + 0.03, 0, 0, 0, 0, 0, Math.PI / 2, 24),
  ]);
  const spokes = sport ? 10 : 5, parts = [cyl(r * 0.62, r * 0.62, w + 0.04, 0, 0, 0, 0, 0, Math.PI / 2, 20)];
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2;
    for (const sx of [-1, 1]) parts.push(rbox(0.02, r * 0.5, sport ? 0.035 : 0.07, 0.01, sx * (w / 2 + 0.025), Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, a));
  }
  parts.push(cyl(r * 0.14, r * 0.14, w + 0.08, 0, 0, 0, 0, 0, Math.PI / 2, 10));
  return { tire, rim: merge(parts) };
}

/* ------------------------------------------------------------------ templates */
function carTemplate(type) {
  const cfg = TYPES[type], L = cfg.len, W = cfg.wid;
  const sport = type === 'sport', sedan = type === 'police';
  const o = sport
    ? { belt: 0.82, nose: 0.62, tail: 0.84, roof: 1.2, hood: 1.55, wz: L * 0.31, wr: 0.36, cabRear: -L / 2 + 0.95 }
    : sedan
      ? { belt: 0.95, nose: 0.76, tail: 0.94, roof: 1.48, hood: 1.15, wz: L * 0.31, wr: 0.34, cabRear: -L / 2 + 1.0 }
      : { belt: 0.95, nose: 0.78, tail: 0.98, roof: 1.5, hood: 1.0, wz: L * 0.32, wr: 0.33, cabRear: -L / 2 + 0.28 };
  const g0 = 0.3, ar = o.wr + 0.07;
  const body = sideExtrude((s) => {
    s.moveTo(-L / 2 + 0.1, g0);
    s.lineTo(-L / 2, 0.48);
    s.quadraticCurveTo(-L / 2 - 0.03, o.tail - 0.05, -L / 2 + 0.15, o.tail);
    s.lineTo(L / 2 - o.hood, o.belt);
    s.quadraticCurveTo(L / 2 - 0.35, o.nose + 0.08, L / 2 - 0.1, o.nose);
    s.quadraticCurveTo(L / 2 + 0.04, o.nose - 0.08, L / 2 + 0.03, 0.45);
    s.lineTo(L / 2 - 0.08, g0);
    s.lineTo(o.wz + ar, g0);
    s.absarc(o.wz, 0.36, ar, 0, Math.PI, false);
    s.lineTo(-o.wz + ar, g0);
    s.absarc(-o.wz, 0.36, ar, 0, Math.PI, false);
    s.closePath();
  }, W, 0.08);
  const cabFront = L / 2 - o.hood, roofF = cabFront - (sport ? 1.0 : 0.8), roofR = sedan ? o.cabRear + 0.55 : sport ? o.cabRear + 0.6 : -L / 2 + 0.55;
  const glass = sideExtrude(shapeFrom([
    [cabFront + 0.02, o.belt - 0.03], [roofF, o.roof], [roofR, o.roof - 0.02], [o.cabRear, sedan || sport ? o.belt - 0.02 : o.tail - 0.04],
  ]), W * 0.86, 0.05);
  const roofPanel = sideExtrude(shapeFrom([
    [roofF + 0.05, o.roof - 0.04], [roofF - 0.02, o.roof + 0.04], [roofR + 0.02, o.roof + 0.03], [roofR - 0.05, o.roof - 0.05],
  ]), W * 0.84, 0.03);
  const cabMid = (cabFront + o.cabRear) / 2;
  const paint = [
    body, roofPanel,
    rbox(W * 0.87, o.roof - o.belt, 0.1, 0.03, 0, (o.roof + o.belt) / 2, sport ? cabMid - 0.1 : cabMid + 0.1),
    rbox(0.18, 0.11, 0.08, 0.03, W / 2 + 0.07, o.belt + 0.1, cabFront - 0.2),
    rbox(0.18, 0.11, 0.08, 0.03, -W / 2 - 0.07, o.belt + 0.1, cabFront - 0.2),
  ];
  const dark = [
    rbox(W + 0.02, 0.2, 0.26, 0.07, 0, 0.42, L / 2 - 0.02),
    rbox(W + 0.02, 0.2, 0.26, 0.07, 0, 0.44, -L / 2 + 0.02),
    rbox(W * 0.5, 0.15, 0.06, 0.03, 0, o.nose - 0.12, L / 2 + 0.02),
    rbox(0.04, 0.08, 1.6, 0.02, W / 2 + 0.04, 0.38, 0), rbox(0.04, 0.08, 1.6, 0.02, -W / 2 - 0.04, 0.38, 0),
  ];
  for (const sx of [-1, 1]) {
    dark.push(rbox(0.012, o.belt - 0.42, 0.012, 0.004, sx * (W / 2 + 0.002), (o.belt + 0.42) / 2, cabFront - 0.12));
    if (!sport) dark.push(rbox(0.012, o.belt - 0.42, 0.012, 0.004, sx * (W / 2 + 0.002), (o.belt + 0.42) / 2, cabMid + 0.05));
    dark.push(rbox(0.02, 0.03, 0.14, 0.01, sx * (W / 2 + 0.01), o.belt - 0.12, cabMid + 0.35));
  }
  if (sport) {
    dark.push(rbox(W * 0.95, 0.05, 0.36, 0.02, 0, o.tail + 0.22, -L / 2 + 0.22));
    dark.push(rbox(0.06, 0.22, 0.12, 0.02, 0.6, o.tail + 0.1, -L / 2 + 0.25), rbox(0.06, 0.22, 0.12, 0.02, -0.6, o.tail + 0.1, -L / 2 + 0.25));
    dark.push(rbox(0.5, 0.1, 0.4, 0.04, 0, o.belt - 0.02, L / 2 - 0.9));
  }
  const head = [], tail = [];
  for (const sx of [-1, 1]) {
    head.push(rbox(0.42, 0.13, 0.12, 0.04, sx * W * 0.32, o.nose - 0.05, L / 2 - 0.06));
    tail.push(rbox(0.36, 0.15, 0.08, 0.03, sx * W * 0.35, o.tail - 0.16, -L / 2 + 0.02));
  }
  const parts = [
    { geo: merge(paint), mat: 'paint', shadow: true },
    { geo: merge([glass]), mat: 'glass', shadow: true },
    { geo: merge(dark), mat: 'plastic' },
    { geo: merge(head), mat: 'head' },
    { geo: merge(tail), mat: 'tail' },
    { geo: merge([rbox(0.12, 0.08, 0.06, 0.02, W * 0.42, 0.45, L / 2 + 0.1), rbox(0.12, 0.08, 0.06, 0.02, -W * 0.42, 0.45, L / 2 + 0.1)]), mat: 'amber' },
  ];
  const t = {
    parts, plates: [{ x: 0, y: 0.47, z: L / 2 + 0.16, ry: 0 }, { x: 0, y: 0.6, z: -L / 2 - 0.12, ry: Math.PI }],
    wheel: wheelGeo(o.wr, sport ? 0.28 : 0.22, sport), wheels: [],
  };
  const wx = W / 2 - 0.14;
  for (const sx of [-1, 1]) { t.wheels.push({ x: sx * wx, z: o.wz, r: o.wr, front: true }, { x: sx * wx, z: -o.wz, r: o.wr, front: false }); }
  if (sedan) {
    parts.push({ geo: merge([rbox(0.015, 0.16, L * 0.72, 0.005, W / 2 + 0.03, o.belt - 0.28, 0), rbox(0.015, 0.16, L * 0.72, 0.005, -W / 2 - 0.03, o.belt - 0.28, 0)]), mat: 'blue' });
    parts.push({ geo: merge([rbox(1.15, 0.08, 0.32, 0.03, 0, o.roof + 0.09, roofF - 0.45)]), mat: 'plastic' });
    t.siren = [rbox(0.5, 0.1, 0.26, 0.04, -0.29, o.roof + 0.17, roofF - 0.45), rbox(0.5, 0.1, 0.26, 0.04, 0.29, o.roof + 0.17, roofF - 0.45)];
    t.decals = [{ x: W / 2 + 0.045, y: o.belt - 0.5, z: cabMid + 0.2, ry: Math.PI / 2 }, { x: -W / 2 - 0.045, y: o.belt - 0.5, z: cabMid + 0.2, ry: -Math.PI / 2 }];
  }
  return t;
}

function autoTemplate() {
  const tub = sideExtrude(shapeFrom([[-1.3, 0.34], [-1.36, 0.95], [0.55, 0.95], [0.78, 0.6], [0.72, 0.34]]), 1.32, 0.07);
  const cowl = sideExtrude((s) => {
    s.moveTo(0.55, 0.36); s.lineTo(0.55, 1.22); s.lineTo(0.82, 1.24);
    s.quadraticCurveTo(1.32, 1.05, 1.34, 0.6); s.lineTo(1.2, 0.36); s.closePath();
  }, 0.96, 0.08);
  const canopyG = new THREE.CylinderGeometry(0.74, 0.74, 2.05, 18, 1, true, Math.PI / 2, Math.PI);
  canopyG.rotateX(Math.PI / 2); canopyG.scale(1, 0.55, 1); canopyG.translate(0, 1.88, -0.28);
  const canvasParts = [canopyG, rbox(1.46, 0.95, 0.05, 0.02, 0, 1.45, -1.3)];
  const darkParts = [
    tube([0.66, 0.95, 0.72], [0.66, 1.95, 0.72], 0.03), tube([-0.66, 0.95, 0.72], [-0.66, 1.95, 0.72], 0.03),
    tube([0.7, 0.95, -1.25], [0.7, 1.9, -1.25], 0.03), tube([-0.7, 0.95, -1.25], [-0.7, 1.9, -1.25], 0.03),
    rbox(1.05, 0.05, 0.05, 0.02, 0, 1.82, 0.78), rbox(0.05, 0.62, 0.05, 0.02, 0.5, 1.5, 0.8), rbox(0.05, 0.62, 0.05, 0.02, -0.5, 1.5, 0.8),
    rbox(1.36, 0.14, 0.22, 0.05, 0, 0.4, -1.32),
  ];
  const parts = [
    { geo: merge([tub, cowl]), mat: 'paint', shadow: true },
    { geo: merge([rbox(1.36, 0.14, 2.0, 0.03, 0, 0.8, -0.38), rbox(1.0, 0.12, 0.5, 0.03, 0, 0.8, 1.0)]), mat: 'green' },
    { geo: merge(canvasParts), mat: 'canvas', shadow: true },
    { geo: merge(darkParts), mat: 'plastic' },
    { geo: merge([rbox(0.98, 0.6, 0.04, 0.02, 0, 1.5, 0.8, -0.12)]), mat: 'glass' },
    { geo: merge([rbox(1.22, 0.42, 0.55, 0.08, 0, 1.12, -0.82), rbox(1.22, 0.5, 0.12, 0.05, 0, 1.45, -1.12), rbox(0.5, 0.18, 0.4, 0.06, 0, 1.12, 0.2)]), mat: 'seat' },
    { geo: merge([tube([-0.32, 1.32, 0.52], [0.32, 1.32, 0.52], 0.025), cyl(0.03, 0.03, 0.4, 0, 1.12, 0.6, -0.4)]), mat: 'chrome' },
    { geo: merge([place(new THREE.SphereGeometry(0.1, 12, 10), 0, 0.98, 1.25)]), mat: 'head' },
    { geo: merge([rbox(0.12, 0.1, 0.05, 0.02, 0.5, 0.72, -1.38), rbox(0.12, 0.1, 0.05, 0.02, -0.5, 0.72, -1.38)]), mat: 'tail' },
  ];
  return {
    parts, plates: [{ x: 0, y: 0.6, z: -1.4, ry: Math.PI, s: 0.6 }],
    wheel: wheelGeo(0.28, 0.15, false),
    wheels: [{ x: 0, z: 1.0, r: 0.28, front: true }, { x: -0.62, z: -0.8, r: 0.28, front: false }, { x: 0.62, z: -0.8, r: 0.28, front: false }],
  };
}

function bikeTemplate() {
  const tank = place(new THREE.SphereGeometry(0.2, 18, 12), 0, 0.98, 0.2); tank.scale(1, 1, 1);
  const tankG = new THREE.SphereGeometry(0.2, 18, 12); tankG.scale(0.95, 0.7, 1.55); place(tankG, 0, 0.98, 0.18);
  void tank;
  const paint = [
    tankG,
    rbox(0.3, 0.22, 0.36, 0.05, 0, 0.78, -0.32),
    rbox(0.2, 0.05, 0.55, 0.02, 0, 0.84, -0.85, 0.22),
    rbox(0.16, 0.04, 0.4, 0.02, 0, 0.72, 0.82, -0.3),
  ];
  const darkP = [
    tube([0, 0.48, -0.7], [0, 0.95, 0.5], 0.04), tube([0, 0.48, -0.7], [0, 0.42, 0.25], 0.04),
    tube([0, 0.95, -0.15], [0, 0.48, -0.7], 0.035),
    rbox(0.3, 0.3, 0.38, 0.05, 0, 0.5, 0.05),
    tube([-0.36, 1.12, 0.52], [0.36, 1.12, 0.52], 0.022),
    tube([0.22, 1.12, 0.5], [0.3, 1.32, 0.45], 0.012), tube([-0.22, 1.12, 0.5], [-0.3, 1.32, 0.45], 0.012),
    rbox(0.1, 0.06, 0.03, 0.01, 0.3, 1.34, 0.45), rbox(0.1, 0.06, 0.03, 0.01, -0.3, 1.34, 0.45),
  ];
  for (let k = 0; k < 4; k++) darkP.push(rbox(0.36, 0.02, 0.3, 0.01, 0, 0.56 + k * 0.05, 0.12));
  const chromeP = [
    tube([0.08, 0.36, 0.76], [0.08, 1.06, 0.55], 0.03), tube([-0.08, 0.36, 0.76], [-0.08, 1.06, 0.55], 0.03),
    tube([0.16, 0.42, 0.05], [0.2, 0.52, -0.95], 0.045),
    place(new THREE.TorusGeometry(0.1, 0.015, 8, 16), 0, 1.0, 0.68),
  ];
  const parts = [
    { geo: merge(paint), mat: 'paint', shadow: true },
    { geo: merge(darkP), mat: 'dark', shadow: true },
    { geo: merge(chromeP), mat: 'chrome' },
    { geo: merge([rbox(0.28, 0.1, 0.62, 0.05, 0, 0.94, -0.38)]), mat: 'plastic' },
    { geo: merge([place(new THREE.SphereGeometry(0.095, 14, 10), 0, 1.0, 0.66)]), mat: 'head' },
    { geo: merge([rbox(0.14, 0.07, 0.05, 0.02, 0, 0.86, -1.12)]), mat: 'tail' },
  ];
  const tire = new THREE.TorusGeometry(0.29, 0.06, 10, 28); tire.rotateY(Math.PI / 2);
  const rimP = [place(new THREE.TorusGeometry(0.23, 0.015, 6, 28), 0, 0, 0, 0, Math.PI / 2), cyl(0.05, 0.05, 0.12, 0, 0, 0, 0, 0, Math.PI / 2, 10)];
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; rimP.push(tube([0, 0, 0], [0, Math.cos(a) * 0.23, Math.sin(a) * 0.23], 0.006, 4)); }
  rimP.push(cyl(0.11, 0.11, 0.02, 0.05, 0, 0, 0, 0, Math.PI / 2, 16));
  return {
    parts, plates: [{ x: 0, y: 0.72, z: -1.1, ry: Math.PI, s: 0.45 }],
    wheel: { tire: merge([tire]), rim: merge(rimP) },
    wheels: [{ x: 0, z: 0.76, r: 0.35, front: true }, { x: 0, z: -0.74, r: 0.35, front: false }],
  };
}

const templates = {};
function template(type) {
  if (!templates[type]) templates[type] = type === 'auto' ? autoTemplate() : type === 'bike' ? bikeTemplate() : carTemplate(type);
  return templates[type];
}
const plateGeo = new THREE.PlaneGeometry(0.52, 0.12);
const decalGeo = new THREE.PlaneGeometry(1.1, 0.28);

let ids = 0;
export class Vehicle {
  constructor(type, color) {
    lazyTextures();
    this.id = ids++;
    this.type = type;
    this.cfg = TYPES[type];
    this.mesh = new THREE.Group();
    this.pos = this.mesh.position;
    this.heading = 0; this.speed = 0; this.steer = 0;
    this.vel = { x: 0, z: 0 };
    this.health = 100;
    this.driver = null; this.ai = null;
    this.police = type === 'police';
    this.mode = 'patrol'; this.siren = false;
    this.wheels = []; this.bodyParts = [];
    this.radius = this.cfg.len * 0.42;
    const cols = this.cfg.colors;
    const col = color ?? cols[(Math.random() * cols.length) | 0];
    const T = template(type);
    this.headMeshes = [];
    for (const p of T.parts) {
      const mat = p.mat === 'paint' ? paintMat(col) : p.mat === 'head' ? M.headOff : M[p.mat];
      const m = new THREE.Mesh(p.geo, mat);
      m.castShadow = !!p.shadow;
      this.mesh.add(m);
      if (p.mat === 'head') this.headMeshes.push(m);
      if (p.mat === 'paint' || p.mat === 'green' || p.mat === 'blue') { m.userData.mat = mat; this.bodyParts.push(m); }
    }
    const plate = plateMats[(Math.random() * plateMats.length) | 0];
    for (const pl of T.plates) {
      const m = new THREE.Mesh(plateGeo, plate);
      m.position.set(pl.x, pl.y, pl.z); m.rotation.y = pl.ry; if (pl.s) m.scale.setScalar(pl.s);
      this.mesh.add(m);
    }
    if (T.siren) {
      this.sR = new THREE.Mesh(T.siren[0], M.sirenOff); this.sB = new THREE.Mesh(T.siren[1], M.sirenOff);
      this.mesh.add(this.sR, this.sB);
      for (const d of T.decals) { const m = new THREE.Mesh(decalGeo, policeDecal); m.position.set(d.x, d.y, d.z); m.rotation.y = d.ry; this.mesh.add(m); }
    }
    // fake headlight light-pool on the road ahead (cheap, works for every vehicle)
    const narrow = type === 'bike' || type === 'auto';
    const bw = narrow ? 3.2 : 5.2, bl = narrow ? 11 : 15;
    const beamGeo = new THREE.PlaneGeometry(bw, bl); beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0.05, this.cfg.len / 2 + bl * 0.42);
    this.beam = new THREE.Mesh(beamGeo, beamMat);
    this.beam.visible = false;
    this.mesh.add(this.beam);
    this.lightsOn = false;
    for (const w of T.wheels) {
      const pivot = new THREE.Group(); pivot.position.set(w.x, w.r, w.z); this.mesh.add(pivot);
      const spin = new THREE.Group(); pivot.add(spin);
      const tire = new THREE.Mesh(T.wheel.tire, M.tire); tire.castShadow = true;
      const rim = new THREE.Mesh(T.wheel.rim, M.rim);
      if (w.x < 0 && type !== 'bike') { tire.scale.x = -1; rim.scale.x = -1; }
      spin.add(tire, rim);
      this.wheels.push({ pivot, m: spin, front: w.front, r: w.r });
    }
  }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }
  setSiren(on) {
    if (!this.police || this.siren === on) return;
    this.siren = on;
    this.sR.material = on ? M.sirenR : M.sirenOff;
    this.sB.material = on ? M.sirenB : M.sirenOff;
  }
  damage(a) {
    if (this.health <= 0) return;
    this.health -= a;
    if (this.health <= 0) {
      this.health = 0;
      for (const p of this.bodyParts) p.material = M.burnt;
    }
  }
  repair() {
    this.health = 100;
    for (const p of this.bodyParts) p.material = p.userData.mat;
  }
  syncSpeed() { this.speed = this.vel.x * this.fx + this.vel.z * this.fz; }

  // ctl: { throttle -1..1, steer -1..1 (+ = left), handbrake }
  update(dt, ctl) {
    const c = this.cfg, dead = this.health <= 0;
    const t = dead ? 0 : ctl.throttle;
    let s = this.speed;
    if (t > 0.01) s += (s < -0.3 ? c.brake : c.accel * (1 - Math.max(0, s) / c.maxSpeed * 0.5)) * t * dt;
    else if (t < -0.01) s += (s > 0.3 ? c.brake : c.accel * 0.6) * t * dt;
    else s -= Math.sign(s) * Math.min(Math.abs(s), 2.5 * dt);
    if (ctl.handbrake) s -= Math.sign(s) * Math.min(Math.abs(s), 9 * dt);
    s -= s * 0.08 * dt;
    s = clamp(s, -c.maxSpeed * 0.35, c.maxSpeed);

    const steerT = dead ? 0 : clamp(ctl.steer, -1, 1);
    this.steer += (steerT - this.steer) * Math.min(1, dt * 8);
    const as = Math.abs(s);
    const turn = this.steer * c.turn * Math.min(1, as / 5) / (1 + as / 35) * (ctl.handbrake ? 1.5 : 1);
    this.heading += turn * dt * (s >= 0 ? 1 : -1);
    this.speed = s;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const grip = Math.min(1, (ctl.handbrake ? 2.2 : 10) * dt);
    this.vel.x += (fx * s - this.vel.x) * grip;
    this.vel.z += (fz * s - this.vel.z) * grip;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    const off = c.len / 2 - c.wid / 2, r = c.wid / 2 + 0.1;
    let impact = 0;
    for (const o of [off, -off]) {
      const tp = { x: this.pos.x + fx * o, z: this.pos.z + fz * o };
      const ox = tp.x, oz = tp.z;
      const hit = resolveCircle(tp, r);
      if (hit) {
        this.pos.x += tp.x - ox; this.pos.z += tp.z - oz;
        const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
        if (vn < 0) {
          this.vel.x -= vn * hit.nx * 1.2; this.vel.z -= vn * hit.nz * 1.2;
          impact = Math.max(impact, -vn);
        }
      }
    }
    if (this.pos.x < BOUNDS.minX || this.pos.x > BOUNDS.maxX || this.pos.z < BOUNDS.minZ || this.pos.z > BOUNDS.maxZ) {
      this.pos.x = clamp(this.pos.x, BOUNDS.minX, BOUNDS.maxX);
      this.pos.z = clamp(this.pos.z, BOUNDS.minZ, BOUNDS.maxZ);
      this.vel.x *= -0.3; this.vel.z *= -0.3; impact = Math.max(impact, Math.abs(s));
    }
    if (impact > 0) { this.syncSpeed(); if (impact > 5) this.damage(impact * 1.2); }

    const gh = groundHeight(this.pos.x, this.pos.z);
    this.pos.y += (gh - this.pos.y) * Math.min(1, dt * 12);
    this.mesh.rotation.y = this.heading;
    const lean = this.type === 'bike' ? (this.driver ? -this.steer * Math.min(1, as / 8) * 0.4 : 0.12) : -this.steer * Math.min(1, as / 20) * 0.04;
    this.mesh.rotation.z += (lean - this.mesh.rotation.z) * Math.min(1, dt * 8);
    for (const w of this.wheels) {
      w.m.rotation.x += (s * dt) / w.r;
      if (w.front) w.pivot.rotation.y = this.steer * 0.45;
    }
    // headlights are on while someone is driving it
    const on = !!(this.driver || this.ai) && !dead;
    if (on !== this.lightsOn) {
      this.lightsOn = on;
      this.beam.visible = on;
      for (const m of this.headMeshes) m.material = on ? M.head : M.headOff;
    }
    return impact;
  }
}
