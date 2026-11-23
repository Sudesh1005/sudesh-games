// Theevu Yudham: muzzle flashes, bullet tracers, dust / blood puffs on impact.
import * as THREE from 'three';

function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,230,1)'); r.addColorStop(0.3, 'rgba(255,200,80,0.9)'); r.addColorStop(1, 'rgba(255,120,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    const ft = flashTexture(), pt = puffTexture();
    this.flashes = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ft, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false; scene.add(s); this.flashes.push({ s, t: 0 });
    }
    // tracers: one line-segments object, updated in place
    this.maxTr = 48;
    this.trPos = new Float32Array(this.maxTr * 6);
    this.trCol = new Float32Array(this.maxTr * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.trCol, 3));
    this.trLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trLines.frustumCulled = false; scene.add(this.trLines);
    this.tracers = [];
    this.puffs = [];
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pt, transparent: true, depthWrite: false }));
      s.visible = false; scene.add(s); this.puffs.push({ s, t: 0, life: 1, v: new THREE.Vector3() });
    }
    this.fi = 0; this.pi = 0;
  }
  flash(p, size = 0.45) {
    const f = this.flashes[this.fi++ % this.flashes.length];
    f.s.position.copy(p); f.s.scale.setScalar(size * (0.8 + Math.random() * 0.4)); f.s.material.rotation = Math.random() * 6; f.s.visible = true; f.t = 0.05;
  }
  tracer(a, b) {
    if (this.tracers.length >= this.maxTr) this.tracers.shift();
    this.tracers.push({ a: a.clone(), b: b.clone(), t: 0.07 });
  }
  puff(p, color = 0xb9a98a, n = 5, size = 0.35) {
    for (let i = 0; i < n; i++) {
      const q = this.puffs[this.pi++ % this.puffs.length];
      q.s.position.copy(p); q.s.material.color.setHex(color); q.s.material.opacity = 0.8;
      q.v.set((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6);
      q.size = size * (0.6 + Math.random() * 0.6); q.s.scale.setScalar(q.size); q.t = q.life = 0.5 + Math.random() * 0.3; q.s.visible = true;
    }
  }
  update(dt) {
    for (const f of this.flashes) if (f.t > 0) { f.t -= dt; if (f.t <= 0) f.s.visible = false; }
    this.tracers = this.tracers.filter((t) => (t.t -= dt) > 0);
    let k = 0;
    for (const t of this.tracers) {
      const i = k * 6;
      // a short bright streak travelling along the shot
      const p = 1 - t.t / 0.07, ax = t.a.x + (t.b.x - t.a.x) * p * 0.7, ay = t.a.y + (t.b.y - t.a.y) * p * 0.7, az = t.a.z + (t.b.z - t.a.z) * p * 0.7;
      const bx = t.a.x + (t.b.x - t.a.x) * Math.min(1, p * 0.7 + 0.3), by = t.a.y + (t.b.y - t.a.y) * Math.min(1, p * 0.7 + 0.3), bz = t.a.z + (t.b.z - t.a.z) * Math.min(1, p * 0.7 + 0.3);
      this.trPos.set([ax, ay, az, bx, by, bz], i);
      const c = t.t / 0.07;
      this.trCol.set([1 * c, 0.85 * c, 0.5 * c, 1 * c, 0.95 * c, 0.7 * c], i);
      k++;
    }
    this.trLines.geometry.setDrawRange(0, k * 2);
    this.trLines.geometry.attributes.position.needsUpdate = true; this.trLines.geometry.attributes.color.needsUpdate = true;
    for (const q of this.puffs) {
      if (q.t <= 0) continue;
      q.t -= dt;
      if (q.t <= 0) { q.s.visible = false; continue; }
      q.s.position.addScaledVector(q.v, dt); q.v.y -= dt * 1.5;
      const k2 = q.t / q.life; q.s.material.opacity = 0.8 * k2; q.s.scale.setScalar(q.size * (1.6 - k2 * 0.6));
    }
  }
}
