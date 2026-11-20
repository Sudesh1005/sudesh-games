// Target Shooter: menu, game modes (Target Range, Drone Waves), shooting, HUD and the main loop.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRange, buildArena } from './world.js';
import { RangeTargets, Drones, Pickups } from './targets.js';
import { Player } from './player.js';
import { Arsenal } from './weapons.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { ShooterAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const LOW = isTouch || params.has('low');
const BOT = params.has('bot'); // testing aid: the game aims and shoots by itself
const TIME_SCALE = clamp(+params.get('speed') || 1, 0.1, 10);
document.body.classList.toggle('touch', isTouch);

/* ------------------------------------------------------------------ settings + records */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};
const S = Object.assign({ mode: 'range', diff: 'normal', sens: 1 }, store.get('shooter-settings', {}));
if (params.has('mode')) S.mode = params.get('mode');
if (!['range', 'waves'].includes(S.mode)) S.mode = 'range';
if (!['easy', 'normal', 'hard'].includes(S.diff)) S.diff = 'normal';
S.sens = clamp(+S.sens || 1, 0.2, 3);
const saveSettings = () => store.set('shooter-settings', S);
const BEST = Object.assign({ range: 0, waves: { wave: 0, score: 0 } }, store.get('shooter-best', {}));
const saveBest = () => store.set('shooter-best', BEST);
const DIFF = {
  easy: { hp: 0.8, dmg: 0.6, rate: 1.35, speed: 0.85, label: 'Easy' },
  normal: { hp: 1, dmg: 1, rate: 1, speed: 1, label: 'Normal' },
  hard: { hp: 1.25, dmg: 1.4, rate: 0.8, speed: 1.15, label: 'Hard' },
};

/* ------------------------------------------------------------------ renderer + scenes */
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.3 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 900);
camera.rotation.order = 'YXZ';
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environment = envTex;
// the gun is drawn in its own pass so it never pokes into walls
const vmScene = new THREE.Scene();
vmScene.environment = envTex;
const vmCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 10);
vmScene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 1.4));
const vmSun = new THREE.DirectionalLight(0xffffff, 1.6); vmSun.position.set(0.5, 1, 0.6); vmScene.add(vmSun);
const muzzleLight = new THREE.PointLight(0xffc070, 0, 12, 1.5); scene.add(muzzleLight);

const input = new Input(canvas, isTouch);
const audio = new ShooterAudio();
const fx = new FX(scene);
const player = new Player();
const ray = new THREE.Raycaster();

const G = {
  state: 'menu', mode: S.mode, world: null, targets: null, drones: null, pickups: null, arsenal: null,
  score: 0, shots: 0, hits: 0, combo: 0, best: 0, bulls: 0, time: 0, wave: 0, queue: [], spawnT: 0, breakT: 0, kills: 0,
  hurtT: 0, hitT: 0, menuT: 0, bannerT: 0, prevFire: false, resumeOnLock: false, overT: 0, elapsed: 0,
};
window.__shooter = G;

/* ------------------------------------------------------------------ worlds */
function disposeObj(o) {
  o.traverse((m) => {
    if (m.geometry) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mt of mats) { for (const k in mt) { const v = mt[k]; if (v && v.isTexture) v.dispose(); } mt.dispose(); }
  });
}
function loadMode(mode) {
  clearActors();
  if (G.world) { scene.remove(G.world.group); disposeObj(G.world.group); }
  G.mode = mode;
  G.world = mode === 'range' ? buildRange(LOW) : buildArena(LOW);
  scene.add(G.world.group);
  scene.background = new THREE.Color(G.world.bg);
  scene.fog = G.world.fog ? new THREE.Fog(...G.world.fog) : null;
  renderer.toneMappingExposure = mode === 'range' ? 1.0 : 1.05;
}
function clearActors() {
  if (G.targets) { G.targets.clear(); G.targets = null; }
  if (G.drones) { G.drones.clear(); G.drones = null; }
  if (G.pickups) { G.pickups.clear(); G.pickups = null; }
  if (G.arsenal) { vmScene.remove(G.arsenal.root); disposeObj(G.arsenal.root); G.arsenal = null; }
  fx.clear();
}

/* ------------------------------------------------------------------ game flow */
function startGame() {
  audio.init();
  loadMode(S.mode);
  player.spawn(G.world.spawn);
  G.arsenal = new Arsenal(vmScene, G.mode === 'range');
  if (params.has('weapon')) G.arsenal.select(clamp(+params.get('weapon') | 0, 0, 2), true); // testing aid
  Object.assign(G, { score: 0, shots: 0, hits: 0, combo: 0, best: 0, bulls: 0, kills: 0, wave: 0, queue: [], spawnT: 0.8, breakT: 0, hurtT: 0, overT: 0, elapsed: 0, newRecord: false });
  if (G.mode === 'range') { G.targets = new RangeTargets(scene, LOW); G.time = 60; }
  else { G.drones = new Drones(scene, LOW); G.pickups = new Pickups(scene); nextWave(); }
  $('menu').classList.add('hidden'); $('over').classList.add('hidden'); $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  document.body.classList.add('playing');
  document.body.classList.toggle('waves', G.mode === 'waves');
  G.state = 'playing';
  input.lock();
  if (G.mode === 'range') banner('60 SECONDS', 'Hit the targets. Skip the red X boards.');
}

function showMenu() {
  input.unlock();
  G.state = 'menu';
  loadMode(S.mode);
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('over').classList.add('hidden'); $('pause').classList.add('hidden');
  document.body.classList.remove('playing');
  buildMenu();
}

function pause() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  $('pause').classList.remove('hidden');
  $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF');
}
function resume() {
  if (G.state !== 'paused') return;
  $('pause').classList.add('hidden');
  G.state = 'playing'; last = performance.now();
  input.lock();
}
input.onLockChange = (locked) => { if (!locked && G.state === 'playing' && !BOT) pause(); };

function gameOver(title) {
  G.state = 'over';
  input.unlock();
  const acc = G.shots ? Math.round((G.hits / G.shots) * 100) : 0;
  let rows;
  if (G.mode === 'range') {
    if (G.score > BEST.range) { BEST.range = G.score; G.newRecord = true; }
    rows = [['Score', G.score], ['Targets hit', G.kills], ['Bullseyes', G.bulls], ['Best combo', 'x' + G.best], ['Accuracy', acc + '%'], ['Record', BEST.range]];
  } else {
    if (G.wave > BEST.waves.wave || (G.wave === BEST.waves.wave && G.score > BEST.waves.score)) { BEST.waves = { wave: G.wave, score: G.score }; G.newRecord = true; }
    rows = [['Wave reached', G.wave], ['Score', G.score], ['Drones destroyed', G.kills], ['Accuracy', acc + '%'], ['Difficulty', DIFF[S.diff].label], ['Record', `Wave ${BEST.waves.wave} · ${BEST.waves.score}`]];
  }
  saveBest();
  $('o-title').textContent = title;
  $('o-sub').innerHTML = G.newRecord ? '<span class="rec">NEW RECORD!</span>' : '';
  $('o-table').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  $('over').classList.remove('hidden');
}

/* ------------------------------------------------------------------ range mode */
function rangeUpdate(dt) {
  G.time -= dt;
  const prog = clamp(1 - G.time / 60, 0, 1);
  if (G.time <= 10 && Math.ceil(G.time) !== Math.ceil(G.time + dt) && G.time > 0) audio.tick();
  G.spawnT -= dt;
  const maxUp = 2 + Math.floor(prog * 3);
  if (G.spawnT <= 0 && G.targets.upCount() < maxUp) {
    const w = G.world, r = Math.random();
    const kind = r < 0.13 ? 'noshoot' : r < 0.24 ? 'gold' : 'normal';
    const used = new Set(G.targets.list.filter((t) => t.state === 'up').map((t) => t.x0));
    const lanes = w.lanes.filter((x) => !used.has(x));
    if (lanes.length) {
      const x = lanes[(Math.random() * lanes.length) | 0], dist = w.dists[(Math.random() * w.dists.length) | 0];
      const life = kind === 'gold' ? 1.6 : lerp(3.4, 1.9, prog) + Math.random() * 0.6;
      const move = kind === 'gold' || Math.random() < 0.2 + prog * 0.35 ? { amp: 1.2 + Math.random(), speed: 1 + Math.random() * (1 + prog) } : null;
      G.targets.spawn(kind, x, dist, life, move);
    }
    G.spawnT = lerp(0.95, 0.45, prog) * (0.7 + Math.random() * 0.6);
  }
  G.targets.update(dt);
  if (G.time <= 0) { G.time = 0; G.targets.clear(); audio.horn(); gameOver('TIME UP'); }
}

function hitTarget(t, point) {
  if (t.hit || t.state !== 'up') return false;
  G.targets.knock(t);
  if (t.kind === 'noshoot') {
    G.score = Math.max(0, G.score - 50); G.combo = 0;
    popup(point, '-50', 'bad'); audio.bad(); flashHit(true);
    return true;
  }
  const local = t.board.worldToLocal(point.clone());
  const ring = clamp(Math.floor((Math.hypot(local.x, local.y) / t.R) * 5), 0, 4);
  const base = [10, 8, 6, 4, 2][ring] * (t.kind === 'gold' ? 3 : 1);
  G.combo++; G.best = Math.max(G.best, G.combo); G.kills++;
  const mult = 1 + Math.min(G.combo - 1, 10) * 0.1;
  const pts = Math.round(base * (1 + t.dist / 25) * mult);
  G.score += pts;
  if (ring === 0) { G.bulls++; popup(point, `BULLSEYE +${pts}`, 'gold'); audio.hit(true); }
  else { popup(point, '+' + pts, t.kind === 'gold' ? 'gold' : ''); audio.hit(false); }
  if (t.kind === 'gold') audio.ding();
  flashHit(false);
  return true;
}

/* ------------------------------------------------------------------ waves mode */
function nextWave() {
  G.wave++;
  const w = G.wave, q = [];
  for (let k = 0; k < 2 + w; k++) q.push('scout');
  for (let k = 0; k < Math.max(0, w - 1); k++) q.push('kami');
  for (let k = 0; k < Math.floor((w - 1) / 2); k++) q.push('heavy');
  for (let i = q.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [q[i], q[j]] = [q[j], q[i]]; }
  G.queue = q; G.spawnT = 2; G.breakT = 0;
  banner(`WAVE ${w}`, `${q.length} drones incoming`);
  audio.horn();
}

function wavesUpdate(dt) {
  const D = G.drones, diff = DIFF[S.diff];
  if (G.breakT > 0) {
    G.breakT -= dt;
    if (G.breakT <= 0) nextWave();
  } else {
    G.spawnT -= dt;
    if (G.queue.length && G.spawnT <= 0 && D.list.length < 5 + Math.floor(G.wave / 2)) {
      const p = G.world.portals[(Math.random() * G.world.portals.length) | 0];
      D.spawn(G.queue.pop(), p.clone(), diff);
      fx.sparks(p, 20, 0xff3b5c, 4);
      G.spawnT = Math.max(0.5, 1.4 - G.wave * 0.08);
    }
    if (!G.queue.length && !D.list.length) {
      const bonus = 250 * G.wave;
      G.score += bonus;
      banner('WAVE CLEARED', `+${bonus} bonus · next wave in 6 s`);
      audio.ding();
      for (const kind of ['health', 'ammo', 'ammo', 'health']) G.pickups.spawn(kind, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
      G.breakT = 6;
    }
  }
  D.update(dt, player, G.world, diff, {
    explode: (d) => { boom(d, false); hurt(d.D.dmg * diff.dmg, d.pos); },
    hurt: (dmg, p) => hurt(dmg, p),
    spark: (p) => fx.sparks(p, 10, 0xff6070, 3),
    zap: () => audio.zap(),
  });
  G.pickups.update(dt, player, (kind) => {
    if (kind === 'health') { if (player.hp >= 100) return false; player.hp = Math.min(100, player.hp + 35); popupScreen('+35 HEALTH', 'good'); }
    else { G.arsenal.refill(); popupScreen('AMMO', 'good'); }
    audio.pickup();
    return true;
  });
}

function hurt(dmg, from) {
  if (G.state !== 'playing') return;
  player.hp -= dmg; G.hurtT = 0.5;
  audio.hurt();
  // show which side the hit came from
  const d = new THREE.Vector3().subVectors(from, player.pos);
  const ang = Math.atan2(d.x, d.z) - Math.atan2(-Math.sin(player.yaw), -Math.cos(player.yaw));
  $('dir').style.transform = `translate(-50%, -50%) rotate(${-ang}rad)`; $('dir').classList.remove('show'); void $('dir').offsetWidth; $('dir').classList.add('show');
  if (player.hp <= 0) { player.hp = 0; gameOver('YOU WERE TAKEN DOWN'); }
}

function boom(d, scored) {
  fx.explode(d.pos.clone(), d.D.size);
  audio.boom(d.D.size);
  if (scored) {
    G.kills++;
    G.score += d.D.score;
    popup(d.pos, '+' + d.D.score, 'gold');
    const r = Math.random();
    if (r < 0.18) G.pickups.spawn('health', d.pos.x, d.pos.z);
    else if (r < 0.42) G.pickups.spawn('ammo', d.pos.x, d.pos.z);
  }
  G.drones.remove(d);
}

/* ------------------------------------------------------------------ shooting */
const O = new THREE.Vector3(), F = new THREE.Vector3(), R = new THREE.Vector3(), U = new THREE.Vector3(), D2 = new THREE.Vector3(), E = new THREE.Vector3();
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
function shoot() {
  const A = G.arsenal, w = A.w, spread = A.spread(player);
  camera.getWorldPosition(O); camera.getWorldDirection(F);
  R.setFromMatrixColumn(camera.matrixWorld, 0); U.setFromMatrixColumn(camera.matrixWorld, 1);
  const muzzle = E.copy(O).addScaledVector(F, 0.7).addScaledVector(R, 0.14 * (1 - A.ads)).addScaledVector(U, -0.12);
  const list = G.mode === 'range' ? [...G.targets.meshes, ...G.world.hit] : [...G.drones.meshes, ...G.world.hit];
  let any = false;
  const dmgTo = new Map();
  for (let p = 0; p < w.pellets; p++) {
    D2.copy(F).addScaledVector(R, gauss() * spread).addScaledVector(U, gauss() * spread).normalize();
    ray.set(O, D2); ray.far = 250;
    const h = ray.intersectObjects(list, false)[0];
    const end = h ? h.point : O.clone().addScaledVector(D2, 150);
    if (w.pellets === 1 || p % 3 === 0) fx.tracer(muzzle, end);
    if (!h) continue;
    const t = h.object.userData.target, d = h.object.userData.drone;
    if (t) { if (hitTarget(t, h.point)) any = true; else if (t.hit) any = true; fx.sparks(h.point, 6, 0xffe0a0, 2); }
    else if (d) {
      any = true;
      const weak = !!h.object.userData.weak;
      dmgTo.set(d, (dmgTo.get(d) || 0) + w.dmg * (weak ? 2 : 1));
      fx.sparks(h.point, weak ? 14 : 8, weak ? 0xff4050 : 0xffd080, 4);
    } else {
      const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : D2.clone().negate();
      fx.hole(h.point, n);
      fx.sparks(h.point, 5, 0xbbbbbb, 2.5);
    }
  }
  for (const [d, dmg] of dmgTo) {
    if (!d.alive) continue;
    d.hp -= dmg; d.flash = 0.12;
    if (d.hp <= 0) { boom(d, true); flashHit(true); } else flashHit(false);
    audio.thud();
  }
  G.shots++;
  if (any) G.hits++;
  else if (G.mode === 'range') G.combo = 0;
  const k = 1 - A.ads * 0.45;
  player.pitch = clamp(player.pitch + w.recoil * k, -1.5, 1.5);
  player.yaw += (Math.random() - 0.5) * w.recoil * 0.5 * k;
  audio.shot(w.id);
  muzzleLight.position.copy(muzzle); muzzleLight.intensity = 25;
}

/* ------------------------------------------------------------------ HUD */
function banner(title, sub) {
  $('ban-t').textContent = title; $('ban-s').textContent = sub || '';
  const b = $('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
}
function flashHit(kill) {
  const h = $('hitm'); h.className = kill ? 'kill' : ''; void h.offsetWidth; h.classList.add('show');
}
const _pv = new THREE.Vector3();
function popup(world, text, cls = '') {
  _pv.copy(world).project(camera);
  if (_pv.z > 1) return;
  const el = document.createElement('div');
  el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = ((_pv.x * 0.5 + 0.5) * innerWidth) + 'px'; el.style.top = ((-_pv.y * 0.5 + 0.5) * innerHeight) + 'px';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 900);
}
function popupScreen(text, cls) {
  const el = document.createElement('div');
  el.className = 'pop ' + cls; el.textContent = text;
  el.style.left = '50%'; el.style.top = '62%';
  $('pops').appendChild(el); setTimeout(() => el.remove(), 900);
}
const txt = {};
function setT(id, v) { if (txt[id] !== v) { txt[id] = v; $(id).textContent = v; } }
function updateHUD(dt) {
  const A = G.arsenal, g = A.gun;
  setT('h-ammo', String(g.ammo));
  setT('h-res', g.reserve === Infinity ? '∞' : String(g.reserve));
  setT('h-wname', g.w.name);
  document.querySelectorAll('#slots span').forEach((s, k) => s.classList.toggle('on', k === A.cur));
  setT('h-score', String(G.score));
  if (G.mode === 'range') {
    setT('h-big', Math.ceil(G.time) + 's'); setT('h-biglbl', 'TIME');
    setT('h-combo', G.combo > 1 ? 'COMBO x' + G.combo : '');
  } else {
    setT('h-big', String(G.wave)); setT('h-biglbl', 'WAVE');
    setT('h-combo', G.breakT > 0 ? `Next wave ${Math.ceil(G.breakT)}` : `${G.drones.list.length + G.queue.length} drones left`);
    $('hp').style.width = player.hp + '%';
    $('hp').classList.toggle('low', player.hp < 35);
  }
  $('h-reload').classList.toggle('show', A.reloading > 0 || (g.ammo === 0 && g.reserve > 0));
  setT('h-reload', A.reloading > 0 ? 'RELOADING' : 'PRESS R TO RELOAD');
  if (g.ammo === 0 && g.reserve <= 0) setT('h-reload', 'NO AMMO · SWITCH WEAPON');
  $('h-reload').classList.toggle('show', A.reloading > 0 || g.ammo === 0);
  const spreadPx = 8 + A.spread(player) * 900;
  const ch = $('cross');
  ch.style.setProperty('--gap', spreadPx.toFixed(1) + 'px');
  ch.style.opacity = A.ads > 0.6 && g.w.id !== 'shotgun' ? 0.25 : 1;
  G.hurtT = Math.max(0, G.hurtT - dt);
  $('hurt').style.opacity = Math.max(G.hurtT * 1.4, G.mode === 'waves' && player.hp < 35 ? 0.35 : 0);
}

/* ------------------------------------------------------------------ menu */
function buildMenu() {
  document.querySelectorAll('.mcard').forEach((b) => {
    b.classList.toggle('on', b.dataset.m === S.mode);
    b.onclick = () => { if (S.mode === b.dataset.m) return; S.mode = b.dataset.m; saveSettings(); loadMode(S.mode); buildMenu(); };
  });
  $('best-range').textContent = BEST.range ? 'Best score ' + BEST.range : 'No record yet';
  $('best-waves').textContent = BEST.waves.wave ? `Best: wave ${BEST.waves.wave} · ${BEST.waves.score} pts` : 'No record yet';
  $('o-diff').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === S.diff);
    b.onclick = () => { S.diff = b.dataset.v; saveSettings(); buildMenu(); };
  });
  $('o-diff').classList.toggle('dis', S.mode !== 'waves');
  $('sens').value = S.sens; $('sensv').textContent = S.sens.toFixed(1);
}
$('sens').oninput = () => { S.sens = +$('sens').value; $('sensv').textContent = S.sens.toFixed(1); saveSettings(); };

function menuFrame(dt) {
  G.menuT += dt * 0.15;
  if (G.mode === 'range') {
    camera.position.set(Math.sin(G.menuT) * 3, 2.2, 3);
    camera.rotation.set(-0.06, Math.sin(G.menuT * 0.7) * 0.25, 0);
  } else {
    camera.position.set(Math.sin(G.menuT) * 20, 7, Math.cos(G.menuT) * 20);
    camera.lookAt(0, 1.5, 0);
  }
  if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
}

/* ------------------------------------------------------------------ test bot */
function botAim(inp, dt) {
  let target = null, bd = Infinity;
  const eye = player.eyePos().clone();
  if (G.mode === 'range') {
    for (const t of G.targets.list) if (t.state === 'up' && !t.hit && t.kind !== 'noshoot' && t.anim > 0.9) { const p = t.board.getWorldPosition(new THREE.Vector3()); const d = p.distanceTo(eye); if (d < bd) { bd = d; target = p; } }
  } else {
    for (const d of G.drones.list) { const dd = d.pos.distanceTo(eye); if (dd < bd && G.drones.clearLine(eye, d.pos, G.world)) { bd = dd; target = d.pos.clone(); } }
    inp.move.x = Math.sin(G.elapsed * 0.7); inp.move.y = Math.cos(G.elapsed * 0.4) * 0.6;
  }
  inp.fire = false; inp.aim = !!target;
  if (!target) return;
  const d = target.sub(eye), yaw = Math.atan2(-d.x, -d.z), pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
  let dy = yaw - player.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  const k = 1 - Math.exp(-dt * 12);
  player.yaw += dy * k; player.pitch += (pitch - player.pitch) * k;
  inp.fire = Math.abs(dy) < 0.02 && Math.abs(pitch - player.pitch) < 0.02 && !G.prevFireBot;
  G.prevFireBot = inp.fire && !G.arsenal.w.auto;
  if (G.arsenal.gun.ammo === 0) inp.fire = false;
}

/* ------------------------------------------------------------------ main loop */
const STEP = 1 / 120;
let last = performance.now(), acc = 0;
function playFrame(dt) {
  const inp = input.read();
  const A = G.arsenal;
  G.elapsed += dt;
  // look
  const zoom = lerp(1, A.w.adsFov / 75, A.ads);
  player.yaw -= inp.lookX * 0.0022 * S.sens * zoom;
  player.pitch = clamp(player.pitch - inp.lookY * 0.0022 * S.sens * zoom, -1.5, 1.5);
  if (BOT) botAim(inp, dt);
  // weapons
  if (input.pressed.has('Digit1')) switchTo(0);
  if (input.pressed.has('Digit2')) switchTo(1);
  if (input.pressed.has('Digit3')) switchTo(2);
  if (input.pressed.has('WheelDown') || input.pressed.has('Swap') || input.pressed.has('KeyQ')) switchTo((A.cur + 1) % 3);
  if (input.pressed.has('WheelUp')) switchTo((A.cur + 2) % 3);
  if (input.pressed.has('KeyR')) { if (A.startReload()) audio.reload(A.w.reload); }
  const f = A.tryFire(inp.fire, G.prevFire);
  if (f === true) shoot();
  else if (f === 'empty' && !G.prevFire) { audio.empty(); if (A.startReload()) audio.reload(A.w.reload); }
  G.prevFire = inp.fire;
  if (A.gun.ammo === 0 && A.gun.reserve > 0 && A.reloading <= 0 && A.switching <= 0 && A.cool <= 0) { if (A.startReload()) audio.reload(A.w.reload); }
  // movement
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 20) { acc -= STEP; n++; player.update(STEP, inp, G.world); inp.jump = false; }
  A.update(dt, inp.aim, player, { x: inp.lookX, y: inp.lookY }, () => {});
  camera.position.copy(player.eyePos());
  camera.rotation.set(player.pitch, player.yaw, 0);
  const fov = lerp(75, A.w.adsFov, A.ads);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 400);
  if (G.mode === 'range') rangeUpdate(dt); else if (G.state === 'playing') wavesUpdate(dt);
  fx.update(dt);
  if (G.state === 'playing' || G.state === 'over') updateHUD(dt);
  input.endFrame();
}
function switchTo(i) {
  const A = G.arsenal;
  if (i === A.cur && A.switching <= 0) return;
  A.select(i); audio.swap();
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (!(dt > 0)) dt = 0;
  dt = Math.min(dt, 0.05) * TIME_SCALE;
  if (G.state === 'menu') { menuFrame(dt); input.endFrame(); }
  else if (G.state === 'playing') playFrame(dt);
  else { input.endFrame(); if (G.state === 'over') fx.update(dt); }
  renderer.clear();
  renderer.render(scene, camera);
  if (G.state === 'playing' || G.state === 'paused') { renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}

/* ------------------------------------------------------------------ events */
input.onPress = (code) => {
  if (code === 'KeyM') { audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); }
  if (G.state === 'menu' && code === 'Enter') startGame();
  else if (G.state === 'over' && code === 'Enter') startGame();
  else if (code === 'KeyP' || code === 'Escape') { if (G.state === 'playing') { input.unlock(); pause(); } else if (G.state === 'paused' && code === 'KeyP') resume(); }
};
$('play').onclick = startGame;
$('pauseBtn').onclick = () => (G.state === 'paused' ? resume() : pause());
$('p-resume').onclick = resume;
$('p-restart').onclick = startGame;
$('p-menu').onclick = showMenu;
$('p-sound').onclick = () => { audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); };
$('o-again').onclick = startGame;
$('o-menu').onclick = showMenu;
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = vmCam.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

loadMode(S.mode);
showMenu();
$('loading').classList.add('hidden');
if (params.has('auto')) startGame();
requestAnimationFrame(frame);
