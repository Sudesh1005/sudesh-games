// Target Shooter: pop-up range targets, attack drones (with their shots) and pickups.
import * as THREE from 'three';
import { canvasTex } from './world.js';

/* ------------------------------------------------------------------ range targets */
function ringFace(kind) {
  return canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    if (kind === 'noshoot') {
      g.fillStyle = '#d7263d'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffffff'; g.lineWidth = 26; g.lineCap = 'round';
      g.beginPath(); g.moveTo(c - 62, c - 62); g.lineTo(c + 62, c + 62); g.moveTo(c + 62, c - 62); g.lineTo(c - 62, c + 62); g.stroke();
      return;
    }
    const cols = kind === 'gold' ? ['#7a5a10', '#ffd23f', '#7a5a10', '#ffe98a', '#ff8a00'] : ['#f2efe6', '#1b1b20', '#2a62c9', '#d7263d', '#ffd23f'];
    for (let k = 0; k < 5; k++) { g.fillStyle = cols[k]; g.beginPath(); g.arc(c, c, c * (1 - k * 0.2), 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(c, c, c * (1 - k * 0.2) - 1, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = '#111'; g.fillRect(c - 1, c - 10, 2, 20); g.fillRect(c - 10, c - 1, 20, 2);
  }, false);
}

export class RangeTargets {
  constructor(scene, low) {
    this.scene = scene; this.low = low; this.list = []; this.meshes = [];
    this.faces = { normal: ringFace('normal'), gold: ringFace('gold'), noshoot: ringFace('noshoot') };
    this.sideMat = new THREE.MeshStandardMaterial({ color: 0x3a3b40, roughness: 0.6 });
    this.postMat = new THREE.MeshStandardMaterial({ color: 0x55575d, roughness: 0.5, metalness: 0.6 });
    this.faceMats = {};
    for (const k in this.faces) this.faceMats[k] = new THREE.MeshStandardMaterial({ map: this.faces[k], roughness: 0.7 });
  }

  // kind: normal | gold | noshoot. Pops up at (x, -dist) and stays for `life` seconds.
  spawn(kind, x, dist, life, move) {
    const R = kind === 'gold' ? 0.32 : 0.45 + dist * 0.004;
    const root = new THREE.Group(); root.position.set(x, 0, -dist);
    const pivot = new THREE.Group(); root.add(pivot);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 8), this.postMat);
    post.position.y = 0.75; pivot.add(post);
    const board = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.06, 40).rotateX(Math.PI / 2), [this.sideMat, this.faceMats[kind], this.sideMat]);
    board.position.y = 1.5 + R * 0.6;
    pivot.add(board);
    if (!this.low) { post.castShadow = true; board.castShadow = true; }
    pivot.rotation.x = -Math.PI / 2;
    const t = { kind, root, pivot, board, R, dist, x0: x, life, age: 0, state: 'up', anim: 0, move, phase: Math.random() * 6, hit: false };
    board.userData.target = t; post.userData.target = t;
    this.scene.add(root); this.list.push(t); this.meshes.push(board, post);
    return t;
  }

  knock(t) { t.hit = true; t.state = 'down'; t.anim = 1; }

  update(dt, onExpire) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const t = this.list[k];
      t.age += dt;
      if (t.state === 'up') {
        t.anim = Math.min(1, t.anim + dt * 6);
        if (t.age > t.life) { t.state = 'down'; if (onExpire) onExpire(t); }
      } else t.anim -= dt * (t.hit ? 5 : 4);
      t.pivot.rotation.x = -Math.PI / 2 * (1 - easeOut(Math.max(0, t.anim)));
      if (t.hit) t.board.rotation.z += dt * 14;
      if (t.move) t.root.position.x = t.x0 + Math.sin(t.age * t.move.speed + t.phase) * t.move.amp;
      if (t.state === 'down' && t.anim <= 0) this.remove(k);
    }
  }

  remove(k) {
    const t = this.list[k];
    this.scene.remove(t.root);
    t.root.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
    this.meshes = this.meshes.filter((m) => m.userData.target !== t);
    this.list.splice(k, 1);
  }

  clear() { while (this.list.length) this.remove(this.list.length - 1); }
  upCount() { return this.list.filter((t) => t.state === 'up').length; }
}
const easeOut = (x) => 1 - (1 - x) * (1 - x) * (1 - x);

/* ------------------------------------------------------------------ drones */
export const DRONE = {
  scout: { hp: 60, speed: 7, size: 1, score: 100, dmg: 7, rate: 2.0, shotSpeed: 20, color: 0x2a2d35, accent: 0x4dd2ff },
  heavy: { hp: 240, speed: 4.2, size: 1.6, score: 300, dmg: 10, rate: 2.6, shotSpeed: 16, color: 0x3a2e28, accent: 0xff8a00, burst: 3 },
  kami: { hp: 30, speed: 10, size: 0.75, score: 60, dmg: 22, rate: 0, color: 0x2a2a2a, accent: 0xffd23f },
};

function droneMesh(type, low) {
  const D = DRONE[type], k = D.size;
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: D.color, roughness: 0.35, metalness: 0.7, emissive: 0xffffff, emissiveIntensity: 0 });
  const acc = new THREE.MeshStandardMaterial({ color: D.accent, roughness: 0.4, metalness: 0.3, emissive: D.accent, emissiveIntensity: 0.35 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'kami' ? 0xffd23f : 0xff2a3a });
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0xaab0bb, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x * k, y * k, z * k); if (!low) m.castShadow = true; g.add(m); return m; };
  const core = add(new THREE.SphereGeometry(0.42 * k, 18, 12), body, 0, 0, 0);
  add(new THREE.TorusGeometry(0.45 * k, 0.05 * k, 6, 24).rotateX(Math.PI / 2), acc, 0, 0, 0);
  const eye = add(new THREE.SphereGeometry(0.14 * k, 12, 8), eyeMat, 0, 0.02, 0.38);
  eye.userData.weak = true;
  const rotors = [];
  for (const [x, z] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
    add(new THREE.BoxGeometry(0.06 * k, 0.05 * k, 0.75 * k), body, x / 2, 0.15, z / 2).lookAt(x * k * 2, 0.15 * k, z * k * 2);
    const rotor = add(new THREE.CircleGeometry(0.28 * k, 16).rotateX(-Math.PI / 2), rotorMat, x, 0.2, z);
    rotor.castShadow = false;
    rotors.push(rotor);
  }
  if (type === 'kami') for (let a = 0; a < 6; a++) add(new THREE.ConeGeometry(0.08, 0.3, 6), acc, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0).lookAt(Math.cos(a) * 3, Math.sin(a) * 3, 0);
  if (type === 'heavy') { add(new THREE.BoxGeometry(0.5 * k, 0.16 * k, 0.4 * k), acc, 0, -0.42, 0.1); add(new THREE.CylinderGeometry(0.06 * k, 0.06 * k, 0.5 * k, 8).rotateX(Math.PI / 2), body, 0.2, -0.45, 0.4); add(new THREE.CylinderGeometry(0.06 * k, 0.06 * k, 0.5 * k, 8).rotateX(Math.PI / 2), body, -0.2, -0.45, 0.4); }
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.3 * k, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: D.accent, transparent: true, opacity: 0.8 }));
  glow.position.y = -0.43 * k; g.add(glow);
  return { g, body, rotors, core };
}

export class Drones {
  constructor(scene, low) {
    this.scene = scene; this.low = low; this.list = []; this.meshes = []; this.shots = [];
    this.shotGeo = new THREE.SphereGeometry(0.16, 10, 8);
    this.shotMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
    this.shotMat2 = new THREE.MeshBasicMaterial({ color: 0xffa040 });
    this.ray = new THREE.Raycaster();
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3();
  }

  spawn(type, pos, diff) {
    const D = DRONE[type], m = droneMesh(type, this.low);
    m.g.position.copy(pos);
    this.scene.add(m.g);
    const d = { type, D, mesh: m.g, body: m.body, rotors: m.rotors, hp: D.hp * diff.hp, pos: m.g.position, vel: new THREE.Vector3(), alive: true,
      fireT: 1.5 + Math.random() * 1.5, burst: 0, burstT: 0, orbit: Math.random() * Math.PI * 2, orbitDir: Math.random() < 0.5 ? -1 : 1,
      pref: 9 + Math.random() * 9, prefH: 2.5 + Math.random() * 4, flash: 0, t: Math.random() * 10 };
    m.g.traverse((o) => { if (o.isMesh) { o.userData.drone = d; this.meshes.push(o); } });
    this.list.push(d);
    return d;
  }

  remove(d) {
    d.alive = false;
    this.scene.remove(d.mesh);
    d.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.meshes = this.meshes.filter((m) => m.userData.drone !== d);
    this.list = this.list.filter((x) => x !== d);
  }

  clear() { for (const d of [...this.list]) this.remove(d); for (const s of this.shots) this.scene.remove(s.mesh); this.shots = []; }

  // Line of sight from a to b against the level geometry.
  clearLine(a, b, world) {
    this.tmp.subVectors(b, a); const len = this.tmp.length();
    this.ray.set(a, this.tmp.normalize()); this.ray.far = len;
    return this.ray.intersectObjects(world.hit, false).length === 0;
  }

  update(dt, player, world, diff, cb) {
    const eye = player.eyePos();
    const S = world.size - 1.5;
    for (const d of [...this.list]) {
      d.t += dt;
      const to = this.tmp.subVectors(eye, d.pos), dist = to.length();
      const want = this.tmp2;
      if (d.type === 'kami') {
        want.copy(to).normalize().multiplyScalar(d.D.speed * diff.speed);
        if (dist < 1.5) { cb.explode(d); continue; }
      } else {
        d.orbit += dt * d.orbitDir * (0.25 + 2 / Math.max(6, d.pref));
        want.set(player.pos.x + Math.cos(d.orbit) * d.pref, player.pos.y + d.prefH, player.pos.z + Math.sin(d.orbit) * d.pref).sub(d.pos);
        const l = want.length(); if (l > 1) want.multiplyScalar((d.D.speed * diff.speed) / Math.max(l, 3) * Math.min(1, l / 3));
        want.y += Math.sin(d.t * 2) * 0.6;
      }
      d.vel.lerp(want, 1 - Math.exp(-dt * 2.5));
      d.pos.addScaledVector(d.vel, dt);
      // stay inside the arena, above the floor and out of cover
      d.pos.x = Math.max(-S, Math.min(S, d.pos.x)); d.pos.z = Math.max(-S, Math.min(S, d.pos.z));
      d.pos.y = Math.max(1.2, Math.min(10, d.pos.y));
      for (const b of world.boxes) {
        const r = 0.6 * d.D.size;
        if (d.pos.x > b.min.x - r && d.pos.x < b.max.x + r && d.pos.z > b.min.z - r && d.pos.z < b.max.z + r && d.pos.y < b.max.y + r && d.pos.y > b.min.y - r) {
          if (b.max.y < 7) { d.pos.y = b.max.y + r; d.vel.y = Math.max(d.vel.y, 1); }
        }
      }
      d.mesh.lookAt(eye);
      for (const r of d.rotors) r.rotation.y += dt * 40;
      if (d.flash > 0) { d.flash -= dt; d.body.emissiveIntensity = Math.max(0, d.flash * 5); }
      // shooting
      if (d.D.rate > 0) {
        if (d.burst > 0) { d.burstT -= dt; if (d.burstT <= 0) { this.fire(d, eye, player, diff); d.burst--; d.burstT = 0.16; } }
        d.fireT -= dt;
        if (d.fireT <= 0) {
          d.fireT = d.D.rate * diff.rate * (0.7 + Math.random() * 0.6);
          if (dist < 40 && this.clearLine(d.pos, eye, world)) {
            this.fire(d, eye, player, diff); cb.zap();
            if (d.D.burst) { d.burst = d.D.burst - 1; d.burstT = 0.16; }
          }
        }
      }
    }
    // enemy shots
    for (let k = this.shots.length - 1; k >= 0; k--) {
      const s = this.shots[k];
      s.life -= dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      const p = s.mesh.position;
      let dead = s.life <= 0 || p.y < 0;
      if (!dead && player.hitBy(p, 0.35)) { cb.hurt(s.dmg, p); dead = true; }
      if (!dead) for (const b of world.boxes) if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) { dead = true; cb.spark(p); break; }
      if (dead) { this.scene.remove(s.mesh); this.shots.splice(k, 1); }
    }
  }

  fire(d, eye, player, diff) {
    const sp = d.D.shotSpeed;
    const lead = this.tmp.copy(player.vel).multiplyScalar(d.pos.distanceTo(eye) / sp * 0.5);
    const aim = eye.clone().add(lead).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.2));
    const m = new THREE.Mesh(this.shotGeo, d.type === 'heavy' ? this.shotMat2 : this.shotMat);
    m.position.copy(d.pos);
    this.scene.add(m);
    this.shots.push({ mesh: m, vel: aim.sub(d.pos).normalize().multiplyScalar(sp), life: 4, dmg: d.D.dmg * diff.dmg });
  }
}

/* ------------------------------------------------------------------ pickups */
export class Pickups {
  constructor(scene) {
    this.scene = scene; this.list = [];
    const mk = (col, sym) => canvasTex(64, 64, (g) => { g.fillStyle = col; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.font = 'bold 44px Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(sym, 32, 35); }, false);
    this.mats = {
      health: new THREE.MeshStandardMaterial({ map: mk('#1fa35a', '+'), emissive: 0x1fa35a, emissiveIntensity: 0.4 }),
      ammo: new THREE.MeshStandardMaterial({ map: mk('#c98a12', '▮'), emissive: 0xc98a12, emissiveIntensity: 0.4 }),
    };
    this.geo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  }
  spawn(kind, x, z) {
    const m = new THREE.Mesh(this.geo, this.mats[kind]);
    m.position.set(x, 0.6, z);
    this.scene.add(m);
    this.list.push({ kind, mesh: m, t: Math.random() * 6 });
  }
  update(dt, player, onTake) {
    for (let k = this.list.length - 1; k >= 0; k--) {
      const p = this.list[k];
      p.t += dt; p.mesh.rotation.y += dt * 1.6; p.mesh.position.y = 0.6 + Math.sin(p.t * 3) * 0.12;
      const dx = player.pos.x - p.mesh.position.x, dz = player.pos.z - p.mesh.position.z;
      if (dx * dx + dz * dz < 1.3 && player.pos.y < 1.6 && onTake(p.kind)) { this.scene.remove(p.mesh); this.list.splice(k, 1); }
    }
  }
  clear() { for (const p of this.list) this.scene.remove(p.mesh); this.list = []; }
}
