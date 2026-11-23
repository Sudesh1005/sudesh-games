// Theevu Yudham: guns. Stats, the gun models the soldiers hold, and the state of each gun (ammo, reload).
import * as THREE from 'three';

// rate = seconds between shots; spread / aimSpread in radians (hip fire / aiming); recoil = camera kick;
// ammo = the kind of bullets it takes from the bag; head = headshot multiplier; fov = zoom when aiming
export const GUNS = {
  ar: { id: 'ar', name: 'AR-K Rifle', auto: true, rate: 0.1, dmg: 22, mag: 30, ammo: 'rifle', spread: 0.016, aimSpread: 0.0035, recoil: 0.011, reload: 2.0, range: 300, fov: 48, head: 2, sound: 'rifle' },
  smg: { id: 'smg', name: 'SM-9 SMG', auto: true, rate: 0.066, dmg: 15, mag: 32, ammo: 'light', spread: 0.02, aimSpread: 0.007, recoil: 0.008, reload: 1.7, range: 120, fov: 55, head: 1.7, sound: 'smg' },
  shotgun: { id: 'shotgun', name: 'M-12 Shotgun', auto: false, rate: 0.85, dmg: 13, pellets: 8, mag: 6, ammo: 'shell', spread: 0.06, aimSpread: 0.045, recoil: 0.05, reload: 2.4, range: 45, fov: 60, head: 1.5, sound: 'shotgun' },
  sniper: { id: 'sniper', name: 'K-98 Sniper', auto: false, rate: 1.3, dmg: 80, mag: 5, ammo: 'heavy', spread: 0.05, aimSpread: 0.0004, recoil: 0.06, reload: 2.8, range: 600, fov: 14, head: 2.5, scope: true, sound: 'sniper' },
  pistol: { id: 'pistol', name: 'P-9 Pistol', auto: false, rate: 0.17, dmg: 26, mag: 12, ammo: 'light', spread: 0.02, aimSpread: 0.005, recoil: 0.022, reload: 1.3, range: 120, fov: 55, head: 2, sound: 'pistol' },
};
export const AMMO = {
  light: { name: 'Light ammo', color: 0xe0b040, box: 30 },
  rifle: { name: 'Rifle ammo', color: 0x58a040, box: 30 },
  shell: { name: 'Shells', color: 0xc03a2a, box: 8 },
  heavy: { name: 'Heavy ammo', color: 0x3a6ac0, box: 10 },
};

// A gun in someone's hands. Spare bullets come from the owner's bag (inv.ammo).
export class Gun {
  constructor(def, inv, loaded = def.mag) { this.def = def; this.inv = inv; this.ammo = loaded; this.cool = 0; this.reloading = 0; this.bloom = 0; }
  get reserve() { return this.inv.ammo[this.def.ammo] || 0; }
  set reserve(v) { this.inv.ammo[this.def.ammo] = v; }
  get busy() { return this.reloading > 0; }
  startReload() {
    if (this.reloading > 0 || this.ammo >= this.def.mag || this.reserve <= 0) return false;
    this.reloading = this.def.reload; return true;
  }
  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) { const n = Math.min(this.def.mag - this.ammo, this.reserve); this.ammo += n; this.reserve -= n; this.reloading = 0; }
    }
  }
}

// The gun model in the soldier's hands. Built pointing along +z (the way the soldier faces); muzzle in local space.
const MATS = {};
function mats() {
  if (!MATS.dark) {
    MATS.dark = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.45, metalness: 0.7 });
    MATS.mid = new THREE.MeshStandardMaterial({ color: 0x3e4249, roughness: 0.5, metalness: 0.6 });
    MATS.tan = new THREE.MeshStandardMaterial({ color: 0x9c8a62, roughness: 0.7, metalness: 0.1 });
    MATS.wood = new THREE.MeshStandardMaterial({ color: 0x6b4527, roughness: 0.6 });
    MATS.green = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6, metalness: 0.2 });
  }
  return MATS;
}
export function gunModel(id) {
  const g = new THREE.Group(), M = mats();
  const box = (w, h, d, x, y, z, mat, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  const cyl = (r, len, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  let muzzle;
  if (id === 'ar') {
    box(0.06, 0.08, 0.42, 0, 0.02, 0.05, M.dark);            // receiver
    box(0.066, 0.065, 0.26, 0, 0.02, 0.33, M.tan);           // handguard
    cyl(0.015, 0.24, 0, 0.03, 0.56, M.dark);                 // barrel
    box(0.05, 0.11, 0.24, 0, 0.0, -0.27, M.tan);             // stock
    box(0.04, 0.17, 0.07, 0, -0.1, 0.13, M.dark, 0.2);       // magazine
    box(0.045, 0.11, 0.05, 0, -0.08, -0.07, M.mid, -0.3);    // grip
    box(0.03, 0.035, 0.1, 0, 0.085, 0.03, M.dark);           // sight
    cyl(0.022, 0.08, 0, 0.11, 0.03, M.mid);
    muzzle = new THREE.Vector3(0, 0.03, 0.69);
  } else if (id === 'smg') {
    box(0.055, 0.08, 0.32, 0, 0.02, 0.06, M.dark);
    cyl(0.018, 0.16, 0, 0.03, 0.3, M.mid);
    box(0.035, 0.2, 0.05, 0, -0.12, 0.08, M.dark, 0.05);
    box(0.04, 0.1, 0.05, 0, -0.07, -0.06, M.mid, -0.3);
    box(0.03, 0.06, 0.2, 0, 0.0, -0.2, M.mid);
    box(0.025, 0.03, 0.06, 0, 0.075, 0.05, M.dark);
    muzzle = new THREE.Vector3(0, 0.03, 0.39);
  } else if (id === 'shotgun') {
    cyl(0.024, 0.62, 0, 0.04, 0.33, M.dark);
    cyl(0.02, 0.45, 0, 0.0, 0.26, M.mid);
    box(0.06, 0.07, 0.2, 0, 0.0, 0.32, M.wood);
    box(0.062, 0.09, 0.26, 0, 0.02, -0.04, M.dark);
    box(0.05, 0.1, 0.3, 0, -0.03, -0.3, M.wood, 0.08);
    muzzle = new THREE.Vector3(0, 0.04, 0.65);
  } else if (id === 'sniper') {
    box(0.055, 0.07, 0.5, 0, 0.02, 0.08, M.green);
    cyl(0.017, 0.5, 0, 0.035, 0.55, M.dark);
    box(0.05, 0.12, 0.3, 0, -0.01, -0.3, M.green);
    box(0.04, 0.1, 0.05, 0, -0.07, -0.04, M.dark, -0.3);
    cyl(0.03, 0.3, 0, 0.12, 0.05, M.dark);                    // scope
    cyl(0.036, 0.04, 0, 0.12, 0.21, M.dark); cyl(0.036, 0.04, 0, 0.12, -0.1, M.dark);
    box(0.03, 0.08, 0.08, 0, -0.07, 0.12, M.dark);
    muzzle = new THREE.Vector3(0, 0.035, 0.8);
  } else {
    box(0.045, 0.05, 0.2, 0, 0.03, 0.06, M.dark);
    box(0.042, 0.035, 0.17, 0, -0.008, 0.05, M.mid);
    box(0.04, 0.12, 0.055, 0, -0.07, -0.02, M.mid, -0.25);
    muzzle = new THREE.Vector3(0, 0.03, 0.17);
  }
  return { group: g, muzzle };
}
