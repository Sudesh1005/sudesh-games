// Kaathu Cricket: simple low-poly cricketers with run, bowl, bat-swing, crouch and catch poses.
import * as THREE from 'three';

export const KITS = [
  { shirt: 0x1f5fbf, pants: 0x1a3f80, cap: 0x10306a, name: 'Blue' },
  { shirt: 0xf28c1b, pants: 0xb85d00, cap: 0x7a3d00, name: 'Orange' },
];
const SKINS = [0x8d5524, 0xa0673d, 0xc68642, 0x7a4a2a];

export class Person {
  constructor(kit, opts = {}) {
    const k = kit, skin = new THREE.MeshStandardMaterial({ color: SKINS[(opts.skin ?? 0) % SKINS.length], roughness: 0.7 });
    const shirt = new THREE.MeshStandardMaterial({ color: opts.white ? 0xf2f2f2 : k.shirt, roughness: 0.75 });
    const pants = new THREE.MeshStandardMaterial({ color: opts.white ? 0xe8e8e8 : k.pants, roughness: 0.8 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.7 });
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    const add = (geo, mat, x, y, z, parent = this.body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = !opts.low; parent.add(m); return m; };
    this.torso = add(new THREE.BoxGeometry(0.42, 0.6, 0.24), shirt, 0, 1.25, 0);
    this.head = add(new THREE.SphereGeometry(0.12, 12, 10), skin, 0, 1.69, 0);
    if (opts.helmet) {
      add(new THREE.SphereGeometry(0.14, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), new THREE.MeshStandardMaterial({ color: k.cap, roughness: 0.4 }), 0, 1.7, 0);
      add(new THREE.BoxGeometry(0.2, 0.1, 0.02), dark, 0, 1.64, 0.13); // grille
    } else if (opts.hat) {
      add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), 0, 1.79, 0);
      add(new THREE.CylinderGeometry(0.11, 0.12, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }), 0, 1.84, 0);
    } else {
      add(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: k.cap }), 0, 1.72, 0);
      add(new THREE.BoxGeometry(0.16, 0.02, 0.12), new THREE.MeshStandardMaterial({ color: k.cap }), 0, 1.73, 0.12);
    }
    // limbs hang from pivots so they can swing
    this.legs = [-0.11, 0.11].map((x) => {
      const p = new THREE.Group(); p.position.set(x, 0.95, 0); this.body.add(p);
      add(new THREE.BoxGeometry(0.15, 0.9, 0.17), opts.pads ? new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.6 }) : pants, 0, -0.45, 0, p);
      add(new THREE.BoxGeometry(0.15, 0.08, 0.26), dark, 0, -0.91, 0.04, p);
      return p;
    });
    this.arms = [-0.27, 0.27].map((x) => {
      const p = new THREE.Group(); p.position.set(x, 1.5, 0); this.body.add(p);
      add(new THREE.BoxGeometry(0.1, 0.62, 0.11), shirt, 0, -0.3, 0, p);
      add(new THREE.BoxGeometry(0.1, 0.1, 0.1), opts.gloves ? new THREE.MeshStandardMaterial({ color: opts.gloves }) : skin, 0, -0.64, 0, p);
      return p;
    });
    if (opts.bat) {
      // the bat swings in its own group placed at the hands
      this.swing = new THREE.Group(); this.swing.position.set(0, 1.0, 0); this.root.add(this.swing);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.6, 0.045), new THREE.MeshStandardMaterial({ color: 0xe6cf98, roughness: 0.6 }));
      blade.position.y = -0.55; blade.castShadow = !opts.low; this.swing.add(blade);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), dark);
      handle.position.y = -0.12; this.swing.add(handle);
    }
    this.phase = Math.random() * 6;
  }

  // poses -------------------------------------------------------------
  stand() { this.body.position.y = 0; this.body.rotation.set(0, 0, 0); for (const l of this.legs) l.rotation.set(0, 0, 0); this.arms[0].rotation.set(0, 0, 0.1); this.arms[1].rotation.set(0, 0, -0.1); }
  crouch(k = 1) {
    this.body.position.y = -0.18 * k; this.body.rotation.x = 0.35 * k;
    this.legs[0].rotation.set(-0.5 * k, 0, 0.12); this.legs[1].rotation.set(-0.5 * k, 0, -0.12);
    this.arms[0].rotation.set(-0.9 * k, 0, 0.25); this.arms[1].rotation.set(-0.9 * k, 0, -0.25);
  }
  run(dt, speed) {
    this.phase += dt * (4 + speed * 1.3);
    const s = Math.sin(this.phase) * Math.min(1, speed / 3) * 0.9;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.05; this.body.rotation.x = 0.15;
    this.legs[0].rotation.set(s, 0, 0); this.legs[1].rotation.set(-s, 0, 0);
    this.arms[0].rotation.set(-s * 0.9, 0, 0.1); this.arms[1].rotation.set(s * 0.9, 0, -0.1);
  }
  // bowling action: k from 0 (gather) to 1 (follow-through); the right arm windmills over
  bowl(k) {
    this.arms[1].rotation.set(-Math.PI * 2 * Math.min(1, k * 1.1) + 0.2, 0, -0.1);
    this.arms[0].rotation.set(-2.6 + k * 2.2, 0, 0.2);
    this.body.rotation.x = -0.15 + k * 0.5;
  }
  catchPose(k) { this.arms[0].rotation.set(-2.4 * k, 0, 0.3); this.arms[1].rotation.set(-2.4 * k, 0, -0.3); }
  throwPose(k) { this.arms[1].rotation.set(-2.8 + k * 3.4, 0, -0.2); }
  // batting: stance, then the bat swings from back-lift (a=-2.2) through contact (0) to follow-through (+2)
  batStance() {
    this.stand();
    this.body.rotation.x = 0.25; this.legs[0].rotation.set(-0.15, 0, 0.12); this.legs[1].rotation.set(0.1, 0, -0.12);
    this.setSwing(-0.35, 0);
  }
  setSwing(a, dirAngle) {
    if (!this.swing) return;
    this.swing.rotation.set(a, dirAngle - this.root.rotation.y, 0, 'YXZ'); // dirAngle is a world heading
    // arms follow the bat roughly
    this.arms[0].rotation.set(-0.6 - Math.max(0, -a) * 0.5 + Math.max(0, a) * -0.6, 0, 0.5);
    this.arms[1].rotation.set(-0.6 - Math.max(0, -a) * 0.5 + Math.max(0, a) * -0.6, 0, -0.2);
  }
}
