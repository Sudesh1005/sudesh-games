// Kaathu Cricket: cricketers. Uses the realistic character models from Kadal Nagaram when they've loaded
// (models.js), otherwise the built-in skinned humans (human.js). Both share one set of joints
// (hips, spine, head, arms, elbows, legs, knees, feet), so the cricket poses below drive either.
//
// Character space: the person faces +z. The joints named "l…" are on the -x side, which is the
// person's own RIGHT side (so the bat is in the "l" hand, and the bowling arm is the "l" arm).
import * as THREE from 'three';
import { makeHuman, animateHuman } from './human.js';
import { modelLib, makeModelHuman } from './models.js';

export const KITS = [
  { shirt: 0x1f5fbf, pants: 0x1a3f80, cap: 0x10306a, name: 'Blue' },
  { shirt: 0xf28c1b, pants: 0xb85d00, cap: 0x7a3d00, name: 'Orange' },
];
const SKINS = [0x8d5524, 0xa0623a, 0x6b4226, 0xb87a4b, 0x7a4a2a, 0x5c3a21, 0x9c6a48];
const HAIRS = [0x0d0d0d, 0x1a120c, 0x2b1d14];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const _hp = new THREE.Vector3();
const BONES = { head: 'Head', rHand: 'RightHand', lHand: 'LeftHand', rShin: 'RightLeg', lShin: 'LeftLeg' };

export class Person {
  constructor(kit, opts = {}) {
    const n = opts.skin ?? 0;
    this.kit = kit; this.opts = opts; this.phase = Math.random() * 6;
    const cast = !opts.low;
    if (modelLib()) {
      this.h = makeModelHuman('ped', n);
      this.dressModel(kit, opts);
    } else {
      this.h = makeHuman({
        skin: SKINS[n % SKINS.length], hair: HAIRS[n % HAIRS.length], hairStyle: 'short',
        top: opts.white ? 0xf4f4f4 : kit.shirt, pattern: 'plain', sleeves: opts.white ? 'long' : 'short', untucked: false,
        bottom: 'pants', bottomColor: opts.white ? 0x2a2a2e : opts.pads ? 0xf2f2f2 : kit.pants, shoes: 0xf2f2f2,
        mustache: n % 3 === 1, stubble: n % 2 === 0, build: 'athletic',
      }, { shadow: cast, texSize: opts.low ? 128 : 256 });
    }
    this.root = this.h.root;
    this.root.updateMatrixWorld(true);
    this.gear(kit, opts, cast);
  }

  // Recolour a character model into a cricket kit: solid team-coloured clothes, white shoes.
  dressModel(kit, opts) {
    const shirt = opts.white ? 0xf2f2f2 : kit.shirt;
    this.h.mesh.traverse((o) => {
      if (!o.isMesh) return;
      const name = ((o.material && o.material.name) || '') + ' ' + o.name;
      if (/suit|cloth|shirt|pants/i.test(name)) o.material = new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.72, metalness: 0.02 });
      else if (/shoe/i.test(name)) o.material = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 });
      o.castShadow = !opts.low;
    });
    this.bones = {};
    this.h.mesh.traverse((o) => { if (o.isBone) { const k = o.name.replace(/^mixamorig[:_]?/i, ''); for (const [key, nm] of Object.entries(BONES)) if (k === nm) this.bones[key] = o; } });
  }

  // Attach a piece of kit to a joint, sized in metres whatever the skeleton's own scale.
  attach(where, geo, mat, x, y, z, rx = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = !this.opts.low;
    if (this.bones) {
      const b = this.bones[where];
      if (!b) return m;
      const s = b.getWorldScale(new THREE.Vector3()).x || 1;
      const yy = where === 'head' ? 0.1 + y : y; // the model's head joint is at the base of the skull
      m.scale.setScalar(1 / s); m.position.set(x / s, yy / s, z / s); m.rotation.x = rx;
      b.add(m);
    } else {
      // built-in humans: hands hang from the elbows, shins from the knees (both point down their -y)
      const h = this.h, b = { head: h.head, rHand: h.lElbow, lHand: h.rElbow, rShin: h.lKnee, lShin: h.rKnee }[where];
      const yy = where === 'head' ? 0.17 + y : where.endsWith('Hand') ? -0.37 - y : -y;
      m.position.set(x, yy, z); m.rotation.x = rx;
      b.add(m);
    }
    return m;
  }

  gear(kit, opts, cast) {
    const white = new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.55 });
    const model = !!this.bones;
    // head gear: y is "up the head" from the head joint
    // head gear, positioned from the centre of the head
    if (opts.helmet) {
      const shell = new THREE.MeshStandardMaterial({ color: kit.cap, roughness: 0.3, metalness: 0.25 });
      this.attach('head', new THREE.SphereGeometry(0.13, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), shell, 0, 0.0, -0.005);
      this.attach('head', new THREE.BoxGeometry(0.22, 0.014, 0.09), shell, 0, 0.03, 0.12, 0.2);
      const grille = new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: 0.85, roughness: 0.3 });
      for (const dy of [-0.03, -0.075]) this.attach('head', new THREE.TorusGeometry(0.115, 0.006, 4, 18, Math.PI), grille, 0, dy, 0.0, Math.PI / 2);
    } else if (opts.hat) {
      this.attach('head', new THREE.CylinderGeometry(0.2, 0.2, 0.014, 20), white, 0, 0.075, 0);
      this.attach('head', new THREE.CylinderGeometry(0.1, 0.115, 0.11, 16), white, 0, 0.12, 0);
    } else if (!opts.bare) {
      const capMat = new THREE.MeshStandardMaterial({ color: kit.cap, roughness: 0.7 });
      this.attach('head', new THREE.SphereGeometry(0.118, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), capMat, 0, 0.03, -0.005);
      this.attach('head', new THREE.BoxGeometry(0.16, 0.012, 0.11), capMat, 0, 0.035, 0.12, 0.12);
    }
    if (opts.pads) {
      // batting pads cover the shins and knees: y runs down the shin from the knee
      for (const shin of ['rShin', 'lShin']) {
        this.attach(shin, new THREE.BoxGeometry(0.17, 0.5, 0.09), white, 0, 0.2, 0.07);
        this.attach(shin, new THREE.BoxGeometry(0.17, 0.16, 0.11), white, 0, -0.05, 0.08);
      }
    }
    if (opts.gloves) {
      const gm = new THREE.MeshStandardMaterial({ color: opts.gloves, roughness: 0.55 });
      for (const hand of ['rHand', 'lHand']) this.attach(hand, new THREE.BoxGeometry(0.1, 0.12, 0.1), gm, 0, 0.04, 0);
    }
    if (opts.bat) {
      // the bat hangs from the grip; each frame it's moved to the right hand and angled by the swing
      const bat = new THREE.Group();
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.56, 0.045), new THREE.MeshStandardMaterial({ color: 0xead6a2, roughness: 0.55 }));
      blade.position.y = -0.46; blade.castShadow = cast; bat.add(blade);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.26, 8), new THREE.MeshStandardMaterial({ color: 0x15151a }));
      grip.position.y = -0.05; bat.add(grip);
      this.root.add(bat);
      this.bat = bat;
    }
  }

  apply() { if (this.h.proc) this.h.applyProc(); }

  // world position of the right hand (the bat's grip)
  handPos(out) {
    this.root.updateMatrixWorld(true);
    if (this.bones && this.bones.rHand) return this.bones.rHand.getWorldPosition(out);
    return this.h.lElbow.localToWorld(out.set(0, -0.36, 0.02));
  }
  // put the bat in the hand: a = swing angle, dir = world heading of the shot, tilt flattens it
  placeBat(a, dir = 0, tilt = 0) {
    if (!this.bat) return;
    this.handPos(_hp);
    this.root.worldToLocal(_hp);
    this.bat.position.copy(_hp);
    this.bat.rotation.set(a, dir - this.root.rotation.y, tilt, 'YXZ');
  }

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
    if (this.bat) this.placeBat(0.6, this.root.rotation.y, 0); // carrying the bat while running
  }
  crouch(k = 1) {
    const h = this.h;
    animateHuman(h, 0, 0);
    h.hips.position.y = 0.95 - 0.24 * k;
    this.legs(-0.8 * k, 1.3 * k, 0.18 * k);
    h.spine.rotation.set(0.45 * k, 0, 0);
    h.lArm.rotation.set(-0.85 * k, 0, 0.15); h.rArm.rotation.set(-0.85 * k, 0, -0.15);
    h.lElbow.rotation.x = h.rElbow.rotation.x = -0.45 * k;
    h.head.rotation.x = -0.35 * k;
    this.apply();
  }
  // right-arm bowling action: k from 0 (gather, arm low behind) to 1 (follow-through)
  bowl(k) {
    const h = this.h;
    animateHuman(h, this.phase, 0.35);
    const a = clamp(k * 1.15, 0, 1);
    h.lArm.rotation.set(0.4 - a * (Math.PI * 2 - 0.3), 0, -0.12);       // bowling arm windmills over the top
    h.lElbow.rotation.x = -0.05;
    h.rArm.rotation.set(-2.8 + k * 2.6, 0, 0.25);                       // front arm points up, then pulls down
    h.rElbow.rotation.x = -0.25;
    h.spine.rotation.set(-0.25 + k * 0.75, k * 0.4, 0);
    this.legs(-0.35 + k * 0.5, 0.25, 0.1);
    this.apply();
  }
  catchPose(k) {
    const h = this.h;
    h.lArm.rotation.set(-1.6 * k, 0, 0.15); h.rArm.rotation.set(-1.6 * k, 0, -0.15);
    h.lElbow.rotation.x = h.rElbow.rotation.x = -0.55 * k;
    this.apply();
  }
  throwPose(k) {
    const h = this.h;
    h.lArm.rotation.set(-2.9 + k * 3.3, 0, -0.1); h.lElbow.rotation.x = -0.9 * (1 - k);
    h.rArm.rotation.set(-1.2, 0, 0.2);
    this.apply();
  }
  // batting stance: side-on, knees flexed, leaning over the bat, head turned to the bowler
  batStance() { this.setSwing(-0.3, 0, 0); }
  // a = swing angle: -2 back-lift (bat up towards the keeper) … 0 bat down at contact … +2 follow-through
  // dir = world heading of the shot (only the twist of the body uses it), tilt = horizontal bat for pulls/cuts
  setSwing(a, dir = 0, tilt = 0) {
    const h = this.h;
    animateHuman(h, 0, 0);
    h.hips.position.y = 0.9;
    this.legs(-0.22, 0.42, 0.16);
    const twist = clamp(dir - this.root.rotation.y + Math.PI / 2, -1.2, 1.2) * 0.35 * clamp(a + 0.5, 0, 1);
    h.spine.rotation.set(0.32 - Math.max(0, -a) * 0.1, twist, 0);
    h.head.rotation.set(-0.1, 1.05 - twist, 0);                         // eyes on the bowler
    // both arms swing together in the plane along the pitch (+x = towards the bowler), hands close together
    const g = a * 0.8, fwd = -0.45 - Math.abs(a) * 0.2 - Math.abs(tilt) * 0.3;
    // right arm ("l") comes in towards the middle, left arm ("r") reaches across the body to the handle
    h.lArm.rotation.set(fwd, 0, g + 0.28); h.rArm.rotation.set(fwd + 0.05, 0, g - 0.72);
    h.lElbow.rotation.x = -0.45 - Math.max(0, -a) * 0.3; h.rElbow.rotation.x = -0.3 - Math.max(0, -a) * 0.25;
    if (tilt) h.spine.rotation.z = -tilt * 0.25;
    this.apply();
    this.placeBat(a, dir, tilt);
  }
  // non-striker: standing relaxed, bat down at the side
  holdBat() {
    const h = this.h;
    animateHuman(h, 0, 0);
    h.lArm.rotation.set(-0.25, 0, -0.1); h.lElbow.rotation.x = -0.3;
    this.apply();
    this.placeBat(0.35, this.root.rotation.y, 0);
  }
  // umpire's signals: 'four' (arm waves across), 'six' (both arms up), 'out' (finger raised), 'wide' (arms out)
  signal(kind, t) {
    const h = this.h;
    animateHuman(h, 0, 0);
    if (kind === 'six') { h.lArm.rotation.set(-3.0, 0, 0.1); h.rArm.rotation.set(-3.0, 0, -0.1); h.lElbow.rotation.x = h.rElbow.rotation.x = 0; }
    else if (kind === 'out') { h.lArm.rotation.set(-2.9, 0, -0.05); h.lElbow.rotation.x = -0.15; }
    else if (kind === 'wide') { h.lArm.rotation.set(0, 0, -1.5); h.rArm.rotation.set(0, 0, 1.5); }
    else if (kind === 'four') { h.lArm.rotation.set(-1.55, 0, -0.6 - Math.sin(t * 7) * 0.7); h.lElbow.rotation.x = 0; }
    this.apply();
  }
}
