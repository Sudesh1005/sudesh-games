// Theevu Yudham: a soldier. Walking, running, crouching, jumping and swimming with collision against
// the island (walls, floors, stairs, trees, rocks, ground), the rifle-holding pose, and the hit areas
// bullets are tested against. Used for the player and (later) everyone else.
import * as THREE from 'three';
import { makeHuman, animateHuman } from './human.js';
import { modelLib, makeModelHuman } from './models.js';
import { WATER_Y, HALF } from './world.js';
import { gunModel } from './weapons.js';

export const RADIUS = 0.34, HEIGHT = 1.75, CROUCH_H = 1.2, STEP = 0.55;
const GRAV = 22, JUMP = 6.4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Soldier {
  // opts: { look (built-in human), model: 'player' | 'ped' | null, index, low }
  constructor(world, opts = {}) {
    this.world = world; this.opts = opts;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.swim = false; this.crouch = 0; this.crouching = false;
    this.phase = 0; this.moveSpeed = 0; this.backwards = false;
    this.health = 100; this.armor = 0; this.alive = true; this.dieT = 0;
    this.gunId = null; this.gunMesh = null; this.muzzle = new THREE.Vector3();
    this.recoilKick = 0;
    this.buildBody();
  }

  buildBody() {
    const o = this.opts;
    if (this.root && this.root.parent) this.root.parent.remove(this.root);
    if (o.model && modelLib()) this.h = makeModelHuman(o.model, o.index ?? -1);
    else this.h = makeHuman(o.look, { shadow: !o.low, texSize: o.low ? 128 : 256 });
    this.root = this.h.root;
    this.gunHolder = new THREE.Group();
    this.root.add(this.gunHolder);
    if (this.gunId) { const id = this.gunId; this.gunId = null; this.setGun(id); }
    if (this.scene) this.scene.add(this.root);
  }
  addTo(scene) { this.scene = scene; scene.add(this.root); }
  // swap the built-in body for a character model once those have loaded
  upgrade() { if (this.opts.model && modelLib() && !this.h.model) { const parent = this.root.parent; this.buildBody(); if (parent && !this.root.parent) parent.add(this.root); } }

  setGun(id) {
    if (this.gunId === id) return;
    if (this.gunMesh) this.gunHolder.remove(this.gunMesh.group);
    this.gunId = id;
    this.gunMesh = id ? gunModel(id) : null;
    if (this.gunMesh) this.gunHolder.add(this.gunMesh.group);
  }

  get height() { return HEIGHT - (HEIGHT - CROUCH_H) * this.crouch; }
  eyeY() { return this.pos.y + this.height - 0.15; }

  /* ---------------------------------------------------------------- movement */
  // wish: world-space direction (x, z), length 0..1; mode: 'walk' | 'run' | 'sprint'
  move(dt, wx, wz, mode, jump) {
    const W = this.world, p = this.pos, v = this.vel;
    this.crouch += ((this.crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    let speed = mode === 'sprint' ? 6.6 : mode === 'walk' ? 2.2 : 4.6;
    if (this.crouching) speed = 2.0;
    if (this.swim) speed = 2.4;
    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    const acc = this.onGround || this.swim ? 14 : 3;
    const k = Math.min(1, acc * dt);
    v.x += (wx * speed - v.x) * k; v.z += (wz * speed - v.z) * k;
    if (jump && this.onGround && !this.crouching) { v.y = JUMP; this.onGround = false; }
    if (this.swim) { v.y = 0; } else v.y -= GRAV * dt;

    // vertical first (floors, ceilings), then horizontal (walls)
    const oldY = p.y;
    p.y += v.y * dt;
    const near = W.near(p.x - 1.5, p.z - 1.5, p.x + 1.5, p.z + 1.5);
    let ground = W.heightAt(p.x, p.z);
    const h = this.height;
    for (const b of near) {
      if (b.circle) continue;
      if (!this.overlapXZ(b, p.x, p.z, RADIUS * 0.9)) continue;
      if (b.max[1] <= oldY + STEP + 0.001 && b.max[1] > ground) ground = b.max[1];
      // head bump
      if (v.y > 0 && b.min[1] >= oldY + h - 0.05 && b.min[1] < p.y + h) { p.y = b.min[1] - h; v.y = 0; }
    }
    // stick to the ground when walking down slopes and steps
    const snap = this.onGround && v.y <= 0 && p.y - ground < 0.45;
    if (p.y <= ground || snap) { p.y = ground; v.y = Math.max(0, v.y); this.onGround = true; }
    else this.onGround = false;

    p.x += v.x * dt; p.z += v.z * dt;
    for (let it = 0; it < 2; it++) {
      const n2 = W.near(p.x - 1.5, p.z - 1.5, p.x + 1.5, p.z + 1.5);
      for (const b of n2) {
        if (b.circle) {
          if (b.y1 < p.y + STEP || b.y0 > p.y + h) continue;
          const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz), rr = b.r + RADIUS;
          if (d < rr && d > 1e-6) { p.x = b.x + (dx / d) * rr; p.z = b.z + (dz / d) * rr; }
          continue;
        }
        if (b.max[1] <= p.y + STEP || b.min[1] >= p.y + h) continue;
        // circle against box in x/z
        const cx = clamp(p.x, b.min[0], b.max[0]), cz = clamp(p.z, b.min[2], b.max[2]);
        let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d >= RADIUS) continue;
        if (d < 1e-6) {
          // centre inside the box: push out the shortest way
          const opts = [[b.min[0] - RADIUS - p.x, 0], [b.max[0] + RADIUS - p.x, 0], [0, b.min[2] - RADIUS - p.z], [0, b.max[2] + RADIUS - p.z]];
          opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
          p.x += opts[0][0]; p.z += opts[0][1];
        } else { p.x = cx + (dx / d) * RADIUS; p.z = cz + (dz / d) * RADIUS; }
      }
    }
    // the sea: swim at the surface where it's deep
    const g2 = W.heightAt(p.x, p.z);
    this.swim = g2 < WATER_Y - 1.25 && p.y <= WATER_Y - 1.2;
    if (this.swim) { p.y = WATER_Y - 1.25; this.onGround = false; }
    const lim = HALF - 30;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
    this.moveSpeed = Math.hypot(v.x, v.z);
    // walking backwards relative to where we face
    this.backwards = v.x * Math.sin(this.yaw) + v.z * Math.cos(this.yaw) < -0.3;
  }

  overlapXZ(b, x, z, r) {
    return x + r > b.min[0] && x - r < b.max[0] && z + r > b.min[2] && z - r < b.max[2];
  }

  /* ---------------------------------------------------------------- pose */
  animate(dt, aiming) {
    const h = this.h, sp = this.moveSpeed;
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    if (!this.alive) { this.deathPose(dt); return; }
    const amt = Math.min(1, sp / 2);
    h.gait = clamp((sp - 2.2) / 3.5, 0, 1);
    this.phase += dt * (2.2 + sp * 1.35) * (this.backwards ? -1 : 1) * (sp > 0.3 ? 1 : 0);
    animateHuman(h, this.phase, this.swim ? 0.5 : amt);
    const c = this.crouch, p = this.pitch;
    if (c > 0.01) {
      h.hips.position.y -= 0.42 * c;
      h.lLeg.rotation.x -= 1.0 * c; h.rLeg.rotation.x -= 1.0 * c;
      h.lKnee.rotation.x += 1.7 * c; h.rKnee.rotation.x += 1.7 * c;
      h.lFoot.rotation.x -= 0.7 * c; h.rFoot.rotation.x -= 0.7 * c;
      h.spine.rotation.x += 0.25 * c;
    }
    if (!this.onGround && !this.swim) { h.lKnee.rotation.x += 0.5; h.rKnee.rotation.x += 0.5; h.lLeg.rotation.x -= 0.3; }
    if (this.gunId) {
      // hold the gun up at the shoulder, aimed where the camera looks
      const kick = this.recoilKick;
      h.spine.rotation.x += -p * 0.35;
      h.spine.rotation.y += -0.28;                                   // bladed stance: left shoulder forward
      h.head.rotation.set(-p * 0.55, 0.28, 0);
      const raise = aiming ? 0.12 : 0;
      // right arm (the "l" joints are the right side): elbow out, forearm forward to the grip
      h.lArm.rotation.set(-0.2 - p * 0.6 - raise, 0, 0.42);
      h.lElbow.rotation.x = -1.3 + kick * 0.3;
      // left arm reaching forward and across to the front grip
      h.rArm.rotation.set(-1.05 - p * 0.65 - raise, 0, -0.42);
      h.rElbow.rotation.x = -0.45;
      this.gunHolder.position.set(-0.19, this.height - 0.47 - c * 0.05, 0.3 - kick * 0.06);
      this.gunHolder.rotation.set(-p, 0, 0);
      this.recoilKick = Math.max(0, kick - dt * 8);
    }
    if (h.proc) h.applyProc();
    if (this.gunMesh) {
      this.gunMesh.group.updateMatrixWorld(true);
      this.muzzle.copy(this.gunMesh.muzzle).applyMatrix4(this.gunMesh.group.matrixWorld);
    }
  }

  deathPose(dt) {
    this.dieT += dt;
    const k = Math.min(1, this.dieT / 0.5);
    this.root.rotation.x = -k * Math.PI / 2 * 0.98;
    this.root.position.y = this.pos.y + 0.15 * k;
  }

  /* ---------------------------------------------------------------- getting hit */
  // Ray test against the head (sphere) and the body (upright cylinder). Returns { t, head } or null.
  rayHit(o, d, maxT) {
    if (!this.alive) return null;
    const p = this.pos, h = this.height;
    let best = null;
    // head
    const hx = p.x + Math.sin(this.yaw) * 0.05, hy = p.y + h - 0.14, hz = p.z + Math.cos(this.yaw) * 0.05;
    {
      const ox = o[0] - hx, oy = o[1] - hy, oz = o[2] - hz, b = ox * d[0] + oy * d[1] + oz * d[2], c = ox * ox + oy * oy + oz * oz - 0.15 * 0.15, disc = b * b - c;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < maxT) best = { t, head: true }; }
    }
    // body
    {
      const ox = o[0] - p.x, oz = o[2] - p.z, a = d[0] * d[0] + d[2] * d[2], r = 0.3;
      if (a > 1e-9) {
        const b = ox * d[0] + oz * d[2], c = ox * ox + oz * oz - r * r, disc = b * b - a * c;
        if (disc >= 0) {
          const t = (-b - Math.sqrt(disc)) / a, y = o[1] + d[1] * t;
          if (t > 0 && t < maxT && y >= p.y && y <= p.y + h - 0.27 && (!best || t < best.t)) best = { t, head: false };
        }
      }
    }
    return best;
  }

  damage(n) {
    if (!this.alive) return 0;
    let left = n;
    if (this.armor > 0) { const a = Math.min(this.armor, n * 0.5); this.armor -= a; left -= a; }
    this.health = Math.max(0, this.health - left);
    if (this.health <= 0) { this.alive = false; this.dieT = 0; }
    return left;
  }
  revive() { this.alive = true; this.health = 100; this.dieT = 0; this.root.rotation.x = 0; }
}
