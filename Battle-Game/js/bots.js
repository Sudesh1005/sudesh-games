// Theevu Yudham: computer players. Each one jumps from the plane at its own moment, glides to a
// building, loots what it needs, heads for the safe zone in time, and fights anyone it sees or hears
// (the player and the other computer players): strafing, bursts, reloading, switching guns, healing.
import * as THREE from 'three';
import { Soldier } from './soldier.js';
import { Inventory, CAP, VEST } from './loot.js';
import { GUNS } from './weapons.js';
import { airStep } from './drop.js';
import { castShot, bulletDamage } from './combat.js';
import { randomLook } from './human.js';

export const BOT_NAMES = ['Arjun', 'Meena', 'Karthik', 'Priya', 'Vikram', 'Divya', 'Surya', 'Kavya', 'Rahul', 'Nila', 'Bala', 'Anitha', 'Senthil', 'Revathi', 'Dinesh', 'Lakshmi', 'Hari', 'Selvi', 'Mani', 'Kumar'];
// aim = aiming error (radians), react = seconds before the first shot, see = sight range (m)
export const BOT_LEVELS = {
  easy: { aim: 0.07, react: 1.0, see: 65, hear: 18, burst: 4, pause: 0.7, head: 0.04 },
  normal: { aim: 0.042, react: 0.6, see: 85, hear: 25, burst: 6, pause: 0.45, head: 0.1 },
  hard: { aim: 0.026, react: 0.35, see: 110, hear: 32, burst: 9, pause: 0.3, head: 0.18 },
};
const RANK = { pistol: 1, shotgun: 2, smg: 3, sniper: 3, ar: 4 };
const BEST_RANGE = { pistol: 14, shotgun: 7, smg: 12, ar: 26, sniper: 70 };
const _v = new THREE.Vector3();

export class Bot {
  // opts: { name, level, rnd, model (bool), index, low }
  constructor(world, opts) {
    this.world = world; this.L = BOT_LEVELS[opts.level] || BOT_LEVELS.normal; this.rnd = opts.rnd;
    const s = new Soldier(world, { look: randomLook(), model: opts.model ? 'ped' : null, index: opts.index, low: opts.low });
    s.name = opts.name; s.bot = this;
    this.s = s;
    this.inv = new Inventory();
    this.jumpAt = 0.12 + this.rnd() * 0.76;          // how far along the plane's route to jump
    s.chuteAlt = 60 + this.rnd() * 70;
    s.air = 'plane';
    this.target = null; this.seenT = 99; this.reactT = 0; this.visible = false;
    this.goal = null; this.goalItem = null; this.goalT = 0; this.zoneGoal = null; this.zoneStage = -1; this.path = [];
    this.thinkT = this.rnd() * 0.3; this.lookT = this.rnd() * 0.3;
    this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.detourT = 0; this.detour = [0, 0];
    this.strafe = 1; this.strafeT = 0; this.burstN = 0; this.pauseT = 0; this.heal = null; this.hurtT = 99;
  }

  /* ---------------------------------------------------------------- what's worth picking up */
  wants(it) {
    const inv = this.inv, s = this.s, [k, v] = it.kind.split(':');
    if (k === 'gun') {
      if (inv.guns.some((g) => g && g.def.id === v)) return inv.ammo[GUNS[v].ammo] < CAP[GUNS[v].ammo];
      if (!inv.guns[0] || !inv.guns[1]) return true;
      return RANK[v] > Math.min(RANK[inv.guns[0].def.id], RANK[inv.guns[1].def.id]);
    }
    if (k === 'ammo') return inv.guns.some((g) => g && g.def.ammo === v) && inv.ammo[v] < CAP[v];
    if (k === 'bandage' || k === 'medkit' || k === 'grenade') return inv[k] < CAP[k] && k !== 'grenade';
    if (k === 'vest') return +v > inv.vest || (+v === inv.vest && s.armor < VEST[+v]);
    if (k === 'helm') return +v > inv.helm;
    return false;
  }
  takeItem(it, loot) {
    const inv = this.inv, [k, v] = it.kind.split(':');
    if (k === 'gun' && inv.guns[0] && inv.guns[1] && !inv.guns.some((g) => g && g.def.id === v)) {
      // swap out the weaker gun
      inv.cur = RANK[inv.guns[0].def.id] <= RANK[inv.guns[1].def.id] ? 0 : 1;
    }
    const msg = loot.take(it, inv, this.s, false);
    if (msg) this.pickBestGun();
    return msg;
  }
  pickBestGun() {
    const inv = this.inv, score = (g) => (g ? RANK[g.def.id] * 10 + (g.ammo + g.reserve > 0 ? 100 : 0) : -1);
    inv.cur = score(inv.guns[1]) > score(inv.guns[0]) ? 1 : 0;
    const g = inv.gun();
    this.s.setGun(g ? g.def.id : null);
  }

  /* ---------------------------------------------------------------- every frame */
  // ctx: { soldiers, loot, zone, planeAt(frac, out), planeFrac, route, onShot(bot, from, to, def), onHit(bot, target, dmg, head, def) }
  update(dt, ctx) {
    const s = this.s;
    if (!s.alive) return;
    if (s.air === 'plane') {
      ctx.planeAt(ctx.planeFrac, s.pos);
      if (ctx.planeFrac >= this.jumpAt) {
        s.air = 'fall'; s.fallT = 0; s.pos.y -= 4;
        s.vel.set(ctx.route.dx * 14, -6, ctx.route.dz * 14);
        // glide down next to a gun lying somewhere within reach (on open ground, not on a roof)
        const guns = ctx.loot.items.filter((it) => !it.taken && it.kind.startsWith('gun:') && Math.hypot(it.x - s.pos.x, it.z - s.pos.z) < 320);
        guns.sort((a, b) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) - Math.hypot(b.x - s.pos.x, b.z - s.pos.z));
        const pick = guns[Math.min(guns.length - 1, (this.rnd() * 6) | 0)];
        this.land = [s.pos.x, s.pos.z];
        if (pick) {
          for (let k = 0; k < 10; k++) {
            const a = this.rnd() * Math.PI * 2, r = 4 + this.rnd() * 5, x = pick.x + Math.cos(a) * r, z = pick.z + Math.sin(a) * r;
            if (this.world.groundBelow(x, z, 500) - this.world.heightAt(x, z) < 0.4 && this.world.heightAt(x, z) > 0.5) { this.land = [x, z]; break; }
          }
          this.goalItem = pick; pick.botFails = pick.botFails || 0; this.routeLater = true;
        }
      }
      return;
    }
    if (s.air) {
      const dx = this.land[0] - s.pos.x, dz = this.land[1] - s.pos.z, d = Math.hypot(dx, dz);
      airStep(this.world, s, dt, Math.atan2(dx, dz), 0, d > 25 ? 1 : d > 6 ? 0.3 : -0.4);
      return;
    }
    this.hurtT += dt;
    if (this.routeLater) { this.routeLater = false; if (this.goalItem) this.route(this.goalItem); }
    const inv = this.inv, g = inv.gun();
    for (const gg of inv.guns) if (gg) gg.update(dt);

    // senses (a few times a second)
    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 0.3; this.look(ctx); }
    else if (this.target) this.seenT += dt;
    if (this.target && (!this.target.alive || this.seenT > 5)) this.target = null;

    // decisions
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25; this.think(ctx); }

    // healing
    if (this.heal) {
      this.heal.t += dt;
      if (this.heal.t >= this.heal.dur) {
        inv[this.heal.kind]--; s.health = Math.min(100, s.health + (this.heal.kind === 'medkit' ? 75 : 15)); this.heal = null;
      }
    }

    // movement
    let wx = 0, wz = 0, mode = 'run';
    const T = this.target;
    const zoneUrgent = ctx.zone && !ctx.zone.inside(s.pos.x, s.pos.z);
    if (T && this.visible && g) {
      const dx = T.pos.x - s.pos.x, dz = T.pos.z - s.pos.z, d = Math.hypot(dx, dz) || 1;
      const want = BEST_RANGE[g.def.id];
      const approach = d > want * 1.4 ? 1 : d < want * 0.6 ? -0.6 : 0;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafeT = 0.6 + this.rnd() * 1.2; this.strafe = this.rnd() < 0.5 ? -1 : 1; if (this.rnd() < 0.25) this.strafe = 0; }
      wx = (dx / d) * approach + (-dz / d) * this.strafe * 0.8;
      wz = (dz / d) * approach + (dx / d) * this.strafe * 0.8;
      s.crouching = g.def.id === 'sniper' && d > 40 && this.strafe === 0;
    } else {
      s.crouching = false;
      // waypoints first (a door, the stairs), then the item or place itself
      while (this.path.length && Math.hypot(this.path[0][0] - s.pos.x, this.path[0][1] - s.pos.z) < 0.8) this.path.shift();
      const goal = this.path.length ? this.path[0] : this.goalItem ? [this.goalItem.x, this.goalItem.z] : this.goal;
      if (goal) {
        const dx = goal[0] - s.pos.x, dz = goal[1] - s.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.6) { wx = dx / d; wz = dz / d; }
        else if (!this.goalItem) this.goal = null;
        if (d > 35 || zoneUrgent) mode = 'sprint';
      }
    }
    if (zoneUrgent && this.zoneGoal) {
      const dx = this.zoneGoal[0] - s.pos.x, dz = this.zoneGoal[1] - s.pos.z, d = Math.hypot(dx, dz) || 1;
      wx = wx * 0.3 + dx / d; wz = wz * 0.3 + dz / d; if (!T) mode = 'sprint';
    }
    if (this.heal) mode = 'walk';
    // stuck against a wall: step aside for a moment (and maybe jump)
    let jump = false;
    if (this.detourT > 0) { this.detourT -= dt; wx = this.detour[0]; wz = this.detour[1]; }
    this.stuckT += dt;
    if (this.stuckT > 1) {
      const moved = Math.hypot(s.pos.x - this.lastX, s.pos.z - this.lastZ);
      if ((wx || wz) && moved < 0.5) {
        const a = Math.atan2(wx, wz) + (this.rnd() < 0.5 ? 1 : -1) * (1.2 + this.rnd() * 0.9);
        this.detour = [Math.sin(a), Math.cos(a)]; this.detourT = 0.9 + this.rnd() * 0.8; jump = this.rnd() < 0.4;
        if (this.goalItem && ++this.goalItem.botFails > 2) this.goalItem = null;
      }
      this.stuckT = 0; this.lastX = s.pos.x; this.lastZ = s.pos.z;
    }
    s.move(dt, wx, wz, mode, jump);
    // face the enemy, or where we're going
    let wantYaw = s.yaw;
    if (T && (this.visible || this.seenT < 1.5)) wantYaw = Math.atan2(T.pos.x - s.pos.x, T.pos.z - s.pos.z);
    else if (wx || wz) wantYaw = Math.atan2(wx, wz);
    let dy = wantYaw - s.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    s.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * (T ? 5 : 8));
    if (T) { const d = Math.hypot(T.pos.x - s.pos.x, T.pos.z - s.pos.z); s.pitch = Math.atan2(T.pos.y + 1.1 - (s.pos.y + 1.45), d); }
    else s.pitch *= 0.9;

    // pick up what's underfoot (unarmed: even with an enemy in sight)
    if (!T || !this.visible || !g) {
      for (const it of ctx.loot.near(s.pos.x, s.pos.y, s.pos.z, 1.5)) {
        if (this.wants(it)) { this.takeItem(it, ctx.loot); if (it === this.goalItem) this.goalItem = null; }
      }
      if (this.goalItem && this.goalItem.taken) this.goalItem = null;
    }

    // guns: reload, switch when empty, shoot
    if (g) {
      if (g.ammo === 0 && !g.busy) { if (!g.startReload()) { const o = inv.guns[1 - inv.cur]; if (o && o.ammo + o.reserve > 0) { inv.cur = 1 - inv.cur; s.setGun(o.def.id); } } }
      if (T && this.visible) this.shoot(dt, ctx, T);
    }
  }

  look(ctx) {
    const s = this.s, L = this.L;
    let best = null, bd = 1e9;
    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    for (const o of ctx.soldiers) {
      if (o === s || !o.alive || o.air === 'plane') continue;
      const dx = o.pos.x - s.pos.x, dz = o.pos.z - s.pos.z, d = Math.hypot(dx, dz);
      if (d > L.see * (o.crouching ? 0.75 : 1)) continue;
      const front = (dx * fx + dz * fz) / (d || 1) > 0.3;
      if (!front && d > L.hear && o !== this.target) continue;
      if (d < bd) { bd = d; best = o; }
    }
    let vis = false;
    if (best) {
      const ey = s.pos.y + s.height - 0.15, ty = best.pos.y + best.height * 0.6;
      _v.set(best.pos.x - s.pos.x, ty - ey, best.pos.z - s.pos.z);
      const d = _v.length(); _v.divideScalar(d);
      vis = !this.world.raycast([s.pos.x, ey, s.pos.z], [_v.x, _v.y, _v.z], d - 0.4);
    }
    if (vis) {
      if (best !== this.target) { this.target = best; this.reactT = this.L.react * (0.8 + this.rnd() * 0.5); this.burstN = 0; }
      this.seenT = 0; this.visible = true;
      if (this.heal) this.heal = null;
    } else { this.visible = false; this.seenT += 0.3; }
  }

  think(ctx) {
    const s = this.s, inv = this.inv, Z = ctx.zone;
    // where to be for the zone
    if (Z && (this.zoneStage !== Z.stage || !this.zoneGoal)) {
      this.zoneStage = Z.stage;
      const a = this.rnd() * Math.PI * 2, r = Math.sqrt(this.rnd()) * Z.next.r * 0.6;
      this.zoneGoal = [Z.next.x + Math.cos(a) * r, Z.next.z + Math.sin(a) * r];
    }
    const outNext = Z && !Z.insideNext(s.pos.x, s.pos.z);
    const hurry = Z && outNext && (Z.phase === 'shrink' || Z.t < 35 || !Z.inside(s.pos.x, s.pos.z));
    // heal when it's quiet
    if (!this.heal && s.health < 60 && this.seenT > 3 && this.hurtT > 2) {
      if (inv.medkit > 0 && s.health < 40) this.heal = { kind: 'medkit', t: 0, dur: 5 };
      else if (inv.bandage > 0) this.heal = { kind: 'bandage', t: 0, dur: 2.2 };
    }
    if (hurry) { this.goalItem = null; this.path = []; this.goal = this.zoneGoal; return; }
    if (this.target && this.visible && inv.gun()) return;   // busy fighting (without a gun: keep looking for one)
    // loot: the nearest thing worth having
    this.goalT -= 0.25;
    if (!this.goalItem || this.goalItem.taken || this.goalT <= 0) {
      this.goalItem = null; this.goalT = 8;
      let best = null, bd = inv.gun() ? 38 : 130;
      for (const it of ctx.loot.items) {
        if (it.taken || (it.botFails || 0) > (inv.gun() ? 2 : 4)) continue;
        const d = Math.abs(it.x - s.pos.x) + Math.abs(it.z - s.pos.z);
        if (d < bd && Math.abs(it.y - s.pos.y) < 4 && this.wants(it)) { bd = d; best = it; }
      }
      if (best) { best.botFails = best.botFails || 0; this.goalItem = best; this.route(best); return; }
    }
    if (this.goalItem) return;
    // nothing to do: wander inside the next zone
    if (!this.goal) {
      if (Z) { const a = this.rnd() * Math.PI * 2, r = Math.sqrt(this.rnd()) * Z.next.r * 0.8; this.goal = [Z.next.x + Math.cos(a) * r, Z.next.z + Math.sin(a) * r]; }
      else this.goal = [s.pos.x + (this.rnd() - 0.5) * 60, s.pos.z + (this.rnd() - 0.5) * 60];
    }
  }

  // the way into a building: its door, then the stairs for an upper floor
  route(it) {
    const s = this.s, h = this.world.houseAt(it.x, it.z);
    this.path = [];
    if (!h) return;
    const inside = this.world.houseAt(s.pos.x, s.pos.z) === h;
    if (!inside) this.path.push(h.door[0], h.door[1]);
    if (h.stairs && it.y > h.y + 2 && s.pos.y < h.y + 2) this.path.push(h.stairs[0], h.stairs[1]);
  }

  // someone shot us: turn on them
  onHurt(by) {
    this.hurtT = 0; this.heal = null;
    if (by && by !== this.s && by.alive && (!this.target || !this.visible)) { this.target = by; this.seenT = 0; this.reactT = Math.max(this.reactT, this.L.react * 0.6); }
  }

  shoot(dt, ctx, T) {
    const s = this.s, g = this.inv.gun(), d = g.def, L = this.L;
    if (this.reactT > 0) { this.reactT -= dt; return; }
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (g.cool > 0 || g.busy || g.ammo <= 0 || this.heal) return;
    const dx = T.pos.x - s.pos.x, dz = T.pos.z - s.pos.z, dist = Math.hypot(dx, dz);
    if (dist > d.range * 0.9) return;
    let dy = Math.atan2(dx, dz) - s.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    if (Math.abs(dy) > 0.2) return;
    g.ammo--; g.cool = d.rate * (d.auto ? 1.25 : 1.6);
    this.burstN++;
    if (this.burstN >= (d.auto ? L.burst : 2)) { this.burstN = 0; this.pauseT = L.pause * (0.6 + this.rnd() * 0.8); }
    const ox = s.pos.x, oy = s.pos.y + s.height - 0.3, oz = s.pos.z;
    const head = this.rnd() < L.head;
    const ty = T.pos.y + (head ? T.height - 0.14 : T.height * 0.6);
    const err = L.aim * (1 + (s.moveSpeed > 1 ? 0.6 : 0) + (T.moveSpeed > 2 ? 0.5 : 0) + (T.crouching ? 0.2 : 0));
    const pel = d.pellets || 1;
    let hitAny = false, dmgSum = 0, headHit = false, end = null;
    for (let k = 0; k < pel; k++) {
      _v.set(T.pos.x - ox, ty - oy, T.pos.z - oz).normalize();
      const sp = err + (pel > 1 ? d.spread : 0);
      _v.x += (this.rnd() - 0.5) * 2 * sp; _v.y += (this.rnd() - 0.5) * 1.4 * sp; _v.z += (this.rnd() - 0.5) * 2 * sp; _v.normalize();
      const hit = castShot(this.world, ctx.soldiers, [ox, oy, oz], [_v.x, _v.y, _v.z], d.range, s);
      if (k === 0) end = [ox + _v.x * hit.t, oy + _v.y * hit.t, oz + _v.z * hit.t];
      if (hit.target) {
        const dmg = bulletDamage(d, hit.t, hit.head, hit.target.helm);
        ctx.onHit(this, hit.target, dmg, hit.head, d);
        hitAny = true; dmgSum += dmg; headHit = headHit || hit.head;
      }
    }
    s.recoilKick = 1;
    ctx.onShot(this, [ox, oy, oz], end, d);
    void hitAny; void dmgSum; void headHit;
  }

  // what they drop when they die: their guns, ammo and meds
  dropLoot(loot) {
    const s = this.s, inv = this.inv, items = [];
    inv.guns.forEach((g) => { if (g) items.push(['gun:' + g.def.id, g.ammo]); });
    for (const k in inv.ammo) if (inv.ammo[k] > 0) items.push(['ammo:' + k, inv.ammo[k]]);
    if (inv.bandage) items.push(['bandage', inv.bandage]);
    for (let i = 0; i < inv.medkit; i++) items.push(['medkit', 1]);
    items.forEach(([kind, n], i) => {
      const a = (i / Math.max(1, items.length)) * Math.PI * 2;
      loot.add(kind, s.pos.x + Math.cos(a) * 0.8, s.pos.y + 0.02, s.pos.z + Math.sin(a) * 0.8, n);
    });
  }
}
