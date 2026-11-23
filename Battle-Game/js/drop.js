// Theevu Yudham: the drop. A cargo plane crosses the island; players jump, free-fall and open a parachute.
import * as THREE from 'three';
import { ISLAND_R } from './world.js';

export const PLANE_Y = 170, PLANE_SPEED = 52;

// Plane route: a straight line across the island, through somewhere near the middle.
export function planeRoute(rnd) {
  const a = rnd() * Math.PI * 2, off = (rnd() - 0.5) * 220;
  const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx, L = ISLAND_R + 260;
  const ax = nx * off - dx * L, az = nz * off - dz * L;
  return { ax, az, dx, dz, len: 2 * L };
}

export function makePlane() {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x6f7a63, roughness: 0.6, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3029, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2a35, roughness: 0.1, metalness: 0.6 });
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
  add(new THREE.CylinderGeometry(2.2, 2.2, 24, 16).rotateX(Math.PI / 2), body, 0, 0, 0);
  add(new THREE.SphereGeometry(2.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), body, 0, 0, 12);
  add(new THREE.ConeGeometry(2.2, 8, 16).rotateX(-Math.PI / 2), body, 0, 0.6, -16).scale.set(1, 0.7, 1);
  add(new THREE.BoxGeometry(34, 0.5, 4.5), body, 0, 1.6, 1);              // wing
  add(new THREE.BoxGeometry(11, 0.35, 2.6), body, 0, 1.4, -18);           // tailplane
  add(new THREE.BoxGeometry(0.35, 5, 3.4), body, 0, 3.8, -18.5);          // fin
  add(new THREE.BoxGeometry(2.6, 0.9, 1.2), glass, 0, 1.2, 13.4, -0.4);   // cockpit window
  const props = [];
  for (const x of [-7, -12.5, 7, 12.5]) {
    add(new THREE.CylinderGeometry(0.9, 1.0, 4.5, 10).rotateX(Math.PI / 2), dark, x, 1.2, 3.2);
    const p = add(new THREE.BoxGeometry(5, 0.25, 0.12), dark, x, 1.2, 5.6);
    props.push(p);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.props = props;
  return g;
}

// Parachute canopy with lines, attached above the soldier.
export function makeChute() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(3.2, 20, 6, 0, Math.PI * 2, 0, Math.PI * 0.32);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), a = new THREE.Color(0xff8a1f), b = new THREE.Color(0xf4f1e8);
  for (let k = 0; k < pos.count; k++) {
    const ang = Math.atan2(pos.getZ(k), pos.getX(k)), c = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 10) % 2 ? a : b;
    col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.scale(1.35, 0.7, 0.9);
  const canopy = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  canopy.position.y = 2.2; canopy.castShadow = true;
  g.add(canopy);
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * Math.PI * 2, x = Math.cos(ang) * 3.2 * 1.35 * 0.85, z = Math.sin(ang) * 3.2 * 0.9 * 0.85;
    pts.push(x, 2.2 + 1.1, z, x > 0 ? 0.2 : -0.2, 0, 0);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x333333 })));
  g.position.y = 1.5;
  return g;
}
