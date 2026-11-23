// Theevu Yudham: menu, third-person camera, shooting, training targets, HUD, minimap and the main loop.
// Step 1 of the game: the island, the soldier, two guns and the controls (a training ground).
import * as THREE from 'three';
import { World, AREAS, HALF, WATER_Y } from './world.js';
import { Soldier } from './soldier.js';
import { GUNS, Gun } from './weapons.js';
import { FX } from './fx.js';
import { Input } from './input.js';
import { BattleAudio } from './audio.js';
import { PLAYER_LOOK, randomLook } from './human.js';
import { loadCharacters } from './models.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || params.has('touch');
const DBG_CAM = params.get('cam'); // testing aid
document.body.classList.toggle('touch', isTouch);

/* ------------------------------------------------------------------ settings */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};
const S = Object.assign({ q: isTouch ? 'low' : 'med', sens: 1 }, store.get('battle-settings', {}));
if (params.has('q')) S.q = params.get('q');
if (!['low', 'med', 'high'].includes(S.q)) S.q = 'med';
const save = () => store.set('battle-settings', S);
const Q = S.q;

/* ------------------------------------------------------------------ renderer + scene */
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: Q !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, Q === 'low' ? 1 : Q === 'med' ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const FOG = Q === 'low' ? 230 : Q === 'med' ? 380 : 520;
scene.fog = new THREE.Fog(0xbcd3e2, FOG * 0.35, FOG);
scene.background = new THREE.Color(0xbcd3e2);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2000);
const hemi = new THREE.HemisphereLight(0xdfeeff, 0x6b6248, 0.9);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
const SUN = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
sun.castShadow = Q !== 'low';
sun.shadow.mapSize.set(Q === 'high' ? 2048 : 1024, Q === 'high' ? 2048 : 1024);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 300 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
scene.add(hemi, sun, sun.target);

/* ------------------------------------------------------------------ game state */
const audio = new BattleAudio();
const input = new Input($('game'), isTouch);
const fx = new FX(scene);
const G = {
  state: 'boot', world: null, player: null, guns: [], cur: 0, yaw: 0, pitch: 0, targets: [],
  camPos: new THREE.Vector3(), aimK: 0, hitT: 0, dmgT: 0, stepT: 0, area: '', areaT: 0, kills: 0, shots: 0, hits: 0,
};
window.__battle = G; G.input = input; G.camera = camera;

/* ------------------------------------------------------------------ build the island */
function buildWorld() {
  const w = new World(Q);
  scene.add(w.build(renderer));
  G.world = w;
  // the player, in a street of Kovil Town
  const p = new Soldier(w, { look: PLAYER_LOOK, model: 'player', low: Q === 'low' });
  p.addTo(scene);
  const sx = 13, sz = 13;
  p.pos.set(sx, w.heightAt(sx, sz) + 0.1, sz);
  p.yaw = Math.PI; G.yaw = Math.PI;
  G.player = p;
  G.guns = [new Gun(GUNS.ar), new Gun(GUNS.pistol)];
  G.cur = 0; p.setGun('ar');
  placeTargets();
  drawSlots();
}

// training targets: people standing in the streets of the town and on the camp's range
function freeSpot(x, z) {
  for (const b of G.world.near(x - 0.8, z - 0.8, x + 0.8, z + 0.8)) {
    if (b.circle) { if (Math.hypot(b.x - x, b.z - z) < b.r + 0.6) return false; continue; }
    if (x > b.min[0] - 0.6 && x < b.max[0] + 0.6 && z > b.min[2] - 0.6 && z < b.max[2] + 0.6 && b.max[1] > G.world.heightAt(x, z) + 0.6) return false;
  }
  return true;
}
function placeTargets() {
  const w = G.world, spots = [];
  let tries = 0;
  while (spots.length < 14 && tries++ < 600) {
    const i = (Math.random() * 7 - 3) | 0, x = 13 + i * 26 + (Math.random() - 0.5) * 4, z = (Math.random() * 2 - 1) * 90;
    if (Math.hypot(x - 13, z - 13) < 15 || !freeSpot(x, z)) continue;
    spots.push([x, z]);
  }
  const C = AREAS.find((a) => a.id === 'camp');
  for (let k = 0; k < 6; k++) { const x = C.x - 30 + k * 12, z = C.z - 58; if (freeSpot(x, z)) spots.push([x, z]); }
  for (const [x, z] of spots) {
    const t = new Soldier(w, { look: randomLook(), low: true });
    t.pos.set(x, w.heightAt(x, z), z); t.yaw = Math.random() * Math.PI * 2; t.home = [x, z]; t.respawnT = 0;
    t.addTo(scene); t.animate(0, false);
    G.targets.push(t);
  }
}

/* ------------------------------------------------------------------ guns */
const gun = () => G.guns[G.cur];
function switchGun(i) {
  if (i === G.cur || !G.guns[i]) return;
  G.guns[G.cur].reloading = 0;
  G.cur = i; G.player.setGun(G.guns[i].def.id); gun().cool = 0.35;
  audio.swap(); drawSlots();
}
function drawSlots() {
  G.guns.forEach((g, i) => {
    const el = $('slot' + i); if (!el) return;
    el.querySelector('b').textContent = g.def.name; el.querySelector('span').textContent = `${g.ammo} / ${g.reserve}`;
    el.classList.toggle('on', i === G.cur);
  });
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Vector3();
function camDir(out) { return out.set(Math.sin(G.yaw) * Math.cos(G.pitch), Math.sin(G.pitch), Math.cos(G.yaw) * Math.cos(G.pitch)); }

function fire() {
  const g = gun(), d = g.def, P = G.player;
  if (g.cool > 0 || g.busy) return;
  if (g.ammo <= 0) { audio.empty(); g.cool = 0.25; if (g.startReload()) audio.reload(g.def.reload); return; }
  g.ammo--; g.cool = d.rate; G.shots++;
  // spread: tighter when aiming, wider when moving, grows while spraying
  const moving = P.moveSpeed > 1 ? 1 : 0;
  const spread = (G.aimK > 0.5 ? d.aimSpread : d.spread) * (1 + moving * 0.8 + (P.onGround ? 0 : 1.5) - P.crouch * 0.3) + g.bloom;
  g.bloom = Math.min(0.022, g.bloom + d.recoil * 0.3);
  camDir(_d);
  const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(_d, up).normalize(), up2 = new THREE.Vector3().crossVectors(right, _d);
  _d.addScaledVector(right, Math.cos(a) * r).addScaledVector(up2, Math.sin(a) * r).normalize();
  // start the ray level with the player (so nothing between the camera and the player is hit)
  _o.copy(camera.position);
  const skip = Math.max(0, _p.copy(P.pos).setY(P.eyeY()).sub(_o).dot(_d));
  _o.addScaledVector(_d, skip);
  const o = [_o.x, _o.y, _o.z], dir = [_d.x, _d.y, _d.z];
  let best = d.range, hitT = null, hitHead = false;
  const wh = G.world.raycast(o, dir, d.range);
  if (wh) best = wh.t;
  for (const t of G.targets) { const h = t.rayHit(o, dir, best); if (h && h.t < best) { best = h.t; hitT = t; hitHead = h.head; } }
  const end = new THREE.Vector3(o[0] + dir[0] * best, o[1] + dir[1] * best, o[2] + dir[2] * best);
  // the bullet leaves the muzzle: anything right in front of the gun blocks it
  _m.copy(P.muzzle);
  const md = end.clone().sub(_m), ml = md.length(); md.divideScalar(ml || 1);
  const block = G.world.raycast([_m.x, _m.y, _m.z], [md.x, md.y, md.z], ml - 0.05);
  if (block) { end.set(...block.point); hitT = null; }
  fx.flash(_m, d.id === 'pistol' ? 0.35 : 0.5);
  fx.tracer(_m, end);
  audio.shot(d.sound);
  P.recoilKick = 1;
  // camera kick
  const kick = d.recoil * (0.7 + Math.random() * 0.6) * (G.aimK > 0.5 ? 0.6 : 1);
  G.pitch = clamp(G.pitch + kick, -1.3, 1.35); G.recoil = (G.recoil || 0) + kick;
  G.yaw += (Math.random() - 0.5) * d.recoil * 0.6;
  if (hitT) {
    const dmg = d.dmg * (hitHead ? 2 : 1);
    hitT.damage(dmg);
    G.hits++;
    fx.puff(end, 0xa01818, 6, 0.25);
    hitMarker(hitHead);
    if (!hitT.alive) { G.kills++; feed(`<b>You</b> ➜ target${hitHead ? ' <em>headshot</em>' : ''}`); hitT.respawnT = 4; }
  } else if (wh || block) {
    const kind = block ? block.kind : wh.kind;
    fx.puff(end, kind === 'water' ? 0xd8eef5 : kind === 'tree' ? 0x6b5434 : kind === 'wall' ? 0xc8c0b0 : 0x9a8462, 5, kind === 'water' ? 0.5 : 0.3);
  }
  drawSlots();
}

let hitTimer = 0;
function hitMarker(head) {
  const h = $('hitm'); h.classList.add('show'); h.classList.toggle('head', head); hitTimer = 0.12;
  audio.marker(head);
}
function feed(html) {
  const f = $('feed'), d = document.createElement('div'); d.innerHTML = html; f.prepend(d);
  while (f.children.length > 4) f.lastChild.remove();
  setTimeout(() => d.remove(), 5000);
}
let toastT = 0;
function toast(text, secs = 2) { $('toast').textContent = text; $('toast').classList.add('show'); toastT = secs; }

/* ------------------------------------------------------------------ camera */
const _cp = new THREE.Vector3(), _piv = new THREE.Vector3();
function updateCamera(dt, aiming) {
  const P = G.player;
  G.aimK += ((aiming ? 1 : 0) - G.aimK) * Math.min(1, dt * 12);
  const k = G.aimK;
  const dist = 3.2 - 1.15 * k, side = 0.85 - 0.05 * k, lift = 0.3 - 0.12 * k;
  camDir(_d);
  const rx = -Math.cos(G.yaw), rz = Math.sin(G.yaw);
  _piv.set(P.pos.x + rx * side, P.pos.y + P.height - 0.25 + lift, P.pos.z + rz * side);
  // pull in if a wall or the ground is in the way
  const back = [-_d.x, -_d.y, -_d.z];
  const hit = G.world.raycast([_piv.x, _piv.y, _piv.z], back, dist + 0.3);
  const dd = hit ? Math.max(0.3, hit.t - 0.3) : dist;
  _cp.set(_piv.x + back[0] * dd, _piv.y + back[1] * dd, _piv.z + back[2] * dd);
  const gy = Math.max(WATER_Y, G.world.heightAt(_cp.x, _cp.z)) + 0.3;
  if (_cp.y < gy) _cp.y = gy;
  camera.position.copy(_cp);
  camera.lookAt(_cp.x + _d.x, _cp.y + _d.y, _cp.z + _d.z);
  if (DBG_CAM) { // testing aid: look at the soldier from the side / front
    const a = G.yaw + (DBG_CAM === 'front' ? 0 : -Math.PI / 2);
    camera.position.set(P.pos.x + Math.sin(a) * 2.2, P.pos.y + 1.4, P.pos.z + Math.cos(a) * 2.2);
    camera.lookAt(P.pos.x, P.pos.y + 1.1, P.pos.z);
  }
  const fov = 70 + (gun().def.fov - 70) * k;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // the sun and its shadow follow the player
  sun.position.set(P.pos.x + SUN.x * 120, P.pos.y + SUN.y * 120, P.pos.z + SUN.z * 120);
  sun.target.position.copy(P.pos);
  if (G.world.sky) G.world.sky.position.set(_cp.x, 0, _cp.z);
}

/* ------------------------------------------------------------------ HUD */
const mini = $('mini').getContext('2d'), bigm = $('bigmap-c').getContext('2d');
function drawMinimap() {
  const P = G.player, c = mini, W = 300, map = G.world.mapCanvas, scale = map.width / (2 * HALF);
  const view = 160; // metres across
  c.save();
  c.clearRect(0, 0, W, W);
  c.translate(W / 2, W / 2);
  c.rotate(G.yaw - Math.PI); // map turns with the player (up = where you look)
  const px = (P.pos.x + HALF) * scale, pz = (P.pos.z + HALF) * scale, s = W / (view * scale);
  c.scale(s, s);
  c.drawImage(map, -px, -pz);
  c.restore();
  // targets nearby
  c.save(); c.translate(W / 2, W / 2); c.rotate(G.yaw - Math.PI);
  c.fillStyle = '#ff4a3a';
  for (const t of G.targets) {
    if (!t.alive) continue;
    const dx = (t.pos.x - P.pos.x) * (W / view), dz = (t.pos.z - P.pos.z) * (W / view);
    if (Math.hypot(dx, dz) < W / 2 - 6) { c.beginPath(); c.arc(dx, dz, 4, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
  // me: an arrow pointing up
  c.fillStyle = '#ffcf3f'; c.strokeStyle = '#000'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(W / 2, W / 2 - 12); c.lineTo(W / 2 + 8, W / 2 + 9); c.lineTo(W / 2, W / 2 + 4); c.lineTo(W / 2 - 8, W / 2 + 9); c.closePath(); c.stroke(); c.fill();
}
function drawBigMap() {
  const c = bigm, W = 600, map = G.world.mapCanvas, P = G.player;
  c.drawImage(map, 0, 0, W, W);
  const X = (x) => ((x + HALF) / (2 * HALF)) * W;
  c.save(); c.translate(X(P.pos.x), X(P.pos.z)); c.rotate(-G.yaw + Math.PI);
  c.fillStyle = '#ffcf3f'; c.strokeStyle = '#000'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 4); c.lineTo(-8, 9); c.closePath(); c.stroke(); c.fill();
  c.restore();
}
function buildCompass() {
  const strip = $('compass-strip'), names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  let html = '';
  for (let d = -360; d <= 720; d += 15) {
    const a = ((d % 360) + 360) % 360, n = names[a];
    html += `<span class="${n ? 'big' : ''}" style="left:${(d + 360) * 2}px">${n || (a % 45 === 0 ? a : '·')}</span>`;
  }
  strip.innerHTML = html;
}
function updateHUD(dt) {
  const P = G.player, g = gun();
  // heading: north is -z
  const heading = ((Math.atan2(Math.sin(G.yaw), -Math.cos(G.yaw)) * 180) / Math.PI + 360) % 360;
  $('compass-strip').style.transform = `translateX(${$('compass').clientWidth / 2 - (heading + 360) * 2}px)`;
  $('hpbar').style.width = P.health + '%'; $('hptext').textContent = Math.ceil(P.health);
  $('armorbar').style.width = P.armor + '%';
  $('ammo-n').textContent = g.ammo; $('ammo-n').classList.toggle('low', g.ammo <= g.def.mag * 0.2);
  $('ammo-r').textContent = '/ ' + g.reserve;
  $('reloadtxt').textContent = g.busy ? 'RELOADING…' : g.ammo === 0 && g.reserve > 0 ? 'PRESS R TO RELOAD' : '';
  const spread = (G.aimK > 0.5 ? g.def.aimSpread : g.def.spread) * (1 + (P.moveSpeed > 1 ? 0.8 : 0)) + g.bloom;
  $('cross').style.setProperty('--gap', (4 + spread * 420).toFixed(1) + 'px');
  $('cross').classList.toggle('aim', G.aimK > 0.5);
  if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) $('hitm').classList.remove('show'); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  // area name when entering a named place
  let area = '';
  for (const A of AREAS) if (Math.hypot(P.pos.x - A.x, P.pos.z - A.z) < A.r) area = A.name;
  if (area !== G.area) { G.area = area; if (area) { $('area').textContent = area.toUpperCase(); $('area').classList.add('show'); G.areaT = 3; } }
  if (G.areaT > 0) { G.areaT -= dt; if (G.areaT <= 0) $('area').classList.remove('show'); }
  $('coords').textContent = `${Math.round(P.pos.x)}, ${Math.round(P.pos.z)}`;
  drawMinimap();
  if (!$('bigmap').classList.contains('hidden')) drawBigMap();
}

/* ------------------------------------------------------------------ flow */
function showMenu() {
  G.state = 'menu';
  input.unlock();
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('clickplay').classList.add('hidden');
  document.body.classList.remove('playing');
  $('m-sens').value = S.sens;
  $('m-q').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === S.q);
    b.onclick = () => { if (S.q === b.dataset.v) return; S.q = b.dataset.v; save(); location.reload(); };
  });
}
function startTraining() {
  audio.init();
  G.state = 'play';
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  document.body.classList.add('playing');
  input.lock();
  toast('TRAINING GROUND', 2.5);
  feed('Shoot the targets in the streets. Find the camp range in the north.');
}
function pause() {
  if (G.state !== 'play') return;
  G.state = 'paused'; input.unlock();
  $('pause').classList.remove('hidden'); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF');
}
function resume() { $('pause').classList.add('hidden'); G.state = 'play'; input.lock(); last = performance.now(); }

input.onLockChange = (locked) => {
  if (isTouch) return;
  $('clickplay').classList.toggle('hidden', locked || G.state !== 'play');
};
input.onPress = (code) => {
  if (code === 'Escape' || code === 'KeyP') { if (G.state === 'paused') resume(); else if (G.state === 'play' && (isTouch || !input.locked)) pause(); }
  if (code === 'KeyM') toggleMap();
};
function toggleMap() { if (G.state === 'play') $('bigmap').classList.toggle('hidden'); }
$('game').addEventListener('click', () => { if (G.state === 'play' && !input.locked) input.lock(); });

/* ------------------------------------------------------------------ main loop */
let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!(dt > 0)) dt = 0;
  fpsT += dt; fpsN++;
  if (fpsT > 1) { $('fps').textContent = fpsN + ' fps'; fpsT = 0; fpsN = 0; }
  const P = G.player;
  if (!P) return;
  if (G.state === 'play') {
    const k = input.read();
    const sens = 0.0024 * S.sens * (G.aimK > 0.5 ? 0.6 : 1);
    G.yaw -= k.lookX * sens; G.pitch = clamp(G.pitch - k.lookY * sens, -1.3, 1.35);
    // the muzzle settles back down after the kick (most of it)
    if (G.recoil > 0) { const r = Math.min(G.recoil, dt * (k.fire ? 0.06 : 0.35) + G.recoil * dt * 4); G.pitch -= r * 0.8; G.recoil -= r; }
    // move relative to the camera; the soldier faces where the camera looks
    const fx_ = Math.sin(G.yaw), fz_ = Math.cos(G.yaw), rx = -fz_, rz = fx_;
    const wx = fx_ * k.my + rx * k.mx, wz = fz_ * k.my + rz * k.mx;
    const aiming = k.aim && !P.swim;
    const sprint = k.sprint && k.my > 0.3 && !aiming && !k.fire;
    P.crouching = k.crouch && !P.swim;
    const wasGround = P.onGround;
    P.move(dt, wx, wz, sprint ? 'sprint' : k.walk ? 'walk' : 'run', k.jump);
    if (!wasGround && P.onGround) audio.land();
    let dy = G.yaw - P.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    P.yaw += dy * Math.min(1, dt * 18);
    P.pitch = G.pitch;
    // guns
    for (const g of G.guns) g.update(dt);
    if (k.slot1) switchGun(0); if (k.slot2) switchGun(1); if (k.swap) switchGun(1 - G.cur);
    if (k.reload && gun().startReload()) { audio.reload(gun().def.reload); drawSlots(); }
    if (k.fire && !P.swim && (isTouch || input.locked)) { if (gun().def.auto || !G.fireHeld) fire(); }
    G.fireHeld = k.fire;
    if (gun().ammo === 0 && !gun().busy && gun().reserve > 0 && gun().cool <= 0) { gun().startReload(); audio.reload(gun().def.reload); }
    // footsteps
    if (P.onGround && P.moveSpeed > 1.5) { G.stepT -= dt * P.moveSpeed; if (G.stepT <= 0) { G.stepT = 2.2; audio.step(P.crouching ? 0.4 : 1); } }
    input.endFrame();
    P.animate(dt, aiming);
    updateCamera(dt, aiming);
    // targets: idle, fall when hit, stand up again
    for (const t of G.targets) {
      if (!t.alive) { t.respawnT -= dt; if (t.respawnT <= 0) { t.revive(); t.yaw = Math.random() * Math.PI * 2; } }
      t.moveSpeed = 0; t.animate(dt, false);
    }
    fx.update(dt);
    updateHUD(dt);
  } else if (G.state === 'menu') {
    // slow fly-around over the town
    G.menuA = (G.menuA || 0) + dt * 0.05;
    camera.position.set(Math.sin(G.menuA) * 90, 55, Math.cos(G.menuA) * 90);
    camera.lookAt(0, 8, 0);
    if (camera.fov !== 60) { camera.fov = 60; camera.updateProjectionMatrix(); }
    sun.position.set(SUN.x * 150, SUN.y * 150, SUN.z * 150); sun.target.position.set(0, 0, 0);
    if (G.world.sky) G.world.sky.position.set(camera.position.x, 0, camera.position.z);
    input.read(); input.endFrame();
  } else input.endFrame();
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ buttons */
$('start').onclick = startTraining;
$('m-sens').addEventListener('input', (e) => { S.sens = +e.target.value; save(); });
$('pauseBtn').onclick = () => (G.state === 'paused' ? resume() : pause());
$('p-resume').onclick = resume;
$('p-menu').onclick = showMenu;
$('p-sound').onclick = () => { audio.init(); audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); };
$('mapBtn').onclick = toggleMap;
$('mapClose').onclick = () => $('bigmap').classList.add('hidden');
document.querySelectorAll('.slot').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); switchGun(+b.dataset.slot); }));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

/* ------------------------------------------------------------------ boot */
setTimeout(() => {
  const t0 = performance.now();
  buildWorld();
  buildCompass();
  G.buildMs = Math.round(performance.now() - t0);
  $('loading').classList.add('hidden');
  showMenu();
  if (params.has('auto')) startTraining();
  requestAnimationFrame(frame);
  // the realistic soldier model (same characters as Kadal Nagaram); the built-in one until it loads
  if (!params.has('simple')) {
    loadCharacters('../GTA-Game/models/', ['player.glb'], { 'player.glb': 1.78 }).then((lib) => { if (lib) G.player.upgrade(); }).catch(() => {});
  }
}, 30);
