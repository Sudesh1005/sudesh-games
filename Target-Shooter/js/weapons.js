// Target Shooter: weapon stats, first-person gun models and their animation (bob, sway, recoil, reload, aim).
import * as THREE from 'three';

// rate = seconds between shots, spread = radians, recoil = camera kick (radians), sightY = height of the sights above the model origin
export const WEAPONS = [
  { id: 'pistol', name: 'P-9 Pistol', key: '1', auto: false, rate: 0.15, dmg: 34, pellets: 1, mag: 12, reserve: 96, spread: 0.006, bloom: 0.012, recoil: 0.03, reload: 1.1, adsFov: 52, sightY: 0.06, adsZ: 0.55 },
  { id: 'rifle', name: 'AR-7 Rifle', key: '2', auto: true, rate: 0.09, dmg: 24, pellets: 1, mag: 30, reserve: 150, spread: 0.008, bloom: 0.006, recoil: 0.018, reload: 1.8, adsFov: 40, sightY: 0.1, adsZ: 0.64 },
  { id: 'shotgun', name: 'SG-12 Shotgun', key: '3', auto: false, rate: 0.8, dmg: 13, pellets: 9, mag: 6, reserve: 36, spread: 0.055, bloom: 0, recoil: 0.07, reload: 2.1, adsFov: 56, sightY: 0.07, adsZ: 0.62 },
];

function model(id) {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.45, metalness: 0.7 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3d4048, roughness: 0.5, metalness: 0.6 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.4, metalness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4527, roughness: 0.6 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x2c2f26, roughness: 0.9 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.9 });
  const glass = new THREE.MeshBasicMaterial({ color: 0xff3048 });
  const sleeves = [];
  const box = (w, h, d, x, y, z, mat, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); if (mat === sleeve) sleeves.push(m); return m; };
  const cyl = (r, len, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2), mat); m.position.set(x, y, z); g.add(m); return m; };
  let muzzle;
  if (id === 'pistol') {
    box(0.05, 0.055, 0.24, 0, 0.03, -0.06, dark);
    box(0.046, 0.04, 0.2, 0, -0.012, -0.05, mid);
    box(0.045, 0.13, 0.06, 0, -0.08, 0.04, mid, 0.25);
    box(0.006, 0.012, 0.012, 0, 0.064, -0.17, accent); box(0.02, 0.012, 0.01, 0, 0.064, 0.05, dark);
    box(0.052, 0.008, 0.06, 0, 0.0, -0.13, accent);
    box(0.06, 0.09, 0.09, 0, -0.08, 0.05, glove);
    box(0.08, 0.08, 0.32, 0.03, -0.12, 0.25, sleeve, 0.15);
    muzzle = new THREE.Vector3(0, 0.03, -0.19);
  } else if (id === 'rifle') {
    box(0.06, 0.08, 0.42, 0, 0.02, -0.05, dark);
    box(0.065, 0.06, 0.26, 0, 0.02, -0.33, mid);
    cyl(0.015, 0.22, 0, 0.03, -0.55, dark);
    box(0.05, 0.1, 0.22, 0, -0.005, 0.26, mid);
    box(0.04, 0.16, 0.07, 0, -0.1, -0.12, dark, -0.2);
    box(0.045, 0.11, 0.05, 0, -0.08, 0.08, mid, 0.3);
    box(0.03, 0.03, 0.08, 0, 0.08, -0.02, dark);
    cyl(0.022, 0.07, 0, 0.1, -0.02, mid);
    const dot = box(0.006, 0.006, 0.002, 0, 0.1, -0.05, glass);
    dot.userData.dot = true;
    box(0.062, 0.012, 0.3, 0, 0.065, -0.3, accent);
    box(0.06, 0.09, 0.09, 0, -0.08, 0.09, glove);
    box(0.07, 0.07, 0.09, 0, -0.03, -0.33, glove);
    box(0.08, 0.08, 0.32, 0.03, -0.12, 0.3, sleeve, 0.15);
    box(0.08, 0.08, 0.3, -0.08, -0.1, -0.18, sleeve, 0.2).rotation.y = 0.5;
    muzzle = new THREE.Vector3(0, 0.03, -0.67);
  } else {
    cyl(0.024, 0.6, 0, 0.04, -0.33, dark);
    cyl(0.02, 0.45, 0, 0.0, -0.26, mid);
    box(0.06, 0.07, 0.2, 0, 0.0, -0.3, wood);
    box(0.062, 0.09, 0.26, 0, 0.02, 0.06, dark);
    box(0.05, 0.1, 0.28, 0, -0.03, 0.3, wood, -0.08);
    box(0.008, 0.012, 0.01, 0, 0.07, -0.6, accent);
    box(0.06, 0.09, 0.09, 0, -0.06, 0.13, glove);
    box(0.075, 0.07, 0.09, 0, -0.04, -0.3, glove);
    box(0.08, 0.08, 0.32, 0.03, -0.11, 0.32, sleeve, 0.15);
    box(0.08, 0.08, 0.3, -0.08, -0.09, -0.16, sleeve, 0.2).rotation.y = 0.5;
    muzzle = new THREE.Vector3(0, 0.04, -0.64);
  }
  return { group: g, muzzle, sleeves };
}

export class Arsenal {
  constructor(vmScene, infinite) {
    this.root = new THREE.Group(); vmScene.add(this.root);
    this.guns = WEAPONS.map((w) => {
      const m = model(w.id);
      m.group.visible = false; this.root.add(m.group);
      return { w, ...m, ammo: w.mag, reserve: infinite ? Infinity : w.reserve };
    });
    const flashTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,250,220,1)'); r.addColorStop(0.35, 'rgba(255,190,80,0.9)'); r.addColorStop(1, 'rgba(255,120,20,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.visible = false;
    this.cur = 0; this.next = -1; this.cool = 0; this.reloading = 0; this.switching = 0;
    this.kick = 0; this.bloom = 0; this.ads = 0; this.flashT = 0;
    this.select(0, true);
  }
  get gun() { return this.guns[this.cur]; }
  get w() { return this.guns[this.cur].w; }

  select(i, instant = false) {
    if (i === this.cur && !instant) return;
    if (instant) {
      this.guns.forEach((g, k) => (g.group.visible = k === i));
      this.cur = i; this.gun.group.add(this.flash); this.flash.position.copy(this.gun.muzzle);
      return;
    }
    if (this.switching > 0) { this.next = i; return; }
    this.next = i; this.switching = 0.45; this.reloading = 0;
  }

  startReload() {
    const g = this.gun;
    if (this.reloading > 0 || this.switching > 0 || g.ammo >= g.w.mag || g.reserve <= 0) return false;
    this.reloading = g.w.reload;
    return true;
  }

  // Returns true when a shot fires this frame.
  tryFire(trigger, wasDown) {
    const g = this.gun;
    if (this.cool > 0 || this.reloading > 0 || this.switching > 0) return false;
    if (!trigger || (!g.w.auto && wasDown)) return false;
    if (g.ammo <= 0) return 'empty';
    g.ammo--;
    this.cool = g.w.rate;
    this.kick = 1;
    this.bloom = Math.min(0.05, this.bloom + g.w.bloom);
    this.flashT = 0.05;
    return true;
  }

  spread(player) {
    const w = this.w;
    let s = w.spread + this.bloom + Math.min(1, player.moving / 6) * 0.02 + (player.onGround ? 0 : 0.04);
    if (w.pellets === 1) s *= 1 - this.ads * 0.7;
    return s;
  }

  update(dt, aim, player, look, onReloaded) {
    this.cool = Math.max(0, this.cool - dt);
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    this.kick = Math.max(0, this.kick - dt * 9);
    if (this.switching > 0) {
      const before = this.switching;
      this.switching -= dt;
      if (before > 0.22 && this.switching <= 0.22 && this.next >= 0) { this.select(this.next, true); this.next = -1; }
    }
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const g = this.gun, need = g.w.mag - g.ammo, take = Math.min(need, g.reserve);
        g.ammo += take; if (g.reserve !== Infinity) g.reserve -= take;
        onReloaded();
      }
    }
    const canAim = this.reloading <= 0 && this.switching <= 0 && !player.sprinting;
    this.ads += ((aim && canAim ? 1 : 0) - this.ads) * (1 - Math.exp(-dt * 14));
    // place the gun: hip vs aim, plus bob, sway, recoil, reload and switch animations
    const w = this.w, a = this.ads, b = player.bob, m = Math.min(1, player.moving / 5) * (1 - a * 0.85);
    const x = 0.2 * (1 - a) + Math.sin(b) * 0.012 * m - look.x * 0.0004 * (1 - a);
    let y = -0.2 * (1 - a) - w.sightY * a + Math.abs(Math.cos(b)) * 0.012 * m + look.y * 0.0004 * (1 - a);
    let z = -0.42 * (1 - a) - w.adsZ * a + this.kick * 0.05;
    for (const s of this.gun.sleeves) s.visible = a < 0.35;
    let rx = this.kick * (w.id === 'shotgun' ? 0.25 : 0.1), ry = 0, rz = 0;
    if (player.sprinting) { ry = 0.5; rz = 0.25; y -= 0.05; }
    if (this.reloading > 0) {
      const k = Math.sin(Math.PI * (1 - this.reloading / w.reload));
      y -= 0.12 * k; rx -= 0.7 * k; rz += 0.4 * k;
    }
    if (this.switching > 0) { const k = Math.sin(Math.PI * (1 - this.switching / 0.45)); y -= 0.3 * k; rx -= 0.5 * k; }
    this.root.position.set(x, y, z);
    this.root.rotation.set(rx, ry, rz);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    if (this.flash.visible) { const s = 0.18 + Math.random() * 0.12; this.flash.scale.set(s, s, s); this.flash.material.rotation = Math.random() * 6; }
  }

  refill() { for (const g of this.guns) g.reserve = Math.min(g.reserve + g.w.mag * 3, g.w.reserve * 1.5); }
}
