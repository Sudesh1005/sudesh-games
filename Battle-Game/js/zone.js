// Theevu Yudham: the safe zone. It waits, then shrinks to a smaller circle inside itself, stage by stage.
// Outside it you lose health every second (more in later stages). Seeded, so every player gets the same zone.
import * as THREE from 'three';
import { ISLAND_R } from './world.js';

// wait / shrink in seconds, the circle's radius after the stage, damage per second outside
export const STAGES = [
  { wait: 70, shrink: 45, r: 300, dps: 1 },
  { wait: 50, shrink: 35, r: 170, dps: 2 },
  { wait: 40, shrink: 30, r: 90, dps: 4 },
  { wait: 35, shrink: 25, r: 45, dps: 7 },
  { wait: 30, shrink: 25, r: 18, dps: 11 },
  { wait: 25, shrink: 25, r: 0, dps: 16 },
];

function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(80,170,255,0)'); gr.addColorStop(0.6, 'rgba(80,170,255,0.35)'); gr.addColorStop(1, 'rgba(110,190,255,0.7)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(200,235,255,0.25)';
  for (let y = 0; y < 256; y += 16) g.fillRect(0, y, 64, 3);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60, 1);
  return t;
}

export class Zone {
  constructor(scene, heightAt, rnd) {
    this.heightAt = heightAt; this.rnd = rnd;
    this.cur = { x: 0, z: 0, r: ISLAND_R + 150 };
    this.from = { ...this.cur };
    this.stage = 0; this.phase = 'wait'; this.t = STAGES[0].wait; this.done = false;
    this.next = this.pick(this.cur, STAGES[0].r);
    this.tex = stripeTexture();
    this.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 96, 1, true),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    this.wall.renderOrder = 2;
    scene.add(this.wall);
    this.scene = scene;
    this.place();
  }
  // a smaller circle inside the current one, centred on land
  pick(c, r) {
    for (let k = 0; k < 40; k++) {
      const a = this.rnd() * Math.PI * 2, d = Math.sqrt(this.rnd()) * Math.max(0, c.r - r) * (k < 30 ? 0.85 : 1);
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
      if (Math.hypot(x, z) + r * 0.3 < ISLAND_R && this.heightAt(x, z) > 1) return { x, z, r };
    }
    return { x: c.x, z: c.z, r };
  }
  get dps() { return STAGES[Math.min(this.stage, STAGES.length - 1)].dps; }
  update(dt) {
    if (this.done) return;
    this.t -= dt;
    const S = STAGES[this.stage];
    if (this.phase === 'wait') {
      if (this.t <= 0) { this.phase = 'shrink'; this.t = S.shrink; this.from = { ...this.cur }; }
    } else {
      const k = 1 - Math.max(0, this.t) / S.shrink;
      this.cur.x = this.from.x + (this.next.x - this.from.x) * k;
      this.cur.z = this.from.z + (this.next.z - this.from.z) * k;
      this.cur.r = this.from.r + (this.next.r - this.from.r) * k;
      if (this.t <= 0) {
        this.cur = { ...this.next };
        this.stage++;
        if (this.stage >= STAGES.length) { this.done = true; this.stage = STAGES.length - 1; }
        else { this.phase = 'wait'; this.t = STAGES[this.stage].wait; this.next = this.pick(this.cur, STAGES[this.stage].r); }
      }
    }
    this.place();
    this.tex.offset.y -= dt * 0.15;
  }
  place() {
    const r = Math.max(0.5, this.cur.r);
    this.wall.position.set(this.cur.x, 150, this.cur.z);
    this.wall.scale.set(r, 400, r);
    this.tex.repeat.set(Math.max(4, Math.round(r / 6)), 1);
  }
  inside(x, z) { return Math.hypot(x - this.cur.x, z - this.cur.z) <= this.cur.r; }
  insideNext(x, z) { return Math.hypot(x - this.next.x, z - this.next.z) <= this.next.r; }
  dispose() { this.scene.remove(this.wall); this.wall.geometry.dispose(); this.wall.material.dispose(); this.tex.dispose(); }
}
