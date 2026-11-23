// Theevu Yudham: what a bullet hits, and how much it hurts. Shared by the player and the computer players.
import { HELMET_CUT } from './loot.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Cast one bullet from o along d. Returns { t, target, head, wall } (wall = the world hit when no one was hit).
export function castShot(world, soldiers, o, d, range, shooter) {
  let best = range, target = null, head = false;
  const wh = world.raycast(o, d, range);
  if (wh) best = wh.t;
  for (const s of soldiers) {
    if (s === shooter || !s.alive) continue;
    const h = s.rayHit(o, d, best);
    if (h && h.t < best) { best = h.t; target = s; head = h.head; }
  }
  return { t: best, target, head, wall: target ? null : wh };
}

// Damage for one bullet (or pellet): falls off past part of the gun's range; helmets soak headshots.
export function bulletDamage(def, dist, head, helm) {
  const fall = clamp(1.25 - dist / def.range, 0.5, 1);
  const mult = head ? 1 + (def.head - 1) * (1 - HELMET_CUT[helm || 0]) : 1;
  return def.dmg * mult * fall;
}
