// Kaathu Cricket: the cricket itself (no graphics). Deliveries, shot timing, ball flight, fielding, catches,
// runs and boundaries, plus the computer's batting and bowling decisions.
// Coordinates (metres): the striker's stumps are at z = 0, the bowler's stumps at z = -20.12.
// +x is the off side for the (right-handed) batter; the ground's centre is the middle of the pitch.

export const G = 9.81;
export const BOWL_Z = -20.12;
export const POP_Z = -1.22;      // batter's popping crease
export const CONTACT_Z = -1.45;  // where bat usually meets ball
export const CENTER = { x: 0, z: -10.06 };
export const BOUNDARY = 63;      // boundary rope radius from the centre of the pitch
export const WINDOW = 0.16;      // seconds either side of perfect timing that still hit the ball
export const BALL_R = 0.036;
export const BAT_X = -0.32;      // where the batter stands (just to the leg side of the stumps)

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const gauss = (r) => { let s = 0; for (let k = 0; k < 4; k++) s += r(); return (s - 2) / 0.577; };

// A path is sampled every DT seconds: arrays of x, y, z.
const DT = 1 / 120;
function samplePath() { return { x: [], y: [], z: [], dt: DT }; }
function push(p, x, y, z) { p.x.push(x); p.y.push(y); p.z.push(z); }
export function pathAt(p, t, out = {}) {
  const n = p.x.length;
  if (!n) { out.x = 0; out.y = 0; out.z = 0; return out; }
  const f = clamp(t / p.dt, 0, n - 1), i = Math.min(n - 2, Math.floor(f)), k = n > 1 ? f - i : 0;
  if (n === 1) { out.x = p.x[0]; out.y = p.y[0]; out.z = p.z[0]; return out; }
  out.x = p.x[i] + (p.x[i + 1] - p.x[i]) * k; out.y = p.y[i] + (p.y[i + 1] - p.y[i]) * k; out.z = p.z[i] + (p.z[i + 1] - p.z[i]) * k;
  return out;
}
export const pathDur = (p) => (p.x.length - 1) * p.dt;

/* ------------------------------------------------------------------ deliveries */
// params: { type: 'pace'|'spin', line (x at the batter), len (metres in front of the stumps where it pitches), speed (m/s), turn (-1|1), seed }
export function makeDelivery(params) {
  const r = rng(params.seed);
  const spin = params.type === 'spin';
  const R = { x: spin ? -0.35 : -0.55, y: spin ? 2.0 : 2.2, z: BOWL_Z + 1.1 };
  const len = clamp(params.len, -0.5, 14);
  const vd = spin ? params.turn * (1.3 + r() * 1.3) : (r() - 0.5) * 1.1; // sideways movement after pitching
  const keep = spin ? 0.82 : 0.88, bounce = spin ? 0.48 : 0.55;
  const tbEst = Math.max(0, (len + CONTACT_Z) / (params.speed * keep)); // time from pitching to reaching the bat
  const B = { x: params.line - vd * tbEst, z: -len };
  const dx = B.x - R.x, dz = B.z - R.z, D = Math.hypot(dx, dz), ux = dx / D, uz = dz / D;
  const vh = params.speed, T = D / vh;
  const vy0 = (0.5 * G * T * T - (R.y - BALL_R)) / T;
  const path = samplePath();
  let t = 0;
  for (; t < T; t += DT) push(path, R.x + ux * vh * t, R.y + vy0 * t - 0.5 * G * t * t, R.z + uz * vh * t);
  // after pitching
  let x = B.x, y = BALL_R, z = B.z;
  let vx = ux * vh * keep + vd, vz = uz * vh * keep, vy = -(vy0 - G * T) * bounce;
  for (let k = 0; k < 400 && z < 22; k++) {
    vy -= G * DT; x += vx * DT; y += vy * DT; z += vz * DT;
    if (y < BALL_R) { y = BALL_R; vy = -vy * 0.4; vx *= 0.85; vz *= 0.85; }
    push(path, x, y, z);
  }
  // when it reaches the batter, and whether it would hit the stumps
  let tc = null, contact = null, stumpsT = null, atPop = null;
  for (let i = 1; i < path.z.length; i++) {
    if (tc === null && path.z[i] >= CONTACT_Z) {
      const f = (CONTACT_Z - path.z[i - 1]) / (path.z[i] - path.z[i - 1]);
      tc = (i - 1 + f) * DT; contact = pathAt(path, tc, {});
    }
    if (atPop === null && path.z[i] >= POP_Z) atPop = pathAt(path, (i - 1 + (POP_Z - path.z[i - 1]) / (path.z[i] - path.z[i - 1])) * DT, {});
    if (stumpsT === null && path.z[i] >= 0) {
      const f = (0 - path.z[i - 1]) / (path.z[i] - path.z[i - 1]), s = pathAt(path, (i - 1 + f) * DT, {});
      if (Math.abs(s.x) <= 0.114 + BALL_R && s.y <= 0.711 + BALL_R) stumpsT = (i - 1 + f) * DT;
      break;
    }
  }
  const wide = atPop ? Math.abs(atPop.x) > 0.95 || atPop.y > 2.0 : false;
  return { params, path, release: R, bounceAt: { x: B.x, z: B.z, t: T }, tc, contact, stumpsT, wide, keeperT: pathDur(path) };
}

/* ------------------------------------------------------------------ fielding positions */
// [x, z, role]. The bowler (after follow-through) is added separately.
export const FIELDS = {
  pace: [[0, 12, 'keeper'], [2.2, 13.5, 'slip'], [21, 1, 'point'], [23, -15, 'cover'], [10, -33, 'mid-off'], [-10, -33, 'mid-on'],
    [-24, -14, 'midwicket'], [-23, 3, 'square leg'], [-33, 31, 'fine leg'], [33, 31, 'third man']],
  spin: [[0, 1.4, 'keeper'], [1.4, 2.8, 'slip'], [17, 0, 'point'], [21, -13, 'cover'], [15, -54, 'long-off'], [-15, -54, 'long-on'],
    [-21, -11, 'midwicket'], [-18, 2, 'square leg'], [-45, -26, 'deep midwicket'], [-31, 27, 'fine leg']],
};
export const BOWLER_END = [0.6, -16.5, 'bowler'];

/* ------------------------------------------------------------------ shots */
// shot: null (no swing) or { at (seconds after release the bat came through), dir (-1 leg, 0 straight, 1 off, null = natural), loft (bool) }
// Returns everything needed to animate the ball and score it.
export function resolve(del, shot, seed) {
  const r = rng((seed ^ 0x9e3779b9) >>> 0);
  const fset = (del.params.type === 'spin' ? FIELDS.spin : FIELDS.pace).concat([BOWLER_END]);
  const base = { swing: !!shot, timing: null, err: 0 };
  const canReach = del.contact && Math.abs(del.contact.x - BAT_X) < 1.35 && del.contact.y < 1.9;
  const err = shot && del.tc !== null ? shot.at - del.tc : 99;
  const win = shot && shot.def ? WINDOW * 1.45 : WINDOW;
  if (!shot || !canReach || Math.abs(err) > win) {
    // left alone or missed: bowled, wide, or the keeper takes it
    const timing = !shot ? 'left' : !canReach ? 'out of reach' : err < 0 ? 'too early' : 'too late';
    if (del.stumpsT !== null) return { ...base, err, timing, kind: 'bowled', outcome: { runs: 0, out: 'bowled', text: 'BOWLED!' }, endT: del.stumpsT + 1.6, ball: null, fielder: null };
    if (del.wide) return { ...base, err, timing, kind: 'wide', outcome: { runs: 1, wide: true, text: 'WIDE' }, endT: Math.min(del.keeperT, 1.4) + 0.8, ball: null, fielder: null };
    return { ...base, err, timing, kind: 'dot', outcome: { runs: 0, text: shot ? 'BEATEN!' : 'LEFT ALONE' }, endT: Math.min(del.keeperT, 1.4) + 0.8, ball: null, fielder: null };
  }
  const q = 1 - Math.abs(err) / win; // 1 = perfect
  const timing = Math.abs(err) < 0.045 ? 'perfect' : err < 0 ? 'early' : 'late';
  const c = del.contact;
  let phi, speed, elev, edged = false;
  if (shot.def && q >= 0.15) {
    // a solid block: the ball drops at the batter's feet or trickles into the infield
    phi = clamp((c.x - BAT_X - 0.25) * 0.6 + err * 3 + (r() - 0.5) * 0.6, -1.2, 1.2);
    speed = 3 + q * 5 + r() * 2; elev = 0.02 + r() * 0.04;
  } else if (q < (shot.def ? 0.15 : 0.28)) {
    // edged behind
    edged = true;
    phi = (c.x > BAT_X ? 1 : -1) * (2.55 + r() * 0.4);
    speed = 13 + r() * 9; elev = 0.04 + r() * 0.3;
  } else {
    const natural = clamp((c.x - BAT_X - 0.25) * 1.1, -0.6, 0.7);
    phi = shot.dir === 1 ? 0.8 : shot.dir === -1 ? -0.9 : shot.dir === 0 ? 0 : natural;
    phi += err * 7 + (r() - 0.5) * 0.25;           // early = pulled round to the leg side, late = to the off side
    phi = clamp(phi, -2.5, 2.5);
    const pace = del.params.speed * 0.12;
    speed = (shot.loft ? 21 + 13 * q * q : 20 + 12 * q) + pace + (r() - 0.5) * 3;
    elev = shot.loft ? 0.42 + (1 - q) * 0.45 + r() * 0.08 : 0.03 + (1 - q) * 0.22 + r() * 0.04;
  }
  // ball flight after the bat
  const path = samplePath();
  let x = c.x, y = c.y, z = c.z;
  let vx = Math.sin(phi) * Math.cos(elev) * speed, vz = -Math.cos(phi) * Math.cos(elev) * speed, vy = Math.sin(elev) * speed;
  let grounded = false, firstBounce = null, boundary = 0, t = 0, stopT = null;
  const k = 0.16; // air drag
  for (let i = 0; i < 1800; i++, t += DT) {
    push(path, x, y, z);
    if (Math.hypot(x - CENTER.x, z - CENTER.z) > BOUNDARY) { boundary = grounded ? 4 : 6; break; }
    const sp = Math.hypot(vx, vz);
    if (y <= BALL_R + 0.001 && Math.abs(vy) < 0.8) {
      // rolling along the grass
      y = BALL_R; vy = 0;
      const ns = Math.max(0, sp - 3.4 * DT);
      if (ns <= 0.25) { stopT = t; break; }
      vx *= ns / sp; vz *= ns / sp;
    } else {
      vx -= vx * k * DT; vz -= vz * k * DT; vy -= (G + vy * k) * DT;
    }
    x += vx * DT; y += vy * DT; z += vz * DT;
    if (y < BALL_R) {
      y = BALL_R;
      if (!grounded) { grounded = true; firstBounce = t; }
      vy = -vy * 0.32; vx *= 0.7; vz *= 0.7;
      if (Math.abs(vy) < 0.8) vy = 0;
    }
  }
  const flightEnd = t;
  // fielders: who gets to the ball first?
  let best = null;
  const reach = 0.9, react = 0.4;
  fset.forEach(([fx, fz, role], idx) => {
    if (edged && role === 'bowler') return;
    const runSpeed = role === 'keeper' ? 4.5 : 6.2;
    const n = path.x.length;
    for (let i = 0; i < n; i++) {
      const tt = i * DT, by = path.y[i];
      if (by > 2.7) continue;
      const d = Math.hypot(path.x[i] - fx, path.z[i] - fz) - reach;
      if (d <= runSpeed * Math.max(0, tt - react)) {
        if (!best || tt < best.t) best = { t: tt, idx, role, x: path.x[i], z: path.z[i], y: by, run: Math.max(0, d), fx, fz, airborne: !firstBounce || tt < firstBounce };
        break;
      }
    }
  });
  if (!best && stopT !== null) {
    // stopped in a gap: nearest fielder jogs over
    let bd = Infinity;
    fset.forEach(([fx, fz, role], idx) => {
      const d = Math.hypot(x - fx, z - fz);
      if (d < bd) { bd = d; best = { t: stopT + react + d / 7.2, idx, role, x, z, y: BALL_R, run: d, fx, fz, airborne: false }; }
    });
  }
  const out = { ...base, err, timing: edged ? 'edged' : timing, q, kind: 'hit', ball: path, edged, phi, def: !!(shot.def && !edged) };
  out.shotName = shotName(del, out, shot);
  if (boundary && (!best || best.t > flightEnd)) {
    out.outcome = { runs: boundary, boundary, text: boundary === 6 ? 'SIX!' : 'FOUR!', land: land(x, z), shot: out.shotName };
    out.endT = flightEnd + 2.4; out.fielder = null;
    out.runAnim = 0;
    return out;
  }
  // catch?
  if (best.airborne && best.y > 0.45) {
    const hard = clamp(best.run / Math.max(1, 6.2 * Math.max(0.3, best.t - react)), 0, 1);
    const fast = Math.hypot(path.x[1] - path.x[0], path.z[1] - path.z[0]) / DT > 26 ? 0.15 : 0;
    const p = best.role === 'keeper' || best.role === 'slip' ? 0.75 : 0.88 - hard * 0.4 - fast;
    if (r() < p) {
      out.outcome = { runs: 0, out: 'caught', by: best.role, text: 'CAUGHT!', land: land(best.x, best.z), shot: out.shotName };
      out.fielder = best; out.catchT = best.t; out.endT = best.t + 2.0; out.ballEnd = best.t; out.runAnim = 0;
      return out;
    }
    out.dropped = true;
    best = { ...best, t: best.t + 1.1 };
  }
  // a hard-hit ball along the ground can get past the fielder
  if (!best.airborne && !out.dropped) {
    const i = Math.min(path.x.length - 2, Math.round(best.t / DT));
    const bs = Math.hypot(path.x[i + 1] - path.x[i], path.z[i + 1] - path.z[i]) / DT;
    if (bs > 16 && r() < (bs - 16) / 30) { out.misfield = true; best = { ...best, t: best.t + 1.6 }; }
  }
  // fielded: batters run while the ball comes back
  const ret = Math.hypot(best.x, best.z) < Math.hypot(best.x, best.z - BOWL_Z) ? Math.hypot(best.x, best.z) : Math.hypot(best.x, best.z - BOWL_Z);
  const throwT = 0.45 + ret / 26;
  const dead = best.t + throwT;
  let runs = Math.floor((dead - 0.5) / 2.7);
  runs = clamp(runs, 0, 3);
  out.outcome = { runs, text: out.dropped ? 'DROPPED!' : out.misfield ? 'MISFIELD! ' + runs : runs === 0 ? 'NO RUN' : runs === 1 ? '1 RUN' : runs + ' RUNS', land: land(best.x, best.z), shot: out.shotName, dropped: !!out.dropped, misfield: !!out.misfield, by: best.role };
  out.fielder = best; out.ballEnd = best.t; out.throwT = throwT; out.runAnim = runs;
  out.endT = Math.max(dead, runs * 2.7 + 0.5) + 1.0;
  return out;
}

const land = (x, z) => ({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });

// A cricket name for the shot, from where it went and how the ball was bowled.
export function shotName(del, res, shot) {
  if (res.edged) return res.phi > 0 ? 'thick edge' : 'inside edge';
  if (res.def) return 'solid defence';
  const len = del.params.len, short = len > 8, full = len < 3.5, spin = del.params.type === 'spin', loft = shot && shot.loft;
  const a = res.phi;
  if (a > 1.6) return loft ? 'ramp over the keeper' : 'late cut';
  if (a > 0.9) return short ? (loft ? 'upper cut' : 'square cut') : loft ? 'lofted over point' : 'steer through point';
  if (a > 0.3) return short ? 'cut' : loft ? 'lofted cover drive' : 'cover drive';
  if (a > -0.3) return loft ? (spin ? 'down the track and over the bowler' : 'lofted straight drive') : full ? 'straight drive' : 'punch down the ground';
  if (a > -0.9) return short ? (loft ? 'pull' : 'pull shot') : spin && loft ? 'slog sweep' : full ? 'flick' : 'on drive';
  if (a > -1.6) return short ? (loft ? 'hook' : 'pull') : spin ? 'sweep' : 'whip off the pads';
  return loft ? 'scoop fine' : 'leg glance';
}

// A short description of the delivery for commentary: "Good length outside off, 141 km/h".
export function deliveryDesc(del) {
  const p = del.params, len = p.len, x = del.contact ? del.contact.x : p.line;
  const L = len < 1.4 ? (Math.abs(x) < 0.25 ? 'Yorker' : 'Full and fast') : len < 3.5 ? 'Pitched up' : len < 7.5 ? 'Good length' : len < 10 ? 'Short of a length' : 'Bouncer';
  const line = x > 0.55 ? 'wide outside off' : x > 0.2 ? 'outside off' : x < -0.35 ? 'down the leg side' : x < -0.1 ? 'on the pads' : 'on the stumps';
  const sp = Math.round(p.speed * 3.6 * 10) / 10;
  return p.type === 'spin' ? `${L === 'Yorker' ? 'Darted in' : L === 'Bouncer' ? 'Dropped short' : L === 'Good length' ? 'Tossed up' : L} ${line}, ${p.turn > 0 ? 'leg spin' : 'off spin'} at ${Math.round(sp)} km/h` : `${L} ${line}, ${sp.toFixed(1)} km/h`;
}

/* ------------------------------------------------------------------ the computer */
export const LEVELS = {
  easy: { batSd: 0.085, bowlErr: 0.55, pace: [31, 35], label: 'Easy' },
  normal: { batSd: 0.064, bowlErr: 0.38, pace: [33, 38], label: 'Normal' },
  hard: { batSd: 0.05, bowlErr: 0.24, pace: [35, 40], label: 'Hard' },
};

// The computer picks a delivery. over = over number (alternates pace and spin).
export function aiDelivery(level, over, seed) {
  const r = rng(seed), L = LEVELS[level] || LEVELS.normal;
  const type = over % 2 === 0 ? 'pace' : 'spin';
  const pick = r();
  let len = pick < 0.12 ? 1.0 : pick < 0.42 ? 3.5 : pick < 0.86 ? 6 : 9.5;
  if (type === 'spin') len = Math.min(len, 7);
  let line = 0.1 + gauss(r) * 0.17;
  const a = r() * Math.PI * 2, e = Math.abs(gauss(r)) * L.bowlErr * 0.6;
  line += Math.cos(a) * e; len += Math.sin(a) * e * 2;
  const speed = type === 'pace' ? L.pace[0] + r() * (L.pace[1] - L.pace[0]) : 21 + r() * 3.5;
  return { type, line, len, speed, turn: r() < 0.5 ? -1 : 1, seed: (seed * 7 + 13) >>> 0 };
}

// The computer decides how to play a delivery. need = { runs, balls } when chasing, else null.
export function aiShot(del, level, need, seed) {
  const r = rng(seed), L = LEVELS[level] || LEVELS.normal;
  const c = del.contact;
  if (!c || del.tc === null) return null;
  const off = c.x - BAT_X;
  const onStumps = Math.abs(c.x) < 0.25, len = del.params.len;
  // how hard the ball is to score off
  let d = 0.6;
  if (onStumps && len > 3.5 && len < 8) d = 1;
  else if (len < 1.8) d = onStumps ? 1.15 : 0.8;
  else if (len > 9) d = 0.6;
  else if (Math.abs(c.x) > 0.6) d = 0.5;
  if (!onStumps && Math.abs(c.x) > 0.7 && del.stumpsT === null && r() < 0.55) return null; // leave it
  const err = gauss(r) * L.batSd * (0.6 + 0.6 * d);
  let aggr = 0.22;
  if (need) { const rate = need.runs / Math.max(1, need.balls); aggr = clamp(0.15 + rate * 0.22, 0.1, 0.85); }
  if (d >= 1 && r() < 0.55 - aggr * 0.5) return { at: del.tc + gauss(r) * L.batSd * 0.7, dir: null, loft: false, def: true };
  const loft = r() < aggr * (1.1 - d * 0.6);
  const dir = r() < 0.6 ? null : off > 0.5 ? 1 : off < 0 ? -1 : [1, 0, -1][(r() * 3) | 0];
  return { at: del.tc + err, dir, loft };
}
