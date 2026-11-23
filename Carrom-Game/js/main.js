// Carrom Raja: menu, turns (you, the computer, friends on the same phone or online), aiming and
// shooting, camera, HUD and the main loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as P from './physics.js';
import { buildBoard, makeCoinMesh } from './board.js';
import { planShot, LEVELS } from './ai.js';
import { CarromAudio } from './audio.js';
import { Room, cleanCode, cleanName } from './net.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const LOW = isTouch || params.has('low');
const TIME_SCALE = clamp(+params.get('speed') || 1, 0.1, 20); // testing aid
const BOT = params.has('bot');                                  // testing aid: the computer plays for you
const CPU_NAMES = ['Arjun', 'Meena', 'Karthik', 'Priya', 'Vikram', 'Divya'];
const TEAM_NAME = ['WHITE', 'BLACK'];

/* ------------------------------------------------------------------ settings */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};
const S = Object.assign({ name: '', mode: 'cpu', n: 2, level: 'normal', guide: true }, store.get('carrom-settings', {}));
if (!['cpu', 'local', 'online'].includes(S.mode)) S.mode = 'cpu';
if (S.n !== 4) S.n = 2;
if (!LEVELS[S.level]) S.level = 'normal';
for (const k of ['mode', 'level']) if (params.has(k)) S[k] = params.get(k);
if (params.has('n')) S.n = +params.get('n') === 4 ? 4 : 2;
const save = () => store.set('carrom-settings', S);

/* ------------------------------------------------------------------ renderer, scene */
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.6 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120c0a);
scene.fog = new THREE.Fog(0x120c0a, 1.6, 4.2);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 30);

const hemi = new THREE.HemisphereLight(0xfff1dd, 0x2a1a10, 0.18);
const lamp = new THREE.SpotLight(0xffe0b0, 7, 5, 0.62, 0.65, 1.2);
lamp.position.set(0.12, 1.5, 0.08);
lamp.castShadow = true;
lamp.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
lamp.shadow.bias = -0.0002; lamp.shadow.normalBias = 0.01; lamp.shadow.radius = 3;
lamp.shadow.camera.near = 0.5; lamp.shadow.camera.far = 3;
scene.add(hemi, lamp, lamp.target);

const B = buildBoard(renderer, LOW);
scene.add(B.group);
// reflections from the room only as a soft sheen; the lamp does the lighting
const dimEnv = (o) => o.traverse((m) => { const ms = m.material ? [].concat(m.material) : []; for (const x of ms) if ('envMapIntensity' in x) x.envMapIntensity = 0.22; });
dimEnv(B.group);
const coinCache = {};

/* ------------------------------------------------------------------ state */
const audio = new CarromAudio();
const G = {
  state: 'boot', game: null, mode: 'cpu', meshes: [], viewSeat: 0, mySeat: 0, camAng: 0,
  u: 0, aim: null, drag: null, think: 0, cpuShot: null, cpuT: 0, delay: 0, lastU: {},
  online: false, room: null, pendingSync: null, waitSync: 0, aimSendT: 0, remoteAim: null, level: S.level,
};
window.__carrom = G; G.camera = camera; G.P = P;
let room = null;

/* ------------------------------------------------------------------ pieces on the board */
function buildPieces() {
  for (const m of G.meshes) scene.remove(m);
  G.meshes = G.game.coins.map((c) => { const m = makeCoinMesh(c.kind, coinCache); dimEnv(m); scene.add(m); return m; });
  G.drops = [];
}
function syncPieces(dt) {
  const g = G.game;
  g.coins.forEach((c, i) => {
    const m = G.meshes[i];
    if (c.on) { m.visible = true; m.position.set(c.x, 0, c.z); m.scale.set(1, 1, 1); m.userData.in = false; return; }
    if (!m.userData.in) { m.userData.in = true; m.userData.t = 0; m.userData.from = [m.position.x, m.position.z]; }
    // falling into the pocket
    const d = m.userData; d.t += dt;
    const k = clamp(d.t / 0.28, 0, 1);
    if (k >= 1 || c.px === undefined) { m.visible = false; return; }
    m.position.set(d.from[0] + (c.px - d.from[0]) * k, -0.02 * k * k, d.from[1] + (c.pz - d.from[1]) * k);
    m.scale.set(1 - k * 0.3, 1, 1 - k * 0.3);
  });
}

/* ------------------------------------------------------------------ camera */
const seatAngle = (seat) => [0, Math.PI / 2, Math.PI, -Math.PI / 2][seat];
function updateCamera(dt, snap) {
  const target = seatAngle(G.viewSeat);
  let d = target - G.camAng;
  while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  if (G.state !== 'menu') G.camAng = snap ? target : G.camAng + d * (1 - Math.exp(-dt * 4)); // the menu slowly turns the board
  const a = G.camAng, tilt = 0.24, half = P.H + B.frameW + 0.012;
  const aspect = innerWidth / innerHeight, t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // fit the board: by height in landscape, by width on narrow screens (leave room for the side panels)
  // keep a strip at the bottom for the striker slider: the board is fitted above it
  const strip = Math.min(64, innerHeight * 0.12), hk = innerHeight / (innerHeight - strip);
  let D = ((half * 1.04) / t) * hk;
  const usable = innerWidth > innerHeight ? Math.max(0.5, 1 - 2 * Math.min(0.24, 230 / innerWidth)) : 1;
  D = Math.max(D, (half * 1.04) / (t * aspect * usable));
  if (!camera.view || camera.view.offsetY !== strip / 2 || camera.view.fullWidth !== innerWidth || camera.view.fullHeight !== innerHeight) camera.setViewOffset(innerWidth, innerHeight, 0, strip / 2, innerWidth, innerHeight);
  const fx = Math.sin(a), fz = Math.cos(a);
  camera.position.set(fx * D * Math.sin(tilt), D * Math.cos(tilt), fz * D * Math.sin(tilt));
  camera.up.set(-fx, 0, -fz);
  camera.lookAt(fx * 0.02, 0, fz * 0.02);
}

/* ------------------------------------------------------------------ menu */
function seg(id, value, pick) {
  $(id).querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => { pick(b.dataset.v); save(); buildMenu(); };
  });
}
function buildMenu() {
  seg('m-mode', S.mode, (v) => { S.mode = v; });
  seg('m-n', S.n, (v) => { S.n = +v; });
  seg('m-level', S.level, (v) => { S.level = v; });
  $('m-levelbox').classList.toggle('hidden', S.mode !== 'cpu');
  $('m-name').value = S.name;
  const notes = {
    cpu: S.n === 4 ? 'You and a computer partner (opposite you) against two computer players.' : 'You play white and break first against the computer.',
    local: S.n === 4 ? 'Four players on one phone, two teams. The board turns to face whoever is playing.' : 'Two players on one phone. The board turns to face whoever is playing.',
    online: 'Create a room and send the code to your friends, or join theirs.',
  };
  $('m-note').textContent = notes[S.mode];
  $('start').textContent = S.mode === 'online' ? (room ? 'BACK TO ROOM ' + room.code : 'PLAY ONLINE') : 'START';
}
function showMenu() {
  G.state = 'menu'; G.online = false;
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden'); $('over').classList.add('hidden'); $('pause').classList.add('hidden');
  if (!G.game) { G.game = P.newGame(2); buildPieces(); }
  G.viewSeat = 0;
  B.aim.visible = false; B.bad.visible = false;
  buildMenu();
}
function takeMenuName() { S.name = cleanName($('m-name').value); save(); return S.name; }

/* ------------------------------------------------------------------ starting a game */
// players: [{ name, kind: 'human' | 'cpu' | 'remote' }] in turn order
function startGame(n, players, { online = false, mySeat = 0, level = S.level } = {}) {
  audio.init();
  G.game = P.newGame(n, players.map((p) => p.name));
  G.game.players.forEach((p, i) => { p.kind = players[i].kind; p.netId = players[i].id || null; });
  G.online = online; G.mode = online ? 'online' : S.mode; G.mySeat = mySeat; G.level = level;
  G.lastU = {}; G.pendingSync = null; G.remoteAim = null;
  buildPieces();
  $('menu').classList.add('hidden'); $('lobby').classList.add('hidden'); $('over').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('p-restart').classList.toggle('hidden', online);
  $('p-note').classList.toggle('hidden', !online);
  G.viewSeat = G.mode === 'local' ? G.game.players[0].seat : mySeat;
  updateCamera(0, true);
  nextTurn(true);
}
function startOffline() {
  takeMenuName();
  const me = S.name || 'You';
  let players;
  if (S.mode === 'local') players = Array.from({ length: S.n }, (_, i) => ({ name: i === 0 && S.name ? S.name : 'Player ' + (i + 1), kind: 'human' }));
  else if (S.n === 4) players = [{ name: me, kind: 'human' }, { name: CPU_NAMES[0], kind: 'cpu' }, { name: CPU_NAMES[1] + ' (partner)', kind: 'cpu' }, { name: CPU_NAMES[2], kind: 'cpu' }];
  else players = [{ name: me, kind: 'human' }, { name: CPU_NAMES[(Math.random() * 3) | 0], kind: 'cpu' }];
  G.lastPlayers = players;
  startGame(S.n, players);
}

/* ------------------------------------------------------------------ turns */
const isMine = (p) => p.kind === 'human' || p.kind === 'cpu';        // this device plays this turn
const isCpu = (p) => p.kind === 'cpu' || (p.kind === 'human' && BOT);
function nextTurn(first = false) {
  const g = G.game;
  if (g.winner >= 0) { G.state = 'over'; G.delay = 1.4; return; }
  const p = P.cur(g);
  G.u = P.freeU(g, p.seat, G.lastU[p.seat] ?? 0);
  P.placeStriker(g, G.u);
  G.aim = null; G.drag = null; G.remoteAim = null;
  if (G.mode === 'local') G.viewSeat = p.seat;
  const me = p.kind === 'human' && !BOT;
  const team = TEAM_NAME[p.team].toLowerCase();
  $('banner').textContent = (me && G.mode !== 'local') || p.name === 'You' ? `Your turn · ${team}` : `${p.name}'s turn · ${team}`;
  $('banner').classList.toggle('me', me);
  if (!first) audio.turn();
  if (p.kind === 'human' && !BOT) {
    G.state = 'aim';
    setSlider();
    $('place').classList.remove('hidden');
    $('hint').textContent = g.broke ? 'Slide to place the striker, then pull back from it and let go' : 'Break! Pull back hard and hit the coins in the middle';
  } else {
    G.state = 'wait';
    $('place').classList.add('hidden');
    if (isCpu(p)) { G.think = (LEVELS[G.level] || LEVELS.normal).think / TIME_SCALE; G.cpuShot = null; }
  }
  updateHUD();
}

function setSlider() { $('slider').value = String(Math.round((G.u / P.U_MAX) * 1000)); }
function moveStriker(u) {
  const g = G.game, p = P.cur(g);
  G.u = clamp(u, -P.U_MAX, P.U_MAX);
  P.placeStriker(g, G.u);
  G.lastU[p.seat] = G.u;
}

function doShoot(u, dx, dz, power, fromNet = false) {
  const g = G.game, p = P.cur(g);
  if (!fromNet && G.online && room) room.send({ t: 'shot', k: g.shots, u, dx, dz, p: power });
  G.lastU[p.seat] = u;
  P.shoot(g, u, dx, dz, power);
  G.state = 'moving'; G.acc = 0;
  G.aim = null; G.drag = null; G.remoteAim = null;
  B.aim.visible = false; B.bad.visible = false;
  $('place').classList.add('hidden');
  audio.flick(power);
}

function finishShot() {
  const g = G.game, shooter = P.cur(g), mine = isMine(shooter);
  const queenWas = g.queen;
  const r = P.endShot(g);
  if (r.foul) { audio.foul(); toast(r.msgs[r.msgs.length - 1] || 'Foul!', 'foul'); }
  else if (g.queen !== queenWas && g.queen !== 'board') { audio.queen(); toast(r.msgs.join(' '), 'queen'); }
  else if (r.msgs.length) toast(r.msgs.join(' '));
  if (G.online && room) {
    if (mine) room.send({ t: 'sync', k: g.shots, s: P.snapshot(g) });
    else {
      // the shooter's computer has the final word: wait (briefly) for its version of the board
      if (G.pendingSync && G.pendingSync.k === g.shots) { P.restore(g, G.pendingSync.s); G.pendingSync = null; }
      else { G.state = 'syncwait'; G.waitSync = 4; updateHUD(); return; }
    }
  }
  G.state = 'between'; G.delay = (r.again ? 0.5 : 0.9) / TIME_SCALE;
  updateHUD();
}

/* ------------------------------------------------------------------ computer turns */
function cpuFrame(dt) {
  const g = G.game;
  if (G.think > 0) { G.think -= dt; return; }
  if (!G.cpuShot) {
    G.cpuShot = planShot(g, BOT && P.cur(g).kind === 'human' ? 'hard' : G.level);
    G.cpuT = 0; G.cpuFrom = G.u;
    return;
  }
  // slide the striker into place and line up the shot, then flick
  const s = G.cpuShot;
  G.cpuT += dt * TIME_SCALE;
  const k = clamp(G.cpuT / 0.6, 0, 1), e = k * k * (3 - 2 * k);
  moveStriker(G.cpuFrom + (s.u - G.cpuFrom) * e);
  G.aim = G.cpuT > 0.4 ? { dx: s.dx, dz: s.dz, power: s.power * clamp((G.cpuT - 0.4) / 0.5, 0, 1) } : null;
  if (G.cpuT > 1.05) doShoot(s.u, s.dx, s.dz, s.power);
}

/* ------------------------------------------------------------------ aiming: pointer + slider */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), hit = new THREE.Vector3(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function boardPoint(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? [hit.x, hit.z] : null;
}
const canvas = $('game');
canvas.addEventListener('pointerdown', (e) => {
  audio.init();
  if (G.state !== 'aim') return;
  const w = boardPoint(e); if (!w) return;
  const g = G.game, p = P.cur(g), Sd = P.SEATS[p.seat], st = P.striker(g);
  const along = w[0] * Sd.r[0] + w[1] * Sd.r[1], back = -(w[0] * Sd.f[0] + w[1] * Sd.f[1]);
  const onStriker = Math.hypot(w[0] - st.x, w[1] - st.z) < P.STRIKER_R * 1.6;
  if (!onStriker && Math.abs(back - P.BASE) < 0.04 && Math.abs(along) < P.U_MAX + 0.03) {
    G.drag = { mode: 'move' }; moveStriker(along); setSlider();
  } else {
    G.drag = { mode: 'aim', sx: w[0], sz: w[1] };
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (G.state !== 'aim' || !G.drag) return;
  const w = boardPoint(e); if (!w) return;
  const p = P.cur(G.game), Sd = P.SEATS[p.seat];
  if (G.drag.mode === 'move') { moveStriker(w[0] * Sd.r[0] + w[1] * Sd.r[1]); setSlider(); return; }
  const px = G.drag.sx - w[0], pz = G.drag.sz - w[1], len = Math.hypot(px, pz);
  if (len < 0.006) { G.aim = null; return; }
  G.aim = { dx: px / len, dz: pz / len, power: clamp((len - 0.006) / 0.2, 0, 1) };
});
const release = () => {
  if (G.state !== 'aim' || !G.drag) return;
  const d = G.drag; G.drag = null;
  if (d.mode !== 'aim' || !G.aim) { G.aim = null; return; }
  const a = G.aim, g = G.game;
  if (a.power < 0.04) { G.aim = null; return; }
  if (!P.placeOk(g, P.cur(g).seat, G.u)) { toast('The striker is touching a coin. Move it first.', 'foul'); G.aim = null; return; }
  doShoot(G.u, a.dx, a.dz, a.power);
};
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', () => { G.drag = null; G.aim = null; });
$('slider').addEventListener('input', (e) => { if (G.state === 'aim') moveStriker((+e.target.value / 1000) * P.U_MAX); });
addEventListener('keydown', (e) => {
  if (G.state !== 'aim') return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { moveStriker(G.u - 0.004); setSlider(); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { moveStriker(G.u + 0.004); setSlider(); }
});

// Draw the aim guide: dotted path to the first coin (or cushion), a ghost striker where it touches,
// and the direction that coin will take.
function drawAim(a, dim) {
  const g = G.game, st = P.striker(g);
  if (!a) { B.aim.visible = false; return; }
  B.aim.visible = true;
  const guide = S.guide || G.state !== 'aim';
  let x = st.x, z = st.z, dx = a.dx, dz = a.dz, n = 0, left = guide ? 0.75 : 0.12, hitCoin = null, gx = 0, gz = 0;
  const lim = P.H - P.STRIKER_R;
  for (let bounce = 0; bounce < 2 && left > 0; bounce++) {
    let best = left, coin = null;
    for (const c of g.coins) {
      if (!c.on || c.kind === 's') continue;
      const ox = c.x - x, oz = c.z - z, along = ox * dx + oz * dz;
      if (along <= 0) continue;
      const perp2 = ox * ox + oz * oz - along * along, rr = (c.r + P.STRIKER_R) ** 2;
      if (perp2 > rr) continue;
      const t = along - Math.sqrt(rr - perp2);
      if (t < best) { best = t; coin = c; }
    }
    let wall = Infinity, nx = dx, nz = dz;
    if (dx > 0) wall = Math.min(wall, (lim - x) / dx); if (dx < 0) wall = Math.min(wall, (-lim - x) / dx);
    if (dz > 0) wall = Math.min(wall, (lim - z) / dz); if (dz < 0) wall = Math.min(wall, (-lim - z) / dz);
    const seg = Math.min(best, wall);
    for (let s = 0.012; s < seg && n < B.dots.length; s += 0.012) { const d = B.dots[n++]; d.visible = true; d.position.x = x + dx * s; d.position.z = z + dz * s; }
    if (coin && best <= wall) { gx = x + dx * best; gz = z + dz * best; hitCoin = coin; break; }
    x += dx * seg; z += dz * seg; left -= seg;
    if (seg === wall) { if (Math.abs(x) >= lim - 1e-6) nx = -dx; if (Math.abs(z) >= lim - 1e-6) nz = -dz; dx = nx; dz = nz; }
    if (!guide) break;
  }
  for (let i = n; i < B.dots.length; i++) B.dots[i].visible = false;
  let m = 0;
  if (hitCoin && guide) {
    B.ghost.visible = true; B.ghost.position.x = gx; B.ghost.position.z = gz;
    let cx = hitCoin.x - gx, cz = hitCoin.z - gz; const cl = Math.hypot(cx, cz); cx /= cl; cz /= cl;
    const L = 0.05 + a.power * 0.2;
    for (let s = 0.012; s < L && m < B.dots2.length; s += 0.012) { const d = B.dots2[m++]; d.visible = true; d.position.x = hitCoin.x + cx * s; d.position.z = hitCoin.z + cz * s; }
  } else B.ghost.visible = false;
  for (let i = m; i < B.dots2.length; i++) B.dots2[i].visible = false;
  // power ring around the striker
  B.power.position.x = st.x; B.power.position.z = st.z;
  const pw = a.power;
  B.power.scale.setScalar(1 + pw * 0.9);
  B.power.material.color.setHSL(0.33 - pw * 0.33, 0.85, 0.55);
  B.power.material.opacity = dim ? 0.45 : 0.9;
  B.dots[0].material.opacity = dim ? 0.45 : 0.85;
}

/* ------------------------------------------------------------------ HUD */
let toastT = 0;
function toast(text, cls = '') {
  const t = $('toast'); t.textContent = text; t.className = 'show ' + cls; toastT = 2.6;
}
function updateHUD() {
  const g = G.game;
  if (!g) return;
  for (const team of [0, 1]) {
    const ps = g.players.filter((p) => p.team === team);
    const turnP = P.cur(g);
    const kind = (p) => (p.kind === 'cpu' || (p.kind === 'remote' && !p.netId) ? 'computer' : p.kind === 'remote' ? 'online' : G.mode === 'local' ? '' : 'you');
    const q = g.queenTeam === team && g.queen !== 'board' ? `<div class="qrow ${g.queen === 'pending' ? 'pending' : ''}"><i></i>${g.queen === 'pending' ? 'Queen pocketed: cover her!' : 'Queen covered'}</div>` : '<div class="qrow"></div>';
    $('side' + team).innerHTML = `<h4><i class="${team ? 'b' : 'w'}"></i>${TEAM_NAME[team]}</h4>` +
      ps.map((p) => `<div class="pl ${p === turnP && g.winner < 0 ? 'on' : ''}">${esc(p.name)} <small>${kind(p)}</small></div>`).join('') +
      `<div class="coins">${Array.from({ length: 9 }, (_, i) => `<i class="${i < g.pocketed[team] ? 'in ' : ''}${team ? 'b' : 'w'}"></i>`).join('')}</div>` + q;
  }
  $('guideBtn').classList.toggle('off', !S.guide);
  $('soundBtn').classList.toggle('off', !audio.on);
}

function showOver() {
  const g = G.game, W = g.winner;
  const winners = g.players.filter((p) => p.team === W), wins = winners.length > 1 ? 'win' : 'wins';
  const youWin = winners.some((p) => p.kind === 'human') && G.mode !== 'local';
  const youLose = !youWin && G.mode !== 'local' && g.players.some((p) => p.kind === 'human');
  $('o-title').textContent = youWin ? 'YOU WIN!' : youLose ? 'YOU LOSE' : (winners.length > 1 ? TEAM_NAME[W] + ' WINS' : winners[0].name.toUpperCase() + ' WINS');
  $('o-sub').innerHTML = `${esc(winners.map((p) => p.name).join(' & '))} ${wins} the board · <b>${g.points} point${g.points === 1 ? '' : 's'}</b>` +
    (g.queenTeam === W ? ' (queen +3)' : '') + ` · ${g.shots} shots`;
  $('o-table').innerHTML = '<tr><th>Side</th><th>Players</th><th>Coins in</th><th>Queen</th></tr>' + [0, 1].map((t) =>
    `<tr class="${t === W ? 'win' : ''}"><td><i class="chip ${t ? 'b' : 'w'}"></i>${TEAM_NAME[t]}</td><td>${esc(g.players.filter((p) => p.team === t).map((p) => p.name).join(', '))}</td>` +
    `<td>${9 - g.coins.filter((c) => c.on && c.kind === P.colorOf(t)).length}/9</td><td>${g.queenTeam === t && g.queen === 'covered' ? '✓' : ''}</td></tr>`).join('');
  const host = !G.online || (room && room.isHost);
  $('o-again').classList.toggle('hidden', !host);
  $('o-menu').textContent = G.online ? 'LEAVE ROOM' : 'MENU';
  $('o-wait').textContent = G.online && !host ? 'Waiting for the host to start the next board…' : '';
  $('over').classList.remove('hidden');
  $('banner').textContent = '';
  if (youWin || G.mode === 'local') audio.win();
}

/* ------------------------------------------------------------------ online */
function lbStatus(text, isErr = false) { const st = $('lb-status'); st.textContent = text; st.classList.toggle('err', isErr); }
function lbView(which) { $('lb-entry').classList.toggle('hidden', which !== 'entry'); $('lb-room').classList.toggle('hidden', which !== 'room'); }
function openOnline(code) {
  audio.init();
  $('lobby').classList.remove('hidden');
  $('lb-name').value = S.name;
  if (code) $('lb-code').value = cleanCode(code);
  seg('lb-n', S.n, (v) => { S.n = +v; });
  if (room) { lbView('room'); renderLobby(room.players, room.info, room.state); } else { lbView('entry'); lbStatus(''); }
}
function lobbyName() {
  const name = cleanName($('lb-name').value);
  if (!name) { lbStatus('Type your name first, so the others know who you are.', true); $('lb-name').focus(); return null; }
  S.name = name; save(); return name;
}
function makeRoom() { return new Room({ onLobby: renderLobby, onMsg: onNetMsg, onLeave: onNetLeave, onClosed: onNetClosed }); }
async function createRoom() {
  const name = lobbyName(); if (!name) return;
  $('lb-create').disabled = true; lbStatus('Creating your room…');
  const r = makeRoom();
  try { await r.create(name, { n: S.n }); room = r; G.room = r; lbView('room'); lbStatus(''); buildMenu(); }
  catch (e) { r.leave(); lbStatus(e.message, true); }
  $('lb-create').disabled = false;
}
async function joinRoom() {
  const name = lobbyName(); if (!name) return;
  const code = cleanCode($('lb-code').value); $('lb-code').value = code;
  if (code.length !== 6) { lbStatus('Room codes have 6 letters and numbers.', true); return; }
  $('lb-joinbtn').disabled = true; lbStatus('Joining room ' + code + '…');
  const r = makeRoom(); room = r; G.room = r;
  try { await r.join(code, name); lbView('room'); lbStatus(''); buildMenu(); }
  catch (e) { room = null; G.room = null; lbView('entry'); lbStatus(e.message, true); }
  $('lb-joinbtn').disabled = false;
}
function leaveRoom() {
  if (room) room.leave();
  room = null; G.room = null;
  $('lobby').classList.add('hidden');
  showMenu();
}
// seats in join order: 2 players sit opposite; with 4, the host's partner is the third to join
function renderLobby(players, info, state) {
  if (!room) return;
  const n = info.n === 4 ? 4 : 2;
  $('lb-codeshow').textContent = room.code;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const p = players[i], team = n === 4 ? i % 2 : i;
    rows.push(p ? `<li><i class="chip ${team ? 'b' : 'w'}"></i><b>${esc(p.name)}</b><span>${TEAM_NAME[team].toLowerCase()}${n === 4 && i >= 2 ? ' · partner of ' + esc(players[i - 2] ? players[i - 2].name : '') : ''}</span>${p.host ? '<em>HOST</em>' : ''}${p.id === room.me ? '<em class="you">YOU</em>' : ''}</li>`
      : `<li class="cpu"><i class="chip ${team ? 'b' : 'w'}"></i><b>Computer</b><span>empty seat</span></li>`);
  }
  $('lb-players').innerHTML = rows.join('');
  if (room.isHost) {
    $('lb-setup').innerHTML = `<div class="seg" id="lb-n2"><button data-v="2">2 Players</button><button data-v="4">4 Players</button></div>`;
    seg('lb-n2', n, (v) => { S.n = +v; room.setInfo({ n: S.n }); });
    const humans = players.length;
    $('lb-start').classList.remove('hidden');
    $('lb-start').disabled = humans < 2;
    $('lb-start').textContent = humans < 2 ? 'WAITING FOR PLAYERS…' : humans < n ? `START (${n - humans} COMPUTER)` : 'START GAME';
    $('lb-wait').textContent = humans < 2 ? 'Send the code or link to your friends.' : '';
  } else {
    $('lb-setup').innerHTML = `<p class="lb-info">${n} players <span>(the host chooses)</span></p>`;
    $('lb-start').classList.add('hidden');
    $('lb-wait').textContent = state === 'playing' ? "A game is running. You'll join the next one." : 'Waiting for the host to start…';
  }
}
function hostStart() {
  if (!room || !room.isHost || room.players.length < 2) return;
  const n = room.info.n === 4 ? 4 : 2;
  const list = [];
  let cpu = 0;
  for (let i = 0; i < n; i++) {
    const p = room.players[i];
    list.push(p ? { name: p.name, id: p.id } : { name: CPU_NAMES[cpu++], id: null });
  }
  const m = { t: 'start', n, list, level: S.level };
  room.setState('playing');
  room.send(m);
  onlineStart(m);
}
function onlineStart(m) {
  const n = m.n === 4 ? 4 : 2;
  const players = m.list.slice(0, n).map((p) => ({ name: cleanName(p.name) || 'Player', id: p.id, kind: p.id === room.me ? 'human' : p.id ? 'remote' : room.isHost ? 'cpu' : 'remote' }));
  const meIdx = players.findIndex((p) => p.kind === 'human');
  if (meIdx < 0) return;
  const seat = n === 4 ? meIdx : meIdx * 2;
  startGame(n, players, { online: true, mySeat: seat, level: LEVELS[m.level] ? m.level : 'normal' });
}
function onNetMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'start') { onlineStart(m); return; }
  const g = G.game;
  if (!G.online || !g) return;
  if (m.t === 'aim') {
    if (G.state === 'wait' && m.k === g.shots) { moveStriker(+m.u || 0); G.remoteAim = m.p > 0.02 ? { dx: m.dx, dz: m.dz, power: m.p } : null; }
  } else if (m.t === 'shot') {
    if (m.k === g.shots && (G.state === 'wait' || G.state === 'aim')) doShoot(clamp(+m.u || 0, -P.U_MAX, P.U_MAX), +m.dx || 0, +m.dz || -1, clamp(+m.p || 0, 0, 1), true);
  } else if (m.t === 'sync') {
    if (G.state === 'moving') G.pendingSync = m;
    else if (G.state === 'syncwait' || m.k >= g.shots) {
      P.restore(g, m.s); G.pendingSync = null;
      G.state = 'between'; G.delay = 0.5 / TIME_SCALE; updateHUD();
    }
  } else if (m.t === 'cpu') {
    const p = g.players[m.i];
    if (p) toast(`${p.name} left. The computer plays for them.`);
  }
}
function onNetLeave(id, name) {
  const g = G.game;
  if (!G.online || !g) return;
  const i = g.players.findIndex((p) => p.netId === id);
  if (i < 0) return;
  // the host's computer takes over the empty seat
  g.players[i].kind = 'cpu'; g.players[i].netId = null;
  room.send({ t: 'cpu', i });
  toast(`${name} left. The computer plays for them.`);
  if (G.state === 'wait' && g.turn === i) { G.think = 0.5; G.cpuShot = null; }
  updateHUD();
}
function onNetClosed(reason) {
  room = null; G.room = null;
  showMenu();
  openOnline();
  lbStatus(reason, true);
}

/* ------------------------------------------------------------------ main loop */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!(dt > 0)) dt = 0;
  audio.frame();
  const g = G.game;
  if (G.state === 'menu') G.camAng += dt * 0.08;
  if (g && G.state !== 'menu' && G.state !== 'paused') {
    if (G.state === 'moving') {
      G.acc += dt * TIME_SCALE;
      let n = 0;
      const ev = { hit: [], wall: [], pocket: [] };
      while (G.acc >= P.DT && n < 600) { G.acc -= P.DT; n++; P.step(g, P.DT, ev); if (!P.anyMoving(g)) { G.acc = 0; break; } }
      for (const v of ev.hit.sort((a, b) => b - a).slice(0, 3)) audio.hit(v);
      for (const v of ev.wall.slice(0, 2)) audio.wall(v);
      if (ev.pocket.length) audio.pocket();
      if (!P.anyMoving(g) || (g.sim && g.sim.t > 14)) { for (const c of g.coins) { c.vx = 0; c.vz = 0; } finishShot(); }
    } else if (G.state === 'wait') {
      const p = P.cur(g);
      if (isCpu(p) && isMine(p)) cpuFrame(dt);
    } else if (G.state === 'between') {
      G.delay -= dt;
      if (G.delay <= 0) nextTurn();
    } else if (G.state === 'syncwait') {
      G.waitSync -= dt;
      if (G.waitSync <= 0) { G.state = 'between'; G.delay = 0; }
    } else if (G.state === 'over') {
      G.delay -= dt;
      if (G.delay <= 0 && $('over').classList.contains('hidden')) { G.state = 'done'; showOver(); }
    }
    // online: show my aim to the others
    if (G.online && room && G.state === 'aim') {
      G.aimSendT -= dt;
      if (G.aimSendT <= 0) { G.aimSendT = 0.1; room.send({ t: 'aim', k: g.shots, u: +G.u.toFixed(4), dx: G.aim ? +G.aim.dx.toFixed(4) : 0, dz: G.aim ? +G.aim.dz.toFixed(4) : 0, p: G.aim ? +G.aim.power.toFixed(3) : 0 }); }
    }
  }
  if (g) {
    syncPieces(dt);
    const showAim = G.state === 'aim' || (G.state === 'wait' && (G.aim || G.remoteAim));
    drawAim(showAim ? (G.state === 'aim' ? G.aim : G.aim || G.remoteAim) : null, G.state !== 'aim');
    const st = P.striker(g);
    B.bad.visible = G.state === 'aim' && !P.placeOk(g, P.cur(g).seat, G.u);
    B.bad.position.set(st.x, 0, st.z);
  }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  updateCamera(dt, false);
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ buttons */
$('start').onclick = () => {
  takeMenuName();
  if (S.mode === 'online') { openOnline(); return; }
  startOffline();
};
$('m-name').addEventListener('change', takeMenuName);
$('menuBtn').onclick = () => {
  if (!G.game || G.state === 'menu') return;
  G.prevState = G.state;
  if (!G.online) G.state = 'paused';
  $('pause').classList.remove('hidden');
};
$('p-resume').onclick = () => { $('pause').classList.add('hidden'); if (G.state === 'paused') G.state = G.prevState; last = performance.now(); };
$('p-restart').onclick = () => { $('pause').classList.add('hidden'); startGame(G.game.n, G.lastPlayers || G.game.players.map((p) => ({ name: p.name, kind: p.kind }))); };
$('p-quit').onclick = () => { $('pause').classList.add('hidden'); if (G.online) leaveRoom(); else showMenu(); };
$('guideBtn').onclick = () => { S.guide = !S.guide; save(); updateHUD(); };
$('soundBtn').onclick = () => { audio.init(); audio.toggle(); updateHUD(); };
$('o-again').onclick = () => {
  $('over').classList.add('hidden');
  if (G.online) hostStart();
  else startGame(G.game.n, G.lastPlayers || G.game.players.map((p) => ({ name: p.name, kind: p.kind })));
};
$('o-menu').onclick = () => { $('over').classList.add('hidden'); if (G.online) leaveRoom(); else showMenu(); };
$('lb-create').onclick = createRoom;
$('lb-joinbtn').onclick = joinRoom;
$('lb-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('lb-code').addEventListener('input', (e) => { e.target.value = cleanCode(e.target.value); });
$('lb-start').onclick = hostStart;
$('lb-close').onclick = () => $('lobby').classList.add('hidden');
$('lb-leave').onclick = leaveRoom;
$('lb-copy').onclick = async () => {
  if (!room) return;
  const link = location.origin + location.pathname + '?room=' + room.code;
  try { await navigator.clipboard.writeText(link); $('lb-copy').textContent = 'COPIED!'; }
  catch (_) { prompt('Copy this link and send it to your friends:', link); }
  setTimeout(() => ($('lb-copy').textContent = 'COPY INVITE LINK'), 1600);
};
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
addEventListener('beforeunload', () => { if (room) room.leave(); });

/* ------------------------------------------------------------------ boot */
showMenu();
$('loading').classList.add('hidden');
if (params.has('room')) { S.mode = 'online'; buildMenu(); openOnline(params.get('room')); }
if (params.has('auto')) startOffline();
// testing aid: ?mp=host&name=A creates a room and starts when someone joins; ?mp=join&room=CODE&name=B joins it
if (params.get('mp') === 'host' || params.get('mp') === 'join') {
  openOnline(params.get('room'));
  $('lb-name').value = params.get('name') || 'Tester';
  if (params.get('mp') === 'host') {
    createRoom().then(() => {
      const want = +params.get('humans') || 2;
      const iv = setInterval(() => { if (room && room.players.length >= want) { clearInterval(iv); setTimeout(hostStart, 800); } }, 300);
    });
  } else joinRoom();
}
requestAnimationFrame(frame);
