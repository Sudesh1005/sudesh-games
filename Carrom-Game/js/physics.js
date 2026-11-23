// Carrom Raja: the board, the coins and the rules.
// Pure JavaScript (no three.js), so it runs the same in every browser and in Node for tests.
// Units: metres and seconds. The playing surface is 74 cm square, centred on (0, 0); x is right and
// z is towards the bottom of the screen for seat 0. Only + - * / and sqrt are used inside the
// simulation, so every computer gets exactly the same result from the same shot (needed online).

export const H = 0.37;                 // half the playing surface
export const COIN_R = 0.0159;          // coins 31.8 mm
export const STRIKER_R = 0.0206;       // striker 41.3 mm
export const POCKET_R = 0.0225;        // pockets 44.5 mm
export const PC = H - 0.0255;          // pocket centre distance along x and z
export const BASE = 0.2526;            // striker centre line (between the two base lines) from the centre
export const BASE_OUT = 0.2685, BASE_IN = 0.2367;
export const BASE_HALF = 0.235;        // the base lines are 47 cm long
export const U_MAX = BASE_HALF - COIN_R; // striker centre range along the base line (to the end circles)
export const MAX_SPEED = 4.6;          // fastest striker flick (m/s)
const M_COIN = 0.0055, M_STRIKER = 0.015;
const E_COIN = 0.9, E_WALL = 0.68;
const DECEL = 1.15, DAMP = 0.55;       // sliding friction on the powdered board
export const DT = 1 / 1000;

export const POCKETS = [[-PC, -PC], [PC, -PC], [PC, PC], [-PC, PC]];
// each seat: f = forward (towards the centre), r = that player's right-hand direction along their base line
export const SEATS = [
  { f: [0, -1], r: [1, 0] },   // bottom
  { f: [-1, 0], r: [0, -1] },  // right
  { f: [0, 1], r: [-1, 0] },   // top
  { f: [1, 0], r: [0, 1] },    // left
];
export const seatPos = (seat, u) => { const S = SEATS[seat]; return [-S.f[0] * BASE + S.r[0] * u, -S.f[1] * BASE + S.r[1] * u]; };

/* ------------------------------------------------------------------ setting up */
function body(id, kind, x, z) {
  const s = kind === 's';
  return { id, kind, x, z, vx: 0, vz: 0, r: s ? STRIKER_R : COIN_R, m: s ? M_STRIKER : M_COIN, on: true };
}

// Queen in the middle, 6 coins around it, 12 around those (alternating colours), as on a real board.
export function rack() {
  const coins = [body(0, 'q', 0, 0)];
  const d = 2 * COIN_R + 0.0004;
  const ring1 = [], ring2 = [];
  // angles kept as exact cos/sin values (no trig at run time)
  const C30 = 0.8660254037844386;
  const hex = [[1, 0], [0.5, C30], [-0.5, C30], [-1, 0], [-0.5, -C30], [0.5, -C30]];
  for (const [c, s] of hex) ring1.push([c * d, s * d]);
  for (let k = 0; k < 6; k++) {
    const [c, s] = hex[k], [c2, s2] = hex[(k + 1) % 6];
    ring2.push([c * 2 * d, s * 2 * d]);
    ring2.push([(c + c2) * d, (s + s2) * d]);
  }
  let id = 1;
  ring1.forEach(([x, z], k) => coins.push(body(id++, k % 2 ? 'b' : 'w', x, z)));
  // outer ring: whites on the corners of the hexagon and blacks between, rotated so a white "Y" forms
  ring2.forEach(([x, z], k) => coins.push(body(id++, k % 2 ? 'w' : 'b', x, z)));
  // turn the pack 15° so no coin lines up straight with a pocket from the base line
  const cs = 0.9659258262890683, sn = 0.25881904510252074;
  for (const c of coins) { const x = c.x, z = c.z; c.x = x * cs - z * sn; c.z = x * sn + z * cs; }
  coins.push(body(id++, 's', 0, BASE));
  return coins;
}

// players: [{ name, seat }] in turn order. 2 players sit opposite (seats 0, 2); 4 players are two teams
// (seats 0+2 play white, 1+3 play black). The first player plays white.
export function newGame(n, names = []) {
  const seats = n === 4 ? [0, 1, 2, 3] : [0, 2];
  const players = seats.map((seat, i) => ({ name: names[i] || 'Player ' + (i + 1), seat, team: n === 4 ? seat % 2 : i }));
  return {
    n, players, coins: rack(), turn: 0, shots: 0, broke: false,
    queen: 'board',          // 'board' | 'pending' | 'covered'
    queenTeam: -1,           // team that pocketed (pending) or covered the queen
    pocketed: [0, 0],        // own coins pocketed by team 0 (white) and team 1 (black)
    due: [0, 0],             // coins owed back to the board after a foul with none pocketed yet
    winner: -1, points: 0, log: [],
  };
}
export const colorOf = (team) => (team === 0 ? 'w' : 'b');
export const striker = (g) => g.coins[g.coins.length - 1];
export const cur = (g) => g.players[g.turn];

export function cloneGame(g) {
  return Object.assign({}, g, { coins: g.coins.map((c) => Object.assign({}, c)), players: g.players.map((p) => Object.assign({}, p)), pocketed: g.pocketed.slice(), due: g.due.slice(), log: [] });
}

/* ------------------------------------------------------------------ striker placement */
// Is the striker at u on this seat's base line clear of every coin?
export function placeOk(g, seat, u) {
  if (u < -U_MAX - 1e-9 || u > U_MAX + 1e-9) return false;
  const [x, z] = seatPos(seat, u);
  for (const c of g.coins) {
    if (!c.on || c.kind === 's') continue;
    const dx = c.x - x, dz = c.z - z, rr = c.r + STRIKER_R;
    if (dx * dx + dz * dz < rr * rr) return false;
  }
  return true;
}
// nearest clear spot to u
export function freeU(g, seat, u) {
  for (let k = 0; k <= 60; k++) {
    for (const s of k ? [1, -1] : [1]) {
      const v = u + s * k * 0.004;
      if (placeOk(g, seat, v)) return v;
    }
  }
  return u;
}
export function placeStriker(g, u) {
  const p = cur(g), S = striker(g), [x, z] = seatPos(p.seat, u);
  S.x = x; S.z = z; S.vx = 0; S.vz = 0; S.on = true; S.u = u;
}

/* ------------------------------------------------------------------ simulation */
// Start a shot: (dx, dz) is a unit direction, power 0..1.
export function shoot(g, u, dx, dz, power) {
  placeStriker(g, u);
  const len = Math.sqrt(dx * dx + dz * dz) || 1, sp = MAX_SPEED * Math.max(0.02, Math.min(1, power));
  const S = striker(g);
  S.vx = (dx / len) * sp; S.vz = (dz / len) * sp;
  g.sim = { t: 0, pocketed: [], strikerIn: false, hits: 0, firstHit: null };
}

const moving = (c) => c.on && (c.vx !== 0 || c.vz !== 0);
export function anyMoving(g) { for (const c of g.coins) if (moving(c)) return true; return false; }

// One small time step. ev (optional) collects sounds: { hit: [strength...], wall: [...], pocket: [coin...] }
export function step(g, dt = DT, ev = null) {
  const cs = g.coins, n = cs.length;
  // friction
  for (const c of cs) {
    if (!moving(c)) continue;
    const sp = Math.sqrt(c.vx * c.vx + c.vz * c.vz);
    let ns = sp - (DECEL + DAMP * sp) * dt;
    if (ns < 0.004) ns = 0;
    const f = ns / sp;
    c.vx *= f; c.vz *= f;
    c.x += c.vx * dt; c.z += c.vz * dt;
  }
  // coin against coin
  for (let i = 0; i < n; i++) {
    const a = cs[i];
    if (!a.on) continue;
    for (let j = i + 1; j < n; j++) {
      const b = cs[j];
      if (!b.on) continue;
      const dx = b.x - a.x, dz = b.z - a.z, rr = a.r + b.r, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-6, nx = dx / d, nz = dz / d, pen = rr - d;
      const ia = 1 / a.m, ib = 1 / b.m, it = ia + ib;
      a.x -= nx * pen * (ia / it); a.z -= nz * pen * (ia / it);
      b.x += nx * pen * (ib / it); b.z += nz * pen * (ib / it);
      const vr = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vr < 0) {
        const jj = (-(1 + E_COIN) * vr) / it;
        a.vx -= jj * ia * nx; a.vz -= jj * ia * nz; b.vx += jj * ib * nx; b.vz += jj * ib * nz;
        if (g.sim) { g.sim.hits++; if (!g.sim.firstHit && (a.kind === 's' || b.kind === 's')) g.sim.firstHit = a.kind === 's' ? b.kind : a.kind; }
        if (ev && -vr > 0.05) ev.hit.push(-vr);
      }
    }
  }
  // cushions and pockets
  for (const c of cs) {
    if (!c.on) continue;
    const lim = H - c.r;
    if (c.x > lim) { c.x = lim; if (c.vx > 0) { if (ev && c.vx > 0.08) ev.wall.push(c.vx); c.vx = -c.vx * E_WALL; } }
    else if (c.x < -lim) { c.x = -lim; if (c.vx < 0) { if (ev && c.vx < -0.08) ev.wall.push(-c.vx); c.vx = -c.vx * E_WALL; } }
    if (c.z > lim) { c.z = lim; if (c.vz > 0) { if (ev && c.vz > 0.08) ev.wall.push(c.vz); c.vz = -c.vz * E_WALL; } }
    else if (c.z < -lim) { c.z = -lim; if (c.vz < 0) { if (ev && c.vz < -0.08) ev.wall.push(-c.vz); c.vz = -c.vz * E_WALL; } }
    for (const [px, pz] of POCKETS) {
      const dx = c.x - px, dz = c.z - pz;
      if (dx * dx + dz * dz < POCKET_R * POCKET_R) {
        c.on = false; c.vx = 0; c.vz = 0; c.px = px; c.pz = pz;
        if (g.sim) { if (c.kind === 's') g.sim.strikerIn = true; else g.sim.pocketed.push(c); }
        if (ev) ev.pocket.push(c);
        break;
      }
    }
  }
  if (g.sim) g.sim.t += dt;
}

// Run a shot to the end (used by the computer players and tests).
export function runShot(g, dt = DT, maxT = 12) {
  while (anyMoving(g) && g.sim.t < maxT) step(g, dt);
  for (const c of g.coins) { c.vx = 0; c.vz = 0; }
}

/* ------------------------------------------------------------------ rules */
// Put a coin back on the board: on the centre spot, or as close to it as possible.
function returnCoin(g, c) {
  c.on = true; c.vx = 0; c.vz = 0; delete c.px; delete c.pz;
  const clear = (x, z) => {
    for (const o of g.coins) {
      if (!o.on || o === c || o.kind === 's') continue;
      const dx = o.x - x, dz = o.z - z, rr = o.r + c.r + 0.0005;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  };
  if (clear(0, 0)) { c.x = 0; c.z = 0; return; }
  // spiral outwards (fixed table of directions, no trig)
  const dirs = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
  for (let k = 1; k < 40; k++) {
    const rad = k * 0.006;
    for (const [dx, dz] of dirs) if (clear(dx * rad, dz * rad)) { c.x = dx * rad; c.z = dz * rad; return; }
  }
  c.x = 0; c.z = 0;
}
const ownPocketedCoin = (g, team) => g.coins.find((c) => !c.on && c.kind === colorOf(team));
const onBoard = (g, kind) => g.coins.filter((c) => c.on && c.kind === kind).length;

// After the coins stop: apply the rules. Returns { again (same player shoots again), foul, msgs }.
export function endShot(g) {
  const sim = g.sim, p = cur(g), T = p.team, O = 1 - T, mine = colorOf(T), theirs = colorOf(O);
  const msgs = [];
  const own = sim.pocketed.filter((c) => c.kind === mine);
  const opp = sim.pocketed.filter((c) => c.kind === theirs);
  const queenIn = sim.pocketed.some((c) => c.kind === 'q');
  const queen = g.coins[0];
  let again = false, foul = false;
  g.shots++;
  g.pocketed[O] += opp.length;
  if (opp.length) msgs.push(opp.length > 1 ? `${opp.length} of the other side's coins went in` : "One of the other side's coins went in");

  if (sim.strikerIn) {
    // foul: the striker went in. Coins pocketed this shot come back, plus one already-pocketed coin as a penalty.
    foul = true;
    for (const c of own) returnCoin(g, c);
    if (queenIn) returnCoin(g, queen);
    if (g.queen === 'pending' && g.queenTeam === T) { returnCoin(g, queen); g.queen = 'board'; g.queenTeam = -1; }
    const pen = ownPocketedCoin(g, T);
    if (pen) { returnCoin(g, pen); g.pocketed[T]--; } else g.due[T]++;
    msgs.push('Foul! The striker went in. A coin goes back to the centre.');
  } else {
    let ownCount = own.length;
    // pay back coins owed from an earlier foul
    while (ownCount > 0 && g.due[T] > 0) { returnCoin(g, own[ownCount - 1]); ownCount--; g.due[T]--; msgs.push('A coin goes back for the earlier foul'); }
    g.pocketed[T] += ownCount;
    // the queen: pocket her, then "cover" her by pocketing one of your own coins (same shot or the next)
    if (g.queen === 'pending' && g.queenTeam === T) {
      if (ownCount > 0) { g.queen = 'covered'; msgs.push('Queen covered!'); }
      else { returnCoin(g, queen); g.queen = 'board'; g.queenTeam = -1; msgs.push('Queen not covered. She goes back to the centre.'); }
    }
    if (queenIn) {
      if (ownCount > 0) { g.queen = 'covered'; g.queenTeam = T; msgs.push('Queen pocketed and covered!'); }
      else { g.queen = 'pending'; g.queenTeam = T; msgs.push('Queen pocketed! Pocket one of your coins next to cover her.'); }
    }
    again = ownCount > 0 || queenIn;
  }

  // last coin rules: the queen must be covered before a side's last coin goes in
  for (const t of [T, O]) {
    if (onBoard(g, colorOf(t)) === 0 && g.queen !== 'covered') {
      const c = ownPocketedCoin(g, t);
      if (c) { returnCoin(g, c); g.pocketed[t]--; }
      msgs.push('The queen must be covered before the last coin. One coin goes back.');
      if (t === T) again = false;
    }
  }
  // board won: a side with all 9 coins in and the queen covered
  for (const t of [T, O]) {
    if (onBoard(g, colorOf(t)) === 0 && g.queen === 'covered') {
      g.winner = t;
      g.points = onBoard(g, colorOf(1 - t)) + (g.queenTeam === t ? 3 : 0);
      if (t !== T) msgs.push("The other side's last coin went in: they win the board.");
      again = false;
      break;
    }
  }
  if (!g.broke) g.broke = true;
  g.sim = null;
  if (g.winner < 0 && !again) g.turn = (g.turn + 1) % g.players.length;
  g.log = msgs;
  return { again, foul, msgs };
}

// Everything the other computers need to match this one exactly.
export function snapshot(g) {
  return {
    c: g.coins.map((c) => [+c.x.toFixed(5), +c.z.toFixed(5), c.on ? 1 : 0, c.px ?? 0, c.pz ?? 0]),
    turn: g.turn, shots: g.shots, broke: g.broke, queen: g.queen, queenTeam: g.queenTeam, pocketed: g.pocketed.slice(), due: g.due.slice(), winner: g.winner, points: g.points,
  };
}
export function restore(g, s) {
  s.c.forEach(([x, z, on, px, pz], i) => {
    const c = g.coins[i]; if (!c) return;
    c.x = x; c.z = z; c.on = !!on; c.vx = 0; c.vz = 0;
    if (!on) { c.px = px; c.pz = pz; } else { delete c.px; delete c.pz; }
  });
  Object.assign(g, { turn: s.turn, shots: s.shots, broke: s.broke, queen: s.queen, queenTeam: s.queenTeam, pocketed: s.pocketed.slice(), due: s.due.slice(), winner: s.winner, points: s.points, sim: null });
}
