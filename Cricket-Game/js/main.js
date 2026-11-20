// Kaathu Cricket: menu, toss, ball-by-ball flow (vs computer or online), controls, camera, scoreboard.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makeDelivery, resolve, aiDelivery, aiShot, pathAt, pathDur, deliveryDesc, FIELDS, BOWL_Z, BAT_X, WINDOW, LEVELS, CENTER, BOUNDARY } from './play.js';
import { newMatch, applyBall, curInn, oversText, ballsLeft, batter, bowlerName } from './match.js';
import { buildGround, animateStumps } from './ground.js';
import { Person, KITS } from './people.js';
import { loadCricketers } from './models.js';
import { CricketAudio } from './audio.js';
import { Room, cleanCode, cleanName } from './net.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const LOW = isTouch || params.has('low');
const BOT = params.has('bot'); // testing aid: the computer also plays for you
const TS = clamp(+params.get('speed') || 1, 0.2, 8);
document.body.classList.toggle('touch', isTouch);

/* ------------------------------------------------------------------ settings */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};
const S = Object.assign({ name: '', overs: 2, wickets: 3, toss: 'toss', level: 'normal' }, store.get('cricket-settings', {}));
if (![1, 2, 3, 5].includes(S.overs)) S.overs = 2;
if (![1, 2, 3, 5].includes(S.wickets)) S.wickets = 3;
if (!['toss', 'bat', 'bowl'].includes(S.toss)) S.toss = 'toss';
if (!LEVELS[S.level]) S.level = 'normal';
S.name = cleanName(S.name);
if (['bat', 'bowl'].includes(params.get('first'))) S.toss = params.get('first'); // testing aid: skip the toss
const save = () => store.set('cricket-settings', S);
const RECORD = store.get('cricket-record', { played: 0, won: 0, high: 0 });

/* ------------------------------------------------------------------ renderer + scene */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.3 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xcfe8ff);
scene.fog = new THREE.Fog(0xcfe8ff, 250, 700);
const camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.1, 1500);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a6a3a, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.6);
sun.position.set(30, 60, -20); sun.target.position.set(0, 0, -10);
if (!LOW) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 160 }); sun.shadow.bias = -0.0004; }
scene.add(sun, sun.target);
const ground = buildGround(LOW);
scene.add(ground.group);

// ball, its shadow and the bowling target marker
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, emissive: 0x444444 }));
ballMesh.castShadow = !LOW;
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.07, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
const marker = new THREE.Group();
marker.add(new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false })));
marker.add(new THREE.Mesh(new THREE.CircleGeometry(0.09, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false })));
marker.position.y = 0.03; marker.visible = false; marker.renderOrder = 5; marker.children.forEach((c) => (c.renderOrder = 5));
// a faint trail behind the ball, like TV graphics
const TRAIL = 18, trailPos = new Float32Array(TRAIL * 3), trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
trail.frustumCulled = false; trail.visible = false;
let trailN = 0;
function trailPush(x, y, z) {
  if (trailN < TRAIL) trailN++;
  trailPos.copyWithin(3, 0, (TRAIL - 1) * 3); trailPos[0] = x; trailPos[1] = y; trailPos[2] = z;
  for (let i = trailN; i < TRAIL; i++) { trailPos[i * 3] = x; trailPos[i * 3 + 1] = y; trailPos[i * 3 + 2] = z; }
  trailGeo.attributes.position.needsUpdate = true;
}
scene.add(ballMesh, ballShadow, marker, trail);

const audio = new CricketAudio();

/* ------------------------------------------------------------------ game state */
const G = {
  state: 'menu', online: false, me: 0, names: ['You', 'Computer'], match: null, ball: null, pending: null,
  people: null, fieldType: 'pace', dir: null, loft: false, bowlType: 'pace', aim: { x: 0.1, len: 6 }, meterT: 0,
  timers: [], camLook: new THREE.Vector3(0, 1, -4), camPos: new THREE.Vector3(0, 4.6, -33), hint: true, replay: null, signal: null, cheerT: -9,
};
window.__cricket = G;
let room = null;
const now = () => performance.now() / 1000;
let clock = 0; // game time in seconds (scaled for testing)
const after = (secs, fn) => G.timers.push({ at: clock + secs, fn });

/* ------------------------------------------------------------------ people */
function disposePeople() {
  if (!G.people) return;
  for (const p of G.people.all) scene.remove(p.root);
  G.people = null;
}
function buildPeople(batIdx) {
  disposePeople();
  const bk = KITS[batIdx], fk = KITS[1 - batIdx];
  const batter = new Person(bk, { pads: true, helmet: true, gloves: 0xf4f4f4, bat: true, low: LOW, skin: 1 });
  const runner = new Person(bk, { pads: true, helmet: true, gloves: 0xf4f4f4, bat: true, low: LOW, skin: 2 });
  const bowler = new Person(fk, { low: LOW, skin: 0 });
  const fielders = FIELDS.pace.map((f, k) => new Person(fk, { low: LOW, skin: k, gloves: k === 0 ? 0xf2f2f2 : null, helmet: k === 0 && false }));
  const umpire = new Person(fk, { white: true, hat: true, low: LOW, skin: 3 });
  const all = [batter, runner, bowler, umpire, ...fielders];
  for (const p of all) scene.add(p.root);
  G.people = { batter, runner, bowler, fielders, umpire, all };
  resetPeople();
}
function face(p, x, z) { p.root.rotation.y = Math.atan2(x - p.root.position.x, z - p.root.position.z); }
function resetPeople() {
  const P = G.people;
  if (!P) return;
  P.batter.root.position.set(BAT_X, 0, -0.95); P.batter.root.rotation.y = Math.PI / 2; P.batter.batStance();
  P.runner.root.position.set(2.3, 0, BOWL_Z + 1.3); P.runner.root.rotation.y = 0; P.runner.holdBat();
  P.umpire.root.position.set(-2.1, 0, BOWL_Z - 1.2); P.umpire.root.rotation.y = 0; P.umpire.stand();
  P.bowler.root.position.set(-0.7, 0, BOWL_Z - 13); P.bowler.root.rotation.y = 0; P.bowler.stand();
  const set = FIELDS[G.fieldType];
  P.fielders.forEach((f, k) => { f.root.position.set(set[k][0], 0, set[k][1]); face(f, 0, -2); f.stand(); });
  animateStumps(ground.stumpsBat, -1); animateStumps(ground.stumpsBowl, -1);
}

/* ------------------------------------------------------------------ roles */
const inn = () => curInn(G.match);
const iBat = () => !G.match.finished && inn().bat === G.me;
const iBowl = () => !G.match.finished && inn().bowl === G.me;
const aiIdx = () => (G.online ? -1 : 1); // the computer's player index in single player
const isAI = (idx) => !G.online && idx === 1;
const humanBats = () => iBat() && !BOT;
const humanBowls = () => iBowl() && !BOT;
function need() {
  if (G.match.cur !== 1) return null;
  return { runs: G.match.target - inn().runs, balls: ballsLeft(G.match) };
}

/* ------------------------------------------------------------------ match flow */
function beginMatch(batFirst) {
  G.match = newMatch({ overs: S.overs, wickets: S.wickets }, G.names, batFirst);
  if (G.online && room) G.match.cfg = { overs: room.info.overs, wickets: room.info.wickets };
  G.state = 'play';
  G.pending = null; G.ball = null;
  hideOverlays();
  $('hud').classList.remove('hidden');
  document.body.classList.add('playing');
  G.fieldType = 'pace';
  buildPeople(batFirst);
  const I = inn();
  banner(`${G.names[I.bat]} BAT FIRST`, `${G.match.cfg.overs} over${G.match.cfg.overs > 1 ? 's' : ''} · ${G.match.cfg.wickets} wicket${G.match.cfg.wickets > 1 ? 's' : ''}`);
  audio.cheer(0.5, 2);
  after(2.2, nextBall);
  updateHUD();
}

function nextBall() {
  if (!G.match || G.match.finished) return;
  G.ball = null; trailN = 0; trail.visible = false;
  if (G.rebuild) { G.rebuild = false; buildPeople(inn().bat); } // the realistic players finished loading
  resetPeople();
  setDir(null); setLoft(false);
  const over = Math.floor(inn().balls / 6);
  setPanels();
  if (iBowl() && !BOT) {
    G.state = 'aim'; marker.visible = true; G.meterT = 0;
    setHint(isTouch ? 'Drag on the pitch to aim, pick a delivery, then tap BOWL. Tap when the needle is in the middle for accuracy.' : 'Move the mouse to aim where the ball pitches. Click (or press Space) to bowl: the closer the needle is to the middle, the more accurate.');
  } else if (isAI(inn().bowl) || (iBowl() && BOT)) {
    G.state = 'wait';
    setHint(iBat() ? (isTouch ? 'Tap HIT as the ball reaches you. Pick a direction and LOFT first.' : 'Press Space or click as the ball reaches you. Arrows pick the direction, hold Shift to hit it in the air.') : '');
    after(1.1, () => { const lvl = isAI(inn().bowl) ? S.level : 'hard'; startDelivery(aiDelivery(lvl, over, (Math.random() * 1e9) | 0), 1.4); });
  } else {
    // the other human bowls
    G.state = 'wait';
    setHint(isTouch ? 'Tap HIT as the ball reaches you. Pick a direction and LOFT first.' : 'Press Space or click as the ball reaches you. Arrows pick the direction, hold Shift to hit it in the air.');
    $('waitmsg').textContent = `${G.names[inn().bowl]} is getting ready to bowl…`;
    if (G.pending) { const p = G.pending; G.pending = null; startDelivery(p.p, 1.4); }
  }
  setPanels();
  updateHUD();
}

// A delivery: params known, the run-up starts now, the ball is released `runup` seconds later.
function startDelivery(p, runup) {
  marker.visible = false; $('waitmsg').textContent = '';
  if (G.online && iBowl()) room.send({ t: 'bowl', n: G.match.ballNo, p }); // the batter's screen plays the same delivery
  if (p.type !== G.fieldType) { G.fieldType = p.type; resetPeople(); }
  const del = makeDelivery(p);
  G.ball = { p, del, res: null, shot: null, t0: clock + runup, shift: 0, n: G.match.ballNo, events: {}, decidedAt: null };
  G.state = 'ball';
  // the computer batting decides now (it plays the ball when it arrives)
  if (isAI(inn().bat) || (iBat() && BOT)) decide(aiShot(del, isAI(inn().bat) ? S.level : 'hard', need(), (p.seed * 31 + 7) >>> 0));
  setPanels();
}

// The batter's shot is known (null = no swing): work out what happens.
function decide(shot, remote) {
  const B = G.ball;
  if (!B || B.res) return;
  B.shot = shot;
  B.res = resolve(B.del, shot, (B.p.seed * 131 + 17) >>> 0);
  if (remote) {
    B.res.outcome = remote.outcome; // the batter's screen decides the score, so both screens agree
    const t = clock - B.t0;
    if (B.del.tc !== null && t > B.del.tc) B.shift = t - B.del.tc; // we froze the ball at the bat while waiting
  }
  B.decidedAt = clock - B.t0;
  if (G.online && iBat()) room.send({ t: 'play', n: B.n, shot, outcome: B.res.outcome });
}

function ballEndTime(B) {
  const r = B.res, tc = B.del.tc ?? 0.6;
  return r.kind === 'hit' ? tc + B.shift + r.endT : r.endT + B.shift;
}

function finishBall() {
  const B = G.ball, o = B.res.outcome;
  G.replay = null; $('replay').classList.remove('show');
  const kind = applyBall(G.match, o);
  G.ball = null;
  updateHUD();
  if (kind === 'match') return after(1.2, showResult);
  if (kind === 'innings') return after(0.6, showBreak);
  if (kind === 'over') { banner('END OF OVER', `${G.names[inn().bat]} ${inn().runs}/${inn().wkts}`); return after(1.6, nextBall); }
  after(0.4, nextBall);
}

/* ------------------------------------------------------------------ controls */
function hitPressed() {
  if (!humanBats() || G.state !== 'ball' || !G.ball || G.ball.res) return;
  const t = clock - G.ball.t0;
  if (t < -0.25) return; // still in the run-up: ignore
  const def = G.dir === 'def';
  decide({ at: t, dir: def ? null : G.dir, loft: !def && (G.loft || keys.has('ShiftLeft') || keys.has('ShiftRight')), def });
}
function bowlPressed() {
  if (!humanBowls() || G.state !== 'aim') return;
  const needle = Math.sin(G.meterT * 5.5), acc = 1 - Math.abs(needle);
  const seed = (Math.random() * 1e9) | 0;
  const err = (1 - acc) * 0.95, a = Math.random() * Math.PI * 2;
  const type = G.bowlType === 'pace' ? 'pace' : 'spin';
  const p = {
    type, line: G.aim.x + Math.cos(a) * err * 0.5, len: G.aim.len + Math.sin(a) * err * 1.4,
    speed: type === 'pace' ? 33 + acc * 4 + Math.random() * 1.5 : 21 + Math.random() * 3, turn: G.bowlType === 'leg' ? 1 : -1, seed,
  };
  setHint(acc > 0.85 ? 'Right on target!' : acc > 0.55 ? 'Close to target' : 'Wayward…');
  startDelivery(p, 1.4);
}
function setDir(d) { G.dir = d; document.querySelectorAll('[data-dir]').forEach((b) => b.classList.toggle('on', String(d) === b.dataset.dir)); }
function setLoft(on) { G.loft = on; $('b-loft').classList.toggle('on', on); }
function setBowlType(t) { G.bowlType = t; document.querySelectorAll('[data-bt]').forEach((b) => b.classList.toggle('on', b.dataset.bt === t)); }

const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyM') audio.toggle();
  if (e.code === 'Space' || e.code === 'Enter') { if (G.replay) endReplay(); else if (G.state === 'aim') bowlPressed(); else hitPressed(); }
  if (humanBats()) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') setDir(1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') setDir(-1);
    if (e.code === 'ArrowUp' || e.code === 'KeyW') setDir(0);
    if (e.code === 'ArrowDown' || e.code === 'KeyS') setDir(G.dir === 'def' ? null : 'def');
    if (e.code === 'KeyL') setLoft(!G.loft);
  }
  if (G.state === 'aim') {
    if (e.code === 'Digit1') setBowlType('pace');
    if (e.code === 'Digit2') setBowlType('off');
    if (e.code === 'Digit3') setBowlType('leg');
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function aimFromPointer(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(plane, hitP)) { G.aim.x = clamp(hitP.x, -1.5, 1.5); G.aim.len = clamp(-hitP.z, 0.3, 11.5); }
}
canvas.addEventListener('pointermove', (e) => { if (G.state === 'aim' && (e.pointerType === 'mouse' || e.buttons)) aimFromPointer(e); });
canvas.addEventListener('pointerdown', (e) => {
  audio.init();
  if (G.replay) { endReplay(); return; }
  if (G.state === 'aim') { aimFromPointer(e); if (e.pointerType === 'mouse') bowlPressed(); }
  else hitPressed();
});
document.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); const v = b.dataset.dir; setDir(v === 'null' ? null : v === 'def' ? 'def' : +v); }));
$('b-loft').addEventListener('pointerdown', (e) => { e.stopPropagation(); setLoft(!G.loft); });
$('b-hit').addEventListener('pointerdown', (e) => { e.stopPropagation(); hitPressed(); });
document.querySelectorAll('[data-bt]').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); setBowlType(b.dataset.bt); }));
$('b-bowl').addEventListener('pointerdown', (e) => { e.stopPropagation(); bowlPressed(); });

/* ------------------------------------------------------------------ per-frame animation */
const tmp = {}, tmp2 = {};
function ballPos(B, t, out) {
  const del = B.del, tc = del.tc ?? 99, sh = B.shift;
  const P = G.people;
  if (t < 0) { // in the bowler's hand
    const b = P.bowler.root.position;
    out.x = b.x + 0.25; out.y = 1.9; out.z = b.z; return out;
  }
  const r = B.res;
  if (!r) return pathAt(del.path, G.online && !iBat() ? Math.min(t, tc) : t, out); // waiting for the other screen: hold at the bat
  if (r.kind === 'hit') {
    if (t < tc + sh) return pathAt(del.path, Math.min(t, tc), out);
    const tau = t - tc - sh;
    if (r.outcome.out === 'caught' && tau >= r.catchT) { const f = P.fielders[r.fielder.idx] || P.bowler; const fp = f.root.position; out.x = fp.x; out.y = 1.4; out.z = fp.z; return out; }
    if (r.fielder && !r.outcome.out && !r.outcome.boundary && tau >= r.ballEnd) {
      const f = r.fielder.idx === 10 ? P.bowler : P.fielders[r.fielder.idx], fp = f.root.position;
      const k = clamp((tau - r.ballEnd - 0.35) / Math.max(0.2, r.throwT - 0.45), 0, 1);
      const tz = Math.hypot(fp.x, fp.z) < Math.hypot(fp.x, fp.z - BOWL_Z) ? 0.6 : BOWL_Z - 0.6;
      out.x = fp.x * (1 - k); out.z = fp.z + (tz - fp.z) * k; out.y = 1.5 + Math.sin(k * Math.PI) * 4 - k * 0.6;
      return out;
    }
    return pathAt(r.ball, tau, out);
  }
  const td = t >= tc + sh ? t - sh : Math.min(t, tc);
  if (r.kind === 'bowled' && td >= del.stumpsT) return pathAt(del.path, del.stumpsT, out);
  // the keeper takes it
  const kz = FIELDS[G.fieldType][0][1] - 0.4;
  pathAt(del.path, td, out);
  if (out.z > kz) { for (let s = td; s > 0; s -= 0.01) { pathAt(del.path, s, out); if (out.z <= kz) break; } out.y = Math.max(out.y, 0.6); }
  return out;
}

function animate(dt) {
  const B = G.replay ? G.replay.B : G.ball, P = G.people;
  if (!P) return;
  // bowler: run-up, action, follow-through
  const bt = G.replay ? G.replay.t : B ? clock - B.t0 : -9;
  const bw = P.bowler;
  if (B && bt < 0.9) {
    const runStart = -1.4, z0 = BOWL_Z - 13, z1 = BOWL_Z - 0.4;
    if (bt < -0.3) { const k = clamp((bt - runStart) / (-0.3 - runStart), 0, 1); bw.root.position.set(-0.7, 0, z0 + (z1 - 0.8 - z0) * k); bw.run(dt, 6); }
    else { const k = clamp((bt + 0.3) / 0.55, 0, 1); bw.root.position.z = z1 - 0.8 + k * 0.8 + Math.max(0, bt) * 3; bw.bowl(k); }
    bw.root.rotation.y = 0;
  } else if (!B) bw.stand();
  // keeper crouches, fielders walk in a step as the bowler runs up
  P.fielders.forEach((f, k) => { if (!(B && B.res && B.res.fielder && B.res.fielder.idx === k && bt > (B.del.tc ?? 0))) { if (B && bt > -0.6 && bt < 1.2) f.crouch(k === 0 ? 1.4 : 0.5); else if (k === 0) f.crouch(1.4); else f.stand(); } });
  // batter: back-lift, footwork (forward to full balls, back to short ones) and the shot
  const bat = P.batter;
  let swingA = -0.35, swingDir = 0, tilt = 0;
  if (B && !(B.res && B.res.runAnim && bt > (B.del.tc ?? 0) + B.shift + 0.3)) {
    if (bt > -0.4) swingA = -1.2;
    const len = B.p.len, tc = B.del.tc ?? 0.6;
    if (B.shot && B.res) {
      const at = B.shot.at + B.shift, k = clamp((bt - (at - 0.16)) / 0.38, 0, 1);
      const step = clamp((bt - (at - 0.42)) / 0.22, 0, 1);
      bat.root.position.z = -0.95 + (len < 5 ? -0.38 : len > 8 ? 0.3 : -0.1) * step;
      bat.root.position.x = BAT_X + (len < 5 ? 0.12 : 0) * step;
      if (B.shot.def) { if (bt > at - 0.16) swingA = -1.0 + Math.min(1, k * 1.6) * 1.25; }
      else if (bt > at - 0.16) swingA = -2.0 + k * 4.0;
      const phi = B.res.kind === 'hit' ? B.res.phi : B.shot.dir === 1 ? 0.6 : B.shot.dir === -1 ? -0.7 : 0;
      swingDir = -phi;
      if (len > 7.5 && Math.abs(phi) > 0.45 && !B.shot.def) tilt = (phi > 0 ? 1 : -1) * 1.1 * Math.sin(k * Math.PI); // horizontal bat: pull / cut
    } else if (bt > tc - 0.1 && B.res) bat.root.position.z = -0.95; // left alone
  }
  bat.setSwing(swingA, swingDir, tilt);
  // umpire's signal and the crowd jumping after big moments
  if (G.signal && clock < G.signal.until) P.umpire.signal(G.signal.kind, clock); else if (G.signal) { G.signal = null; P.umpire.stand(); }
  const ct = clock - G.cheerT;
  ground.fans.position.y = ct < 2.6 ? Math.abs(Math.sin(ct * 13)) * 0.35 * (1 - ct / 2.6) : 0;
  // ball
  if (B) {
    ballPos(B, bt, tmp);
    ballMesh.position.set(tmp.x, tmp.y, tmp.z); ballMesh.visible = true;
    ballShadow.position.set(tmp.x, 0.015, tmp.z); ballShadow.visible = bt >= 0;
    trail.visible = bt >= 0; if (bt >= 0) trailPush(tmp.x, tmp.y, tmp.z); else trailN = 0;
    events(B, bt, dt, !G.replay);
    if (G.replay) { G.replay.t += dt * G.replay.speed; if (G.replay.t >= G.replay.end) endReplay(); }
  } else { ballMesh.visible = false; ballShadow.visible = false; trail.visible = false; }
}

// Sounds, fielder runs, batters running, stumps and banners, in time with the ball.
function events(B, t, dt, live) {
  const P = G.people, del = B.del, r = B.res, ev = live ? B.events : (B.revents = B.revents || {}), tc = del.tc ?? 0.6;
  if (live && !ev.speed && t >= 0) { ev.speed = 1; speedGun(B); }
  if (!ev.bounce && t >= del.bounceAt.t) { ev.bounce = 1; audio.bounce(); }
  if (!r) { if (live && humanBats() && t > tc + WINDOW + 0.05) decide(null); return; }
  if (!ev.timing && (t >= tc + B.shift || r.kind !== 'hit') && B.decidedAt !== null) {
    ev.timing = 1;
    if (live && (iBat() || !G.online)) showTiming(r);
    if (r.kind === 'hit') { if (r.edged) audio.edge(); else audio.bat(r.q); }
  }
  const tau = t - tc - B.shift;
  if (r.kind === 'hit') {
    // the fielder who goes for it
    if (r.fielder) {
      const f = r.fielder.idx === 10 ? P.bowler : P.fielders[r.fielder.idx];
      if (f && tau > 0) {
        const k = clamp((tau - 0.4) / Math.max(0.1, r.fielder.t - 0.4), 0, 1);
        const tx = r.fielder.x, tz = r.fielder.z, sx = r.fielder.fx, sz = r.fielder.fz;
        f.root.position.set(sx + (tx - sx) * k, 0, sz + (tz - sz) * k);
        if (k < 1) { face(f, tx, tz); f.run(dt, 6); }
        else if (r.outcome.out === 'caught') { f.catchPose(1); face(f, 0, -10); }
        else { f.throwPose(clamp((tau - r.ballEnd) / 0.5, 0, 1)); face(f, 0, -10); }
      }
    }
    // batters running
    if (r.runAnim > 0 && tau > 0.3) {
      const k = clamp((tau - 0.3) / 2.7, 0, r.runAnim), leg = Math.floor(k), f = k - leg, there = leg % 2 === 0 ? f : 1 - f;
      const zA = -0.95, zB = BOWL_Z + 1.3;
      if (k < r.runAnim) {
        P.batter.root.position.set(BAT_X + 0.6 * there, 0, zA + (zB - zA) * there); P.batter.root.rotation.y = leg % 2 ? 0 : Math.PI; P.batter.run(dt, 7);
        P.runner.root.position.set(2.3 - 1.8 * there, 0, zB + (zA - zB) * there); P.runner.root.rotation.y = leg % 2 ? Math.PI : 0; P.runner.run(dt, 7);
      }
    }
    const evT = r.outcome.boundary ? pathDur(r.ball) : r.outcome.out === 'caught' ? r.catchT : r.ballEnd + (r.throwT || 0) * 0.6;
    if (live && !ev.result && tau >= evT) { ev.result = 1; resultMoment(r, B); }
  } else {
    if (r.kind === 'bowled' && t >= del.stumpsT + B.shift) {
      if (!ev.stumps) { ev.stumps = 1; audio.stumps(); }
      animateStumps(ground.stumpsBat, t - del.stumpsT - B.shift);
    }
    const evT = r.kind === 'bowled' ? del.stumpsT + B.shift + 0.15 : tc + B.shift + 0.35;
    if (live && !ev.result && t >= evT) { ev.result = 1; resultMoment(r, B); }
  }
  if (live && !ev.done && t >= ballEndTime(B)) { ev.done = 1; if (!startReplay(B)) finishBall(); }
}

// Slow-motion replay of wickets and sixes from a different camera (tap or Space skips it).
function startReplay(B) {
  const r = B.res, o = r.outcome, tc = B.del.tc ?? 0.6;
  if (!(o.out || o.boundary === 6) || TS > 1.5) return false;
  let from = -0.35, end, cam, speed = 0.35;
  if (r.kind === 'bowled') { end = B.del.stumpsT + B.shift + 0.7; cam = 'side'; }
  else if (r.edged || o.by === 'keeper' || o.by === 'slip') { from = tc - 0.5; end = tc + B.shift + r.catchT + 0.6; cam = 'side'; }
  else { from = tc - 0.45; end = tc + B.shift + Math.min(o.boundary ? pathDur(r.ball) : r.catchT, 5) + 0.5; cam = 'behind'; speed = 0.5; }
  G.replay = { B, t: from, end, speed, cam };
  G.state = 'replay';
  resetPeople(); trailN = 0;
  $('replay').classList.add('show');
  return true;
}
function endReplay() {
  if (!G.replay) return;
  const B = G.replay.B;
  G.replay = null; $('replay').classList.remove('show');
  resetPeople(); animateStumps(ground.stumpsBat, -1);
  G.ball = B; G.state = 'ball';
  finishBall();
}

function speedGun(B) {
  const p = B.p, e = $('speed');
  e.innerHTML = `<b>${(p.speed * 3.6).toFixed(1)}</b> km/h <span>${p.type === 'pace' ? 'PACE' : p.turn > 0 ? 'LEG SPIN' : 'OFF SPIN'}</span>`;
  e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
}

// TV-style commentary for the ball that just happened.
function commentary(r, B) {
  const o = r.outcome, who = batter(G.match).name, shot = o.shot || r.shotName || 'shot';
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  let line;
  if (o.out === 'bowled') line = r.swing ? `${who} plays all round it and the stumps are rattled. BOWLED!` : `${who} leaves it and loses the off stump. BOWLED!`;
  else if (o.out === 'caught') line = `${cap(shot)}... straight to ${o.by}, and it's taken! ${who} has to go.`;
  else if (o.boundary === 6) line = `${cap(shot)}, and that's gone all the way. SIX!`;
  else if (o.boundary === 4) line = `${cap(shot)}, races away to the rope for FOUR.`;
  else if (o.wide) line = 'Too wide, the umpire stretches his arms. Wide ball.';
  else if (o.dropped) line = `${cap(shot)}, chance! Put down by ${o.by}.`;
  else if (o.runs) line = o.misfield ? `${cap(shot)}, misfield in the deep, they take ${o.runs}.` : `${cap(shot)}, ${o.runs === 1 ? 'they take a quick single' : o.runs === 2 ? 'they come back for two' : 'good running, three'}.`;
  else if (r.kind === 'hit') line = r.def ? 'Solidly defended back down the pitch.' : `${cap(shot)}, straight to the fielder. No run.`;
  else line = r.swing ? 'Beaten! Past the outside edge.' : 'Left alone, through to the keeper.';
  const e = $('comm');
  e.innerHTML = `<span>${esc(deliveryDesc(B.del))}</span> ${esc(line)}`;
  e.classList.remove('show'); void e.offsetWidth; e.classList.add('show');
}

function resultMoment(r, B) {
  const o = r.outcome;
  commentary(r, B);
  if (o.out) G.signal = { kind: 'out', until: clock + 2.4 };
  else if (o.boundary) G.signal = { kind: o.boundary === 6 ? 'six' : 'four', until: clock + 2.4 };
  else if (o.wide) G.signal = { kind: 'wide', until: clock + 1.8 };
  if (o.out || o.boundary) G.cheerT = clock;
  if (o.out) { banner(o.out === 'bowled' ? 'BOWLED!' : 'CAUGHT!', o.by ? `by ${o.by}` : ''); audio.cheer(0.9, 2.5); if (o.out === 'caught') audio.catchSmack(); }
  else if (o.boundary) { banner(o.text, o.boundary === 6 ? 'Out of the ground!' : 'Races to the rope'); audio.cheer(o.boundary === 6 ? 1 : 0.75, 3); }
  else if (o.wide) banner('WIDE', '+1 run, ball again');
  else if (o.runs) toast(o.text);
  else if (r.dropped) { toast('DROPPED!'); audio.groan(); }
  else toast(o.text);
}

/* ------------------------------------------------------------------ camera */
function updateCamera(dt) {
  const B = G.ball;
  let pos, look, fov;
  const live = !G.replay && B && B.res && B.res.kind === 'hit' && clock - B.t0 > (B.del.tc ?? 0) + B.shift + 0.25 && !B.res.edged && !B.res.def;
  const rp = G.replay, dbg = params.get('cam');
  if (dbg === 'bat') { pos = [3.2, 1.4, -0.2]; look = [BAT_X, 1.0, -0.95]; fov = 40; }
  else if (dbg === 'front') { pos = [BAT_X, 1.5, -5]; look = [BAT_X, 1.0, -0.95]; fov = 40; }
  else if (rp && rp.cam === 'side') { pos = [9, 1.4, -2.5]; look = [0, 0.6, -1.5]; fov = 30; }
  else if (rp) { pos = [1.5, 3.2, 7]; look = [ballMesh.position.x, ballMesh.position.y, ballMesh.position.z]; fov = 40; }
  else if (G.state === 'aim') { pos = [0, 6.5, -31]; look = [0, 0, -5.5]; fov = 28; }
  else if (live) {
    pos = [ballMesh.position.x * 0.25, 30, -78]; look = [ballMesh.position.x, ballMesh.position.y * 0.5, ballMesh.position.z]; fov = 34;
  } else if (G.state === 'menu') {
    const a = clock * 0.05; pos = [Math.sin(a) * 70, 22, -10 + Math.cos(a) * 70]; look = [0, 0, -10]; fov = 40;
  } else { pos = [0, 5.2, -34]; look = [0, 0.95, -1.6]; fov = 17; } // TV broadcast view from behind the bowler, zoomed on the batter
  const k = G.replay ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * (live ? 4 : 3));
  G.camPos.lerp(tmpV.set(...pos), k); G.camLook.lerp(tmpV.set(...look), live ? 1 - Math.exp(-dt * 8) : k);
  camera.position.copy(G.camPos); camera.lookAt(G.camLook);
  camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix();
  if (G.state === 'aim') marker.position.set(G.aim.x, 0.03, -G.aim.len);
  // keep the ball visible on wide shots: draw it bigger the further away it is
  const s = Math.max(1, camera.position.distanceTo(ballMesh.position) * (camera.fov / 17) / 26);
  ballMesh.scale.setScalar(s); ballShadow.scale.setScalar(s);
}
const tmpV = new THREE.Vector3();

/* ------------------------------------------------------------------ HUD */
function updateHUD() {
  const m = G.match;
  if (!m) return;
  const I = inn(), names = G.names;
  $('sc-team').textContent = names[I.bat];
  $('sc-dot').style.background = '#' + KITS[I.bat].shirt.toString(16).padStart(6, '0');
  $('sc-score').textContent = `${I.runs}/${I.wkts}`;
  $('sc-overs').textContent = `(${oversText(I.balls)}/${m.cfg.overs})`;
  const crr = I.balls ? (I.runs / I.balls) * 6 : 0;
  if (m.cur === 1 && !m.finished) {
    const need = Math.max(0, m.target - I.runs), left = ballsLeft(m);
    $('sc-line').textContent = `Need ${need} from ${left} ball${left === 1 ? '' : 's'} · RRR ${left ? ((need / left) * 6).toFixed(2) : '-'}`;
  } else $('sc-line').textContent = `1st innings · CRR ${crr.toFixed(2)}`;
  if (!m.finished) {
    const b = batter(m), bw = I.bowling;
    $('sc-bat').innerHTML = `<b>${esc(b.name)}*</b> ${b.runs} <small>(${b.balls})</small>`;
    $('sc-bowl').innerHTML = `<b>${esc(bowlerName(m))}</b> ${bw.wkts}-${bw.runs} <small>(${oversText(bw.balls)})</small>`;
  }
  $('over').innerHTML = I.over.map((x) => `<i class="b${x === 'W' ? ' w' : x === '4' || x === '6' ? ' four' : x === 'Wd' ? ' wd' : ''}">${x}</i>`).join('');
  $('role').textContent = G.online ? (iBat() ? 'YOU ARE BATTING' : 'YOU ARE BOWLING') : iBat() ? 'YOU ARE BATTING' : 'YOU ARE BOWLING';
}
function setPanels() {
  const play = G.state !== 'menu' && G.match && !G.match.finished;
  $('bat-panel').classList.toggle('hidden', !(play && humanBats()));
  $('bowl-panel').classList.toggle('hidden', !(play && humanBowls() && G.state === 'aim'));
}
function setHint(t) { $('hint').textContent = G.hint ? t : ''; }
let toastT = 0;
function toast(t) { const e = $('toast'); e.textContent = t; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); toastT = 1.5; }
function banner(t, sub) { $('ban-t').textContent = t; $('ban-s').textContent = sub || ''; const b = $('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
function showTiming(r) {
  const map = { perfect: 'PERFECT TIMING', early: 'A LITTLE EARLY', late: 'A LITTLE LATE', edged: 'EDGED!', 'too early': 'TOO EARLY', 'too late': 'TOO LATE', left: 'LEFT ALONE', 'out of reach': 'OUT OF REACH' };
  const e = $('timing'); e.textContent = map[r.timing] || ''; e.className = r.timing === 'perfect' ? 'good' : r.timing === 'early' || r.timing === 'late' ? 'ok' : 'bad';
  void e.offsetWidth; e.classList.add('show');
}

/* ------------------------------------------------------------------ overlays */
function hideOverlays() { for (const id of ['toss', 'brk', 'res']) $(id).classList.add('hidden'); }
function wagonWheel(canvas, I) {
  const g = canvas.getContext('2d'), W = canvas.width, H = canvas.height, R = W * 0.46, s = R / BOUNDARY;
  const cx = W / 2, cy = H / 2;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#3f8a32'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; g.stroke();
  g.setLineDash([4, 4]); g.beginPath(); g.arc(cx, cy, 30 * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.fillStyle = '#d9c38f'; g.fillRect(cx - 1.6 * s, cy - 11 * s, 3.2 * s, 22 * s);
  const bx = cx, by = cy + (0 - CENTER.z) * s;
  for (const sh of I.shots) {
    const x = cx - sh.x * s, y = cy + (sh.z - CENTER.z) * s;
    g.strokeStyle = sh.out ? '#ff4a5a' : sh.runs === 6 ? '#ffd23f' : sh.runs === 4 ? '#4dd2ff' : sh.runs > 0 ? '#ffffff' : 'rgba(255,255,255,0.35)';
    g.lineWidth = sh.runs >= 4 ? 3 : 2;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(x, y); g.stroke();
  }
  g.fillStyle = '#fff'; g.font = '600 11px Rubik, sans-serif'; g.textAlign = 'center';
  g.fillText('BOWLER END', cx, cy - R + 14);
}

function showBreak() {
  const m = G.match, a = m.innings[0];
  G.state = 'break';
  setPanels();
  $('brk-t').textContent = 'INNINGS BREAK';
  $('brk-s').innerHTML = `<b>${esc(G.names[a.bat])}</b> scored <b>${a.runs}/${a.wkts}</b> (${oversText(a.balls)} ov)<br><b>${esc(G.names[a.bowl])}</b> needs <b>${m.target}</b> to win from ${m.cfg.overs * 6} balls`;
  $('brk-ww-l').textContent = `${G.names[a.bat]}'s shots`;
  wagonWheel($('brk-ww'), a);
  $('brk').classList.remove('hidden');
  buildPeople(m.innings[1].bat);
  let left = 5;
  $('brk-go').textContent = `CONTINUE (${left})`;
  const tick = () => { left--; if (G.state !== 'break') return; if (left <= 0) { $('brk').classList.add('hidden'); G.state = 'play'; nextBall(); } else { $('brk-go').textContent = `CONTINUE (${left})`; after(1, tick); } };
  after(1, tick);
  $('brk-go').onclick = () => { if (G.state !== 'break') return; $('brk').classList.add('hidden'); G.state = 'play'; nextBall(); };
}
function showResult() {
  const m = G.match, R = m.result;
  G.state = 'over';
  setPanels();
  const won = R.winner === G.me, tied = R.winner === -1;
  if (!G.online) {
    RECORD.played++; if (won) RECORD.won++; RECORD.high = Math.max(RECORD.high, m.innings.find((i) => i.bat === 0).runs);
    store.set('cricket-record', RECORD);
  }
  $('res-t').textContent = tied ? 'MATCH TIED' : won ? 'YOU WON!' : 'YOU LOST';
  $('res-s').textContent = R.text + (R.margin ? ' · ' + R.margin : '');
  const mine = m.innings.find((i) => i.bat === G.me) || m.innings[0];
  $('res-ww-l').textContent = `${G.names[mine.bat]}'s shots · top scorer ${[...m.innings[0].batters, ...m.innings[1].batters].sort((x, y) => y.runs - x.runs)[0].name} ${[...m.innings[0].batters, ...m.innings[1].batters].sort((x, y) => y.runs - x.runs)[0].runs}`;
  wagonWheel($('res-ww'), mine);
  $('res-table').innerHTML = '<tr><th>Team</th><th>Score</th><th>Overs</th><th>4s</th><th>6s</th></tr>' + m.innings.map((i) =>
    `<tr class="${i.bat === R.winner ? 'win' : ''}"><td><i class="dot" style="background:#${KITS[i.bat].shirt.toString(16).padStart(6, '0')}"></i>${esc(G.names[i.bat])}</td><td><b>${i.runs}/${i.wkts}</b></td><td>${oversText(i.balls)}</td><td>${i.fours}</td><td>${i.sixes}</td></tr>`).join('');
  $('res-again').classList.toggle('hidden', G.online && !room?.isHost);
  $('res-again').textContent = G.online ? 'REMATCH' : 'PLAY AGAIN';
  $('res-wait').textContent = G.online && !room?.isHost ? `Waiting for ${G.names[0]} to start a rematch…` : '';
  $('res').classList.remove('hidden');
  audio.cheer(won ? 1 : 0.5, 3);
}

/* ------------------------------------------------------------------ toss */
// caller: who calls (0/1). chooser decides after. In single player the human always calls.
function tossUI(view, text, buttons) {
  $('toss').classList.remove('hidden');
  $('toss-t').textContent = text;
  $('toss-btns').innerHTML = '';
  for (const [label, fn] of buttons || []) { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; $('toss-btns').appendChild(b); }
  $('coin').className = view === 'flip' ? 'flip' : '';
}
function flipCoin(result, done) {
  const c = $('coin');
  c.dataset.side = result; c.className = ''; void c.offsetWidth; c.className = 'flip ' + result;
  audio.toss();
  after(1.9, done);
}
function startSingle() {
  audio.init();
  G.online = false; G.me = 0; G.names = [S.name || 'You', 'Computer'];
  $('menu').classList.add('hidden'); $('lobby').classList.add('hidden');
  G.state = 'toss';
  if (S.toss !== 'toss') return beginMatch(S.toss === 'bat' ? 0 : 1);
  const call = (c) => {
    const coin = Math.random() < 0.5 ? 'heads' : 'tails';
    tossUI('flip', `You called ${c.toUpperCase()}…`);
    flipCoin(coin, () => {
      if (coin === c) {
        const pick = (bat) => { $('toss').classList.add('hidden'); beginMatch(bat ? 0 : 1); };
        tossUI('', `${coin.toUpperCase()}! You won the toss.`, [['BAT FIRST', () => pick(true)], ['BOWL FIRST', () => pick(false)]]);
        if (BOT) after(0.5, () => pick(true));
      } else {
        const bat = Math.random() < 0.5;
        tossUI('', `${coin.toUpperCase()}. The computer won the toss and will ${bat ? 'bat' : 'bowl'} first.`);
        after(2.2, () => { $('toss').classList.add('hidden'); beginMatch(bat ? 1 : 0); });
      }
    });
  };
  tossUI('', 'Call the toss', [['HEADS', () => call('heads')], ['TAILS', () => call('tails')]]);
  if (BOT) after(0.5, () => call('heads'));
}

/* ------------------------------------------------------------------ online */
function lbStatus(t, err) { $('lb-status').textContent = t; $('lb-status').classList.toggle('err', !!err); }
function takeName() {
  const n = cleanName($('m-name').value);
  if (!n) { lbStatus('Type your name first, so your friend knows who you are.', true); $('m-name').focus(); return null; }
  S.name = n; save(); return n;
}
function makeRoom() { return new Room({ onLobby: renderLobby, onMsg: onNet, onClosed: netClosed }); }
async function createRoom() {
  const name = takeName(); if (!name) return;
  audio.init();
  lbStatus('Creating your match…');
  const r = makeRoom();
  try {
    await r.create(name, { overs: S.overs, wickets: S.wickets, toss: S.toss });
    room = r; G.room = r;
    $('lobby').classList.remove('hidden'); lbStatus('');
  } catch (e) { r.leave(); lbStatus(e.message, true); }
}
async function joinRoom(codeArg) {
  const name = takeName(); if (!name) return;
  const code = cleanCode(codeArg || $('m-code').value);
  if (code.length !== 6) return lbStatus('Match codes have 6 letters and numbers.', true);
  audio.init();
  lbStatus('Joining ' + code + '…');
  const r = makeRoom(); room = r; G.room = r;
  try { await r.join(code, name); $('lobby').classList.remove('hidden'); lbStatus(''); }
  catch (e) { room = null; G.room = null; lbStatus(e.message, true); }
}
function renderLobby(r) {
  if (!room) return;
  $('lb-code').textContent = r.code;
  const i = r.info;
  $('lb-info').innerHTML = `<b>${i.overs}</b> over${i.overs > 1 ? 's' : ''} · <b>${i.wickets}</b> wicket${i.wickets > 1 ? 's' : ''} · ${i.toss === 'toss' ? 'Toss decides who bats' : `${esc(r.players[0].name)} ${i.toss === 'bat' ? 'bats' : 'bowls'} first`}`;
  $('lb-players').innerHTML = r.players.map((p, k) => `<li><i class="dot" style="background:#${KITS[k].shirt.toString(16).padStart(6, '0')}"></i><b>${esc(p.name)}</b><span>${KITS[k].name} team</span>${p.host ? '<em>CREATOR</em>' : ''}${(k === 0) === r.isHost ? '<em class="you">YOU</em>' : ''}</li>`).join('') +
    (r.players.length < 2 ? '<li class="empty">Waiting for your friend to join…</li>' : '');
  $('lb-start').classList.toggle('hidden', !r.isHost);
  $('lb-start').disabled = r.players.length < 2;
  $('lb-start').textContent = r.players.length < 2 ? 'WAITING FOR FRIEND…' : 'START MATCH';
  $('lb-wait').textContent = r.isHost ? (r.players.length < 2 ? 'Send the code or link to your friend.' : '') : 'Waiting for ' + r.players[0].name + ' to start the match…';
}
function leaveRoom() { if (room) room.leave(); room = null; G.room = null; G.online = false; $('lobby').classList.add('hidden'); toMenu(); }
function netClosed(reason) { room = null; G.room = null; toMenu(); lbStatus(reason, true); }

// host: start (or restart) the match
function hostStart() {
  if (!room || !room.isHost || room.players.length < 2) return;
  G.online = true; G.me = 0; G.names = room.players.map((p) => p.name);
  S.overs = room.info.overs; S.wickets = room.info.wickets;
  $('lobby').classList.add('hidden'); $('menu').classList.add('hidden'); hideOverlays();
  G.state = 'toss';
  if (room.info.toss !== 'toss') return sendBegin(room.info.toss === 'bat' ? 0 : 1);
  room.send({ t: 'toss', names: G.names });
  tossUI('', `${G.names[1]} is calling the toss…`);
}
function sendBegin(batFirst) {
  room.send({ t: 'begin', batFirst, names: G.names, cfg: { overs: room.info.overs, wickets: room.info.wickets } });
  $('toss').classList.add('hidden');
  beginMatch(batFirst);
}
function onNet(m) {
  if (m.t === 'left') { if (G.state !== 'menu') { toMenu(); lbStatus(`${m.name || 'Your friend'} left the match.`, true); } return; }
  if (!room) return;
  if (m.t === 'toss' && !room.isHost) {
    G.online = true; G.me = 1; G.names = m.names;
    $('lobby').classList.add('hidden'); $('menu').classList.add('hidden'); hideOverlays();
    G.state = 'toss';
    const call = (c) => { room.send({ t: 'call', c }); tossUI('flip', `You called ${c.toUpperCase()}…`); };
    tossUI('', 'Call the toss', [['HEADS', () => call('heads')], ['TAILS', () => call('tails')]]);
    if (BOT) after(0.5, () => call('tails'));
  } else if (m.t === 'call' && room.isHost) {
    const coin = Math.random() < 0.5 ? 'heads' : 'tails', winner = coin === m.c ? 1 : 0;
    room.send({ t: 'tossres', coin, winner });
    tossUI('flip', `${G.names[1]} called ${String(m.c).toUpperCase()}…`);
    flipCoin(coin, () => {
      if (winner === 0) {
        const pick = (bat) => sendBegin(bat ? 0 : 1);
        tossUI('', `${coin.toUpperCase()}! You won the toss.`, [['BAT FIRST', () => pick(true)], ['BOWL FIRST', () => pick(false)]]);
        if (BOT) after(0.5, () => pick(true));
      } else tossUI('', `${coin.toUpperCase()}. ${G.names[1]} won the toss and is choosing…`);
    });
  } else if (m.t === 'tossres' && !room.isHost) {
    flipCoin(m.coin, () => {
      if (m.winner === 1) {
        const pick = (bat) => { room.send({ t: 'choice', bat }); tossUI('', 'Starting…'); };
        tossUI('', `${m.coin.toUpperCase()}! You won the toss.`, [['BAT FIRST', () => pick(true)], ['BOWL FIRST', () => pick(false)]]);
        if (BOT) after(0.5, () => pick(false));
      } else tossUI('', `${m.coin.toUpperCase()}. ${G.names[0]} won the toss and is choosing…`);
    });
  } else if (m.t === 'choice' && room.isHost) {
    sendBegin(m.bat ? 1 : 0);
  } else if (m.t === 'begin' && !room.isHost) {
    G.online = true; G.me = 1; G.names = m.names; S.overs = m.cfg.overs; S.wickets = m.cfg.wickets;
    $('lobby').classList.add('hidden'); $('menu').classList.add('hidden'); hideOverlays();
    beginMatch(m.batFirst);
  } else if (m.t === 'bowl') {
    if (!G.match || !iBat()) return;
    if (G.state === 'wait' && !G.ball) startDelivery(m.p, 1.4);
    else G.pending = m; // still showing the last ball: start this one after it
  } else if (m.t === 'play') {
    if (G.ball && G.ball.n === m.n && !G.ball.res) decide(m.shot, m);
  }
}

/* ------------------------------------------------------------------ menu */
function toMenu() {
  G.state = 'menu'; G.match = null; G.ball = null; G.timers = [];
  disposePeople();
  marker.visible = false; ballMesh.visible = false; ballShadow.visible = false;
  hideOverlays();
  $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
  if (!room) $('lobby').classList.add('hidden');
  document.body.classList.remove('playing');
  G.camPos.set(70, 22, -10); G.camLook.set(0, 0, -10); camera.fov = 40;
  setPanels(); buildMenu();
}
function buildMenu() {
  $('m-name').value = S.name;
  const seg = (id, val, pick) => $(id).querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.v === String(val)); b.onclick = () => { pick(b.dataset.v); save(); buildMenu(); }; });
  seg('o-overs', S.overs, (v) => (S.overs = +v));
  seg('o-wkts', S.wickets, (v) => (S.wickets = +v));
  seg('o-toss', S.toss, (v) => (S.toss = v));
  seg('o-level', S.level, (v) => (S.level = v));
  $('rec').textContent = RECORD.played ? `vs Computer: won ${RECORD.won} of ${RECORD.played} · highest score ${RECORD.high}` : '';
}
$('m-name').addEventListener('change', () => { S.name = cleanName($('m-name').value); save(); });
$('m-single').onclick = () => { const n = cleanName($('m-name').value); S.name = n; save(); startSingle(); };
$('m-create').onclick = createRoom;
$('m-join').onclick = () => joinRoom();
$('m-code').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
$('m-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('lb-start').onclick = hostStart;
$('lb-leave').onclick = leaveRoom;
$('lb-copy').onclick = async () => {
  if (!room) return;
  const link = location.origin + location.pathname + '?room=' + room.code;
  try { await navigator.clipboard.writeText(link); $('lb-copy').textContent = 'COPIED!'; } catch (_) { prompt('Copy this link and send it to your friend:', link); }
  after(1.6, () => ($('lb-copy').textContent = 'COPY INVITE LINK'));
};
$('res-again').onclick = () => { if (G.online) hostStart(); else startSingle(); };
$('res-menu').onclick = () => { if (G.online) leaveRoom(); else toMenu(); };
$('quit').onclick = () => { if (G.online) { if (confirm('Leave this online match?')) leaveRoom(); } else if (confirm('Quit this match?')) toMenu(); };
$('sound').onclick = () => { $('sound').textContent = audio.toggle() ? '🔊' : '🔇'; };
$('sound').textContent = audio.on ? '🔊' : '🔇';
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
addEventListener('beforeunload', () => { if (room) room.leave(); });

/* ------------------------------------------------------------------ loop */
let last = now();
function frame() {
  requestAnimationFrame(frame);
  const t = now(), dt = Math.min(0.05, t - last) * TS; last = t;
  clock += dt;
  for (const tm of G.timers.splice(0).filter((x) => { if (x.at <= clock) { x.fn(); return false; } return true; })) G.timers.push(tm);
  if (G.state === 'aim') { G.meterT += dt; $('needle').style.left = (50 + Math.sin(G.meterT * 5.5) * 46) + '%'; if (BOT) bowlPressed(); }
  animate(dt);
  updateCamera(dt);
  const fans = ground.fans; // crowd bounce on big moments is handled by sound; keep cheap
  renderer.render(scene, camera);
}

toMenu();
$('loading').classList.add('hidden');
// realistic players: the same character models as the Kadal Nagaram city game (built-in people until they load)
if (!params.has('simple')) {
  const files = ['player.glb', 'ped1.glb', 'ped2.glb', 'ped3.glb', 'thug.glb'];
  const heights = { 'player.glb': 1.78, 'ped1.glb': 1.72, 'ped2.glb': 1.75, 'ped3.glb': 1.73, 'thug.glb': 1.8 };
  loadCricketers('../GTA-Game/models/', files, heights, (i, n) => { $('mload').textContent = `Loading players ${i}/${n}…`; })
    .then((lib) => {
      $('mload').textContent = '';
      G.modelsReady = !!lib;
      if (lib && G.people) { if (G.state === 'aim' || G.state === 'wait' || G.state === 'break') { buildPeople(inn().bat); } else G.rebuild = true; }
    })
    .catch(() => { $('mload').textContent = ''; });
}
if (params.has('room')) { $('m-code').value = cleanCode(params.get('room')); lbStatus('Type your name and press JOIN to play.'); }
if (params.has('auto')) startSingle();
// testing aid: ?mp=host&name=A creates a match and starts it when a friend joins; ?mp=join&room=CODE&name=B joins
if (params.get('mp')) {
  $('m-name').value = params.get('name') || 'Tester';
  if (params.get('mp') === 'host') createRoom().then(() => { const iv = setInterval(() => { if (room && room.players.length === 2) { clearInterval(iv); setTimeout(hostStart, 800); } }, 300); });
  else joinRoom(params.get('room'));
}
requestAnimationFrame(frame);
