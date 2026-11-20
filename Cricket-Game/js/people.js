// Kaathu Cricket: cricketers built on the smooth skinned humans from Kadal Nagaram (human.js),
// dressed in team kits with helmets, pads, gloves, caps and a bat, plus cricket poses.
import * as THREE from 'three';
import { makeHuman, animateHuman } from './human.js';

export const KITS = [
  { shirt: 0x1f5fbf, pants: 0x1a3f80, cap: 0x10306a, name: 'Blue' },
  { shirt: 0xf28c1b, pants: 0xb85d00, cap: 0x7a3d00, name: 'Orange' },
];
const SKINS = [0x8d5524, 0xa0623a, 0x6b4226, 0xb87a4b, 0x7a4a2a, 0x5c3a21, 0x9c6a48];
const HAIRS = [0x0d0d0d, 0x1a120c, 0x2b1d14];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Person {
  constructor(kit, opts = {}) {
    const n = opts.skin ?? 0;
    const look = {
      skin: SKINS[n % SKINS.length], hair: HAIRS[n % HAIRS.length], hairStyle: 'short',
      top: opts.white ? 0xf4f4f4 : kit.shirt, pattern: 'tee', sleeves: opts.white ? 'long' : 'short', untucked: false,
      bottom: 'pants', bottomColor: opts.white ? 0x2a2a2e : kit.pants, shoes: 0xf2f2f2,
      mustache: n % 3 === 1, stubble: n % 2 === 0, build: 'athletic',
    };
    this.h = makeHuman(look, { shadow: !opts.low, texSize: opts.low ? 128 : 256 });
    this.root = this.h.root;
    this.phase = Math.random() * 6;
    const h = this.h, cast = !opts.low;
    const attach = (bone, geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = cast; bone.add(m); return m; };
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
    // head gear (the head bone sits at the base of the skull, ~1.56 m up)
    if (opts.helmet) {
      const shell = new THREE.MeshStandardMaterial({ color: kit.cap, roughness: 0.35, metalness: 0.2 });
      attach(h.head, new THREE.SphereGeometry(0.118, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), shell, 0, 0.215, -0.005);
      attach(h.head, new THREE.BoxGeometry(0.2, 0.012, 0.09), shell, 0, 0.2, 0.11, 0.25);
      const grille = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 });
      for (const y of [0.13, 0.1, 0.07]) attach(h.head, new THREE.TorusGeometry(0.1, 0.005, 4, 16, Math.PI), grille, 0, y, 0.02, Math.PI / 2);
    } else if (opts.hat) {
      attach(h.head, new THREE.CylinderGeometry(0.17, 0.17, 0.012, 18), white, 0, 0.27, 0);
      attach(h.head, new THREE.CylinderGeometry(0.09, 0.1, 0.09, 14), white, 0, 0.31, 0);
    } else {
      const capMat = new THREE.MeshStandardMaterial({ color: kit.cap, roughness: 0.7 });
      attach(h.head, new THREE.SphereGeometry(0.104, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat, 0, 0.23, -0.005);
      attach(h.head, new THREE.BoxGeometry(0.15, 0.012, 0.1), capMat, 0, 0.235, 0.11, 0.12);
    }
    if (opts.pads) {
      // batting pads over the shins and knees
      for (const kn of [h.lKnee, h.rKnee]) {
        attach(kn, new THREE.BoxGeometry(0.15, 0.46, 0.08), white, 0, -0.2, 0.06);
        attach(kn, new THREE.BoxGeometry(0.15, 0.12, 0.1), white, 0, 0.04, 0.07);
      }
    }
    if (opts.gloves) {
      const gm = new THREE.MeshStandardMaterial({ color: opts.gloves, roughness: 0.6 });
      for (const el of [h.lElbow, h.rElbow]) attach(el, new THREE.BoxGeometry(0.085, 0.12, 0.1), gm, 0, -0.38, 0.01);
    }
    if (opts.bat) {
      // the bat swings in its own group, held at the hands in front of the body
      this.swing = new THREE.Group(); this.swing.position.set(0, 0.98, 0.18); this.root.add(this.swing);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.58, 0.05), new THREE.MeshStandardMaterial({ color: 0xe6cf98, roughness: 0.6 }));
      blade.position.y = -0.56; blade.castShadow = cast; this.swing.add(blade);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1e }));
      handle.position.y = -0.12; this.swing.add(handle);
    }
  }

  // set a leg pose: thigh angle (negative = forward), knee bend; keeps the feet flat
  legs(thigh, knee, spread = 0.06) {
    const h = this.h;
    for (const [th, kn, ft, s] of [[h.lLeg, h.lKnee, h.lFoot, -1], [h.rLeg, h.rKnee, h.rFoot, 1]]) {
      th.rotation.set(thigh, 0, s * spread); kn.rotation.x = knee; ft.rotation.set(-(thigh + knee), 0, -s * spread);
    }
  }

  stand() { animateHuman(this.h, 0, 0); }
  run(dt, speed) {
    this.phase += dt * (3.5 + speed * 1.25);
    this.h.gait = clamp((speed - 2) / 5, 0, 1);
    animateHuman(this.h, this.phase, 1);
  }
  crouch(k = 1) {
    const h = this.h;
    animateHuman(h, 0, 0);
    h.hips.position.y = 0.95 - 0.22 * k;
    this.legs(-0.75 * k, 1.25 * k, 0.16 * k);
    h.spine.rotation.set(0.45 * k, 0, 0);
    h.lArm.rotation.set(-0.9 * k, 0, -0.2); h.rArm.rotation.set(-0.9 * k, 0, 0.2);
    h.lElbow.rotation.x = h.rElbow.rotation.x = -0.5 * k;
    h.head.rotation.x = -0.35 * k;
  }
  // bowling action: k from 0 (gather) to 1 (follow-through); the right arm windmills over the top
  bowl(k) {
    const h = this.h;
    animateHuman(h, this.phase, 0.4);
    h.rArm.rotation.set(-Math.PI * 2 * clamp(k * 1.1, 0, 1) + 0.1, 0, 0.12);
    h.rElbow.rotation.x = -0.1;
    h.lArm.rotation.set(-2.7 + k * 2.4, 0, -0.15);
    h.lElbow.rotation.x = -0.3;
    h.spine.rotation.set(-0.2 + k * 0.65, 0, 0);
    this.legs(-0.3 + k * 0.4, 0.2, 0.08);
  }
  catchPose(k) {
    const h = this.h;
    h.lArm.rotation.set(-1.7 * k, 0, -0.15); h.rArm.rotation.set(-1.7 * k, 0, 0.15);
    h.lElbow.rotation.x = h.rElbow.rotation.x = -0.6 * k;
  }
  throwPose(k) {
    const h = this.h;
    h.rArm.rotation.set(-2.9 + k * 3.3, 0, 0.1); h.rElbow.rotation.x = -0.9 * (1 - k);
    h.lArm.rotation.set(-1.2, 0, -0.2);
  }
  // batting stance: knees bent, leaning over, both hands on the bat handle
  batStance() {
    const h = this.h;
    animateHuman(h, 0, 0);
    h.hips.position.y = 0.88;
    this.legs(-0.25, 0.45, 0.14);
    h.spine.rotation.set(0.3, -0.25, 0);
    h.head.rotation.set(-0.15, -0.9, 0); // head turned to watch the bowler
    this.setSwing(-0.35, 0);
  }
  // non-striker: standing relaxed, bat held down at the side
  holdBat() {
    animateHuman(this.h, 0, 0);
    if (!this.swing) return;
    this.swing.position.set(0.26, 0.86, 0.04);
    this.swing.rotation.set(0.25, 0, 0);
    this.h.rArm.rotation.set(-0.15, 0, 0.12); this.h.rElbow.rotation.x = -0.35;
  }
  setSwing(a, dirAngle) {
    if (this.swing) this.swing.position.set(0, 0.98, 0.18);
    if (!this.swing) return;
    this.swing.rotation.set(a, dirAngle - this.root.rotation.y, 0, 'YXZ'); // dirAngle is a world heading
    // arms follow the bat: up behind for the back-lift, through and over for the follow-through
    const h = this.h, up = Math.max(0, -a), thru = Math.max(0, a);
    const ax = -0.75 - up * 0.55 - thru * 0.75;
    h.lArm.rotation.set(ax, 0, 0.45); h.rArm.rotation.set(ax + 0.15, 0, 0.1);
    h.lElbow.rotation.x = -0.35 - up * 0.3; h.rElbow.rotation.x = -0.6 - up * 0.4;
  }
}
