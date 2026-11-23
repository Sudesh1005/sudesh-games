// Kaathu Riders: menu, race flow (single player and online), traffic collisions, near misses, camera, HUD and the main loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ROUTES, THEMES, Road, buildRoadScene } from './road.js';
import { BIKES, PAINTS, Bike } from './bike.js';
import { Rider } from './ai.js';
import { Traffic } from './traffic.js';
import { Input } from './input.js';
import { RaceAudio } from './audio.js';
import { loadRiders } from './models.js';
import { Room, cleanCode, cleanName, MAX_PLAYERS } from './net.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ordinal = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
function fmtTime(s) {
  if (s == null || !isFinite(s)) return '--:--.---';
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + r.toFixed(3).padStart(6, '0');
}
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const LOW = isTouch || params.has('low');
document.body.classList.toggle('touch', isTouch);
const TIME_SCALE = clamp(+params.get('speed') || 1, 0.1, 20); // testing aid
const DEBUG = params.has('debug');

/* ------------------------------------------------------------------ saved settings + records */
// online races: only the players' bikes; the host can add road traffic
const NET_TRAFFIC = ['none', 'light', 'normal', 'heavy'];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};
const S = Object.assign({ route: 0, bike: 1, paint: 0, mode: 'race', traffic: 'normal', diff: 'normal', cam: 0, name: '', netTraffic: 'none' }, store.get('kaathu-settings', {}));
if (params.has('route')) S.route = +params.get('route');
S.route = clamp(S.route | 0, 0, ROUTES.length - 1); S.bike = clamp(S.bike | 0, 0, BIKES.length - 1);
S.paint = clamp(S.paint | 0, 0, PAINTS.length - 1); S.cam = clamp(S.cam | 0, 0, 2);
if (!['race', 'tt'].includes(S.mode)) S.mode = 'race';
if (!['light', 'normal', 'heavy'].includes(S.traffic)) S.traffic = 'normal';
if (!['easy', 'normal', 'hard'].includes(S.diff)) S.diff = 'normal';
if (!NET_TRAFFIC.includes(S.netTraffic)) S.netTraffic = 'none';
const saveSettings = () => store.set('kaathu-settings', S);
const BEST = store.get('kaathu-best', {});
const saveBest = () => store.set('kaathu-best', BEST);

/* ------------------------------------------------------------------ renderer, scene, lights */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.3 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 2000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = !LOW;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 500 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
const headlight = new THREE.SpotLight(0xfff0d0, 0, 80, 0.45, 0.5, 1.2);
scene.add(hemi, sun, sun.target, headlight, headlight.target);

const input = new Input();
const audio = new RaceAudio();
const ROUTE_LEN = ROUTES.map((d) => new Road(d).length);
const RIVALS = ['Arjun', 'Meena', 'Karthik', 'Priya', 'Vikram', 'Divya', 'Surya', 'Kavya', 'Rahul', 'Nila'];
const SKILL = { easy: [0.8, 0.87], normal: [0.88, 0.94], hard: [0.94, 0.99] };

const G = {
  state: 'boot', road: null, world: null, traffic: null, bikes: [], riders: [], order: [], player: null, preview: null,
  t: 0, countdown: 0, lastCount: 3, mode: 'race', night: false, env: 1, sunDir: new THREE.Vector3(0, 1, 0),
  autopilot: null, resultsT: 0, prevState: null, menuAng: 0, best: null, boardT: 0, newRecord: false, combo: 0, comboT: 0,
  online: false, room: null, sendT: 0, seq: 0, resultsShown: false, refreshT: 0, dots: [],
};
let room = null; // the online room we're in (null when playing alone)
window.__kaathu = G;

/* ------------------------------------------------------------------ world loading */
function disposeObj(o) {
  o.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) { for (const k in mt) { const v = mt[k]; if (v && v.isTexture) v.dispose(); } mt.dispose(); }
  });
}
function applyTheme(th) {
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  scene.background = new THREE.Color(th.fog);
  hemi.color.set(th.hemiSky); hemi.groundColor.set(th.hemiGround); hemi.intensity = th.hemiInt;
  sun.color.set(th.sun); sun.intensity = th.sunInt;
  G.sunDir.set(...th.sunDir).normalize();
  renderer.toneMappingExposure = th.exposure;
  G.night = th.night; G.env = th.env;
}
function clearRace() {
  for (const b of G.bikes) { scene.remove(b.mesh); disposeObj(b.mesh); }
  if (G.traffic) { G.traffic.dispose(); G.traffic = null; }
  G.bikes = []; G.riders = []; G.order = []; G.player = null; G.autopilot = null;
  $('strip-dots').innerHTML = '';
}
function clearPreview() { if (G.preview) { scene.remove(G.preview.mesh); disposeObj(G.preview.mesh); G.preview = null; } }
function loadRoute(ri) {
  clearRace(); clearPreview();
  if (G.world) { scene.remove(G.world); disposeObj(G.world); }
  G.road = new Road(ROUTES[ri]);
  G.world = buildRoadScene(G.road, { low: LOW, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  scene.add(G.world);
  applyTheme(G.road.theme);
}
function setPreview() {
  clearPreview();
  const b = new Bike(BIKES[S.bike], PAINTS[S.paint], { env: G.env, low: LOW });
  b.place(G.road, G.road.startS + 14, -1.5);
  b.sync(0, G.night);
  scene.add(b.mesh);
  G.preview = b;
}

/* ------------------------------------------------------------------ race setup */
// A floating name label above another player's bike.
function nameTag(name, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,8,26,0.72)';
  g.beginPath(); if (g.roundRect) g.roundRect(4, 8, 248, 48, 14); else g.rect(4, 8, 248, 48); g.fill();
  g.fillStyle = hex(color); g.beginPath(); g.arc(30, 32, 9, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.font = 'bold 28px Rubik, Arial, sans-serif'; g.textBaseline = 'middle';
  g.fillText(name, 48, 33, 196);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sp.scale.set(2.8, 0.7, 1); sp.position.y = 2.35;
  return sp;
}

function buildDots() {
  $('strip-dots').innerHTML = G.bikes.map((b, k) => `<i data-k="${k}" class="${b.isPlayer ? 'me' : ''}" style="background:${hex(b.color)}"></i>`).join('');
  G.dots = [...$('strip-dots').children];
}

function setupRace() {
  G.online = false;
  clearRace(); clearPreview();
  const r = G.road;
  G.mode = S.mode;
  G.traffic = new Traffic(r, S.traffic, scene, { low: LOW, env: G.env });
  const names = shuffle(RIVALS.slice()), colors = shuffle(PAINTS.filter((_, k) => k !== S.paint));
  const entries = [];
  if (G.mode === 'race') for (let k = 0; k < 5; k++) entries.push({ stats: BIKES[(S.bike + 1 + k) % BIKES.length], color: colors[k % colors.length], name: names[k] });
  entries.push({ stats: BIKES[S.bike], color: PAINTS[S.paint], name: 'You', player: true });
  const cols = [-r.half * 0.62, -r.half * 0.12, r.half * 0.38];
  entries.forEach((e, k) => {
    const row = Math.floor(k / 3), col = k % 3;
    const b = new Bike(e.stats, e.color, { env: G.env, low: LOW });
    b.name = e.name; b.isPlayer = !!e.player;
    b.place(r, r.startS - 10 - row * 9 - col * 1.5, G.mode === 'race' ? cols[col] : r.laneLat(0));
    b.sync(0, G.night);
    scene.add(b.mesh); G.bikes.push(b);
    if (b.isPlayer) G.player = b;
  });
  const [lo, hi] = SKILL[S.diff] || SKILL.normal;
  const ai = G.bikes.filter((b) => !b.isPlayer);
  G.riders = ai.map((b, k) => new Rider(b, r, G.traffic, lo + ((hi - lo) * k) / Math.max(1, ai.length - 1)));
  beginRace();
}

// Shared by single player and online races, once the bikes are on the grid.
function beginRace() {
  const r = G.road;
  G.autopilot = params.has('bot') ? new Rider(G.player, r, G.traffic, 0.95) : null;
  buildDots();
  G.resultsShown = false; G.sendT = 0;
  G.t = 0; G.countdown = 3; G.lastCount = 3; G.resultsT = 0; G.newRecord = false; G.combo = 0; G.comboT = 0;
  G.best = BEST[r.def.id] || null;
  G.state = 'countdown';
  physAcc = 0;
  $('results').classList.add('hidden'); $('pause').classList.add('hidden'); $('lobby').classList.add('hidden'); $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  document.body.classList.add('racing');
  document.body.classList.toggle('online', G.online);
  $('board').classList.toggle('hidden', G.mode === 'tt');
  $('posbox').classList.toggle('hidden', G.mode === 'tt');
  $('h-of').textContent = '/' + G.bikes.length;
  updateCamera(0, true);
  big('3'); audio.beep(520, 0.16);
}
function startRace() {
  audio.init();
  $('menu').classList.add('hidden');
  document.body.classList.add('racing');
  setupRace();
}
function showMenu() {
  G.state = 'menu'; G.online = false;
  clearRace();
  setPreview();
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('results').classList.add('hidden');
  document.body.classList.remove('racing', 'online');
  audio.silence();
  buildMenu();
}

/* ------------------------------------------------------------------ menu UI */
function buildMenu() {
  const rw = $('m-routes'); rw.innerHTML = '';
  ROUTES.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'tcard' + (i === S.route ? ' on' : '');
    const best = BEST[d.id] && BEST[d.id].time;
    const lanes = d.lanes[1] ? `${d.lanes[0]}+${d.lanes[1]} lanes, two-way` : `${d.lanes[0]} lanes, one-way`;
    b.innerHTML = `<b>${d.name}</b><span>${d.blurb}</span><em>${THEMES[d.theme].label} · ${(ROUTE_LEN[i] / 1000).toFixed(1)} km · ${lanes}</em><i>${best ? 'Best time ' + fmtTime(best) : 'No record yet'}</i>`;
    b.onclick = () => { if (S.route === i) return; S.route = i; saveSettings(); loadRoute(i); setPreview(); buildMenu(); };
    rw.appendChild(b);
  });
  const bw = $('m-bikes'); bw.innerHTML = '';
  const bar = (label, v) => `<div class="stat">${label}<div class="bar"><i style="width:${Math.round(clamp(v, 0.08, 1) * 100)}%"></i></div></div>`;
  BIKES.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'ccard' + (i === S.bike ? ' on' : '');
    b.innerHTML = `<b>${c.name}</b><span>${c.desc}</span>${bar('SPD', (c.vmax - 44) / 22)}${bar('ACC', (c.accel - 12) / 6.5)}${bar('GRIP', (c.grip - 17) / 9)}`;
    b.onclick = () => { S.bike = i; saveSettings(); setPreview(); buildMenu(); if (room) room.setProfile(S.bike, S.paint); };
    bw.appendChild(b);
  });
  const pw = $('m-paints'); pw.innerHTML = '';
  PAINTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i === S.paint ? ' on' : '');
    b.style.background = hex(p); b.setAttribute('aria-label', 'Paint colour ' + (i + 1));
    b.onclick = () => { S.paint = i; saveSettings(); setPreview(); buildMenu(); if (room) room.setProfile(S.bike, S.paint); };
    pw.appendChild(b);
  });
  seg('o-mode', S.mode, (v) => { S.mode = v; });
  seg('o-traffic', S.traffic, (v) => { S.traffic = v; });
  seg('o-diff', S.diff, (v) => { S.diff = v; });
  $('o-diff').classList.toggle('dis', S.mode !== 'race');
  $('start').textContent = S.mode === 'race' ? 'START RACE' : 'START TIME TRIAL';
  $('online').textContent = room ? 'BACK TO ONLINE ROOM ' + room.code : 'PLAY ONLINE WITH FRIENDS';
}
function seg(id, value, pick) {
  $(id).querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => { pick(b.dataset.v); saveSettings(); buildMenu(); };
  });
}

/* ------------------------------------------------------------------ online lobby */
const TRAFFIC_LABEL = { none: 'No traffic', light: 'Light traffic', normal: 'Normal traffic', heavy: 'Heavy traffic' };
function lbStatus(text, isErr = false) { const st = $('lb-status'); st.textContent = text; st.classList.toggle('err', isErr); }
function lbView(which) { $('lb-entry').classList.toggle('hidden', which !== 'entry'); $('lb-room').classList.toggle('hidden', which !== 'room'); }
function lbBusy(on) { for (const id of ['lb-create', 'lb-joinbtn']) $(id).disabled = on; }

function openOnline(code) {
  audio.init();
  $('lobby').classList.remove('hidden');
  $('lb-name').value = S.name;
  if (code) $('lb-code').value = cleanCode(code);
  if (room) { lbView('room'); renderLobby(room.players, room.info, room.state); }
  else { lbView('entry'); lbStatus(''); }
}

function takeName() {
  const name = cleanName($('lb-name').value);
  if (!name) { lbStatus('Type your name first, so the others know who you are.', true); $('lb-name').focus(); return null; }
  S.name = name; saveSettings();
  return name;
}

function makeRoom() {
  return new Room({ onLobby: renderLobby, onStart: onlineStart, onState: onNetState, onLeave: onNetLeave, onClosed: onNetClosed });
}

async function createRoom() {
  const name = takeName();
  if (!name) return;
  lbBusy(true); lbStatus('Creating your room…');
  const r = makeRoom();
  try {
    await r.create({ name, bike: S.bike, paint: S.paint });
    room = r; G.room = r;
    r.setInfo({ route: S.route, traffic: S.netTraffic });
    lbView('room'); lbStatus('');
    buildMenu();
  } catch (e) { r.leave(); lbStatus(e.message, true); }
  lbBusy(false);
}

async function joinRoom() {
  const name = takeName();
  if (!name) return;
  const code = cleanCode($('lb-code').value);
  $('lb-code').value = code;
  if (code.length !== 6) { lbStatus('Room codes have 6 letters and numbers.', true); return; }
  lbBusy(true); lbStatus('Joining room ' + code + '…');
  const r = makeRoom();
  room = r; G.room = r; // set before connecting so the first lobby message renders
  try {
    await r.join(code, { name, bike: S.bike, paint: S.paint });
    lbView('room'); lbStatus('');
    buildMenu();
  } catch (e) { room = null; G.room = null; lbView('entry'); lbStatus(e.message, true); }
  lbBusy(false);
}

function leaveRoom() {
  if (room) room.leave();
  room = null; G.room = null;
  $('lobby').classList.add('hidden');
  if (G.state !== 'menu') showMenu(); else buildMenu();
}

function renderLobby(players, info, state) {
  if (!room) return;
  $('lb-codeshow').textContent = room.code;
  $('lb-players').innerHTML = players.map((p) =>
    `<li><i class="dot" style="background:${hex(PAINTS[p.paint] ?? PAINTS[0])}"></i><b>${esc(p.name)}</b><span>${esc((BIKES[p.bike] || BIKES[0]).name)}</span>` +
    `${p.host ? '<em>HOST</em>' : ''}${p.id === room.me ? '<em class="you">YOU</em>' : ''}</li>`).join('') +
    (players.length < MAX_PLAYERS ? `<li class="empty">${MAX_PLAYERS - players.length} more can join</li>` : '');
  const ri = clamp((info.route ?? S.route) | 0, 0, ROUTES.length - 1);
  const tr = NET_TRAFFIC.includes(info.traffic) ? info.traffic : 'none';
  if (room.isHost) {
    $('lb-setup').innerHTML =
      `<label>ROUTE</label><div class="seg">${ROUTES.map((d, i) => `<button data-i="${i}" class="${i === ri ? 'on' : ''}">${d.name}</button>`).join('')}</div>` +
      `<label>ROAD TRAFFIC</label><div class="seg">${NET_TRAFFIC.map((v) => `<button data-t="${v}" class="${v === tr ? 'on' : ''}">${v === 'none' ? 'Off' : v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div>`;
    $('lb-setup').querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => {
      const i = +b.dataset.i; if (i === ri) return;
      S.route = i; saveSettings(); if (G.state === 'menu') { loadRoute(i); setPreview(); buildMenu(); }
      room.setInfo({ route: i, traffic: tr });
    }));
    $('lb-setup').querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { S.netTraffic = b.dataset.t; saveSettings(); room.setInfo({ route: ri, traffic: S.netTraffic }); }));
    const n = players.length;
    $('lb-start').classList.remove('hidden');
    $('lb-start').disabled = n < 2;
    $('lb-start').textContent = n < 2 ? 'WAITING FOR PLAYERS…' : `START RACE (${n} PLAYERS)`;
    $('lb-wait').textContent = n < 2 ? 'Send the code or link to your friends. Start when everyone has joined.' : '';
  } else {
    $('lb-setup').innerHTML = `<p class="lb-info">Route: <b>${esc(ROUTES[ri].name)}</b> · ${TRAFFIC_LABEL[tr]} <span>(the host chooses)</span></p>`;
    $('lb-start').classList.add('hidden');
    $('lb-wait').textContent = state === 'racing' ? 'A race is running. You\'ll join the next one.' : 'Waiting for the host to start the race…';
    // show the chosen route behind the menu
    if (G.state === 'menu' && S.route !== ri) { S.route = ri; loadRoute(ri); setPreview(); buildMenu(); }
  }
}

function hostStart() {
  if (!room || !room.isHost || room.players.length < 2) return;
  room.setInfo({ route: S.route, traffic: S.netTraffic });
  // players who picked the same colour get a different free one, so every bike is easy to tell apart
  const used = new Set();
  const grid = room.players.map((p) => {
    let paint = p.paint;
    if (used.has(paint)) paint = PAINTS.findIndex((_, k) => !used.has(k));
    used.add(paint);
    return { id: p.id, name: p.name, bike: p.bike, paint };
  });
  room.start(shuffle(grid));
}

// Online race: only the players' bikes (no computer riders), on the host's route, with the host's traffic setting.
function onlineStart(m) {
  audio.init();
  G.online = true;
  const ri = clamp(m.route | 0, 0, ROUTES.length - 1);
  if (!G.road || G.road.def !== ROUTES[ri]) { S.route = ri; loadRoute(ri); }
  clearRace(); clearPreview();
  const r = G.road;
  G.mode = 'online';
  G.traffic = new Traffic(r, NET_TRAFFIC.includes(m.traffic) ? m.traffic : 'none', scene, { low: LOW, env: G.env });
  const cols = [-r.half * 0.62, -r.half * 0.12, r.half * 0.38];
  m.grid.slice(0, MAX_PLAYERS).forEach((p, k) => {
    const row = Math.floor(k / 3), col = k % 3;
    const b = new Bike(BIKES[p.bike] || BIKES[0], PAINTS[p.paint] ?? PAINTS[0], { env: G.env, low: LOW });
    b.name = cleanName(p.name) || 'Player'; b.netId = p.id;
    b.isPlayer = p.id === room.me; b.remote = !b.isPlayer;
    b.place(r, r.startS - 10 - row * 9 - col * 1.5, cols[col]);
    if (b.remote) { b.snaps = []; b.mesh.add(nameTag(b.name, b.color)); }
    b.sync(0, G.night);
    scene.add(b.mesh); G.bikes.push(b);
    if (b.isPlayer) G.player = b;
  });
  if (!G.player) return; // we weren't in this race's grid
  G.riders = [];
  beginRace();
}

function onNetState(id, st) {
  if (!G.online) return;
  const b = G.bikes.find((x) => x.remote && x.netId === id);
  if (!b) return;
  b.snaps.push(Object.assign({ at: performance.now() }, st));
  if (b.snaps.length > 40) b.snaps.shift();
}

function onNetLeave(id, name) {
  if (!G.online) return;
  const b = G.bikes.find((x) => x.remote && x.netId === id);
  if (b) { scene.remove(b.mesh); disposeObj(b.mesh); G.bikes = G.bikes.filter((x) => x !== b); buildDots(); $('h-of').textContent = '/' + G.bikes.length; }
  msg(`${name} left the race`, 2.5);
}

function onNetClosed(reason) {
  room = null; G.room = null;
  if (G.state !== 'menu') showMenu(); else buildMenu();
  openOnline();
  lbStatus(reason, true);
}

// My bike's state for the other players (small numbers keep the messages light).
function stateOf(P) {
  const r = (v, d = 2) => +v.toFixed(d);
  return {
    n: ++G.seq, x: r(P.x), z: r(P.z), h: r(P.h, 3), vx: r(P.vx), vz: r(P.vz), st: r(P.steer), b: P.boosting ? 1 : 0, k: P.input.brake ? 1 : 0,
    c: P.crashed ? P.crashSide : 0, g: P.ghost > 0 ? 1 : 0, s: r(P.s, 1), cr: P.crashes, nm: P.nearMiss,
    f: P.finished ? 1 : 0, ft: P.finished ? r(P.finishTime, 3) : 0,
  };
}

// Place another player's bike between the two network updates around "now - 120 ms" (smooth even with jittery updates).
function netPose(b) {
  const sn = b.snaps;
  if (!sn.length) return;
  const rt = performance.now() - 120;
  let a = null, c = null;
  for (let k = sn.length - 1; k >= 0; k--) if (sn[k].at <= rt) { a = sn[k]; c = sn[k + 1] || null; break; }
  if (!a) { a = sn[0]; c = null; }
  let x, z, h;
  if (c) {
    const f = clamp((rt - a.at) / Math.max(1, c.at - a.at), 0, 1);
    x = a.x + (c.x - a.x) * f; z = a.z + (c.z - a.z) * f; h = a.h + wrapAngle(c.h - a.h) * f;
  } else {
    const e = clamp((rt - a.at) / 1000, 0, 0.25);
    x = a.x + a.vx * e; z = a.z + a.vz * e; h = a.h;
  }
  const L = sn[sn.length - 1];
  b.x = x; b.z = z; b.h = h; b.fx = Math.sin(h); b.fz = Math.cos(h);
  b.vx = L.vx; b.vz = L.vz; b.speed = Math.hypot(L.vx, L.vz); b.fwd = b.speed;
  b.steer = L.st; b.boosting = !!L.b; b.input.brake = L.k;
  b.crashed = !!L.c; if (L.c) b.crashSide = L.c;
  b.ghost = L.g ? 1 : 0;
  b.s = L.s; b.crashes = L.cr | 0; b.nearMiss = L.nm | 0;
  if (L.f && !b.finished) { b.finished = true; b.finishTime = L.ft; }
  G.road.locate(b.x, b.z, b.loc);
  while (sn.length > 3 && sn[1].at < rt - 400) sn.shift();
}

/* ------------------------------------------------------------------ messages */
let msgTimer = 0;
function msg(text, secs = 2) { const m = $('msg'); m.textContent = text; m.classList.add('show'); msgTimer = secs; }
function big(text, cls = '') {
  const b = $('big');
  b.textContent = text; b.className = cls;
  void b.offsetWidth;
  b.classList.add('show');
}
function combo(text) {
  const c = $('combo');
  c.textContent = text; c.classList.remove('show');
  void c.offsetWidth;
  c.classList.add('show');
}

/* ------------------------------------------------------------------ race logic */
function rankCmp(a, b) {
  if (a.finished && b.finished) return a.finishTime - b.finishTime;
  if (a.finished) return -1;
  if (b.finished) return 1;
  return b.s - a.s;
}
function rubber(b) {
  if (G.mode !== 'race' || !G.player) return 1;
  return clamp(1 + (G.player.s - b.s) * 0.0003, 0.92, 1.08);
}

// Bike against traffic: scrape along the side, crash into it, or score a near miss.
function trafficContact(b) {
  if (b.crashed || b.finished) return;
  const r = G.road, i = b.loc.i, tx = r.tx[i], tz = r.tz[i];
  const along = b.vx * tx + b.vz * tz;
  for (const v of G.traffic.list) {
    if (!v.active) continue;
    const ds = b.s - v.s;
    if (ds > v.hl + 4 || ds < -v.hl - 4) { if (b.isPlayer) v.near = 0; continue; }
    const dl = b.loc.lat - v.lat;
    const lonPen = v.hl + 0.95 - Math.abs(ds), latPen = v.hw + 0.35 - Math.abs(dl);
    if (lonPen > 0 && latPen > 0) {
      if (b.ghost > 0) continue;
      const rel = Math.abs(along - v.speed * v.dir);
      if (latPen < lonPen && latPen < 0.45 && rel < 12) {
        // brushed the side: knocked sideways
        const sg = Math.sign(dl) || 1;
        b.x += r.rx[i] * sg * latPen; b.z += r.rz[i] * sg * latPen; b.loc.lat += sg * latPen;
        const vl = b.vx * r.rx[i] + b.vz * r.rz[i];
        if (vl * sg < 0) { b.vx -= r.rx[i] * vl * 1.4; b.vz -= r.rz[i] * vl * 1.4; }
        b.impact = Math.max(b.impact, 4);
      } else if (rel > 7) {
        if (b.crash()) {
          if (b.isPlayer) { audio.crash(1); cam.shake = 0.6; G.combo = 0; msg('CRASH!', 1.4); if (Math.random() < 0.7) audio.honk(v.type === 'bus' || v.type === 'truck'); }
          const k = 0.35; b.vx = b.vx * k + tx * v.speed * v.dir * (1 - k); b.vz = b.vz * k + tz * v.speed * v.dir * (1 - k);
        }
        return;
      } else {
        // bumped from behind at low speed: match its speed
        const target = v.speed * v.dir, dv = target - along;
        b.vx += tx * dv; b.vz += tz * dv;
        const push = Math.sign(ds) * lonPen;
        b.x += tx * push; b.z += tz * push;
      }
    }
    if (b.isPlayer) {
      const close = Math.abs(dl) < v.hw + 1.7;
      if (Math.abs(ds) < v.hl + 1) { if (close) v.near = 1; }
      else if (v.near) { if (ds > 0 && b.speed > 18) nearMiss(v); v.near = 0; }
    }
  }
}

function nearMiss(v) {
  const P = G.player;
  G.combo = G.comboT > 0 ? G.combo + 1 : 1; G.comboT = 3;
  P.nearMiss++;
  P.nitro = Math.min(1, P.nitro + 0.12 + Math.min(G.combo, 5) * 0.02);
  combo(G.combo > 1 ? `NEAR MISS x${G.combo}` : 'NEAR MISS');
  audio.whoosh();
  if (Math.random() < 0.35) audio.honk(v.type === 'bus' || v.type === 'truck');
}

function bikeContacts() {
  const bs = G.bikes;
  for (let a = 0; a < bs.length; a++) for (let c = a + 1; c < bs.length; c++) {
    const A = bs[a], B = bs[c];
    if (A.crashed || B.crashed || (A.remote && B.remote) || A.ghost > 0 || B.ghost > 0) continue;
    const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz) || 0.001, pen = 1.3 - d;
    if (pen <= 0) continue;
    const nx = dx / d, nz = dz / d;
    // another player's bike is moved by their own screen: only push ours
    const wa = A.remote ? 0 : B.remote ? 1 : 0.5, wb = 1 - wa;
    A.x -= nx * pen * wa; A.z -= nz * pen * wa; B.x += nx * pen * wb; B.z += nz * pen * wb;
    const vrel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
    if (vrel < 0) {
      const j = -1.2 * vrel;
      if (!A.remote) { A.vx -= j * wa * nx; A.vz -= j * wa * nz; A.impact = Math.max(A.impact, -vrel); }
      if (!B.remote) { B.vx += j * wb * nx; B.vz += j * wb * nz; B.impact = Math.max(B.impact, -vrel); }
    }
  }
}

// After a crash, put the rider back on the road in the clearest lane.
function respawn(b) {
  const r = G.road;
  let bestLat = r.laneLat(0), bestGap = -1;
  for (let k = 0; k < r.same; k++) {
    const lat = r.laneLat(k);
    let gap = 60;
    for (const v of G.traffic.list) if (v.active && Math.abs(v.lat - lat) < 2.2) gap = Math.min(gap, Math.abs(v.s - b.s) - v.hl);
    if (gap > bestGap) { bestGap = gap; bestLat = lat; }
  }
  b.place(r, Math.max(5, b.s), bestLat);
  b.vx = b.fx * 8; b.vz = b.fz * 8;
  b.ghost = 2;
  if (b.isPlayer) updateCamera(0, true);
}

function playerFinished() {
  const P = G.player, r = G.road;
  G.state = 'done'; G.resultsT = 2.8;
  big(G.mode !== 'tt' && [...G.bikes].sort(rankCmp)[0] === P ? 'WINNER!' : 'FINISH', 'go');
  audio.beep(660, 0.2); setTimeout(() => audio.beep(990, 0.4), 180);
  if (!G.autopilot) G.autopilot = new Rider(P, r, G.traffic, 0.8);
  const b = BEST[r.def.id] || (BEST[r.def.id] = { time: null, nm: 0 });
  if (G.mode !== 'online' && (!b.time || P.finishTime < b.time)) { b.time = P.finishTime; G.newRecord = true; }
  b.nm = Math.max(b.nm || 0, P.nearMiss);
  saveBest();
}

/* ------------------------------------------------------------------ camera + lights */
const cam = { pos: new THREE.Vector3(), h: 0, fov: 62, shake: 0 };
const tmpV = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  const P = G.player;
  if (!P) return;
  if (!P.crashed) cam.h = snap ? P.h : cam.h + wrapAngle(P.h - cam.h) * (1 - Math.exp(-dt * 5));
  const r = P.speed / P.stats.vmax;
  const fx = Math.sin(cam.h), fz = Math.cos(cam.h);
  if (S.cam === 2 && !P.crashed) {
    const rx = -Math.cos(P.h), rz = Math.sin(P.h), lx = Math.sin(P.lean) * 1.5;
    camera.position.set(P.x + Math.sin(P.h) * 0.35 + rx * lx, 1.55 * Math.cos(P.lean) + P.stats.size * 0.1, P.z + Math.cos(P.h) * 0.35 + rz * lx);
    camera.lookAt(P.x + Math.sin(P.h) * 30, 0.9, P.z + Math.cos(P.h) * 30);
    camera.rotateZ(-P.lean * 0.7);
  } else {
    const dist = (S.cam === 1 ? 8 : 4.7) + r * 1.1, ht = S.cam === 1 ? 3.1 : 1.8;
    tmpV.set(P.x - fx * dist, ht, P.z - fz * dist);
    if (snap) cam.pos.copy(tmpV); else cam.pos.lerp(tmpV, 1 - Math.exp(-dt * 10));
    camera.position.copy(cam.pos);
    if (cam.shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake;
      cam.shake *= Math.exp(-dt * 6);
    }
    camera.lookAt(P.x + fx * 3, 1.1, P.z + fz * 3);
    if (!P.crashed) camera.rotateZ(-P.lean * 0.18);
  }
  const fov = 62 + r * 14 + (P.boosting ? 8 : 0);
  cam.fov = snap ? fov : cam.fov + (fov - cam.fov) * (1 - Math.exp(-dt * 3));
  camera.fov = cam.fov; camera.updateProjectionMatrix();
}
function followLights(b) {
  sun.position.set(b.x + G.sunDir.x * 250, G.sunDir.y * 250, b.z + G.sunDir.z * 250);
  sun.target.position.set(b.x, 0, b.z);
  if (G.night && !b.crashed) {
    const fx = Math.sin(b.h), fz = Math.cos(b.h);
    headlight.position.set(b.x + fx * 1.0, 1.0, b.z + fz * 1.0);
    headlight.target.position.set(b.x + fx * 28, 0, b.z + fz * 28);
    headlight.intensity = 220;
  } else headlight.intensity = 0;
  for (const o of G.world.userData.follow) o.position.set(camera.position.x, 0, camera.position.z);
}

/* ------------------------------------------------------------------ HUD */
const txt = {};
function setT(id, v) { if (txt[id] !== v) { txt[id] = v; $(id).textContent = v; } }
function updateHUD(dt) {
  const P = G.player, r = G.road;
  setT('h-spd', String(Math.round(P.speed * 3.6)));
  $('h-nitro').style.width = (P.nitro * 100).toFixed(1) + '%';
  $('speedo').classList.toggle('boost', P.boosting);
  const pos = G.order.indexOf(P) + 1;
  setT('h-pos', String(pos)); setT('h-posx', ordinal(pos));
  const left = Math.max(0, r.finishS - P.s);
  setT('h-dist', left >= 1000 ? (left / 1000).toFixed(2) + ' km' : Math.round(left) + ' m');
  setT('h-time', fmtTime(G.t));
  setT('h-best', fmtTime(G.best && G.best.time));
  setT('h-nm', String(P.nearMiss));
  const span = r.finishS - r.startS + 60;
  G.bikes.forEach((b, k) => { G.dots[k].style.left = (clamp((b.s - r.startS + 60) / span, 0, 1) * 100).toFixed(2) + '%'; });
  G.boardT -= dt;
  if (G.mode !== 'tt' && G.boardT <= 0) {
    G.boardT = 0.3;
    $('board').innerHTML = G.order.map((b, k) => `<li class="${b.isPlayer ? 'me' : ''}${b.crashed ? ' down' : ''}"><b>${k + 1}</b><i style="background:${hex(b.color)}"></i>${esc(b.name)}</li>`).join('');
  }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').classList.remove('show'); }
}

function showResults() {
  const r = G.road, P = G.player, order = [...G.bikes].sort(rankCmp);
  const est = (b) => {
    if (b.finished) return b.finishTime;
    const v = Math.max(15, (b.s - (r.startS - 30)) / Math.max(1, G.t));
    return G.t + Math.max(0, r.finishS - b.s) / v;
  };
  let rows;
  if (G.mode === 'online') {
    // real times only: riders still on the road show how far they have to go
    const lead = order[0].finished ? order[0].finishTime : null;
    const cell = (b, k) => {
      if (!b.finished) { const left = Math.max(0, r.finishS - b.s); return `<span class="racing">riding · ${left >= 1000 ? (left / 1000).toFixed(1) + ' km' : Math.round(left) + ' m'} to go</span>`; }
      return k === 0 ? fmtTime(b.finishTime) : '+' + (b.finishTime - lead).toFixed(3);
    };
    rows = '<tr><th>#</th><th>Rider</th><th>Time</th><th>Crashes</th></tr>' + order.map((b, k) =>
      `<tr class="${b.isPlayer ? 'me' : ''}"><td>${k + 1}</td><td><i class="dot" style="background:${hex(b.color)}"></i>${esc(b.name)}</td>` +
      `<td>${cell(b, k)}</td><td>${b.crashes}</td></tr>`).join('');
    const pos = order.indexOf(P) + 1;
    $('r-title').textContent = pos === 1 ? 'YOU WIN!' : `${pos}${ordinal(pos).toUpperCase()} PLACE`;
  } else if (G.mode === 'race') {
    const lead = est(order[0]);
    rows = '<tr><th>#</th><th>Rider</th><th>Time</th><th>Crashes</th></tr>' + order.map((b, k) =>
      `<tr class="${b.isPlayer ? 'me' : ''}"><td>${k + 1}</td><td><i class="dot" style="background:${hex(b.color)}"></i>${b.name}</td>` +
      `<td>${k === 0 ? fmtTime(lead) : '+' + (est(b) - lead).toFixed(3)}</td><td>${b.crashes}</td></tr>`).join('');
    const pos = order.indexOf(P) + 1;
    $('r-title').textContent = pos === 1 ? 'YOU WIN!' : `${pos}${ordinal(pos).toUpperCase()} PLACE`;
  } else {
    rows = `<tr><th>Time</th><th>Near misses</th><th>Crashes</th></tr><tr class="me"><td>${fmtTime(P.finishTime)}</td><td>${P.nearMiss}</td><td>${P.crashes}</td></tr>`;
    $('r-title').textContent = 'TIME TRIAL';
  }
  $('r-table').innerHTML = rows;
  const b = BEST[r.def.id] || {};
  $('r-sub').innerHTML = `${r.def.name} · <b>${fmtTime(P.finishTime)}</b> · ${P.nearMiss} near misses · ${P.crashes} crashes` +
    (G.newRecord ? ' · <span class="rec">NEW RECORD!</span>' : '') +
    (G.mode === 'online' ? `<br>Online room <b>${room ? room.code : ''}</b>` : `<br>Route record: <b>${fmtTime(b.time)}</b>`);
  $('r-again').textContent = G.mode === 'online' ? 'BACK TO LOBBY' : 'RIDE AGAIN';
  $('r-next').classList.toggle('hidden', G.mode === 'online');
  $('r-menu').textContent = G.mode === 'online' ? 'LEAVE ROOM' : 'MENU';
  $('results').classList.remove('hidden');
  G.resultsShown = true;
}

/* ------------------------------------------------------------------ pause */
function pause() {
  if (G.state !== 'race' && G.state !== 'countdown') return;
  G.prevState = G.state; G.state = 'paused';
  $('pause').classList.remove('hidden');
  $('p-restart').classList.toggle('hidden', G.online);
  $('p-menu').textContent = G.online ? 'LEAVE ROOM' : 'QUIT TO MENU';
  $('p-note').classList.toggle('hidden', !G.online);
  $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF');
  audio.silence();
}
function resume() {
  if (G.state !== 'paused') return;
  G.state = G.prevState; $('pause').classList.add('hidden');
  last = performance.now();
}

/* ------------------------------------------------------------------ main loop */
const STEP = 1 / 120;
let last = performance.now(), physAcc = 0;

function raceFrame(dt) {
  const r = G.road, P = G.player;
  if (G.state === 'countdown') {
    G.countdown -= dt;
    const n = Math.ceil(G.countdown);
    if (n !== G.lastCount) {
      G.lastCount = n;
      if (n > 0) { big(String(n)); audio.beep(520, 0.16); }
      else { big('GO!', 'go'); audio.beep(1040, 0.45); G.state = 'race'; }
    }
  }
  const running = G.state !== 'countdown';
  if (G.autopilot && (params.has('bot') || G.state === 'done')) G.autopilot.update(dt, G.bikes, 1, running);
  else input.read(P.input);
  for (const d of G.riders) d.update(dt, G.bikes, rubber(d.bike), running);
  if (G.online) for (const b of G.bikes) if (b.remote) netPose(b);
  if (running) G.traffic.update(dt, P.s);
  else G.traffic.update(0, P.s);

  physAcc += dt;
  let steps = 0;
  while (physAcc >= STEP && steps < 240) {
    physAcc -= STEP; steps++;
    for (const b of G.bikes) if (!b.remote) b.update(STEP, r, running);
    if (!running) continue;
    bikeContacts();
    for (const b of G.bikes) if (!b.remote) trafficContact(b);
    G.t += STEP;
    for (const b of G.bikes) {
      if (b.remote) continue;
      if (b.needsRespawn) respawn(b);
      if (!b.finished && b.s >= r.finishS) { b.finished = true; b.finishTime = G.t; if (b.isPlayer) playerFinished(); }
    }
  }
  G.order = [...G.bikes].sort(rankCmp);
  for (const b of G.bikes) b.sync(dt, G.night);
  if (G.online && room) {
    G.sendT -= dt / TIME_SCALE;
    if (G.sendT <= 0) { G.sendT = 1 / 15; room.sendState(stateOf(P)); room.relay(); }
  }

  if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  if (P.impact > 3 && !P.crashed) { audio.crash(clamp(P.impact / 16, 0.12, 0.8)); cam.shake = Math.min(0.4, P.impact * 0.03); }
  for (const b of G.bikes) b.impact = 0;
  audio.update(P.crashed ? 0 : P.speed / P.stats.vmax, P.crashed ? 0 : P.input.throttle, 0, P.boosting);

  updateCamera(dt);
  followLights(P);
  updateHUD(dt);
  if (G.state === 'done' && G.resultsT > 0) { G.resultsT -= dt; if (G.resultsT <= 0) showResults(); }
  // online results keep updating as the others cross the line
  if (G.online && G.resultsShown && !$('results').classList.contains('hidden')) { G.refreshT -= dt; if (G.refreshT <= 0) { G.refreshT = 0.5; showResults(); } }
}

function menuFrame(dt) {
  const b = G.preview;
  if (!b) return;
  G.menuAng = params.has('orbit') ? +params.get('orbit') : G.menuAng + dt * 0.25;
  const a = G.menuAng, rr = +params.get('rr') || 4.6;
  camera.position.set(b.x + Math.sin(a) * rr, 1.6 + Math.sin(a * 0.7) * 0.4, b.z + Math.cos(a) * rr);
  camera.lookAt(b.x, 0.8, b.z);
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  camera.setViewOffset(innerWidth, innerHeight, innerWidth > 760 ? -innerWidth * 0.2 : 0, innerWidth > 760 ? 0 : innerHeight * 0.22, innerWidth, innerHeight);
  followLights(b);
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.05) * TIME_SCALE;
  if (G.state === 'menu') menuFrame(dt);
  else {
    if (camera.view && camera.view.enabled) camera.clearViewOffset();
    if (G.state === 'countdown' || G.state === 'race' || G.state === 'done') raceFrame(dt);
    else if (G.state === 'paused' && G.online && room) {
      // keep the others' bikes moving and keep telling them where mine is
      for (const b of G.bikes) if (b.remote) { netPose(b); b.sync(dt, G.night); }
      G.sendT -= dt; if (G.sendT <= 0) { G.sendT = 1 / 15; room.sendState(stateOf(G.player)); room.relay(); }
    }
  }
  renderer.render(scene, camera);
  if (DEBUG) {
    G.frames = (G.frames || 0) + 1;
    if (G.frames % 10 === 0) document.body.dataset.debug = JSON.stringify({ f: G.frames, state: G.state, t: +G.t.toFixed(2) });
  }
}

/* ------------------------------------------------------------------ events */
input.onPress = (code) => {
  if (code === 'KeyM') { audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); return; }
  if (!$('lobby').classList.contains('hidden')) return;
  if (G.state === 'menu') { if (code === 'Enter') startRace(); return; }
  if (!$('results').classList.contains('hidden')) { if (code === 'Enter') againBtn(); if (code === 'Escape') menuBtn(); return; }
  if (code === 'Escape' || code === 'KeyP') { if (G.state === 'paused') resume(); else pause(); return; }
  if (code === 'KeyC') { S.cam = (S.cam + 1) % 3; saveSettings(); updateCamera(0, true); }
  if (code === 'KeyH' && G.state === 'race') audio.honk(false);
  if (code === 'KeyR') resetPlayer();
};
function resetPlayer() {
  const P = G.player;
  if (G.state !== 'race' || !P || P.finished || P.crashed) return;
  respawn(P);
}

function againBtn() {
  if (G.online && room) { room.backToLobby(); showMenu(); openOnline(); }
  else setupRace();
}
function menuBtn() { if (G.online) leaveRoom(); else showMenu(); }

$('start').onclick = startRace;
$('online').onclick = () => openOnline();
$('pauseBtn').onclick = () => (G.state === 'paused' ? resume() : pause());
$('resetBtn').onclick = resetPlayer;
$('camBtn').onclick = () => { S.cam = (S.cam + 1) % 3; saveSettings(); updateCamera(0, true); };
$('p-resume').onclick = resume;
$('p-restart').onclick = () => setupRace();
$('p-menu').onclick = menuBtn;
$('p-sound').onclick = () => { audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); };
$('r-again').onclick = againBtn;
$('r-next').onclick = () => { S.route = (S.route + 1) % ROUTES.length; saveSettings(); loadRoute(S.route); setupRace(); };
$('r-menu').onclick = menuBtn;
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
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('beforeunload', () => { if (room) room.leave(); });

/* ------------------------------------------------------------------ boot */
loadRoute(S.route);
showMenu();
$('loading').classList.add('hidden');
// realistic riders: the same character models as the Kadal Nagaram city game (built-in riders until they load)
if (!params.has('simple')) {
  const files = ['player.glb', 'ped1.glb', 'ped2.glb', 'ped3.glb', 'thug.glb'];
  const heights = { 'player.glb': 1.78, 'ped1.glb': 1.72, 'ped2.glb': 1.75, 'ped3.glb': 1.73, 'thug.glb': 1.8 };
  loadRiders('../GTA-Game/models/', files, heights).then((lib) => {
    if (!lib) return;
    for (const b of G.bikes) b.upgradeRider();
    if (G.preview) G.preview.upgradeRider();
  }).catch(() => {});
}
if (params.has('room')) openOnline(params.get('room'));
if (params.has('auto')) startRace();
// testing aid: ?mp=host&name=A creates a room and starts when someone joins; ?mp=join&room=CODE&name=B joins it
if (params.get('mp') === 'host' || params.get('mp') === 'join') {
  openOnline(params.get('room'));
  $('lb-name').value = params.get('name') || 'Tester';
  if (params.get('mp') === 'host') {
    if (params.has('traffic')) S.netTraffic = params.get('traffic');
    createRoom().then(() => {
      const iv = setInterval(() => { if (room && room.players.length >= 2) { clearInterval(iv); setTimeout(hostStart, 800); } }, 300);
    });
  } else joinRoom();
}
requestAnimationFrame(frame);
