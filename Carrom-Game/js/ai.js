// Carrom Raja: the computer player. It looks for coins it can cut into a pocket (the "ghost coin"
// method players use), tries the best few shots on a copy of the board, and plays the one that
// works out best. Lower levels aim less carefully.
import { COIN_R, STRIKER_R, POCKETS, U_MAX, MAX_SPEED, SEATS, seatPos, cloneGame, shoot, runShot, cur, colorOf, placeOk } from './physics.js';

export const LEVELS = {
  easy: { aim: 0.075, power: 0.2, tries: 4, think: 0.9 },
  normal: { aim: 0.034, power: 0.11, tries: 8, think: 1.1 },
  hard: { aim: 0.012, power: 0.05, tries: 14, think: 1.2 },
};

const A_EFF = 1.6; // rough slowing (m/s²) used to guess how hard to hit

// distance from point (px,pz) to segment a-b
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / L2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px, z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}
function clearPath(g, ax, az, bx, bz, rad, skip) {
  for (const c of g.coins) {
    if (!c.on || c.kind === 's' || skip.includes(c)) continue;
    if (segDist(c.x, c.z, ax, az, bx, bz) < rad + c.r) return false;
  }
  return true;
}

// Score a finished simulated shot from team T's point of view.
function judge(before, after, T) {
  const sim = after.lastSim;
  if (!sim) return -99;
  const mine = colorOf(T), theirs = colorOf(1 - T);
  let s = 0;
  for (const c of sim.pocketed) s += c.kind === mine ? 10 : c.kind === theirs ? -7 : 0;
  if (sim.pocketed.some((c) => c.kind === 'q')) s += sim.pocketed.some((c) => c.kind === mine) || before.queen === 'board' ? 7 : 2;
  if (sim.strikerIn) s -= 16;
  // leave own coins near pockets, other side's coins far away
  for (const c of after.coins) {
    if (!c.on || c.kind === 's' || c.kind === 'q') continue;
    let best = 9;
    for (const [px, pz] of POCKETS) { const d = Math.hypot(c.x - px, c.z - pz); if (d < best) best = d; }
    if (best < 0.12) s += (c.kind === mine ? 0.6 : -0.4) * (0.12 - best) / 0.12;
  }
  return s;
}

function simulate(g, u, dx, dz, power) {
  const h = cloneGame(g);
  shoot(h, u, dx, dz, power);
  runShot(h, 1 / 400, 8);
  h.lastSim = h.sim;
  return h;
}

// Pick a shot for the current player: { u, dx, dz, power }
export function planShot(g, level = 'normal', rnd = Math.random) {
  const L = LEVELS[level] || LEVELS.normal;
  const p = cur(g), T = p.team, seat = p.seat, S = SEATS[seat];
  const mine = colorOf(T);
  const targets = g.coins.filter((c) => c.on && (c.kind === mine || (c.kind === 'q' && g.queen === 'board')));
  const cands = [];

  // the opening break: hit the pack in the middle hard
  if (!g.broke) {
    const u = (rnd() - 0.5) * 0.04, [sx, sz] = seatPos(seat, u);
    const d = Math.hypot(sx, sz);
    return noisy({ u, dx: -sx / d, dz: -sz / d, power: 0.92 }, L, rnd);
  }

  for (const t of targets) {
    for (const [px, pz] of POCKETS) {
      let ex = px - t.x, ez = pz - t.z;
      const el = Math.hypot(ex, ez); ex /= el; ez /= el;
      const gx = t.x - ex * (COIN_R + STRIKER_R), gz = t.z - ez * (COIN_R + STRIKER_R);
      if (!clearPath(g, t.x, t.z, px, pz, COIN_R * 0.9, [t])) continue;
      for (let k = -15; k <= 15; k++) {
        const u = (k / 15) * U_MAX;
        if (!placeOk(g, seat, u)) continue;
        const [sx, sz] = seatPos(seat, u);
        let vx = gx - sx, vz = gz - sz;
        const vl = Math.hypot(vx, vz); vx /= vl; vz /= vl;
        const cosCut = vx * ex + vz * ez;
        if (cosCut < 0.3) continue;
        // don't shoot backwards into your own side of the board
        if (vx * S.f[0] + vz * S.f[1] < -0.2) continue;
        if (!clearPath(g, sx, sz, gx, gz, STRIKER_R * 0.95, [t])) continue;
        // how hard: enough for the coin to reach the pocket with some to spare
        const vc = Math.sqrt(2 * A_EFF * el) + 0.35;
        const vHit = vc / (1.9 * 0.73 * cosCut);
        const v0 = Math.sqrt(vHit * vHit + 2 * A_EFF * vl);
        const power = Math.min(1, v0 / MAX_SPEED);
        const score = cosCut * 2.2 - vl * 1.2 - el * 1.5 + (t.kind === 'q' ? 0.3 : 0);
        cands.push({ u, dx: vx, dz: vz, power, score });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  // keep a variety of shots (not 10 versions of the same one)
  const picked = [];
  for (const c of cands) {
    if (picked.length >= L.tries) break;
    if (picked.some((q) => Math.abs(q.dx - c.dx) < 0.02 && Math.abs(q.dz - c.dz) < 0.02)) continue;
    picked.push(c);
  }
  let best = null, bestS = -Infinity;
  for (const c of picked) {
    for (const pw of [c.power, Math.min(1, c.power * 1.25)]) {
      const after = simulate(g, c.u, c.dx, c.dz, pw);
      const s = judge(g, after, T) + c.score * 0.1;
      if (s > bestS) { bestS = s; best = { u: c.u, dx: c.dx, dz: c.dz, power: pw }; }
    }
  }
  if (!best || bestS < 0) {
    // nothing good: a safe shot at the nearest own coin, or a firm shot at the centre
    const fallback = [];
    for (const t of targets) {
      for (let k = -6; k <= 6; k++) {
        const u = (k / 6) * U_MAX;
        if (!placeOk(g, seat, u)) continue;
        const [sx, sz] = seatPos(seat, u);
        if (!clearPath(g, sx, sz, t.x, t.z, STRIKER_R, [t])) continue;
        const dx = t.x - sx, dz = t.z - sz, d = Math.hypot(dx, dz);
        if ((dx * S.f[0] + dz * S.f[1]) / d < 0.2) continue;
        fallback.push({ u, dx: dx / d, dz: dz / d, power: 0.55, d });
      }
    }
    fallback.sort((a, b) => a.d - b.d);
    for (const c of fallback.slice(0, 4)) {
      const after = simulate(g, c.u, c.dx, c.dz, c.power);
      const s = judge(g, after, T);
      if (s > bestS) { bestS = s; best = c; }
    }
  }
  if (!best || bestS < 1) {
    // still nothing that pockets a coin: try a spread of shots (bank shots off the cushions too) on a copy of the board
    for (let k = 0; k < 26; k++) {
      const u = freeish(g, seat, (rnd() * 2 - 1) * U_MAX);
      const a = (rnd() * 2 - 1) * 1.35, c = Math.cos(a), sn = Math.sin(a);
      const dx = S.f[0] * c - S.f[1] * sn, dz = S.f[0] * sn + S.f[1] * c;
      const power = 0.35 + rnd() * 0.6;
      const after = simulate(g, u, dx, dz, power);
      const sc = judge(g, after, T);
      if (sc > bestS) { bestS = sc; best = { u, dx, dz, power }; }
    }
  }
  if (!best) {
    const u = freeish(g, seat), [sx, sz] = seatPos(seat, u), d = Math.hypot(sx, sz) || 1;
    best = { u, dx: -sx / d, dz: -sz / d, power: 0.6 };
  }
  return noisy(best, L, rnd);
}

function freeish(g, seat, from = 0) {
  for (let k = 0; k <= 60; k++) for (const s of [1, -1]) { const u = from + s * k * 0.007; if (placeOk(g, seat, u)) return u; }
  return 0;
}

function noisy(s, L, rnd) {
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.15;
  const a = gauss() * L.aim, c = Math.cos(a), sn = Math.sin(a);
  return { u: s.u, dx: s.dx * c - s.dz * sn, dz: s.dx * sn + s.dz * c, power: Math.max(0.05, Math.min(1, s.power * (1 + gauss() * L.power))) };
}
