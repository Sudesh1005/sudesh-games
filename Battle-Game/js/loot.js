// Theevu Yudham: loot. What lies around the island (guns, ammo, armour, helmets, bandages, med kits,
// grenades), the bag each player carries, and picking things up.
import * as THREE from 'three';
import { GUNS, AMMO, gunModel, Gun } from './weapons.js';

export const CAP = { light: 240, rifle: 210, shell: 40, heavy: 40, bandage: 10, medkit: 3, grenade: 4 };
export const VEST = [0, 50, 100];          // armour points by vest level
export const HELMET_CUT = [0, 0.3, 0.5];   // headshot damage removed by helmet level

export class Inventory {
  constructor() {
    this.guns = [null, null]; this.cur = 0;
    this.ammo = { light: 0, rifle: 0, shell: 0, heavy: 0 };
    this.bandage = 0; this.medkit = 0; this.grenade = 0; this.vest = 0; this.helm = 0;
  }
  gun() { return this.guns[this.cur]; }
  give(id, loaded) { const g = new Gun(GUNS[id], this, loaded); const i = this.guns[0] ? (this.guns[1] ? this.cur : 1) : 0; this.guns[i] = g; return i; }
}

// what turns up, and how often
const TABLE = [
  ['gun:ar', 6], ['gun:smg', 7], ['gun:shotgun', 5], ['gun:sniper', 2], ['gun:pistol', 6],
  ['ammo:light', 9], ['ammo:rifle', 9], ['ammo:shell', 4], ['ammo:heavy', 3],
  ['bandage', 11], ['medkit', 5], ['vest:1', 5], ['vest:2', 1.5], ['helm:1', 5], ['helm:2', 1.5], ['grenade', 6],
];
const TOTAL = TABLE.reduce((a, [, w]) => a + w, 0);

export function itemName(it) {
  const [k, v] = it.kind.split(':');
  if (k === 'gun') return GUNS[v].name;
  if (k === 'ammo') return `${AMMO[v].name} ×${it.n}`;
  if (k === 'vest') return `Armour vest (level ${v})`;
  if (k === 'helm') return `Helmet (level ${v})`;
  return { bandage: `Bandage ×${it.n}`, medkit: 'Med kit', grenade: 'Grenade' }[k];
}

/* ------------------------------------------------------------------ models */
const geo = {}, mat = {};
function shared() {
  if (geo.ammo) return;
  geo.ammo = new THREE.BoxGeometry(0.26, 0.15, 0.18).translate(0, 0.075, 0);
  geo.lid = new THREE.BoxGeometry(0.27, 0.03, 0.19).translate(0, 0.16, 0);
  geo.bandage = new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12).rotateZ(Math.PI / 2).translate(0, 0.06, 0);
  geo.kit = new THREE.BoxGeometry(0.36, 0.14, 0.26).translate(0, 0.07, 0);
  geo.crossA = new THREE.BoxGeometry(0.16, 0.01, 0.05).translate(0, 0.145, 0);
  geo.crossB = new THREE.BoxGeometry(0.05, 0.01, 0.16).translate(0, 0.145, 0);
  geo.vest = new THREE.BoxGeometry(0.46, 0.12, 0.52).translate(0, 0.06, 0);
  geo.helm = new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.nade = new THREE.SphereGeometry(0.055, 10, 8).translate(0, 0.055, 0);
  geo.pin = new THREE.CylinderGeometry(0.015, 0.015, 0.05, 6).translate(0, 0.12, 0);
  geo.ring = new THREE.RingGeometry(0.32, 0.4, 24).rotateX(-Math.PI / 2).translate(0, 0.02, 0);
  mat.white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 });
  mat.red = new THREE.MeshStandardMaterial({ color: 0xd02a2a, roughness: 0.5 });
  mat.dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 0.6 });
  mat.nade = new THREE.MeshStandardMaterial({ color: 0x3f5a2e, roughness: 0.5, metalness: 0.3 });
  mat.vest = [null, new THREE.MeshStandardMaterial({ color: 0x6b6f45, roughness: 0.8 }), new THREE.MeshStandardMaterial({ color: 0x2f3e58, roughness: 0.7 })];
  mat.ammo = {}; for (const k in AMMO) mat.ammo[k] = new THREE.MeshStandardMaterial({ color: AMMO[k].color, roughness: 0.6 });
  // glow ring under each item, coloured by how good it is
  mat.ring = {};
  for (const [k, c] of [['common', 0xffffff], ['ammo', 0x7ee06a], ['armour', 0x5fb0ff], ['rare', 0xffc33f], ['med', 0xff6a6a]]) {
    mat.ring[k] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  }
}
function makeMesh(kind) {
  shared();
  const g = new THREE.Group(), [k, v] = kind.split(':');
  const add = (gg, m) => { const x = new THREE.Mesh(gg, m); g.add(x); return x; };
  let ring = 'common';
  if (k === 'gun') {
    const m = gunModel(v).group; m.rotation.set(0, 0, Math.PI / 2); m.position.y = 0.05; g.add(m);
    ring = v === 'sniper' ? 'rare' : 'common';
  } else if (k === 'ammo') { add(geo.ammo, mat.ammo[v]); add(geo.lid, mat.dark); ring = 'ammo'; }
  else if (k === 'bandage') { add(geo.bandage, mat.white); ring = 'med'; }
  else if (k === 'medkit') { add(geo.kit, mat.white); add(geo.crossA, mat.red); add(geo.crossB, mat.red); ring = 'med'; }
  else if (k === 'vest') { add(geo.vest, mat.vest[+v]); ring = +v > 1 ? 'rare' : 'armour'; }
  else if (k === 'helm') { add(geo.helm, mat.vest[+v]); ring = +v > 1 ? 'rare' : 'armour'; }
  else if (k === 'grenade') { add(geo.nade, mat.nade); add(geo.pin, mat.dark); }
  add(geo.ring, mat.ring[ring]);
  return g;
}

/* ------------------------------------------------------------------ the loot on the island */
export class Loot {
  constructor(scene, rnd) { this.scene = scene; this.rnd = rnd; this.items = []; this.nextId = 1; }

  spawnAll(spots) {
    const R = this.rnd;
    for (const [x, y, z] of spots) {
      if (R() > 0.78) continue;
      let pick = R() * TOTAL, kind = 'bandage';
      for (const [k, w] of TABLE) { pick -= w; if (pick <= 0) { kind = k; break; } }
      this.add(kind, x, y, z, this.amount(kind));
      // guns come with a box of their ammo
      if (kind.startsWith('gun:')) { const a = 'ammo:' + GUNS[kind.slice(4)].ammo; this.add(a, x + 0.5, y, z + 0.3, this.amount(a)); }
    }
  }
  amount(kind) {
    const [k, v] = kind.split(':');
    if (k === 'ammo') return AMMO[v].box;
    if (k === 'bandage') return 3;
    if (k === 'gun') return GUNS[v].mag;
    return 1;
  }
  // id is given for items another player dropped (online); local drops get a new id and are announced via onAdd
  add(kind, x, y, z, n, id) {
    const it = { id: id ?? this.nextId++, kind, n, x, y, z, mesh: makeMesh(kind), taken: false };
    it.mesh.position.set(x, y, z); it.mesh.rotation.y = ((it.id * 2.399) % 6.283);
    this.scene.add(it.mesh);
    this.items.push(it);
    if (id === undefined && this.onAdd) this.onAdd(it);
    return it;
  }
  remove(it) { it.taken = true; this.scene.remove(it.mesh); }
  clear() { for (const it of this.items) this.scene.remove(it.mesh); this.items = []; }

  // only draw what's near the player
  update(px, pz) {
    for (const it of this.items) { if (it.taken) continue; const d = Math.abs(it.x - px) + Math.abs(it.z - pz); it.mesh.visible = d < 90; }
  }
  near(px, py, pz, r = 2) {
    const out = [];
    for (const it of this.items) {
      if (it.taken || Math.abs(it.y - py) > 1.6) continue;
      const d = Math.hypot(it.x - px, it.z - pz);
      if (d < r) out.push([d, it]);
    }
    return out.sort((a, b) => a[0] - b[0]).map((a) => a[1]);
  }

  // Take an item into the bag. auto = walking over it (only things that need no choice).
  // Returns a message, or null if nothing was taken.
  take(it, inv, soldier, auto) {
    const [k, v] = it.kind.split(':');
    if (k === 'gun') {
      if (auto) return null;
      const def = GUNS[v];
      const same = inv.guns.find((g) => g && g.def.id === v);
      if (same) {
        // already carrying one: keep its bullets
        const room = CAP[def.ammo] - inv.ammo[def.ammo];
        if (room <= 0) return null;
        inv.ammo[def.ammo] += Math.min(room, it.n);
        this.remove(it);
        return `+${Math.min(room, it.n)} ${AMMO[def.ammo].name.toLowerCase()}`;
      }
      const slot = !inv.guns[0] ? 0 : !inv.guns[1] ? 1 : inv.cur;
      const old = inv.guns[slot];
      if (old) this.add('gun:' + old.def.id, soldier.pos.x + 0.6, soldier.pos.y + 0.02, soldier.pos.z + 0.4, old.ammo);
      inv.guns[slot] = new Gun(def, inv, it.n);
      inv.cur = slot;
      this.remove(it);
      return `Picked up ${def.name}`;
    }
    if (k === 'ammo') {
      const room = CAP[v] - inv.ammo[v];
      if (room <= 0) return null;
      const n = Math.min(room, it.n);
      inv.ammo[v] += n; it.n -= n;
      if (it.n <= 0) this.remove(it);
      return `+${n} ${AMMO[v].name.toLowerCase()}`;
    }
    if (k === 'bandage' || k === 'medkit' || k === 'grenade') {
      const room = CAP[k] - inv[k];
      if (room <= 0) return null;
      const n = Math.min(room, it.n);
      inv[k] += n; it.n -= n;
      if (it.n <= 0) this.remove(it);
      return `+${n} ${k === 'medkit' ? 'med kit' : k}${n > 1 ? 's' : ''}`;
    }
    if (k === 'vest') {
      const lvl = +v;
      if (lvl < inv.vest || (lvl === inv.vest && soldier.armor >= VEST[lvl])) return null;
      inv.vest = lvl; soldier.armor = VEST[lvl]; soldier.vest = lvl;
      this.remove(it);
      return `Armour vest level ${lvl}`;
    }
    if (k === 'helm') {
      const lvl = +v;
      if (lvl <= inv.helm) return null;
      inv.helm = lvl; soldier.helm = lvl;
      this.remove(it);
      return `Helmet level ${lvl}`;
    }
    return null;
  }
}

// Everything in a bag dropped where its owner fell: guns, ammo, meds.
export function dropBag(loot, pos, inv) {
  const items = [];
  inv.guns.forEach((g) => { if (g) items.push(['gun:' + g.def.id, g.ammo]); });
  for (const k in inv.ammo) if (inv.ammo[k] > 0) items.push(['ammo:' + k, inv.ammo[k]]);
  if (inv.bandage) items.push(['bandage', inv.bandage]);
  for (let i = 0; i < inv.medkit; i++) items.push(['medkit', 1]);
  for (let i = 0; i < inv.grenade; i++) items.push(['grenade', 1]);
  items.forEach(([kind, n], i) => {
    const a = (i / Math.max(1, items.length)) * Math.PI * 2;
    loot.add(kind, pos.x + Math.cos(a) * 0.8, pos.y + 0.02, pos.z + Math.sin(a) * 0.8, n);
  });
}
