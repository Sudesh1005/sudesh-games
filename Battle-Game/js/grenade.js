// Theevu Yudham: grenades. Thrown in an arc, they bounce off the ground and walls and go off after a short fuse.
import * as THREE from 'three';

export const BLAST_R = 7, BLAST_DMG = 110, FUSE = 2.6;

export class Grenades {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.list = [];
    this.geo = new THREE.SphereGeometry(0.06, 10, 8);
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3f5a2e, roughness: 0.5, metalness: 0.3 });
  }
  throw(from, dir, owner) {
    const m = new THREE.Mesh(this.geo, this.mat); m.castShadow = true;
    m.position.copy(from); this.scene.add(m);
    this.list.push({ m, p: from.clone(), v: dir.clone().multiplyScalar(13).add(new THREE.Vector3(0, 2.5, 0)), t: FUSE, owner });
  }
  // calls boom(position, owner) for each grenade that goes off
  update(dt, boom) {
    const W = this.world;
    for (const g of this.list) {
      g.t -= dt;
      g.v.y -= 20 * dt;
      const step = g.v.clone().multiplyScalar(dt), len = step.length();
      if (len > 1e-5) {
        const d = step.clone().divideScalar(len);
        const hit = W.raycast([g.p.x, g.p.y, g.p.z], [d.x, d.y, d.z], len + 0.06);
        if (hit) {
          // bounce: reflect off the surface and lose most of the speed
          const n = new THREE.Vector3(...hit.normal);
          g.p.set(hit.point[0] + n.x * 0.07, hit.point[1] + n.y * 0.07, hit.point[2] + n.z * 0.07);
          g.v.reflect(n).multiplyScalar(0.38);
          if (n.y > 0.7 && Math.abs(g.v.y) < 1.2) { g.v.y = 0; g.v.x *= 0.8; g.v.z *= 0.8; }
        } else g.p.add(step);
      }
      g.m.position.copy(g.p);
      g.m.rotation.x += dt * 9;
      if (g.t <= 0) { this.scene.remove(g.m); boom(g.p.clone(), g.owner); }
    }
    this.list = this.list.filter((g) => g.t > 0);
  }
  clear() { for (const g of this.list) this.scene.remove(g.m); this.list = []; }
}
