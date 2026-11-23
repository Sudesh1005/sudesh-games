// Theevu Yudham: menu, match flow (plane → free fall → parachute → loot → safe zone → result),
// the training ground, third-person camera, shooting, healing, grenades, HUD, maps and the main loop.
import * as THREE from 'three';
import { World, AREAS, HALF, WATER_Y } from './world.js';
import { Soldier } from './soldier.js';
import { GUNS, AMMO } from './weapons.js';
import { Inventory, Loot, itemName, dropBag } from './loot.js';
import { Room, cleanCode, cleanName, MAX_PLAYERS } from './net.js';
import { Zone, STAGES } from './zone.js';
import { planeRoute, makePlane, airStep, PLANE_Y, PLANE_SPEED } from './drop.js';
import { Bot, BOT_NAMES, BOT_LEVELS } from './bots.js';
import { castShot, bulletDamage } from './combat.js';
import { Grenades, BLAST_R, BLAST_DMG } from './grenade.js';
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
const TIME_SCALE = clamp(+params.get('speed') || 1, 0.1, 30); // testing aid
const GOD = params.has('god'); // testing aid: the player can't be hurt
document.body.classList.toggle('touch', isTouch);
// a tip on the loading screen
const TIPS = ['Pass close to the white circle before the zone shrinks.', 'Headshots do more damage; helmets reduce it.', 'Crouch behind walls and rocks when you heal.', 'Guns come with a box of their ammo next to them.', 'The sniper scope zooms in when you aim.', 'Listen: shots and footsteps come from their side.', 'Grenades bounce off walls; walls also block the blast.'];
$('tip').textContent = 'Tip: ' + TIPS[(Math.random() * TIPS.length) | 0];
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/* ------------------------------------------------------------------ settings */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } },
};
const S = Object.assign({ q: isTouch ? 'low' : 'med', sens: 1, level: 'normal', name: '', assist: true }, store.get('battle-settings', {}));
if (params.has('q')) S.q = params.get('q');
if (!['low', 'med', 'high'].includes(S.q)) S.q = 'med';
if (params.has('level')) S.level = params.get('level');
if (!BOT_LEVELS[S.level]) S.level = 'normal';
const BOT_COUNT = params.has('bots') ? +params.get('bots') : S.q === 'low' ? 11 : S.q === 'med' ? 15 : 19;
const save = () => store.set('battle-settings', S);
const Q = S.q;

/* ------------------------------------------------------------------ renderer + scene */
const renderer = new THREE.WebGLRenderer({ canvas: $('game'), antialias: Q !== 'low', powerPreference: 'high-performance' });
const BASE_PR = Math.min(devicePixelRatio, Q === 'low' ? 1 : Q === 'med' ? 1.5 : 2);
renderer.setPixelRatio(BASE_PR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q !== 'low';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const FOG = Q === 'low' ? 230 : Q === 'med' ? 380 : 520;
scene.fog = new THREE.Fog(0xbcd3e2, FOG * 0.35, FOG);
scene.background = new THREE.Color(0xbcd3e2);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 2500);
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
  state: 'boot', mode: 'battle', world: null, player: null, inv: new Inventory(), yaw: 0, pitch: 0, targets: [], enemies: [], bots: [], killer: null,
  online: false, room: null, remotes: new Map(), seq: 0, sendT: 0, spectate: null, pr: 0, zonePhase: '', assistT: 0, assistTarget: null, beatT: 0,
  camPos: new THREE.Vector3(), aimK: 0, stepT: 0, area: '', areaT: 0, kills: 0, shots: 0, hits: 0, dmgDealt: 0,
  loot: null, zone: null, plane: null, route: null, planeT: 0, grenades: null, heal: null, matchT: 0, overT: 0, pickT: 0, zoneTickT: 0, shake: 0,
};
window.__battle = G; G.input = input; G.camera = camera;
const gun = () => G.inv.gun();
let room = null; // the online room we're in (null when playing alone)

/* ------------------------------------------------------------------ build the island (once) */
function buildWorld() {
  const w = new World(Q);
  scene.add(w.build(renderer));
  G.world = w;
  // a few loot spots out in the open too (near roads and in the fields)
  const R = rng(99);
  for (let i = 0; i < 70; i++) {
    const x = (R() * 2 - 1) * 380, z = (R() * 2 - 1) * 380, y = w.heightAt(x, z);
    if (y > 1.2 && freeSpot(x, z)) w.lootSpots.push([x, y + 0.02, z]);
  }
  const p = new Soldier(w, { look: PLAYER_LOOK, model: 'player', low: Q === 'low' });
  p.addTo(scene);
  G.player = p;
  G.grenades = new Grenades(scene, w);
}
function freeSpot(x, z) {
  for (const b of G.world.near(x - 0.8, z - 0.8, x + 0.8, z + 0.8)) {
    if (b.circle) { if (Math.hypot(b.x - x, b.z - z) < b.r + 0.6) return false; continue; }
    if (x > b.min[0] - 0.6 && x < b.max[0] + 0.6 && z > b.min[2] - 0.6 && z < b.max[2] + 0.6 && b.max[1] > G.world.heightAt(x, z) + 0.6) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ starting a match */
function clearMatch() {
  if (G.loot) G.loot.clear();
  if (G.zone) { G.zone.dispose(); G.zone = null; }
  if (G.plane) { scene.remove(G.plane); G.plane = null; }
  for (const t of G.targets) scene.remove(t.root);
  for (const b of G.bots) scene.remove(b.s.root);
  for (const r of G.remotes.values()) scene.remove(r.s.root);
  G.remotes.clear(); G.spectate = null; $('specbar').classList.add('hidden');
  G.targets = []; G.enemies = []; G.bots = []; G.killer = null;
  G.grenades.clear();
  G.heal = null;
}
function resetPlayer() {
  const P = G.player;
  P.revive(); P.armor = 0; P.vest = 0; P.helm = 0; P.air = null; P.setChute(false); P.crouching = false;
  P.vel.set(0, 0, 0);
  G.inv = new Inventory();
  G.kills = 0; G.shots = 0; G.hits = 0; G.dmgDealt = 0; G.matchT = 0; G.recoil = 0;
}
// net (online only): { seed, players: [{ id, name }], myIdx }
function startMatch(mode, net) {
  audio.init();
  clearMatch(); resetPlayer();
  G.mode = mode; G.online = mode === 'online';
  const seed = net ? net.seed : params.has('seed') ? +params.get('seed') : (Math.random() * 1e9) | 0;
  const R = rng(seed);
  G.seed = seed;
  G.loot = new Loot(scene, R);
  G.loot.spawnAll(G.world.lootSpots);
  if (net) {
    // items dropped by each player get ids nobody else uses, and are announced to the others
    G.loot.nextId = 100000 * (net.myIdx + 1);
    G.loot.onAdd = (it) => { if (room) room.send({ t: 'drop', from: room.me, id: it.id, kind: it.kind, n: it.n, x: +it.x.toFixed(2), y: +it.y.toFixed(2), z: +it.z.toFixed(2) }); };
  }
  const P = G.player;
  if (mode === 'training') {
    G.inv.give('ar', 30); G.inv.give('pistol', 12);
    G.inv.cur = 0;
    Object.assign(G.inv.ammo, { light: 200, rifle: 200, shell: 30, heavy: 30 });
    G.inv.bandage = 5; G.inv.medkit = 2; G.inv.grenade = 4;
    P.pos.set(13, G.world.heightAt(13, 13) + 0.1, 13); P.yaw = Math.PI; G.yaw = Math.PI; G.pitch = 0;
    placeTargets();
    $('matchinfo').classList.add('hidden');
  } else {
    G.zone = new Zone(scene, (x, z) => G.world.heightAt(x, z), R);
    G.route = planeRoute(R);
    G.plane = makePlane(); scene.add(G.plane);
    G.planeT = 0;
    P.air = 'plane';
    // the computer players, each with its own jump point along the route
    const names = BOT_NAMES.slice().sort(() => R() - 0.5);
    for (let i = 0; i < (net ? 0 : BOT_COUNT); i++) {
      const b = new Bot(G.world, { name: names[i % names.length], level: S.level, rnd: rng(seed + 101 * (i + 1)), model: Q !== 'low', index: 1 + (i % 4), low: Q === 'low' });
      b.s.addTo(scene); b.s.root.visible = false;
      G.bots.push(b);
    }
    G.enemies = G.bots.map((b) => b.s);
    // online: the other players, moved by their own phones
    if (net) {
      net.players.forEach((p, i) => {
        if (p.id === room.me) return;
        const s2 = new Soldier(G.world, { look: randomLook(), model: Q !== 'low' ? 'ped' : null, index: 1 + (i % 4), low: Q === 'low' });
        s2.name = cleanName(p.name) || 'Player'; s2.remote = p.id; s2.air = 'plane';
        s2.addTo(scene); s2.root.add(nameTag(s2.name));
        G.remotes.set(p.id, { s: s2, snaps: [] });
      });
      G.enemies = [...G.remotes.values()].map((r) => r.s);
    }
    G.yaw = Math.atan2(G.route.dx, G.route.dz); G.pitch = -0.25;
    $('matchinfo').classList.remove('hidden');
  }
  P.setGun(gun() ? gun().def.id : null);
  drawSlots();
  G.state = 'play';
  $('menu').classList.add('hidden'); $('over').classList.add('hidden'); $('hud').classList.remove('hidden');
  document.body.classList.add('playing');
  input.lock();
  $('o-spec').classList.add('hidden');
  if (mode === 'training') { toast('TRAINING GROUND', 2.5); feed('Shoot the targets in the streets. Loot lies in every building.'); }
  else if (net) feed(`Online match: ${net.players.length} players. Last one standing wins.`);
  else { toast('GET READY TO JUMP', 2.5); feed(isTouch ? 'Tap JUMP when the plane is over a place you like.' : 'Press SPACE to jump when the plane is over a place you like.'); }
}

// training targets: people standing in the streets of the town and on the camp's range
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
    t.pos.set(x, w.heightAt(x, z), z); t.yaw = Math.random() * Math.PI * 2; t.respawnT = 0; t.name = 'target';
    t.addTo(scene); t.animate(0, false);
    G.targets.push(t);
  }
}

/* ------------------------------------------------------------------ guns */
function switchGun(i) {
  const inv = G.inv;
  if (i === inv.cur || !inv.guns[i]) return;
  if (gun()) gun().reloading = 0;
  inv.cur = i; G.player.setGun(gun().def.id); gun().cool = 0.35;
  G.heal = null;
  audio.swap(); drawSlots();
}
function drawSlots() {
  G.inv.guns.forEach((g, i) => {
    const el = $('slot' + i);
    el.querySelector('b').textContent = g ? g.def.name : 'EMPTY';
    el.querySelector('span').textContent = g ? `${g.ammo} / ${g.reserve}` : 'find a gun';
    el.classList.toggle('on', !!g && i === G.inv.cur);
  });
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _m = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _r = new THREE.Vector3(), _u2 = new THREE.Vector3();
function camDir(out) { return out.set(Math.sin(G.yaw) * Math.cos(G.pitch), Math.sin(G.pitch), Math.cos(G.yaw) * Math.cos(G.pitch)); }
const shootables = () => G.targets.concat(G.enemies);

function fire() {
  const g = gun(), P = G.player;
  if (!g) return;
  const d = g.def;
  if (g.cool > 0 || g.busy) return;
  if (g.ammo <= 0) { audio.empty(); g.cool = 0.25; if (g.startReload()) audio.reload(d.reload); return; }
  g.ammo--; g.cool = d.rate; G.shots++;
  G.heal = null;
  const moving = P.moveSpeed > 1 ? 1 : 0;
  const scoped = d.scope && G.aimK > 0.8;
  const spread = (G.aimK > 0.5 ? d.aimSpread : d.spread) * (1 + moving * (scoped ? 4 : 0.8) + (P.onGround ? 0 : 1.5) - P.crouch * 0.3) + g.bloom;
  g.bloom = Math.min(0.022, g.bloom + d.recoil * 0.3);
  // rays start level with the player, so nothing between the camera and the player is hit
  _o.copy(camera.position);
  camDir(_d);
  const skip = scoped ? 0 : Math.max(0, _p.copy(P.pos).setY(P.eyeY()).sub(_o).dot(_d));
  _o.addScaledVector(_d, skip);
  _m.copy(scoped ? _o : P.muzzle);
  let anyHit = false, head = false;
  const pellets = d.pellets || 1;
  for (let k = 0; k < pellets; k++) {
    camDir(_d);
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    _r.crossVectors(_d, _up).normalize(); _u2.crossVectors(_r, _d);
    _d.addScaledVector(_r, Math.cos(a) * r).addScaledVector(_u2, Math.sin(a) * r).normalize();
    const o = [_o.x, _o.y, _o.z], dir = [_d.x, _d.y, _d.z];
    const shot = castShot(G.world, shootables(), o, dir, d.range, P);
    let best = shot.t, hitT = shot.target, hitHead = shot.head;
    const wh = shot.wall;
    const end = new THREE.Vector3(o[0] + dir[0] * best, o[1] + dir[1] * best, o[2] + dir[2] * best);
    // anything right in front of the muzzle blocks the shot
    let block = null;
    if (!scoped) {
      const md = end.clone().sub(_m), ml = md.length(); md.divideScalar(ml || 1);
      block = G.world.raycast([_m.x, _m.y, _m.z], [md.x, md.y, md.z], ml - 0.05);
      if (block) { end.set(...block.point); hitT = null; }
    }
    if (k < 3) fx.tracer(_m, end);
    if (k === 0) G.lastEnd = end;
    if (hitT) {
      const dealt = applyHit(P, hitT, bulletDamage(d, best, hitHead, hitT.helm), hitHead, d.name, true);
      G.dmgDealt += dealt; G.hits++;
      fx.puff(end, 0xa01818, 4, 0.22);
      anyHit = true; head = head || hitHead;
    } else if (wh || block) {
      const kind = block ? block.kind : wh.kind;
      if (k < 4) fx.puff(end, kind === 'water' ? 0xd8eef5 : kind === 'tree' ? 0x6b5434 : kind === 'wall' ? 0xc8c0b0 : 0x9a8462, 4, kind === 'water' ? 0.5 : 0.3);
    }
  }
  if (!scoped) fx.flash(P.muzzle, d.id === 'pistol' || d.id === 'smg' ? 0.35 : 0.55);
  audio.shot(d.sound);
  if (room && G.online) room.send({ t: 'shot', from: room.me, a: [+_m.x.toFixed(2), +_m.y.toFixed(2), +_m.z.toFixed(2)], b: G.lastEnd.toArray().map((v) => +v.toFixed(2)), g: d.id });
  P.recoilKick = 1;
  const kick = d.recoil * (0.7 + Math.random() * 0.6) * (G.aimK > 0.5 ? 0.6 : 1);
  G.pitch = clamp(G.pitch + kick, -1.3, 1.35); G.recoil = (G.recoil || 0) + kick;
  G.yaw += (Math.random() - 0.5) * d.recoil * 0.6;
  if (anyHit) hitMarker(head);
  drawSlots();
}
function aimAssist(dt, firing) {
  const g = gun(), P = G.player;
  if (!isTouch || !S.assist || !g || P.air || !P.alive || (g.def.scope && G.aimK > 0.8)) { G.assistTarget = null; return; }
  G.assistT -= dt;
  camDir(_d);
  if (G.assistT <= 0) {
    G.assistT = 0.15; G.assistTarget = null;
    let best = 0.075;
    for (const t of shootables()) {
      if (!t.alive || t.air === 'plane') continue;
      const c = camera.position, tx = t.pos.x - c.x, ty = t.pos.y + t.height * 0.62 - c.y, tz = t.pos.z - c.z, d = Math.hypot(tx, ty, tz);
      if (d > Math.min(g.def.range, 80) || d < 1) continue;
      const ang = Math.acos(clamp((tx * _d.x + ty * _d.y + tz * _d.z) / d, -1, 1));
      if (ang > best) continue;
      if (G.world.raycast([c.x, c.y, c.z], [tx / d, ty / d, tz / d], d - 0.5)) continue;
      best = ang; G.assistTarget = t;
    }
  }
  const t = G.assistTarget;
  if (!t || !t.alive) return;
  const c = camera.position, tx = t.pos.x - c.x, ty = t.pos.y + t.height * 0.62 - c.y, tz = t.pos.z - c.z;
  const wantYaw = Math.atan2(tx, tz), wantPitch = Math.atan2(ty, Math.hypot(tx, tz));
  let dy = wantYaw - G.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
  const rate = (firing ? 0.9 : 0.45) * dt;
  G.yaw += clamp(dy, -rate, rate); G.pitch += clamp(wantPitch - G.pitch, -rate, rate);
}

// One hit on a soldier from someone (the player, a computer player, or null for the zone).
// silent = the hit marker is handled by the caller. Returns the damage done.
function applyHit(from, target, dmg, head, how, silent) {
  if (!target.alive || (GOD && target === G.player)) return 0;
  if (from === G.player && target !== G.player) damageNumber(new THREE.Vector3(target.pos.x, target.pos.y + target.height + 0.1, target.pos.z), dmg, head);
  if (target.remote) {
    if (room && from === G.player) room.send({ t: 'hit', from: room.me, to: target.remote, dmg: +dmg.toFixed(1), head: head ? 1 : 0, how });
    if (from === G.player && !silent) hitMarker(head);
    return Math.min(dmg, 100);
  }
  const dealt = target.damage(dmg);
  if (target === G.player) hurt(from);
  else if (target.bot) target.bot.onHurt(from);
  if (!target.alive) died(target, from, how, head);
  if (from === G.player && !silent) hitMarker(head);
  return dealt;
}
function died(t, from, how, head) {
  const by = from === G.player ? 'You' : from ? from.name : 'The zone';
  if (from === G.player && t !== G.player) { G.kills++; if (G.mode !== 'training') killBanner(t.name || 'target', head); }
  feed(`<b>${by}</b> ➜ ${t === G.player ? 'You' : t.name || 'target'} <em>${head ? 'headshot' : how}</em>`);
  if (G.mode === 'training' && t !== G.player) t.respawnT = 4;
  if (t.bot) { t.bot.dropLoot(G.loot); t.deadT = 0; }
  if (t === G.player) {
    G.killer = by;
    if (G.mode !== 'training') dropBag(G.loot, G.player.pos, G.inv);
    if (room && G.online) room.send({ t: 'dead', from: room.me, by: from === G.player ? room.me : from && from.remote ? from.remote : null, how, head: head ? 1 : 0 });
  }
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

/* ------------------------------------------------------------------ sounds from around the island */
// distance to (x, z) and which side it's on (-1 left .. 1 right of where the camera looks)
function spatial(x, z) {
  const P = G.player, dx = x - P.pos.x, dz = z - P.pos.z, d = Math.hypot(dx, dz) || 0.001;
  return { d, pan: (dx * -Math.cos(G.yaw) + dz * Math.sin(G.yaw)) / d };
}
// someone else fired from a to b: their gunshot, and a whiz if it passed close by
function heardShot(a, b, gunId) {
  const P = G.player, sp = spatial(a[0], a[2]);
  if (sp.d < 300) audio.far(gunId, sp.d, sp.pan * 0.8);
  if (!P.alive || P.air) return;
  const hx = P.pos.x, hy = P.pos.y + 1.5, hz = P.pos.z;
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2], L2 = vx * vx + vy * vy + vz * vz || 1;
  const t = clamp(((hx - a[0]) * vx + (hy - a[1]) * vy + (hz - a[2]) * vz) / L2, 0, 1);
  const cx = a[0] + vx * t - hx, cy = a[1] + vy * t - hy, cz = a[2] + vz * t - hz;
  if (t > 0.05 && t < 0.98 && cx * cx + cy * cy + cz * cz < 6) audio.whiz(sp.pan);
}
// footsteps of the people around you
function footsteps(s, dt) {
  if (!s.alive || s.air || s.moveSpeed < 1.5 || s.swim) return;
  s.stepT = (s.stepT || 0) - dt * s.moveSpeed;
  if (s.stepT > 0) return;
  s.stepT = 2.2;
  const sp = spatial(s.pos.x, s.pos.z);
  if (sp.d < 28) audio.step((1 - sp.d / 28) * (s.crouching ? 0.35 : 1.4), sp.pan);
}

/* ------------------------------------------------------------------ big moments: damage numbers, kill banner */
const dmgPool = [];
for (let i = 0; i < 14; i++) { const d = document.createElement('div'); d.className = 'dnum'; $('dmgnums').appendChild(d); dmgPool.push({ el: d, t: 0, p: new THREE.Vector3() }); }
let dmgI = 0;
function damageNumber(pos, n, head) {
  const q = dmgPool[dmgI++ % dmgPool.length];
  q.p.copy(pos); q.p.x += (Math.random() - 0.5) * 0.5; q.p.y += Math.random() * 0.35; q.t = 0.9;
  q.el.textContent = Math.round(n); q.el.className = 'dnum show' + (head ? ' head' : '');
}
const _pp = new THREE.Vector3();
function updateDamageNumbers(dt) {
  for (const q of dmgPool) {
    if (q.t <= 0) continue;
    q.t -= dt; q.p.y += dt * 0.9;
    if (q.t <= 0) { q.el.className = 'dnum'; continue; }
    _pp.copy(q.p).project(camera);
    if (_pp.z > 1) { q.el.style.opacity = 0; continue; }
    q.el.style.opacity = Math.min(1, q.t * 2.5);
    q.el.style.transform = `translate(${((_pp.x + 1) / 2) * innerWidth}px, ${((1 - _pp.y) / 2) * innerHeight}px) translate(-50%, -50%)`;
  }
}
let banT = 0;
function killBanner(name, head) {
  const b = $('killban');
  b.innerHTML = `<small>${head ? 'HEADSHOT' : 'ELIMINATED'}</small><b>${esc(name)}</b><span>${G.kills} KILL${G.kills === 1 ? '' : 'S'}</span>`;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); banT = 2;
  audio.kill();
  if (isTouch && navigator.vibrate) navigator.vibrate(25);
}

/* ------------------------------------------------------------------ healing and grenades */
function useMed(kind) {
  const P = G.player, inv = G.inv;
  if (!P.alive || P.air || G.heal || inv[kind] <= 0) return;
  if (P.health >= 100) { toast('HEALTH IS FULL', 1.2); return; }
  G.heal = { kind, t: 0, dur: kind === 'medkit' ? 5 : 2.2 };
  if (gun()) gun().reloading = 0;
}
function finishHeal() {
  const P = G.player, h = G.heal; G.heal = null;
  G.inv[h.kind]--;
  P.health = Math.min(100, P.health + (h.kind === 'medkit' ? 75 : 15));
  audio.heal(); drawItems();
}
function throwNade() {
  const P = G.player;
  if (!P.alive || P.air || G.inv.grenade <= 0) return;
  G.inv.grenade--; G.heal = null;
  camDir(_d);
  const dir = _d.clone().add(new THREE.Vector3(0, 0.25, 0)).normalize();
  const from = new THREE.Vector3(P.pos.x + _d.x * 0.5, P.pos.y + P.height - 0.2, P.pos.z + _d.z * 0.5);
  G.grenades.throw(from, dir, 'You');
  if (room && G.online) room.send({ t: 'nade', from: room.me, p: from.toArray().map((v) => +v.toFixed(2)), d: dir.toArray().map((v) => +v.toFixed(3)) });
  audio.swap(); drawItems();
}
function explode(p, owner) {
  fx.flash(p, 6); fx.puff(p, 0xffa040, 10, 1.6); fx.puff(p.clone().add(new THREE.Vector3(0, 1, 0)), 0x555555, 10, 2.2);
  const dist = camera.position.distanceTo(p);
  audio.boom(clamp(1.2 - dist / 120, 0.1, 1), spatial(p.x, p.z).pan * 0.7);
  G.shake = Math.max(G.shake, clamp(1 - dist / 40, 0, 1) * 0.6);
  for (const s of [G.player].concat(G.online ? [] : shootables())) {
    if (!s.alive) continue;
    const c = s.pos.clone().setY(s.pos.y + 1), d = c.distanceTo(p);
    if (d > BLAST_R) continue;
    const dir = c.clone().sub(p).normalize();
    const wall = G.world.raycast([p.x, p.y + 0.1, p.z], [dir.x, dir.y, dir.z], d);
    if (wall && wall.kind === 'wall') continue;
    const from = owner === 'You' ? G.player : owner && owner.pos ? owner : null;
    const dealt = applyHit(from, s, BLAST_DMG * (1 - d / BLAST_R), false, 'grenade');
    if (from === G.player && s !== G.player) G.dmgDealt += dealt;
  }
}
function hurt(from) {
  $('dmg').style.opacity = 1; G.hurtT = 0.4; audio.hurt();
  if (isTouch && navigator.vibrate) navigator.vibrate(40);
  // a red mark on the side the shot came from
  if (from && from !== G.player) {
    const a = Math.atan2(from.pos.x - G.player.pos.x, from.pos.z - G.player.pos.z) - G.yaw;
    const el = $('hitdir'); el.style.transform = `translate(-50%, -50%) rotate(${-a}rad)`; el.classList.add('show'); G.hitdirT = 1.2;
  }
}

/* ------------------------------------------------------------------ picking things up */
function updatePickup(dt) {
  G.pickT -= dt;
  if (G.pickT > 0) return;
  G.pickT = 0.2;
  const P = G.player;
  if (!P.alive || P.air) { $('pick').innerHTML = ''; G.pickList = []; return; }
  const near = G.loot.near(P.pos.x, P.pos.y, P.pos.z, 2.2);
  // walk over ammo, meds, armour and grenades to take them
  for (const it of near) {
    if (Math.hypot(it.x - P.pos.x, it.z - P.pos.z) > 1.4) continue;
    const msg = G.loot.take(it, G.inv, P, true);
    if (msg) { feed(msg); audio.pickup(); drawSlots(); drawItems(); sendTake(it); }
  }
  G.pickList = G.loot.near(P.pos.x, P.pos.y, P.pos.z, 2.2).filter((it) => it.kind.startsWith('gun:')).slice(0, 3);
  const html = G.pickList.map((it, i) => `<button data-id="${it.id}">${isTouch ? '' : i === 0 ? '<kbd>F</kbd>' : ''}${itemName(it)}</button>`).join('');
  if ($('pick').dataset.html !== html) {
    $('pick').innerHTML = html; $('pick').dataset.html = html;
    $('pick').querySelectorAll('button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.stopPropagation(); takeGun(+b.dataset.id); }));
  }
}
function takeGun(id) {
  const it = G.loot.items.find((x) => x.id === id && !x.taken);
  if (!it) return;
  const msg = G.loot.take(it, G.inv, G.player, false);
  if (msg) { feed(msg); audio.pickup(); G.player.setGun(gun() ? gun().def.id : null); drawSlots(); G.pickT = 0; $('pick').dataset.html = ''; sendTake(it); }
}
function sendTake(it) { if (room && G.online) room.send({ t: 'take', from: room.me, id: it.id, n: it.n, taken: it.taken ? 1 : 0 }); }
function drawItems() {
  const inv = G.inv;
  for (const [id, n] of [['useBand', inv.bandage], ['useKit', inv.medkit], ['useNade', inv.grenade]]) {
    const b = $(id); b.querySelector('b').textContent = n; b.classList.toggle('none', n <= 0);
  }
}

/* ------------------------------------------------------------------ the drop: plane, free fall, parachute */
function planePos(t, out) {
  const r = G.route, s = t * PLANE_SPEED;
  return out.set(r.ax + r.dx * s, PLANE_Y, r.az + r.dz * s);
}
function jump() {
  const P = G.player;
  if (P.air !== 'plane') return;
  P.air = 'fall'; G.fallT = 0;
  planePos(G.planeT, P.pos); P.pos.y -= 4;
  P.vel.set(G.route.dx * 14, -6, G.route.dz * 14);
  audio.wind(1);
  toast('', 0);
}
function openChute() {
  const P = G.player;
  if (P.air !== 'fall') return;
  P.air = 'chute'; P.setChute(true); audio.chute();
}
function botShot(bot, from, to, def) {
  // sound for everyone in earshot; a tracer when it's near the player
  const P = G.player, d = Math.hypot(from[0] - P.pos.x, from[2] - P.pos.z);
  heardShot(from, to, def.id);
  if (d < 150 && bot.s.root.visible) {
    fx.tracer(bot.s.muzzle.clone(), new THREE.Vector3(...to));
    fx.flash(bot.s.muzzle, 0.45);
  }
}
function botHit(bot, target, dmg, head, def) {
  applyHit(bot.s, target, dmg, head, def.name);
  if (target === G.player) return;
  const P = G.player;
  if (Math.hypot(target.pos.x - P.pos.x, target.pos.z - P.pos.z) < 150) fx.puff(new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z), 0xa01818, 3, 0.22);
}
function updateBots(dt) {
  if (!G.bots.length) return;
  const P = G.player;
  const ctx = {
    soldiers: [P].concat(G.enemies), loot: G.loot, zone: G.zone, route: G.route,
    planeFrac: G.plane ? (G.planeT * PLANE_SPEED) / G.route.len : 2, planeAt: (f, out) => planePos((f * G.route.len) / PLANE_SPEED, out),
    onShot: botShot, onHit: botHit,
  };
  const far = FOG + 30;
  for (const b of G.bots) {
    const s = b.s;
    b.update(dt, ctx);
    // the zone hurts them too
    if (s.alive && !s.air && G.zone && !G.zone.inside(s.pos.x, s.pos.z)) {
      s.health -= G.zone.dps * dt;
      if (s.health <= 0) { s.health = 0; s.alive = false; s.dieT = 0; died(s, null, 'zone', false); }
    }
    // draw only the ones that can be seen
    const d = Math.hypot(s.pos.x - camera.position.x, s.pos.z - camera.position.z);
    const show = s.air !== 'plane' && d < far && (s.alive || (s.deadT = (s.deadT || 0) + dt) < 30);
    if (show) { s.animate(dt, !!b.target); s.root.visible = true; } else s.root.visible = false;
    footsteps(s, dt);
  }
}


function airMove(dt, k) {
  const P = G.player;
  const r = airStep(G.world, P, dt, G.yaw, k.mx, k.my);
  if (r === 'opened') audio.chute();
  if (r === 'landed') { audio.land(); if (!gun()) feed('Find a gun! Search the buildings.'); }
}

/* ------------------------------------------------------------------ camera */
const _cp = new THREE.Vector3(), _piv = new THREE.Vector3();
function updateCamera(dt, aiming) {
  const P = G.player, g = gun();
  G.aimK += ((aiming ? 1 : 0) - G.aimK) * Math.min(1, dt * 12);
  const k = G.aimK;
  camDir(_d);
  let dist = 3.2 - 1.15 * k, side = 0.85 - 0.05 * k, lift = 0.3 - 0.12 * k, py = P.pos.y + P.height - 0.25;
  if (P.air === 'plane') { planePos(G.planeT, _piv); dist = 34; side = 0; lift = 4; py = _piv.y; }
  else if (P.air === 'fall') { dist = 6; side = 0; lift = 0.8; py = P.pos.y + 0.6; }
  else if (P.air === 'chute') { dist = 8; side = 0; lift = 1.5; py = P.pos.y + 2; }
  else if (!P.alive) { dist = 5; side = 0; lift = 1.5; }
  const SP = G.spectate && G.spectate.alive ? G.spectate : null;
  if (SP) { dist = 4.5; side = 0.6; lift = 0.6; py = SP.pos.y + SP.height - 0.2; if (SP.air === 'chute' || SP.air === 'fall') { dist = 8; side = 0; lift = 1.5; } }
  const rx = -Math.cos(G.yaw), rz = Math.sin(G.yaw);
  const bx = SP ? SP.pos.x : P.air === 'plane' ? _piv.x : P.pos.x, bz = SP ? SP.pos.z : P.air === 'plane' ? _piv.z : P.pos.z;
  _piv.set(bx + rx * side, py + lift, bz + rz * side);
  const back = [-_d.x, -_d.y, -_d.z];
  const hit = P.air === 'plane' ? null : G.world.raycast([_piv.x, _piv.y, _piv.z], back, dist + 0.3);
  const dd = hit ? Math.max(0.3, hit.t - 0.3) : dist;
  _cp.set(_piv.x + back[0] * dd, _piv.y + back[1] * dd, _piv.z + back[2] * dd);
  const gy = Math.max(WATER_Y, G.world.heightAt(_cp.x, _cp.z)) + 0.3;
  if (_cp.y < gy) _cp.y = gy;
  // sniper scope: look from the soldier's eye
  const scoped = g && g.def.scope && k > 0.8 && !P.air && P.alive;
  if (scoped) _cp.set(P.pos.x, P.eyeY(), P.pos.z).addScaledVector(_d, 0.3);
  $('scope').classList.toggle('on', !!scoped);
  P.root.visible = !scoped && P.air !== 'plane';
  camera.position.copy(_cp);
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt * 1.5); }
  camera.lookAt(camera.position.x + _d.x, camera.position.y + _d.y, camera.position.z + _d.z);
  if (DBG_CAM && !P.air) {
    const a = G.yaw + (DBG_CAM === 'front' ? 0 : -Math.PI / 2);
    camera.position.set(P.pos.x + Math.sin(a) * 2.2, P.pos.y + 1.4, P.pos.z + Math.cos(a) * 2.2);
    camera.lookAt(P.pos.x, P.pos.y + 1.1, P.pos.z);
  }
  const fov = 70 + ((g && !P.air ? g.def.fov : 70) - 70) * k;
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const fp = P.air === 'plane' ? _piv : P.pos;
  sun.position.set(fp.x + SUN.x * 120, fp.y + SUN.y * 120, fp.z + SUN.z * 120);
  sun.target.position.copy(fp);
  if (G.world.sky) G.world.sky.position.set(camera.position.x, 0, camera.position.z);
}

/* ------------------------------------------------------------------ HUD */
const mini = $('mini').getContext('2d'), bigm = $('bigmap-c').getContext('2d');
function drawZoneOn(c, X, scale) {
  const Z = G.zone;
  if (!Z) return;
  c.lineWidth = 3 / scale;
  c.strokeStyle = 'rgba(80,170,255,0.95)'; c.beginPath(); c.arc(X(Z.cur.x), X(Z.cur.z), Math.max(0.1, Z.cur.r * scale), 0, Math.PI * 2); c.stroke();
  if (!Z.done) { c.strokeStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(X(Z.next.x), X(Z.next.z), Math.max(0.1, Z.next.r * scale), 0, Math.PI * 2); c.stroke(); }
}
function drawRouteOn(c, X) {
  if (!G.route || G.player.air !== 'plane') return;
  const r = G.route;
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.setLineDash([8, 6]); c.lineWidth = 2;
  c.beginPath(); c.moveTo(X(r.ax), X(r.az)); c.lineTo(X(r.ax + r.dx * r.len), X(r.az + r.dz * r.len)); c.stroke(); c.setLineDash([]);
}
function myPos() { return G.player.air === 'plane' ? planePos(G.planeT, _p) : G.player.pos; }
function drawMinimap() {
  const c = mini, W = 300, map = G.world.mapCanvas, scale = map.width / (2 * HALF), mp = myPos();
  const view = G.player.air ? 500 : 180;
  const s = W / (view * scale);
  c.save();
  c.fillStyle = '#1f5f82'; c.fillRect(0, 0, W, W);
  c.translate(W / 2, W / 2);
  c.rotate(G.yaw - Math.PI); // the map turns with you (up = where you look)
  c.scale(s, s);
  const px = (mp.x + HALF) * scale, pz = (mp.z + HALF) * scale;
  c.translate(-px, -pz);
  c.drawImage(map, 0, 0);
  const X = (x) => (x + HALF) * scale;
  drawZoneOn(c, X, scale);
  drawRouteOn(c, X);
  c.fillStyle = '#ff4a3a';
  for (const t of G.targets) if (t.alive) { c.beginPath(); c.arc(X(t.pos.x), X(t.pos.z), 4 / s, 0, Math.PI * 2); c.fill(); }
  c.restore();
  c.fillStyle = '#ffcf3f'; c.strokeStyle = '#000'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(W / 2, W / 2 - 12); c.lineTo(W / 2 + 8, W / 2 + 9); c.lineTo(W / 2, W / 2 + 4); c.lineTo(W / 2 - 8, W / 2 + 9); c.closePath(); c.stroke(); c.fill();
}
function drawBigMap() {
  const c = bigm, W = 600, map = G.world.mapCanvas, mp = myPos();
  c.drawImage(map, 0, 0, W, W);
  const scale = W / (2 * HALF), X = (x) => (x + HALF) * scale;
  drawZoneOn(c, X, scale);
  drawRouteOn(c, X);
  c.save(); c.translate(X(mp.x), X(mp.z)); c.rotate(-G.yaw + Math.PI);
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
const setT = (id, v) => { const e = $(id); if (e.textContent !== String(v)) e.textContent = v; };
function updateHUD(dt) {
  const P = G.player, g = gun();
  const heading = ((Math.atan2(Math.sin(G.yaw), -Math.cos(G.yaw)) * 180) / Math.PI + 360) % 360;
  $('compass-strip').style.transform = `translateX(${$('compass').clientWidth / 2 - (heading + 360) * 2}px)`;
  $('hpbar').style.width = P.health + '%'; setT('hptext', Math.ceil(P.health));
  $('hpbar').parentElement.classList.toggle('low', P.health < 30);
  $('armorbar').style.width = P.armor + '%';
  setT('vestlv', P.vest ? `VEST ${P.vest}` : 'VEST —'); $('vestlv').classList.toggle('on', P.vest > 0);
  setT('helmlv', P.helm ? `HELMET ${P.helm}` : 'HELMET —'); $('helmlv').classList.toggle('on', P.helm > 0);
  if (g) {
    setT('ammo-n', g.ammo); $('ammo-n').classList.toggle('low', g.ammo <= g.def.mag * 0.2);
    setT('ammo-r', '/ ' + g.reserve);
    setT('reloadtxt', g.busy ? 'RELOADING…' : g.ammo === 0 && g.reserve === 0 ? 'NO AMMO' : '');
  } else { setT('ammo-n', '—'); setT('ammo-r', ''); setT('reloadtxt', ''); }
  if (g) {
    const spread = (G.aimK > 0.5 ? g.def.aimSpread : g.def.spread) * (1 + (P.moveSpeed > 1 ? 0.8 : 0)) + g.bloom;
    $('cross').style.setProperty('--gap', (4 + spread * 420).toFixed(1) + 'px');
  }
  $('cross').classList.toggle('aim', G.aimK > 0.5);
  if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) $('hitm').classList.remove('show'); }
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (G.hurtT > 0) { G.hurtT -= dt; if (G.hurtT <= 0) $('dmg').style.opacity = 0; }
  if (G.hitdirT > 0) { G.hitdirT -= dt; if (G.hitdirT <= 0) $('hitdir').classList.remove('show'); }
  // healing bar
  $('healbar').classList.toggle('on', !!G.heal);
  if (G.heal) { $('healbar').querySelector('i').style.width = ((G.heal.t / G.heal.dur) * 100).toFixed(0) + '%'; $('healbar').querySelector('span').textContent = G.heal.kind === 'medkit' ? 'Using med kit…' : 'Bandaging…'; }
  // the drop
  document.body.classList.toggle('air', !!P.air);
  const ab = $('airbtn');
  ab.classList.toggle('on', P.air === 'plane' || P.air === 'fall');
  setT('airbtn', P.air === 'plane' ? 'JUMP' : 'OPEN');
  setT('altitude', P.air === 'fall' || P.air === 'chute' ? Math.max(0, Math.round(P.pos.y - G.world.groundBelow(P.pos.x, P.pos.z, P.pos.y))) + ' m' : '');
  // the zone
  if (G.zone) {
    const Z = G.zone, zi = $('zoneinfo');
    setT('zt', Z.done ? '' : fmt(Z.t));
    setT('zmsg', Z.done ? 'Final zone' : Z.phase === 'wait' ? 'Zone shrinks' : 'Zone shrinking');
    zi.classList.toggle('shrink', Z.phase === 'shrink');
    const dIn = Math.hypot(P.pos.x - Z.next.x, P.pos.z - Z.next.z) - Z.next.r;
    setT('zdist', !P.air && dIn > 0 && !Z.done ? `Safe zone ${Math.round(dIn)} m away` : '');
    $('outzone').classList.toggle('on', !P.air && P.alive && !Z.inside(P.pos.x, P.pos.z));
    setT('alive', 1 + G.enemies.filter((e) => e.alive).length);
    setT('kills', G.kills);
  } else $('outzone').classList.remove('on');
  // area name when entering a named place
  let area = '';
  for (const A of AREAS) if (Math.hypot(P.pos.x - A.x, P.pos.z - A.z) < A.r) area = A.name;
  if (area !== G.area && !P.air) { G.area = area; if (area) { $('area').textContent = area.toUpperCase(); $('area').classList.add('show'); G.areaT = 3; } }
  if (G.areaT > 0) { G.areaT -= dt; if (G.areaT <= 0) $('area').classList.remove('show'); }
  const mp = myPos();
  setT('coords', `${Math.round(mp.x)}, ${Math.round(mp.z)}`);
  drawMinimap();
  if (!$('bigmap').classList.contains('hidden')) drawBigMap();
}

/* ------------------------------------------------------------------ online with friends */
// A floating name label above another player.
function nameTag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,10,0.7)';
  g.beginPath(); if (g.roundRect) g.roundRect(4, 10, 248, 44, 12); else g.rect(4, 10, 248, 44); g.fill();
  g.fillStyle = '#ffffff'; g.font = 'bold 28px Rubik, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(name, 128, 33, 236);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  sp.scale.set(1.6, 0.4, 1); sp.position.y = 2.15; sp.name = 'tag';
  return sp;
}
function lbStatus(text, isErr = false) { const st = $('lb-status'); st.textContent = text; st.classList.toggle('err', isErr); }
function lbView(which) { $('lb-entry').classList.toggle('hidden', which !== 'entry'); $('lb-room').classList.toggle('hidden', which !== 'room'); }
function openOnline(code) {
  audio.init();
  $('lobby').classList.remove('hidden');
  $('lb-name').value = S.name;
  if (code) $('lb-code').value = cleanCode(code);
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
  try { await r.create(name, {}); room = r; G.room = r; lbView('room'); lbStatus(''); }
  catch (e) { r.leave(); lbStatus(e.message, true); }
  $('lb-create').disabled = false;
}
async function joinRoom() {
  const name = lobbyName(); if (!name) return;
  const code = cleanCode($('lb-code').value); $('lb-code').value = code;
  if (code.length !== 6) { lbStatus('Room codes have 6 letters and numbers.', true); return; }
  $('lb-joinbtn').disabled = true; lbStatus('Joining room ' + code + '…');
  const r = makeRoom(); room = r; G.room = r;
  try { await r.join(code, name); lbView('room'); lbStatus(''); }
  catch (e) { room = null; G.room = null; lbView('entry'); lbStatus(e.message, true); }
  $('lb-joinbtn').disabled = false;
}
function leaveRoom() {
  if (room) room.leave();
  room = null; G.room = null;
  $('lobby').classList.add('hidden');
  showMenu();
}
function renderLobby(players, info, state) {
  if (!room) return;
  $('lb-codeshow').textContent = room.code;
  $('lb-players').innerHTML = players.map((p) => `<li><b>${esc(p.name)}</b>${p.host ? '<em>HOST</em>' : ''}${p.id === room.me ? '<em class="you">YOU</em>' : ''}</li>`).join('') +
    (players.length < MAX_PLAYERS ? `<li class="empty">${MAX_PLAYERS - players.length} more can join</li>` : '');
  if (room.isHost) {
    const n = players.length;
    $('lb-start').classList.remove('hidden');
    $('lb-start').disabled = n < 2;
    $('lb-start').textContent = n < 2 ? 'WAITING FOR FRIENDS…' : `START MATCH (${n} PLAYERS)`;
    $('lb-wait').textContent = n < 2 ? 'Send the code or link to your friends (2 to 6 players).' : '';
  } else {
    $('lb-start').classList.add('hidden');
    $('lb-wait').textContent = state !== 'lobby' && !G.online ? "A match is running. You'll join the next one." : 'Waiting for the host to start the match…';
  }
}
function hostStart() {
  if (!room || !room.isHost || room.players.length < 2) return;
  if (G.online && G.enemies.filter((e) => e.alive).length + (G.player.alive ? 1 : 0) > 1) { toast('WAIT FOR THE MATCH TO FINISH', 2); return; }
  const m = { t: 'start', seed: (Math.random() * 1e9) | 0, players: room.players.slice(0, MAX_PLAYERS).map((p) => ({ id: p.id, name: p.name })) };
  room.setState('playing');
  room.send(m);
  onlineStart(m);
}
function onlineStart(m) {
  const myIdx = m.players.findIndex((p) => p.id === room.me);
  if (myIdx < 0) return;
  $('lobby').classList.add('hidden');
  startMatch('online', { seed: m.seed, players: m.players, myIdx });
}
function onNetMsg(m) {
  if (!m || typeof m !== 'object') return;
  if (m.t === 'start') { onlineStart(m); return; }
  if (!G.online) return;
  const r = G.remotes.get(m.from), P = G.player;
  if (m.t === 's') {
    if (!r || !(m.n > (r.lastN || 0))) return;
    r.lastN = m.n; r.snaps.push(Object.assign({ at: performance.now() }, m));
    if (r.snaps.length > 30) r.snaps.shift();
  } else if (m.t === 'shot') {
    const d = Math.hypot(m.a[0] - P.pos.x, m.a[2] - P.pos.z);
    heardShot(m.a, m.b, String(m.g));
    if (d < 160) { fx.tracer(new THREE.Vector3(...m.a), new THREE.Vector3(...m.b)); fx.flash(new THREE.Vector3(...m.a), 0.45); }
  } else if (m.t === 'hit') {
    if (m.to === room.me && P.alive) applyHit(r ? r.s : null, P, clamp(+m.dmg || 0, 0, 300), !!m.head, String(m.how || '').slice(0, 20));
  } else if (m.t === 'dead') {
    if (!r) return;
    r.s.alive = false; r.s.dieT = 0;
    const byMe = m.by === room.me, killer = byMe ? 'You' : m.by ? (G.remotes.get(m.by) || { s: { name: '?' } }).s.name : 'The zone';
    if (byMe) { G.kills++; killBanner(r.s.name, !!m.head); }
    feed(`<b>${esc(killer)}</b> ➜ ${esc(r.s.name)} <em>${m.head ? 'headshot' : esc(String(m.how || '').slice(0, 20))}</em>`);
    if (G.spectate === r.s) spectateNext();
  } else if (m.t === 'take') {
    const it = G.loot.items.find((x) => x.id === m.id);
    if (it && !it.taken) { if (m.taken) G.loot.remove(it); else it.n = m.n; }
  } else if (m.t === 'drop') {
    if (!G.loot.items.some((x) => x.id === m.id)) G.loot.add(String(m.kind), +m.x, +m.y, +m.z, +m.n || 1, m.id);
  } else if (m.t === 'nade') {
    if (r) G.grenades.throw(new THREE.Vector3(...m.p), new THREE.Vector3(...m.d), r.s);
  } else if (m.t === 'win') {
    if (r) { toast(`${r.s.name.toUpperCase()} WINS!`, 4); feed(`<b>${esc(r.s.name)}</b> is the last one standing`); }
  }
}
function onNetLeave(id, name) {
  const r = G.remotes.get(id);
  if (G.online && r) {
    scene.remove(r.s.root); G.remotes.delete(id);
    G.enemies = G.enemies.filter((e) => e !== r.s);
    if (G.spectate === r.s) spectateNext();
  }
  if (G.online) feed(`${esc(name)} left the match`);
}
function onNetClosed(reason) {
  room = null; G.room = null;
  showMenu(); openOnline(); lbStatus(reason, true);
}
// Place another player between the two updates around "now - 130 ms" (smooth even with jittery updates).
function netPose(r) {
  const sn = r.snaps, s = r.s;
  if (!sn.length) return;
  const rt = performance.now() - 130;
  let a = null, b = null;
  for (let k = sn.length - 1; k >= 0; k--) if (sn[k].at <= rt) { a = sn[k]; b = sn[k + 1] || null; break; }
  if (!a) { a = sn[0]; b = null; }
  const L = sn[sn.length - 1];
  if (b) {
    const f = clamp((rt - a.at) / Math.max(1, b.at - a.at), 0, 1);
    let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    s.pos.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f); s.yaw = a.yaw + dy * f;
  } else { s.pos.set(a.x, a.y, a.z); s.yaw = a.yaw; }
  s.pitch = L.pitch || 0; s.crouching = !!L.c; s.crouch = L.c ? 1 : 0; s.moveSpeed = L.v || 0; s.swim = !!L.sw; s.helm = L.helm || 0; s.vest = L.vs || 0;
  s.onGround = true; s.backwards = false;
  const air = L.air || null;
  if (s.air !== air) { s.air = air; s.setChute(air === 'chute'); }
  if ((L.g || null) !== s.gunId) s.setGun(GUNS[L.g] ? L.g : null);
  if (!L.al && s.alive) { s.alive = false; s.dieT = 0; }
  while (sn.length > 3 && sn[1].at < rt - 400) sn.shift();
}
function updateRemotes(dt) {
  for (const r of G.remotes.values()) {
    netPose(r);
    const d = Math.hypot(r.s.pos.x - camera.position.x, r.s.pos.z - camera.position.z);
    if (r.s.air !== 'plane' && d < FOG + 30) { r.s.animate(dt, false); r.s.root.visible = true; } else r.s.root.visible = false;
    footsteps(r.s, dt);
  }
  // tell the others where I am (about 15 times a second)
  G.sendT -= dt / TIME_SCALE;
  if (room && G.sendT <= 0) {
    G.sendT = 1 / 15;
    const P = G.player, p = P.air === 'plane' ? planePos(G.planeT, _p) : P.pos, f = (v) => +v.toFixed(2);
    room.send({ t: 's', from: room.me, n: ++G.seq, x: f(p.x), y: f(p.y), z: f(p.z), yaw: +P.yaw.toFixed(3), pitch: +G.pitch.toFixed(2), air: P.air || '', c: P.crouching ? 1 : 0, g: P.gunId || '', v: f(P.moveSpeed), al: P.alive ? 1 : 0, helm: P.helm, vs: P.vest, sw: P.swim ? 1 : 0 });
  }
}

/* ------------------------------------------------------------------ results */
function endMatch(won) {
  if (G.state !== 'play') return;
  G.state = 'over'; G.overT = 0; G.spectate = null;
  input.unlock();
  const alive = 1 + G.enemies.filter((e) => e.alive).length, total = 1 + G.enemies.length;
  $('o-title').textContent = won ? 'WINNER!' : 'YOU DIED';
  $('o-sub').textContent = won ? (G.enemies.length ? 'Last one standing on the island.' : 'You survived every zone. Computer players join in the next update.')
    : G.enemies.length ? `${G.killer && G.killer !== 'The zone' ? 'Killed by ' + G.killer : 'The zone got you'}. Placed #${alive} of ${total}.` : 'The zone got you. Stay inside the white circle on the map.';
  const stat = (l, v) => `<div><span>${l}</span><b>${v}</b></div>`;
  $('o-stats').innerHTML = stat('Rank', `#${won ? 1 : alive}`) + stat('Kills', G.kills) + stat('Damage', Math.round(G.dmgDealt)) + stat('Survived', fmt(G.matchT));
  if (G.online) {
    const host = room && room.isHost;
    $('o-again').classList.toggle('hidden', !host);
    $('o-again').textContent = 'NEXT MATCH';
    $('o-spec').classList.toggle('hidden', won || !G.enemies.some((e) => e.alive));
    $('o-menu').textContent = 'LEAVE ROOM';
    if (won && room) room.send({ t: 'win', from: room.me });
    if (host) room.setState('lobby'); // friends can join for the next match
  } else { $('o-again').classList.remove('hidden'); $('o-again').textContent = 'PLAY AGAIN'; $('o-spec').classList.add('hidden'); $('o-menu').textContent = 'MENU'; }
  setTimeout(() => $('over').classList.remove('hidden'), won ? 1200 : 2200);
  if (won) audio.ding();
}
function spectateNext() {
  const alive = G.enemies.filter((e) => e.alive);
  if (!alive.length) { G.spectate = null; $('specbar').classList.add('hidden'); $('over').classList.remove('hidden'); return; }
  const i = alive.indexOf(G.spectate);
  G.spectate = alive[(i + 1) % alive.length];
  G.yaw = G.spectate.yaw; G.pitch = -0.1;
  $('spec-name').textContent = G.spectate.name;
  $('specbar').classList.remove('hidden'); $('over').classList.add('hidden');
}

/* ------------------------------------------------------------------ flow */
function showMenu() {
  G.state = 'menu';
  input.unlock();
  clearMatch();
  G.player.air = null; G.player.root.visible = true;
  G.online = false;
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); $('pause').classList.add('hidden'); $('over').classList.add('hidden'); $('clickplay').classList.add('hidden');
  $('online').textContent = room ? 'BACK TO ONLINE ROOM ' + room.code : 'PLAY ONLINE WITH FRIENDS';
  $('m-name').value = S.name;
  document.body.classList.remove('playing', 'air');
  $('m-sens').value = S.sens;
  $('m-lvl').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === S.level);
    b.onclick = () => { S.level = b.dataset.v; save(); showMenu(); };
  });
  $('m-q').querySelectorAll('button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === S.q);
    b.onclick = () => { if (S.q === b.dataset.v) return; S.q = b.dataset.v; save(); location.reload(); };
  });
}
function pause() {
  if (G.state !== 'play') return;
  G.state = 'paused'; input.unlock();
  $('pause').classList.remove('hidden'); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF');
  $('p-sens').value = S.sens;
  $('p-assist').textContent = 'AIM ASSIST: ' + (S.assist ? 'ON' : 'OFF');
  $('p-assist').classList.toggle('hidden', !isTouch);
}
function resume() { $('pause').classList.add('hidden'); G.state = 'play'; input.lock(); last = performance.now(); }

input.onLockChange = (locked) => {
  if (isTouch) return;
  $('clickplay').classList.toggle('hidden', locked || G.state !== 'play');
};
input.onPress = (code) => {
  if (code === 'Escape' || code === 'KeyP') { if (G.state === 'paused') resume(); else if (G.state === 'play' && (isTouch || !input.locked)) pause(); }
  if (G.state !== 'play') return;
  if (code === 'KeyM') toggleMap();
  if (code === 'KeyF') { if (G.player.air === 'plane') jump(); else if (G.pickList && G.pickList[0]) takeGun(G.pickList[0].id); }
  if (code === 'Space') { if (G.player.air === 'plane') jump(); else if (G.player.air === 'fall') openChute(); }
  if (code === 'Digit4') useMed('bandage');
  if (code === 'Digit5') useMed('medkit');
  if (code === 'KeyG') throwNade();
};
function toggleMap() { if (G.state === 'play') $('bigmap').classList.toggle('hidden'); }
$('game').addEventListener('click', () => { if ((G.state === 'play' || G.spectate) && !input.locked) input.lock(); });

/* ------------------------------------------------------------------ main loop */
let last = performance.now(), fpsT = 0, fpsN = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!(rdt > 0)) rdt = 0;
  const dt = rdt * TIME_SCALE;
  fpsT += rdt; fpsN++;
  if (fpsT > 2) {
    const fps = fpsN / fpsT;
    $('fps').textContent = Math.round(fps) + ' fps';
    // keep it smooth: drop the resolution when the phone struggles, raise it again when there's room
    if (!G.pr) G.pr = BASE_PR;
    if (G.state === 'play' && !params.has('fixedres')) {
      const next = fps < 26 ? Math.max(0.55, G.pr - 0.15) : fps > 52 ? Math.min(BASE_PR, G.pr + 0.1) : G.pr;
      if (Math.abs(next - G.pr) > 0.01) { G.pr = next; renderer.setPixelRatio(G.pr); renderer.setSize(innerWidth, innerHeight); }
    }
    fpsT = 0; fpsN = 0;
  }
  const P = G.player;
  if (!P) return;
  if (G.state === 'play' || G.state === 'over') {
    const k = G.state === 'play' || G.spectate ? input.read() : { mx: 0, my: 0, lookX: 0, lookY: 0 };
    const sens = 0.0024 * S.sens * (G.aimK > 0.5 ? (gun() && gun().def.scope ? 0.25 : 0.6) : 1);
    G.yaw -= k.lookX * sens; G.pitch = clamp(G.pitch - k.lookY * sens, -1.3, 1.35);
    if (G.recoil > 0) { const r = Math.min(G.recoil, dt * (k.fire ? 0.06 : 0.35) + G.recoil * dt * 4); G.pitch -= r * 0.8; G.recoil -= r; }
    if (G.state === 'play') aimAssist(rdt, !!k.fire);
    G.matchT += P.alive && G.state === 'play' ? dt : 0;
    let aiming = false;
    // the plane flies on whatever the player is doing (the computer players jump from it)
    if (G.plane) {
      G.planeT += dt;
      planePos(G.planeT, _p);
      G.plane.position.copy(_p); G.plane.rotation.y = Math.atan2(G.route.dx, G.route.dz);
      for (const pr of G.plane.userData.props) pr.rotation.z += dt * 40;
      if (G.planeT * PLANE_SPEED > G.route.len + 200 && P.air !== 'plane') { scene.remove(G.plane); G.plane = null; }
    }
    if (P.air === 'plane') {
      planePos(G.planeT, P.pos);
      if (G.planeT * PLANE_SPEED > G.route.len - 40) { jump(); feed('You were dropped at the end of the route.'); }
    } else if (P.air) {
      airMove(dt, k);
    } else if (P.alive && G.state === 'play') {
      const fx_ = Math.sin(G.yaw), fz_ = Math.cos(G.yaw), rx = -fz_, rz = fx_;
      const wx = fx_ * k.my + rx * k.mx, wz = fz_ * k.my + rz * k.mx;
      aiming = k.aim && !P.swim && !!gun();
      const sprint = k.sprint && k.my > 0.3 && !aiming && !k.fire && !G.heal;
      P.crouching = k.crouch && !P.swim;
      const wasGround = P.onGround;
      P.move(dt, wx, wz, sprint ? 'sprint' : k.walk || G.heal ? 'walk' : 'run', k.jump);
      if (!wasGround && P.onGround) audio.land();
      let dy = G.yaw - P.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      P.yaw += dy * Math.min(1, dt * 18);
      P.pitch = G.pitch;
      // guns
      for (const g of G.inv.guns) if (g) g.update(dt);
      if (k.slot1) switchGun(0); if (k.slot2) switchGun(1); if (k.swap) switchGun(1 - G.inv.cur);
      const g = gun();
      if (g && k.reload && g.startReload()) { audio.reload(g.def.reload); G.heal = null; }
      if (g && k.fire && !P.swim && (isTouch || input.locked)) { if (g.def.auto || !G.fireHeld) fire(); }
      G.fireHeld = k.fire;
      if (g && g.ammo === 0 && !g.busy && g.reserve > 0 && g.cool <= 0) { g.startReload(); audio.reload(g.def.reload); }
      if (P.onGround && P.moveSpeed > 1.5) { G.stepT -= dt * P.moveSpeed; if (G.stepT <= 0) { G.stepT = 2.2; audio.step(P.crouching ? 0.4 : 1); } }
      if (G.heal) { G.heal.t += dt; if (G.heal.t >= G.heal.dur) finishHeal(); }
      updatePickup(dt);
    }
    if (G.state === 'play' || G.spectate) input.endFrame();
    P.animate(dt, aiming);
    updateCamera(rdt, aiming);
    // the zone hurts anyone outside it
    if (G.zone) {
      G.zone.update(dt);
      if (P.alive && !P.air && !GOD && !G.zone.inside(P.pos.x, P.pos.z)) {
        P.health = Math.max(0, P.health - G.zone.dps * dt);
        G.zoneTickT -= dt; if (G.zoneTickT <= 0) { G.zoneTickT = 1; audio.zoneTick(); $('dmg').style.opacity = 0.5; G.hurtT = 0.3; }
        if (P.health <= 0) { P.alive = false; P.dieT = 0; died(P, null, 'zone', false); }
      }
    }
    G.grenades.update(dt, explode);
    updateBots(dt);
    if (G.online) updateRemotes(dt);
    // background: the sea near the coast, wind up high, the plane's engines
    {
      const lp = myPos(), gh = G.world.heightAt(lp.x, lp.z);
      const planeD = G.plane ? G.plane.position.distanceTo(camera.position) : 1e9;
      audio.ambience(clamp(1 - (gh - 1) / 9, 0, 1), P.air === 'fall' ? 1 : P.air ? 0.5 : clamp((lp.y - 15) / 30, 0, 0.6), P.air === 'plane' ? 1 : clamp(1 - planeD / 500, 0, 1));
    }
    if (G.zone) {
      const Z = G.zone;
      if (Z.phase !== G.zonePhase) { if (Z.phase === 'shrink' && G.zonePhase) { toast('ZONE IS SHRINKING!', 2.5); audio.alarm(); } G.zonePhase = Z.phase; G.warned = false; }
      if (Z.phase === 'wait' && Z.t < 10 && !G.warned && !Z.done) { G.warned = true; toast('ZONE SHRINKS IN 10 S', 2); audio.zoneTick(); }
    }
    // low health: red edges and a heartbeat
    const low = P.alive && P.health < 30 && G.state === 'play';
    $('lowhp').classList.toggle('on', low);
    if (low) { G.beatT -= rdt; if (G.beatT <= 0) { G.beatT = 0.9; audio.heartbeat(); } }
    updateDamageNumbers(rdt);
    if (banT > 0) { banT -= rdt; if (banT <= 0) $('killban').classList.remove('show'); }
    // training targets fall when hit and stand up again
    for (const t of G.targets) {
      if (!t.alive) { t.respawnT -= dt; if (t.respawnT <= 0) { t.revive(); t.yaw = Math.random() * Math.PI * 2; } }
      t.moveSpeed = 0; t.animate(dt, false);
    }
    if (G.loot) G.loot.update(P.pos.x, P.pos.z);
    fx.update(dt);
    if (G.state === 'play') {
      updateHUD(rdt);
      // end of the match
      if (G.mode === 'online') {
        if (!P.alive) endMatch(false);
        else if (G.enemies.every((e) => !e.alive)) endMatch(true);
      } else if (G.mode === 'battle') {
        if (!P.alive) endMatch(false);
        else if (G.enemies.length ? G.enemies.every((e) => !e.alive) : G.zone.stage >= STAGES.length - 1) endMatch(true);
      } else if (!P.alive) { P.revive(); P.pos.set(13, G.world.heightAt(13, 13) + 0.1, 13); feed('Back on your feet.'); }
    }
  } else if (G.state === 'menu') {
    audio.ambience(0.35, 0.15, 0);
    G.menuA = (G.menuA || 0) + rdt * 0.05;
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
$('start').onclick = () => startMatch('battle');
$('training').onclick = () => startMatch('training');
$('m-sens').addEventListener('input', (e) => { S.sens = +e.target.value; save(); });
$('p-sens').addEventListener('input', (e) => { S.sens = +e.target.value; save(); });
$('p-assist').onclick = () => { S.assist = !S.assist; save(); $('p-assist').textContent = 'AIM ASSIST: ' + (S.assist ? 'ON' : 'OFF'); };
$('pauseBtn').onclick = () => (G.state === 'paused' ? resume() : pause());
$('p-resume').onclick = resume;
$('p-menu').onclick = showMenu;
$('p-sound').onclick = () => { audio.init(); audio.toggle(); $('p-sound').textContent = 'SOUND: ' + (audio.on ? 'ON' : 'OFF'); };
$('o-again').onclick = () => { if (G.online) hostStart(); else startMatch(G.mode); };
$('o-menu').onclick = () => { if (G.online) leaveRoom(); else showMenu(); };
$('o-spec').onclick = spectateNext;
$('spec-next').onclick = spectateNext;
$('spec-results').onclick = () => { G.spectate = null; $('specbar').classList.add('hidden'); $('over').classList.remove('hidden'); };
$('online').onclick = () => openOnline();
$('m-name').addEventListener('change', () => { S.name = cleanName($('m-name').value); save(); });
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
addEventListener('beforeunload', () => { if (room) room.leave(); });
$('mapBtn').onclick = toggleMap;
$('mapClose').onclick = () => $('bigmap').classList.add('hidden');
$('airbtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (G.player.air === 'plane') jump(); else openChute(); });
$('useBand').addEventListener('pointerdown', (e) => { e.stopPropagation(); useMed('bandage'); });
$('useKit').addEventListener('pointerdown', (e) => { e.stopPropagation(); useMed('medkit'); });
$('useNade').addEventListener('pointerdown', (e) => { e.stopPropagation(); throwNade(); });
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
  drawItems();
  if (params.has('auto')) startMatch(params.get('auto') === 'training' ? 'training' : 'battle');
  if (params.has('room')) openOnline(params.get('room'));
  // testing aid: ?mp=host&name=A creates a room and starts when ?humans players are in; ?mp=join&room=CODE&name=B joins it
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
  // the realistic soldier model (same characters as Kadal Nagaram); the built-in one until it loads
  if (!params.has('simple')) {
    const files = Q === 'low' ? ['player.glb'] : ['player.glb', 'ped1.glb', 'ped2.glb', 'ped3.glb', 'thug.glb'];
    loadCharacters('../GTA-Game/models/', files, { 'player.glb': 1.78, 'ped1.glb': 1.72, 'ped2.glb': 1.75, 'ped3.glb': 1.73, 'thug.glb': 1.8 })
      .then((lib) => {
        if (!lib) return;
        G.player.upgrade();
        for (const b of G.bots) b.s.upgrade();
        for (const r of G.remotes.values()) { r.s.upgrade(); if (!r.s.root.getObjectByName('tag')) r.s.root.add(nameTag(r.s.name)); }
      }).catch(() => {});
  }
}, 30);
