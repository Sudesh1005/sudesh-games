// Kaathu Cricket: realistic character models, adapted from Kadal Nagaram (GTA-Game/js/models.js).
// Loads the same MakeHuman/Mixamo characters the city game uses and drives their skeletons with
// the same procedural poses as the built-in people, so cricket poses work on both.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const ONCE = new Set(['punch', 'kick', 'fall']);
let lib = null;
export const modelLib = () => lib;

async function loadAny(url) {
  if (/\.fbx$/i.test(url)) {
    const o = await new FBXLoader().loadAsync(url);
    return { scene: o, animations: o.animations || [] };
  }
  const g = await new GLTFLoader().loadAsync(url);
  return { scene: g.scene, animations: g.animations || [] };
}

// Mixamo clips: keep animations "in place" (no drifting) by zeroing the hips' horizontal movement.
function cleanClip(clip, name) {
  const c = clip.clone();
  c.name = name;
  c.tracks = c.tracks.filter((t) => !/\.(scale)$/.test(t.name) || !/Hips/i.test(t.name));
  for (const t of c.tracks) {
    if (/Hips.*\.position$/i.test(t.name) || /^[^.]*Hips\.position$/i.test(t.name)) {
      const v = t.values;
      if (name === 'fall') continue;
      const x0 = v[0], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
    }
  }
  return c;
}

// MakeHuman/MPFB exports every material as alpha-blended. Make skin, clothes and eyes opaque and
// hair / eyebrows / eyelashes alpha-cutout, otherwise transparency sorting breaks the faces.
const CUTOUT = /eyebrow|eyelash|hair|^(afro|bob|braid|long|ponytail|short)\d/i;
function fixMaterial(mesh, m, tint) {
  if (!m) return;
  const name = (m.name || '') + ' ' + (mesh.name || '');
  if (CUTOUT.test(m.name.replace(/^Human\./, '')) || CUTOUT.test(mesh.name || '')) {
    m.transparent = false; m.alphaTest = 0.45; m.depthWrite = true; m.side = THREE.DoubleSide;
  } else if (m.transparent) {
    m.transparent = false; m.alphaTest = 0; m.depthWrite = true; m.opacity = 1;
  }
  if (tint && /body|skin/i.test(name)) m.color.set(tint);
  if ('roughness' in m) m.roughness = Math.max(m.roughness, 0.55);
  m.needsUpdate = true;
}

// Scale to ~1.8 m, feet on the ground, shadows on.
function prepare(scene, height = 1.8, tint = null) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  const h = box.max.y - box.min.y || 1;
  const k = height / h;
  scene.scale.multiplyScalar(k);
  scene.position.y -= box.min.y * k;
  scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if ('shininess' in m) m.shininess = Math.min(m.shininess || 10, 12);
        fixMaterial(o, m, tint);
      }
    }
  });
  const wrap = new THREE.Group(); wrap.add(scene);
  return wrap;
}

const ALIASES = {
  idle: /idle|breath/i, walk: /walk/i, run: /run|jog/i, sprint: /sprint|fast run/i, punch: /punch|jab|hook/i,
  kick: /kick/i, block: /block|guard/i, sit: /sit|driv/i, fall: /fall|death|knock/i,
};

export async function loadCricketers(base, files, heights, status = () => {}) {
  const out = { player: null, peds: [], thug: null, clips: {} };
  let n = 0;
  for (const f of files) {
    try {
      status(++n, files.length);
      const m = await loadAny(base + f);
      out.peds.push(prepare(m.scene, heights[f] || 1.76, null));
    } catch (e) { console.warn('character failed', f, e); }
  }
  if (!out.peds.length) return null;
  out.player = out.peds[0];
  lib = out;
  return out;
}

export async function loadModels(status = () => {}, base = 'models/') {
  let man;
  try {
    const r = await fetch(base + 'manifest.json', { cache: 'no-cache' });
    if (!r.ok) return null;
    man = await r.json();
  } catch (_) { return null; }
  const out = { player: null, peds: [], thug: null, clips: {} };
  const embedded = [];
  const loadChar = async (file) => {
    status(`Loading character ${file}…`);
    const m = await loadAny(base + file);
    embedded.push(...m.animations);
    return prepare(m.scene, (man.heights && man.heights[file]) || man.height || 1.8, (man.tint && man.tint[file]) || null);
  };
  try {
    if (man.player) out.player = await loadChar(man.player);
    for (const f of man.peds || []) { try { out.peds.push(await loadChar(f)); } catch (e) { console.warn('ped model failed', f, e); } }
    if (man.thug) { try { out.thug = await loadChar(man.thug); } catch (e) { console.warn('thug model failed', e); } }
  } catch (e) { console.warn('player model failed', e); }
  for (const [name, file] of Object.entries(man.animations || {})) {
    try {
      status(`Loading animation ${name}…`);
      const a = await loadAny(base + file);
      if (a.animations[0]) out.clips[name] = cleanClip(a.animations[0], name);
    } catch (e) { console.warn('animation failed', name, e); }
  }
  // clips that came inside the character files (e.g. a .glb with idle/walk/run)
  for (const [name, re] of Object.entries(ALIASES)) {
    if (out.clips[name]) continue;
    const c = embedded.find((a) => re.test(a.name));
    if (c) out.clips[name] = cleanClip(c, name);
  }
  if (!out.player && !out.peds.length) return null;
  if (!out.player) out.player = out.peds[0];
  if (!out.peds.length) out.peds.push(out.player);
  lib = out;
  return out;
}

/* ---------- procedural retargeting: drive a Mixamo-style skeleton with the game's own gait ----------
   The gait code writes rotations (in character space: +x right of screen, +y up, +z forward) into
   proxy joints; applyProc converts them into each real bone's local frame:
   local = Pw⁻¹ · R · Pw · q0, where Pw is the parent's rest orientation in character space. */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function setupProc(h, model, body) {
  body.updateMatrixWorld(true);
  const charInv = new THREE.Quaternion(); body.getWorldQuaternion(charInv).invert();
  const charPos = new THREE.Vector3(); body.getWorldPosition(charPos);
  const bones = {};
  model.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig[:_]?/i, '')] = o; });
  const restWorldQ = (o) => { const q = new THREE.Quaternion(); o.getWorldQuaternion(q); return charInv.clone().multiply(q); };
  const posChar = (o) => o.getWorldPosition(new THREE.Vector3()).sub(charPos);
  const joint = (b) => {
    if (!b) return null;
    const pw = b.parent ? restWorldQ(b.parent) : new THREE.Quaternion();
    return { b, q0: b.quaternion.clone(), pw, pwi: pw.clone().invert(), corr: null, corrParent: null };
  };
  // which Mixamo side is our "l" (the leg at negative x)?
  const leftX = bones.LeftUpLeg ? posChar(bones.LeftUpLeg).x : 1;
  const L = leftX < 0 ? 'Left' : 'Right', Rt = leftX < 0 ? 'Right' : 'Left';
  const J = {
    hips: joint(bones.Hips), spine: joint(bones.Spine1 || bones.Spine), head: joint(bones.Head),
    lLeg: joint(bones[L + 'UpLeg']), lKnee: joint(bones[L + 'Leg']), lFoot: joint(bones[L + 'Foot']),
    rLeg: joint(bones[Rt + 'UpLeg']), rKnee: joint(bones[Rt + 'Leg']), rFoot: joint(bones[Rt + 'Foot']),
    lArm: joint(bones[L + 'Arm']), lElbow: joint(bones[L + 'ForeArm']),
    rArm: joint(bones[Rt + 'Arm']), rElbow: joint(bones[Rt + 'ForeArm']),
  };
  // rest pose may be a T/A pose: rotate upper arms so they hang down (slightly out)
  for (const [a, e, s] of [['lArm', 'lElbow', -1], ['rArm', 'rElbow', 1]]) {
    const A = J[a], E = J[e];
    if (!A || !E) continue;
    const d = posChar(E.b).sub(posChar(A.b)).normalize();
    const target = new THREE.Vector3(s * 0.12, -1, 0.02).normalize();
    A.corr = new THREE.Quaternion().setFromUnitVectors(d, target);
    E.corrParent = A.corr;
    // the rest pose may also have bent elbows: straighten the forearm along the hanging arm
    const hand = bones[(A === J.lArm ? L : Rt) + 'Hand'];
    if (hand) {
      const dF = posChar(hand).sub(posChar(E.b)).normalize().applyQuaternion(A.corr);
      E.corr = new THREE.Quaternion().setFromUnitVectors(dF, target);
    }
  }
  const hipsRest = J.hips ? J.hips.b.position.clone() : null;
  let hipsScale = 1;
  if (J.hips && J.hips.b.parent) {
    const ps = J.hips.b.parent.getWorldScale(new THREE.Vector3()), cs = body.getWorldScale(new THREE.Vector3());
    hipsScale = ps.x / cs.x || 1;
  }
  const proxy = () => ({ rotation: new THREE.Euler(), position: new THREE.Vector3() });
  for (const k of ['hips', 'spine', 'head', 'lLeg', 'rLeg', 'lKnee', 'rKnee', 'lFoot', 'rFoot', 'lArm', 'rArm', 'lElbow', 'rElbow']) h[k] = proxy();
  h.hips.position.set(0, 0.95, 0);
  h.spine.position.set(0, 0.17, 0);
  h.applyProc = () => {
    for (const [k, j] of Object.entries(J)) {
      if (!j) continue;
      _e.copy(h[k].rotation);
      _q.setFromEuler(_e);                                           // R in character space
      if (j.corr) _q.multiply(j.corr);                               // arm: hang down first, then animate
      if (j.corrParent) _q.premultiply(_q2.copy(j.corrParent).invert()).multiply(j.corrParent);
      j.b.quaternion.copy(j.pwi).multiply(_q).multiply(j.pw).multiply(j.q0);
    }
    if (J.hips && hipsRest) {
      _v.set(h.hips.position.x, h.hips.position.y - 0.95, h.hips.position.z).applyQuaternion(J.hips.pwi).divideScalar(hipsScale);
      J.hips.b.position.copy(hipsRest).add(_v);
    }
  };
  void _v2;
}

export function makeModelHuman(kind, index = -1) {
  const src = index >= 0 ? lib.peds[index % lib.peds.length] : kind === 'player' ? lib.player : kind === 'thug' && lib.thug ? lib.thug : lib.peds[(Math.random() * lib.peds.length) | 0];
  const model = SkeletonUtils.clone(src);
  // give every person their own materials so kits can be recoloured
  model.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); });
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body); body.add(model);
  if (!Object.keys(lib.clips).length) {
    const h = { model: true, proc: true, root, body, gait: 0, seated: false, skirt: false, mesh: model };
    setupProc(h, model, body);
    return h;
  }
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [name, clip] of Object.entries(lib.clips)) {
    const a = mixer.clipAction(clip);
    if (ONCE.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    actions[name] = a;
  }
  return { model: true, root, body, mixer, actions, cur: null, last: 0, gait: 0, seated: false, skirt: false };
}

function pickClip(h, want) {
  const a = h.actions;
  if (a[want]) return want;
  const fb = { sprint: ['run', 'walk'], run: ['walk'], block: ['idle'], sit: ['idle'], fall: ['idle'], punch: ['idle'], kick: ['idle'] }[want] || [];
  for (const f of fb) if (a[f]) return f;
  return a.idle ? 'idle' : Object.keys(a)[0] || null;
}

export function animateModel(h, amt, punch, kick, block) {
  const now = performance.now();
  const dt = h.last ? Math.min(0.1, (now - h.last) / 1000) : 0;
  h.last = now;
  let want = 'idle';
  if (h.down) want = 'fall';
  else if (h.seated) want = 'sit';
  else if (punch > 0) want = 'punch';
  else if (kick > 0) want = 'kick';
  else if (block) want = 'block';
  else if (amt > 0.05) want = h.gait > 0.85 ? 'sprint' : h.gait > 0.3 ? 'run' : 'walk';
  const name = pickClip(h, want);
  if (name && name !== h.cur) {
    const next = h.actions[name], prev = h.cur ? h.actions[h.cur] : null;
    next.reset();
    next.timeScale = name === 'punch' || name === 'kick' ? Math.max(1, next.getClip().duration / 0.55) : 1;
    next.play();
    if (prev) prev.crossFadeTo(next, name === 'punch' || name === 'kick' ? 0.08 : 0.25, false);
    h.cur = name;
  }
  if (h.cur === 'walk' || h.cur === 'run' || h.cur === 'sprint') h.actions[h.cur].timeScale = 0.6 + Math.min(1, amt) * 0.5;
  h.mixer.update(dt);
}
