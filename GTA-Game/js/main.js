// Kadal Nagaram: game loop, player, camera, police, pickups, sky and save data.
import * as THREE from 'three';
import * as W from './world.js';
import { makeHuman, animateHuman, seatedPose, Ped, PLAYER_LOOK } from './characters.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Vehicle, setVehicleNight } from './vehicles.js';
import { aiControl, setRoute } from './traffic.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Missions } from './missions.js';
import { GameAudio } from './audio.js';
import { fetchArea, buildOSMWorld } from './osm.js';
import { loadModels } from './models.js';

const audio = new GameAudio();
const isTouch = matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', isTouch);

/* ------------------------------------------------------------------ renderer & scene */
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !isTouch;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xa9d8f5, 90, 380);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 620);

const hemi = new THREE.HemisphereLight(0xbfdfff, 0x5a4a3a, 0.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 4096, isTouch ? 1024 : 4096);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 420 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// Real headlight for the player's vehicle (always in the scene so shaders never recompile).
const headlight = new THREE.SpotLight(0xfff1d6, 0, 70, 0.55, 0.45, 1.1);
scene.add(headlight, headlight.target);
let nightLevel = 0;
function updateHeadlight() {
  const v = G.veh;
  if (!v || v.health <= 0 || nightLevel < 0.05) { headlight.intensity = 0; return; }
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading), front = v.cfg.len / 2;
  headlight.position.set(v.pos.x + fx * front, v.pos.y + 0.9, v.pos.z + fz * front);
  headlight.target.position.set(v.pos.x + fx * (front + 22), v.pos.y - 1.5, v.pos.z + fz * (front + 22));
  headlight.intensity = nightLevel * (v.type === 'bike' || v.type === 'auto' ? 140 : 220);
}

// sky dome with a gradient, sun disc and sunset glow
const skyU = {
  top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
  sunCol: { value: new THREE.Color(1, 0.85, 0.6) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunVis: { value: 1 },
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; uniform float sunVis; varying vec3 vDir;
  void main(){
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 c = mix(horizon, top, pow(h, 0.55));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    c += sunCol * (pow(s, 700.0) * 5.0 + pow(s, 10.0) * 0.35) * sunVis;
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
}));
sky.renderOrder = -1;
scene.add(sky);
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let k = 0; k < 500; k++) {
    const a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.92, r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 470, y * 470, Math.sin(a) * r * 470);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
const starPts = new THREE.Points(starGeo, starMat);
scene.add(starPts);

// Which map? ?place=lat,lon&name=... loads a real OpenStreetMap area, otherwise the fictional city.
const params = new URLSearchParams(location.search);
let world;
if (params.get('place')) {
  const [plat, plon] = params.get('place').split(',').map(Number);
  const place = { lat: plat, lon: plon, name: params.get('name') || 'Real place', radius: W.clamp(+(params.get('r') || 650), 300, 1200) };
  const loading = document.getElementById('loading'), msg = document.getElementById('loading-msg');
  loading.classList.remove('hidden');
  document.getElementById('loading-title').textContent = place.name.split(',').slice(0, 2).join(',');
  try {
    if (!isFinite(plat) || !isFinite(plon)) throw new Error('Invalid location');
    const data = await fetchArea(plat, plon, place.radius, (m) => { msg.textContent = m; });
    msg.textContent = 'Building the city…';
    await new Promise((r) => setTimeout(r, 40));
    world = buildOSMWorld(scene, data, place, isTouch);
  } catch (e) {
    location.replace('?maperr=' + encodeURIComponent((e && e.message) || 'Could not load the map'));
    throw e;
  }
  loading.classList.add('hidden');
  document.getElementById('attr').classList.remove('hidden');
} else world = W.buildWorld(scene, isTouch);

// Optional artist-made characters (models/manifest.json). Falls back to procedural people.
{
  const loading = document.getElementById('loading'), msg = document.getElementById('loading-msg');
  const shown = loading.classList.contains('hidden');
  const lib = await loadModels((m) => {
    if (shown) { loading.classList.remove('hidden'); document.getElementById('loading-title').textContent = 'Loading characters'; }
    msg.textContent = m;
  });
  loading.classList.add('hidden');
  if (lib) console.info('Using artist models:', Object.keys(lib.clips).join(', '));
}

// Image-based lighting: reflections and ambient light come from the current sky.
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
envScene.add(new THREE.Mesh(sky.geometry, sky.material));
const envGroundMat = new THREE.MeshBasicMaterial({ color: 0x3b3f36, side: THREE.DoubleSide });
const envGround = new THREE.Mesh(new THREE.CircleGeometry(400, 24), envGroundMat);
envGround.rotation.x = -Math.PI / 2; envGround.position.y = -8; envScene.add(envGround);
let envRT = null, envTimer = 0;
function updateEnv(night) {
  envGroundMat.color.setRGB(0.23 * (1 - night) + 0.015, 0.24 * (1 - night) + 0.015, 0.21 * (1 - night) + 0.02);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 1000);
  if (envRT) envRT.dispose();
  envRT = rt; scene.environment = rt.texture;
}

// Post-processing (desktop): bloom on lights, multisampled render target.
let composer = null, bloom = null;
if (!isTouch) {
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.5, 1.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
const input = new Input(canvas, isTouch);
const hud = new HUD(world.map);

/* ------------------------------------------------------------------ state & save */
const SAVE_KEY = 'kadal-nagaram-save-v1';
function loadSave() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (_) { return {}; } }
const saved = loadSave();
// Day/night pacing: start at 9:00, about 30 real minutes of daylight until 18:30, then a short night (~5 min).
const START_TIME = 9 * 60;
function timeRate() {
  const h = (G.time / 60) % 24;
  if (h >= 6 && h < 18.5) return 570 / 1800;   // 9:00 -> 18:30 takes 30 minutes
  return 690 / 300;                            // 18:30 -> 6:00 takes about 5 minutes
}
const G = {
  started: false, paused: true, time: START_TIME, clock: 0,
  money: saved.money ?? 250, done: new Set(saved.done || []),
  health: 100, heat: 0, veh: null, bustT: 0, lastHurt: -99, area: '', areaT: 0, saveT: 0, policeCD: 0, relocIdx: 0,
};
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.money, done: [...G.done] })); } catch (_) { /* storage blocked */ }
}

/* ------------------------------------------------------------------ helpers */
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const smooth = (a, b, x) => { const t = W.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const stars = () => (G.heat <= 0.001 ? 0 : Math.min(5, Math.ceil(G.heat - 0.001)));
const addHeat = (n) => { G.heat = Math.min(5, G.heat + n); };
const clampBounds = (p) => { p.x = W.clamp(p.x, W.BOUNDS.minX, W.BOUNDS.maxX); p.z = W.clamp(p.z, W.BOUNDS.minZ, W.BOUNDS.maxZ); };

/* ------------------------------------------------------------------ player */
const human = makeHuman(PLAYER_LOOK, { shadow: !isTouch, texSize: 512, kind: 'player' });
scene.add(human.root);
const player = {
  h: human, pos: human.root.position, vy: 0, vx: 0, vz: 0, heading: 0, onGround: true, phase: 0, knockT: 0,
  atkT: 0, atkDur: 1, atkKind: 'punch', side: 1, combo: 0, lastAtk: -9, blocking: false, flinchT: 0,
};

/* ------------------------------------------------------------------ vehicles */
const vehicles = [];
function spawnVehicle(type, x, z, heading, color) {
  const v = new Vehicle(type, color);
  v.pos.set(x, W.groundHeight(x, z), z);
  v.heading = heading; v.mesh.rotation.y = heading;
  v.mesh.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  scene.add(v.mesh); vehicles.push(v);
  return v;
}
function randomSegment(ref, minD, maxD) {
  for (let t = 0; t < 80; t++) {
    const [a, b] = W.randomEdge();
    if (b === undefined) continue;
    const s = W.laneSpot(a, b, 0.25 + Math.random() * 0.5);
    if (ref) { const d = Math.sqrt(dist2(s, ref)); if (d < minD || d > maxD) continue; }
    if (vehicles.some((v) => dist2(v.pos, s) < 64)) continue;
    return { from: a, to: b, ...s };
  }
  return null;
}
function spawnTraffic(ref, minD, maxD) {
  const s = randomSegment(ref, minD, maxD);
  if (!s) return null;
  const v = spawnVehicle(Math.random() < 0.28 ? 'auto' : 'car', s.x, s.z, s.heading);
  setRoute(v, s.from, s.to);
  return v;
}

const spawn = world.spots.spawn;
{
  const sp = spawn.park, fx = Math.sin(sp.heading), fz = Math.cos(sp.heading);
  player.pos.set(spawn.x - fx * 4, W.groundHeight(spawn.x, spawn.z), spawn.z - fz * 4);
  player.heading = spawn.heading;
  spawnVehicle('car', sp.x - fx * 5.5, sp.z - fz * 5.5, sp.heading, 0xff7b39);
  spawnVehicle('auto', sp.x - fx * 13, sp.z - fz * 13, sp.heading);
  spawnVehicle('bike', sp.x + fx * 1, sp.z + fz * 1, sp.heading, 0xe63946);
}
for (const p of world.parked) {
  const r = Math.random();
  spawnVehicle(r < 0.22 ? 'sport' : r < 0.45 ? 'bike' : 'car', p.x, p.z, p.heading);
}
for (const p of world.policeParked) spawnVehicle('police', p.x, p.z, p.heading);
const TRAFFIC = isTouch ? 18 : 28;
for (let k = 0; k < TRAFFIC; k++) spawnTraffic(k < TRAFFIC / 2 ? player.pos : null, 25, 220);

/* ------------------------------------------------------------------ pedestrians */
const peds = [];
for (let k = 0; k < (isTouch ? 16 : 30); k++) {
  const p = new Ped(scene);
  p.assign(world.pathNear(player.pos)); peds.push(p);
}

/* ------------------------------------------------------------------ pickups */
const coinGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20); coinGeo.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffc83d, metalness: 0.8, roughness: 0.25, emissive: 0x7a4b00, emissiveIntensity: 0.5 });
const heartGeo = new THREE.OctahedronGeometry(0.55);
const heartMat = new THREE.MeshStandardMaterial({ color: 0xff3b5c, emissive: 0xff1040, emissiveIntensity: 0.6 });
const pickups = [];
function addPickup(kind, s) {
  const m = new THREE.Mesh(kind === 'coin' ? coinGeo : heartGeo, kind === 'coin' ? coinMat : heartMat);
  m.position.set(s.x, 1.1, s.z); m.castShadow = true; scene.add(m);
  pickups.push({ kind, m, x: s.x, z: s.z, respawn: 0 });
}
world.coinSpots.forEach((s) => addPickup('coin', s));
world.heartSpots.forEach((s) => addPickup('heart', s));

/* ------------------------------------------------------------------ missions */
const api = {
  touch: isTouch, hud, audio, done: G.done, save, stars, world,
  playerPos: () => (G.veh ? G.veh.pos : player.pos),
  vehicle: () => G.veh,
  setHeat: (h) => { G.heat = Math.max(G.heat, h); },
  reward: (n) => { G.money += n; },
  spawnVehicle: (type, x, z, h) => spawnVehicle(type, x, z, h),
  spawnThugs(n, spot) {
    const list = [];
    for (let k = 0; k < n; k++) {
      const t = new Ped(scene, { thug: true });
      const a = (k / n) * Math.PI * 2;
      const p = { x: spot.x + Math.cos(a) * 5 + 2, z: spot.z + Math.sin(a) * 6 };
      W.resolveCircle(p, 0.4);
      t.placeAt(p.x, p.z, world.pathNear(spot, 120));
      t.state = 'angry'; t.angryT = 999;
      peds.push(t); list.push(t);
    }
    return list;
  },
  removePeds(list) {
    for (const t of list) { t.dispose(); const i = peds.indexOf(t); if (i >= 0) peds.splice(i, 1); }
  },
  spawnFleeCar(s, route) {
    const v = spawnVehicle('sport', s.x, s.z, s.heading, 0xf15bb5);
    setRoute(v, route[0], route[1]);
    v.flee = true; v.health = 70;
    return v;
  },
};
const missions = new Missions(scene, api);

/* ------------------------------------------------------------------ enter / exit */
function nearestVehicle() {
  let best = null, bd = Infinity;
  for (const v of vehicles) {
    const d = Math.sqrt(dist2(v.pos, player.pos)) - v.cfg.len / 2;
    if (d < 2 && d < bd) { bd = d; best = v; }
  }
  return best;
}
function enterVehicle(v) {
  if (v.health <= 0) { hud.toast('This vehicle is wrecked'); return; }
  if (v.ai) { v.ai = null; hud.toast('Vehicle hijacked!'); }
  if (v.police) { addHeat(1.5); v.mode = 'patrol'; v.setSiren(false); }
  v.driver = 'player'; G.veh = v;
  human.root.visible = v.type === 'bike';
  player.atkT = 0; player.blocking = false;
  if (v.type !== 'bike') hud.toast('♪ ' + audio.stationName(), 1.8);
}
function resetPose() {
  human.root.rotation.set(0, player.heading, 0);
  human.body.rotation.set(0, 0, 0); human.body.position.y = 0;
  human.seated = false;
  animateHuman(human, 0, 0);
}
// keep the rider on the bike (or hidden inside a car)
function syncRider() {
  const v = G.veh;
  if (!v) return;
  player.heading = v.heading;
  if (v.type !== 'bike') { player.pos.copy(v.pos); return; }
  const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
  player.pos.set(v.pos.x - fx * 0.62, v.pos.y + 0.02, v.pos.z - fz * 0.62);
  human.root.rotation.set(0, v.heading, v.mesh.rotation.z);
  if (!human.model) human.body.rotation.x = 0.22;
  seatedPose(human);
}
function throwOff(v, impact) {
  const vx = v.vel.x, vz = v.vel.z;
  exitVehicle();
  player.knockT = 1.6; player.vx = vx * 0.6; player.vz = vz * 0.6; player.vy = 5;
  hud.toast('Thrown off the bike!');
  hurt(impact * 1.2);
}
function exitVehicle() {
  const v = G.veh;
  if (!v) return;
  v.driver = null; G.veh = null;
  const off = v.cfg.wid / 2 + 0.8;
  const p = { x: v.pos.x + Math.cos(v.heading) * off, z: v.pos.z - Math.sin(v.heading) * off };
  W.resolveCircle(p, 0.4); clampBounds(p);
  player.pos.set(p.x, W.groundHeight(p.x, p.z), p.z);
  player.heading = v.heading; player.vy = 0;
  human.root.visible = true;
  resetPose();
}

/* ------------------------------------------------------------------ damage, busted, knocked out */
function hurt(n) {
  if (G.health <= 0) return;
  G.health -= n; G.lastHurt = G.clock;
  cam.shake = Math.min(0.6, cam.shake + n * 0.02);
  audio.hurt();
  const f = document.getElementById('dmg');
  f.classList.remove('hit'); void f.offsetWidth; f.classList.add('hit');
  if (G.health <= 0) respawnAt(world.spots.hospital, 'KNOCKED OUT', 'Hospital bill: ₹100', '#ff4d6d', 100, 'You were knocked out');
}
function respawnAt(spot, title, sub, color, fine, why) {
  missions.fail(why);
  if (G.veh) exitVehicle();
  G.money = Math.max(0, G.money - fine);
  G.heat = 0; G.bustT = 0; G.health = 100;
  player.knockT = 0;
  player.pos.set(spot.x, W.SIDEWALK, spot.z);
  player.heading = spot.face; cam.yaw = spot.face;
  resetPose();
  for (const p of peds) if (p.state === 'angry' && !p.thug) p.goHome();
  audio.fail();
  hud.big(title, sub, color);
  const f = document.getElementById('fade');
  f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 450);
  save();
}

/* ------------------------------------------------------------------ on foot */
function updateOnFoot(dt) {
  const h = player.h;
  if (player.knockT > 0) {
    player.knockT -= dt;
    player.pos.x += player.vx * dt; player.pos.z += player.vz * dt;
    player.vx *= Math.max(0, 1 - 4 * dt); player.vz *= Math.max(0, 1 - 4 * dt);
    player.vy -= 24 * dt; player.pos.y += player.vy * dt;
    const gh = W.groundHeight(player.pos.x, player.pos.z);
    if (player.pos.y < gh) { player.pos.y = gh; player.vy = 0; }
    W.resolveCircle(player.pos, 0.4); clampBounds(player.pos);
    h.body.rotation.x += (-Math.PI / 2 - h.body.rotation.x) * Math.min(1, dt * 10);
    h.body.position.y = 0.15;
    animateHuman(h, 0, 0);
    if (player.knockT <= 0) { h.body.rotation.x = 0; h.body.position.y = 0; }
    return;
  }
  const mv = input.move();
  const yaw = cam.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw);
  let dx = fx * mv.y - Math.cos(yaw) * mv.x, dz = fz * mv.y + Math.sin(yaw) * mv.x;
  const len = Math.hypot(dx, dz);
  player.blocking = input.has('KeyC', 'Mouse2') && player.atkT <= 0;
  const sprint = input.has('ShiftLeft', 'ShiftRight') && !player.blocking;
  const speed = player.blocking ? 1.8 : player.atkT > 0 ? 1.2 : sprint ? 7.8 : 4.2;
  let moving = 0;
  if (len > 0.08) {
    dx /= len; dz /= len;
    const amt = Math.min(1, len);
    player.pos.x += dx * speed * amt * dt; player.pos.z += dz * speed * amt * dt;
    player.heading = lerpAngle(player.heading, Math.atan2(dx, dz), Math.min(1, dt * 12));
    moving = amt;
  }
  if (input.hit('Space') && player.onGround) { player.vy = 7.5; player.onGround = false; }
  player.vy -= 24 * dt; player.pos.y += player.vy * dt;
  const gh = W.groundHeight(player.pos.x, player.pos.z);
  if (player.pos.y <= gh) { player.pos.y = gh; player.vy = 0; player.onGround = true; }
  W.resolveCircle(player.pos, 0.4); clampBounds(player.pos);

  if (player.atkT > 0) player.atkT -= dt;
  if (input.hit('KeyE', 'Mouse0') && !missions.tryStart()) attack('punch');
  else if (input.hit('KeyQ')) attack('kick');
  human.gait = sprint ? 1 : moving > 0.6 ? 0.5 : 0;
  if (moving) player.phase += dt * (sprint ? 15 : moving > 0.6 ? 11.5 : 7);
  const prog = player.atkT > 0 ? 1 - player.atkT / player.atkDur : 0;
  animateHuman(h, player.phase, player.onGround ? moving : 0.3,
    player.atkKind === 'punch' ? prog : 0, player.side, player.atkKind === 'kick' ? prog : 0, player.blocking);
  h.root.rotation.y = player.heading;
}

/* ------------------------------------------------------------------ fist fights */
function attack(kind) {
  if (player.atkT > 0 || player.blocking || !player.onGround) return;
  const kick = kind === 'kick';
  // turn toward the closest person in reach
  let tgt = null, td = 2.8;
  for (const p of peds) {
    if (p.down) continue;
    const d = Math.sqrt(dist2(p.pos, player.pos));
    if (d < td) { td = d; tgt = p; }
  }
  if (tgt) player.heading = Math.atan2(tgt.pos.x - player.pos.x, tgt.pos.z - player.pos.z);
  if (!kick) player.combo = G.clock - player.lastAtk < 0.75 ? player.combo + 1 : 0;
  player.lastAtk = G.clock;
  const strong = kick || player.combo % 3 === 2;
  player.atkKind = kind; player.atkT = player.atkDur = kick ? 0.45 : strong ? 0.38 : 0.28;
  player.side = -player.side;
  const dmg = kick ? 45 : strong ? 40 : 22, power = kick ? 7 : strong ? 6 : 2.5, range = kick ? 2.0 : 1.7;
  const hx = Math.sin(player.heading), hz = Math.cos(player.heading);
  let landed = false;
  for (const p of peds) {
    if (p.down) continue;
    const ex = p.pos.x - player.pos.x, ez = p.pos.z - player.pos.z, d = Math.hypot(ex, ez);
    if (d > range || (ex * hx + ez * hz) / (d || 1) < 0.35) continue;
    const r = p.hit(dmg, hx, hz, power, player.pos.x, player.pos.z);
    if (!r) continue;
    landed = true;
    if (!p.thug) addHeat(r === 'ko' ? 0.5 : 0.1);
    if (r === 'ko') hud.toast(p.thug ? 'Thug down!' : 'Knockout!', 1.2);
  }
  if (landed) {
    audio.punch(strong);
    cam.shake = Math.max(cam.shake, strong ? 0.25 : 0.12);
    for (const p of peds) if (p.state === 'walk' && !p.tough && dist2(p.pos, player.pos) < 14 * 14) p.panic(player.pos.x, player.pos.z);
  } else audio.whoosh();
}
function hurtPlayer(dmg, ped) {
  if (G.veh || player.knockT > 0) return;
  const hx = Math.sin(player.heading), hz = Math.cos(player.heading);
  const ex = ped.pos.x - player.pos.x, ez = ped.pos.z - player.pos.z, d = Math.hypot(ex, ez) || 1;
  const blocked = player.blocking && (ex * hx + ez * hz) / d > 0.2;
  if (blocked) { audio.punch(false); hurt(dmg * 0.2); return; }
  audio.punch(true);
  player.pos.x -= (ex / d) * 0.3; player.pos.z -= (ez / d) * 0.3;
  player.atkT = 0;
  hurt(dmg);
}

function playerVsVehicles() {
  if (G.veh) return;
  for (const v of vehicles) {
    const dx = player.pos.x - v.pos.x, dz = player.pos.z - v.pos.z;
    if (dx * dx + dz * dz > 16) continue;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    const lf = dx * fx + dz * fz, ll = dx * fz - dz * fx;
    const hl = v.cfg.len / 2 + 0.35, hw = v.cfg.wid / 2 + 0.35;
    if (Math.abs(lf) >= hl || Math.abs(ll) >= hw) continue;
    const sp = Math.hypot(v.vel.x, v.vel.z);
    if (sp > 5 && player.knockT <= 0) {
      player.knockT = 1.4;
      player.vx = v.vel.x * 0.8; player.vz = v.vel.z * 0.8; player.vy = 4 + sp * 0.15;
      hurt(sp * 1.8);
    }
    const pf = hl - Math.abs(lf), pl = hw - Math.abs(ll);
    if (pf < pl) { const s = Math.sign(lf) || 1; player.pos.x += fx * pf * s; player.pos.z += fz * pf * s; }
    else { const s = Math.sign(ll) || 1; player.pos.x += fz * pl * s; player.pos.z -= fx * pl * s; }
  }
}

/* ------------------------------------------------------------------ vehicles update */
const IDLE = { throttle: 0, steer: 0, handbrake: false };
function updateVehicles(dt) {
  const ctx = { target: api.playerPos(), vehicles, foot: G.veh ? null : player.pos };
  for (const v of vehicles) {
    let ctl = IDLE;
    if (v === G.veh) {
      const mv = input.move(false);
      ctl = { throttle: mv.y, steer: -mv.x, handbrake: input.has('Space') };
    } else if (v.ai) ctl = aiControl(v, dt, ctx);
    const impact = v.update(dt, ctl);
    if (v === G.veh) {
      G.throttle = ctl.throttle;
      if (impact > 4) { audio.crash(impact); cam.shake = Math.max(cam.shake, Math.min(0.5, impact * 0.03)); }
      if (v.type === 'bike' && impact > 10) throwOff(v, impact);
      else if (impact > 8) hurt(impact * 0.4);
    }
    if (v.police) v.setSiren(v.mode === 'chase');
  }
  // vehicle vs vehicle
  for (let a = 0; a < vehicles.length; a++) {
    const A = vehicles[a];
    for (let b = a + 1; b < vehicles.length; b++) {
      const B = vehicles[b];
      const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, rr = A.radius + B.radius, d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, push = (rr - d) / 2;
      A.pos.x -= nx * push; A.pos.z -= nz * push; B.pos.x += nx * push; B.pos.z += nz * push;
      const rel = (A.vel.x - B.vel.x) * nx + (A.vel.z - B.vel.z) * nz;
      if (rel > 0) {
        const j = rel * 0.9;
        A.vel.x -= nx * j; A.vel.z -= nz * j; B.vel.x += nx * j; B.vel.z += nz * j;
        A.syncSpeed(); B.syncSpeed();
        if (rel > 5) { A.damage(rel * 1.4); B.damage(rel * 1.4); }
        const mine = A === G.veh ? A : B === G.veh ? B : null;
        if (mine) {
          const other = mine === A ? B : A;
          if (rel > 3 && other.police) addHeat(0.5);
          if (rel > 4) audio.crash(rel);
          if (mine.type === 'bike' && rel > 7) throwOff(mine, rel);
        }
      }
    }
  }
  // keep traffic around the player: recycle one far-away car per frame
  if (vehicles.length) {
    G.relocIdx = (G.relocIdx + 1) % vehicles.length;
    const v = vehicles[G.relocIdx], ref = ctx.target;
    if (v.ai && v !== G.veh && !v.flee && !(v.police && v.mode === 'chase') && dist2(v.pos, ref) > 230 * 230) {
      const s = randomSegment(ref, 110, 200);
      if (s) {
        v.pos.set(s.x, 0, s.z); v.heading = s.heading; v.speed = 0; v.vel.x = v.vel.z = 0;
        v.repair(); setRoute(v, s.from, s.to);
      }
    }
  }
}

/* ------------------------------------------------------------------ pedestrians update */
const pedCtx = { player: player.pos, onFoot: true, hurtPlayer };
function updatePeds(dt) {
  const ref = api.playerPos();
  pedCtx.onFoot = !G.veh && G.started;
  for (const p of peds) {
    if (!p.thug && (Math.abs(p.cx - ref.x) > W.CELL * 3.2 || Math.abs(p.cz - ref.z) > W.CELL * 3.2)) {
      p.assign(world.pathNear(ref));
    }
    p.update(dt, pedCtx);
  }
  for (const v of vehicles) {
    const sp = Math.hypot(v.vel.x, v.vel.z);
    if (sp < 4) continue;
    const fx = Math.sin(v.heading), fz = Math.cos(v.heading);
    for (const p of peds) {
      if (p.down) continue;
      const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
      if (dx * dx + dz * dz > 12) continue;
      const lf = dx * fx + dz * fz, ll = dx * fz - dz * fx;
      if (Math.abs(lf) < v.cfg.len / 2 + 0.3 && Math.abs(ll) < v.cfg.wid / 2 + 0.3) {
        if (p.knock(v.vel.x * 0.9, v.vel.z * 0.9) && v === G.veh) addHeat(0.6);
      }
    }
  }
}

/* ------------------------------------------------------------------ police */
function updatePolice(dt) {
  const s = stars(), ref = api.playerPos();
  let chasers = 0, seen = false, near = false, total = 0;
  for (const v of vehicles) {
    if (!v.police) continue;
    total++;
    if (v === G.veh) continue;
    if (v.mode === 'chase') {
      if (s === 0) {
        v.mode = 'patrol';
        const n = W.nearestNode(v.pos.x, v.pos.z);
        setRoute(v, n, W.neighbors(n)[0] ?? n);
        continue;
      }
      chasers++;
      const d = Math.sqrt(dist2(v.pos, ref));
      if (d < 50) seen = true;
      if (d < 7 && Math.abs(v.speed) < 9) near = true;
    }
  }
  if (s === 0) { G.bustT = 0; return; }
  G.policeCD -= dt;
  if (chasers < Math.min(4, s) && G.policeCD <= 0) {
    G.policeCD = 2;
    let rec = null;
    for (const v of vehicles) if (v.police && v !== G.veh && v.mode !== 'chase' && v.health > 0 && dist2(v.pos, ref) < 200 * 200) { rec = v; break; }
    if (!rec && total < 7) {
      for (let t = 0; t < 30 && !rec; t++) {
        const np = W.nodePos(W.randomNode());
        const d = Math.sqrt(dist2(np, ref));
        if (d > 70 && d < 140) rec = spawnVehicle('police', np.x, np.z, Math.random() * Math.PI * 2);
      }
    }
    if (rec) {
      rec.mode = 'chase';
      const n = W.nearestNode(rec.pos.x, rec.pos.z);
      setRoute(rec, n, n);
    }
  }
  if (!seen) G.heat = Math.max(0, G.heat - dt / 9);
  const slow = G.veh ? Math.abs(G.veh.speed) < 2.5 : true;
  if (near && slow) G.bustT += dt; else G.bustT = Math.max(0, G.bustT - dt * 0.5);
  if (G.bustT > 2.5) respawnAt(world.spots.police, 'CAUGHT!', 'Fine paid: ₹200', '#4da3ff', 200, 'You got caught');
}

/* ------------------------------------------------------------------ pickups */
function updatePickups(dt) {
  const ref = api.playerPos();
  for (const pk of pickups) {
    if (pk.respawn > 0) { if ((pk.respawn -= dt) <= 0) pk.m.visible = true; continue; }
    pk.m.rotation.y += dt * 2.5;
    pk.m.position.y = 1.1 + Math.sin(G.clock * 3 + pk.x) * 0.15;
    if (dist2(ref, pk) > (G.veh ? 2.8 : 1.4) ** 2) continue;
    if (pk.kind === 'coin') { G.money += 50; hud.toast('+₹50'); audio.coin(); }
    else { if (G.health >= 100) continue; G.health = Math.min(100, G.health + 50); hud.toast('+50 health'); audio.heal(); }
    pk.m.visible = false; pk.respawn = 60;
  }
}

/* ------------------------------------------------------------------ camera */
const cam = { yaw: player.heading, pitch: 0.3, dist: 5.2, lastLook: -10, shake: 0, tgt: new THREE.Vector3() };
function updateCamera(dt) {
  const look = input.consumeLook();
  const sens = isTouch ? 0.005 : 0.0025;
  if (look.x || look.y) {
    cam.yaw -= look.x * sens;
    cam.pitch = W.clamp(cam.pitch + look.y * sens, -0.15, 1.2);
    cam.lastLook = G.clock;
  }
  const v = G.veh;
  const base = v ? v.pos : player.pos;
  if (v && G.clock - cam.lastLook > 1.3 && Math.abs(v.speed) > 1.5) {
    cam.yaw = lerpAngle(cam.yaw, v.heading, Math.min(1, dt * 2.5));
    cam.pitch += (0.22 - cam.pitch) * Math.min(1, dt * 1.5);
  }
  const want = v ? ({ auto: 7, bike: 6 }[v.type] || 8.5) + Math.abs(v.speed) * 0.05 : 5.2;
  cam.dist += (want - cam.dist) * Math.min(1, dt * 3);
  cam.tgt.set(base.x, base.y + (v ? 1.7 : 1.55), base.z);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const ox = -Math.sin(cam.yaw) * cam.dist * cp, oy = sp * cam.dist + 0.4, oz = -Math.cos(cam.yaw) * cam.dist * cp;
  let t = 1;
  for (let s = 1; s <= 16; s++) {
    const f = s / 16;
    if (W.pointBlocked(cam.tgt.x + ox * f, cam.tgt.z + oz * f, cam.tgt.y + oy * f)) { t = Math.max(0.12, (s - 1) / 16); break; }
  }
  camera.position.set(cam.tgt.x + ox * t, Math.max(0.5, cam.tgt.y + oy * t), cam.tgt.z + oz * t);
  camera.lookAt(cam.tgt);
  if (cam.shake > 0.001) {
    const s = cam.shake * 0.15;
    camera.position.x += (Math.random() - 0.5) * s; camera.position.y += (Math.random() - 0.5) * s;
    camera.rotation.z += (Math.random() - 0.5) * s * 0.3;
    cam.shake = Math.max(0, cam.shake - dt * 1.8);
  }
}

/* ------------------------------------------------------------------ sky & light */
const C = {
  dayTop: new THREE.Color(0x2f7fd6), dayHor: new THREE.Color(0xa9d8f5),
  setTop: new THREE.Color(0x3a3f8f), setHor: new THREE.Color(0xff8c5a),
  nightTop: new THREE.Color(0x050816), nightHor: new THREE.Color(0x151a3c),
  sunDay: new THREE.Color(0xfff1d6), sunSet: new THREE.Color(0xffa060), moon: new THREE.Color(0x8fa8ff),
};
const tmpDir = new THREE.Vector3();
function updateSky(dt, focus) {
  const hour = (G.time / 60) % 24;
  const ang = ((hour - 6) / 24) * Math.PI * 2;
  const elev = Math.sin(ang);
  const dayF = smooth(-0.12, 0.22, elev), night = 1 - dayF;
  const setF = Math.max(0, 1 - Math.abs(elev) / 0.32);
  skyU.top.value.copy(C.nightTop).lerp(C.dayTop, dayF).lerp(C.setTop, setF * 0.6);
  skyU.horizon.value.copy(C.nightHor).lerp(C.dayHor, dayF).lerp(C.setHor, setF * 0.8);
  scene.fog.color.copy(skyU.horizon.value);
  const up = elev > 0;
  tmpDir.set(Math.cos(ang) * (up ? 1 : -1), Math.max(0.18, Math.abs(elev)), 0.35).normalize();
  skyU.sunDir.value.set(Math.cos(ang), elev, 0.35).normalize();
  skyU.sunVis.value = smooth(-0.08, 0.05, elev);
  skyU.sunCol.value.copy(C.sunDay).lerp(C.sunSet, setF);
  sun.position.set(focus.x + tmpDir.x * 160, tmpDir.y * 160, focus.z + tmpDir.z * 160);
  sun.target.position.set(focus.x, 0, focus.z);
  sun.intensity = up ? 0.2 + dayF * 2.3 : 0.7;
  sun.color.copy(up ? C.sunDay : C.moon);
  if (up) sun.color.lerp(C.sunSet, setF);
  hemi.intensity = 0.3 + dayF * 0.15;
  if ((envTimer -= dt) <= 0) { envTimer = 2.5; updateEnv(night); }
  if (bloom) { bloom.threshold = 0.75 + dayF * 1.1; bloom.strength = 0.35 + night * 0.45; }
  hemi.color.copy(C.moon).lerp(C.dayHor, dayF);
  starMat.opacity = night * 0.9;
  sky.position.copy(camera.position); starPts.position.copy(camera.position);
  world.update(dt, night, G.clock);
  setVehicleNight(night, G.clock);
  nightLevel = night;
}

/* ------------------------------------------------------------------ main update */
function update(dt) {
  G.clock += dt;
  G.time += dt * timeRate(); // long days, short nights
  if (input.hit('KeyF', 'Enter')) {
    if (G.veh) { if (Math.abs(G.veh.speed) < 7) exitVehicle(); }
    else if (player.knockT <= 0) { const v = nearestVehicle(); if (v) enterVehicle(v); }
  }
  if (input.hit('KeyM')) hud.toast(audio.toggleMute() ? 'Sound off' : 'Sound on', 1.5);
  if (G.veh && input.hit('KeyR')) { const n = audio.nextStation(); if (n) hud.toast('♪ ' + n, 2); }
  const horn = !!G.veh && input.has('KeyH');
  if (horn && input.hit('KeyH')) {
    for (const p of peds) if (p.state === 'walk' && dist2(p.pos, G.veh.pos) < 15 * 15) p.panic(G.veh.pos.x, G.veh.pos.z);
  }
  if (!G.veh) updateOnFoot(dt);
  updateVehicles(dt);
  syncRider();
  updateHeadlight();
  playerVsVehicles();
  updatePeds(dt);
  updatePolice(dt);
  updatePickups(dt);
  missions.update(dt);
  if (G.clock - G.lastHurt > 8 && G.health < 100) G.health = Math.min(100, G.health + 2 * dt);

  updateCamera(dt);
  const ref = api.playerPos();
  updateSky(dt, ref);

  if ((G.areaT -= dt) <= 0) {
    G.areaT = 0.5;
    const a = W.districtAt(ref.x, ref.z);
    if (a !== G.area) { G.area = a; hud.area(a); }
  }
  if ((G.saveT += dt) > 15) { G.saveT = 0; save(); }

  let hint = missions.hintText();
  if (!hint && !G.veh && player.knockT <= 0) {
    const nv = nearestVehicle();
    if (nv) hint = `${isTouch ? 'Tap CAR' : 'Press F'} to ${nv.type === 'bike' ? 'ride the bike' : 'get in'}`;
  }
  hud.hint(hint);

  let sirenDist = Infinity;
  for (const v of vehicles) if (v.siren) sirenDist = Math.min(sirenDist, Math.sqrt(dist2(v.pos, ref)));
  audio.update({ veh: G.veh, throttle: G.veh ? G.throttle || 0 : 0, horn, sirenDist, t: G.clock });
  hud.radio(G.veh ? audio.stationName() : null);

  const blips = missions.blips();
  if (world.spots.police) blips.push({ x: world.spots.police.x, z: world.spots.police.z, color: '#4a78c8', r: 6, label: 'P' });
  if (world.spots.hospital) blips.push({ x: world.spots.hospital.x, z: world.spots.hospital.z, color: '#ffffff', r: 6, label: 'H' });
  const flash = Math.floor(G.clock * 4) % 2 === 0;
  for (const v of vehicles) if (v.police && v.mode === 'chase') blips.push({ x: v.pos.x, z: v.pos.z, color: flash ? '#ff3040' : '#3060ff', r: 4, edge: true });
  hud.update(dt, {
    time: G.time, money: G.money, stars: stars(), chased: G.heat > 0, health: G.health,
    veh: G.veh ? { hp: G.veh.health, kmh: Math.abs(G.veh.speed) * 3.6 } : null,
    px: ref.x, pz: ref.z, yaw: cam.yaw, heading: G.veh ? G.veh.heading : player.heading, blips,
  });
}

// menu background: slow orbit over the city while traffic drives around
let orbit = 0;
const focus0 = new THREE.Vector3(40, 0, 0);
function idle(dt) {
  G.clock += dt; G.time += dt * timeRate() * 4; orbit += dt * 0.05;
  camera.position.set(Math.cos(orbit) * 240 + 40, 115, Math.sin(orbit) * 240);
  camera.lookAt(focus0);
  updateVehicles(dt);
  updatePeds(dt);
  updateSky(dt, focus0);
}

/* ------------------------------------------------------------------ menu / pause */
const menu = document.getElementById('menu');
const playBtn = document.getElementById('play');
function resume() {
  if (!G.started) { G.started = true; G.time = START_TIME; cam.yaw = player.heading; hud.area(W.districtAt(player.pos.x, player.pos.z)); }
  G.paused = false;
  menu.classList.add('hidden');
  hud.show(true);
  audio.init();
  if (!isTouch) input.lock();
}
function pause() {
  if (!G.started || G.paused) return;
  G.paused = true;
  playBtn.textContent = 'RESUME';
  document.getElementById('menu-state').textContent = 'Paused';
  menu.classList.remove('hidden');
  audio.suspend();
  save();
}
playBtn.addEventListener('click', resume);
document.getElementById('pauseBtn').addEventListener('click', pause);
document.getElementById('pauseBtn').addEventListener('touchstart', (e) => { e.preventDefault(); pause(); }, { passive: false });
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Reset money and mission progress?')) return;
  try { localStorage.removeItem(SAVE_KEY); } catch (_) { /* ignore */ }
  location.reload();
});
input.onLockChange = (locked) => { if (!locked) pause(); };
canvas.addEventListener('click', () => { if (G.started && !G.paused && !isTouch && !input.locked) input.lock(); });
addEventListener('keydown', (e) => { if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.code === 'KeyP') { if (G.paused) resume(); else pause(); } });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

/* ------------------------------------------------------------------ loop */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!G.started) idle(dt);
  else if (!G.paused) update(dt);
  if (composer) composer.render(); else renderer.render(scene, camera);
  input.endFrame();
}
document.body.classList.add('ready');
document.getElementById('menu-state').textContent = G.done.size ? `Missions done: ${G.done.size}/${missions.count} ·₹${G.money.toLocaleString('en-IN')}` : '';
requestAnimationFrame(frame);
if (new URLSearchParams(location.search).has('autoplay')) resume();

// handy for debugging from the console
window.__game = { G, player, vehicles, peds, missions, camera, input, enterVehicle, nearestVehicle };
