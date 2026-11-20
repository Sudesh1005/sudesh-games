// Target Shooter: first-person movement with box collisions (walk, sprint, crouch-free jump onto crates).
import * as THREE from 'three';

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.onGround = false;
    this.r = 0.35; this.height = 1.75; this.eye = 1.62;
    this.hp = 100; this.bob = 0; this.moving = 0;
    this._e = new THREE.Vector3();
  }
  spawn(s) { this.pos.set(s.x, s.y, s.z); this.vel.set(0, 0, 0); this.yaw = s.yaw; this.pitch = 0; this.hp = 100; }
  eyePos() { return this._e.set(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  // Is point p within r of the player's body (a vertical segment from knees to head)?
  hitBy(p, r) {
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const y = Math.max(this.pos.y + 0.4, Math.min(this.pos.y + this.eye, p.y)), dy = p.y - y;
    return dx * dx + dz * dz + dy * dy < (this.r + r) ** 2;
  }

  update(dt, inp, world) {
    const sprint = inp.sprint && inp.move.y > 0.3 && !inp.aim;
    const spd = sprint ? 7.6 : inp.aim ? 3.2 : 5.2;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let wx = fx * inp.move.y + rx * inp.move.x, wz = fz * inp.move.y + rz * inp.move.x;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const a = 1 - Math.exp(-dt * (this.onGround ? 14 : 3));
    this.vel.x += (wx * spd - this.vel.x) * a;
    this.vel.z += (wz * spd - this.vel.z) * a;
    if (inp.jump && this.onGround) { this.vel.y = 6.6; this.onGround = false; }
    this.vel.y -= 18 * dt;
    this.onGround = false;
    this.move('x', this.vel.x * dt, world.boxes);
    this.move('z', this.vel.z * dt, world.boxes);
    this.move('y', this.vel.y * dt, world.boxes);
    if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
    const b = world.bounds;
    this.pos.x = Math.max(b.x0, Math.min(b.x1, this.pos.x));
    this.pos.z = Math.max(b.z0, Math.min(b.z1, this.pos.z));
    this.moving = this.onGround ? Math.hypot(this.vel.x, this.vel.z) : 0;
    this.bob += dt * this.moving * 1.9;
    this.sprinting = sprint && this.moving > 4;
  }

  move(axis, d, boxes) {
    if (!d) return;
    this.pos[axis] += d;
    const p = this.pos, r = this.r;
    for (const b of boxes) {
      if (p.x + r <= b.min.x || p.x - r >= b.max.x || p.z + r <= b.min.z || p.z - r >= b.max.z || p.y + this.height <= b.min.y || p.y >= b.max.y) continue;
      if (axis === 'y') {
        if (d < 0) { p.y = b.max.y; this.vel.y = 0; this.onGround = true; }
        else { p.y = b.min.y - this.height; this.vel.y = 0; }
      } else if (d > 0) p[axis] = b.min[axis] - r - 1e-4;
      else p[axis] = b.max[axis] + r + 1e-4;
    }
  }
}
