// Kaathu Riders: the person on the bike. Uses the realistic character models from the Kadal Nagaram
// city game (GTA-Game/models) when they have loaded, otherwise the built-in smooth skinned human.
// Dressed in a riding jacket in the bike's colour, dark pants, boots, gloves and a full-face helmet,
// and posed every frame: crouched over the tank, hands on the bars, leaning and tucking.
import * as THREE from 'three';
import { makeHuman, animateHuman } from './human.js';
import { modelLib, makeModelHuman } from './models.js';

const SKINS = [0x8d5524, 0xa0623a, 0x6b4226, 0xb87a4b, 0x7a4a2a, 0x5c3a21];
const BONES = { head: 'Head', rHand: 'RightHand', lHand: 'LeftHand' };
const HAIR = /hair|eyelash|^(afro|bob|braid|long|ponytail|short)\d/i;
let count = 0;

export class BikeRider {
  // seat = { y, z } of the seat top in bike space; sport = more crouched (bikes with a fairing)
  constructor(color, { low = false, env = 1, seat, sport = false, model = true } = {}) {
    const n = count++;
    this.low = low; this.sport = sport;
    const cast = !low;
    if (model && modelLib()) {
      this.h = makeModelHuman('ped', n);
      this.dressModel(color, cast);
    } else {
      this.h = makeHuman({
        skin: SKINS[n % SKINS.length], hair: 0x111111, hairStyle: 'short', top: color, pattern: 'plain', sleeves: 'long',
        untucked: false, bottom: 'pants', bottomColor: 0x23252b, shoes: 0x141414, build: 'athletic',
      }, { shadow: cast, texSize: low ? 128 : 256 });
    }
    this.root = this.h.root;
    this.root.position.set(0, seat.y + 0.1 - 0.95, seat.z);
    this.baseX = 0;
    this.root.updateMatrixWorld(true);
    this.gear(color, env, cast);
    this.pose({ lean: 0, steer: 0, tuck: 0, crash: 0 });
  }

  // riding gear colours on the character model: jacket in the bike's colour, dark pants, black boots
  dressModel(color, cast) {
    const jacket = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.8), roughness: 0.5, metalness: 0.15 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.7 });
    const boots = new THREE.MeshStandardMaterial({ color: 0x0f0f11, roughness: 0.5 });
    this.h.mesh.traverse((o) => {
      if (!o.isMesh) return;
      const name = ((o.material && o.material.name) || '') + ' ' + o.name;
      if (HAIR.test(name.replace(/Human\./g, ''))) o.visible = false; // under the helmet
      else if (/pants|trouser|jean|short/i.test(name)) o.material = pants;
      else if (/suit|cloth|shirt|jacket|top|tshirt/i.test(name)) o.material = jacket;
      else if (/shoe|boot/i.test(name)) o.material = boots;
      o.castShadow = cast;
    });
    this.bones = {};
    this.h.mesh.traverse((o) => {
      if (!o.isBone) return;
      const k = o.name.replace(/^mixamorig[:_]?/i, '');
      for (const [key, nm] of Object.entries(BONES)) if (k === nm) this.bones[key] = o;
    });
  }

  // a piece of gear on a joint, sized in metres whatever the skeleton's scale
  attach(where, mesh, x, y, z) {
    mesh.castShadow = !this.low;
    if (this.bones) {
      const b = this.bones[where];
      if (!b) return mesh;
      const s = b.getWorldScale(new THREE.Vector3()).x || 1;
      const yy = where === 'head' ? 0.1 + y : y; // the model's head joint is at the base of the skull
      mesh.scale.multiplyScalar(1 / s); mesh.position.set(x / s, yy / s, z / s);
      b.add(mesh);
    } else {
      const h = this.h, b = { head: h.head, rHand: h.lElbow, lHand: h.rElbow }[where];
      const yy = where === 'head' ? 0.17 + y : -0.37 - y;
      mesh.position.set(x, yy, z);
      b.add(mesh);
    }
    return mesh;
  }

  gear(color, env, cast) {
    void cast;
    // full-face helmet: glossy shell, dark visor, chin bar and a stripe in the bike's colour
    const white = color === 0xf0f0f0;
    const shellCol = white ? 0x1b1c20 : new THREE.Color(color).getHSL({}).l > 0.6 ? 0x1b1c20 : 0xf2f2f2;
    const shell = new THREE.MeshStandardMaterial({ color: shellCol, roughness: 0.18, metalness: 0.25, envMapIntensity: env });
    const stripe = new THREE.MeshStandardMaterial({ color: white ? 0xd7263d : color, roughness: 0.2, metalness: 0.3, envMapIntensity: env });
    const visor = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.04, metalness: 0.9, envMapIntensity: env * 1.5 });
    const helmet = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.152, 22, 16), shell);
    dome.scale.set(0.95, 0.98, 1.1); helmet.add(dome);
    const band = new THREE.Mesh(new THREE.SphereGeometry(0.154, 22, 8, 0, Math.PI * 2, 0.55, 0.22), stripe);
    band.scale.set(0.95, 0.98, 1.1); band.rotation.x = -0.25; helmet.add(band);
    const vis = new THREE.Mesh(new THREE.SphereGeometry(0.157, 18, 8, Math.PI / 2 - 0.95, 1.9, 1.32, 0.42), visor);
    vis.scale.set(0.95, 0.98, 1.1); helmet.add(vis);
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.35), shell);
    chin.scale.set(1.0, 1.0, 1.25); chin.position.set(0, -0.045, 0.03); helmet.add(chin);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.06), stripe);
    spoiler.position.set(0, 0.07, -0.17); spoiler.rotation.x = 0.35; helmet.add(spoiler);
    helmet.traverse((o) => { if (o.isMesh) o.castShadow = !this.low; });
    this.attach('head', helmet, 0, -0.01, 0.005);
    this.helmet = helmet;
    // gloves
    const gm = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.55 });
    for (const hand of ['rHand', 'lHand']) this.attach(hand, new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.13, 0.11), gm), 0, 0.05, 0);
  }

  // s: lean (rad, the bike's lean), steer (-1..1), tuck 0..1 (nitro), crash 0..1
  pose(s) {
    const h = this.h;
    if (!h.proc) animateHuman(h, 0, 0);
    const c = s.crash || 0, lean = s.lean || 0, tuck = s.tuck || 0;
    const crouch = (this.sport ? 0.85 : 0.55) + tuck * 0.25, tilt = (this.sport ? 0.4 : 0.22) * (1 - c);
    const inL = Math.max(0, lean), inR = Math.max(0, -lean); // which knee sticks out into the turn
    h.hips.position.set(0, 0.95, 0);
    h.hips.rotation.set(tilt, 0, 0); // pelvis rolled forward over the tank
    // legs: thighs along the tank, knees bent, feet back on the pegs
    h.lLeg.rotation.set(-1.32 - tilt + c * 0.9, 0, -0.2 - inL * 0.7 - c * 0.3);
    h.rLeg.rotation.set(-1.32 - tilt + c * 0.9, 0, 0.2 + inR * 0.7 + c * 0.3);
    h.lKnee.rotation.set(1.85 - c * 1.3, 0, 0); h.rKnee.rotation.set(1.85 - c * 1.3, 0, 0);
    h.lFoot.rotation.set(-0.35, 0, 0); h.rFoot.rotation.set(-0.35, 0, 0);
    // upper body over the tank; hangs into the turn a little; head stays level and looks ahead
    h.spine.position.set(0, 0.17, 0);
    h.spine.rotation.set(crouch * (1 - c), -lean * 0.2, lean * 0.15);
    h.head.rotation.set(-crouch * 0.85 * (1 - c), lean * 0.15, -lean * 0.55);
    // arms forward to the bars (they turn with the steering)
    const reach = -(crouch + tilt + 1.05) * (1 - c) - c * 0.4, st = (s.steer || 0) * 0.12;
    h.lArm.rotation.set(reach - st, 0, -0.14 - c * 1.1);
    h.rArm.rotation.set(reach + st, 0, 0.14 + c * 1.1);
    h.lElbow.rotation.set(-0.55 + tuck * -0.25, 0, 0); h.rElbow.rotation.set(-0.55 + tuck * -0.25, 0, 0);
    if (h.proc) h.applyProc();
    // the body hangs off the inside of the bike
    this.root.position.x = this.baseX - lean * 0.16;
  }
}
