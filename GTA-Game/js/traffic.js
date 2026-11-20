// Traffic + police AI on any road graph: follow edges, keep left, brake for obstacles, chase or flee the player.
import { nodePos, neighbors, nearestNode, laneOffset, clamp } from './world.js';

export function setRoute(v, from, to) {
  v.ai = { from, to, stuck: 0, reverse: 0, blockT: 0, ignoreT: 0, direct: false };
}

function laneTarget(ai) {
  const B = nodePos(ai.to);
  if (ai.from === ai.to) return B;
  const A = nodePos(ai.from);
  const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len, off = laneOffset(ai.from, ai.to);
  const back = Math.min(off, len * 0.3);
  return { x: B.x + uz * off - ux * back, z: B.z - ux * off - uz * back };
}

function pickNext(ai, goal, away) {
  const nb = neighbors(ai.to);
  if (!nb.length) { ai.to = ai.from; return; }
  let next;
  let opts = nb.filter((n) => n !== ai.from);
  if (!opts.length) opts = nb;
  if (goal) {
    let bd = Infinity;
    for (const n of nb) {
      const p = nodePos(n);
      const d = (p.x - goal.x) ** 2 + (p.z - goal.z) ** 2;
      if (d < bd) { bd = d; next = n; }
    }
  } else if (away) {
    let bd = -1;
    for (const n of opts) {
      const p = nodePos(n);
      const d = (p.x - away.x) ** 2 + (p.z - away.z) ** 2 + Math.random() * 6000;
      if (d > bd) { bd = d; next = n; }
    }
  } else {
    // prefer going roughly straight
    const A = nodePos(ai.from), B = nodePos(ai.to);
    const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1;
    let straight = null, bestDot = 0.7;
    for (const n of opts) {
      const C = nodePos(n), ex = C.x - B.x, ez = C.z - B.z, el = Math.hypot(ex, ez) || 1;
      const dot = (dx * ex + dz * ez) / (l * el);
      if (dot > bestDot) { bestDot = dot; straight = n; }
    }
    next = straight !== null && (opts.length === 1 || Math.random() < 0.6) ? straight : opts[(Math.random() * opts.length) | 0];
  }
  ai.from = ai.to; ai.to = next;
}

function blocked(v, ctx) {
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  const look = 5 + Math.max(0, v.speed) * 0.9;
  for (const o of ctx.vehicles) {
    if (o === v) continue;
    const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
    const f = dx * fx + dz * fz;
    if (f <= 0 || f > look) continue;
    if (Math.abs(dx * fz - dz * fx) < 2.1) return true;
  }
  if (ctx.foot) {
    const dx = ctx.foot.x - v.pos.x, dz = ctx.foot.z - v.pos.z;
    const f = dx * fx + dz * fz;
    if (f > 0 && f < look && Math.abs(dx * fz - dz * fx) < 1.8) return true;
  }
  return false;
}

const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export function aiControl(v, dt, ctx) {
  const ai = v.ai, chase = v.police && v.mode === 'chase';
  const P = ctx.target;
  let tx, tz;
  const dP = Math.hypot(P.x - v.pos.x, P.z - v.pos.z);
  if (chase && dP < 32) { tx = P.x; tz = P.z; ai.direct = true; }
  else {
    if (ai.direct) { const n = nearestNode(v.pos.x, v.pos.z); ai.from = n; ai.to = n; ai.direct = false; }
    let t = chase ? nodePos(ai.to) : laneTarget(ai);
    // several short OSM segments can be passed in one frame
    for (let k = 0; k < 3 && Math.hypot(t.x - v.pos.x, t.z - v.pos.z) < (chase ? 8 : 4.5); k++) {
      pickNext(ai, chase ? P : null, v.flee ? P : null);
      t = chase ? nodePos(ai.to) : laneTarget(ai);
    }
    tx = t.x; tz = t.z;
  }
  const desired = Math.atan2(tx - v.pos.x, tz - v.pos.z);
  const diff = wrap(desired - v.heading);
  const steer = clamp(diff * 2.2, -1, 1);
  const cruise = chase ? v.cfg.maxSpeed * 0.92 : v.flee ? v.cfg.maxSpeed * 0.7 : Math.min(12, v.cfg.maxSpeed * 0.6);
  let targetSpeed = cruise * (Math.abs(diff) > 0.5 ? 0.45 : 1);

  let blockedNow = false;
  if (!chase && !v.flee) {
    if (ai.ignoreT > 0) ai.ignoreT -= dt;
    else if (blocked(v, ctx)) {
      blockedNow = true;
      ai.blockT += dt;
      if (ai.blockT > 5) { ai.blockT = 0; ai.ignoreT = 2; }
    } else ai.blockT = 0;
  }
  if (blockedNow) targetSpeed = 0;
  const throttle = clamp((targetSpeed - v.speed) * 0.6, -1, 1);

  if (ai.reverse > 0) { ai.reverse -= dt; return { throttle: -0.7, steer: -steer, handbrake: false }; }
  if (!blockedNow && targetSpeed > 1 && Math.abs(v.speed) < 0.7) {
    ai.stuck += dt;
    if (ai.stuck > 1.6) { ai.stuck = 0; ai.reverse = 1.1; }
  } else ai.stuck = 0;
  return { throttle, steer, handbrake: false };
}
