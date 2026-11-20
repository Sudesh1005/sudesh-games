// Target Shooter: sparks, tracers, bullet holes and explosions (all pooled).
import * as THREE from 'three';

export class FX {
  constructor(scene) {
    this.scene = scene;
    const N = (this.N = 800);
    this.pos = new Float32Array(N * 3); this.col = new Float32Array(N * 3);
    this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.points.frustumCulled = false;
    for (let i = 0; i < N; i++) this.pos[i * 3 + 1] = -999;
    scene.add(this.points);

    this.tracers = [];
    const tm = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 24; i++) {
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const l = new THREE.Line(lg, tm); l.visible = false; l.frustumCulled = false; scene.add(l);
      this.tracers.push({ l, t: 0 });
    }
    const holeTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 32;
      const x = c.getContext('2d'), r = x.createRadialGradient(16, 16, 1, 16, 16, 16);
      r.addColorStop(0, 'rgba(10,10,10,1)'); r.addColorStop(0.35, 'rgba(20,20,20,0.9)'); r.addColorStop(1, 'rgba(40,40,40,0)');
      x.fillStyle = r; x.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();
    const hm = new THREE.MeshBasicMaterial({ map: holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const hg = new THREE.PlaneGeometry(0.13, 0.13);
    this.holes = [];
    for (let i = 0; i < 80; i++) { const m = new THREE.Mesh(hg, hm); m.visible = false; scene.add(m); this.holes.push(m); }
    this.holeNext = 0;
    this.booms = [];
    const bg = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m); this.booms.push({ m, t: 0, s: 1 });
    }
    this.light = new THREE.PointLight(0xffa050, 0, 18, 1.5); scene.add(this.light);
    this.lightT = 0;
    this._v = new THREE.Vector3();
  }

  sparks(p, n, color, speed = 4, up = 1) {
    const c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.N;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 2 - 1, s = speed * (0.3 + Math.random());
      this.vel[i * 3] = Math.cos(a) * Math.sqrt(1 - e * e) * s; this.vel[i * 3 + 1] = Math.abs(e) * s * up + 1; this.vel[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - e * e) * s;
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
      this.life[i] = 0.3 + Math.random() * 0.5;
    }
  }

  tracer(a, b) {
    const t = this.tracers.find((x) => x.t <= 0) || this.tracers[0];
    const arr = t.l.geometry.attributes.position.array;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    t.l.geometry.attributes.position.needsUpdate = true;
    t.l.visible = true; t.t = 0.05;
  }

  hole(p, n) {
    const m = this.holes[this.holeNext]; this.holeNext = (this.holeNext + 1) % this.holes.length;
    m.position.copy(p).addScaledVector(n, 0.01);
    m.lookAt(this._v.copy(p).add(n));
    m.rotation.z = Math.random() * 6;
    m.visible = true;
  }

  explode(p, size = 1) {
    const b = this.booms.find((x) => x.t <= 0) || this.booms[0];
    b.m.position.copy(p); b.m.visible = true; b.t = 0.45; b.s = size;
    this.sparks(p, 50 * size, 0xffb040, 9 * size);
    this.sparks(p, 25, 0x666666, 3, 2);
    this.light.position.copy(p); this.light.intensity = 60 * size; this.lightT = 0.25;
  }

  update(dt) {
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; continue; }
      this.vel[i * 3 + 1] -= 12 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    for (const t of this.tracers) if (t.t > 0) { t.t -= dt; if (t.t <= 0) t.l.visible = false; }
    for (const b of this.booms) if (b.t > 0) {
      b.t -= dt; const k = 1 - b.t / 0.45;
      b.m.scale.setScalar(b.s * (0.3 + k * 2.4)); b.m.material.opacity = Math.max(0, 1 - k);
      b.m.material.color.setHSL(0.08 - k * 0.06, 1, 0.6 - k * 0.3);
      if (b.t <= 0) b.m.visible = false;
    }
    if (this.lightT > 0) { this.lightT -= dt; this.light.intensity = Math.max(0, this.lightT * 240); }
  }

  clear() {
    for (let i = 0; i < this.N; i++) { this.life[i] = 0; this.pos[i * 3 + 1] = -999; }
    for (const h of this.holes) h.visible = false;
    for (const t of this.tracers) { t.t = 0; t.l.visible = false; }
    for (const b of this.booms) { b.t = 0; b.m.visible = false; }
  }
}
