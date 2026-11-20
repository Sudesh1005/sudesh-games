// Vegam Racing: menu, race flow, camera, HUD and the main loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACKS, THEMES, Track, buildTrackScene } from './track.js';
import { CARS, PAINTS, Car } from './car.js';
import { Driver } from './ai.js';
import { Input } from './input.js';
import { RaceAudio } from './audio.js';
import { Minimap, fmtTime, ordinal, hex } from './hud.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const LOW = isTouch || params.has('low');
document.body.classList.toggle('touch', isTouch);
const TIME_SCALE = clamp(+params.get('speed') || 1, 0.1, 20); // testing aid

/* ------------------------------------------------------------------ saved settings + records */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};
const S = Object.assign({ track: 0, car: 0, paint: 0, laps: 3, mode: 'race', diff: 'normal', cam: 0 }, store.get('vegam-settings', {}));
if (params.has('track')) S.track = +params.get('track'); // testing aid
S.track = clamp(S.track | 0, 0, TRACKS.length - 1); S.car = clamp(S.car | 0, 0, CARS.length - 1);
S.paint = clamp(S.paint | 0, 0, PAINTS.length - 1); S.cam = clamp(S.cam | 0, 0, 2);
if (![2, 3, 5].includes(S.laps)) S.laps = 3;
if (!['race', 'tt'].includes(S.mode)) S.mode = 'race';
if (!['easy', 'normal', 'hard'].includes(S.diff)) S.diff = 'normal';
const saveSettings = () => store.set('vegam-settings', S);
const BEST = store.get('vegam-best', {});
const saveBest = () => store.set('vegam-best', BEST);
const bestFor = (id) => BEST[id] || (BEST[id] = { lap: null, race: {} });

/* ------------------------------------------------------------------ renderer, scene, lights */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.3 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 2600);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.castShadow = !LOW;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 500 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
const headlight = new THREE.SpotLight(0xfff0d0, 0, 90, 0.5, 0.5, 1.2);
scene.add(hemi, sun, sun.target, headlight, headlight.target);

const input = new Input();
const audio = new RaceAudio();
const minimap = new Minimap($('minimap'));
const TRACK_LEN = TRACKS.map((d) => new Track(d).length);
const RIVALS = ['Arjun', 'Meena', 'Karthik', 'Priya', 'Vikram', 'Divya', 'Surya', 'Kavya', 'Rahul', 'Nila'];
const SKILL = { easy: [0.8, 0.87], normal: [0.89, 0.95], hard: [0.95, 1.0] };

const G = {
  state: 'boot', track: null, world: null, cars: [], drivers: [], order: [], player: null, preview: null,
  t: 0, countdown: 0, lastCount: 4, laps: 3, mode: 'race', night: false, env: 1, sunDir: new THREE.Vector3(0, 1, 0),
  autopilot: null, wrongT: 0, stuckT: 0, resultsT: 0, prevState: null, menuAng: 0, bestLap: Infinity, boardT: 0, newRecord: false,
};
window.__vegam = G;

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

function clearCars() {
  for (const c of G.cars) { scene.remove(c.mesh); disposeObj(c.mesh); }
  G.cars = []; G.drivers = []; G.order = []; G.player = null; G.autopilot = null;
}
function clearPreview() { if (G.preview) { scene.remove(G.preview.mesh); disposeObj(G.preview.mesh); G.preview = null; } }

function loadTrack(ti) {
  clearCars(); clearPreview();
  if (G.world) { scene.remove(G.world); disposeObj(G.world); }
  G.track = new Track(TRACKS[ti]);
  G.world = buildTrackScene(G.track, { low: LOW, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });
  scene.add(G.world);
  applyTheme(G.track.theme);
  minimap.setTrack(G.track);
}

function setPreview() {
  clearPreview();
  const c = new Car(CARS[S.car], PAINTS[S.paint], { env: G.env, low: LOW });
  c.place(G.track, 6, 0);
  c.sync(0, G.night);
  scene.add(c.mesh);
  G.preview = c;
}

/* ------------------------------------------------------------------ race setup */
function setupRace() {
  clearCars(); clearPreview();
  const t = G.track, N = t.N;
  G.laps = S.laps; G.mode = S.mode;
  const names = shuffle(RIVALS.slice());
  const colors = shuffle(PAINTS.filter((_, k) => k !== S.paint));
  const entries = [];
  if (G.mode === 'race') for (let k = 0; k < 5; k++) entries.push({ stats: CARS[(S.car + 1 + k) % CARS.length], color: colors[k % colors.length], name: names[k] });
  entries.push({ stats: CARS[S.car], color: PAINTS[S.paint], name: 'You', player: true });
  entries.forEach((e, k) => {
    const row = k >> 1, col = k & 1;
    const c = new Car(e.stats, e.color, { env: G.env, low: LOW });
    c.name = e.name; c.isPlayer = !!e.player;
    const lat = G.mode === 'race' ? (col ? 1 : -1) * Math.min(3.4, t.half * 0.45) : 0;
    c.place(t, N - 3 - row * 5 - col * 2, lat);
    c.startProg = c.prog;
    c.sync(0, G.night);
    scene.add(c.mesh); G.cars.push(c);
    if (c.isPlayer) G.player = c;
  });
  const [lo, hi] = SKILL[S.diff] || SKILL.normal;
  const ai = G.cars.filter((c) => !c.isPlayer);
  G.drivers = ai.map((c, k) => new Driver(c, t, lo + ((hi - lo) * k) / Math.max(1, ai.length - 1)));
  G.autopilot = params.has('bot') ? new Driver(G.player, t, 0.96) : null;
  G.t = 0; G.countdown = 3; G.lastCount = 3; G.wrongT = 0; G.stuckT = 0; G.resultsT = 0; G.newRecord = false;
  G.bestLap = (BEST[t.def.id] && BEST[t.def.id].lap) || Infinity;
  G.state = 'countdown';
  physAcc = 0;
  $('results').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('board').classList.toggle('hidden', G.mode !== 'race');
  $('posbox').classList.toggle('hidden', G.mode !== 'race');
  $('h-of').textContent = '/' + G.cars.length;
  updateCamera(0, true);
  big('3');
  audio.beep(520, 0.16);
}

function startRace() {
  audio.init();
  $('menu').classList.add('hidden');
  document.body.classList.add('racing');
  setupRace();
}

function showMenu() {
  G.state = 'menu';
  clearCars();
  setPreview();
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('results').classList.add('hidden');
  document.body.classList.remove('racing');
  audio.silence();
  buildMenu();
}

/* ------------------------------------------------------------------ menu UI */
function buildMenu() {
  const tw = $('m-tracks'); tw.innerHTML = '';
  TRACKS.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'tcard' + (i === S.track ? ' on' : '');
    const best = BEST[d.id] && BEST[d.id].lap;
    b.innerHTML = `<b>${d.name}</b><span>${d.blurb}</span><em>${THEMES[d.theme].label} · ${(TRACK_LEN[i] / 1000).toFixed(2)} km</em><i>${best ? 'Best lap ' + fmtTime(best) : 'No lap record yet'}</i>`;
    b.onclick = () => { if (S.track === i) return; S.track = i; saveSettings(); loadTrack(i); setPreview(); buildMenu(); };
    tw.appendChild(b);
  });
  const cw = $('m-cars'); cw.innerHTML = '';
  const bar = (label, v) => `<div class="stat">${label}<div class="bar"><i style="width:${Math.round(clamp(v, 0.08, 1) * 100)}%"></i></div></div>`;
  CARS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'ccard' + (i === S.car ? ' on' : '');
    b.innerHTML = `<b>${c.name}</b><span>${c.desc}</span>${bar('SPD', (c.vmax - 50) / 22)}${bar('ACC', (c.accel - 14) / 12)}${bar('GRIP', (c.grip - 17) / 10)}`;
    b.onclick = () => { S.car = i; saveSettings(); setPreview(); buildMenu(); };
    cw.appendChild(b);
  });
  const pw = $('m-paints'); pw.innerHTML = '';
  PAINTS.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i === S.paint ? ' on' : '');
    b.style.background = hex(p); b.setAttribute('aria-label', 'Paint colour ' + (i + 1));
    b.onclick = () => { S.paint = i; saveSettings(); setPreview(); buildMenu(); };
    pw.appendChild(b);
  });
  seg('o-mode', S.mode, (v) => { S.mode = v; });
  seg('o-laps', S.laps, (v) => { S.laps = +v; });
  seg('o-diff', S.diff, (v) => { S.diff = v; });
  $('o-diff').classList.toggle('dis', S.mode !== 'race');
  $('start').textContent = S.mode === 'race' ? 'START RACE' : 'START TIME TRIAL';
}
function seg(id, value, pick) {
  $(id).querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === String(value));
    b.onclick = () => { pick(b.dataset.v); saveSettings(); buildMenu(); };
  });
}

/* ------------------------------------------------------------------ messages */
let msgTimer = 0;
function msg(text, secs = 2) { const m = $('msg'); m.textContent = text; m.classList.add('show'); msgTimer = secs; }
function big(text, cls = '') {
  const b = $('big');
  b.textContent = text; b.className = cls;
  void b.offsetWidth; // restart the animation
  b.classList.add('show');
}

/* ------------------------------------------------------------------ race logic */
function rankCmp(a, b) {
  if (a.finished && b.finished) return a.finishTime - b.finishTime;
  if (a.finished) return -1;
  if (b.finished) return 1;
  return b.prog - a.prog;
}

function rubber(c) {
  if (G.mode !== 'race' || !G.player) return 1;
  const gap = (G.player.prog - c.prog) * G.track.seg; // metres; > 0 means the player is ahead
  return clamp(1 + gap * 0.00025, 0.93, 1.07);
}

function progress(c) {
  const N = G.track.N, i = c.loc.i, d = i - c.idx;
  if (d < -N / 2) c.lap++;
  else if (d > N / 2) c.lap--;
  c.idx = i;
  c.prog = c.lap * N + i + c.loc.along / G.track.seg;
  if (c.lap > c.maxLap) { c.maxLap = c.lap; onLap(c); }
}

function onLap(c) {
  if (c.lap >= 2) {
    const lt = G.t - c.lapStart;
    c.lapTimes.push(lt);
    if (lt < c.bestLap) c.bestLap = lt;
    if (c.isPlayer) {
      const b = bestFor(G.track.def.id);
      if (!b.lap || lt < b.lap) { b.lap = lt; saveBest(); G.bestLap = lt; if (c.lap <= G.laps) msg('NEW BEST LAP  ' + fmtTime(lt), 2.5); }
      else if (c.lap <= G.laps) msg('LAP  ' + fmtTime(lt), 2);
    }
    c.lapStart = G.t;
  }
  if (c.lap > G.laps && !c.finished) {
    c.finished = true; c.finishTime = G.t;
    if (c.isPlayer) playerFinished();
  } else if (c.isPlayer && c.lap === G.laps && G.laps > 1) {
    big('FINAL LAP', 'final');
    audio.beep(780, 0.25);
  }
}

function playerFinished() {
  const P = G.player;
  G.state = 'done';
  G.resultsT = 2.8;
  big(G.mode === 'race' && [...G.cars].sort(rankCmp)[0] === P ? 'WINNER!' : 'FINISH', 'go');
  audio.beep(660, 0.2); setTimeout(() => audio.beep(990, 0.4), 180);
  if (!G.autopilot) G.autopilot = new Driver(P, G.track, 0.85);
  const b = bestFor(G.track.def.id), key = G.mode + G.laps;
  if (!b.race[key] || P.finishTime < b.race[key]) { b.race[key] = P.finishTime; G.newRecord = true; saveBest(); }
}

function collide() {
  const cs = G.cars, R = 1.05;
  for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
    const A = cs[a], B = cs[b];
    if (Math.abs(A.x - B.x) > 6 || Math.abs(A.z - B.z) > 6) continue;
    let bp = 0, nx = 0, nz = 0;
    for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const ax = A.x + A.fx * A.cOff * sa, az = A.z + A.fz * A.cOff * sa;
      const bx = B.x + B.fx * B.cOff * sb, bz = B.z + B.fz * B.cOff * sb;
      const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 0.001, pen = 2 * R - d;
      if (pen > bp) { bp = pen; nx = dx / d; nz = dz / d; }
    }
    if (bp <= 0) continue;
    A.x -= (nx * bp) / 2; A.z -= (nz * bp) / 2; B.x += (nx * bp) / 2; B.z += (nz * bp) / 2;
    const vrel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
    if (vrel < 0) {
      const j = (-1.3 * vrel) / 2;
      A.vx -= j * nx; A.vz -= j * nz; B.vx += j * nx; B.vz += j * nz;
      A.impact = Math.max(A.impact, -vrel); B.impact = Math.max(B.impact, -vrel);
    }
  }
}

/* ------------------------------------------------------------------ camera + lights */
const cam = { pos: new THREE.Vector3(), h: 0, fov: 62, shake: 0 };
const tmpV = new THREE.Vector3();
function updateCamera(dt, snap = false) {
  const P = G.player;
  if (!P) return;
  cam.h = snap ? P.h : cam.h + wrapAngle(P.h - cam.h) * (1 - Math.exp(-dt * 4.5));
  const r = P.speed / P.stats.vmax;
  if (S.cam === 2) {
    const fx = Math.sin(P.h), fz = Math.cos(P.h), f = P.stats.len / 2 + 0.15;
    camera.position.set(P.x + fx * f, 0.95 * P.stats.h, P.z + fz * f);
    camera.lookAt(P.x + fx * 30, 0.7, P.z + fz * 30);
  } else {
    const fx = Math.sin(cam.h), fz = Math.cos(cam.h);
    const dist = (S.cam === 0 ? 6.4 : 10.5) + r * 1.3, ht = S.cam === 0 ? 2.25 : 3.8;
    tmpV.set(P.x - fx * dist, ht, P.z - fz * dist);
    if (snap) cam.pos.copy(tmpV); else cam.pos.lerp(tmpV, 1 - Math.exp(-dt * 10));
    camera.position.copy(cam.pos);
    if (cam.shake > 0.01) {
      camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake;
      cam.shake *= Math.exp(-dt * 7);
    }
    camera.lookAt(P.x + fx * 3, 1.0, P.z + fz * 3);
  }
  const fov = 60 + r * 14 + (P.boosting ? 7 : 0);
  cam.fov = snap ? fov : cam.fov + (fov - cam.fov) * (1 - Math.exp(-dt * 3));
  camera.fov = cam.fov; camera.updateProjectionMatrix();
}

function followLights(c) {
  sun.position.set(c.x + G.sunDir.x * 250, G.sunDir.y * 250, c.z + G.sunDir.z * 250);
  sun.target.position.set(c.x, 0, c.z);
  if (G.night) {
    const fx = Math.sin(c.h), fz = Math.cos(c.h), f = c.stats.len / 2;
    headlight.position.set(c.x + fx * f, 0.8, c.z + fz * f);
    headlight.target.position.set(c.x + fx * (f + 28), 0, c.z + fz * (f + 28));
    headlight.intensity = 260;
  } else headlight.intensity = 0;
}

/* ------------------------------------------------------------------ HUD */
const txt = {};
function setT(id, v) { if (txt[id] !== v) { txt[id] = v; $(id).textContent = v; } }
function updateHUD(dt) {
  const P = G.player;
  setT('h-spd', String(Math.round(P.speed * 3.6)));
  $('h-nitro').style.width = (P.nitro * 100).toFixed(1) + '%';
  $('speedo').classList.toggle('boost', P.boosting);
  const pos = G.order.indexOf(P) + 1;
  setT('h-pos', String(pos)); setT('h-posx', ordinal(pos));
  setT('h-lap', `${clamp(P.lap, 1, G.laps)}/${G.laps}`);
  setT('h-time', fmtTime(G.t));
  setT('h-laptime', fmtTime(P.finished ? P.lapTimes[P.lapTimes.length - 1] : G.state === 'countdown' ? 0 : G.t - P.lapStart));
  setT('h-best', fmtTime(G.bestLap));
  minimap.draw(G.cars, P);
  G.boardT -= dt;
  if (G.mode === 'race' && G.boardT <= 0) {
    G.boardT = 0.3;
    $('board').innerHTML = G.order.map((c, k) => `<li class="${c.isPlayer ? 'me' : ''}"><b>${k + 1}</b><i style="background:${hex(c.color)}"></i>${c.name}</li>`).join('');
  }
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').classList.remove('show'); }
}

function showResults() {
  const t = G.track, P = G.player, order = [...G.cars].sort(rankCmp), N = t.N, total = (G.laps + 1) * N;
  const est = (c) => {
    if (c.finished) return c.finishTime;
    const v = Math.max(15, ((c.prog - c.startProg) * t.seg) / Math.max(1, G.t));
    return G.t + (Math.max(0, total - c.prog) * t.seg) / v;
  };
  const b = BEST[t.def.id] || {};
  let rows;
  if (G.mode === 'race') {
    const lead = est(order[0]);
    rows = '<tr><th>#</th><th>Driver</th><th>Time</th><th>Best lap</th></tr>' + order.map((c, k) =>
      `<tr class="${c.isPlayer ? 'me' : ''}"><td>${k + 1}</td><td><i class="dot" style="background:${hex(c.color)}"></i>${c.name}</td>` +
      `<td>${k === 0 ? fmtTime(lead) : '+' + (est(c) - lead).toFixed(3)}</td><td>${fmtTime(c.bestLap)}</td></tr>`).join('');
    const pos = order.indexOf(P) + 1;
    $('r-title').textContent = pos === 1 ? 'YOU WIN!' : `${pos}${ordinal(pos).toUpperCase()} PLACE`;
  } else {
    rows = '<tr><th>Lap</th><th>Time</th><th></th></tr>' + P.lapTimes.slice(0, G.laps).map((lt, k) =>
      `<tr class="${lt === P.bestLap ? 'me' : ''}"><td>${k + 1}</td><td>${fmtTime(lt)}</td><td>${lt === P.bestLap ? 'BEST' : ''}</td></tr>`).join('');
    $('r-title').textContent = 'TIME TRIAL';
  }
  $('r-table').innerHTML = rows;
  $('r-sub').innerHTML = `${t.def.name} · ${G.laps} laps · Total <b>${fmtTime(P.finishTime)}</b>` +
    (G.newRecord ? ' · <span class="rec">NEW RECORD!</span>' : '') +
    `<br>Track record lap: <b>${fmtTime(b.lap)}</b>`;
  $('results').classList.remove('hidden');
}

/* ------------------------------------------------------------------ pause */
function pause() {
  if (G.state !== 'race' && G.state !== 'countdown') return;
  G.prevState = G.state; G.state = 'paused';
  $('pause').classList.remove('hidden');
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
  const t = G.track, P = G.player;
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
  if (G.autopilot && (params.has('bot') || G.state === 'done')) G.autopilot.update(dt, G.cars, 1, running);
  else input.read(P.input);
  for (const d of G.drivers) d.update(dt, G.cars, rubber(d.car), running);

  physAcc += dt;
  let steps = 0;
  while (physAcc >= STEP && steps < 240) {
    physAcc -= STEP; steps++;
    for (const c of G.cars) c.update(STEP, t, running);
    if (running) { collide(); G.t += STEP; for (const c of G.cars) progress(c); }
  }
  G.order = [...G.cars].sort(rankCmp);
  for (const c of G.cars) c.sync(dt, G.night);

  // wrong way / stuck hints
  const i = P.loc.i, dot = P.fx * t.tx[i] + P.fz * t.tz[i];
  G.wrongT = G.state === 'race' && dot < -0.35 && P.speed > 4 ? G.wrongT + dt : 0;
  $('wrong').classList.toggle('show', G.wrongT > 1);
  G.stuckT = G.state === 'race' && P.speed < 1.5 ? G.stuckT + dt : 0;
  if (G.stuckT > 4) { G.stuckT = 0; msg(isTouch ? 'Stuck? Tap ⟲ to reset' : 'Stuck? Press R to reset', 2.5); }

  if (P.impact > 3) { audio.crash(clamp(P.impact / 18, 0.15, 1)); cam.shake = Math.min(0.5, P.impact * 0.025); }
  for (const c of G.cars) c.impact = 0;
  const skid = P.offroad || P.speed < 8 ? 0 : clamp((P.drift - 2.5) / 8, 0, 1);
  audio.update(P.speed / P.stats.vmax, P.input.throttle, skid, P.boosting);

  updateCamera(dt);
  followLights(P);
  updateHUD(dt);
  if (G.state === 'done' && G.resultsT > 0) { G.resultsT -= dt; if (G.resultsT <= 0) showResults(); }
}

function menuFrame(dt) {
  const c = G.preview;
  if (!c) return;
  G.menuAng += dt * 0.22;
  const a = G.menuAng, r = 8.5;
  camera.position.set(c.x + Math.sin(a) * r, 2.4 + Math.sin(a * 0.7) * 0.5, c.z + Math.cos(a) * r);
  camera.lookAt(c.x, 0.8, c.z);
  if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  // keep the car in the right-hand part of the screen when the menu panel covers the left
  camera.setViewOffset(innerWidth, innerHeight, innerWidth > 760 ? -innerWidth * 0.2 : 0, innerWidth > 760 ? 0 : innerHeight * 0.22, innerWidth, innerHeight);
  followLights(c);
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
  }
  renderer.render(scene, camera);
  if (DEBUG) {
    G.frames = (G.frames || 0) + 1;
    if (G.frames % 10 === 0) {
      const P = G.player;
      document.body.dataset.debug = JSON.stringify({ f: G.frames, state: G.state, t: +G.t.toFixed(2), cd: +G.countdown.toFixed(2),
        cars: G.cars.map((c) => ({ n: c.name, lap: c.lap, prog: Math.round(c.prog), v: +c.speed.toFixed(1), off: c.offroad, fin: c.finished ? +c.finishTime.toFixed(2) : 0 })),
        p: P ? { x: +P.x.toFixed(1), z: +P.z.toFixed(1), lat: +P.loc.lat.toFixed(2) } : null });
    }
  }
}
const DEBUG = params.has('debug');

/* ------------------------------------------------------------------ events */
input.onPress = (code) => {
  if (code === 'KeyM') { audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); return; }
  if (G.state === 'menu') { if (code === 'Enter') startRace(); return; }
  if (!$('results').classList.contains('hidden')) { if (code === 'Enter') setupRace(); if (code === 'Escape') showMenu(); return; }
  if (code === 'Escape' || code === 'KeyP') { if (G.state === 'paused') resume(); else pause(); return; }
  if (code === 'KeyC') { S.cam = (S.cam + 1) % 3; saveSettings(); updateCamera(0, true); }
  if (code === 'KeyR') resetPlayer();
};
function resetPlayer() {
  if (G.state !== 'race' || !G.player || G.player.finished) return;
  G.player.place(G.track, G.player.loc.i, 0, false);
  updateCamera(0, true);
}

$('start').onclick = startRace;
$('pauseBtn').onclick = () => (G.state === 'paused' ? resume() : pause());
$('resetBtn').onclick = resetPlayer;
$('camBtn').onclick = () => { S.cam = (S.cam + 1) % 3; saveSettings(); updateCamera(0, true); };
$('p-resume').onclick = resume;
$('p-restart').onclick = () => setupRace();
$('p-menu').onclick = showMenu;
$('p-sound').onclick = () => { audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); };
$('r-again').onclick = () => setupRace();
$('r-next').onclick = () => { S.track = (S.track + 1) % TRACKS.length; saveSettings(); loadTrack(S.track); setupRace(); };
$('r-menu').onclick = showMenu;
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

/* ------------------------------------------------------------------ boot */
loadTrack(S.track);
showMenu();
$('loading').classList.add('hidden');
if (params.has('auto')) startRace();
requestAnimationFrame(frame);
