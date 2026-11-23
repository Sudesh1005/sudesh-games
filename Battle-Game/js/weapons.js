// Theevu Yudham: guns. Stats, the gun models the soldiers hold, and the state of each gun (ammo, reload).
import * as THREE from 'three';

// rate = seconds between shots; spread / aimSpread in radians (hip fire / aiming); recoil = camera kick
export const GUNS = {
  ar: { id: 'ar', name: 'AR-K Rifle', slot: 1, auto: true, rate: 0.1, dmg: 22, mag: 30, reserve: 120, spread: 0.016, aimSpread: 0.0035, recoil: 0.011, reload: 2.0, range: 300, fov: 48, sound: 'rifle' },
  pistol: { id: 'pistol', name: 'P-9 Pistol', slot: 2, auto: false, rate: 0.17, dmg: 26, mag: 12, reserve: 60, spread: 0.02, aimSpread: 0.005, recoil: 0.022, reload: 1.3, range: 120, fov: 55, sound: 'pistol' },
};

export class Gun {
  constructor(def) { this.def = def; this.ammo = def.mag; this.reserve = def.reserve; this.cool = 0; this.reloading = 0; this.bloom = 0; }
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
export function gunModel(id) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23252a, roughness: 0.45, metalness: 0.7 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3e4249, roughness: 0.5, metalness: 0.6 });
  const tan = new THREE.MeshStandardMaterial({ color: 0x9c8a62, roughness: 0.7, metalness: 0.1 });
  const box = (w, h, d, x, y, z, mat, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  const cyl = (r, len, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10).rotateX(Math.PI / 2), mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  let muzzle;
  if (id === 'ar') {
    box(0.06, 0.08, 0.42, 0, 0.02, 0.05, dark);            // receiver
    box(0.066, 0.065, 0.26, 0, 0.02, 0.33, tan);           // handguard
    cyl(0.015, 0.24, 0, 0.03, 0.56, dark);                 // barrel
    box(0.05, 0.11, 0.24, 0, 0.0, -0.27, tan);             // stock
    box(0.04, 0.17, 0.07, 0, -0.1, 0.13, dark, 0.2);       // magazine
    box(0.045, 0.11, 0.05, 0, -0.08, -0.07, mid, -0.3);    // grip
    box(0.03, 0.035, 0.1, 0, 0.085, 0.03, dark);           // sight
    cyl(0.022, 0.08, 0, 0.11, 0.03, mid);
    muzzle = new THREE.Vector3(0, 0.03, 0.69);
  } else {
    box(0.045, 0.05, 0.2, 0, 0.03, 0.06, dark);
    box(0.042, 0.035, 0.17, 0, -0.008, 0.05, mid);
    box(0.04, 0.12, 0.055, 0, -0.07, -0.02, mid, -0.25);
    muzzle = new THREE.Vector3(0, 0.03, 0.17);
  }
  return { group: g, muzzle };
}
