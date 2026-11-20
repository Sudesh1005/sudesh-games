// Mission markers, checkpoints, fights, chases, timers and rewards.
import * as THREE from 'three';
import { laneSpot, rc, BEACH_X0 } from "./world.js";

const DEFS = [
  { id: 'fish', name: 'Meen Delivery', desc: 'Fresh fish for the market! Grab any vehicle and hit every checkpoint.',
    block: [7, 3], side: 'e', type: 'cp', nodes: [[8, 2], [6, 4], [6, 6]], time: 120, reward: 500, color: 0x3ec1ff },
  { id: 'auto', name: 'Auto Rush', desc: 'Your auto is parked by the road. Drop the passenger across town, autos only!',
    block: [3, 3], side: 'w', type: 'cp', nodes: [[3, 5], [1, 5], [1, 8], [4, 8], [4, 6]], time: 130, reward: 800,
    vehicle: 'auto', needType: 'auto', color: 0xffd23f },
  { id: 'escape', name: 'Hot Pursuit', desc: 'The cops are onto you. Lose your wanted level before time runs out!',
    block: [5, 2], side: 'w', type: 'escape', heat: 3, time: 150, reward: 1000, color: 0xff4d6d },
  { id: 'race', name: 'Kadal Sprint', desc: 'Street race along the coast. A sports car is waiting for you.',
    block: [7, 6], side: 'e', type: 'cp', nodes: [[8, 8], [8, 4], [8, 0], [6, 0], [6, 2], [4, 2], [4, 4]], time: 110, reward: 1200,
    vehicle: 'sport', color: 0xb388ff },
  { id: 'biryani', name: 'Biryani Express', desc: 'Hot biryani, hungry customers. Take the bike and deliver fast!',
    block: [1, 2], side: 'w', type: 'cp', nodes: [[1, 0], [3, 0], [3, 1], [5, 1], [5, 3]], time: 75, reward: 900,
    vehicle: 'bike', needType: 'bike', color: 0xff9f1c },
  { id: 'brawl', name: 'Street Brawl', desc: 'Three thugs in red bandanas are bullying the street. Fists only, knock them all out!',
    block: [4, 4], side: 'w', type: 'fight', count: 3, time: 120, reward: 700, color: 0xff3b30 },
  { id: 'run', name: 'Lighthouse Run', desc: 'Beach fitness challenge. Run through every checkpoint on foot!',
    block: [7, 1], side: 'e', type: 'cp', onFoot: true, time: 70, reward: 400, color: 0x2ec4b6,
    points: [{ x: BEACH_X0 + 15, z: rc(1) + 20 }, { x: BEACH_X0 + 42, z: rc(2) + 20 }, { x: BEACH_X0 + 30, z: rc(3) + 10 }, { x: BEACH_X0 + 10, z: rc(4) }] },
  { id: 'thief', name: 'Chor Chase', desc: 'A thief just stole a sports car! Ram it until it is wrecked.',
    block: [2, 5], side: 'w', type: 'wreck', route: [[2, 5], [2, 6]], time: 120, reward: 1500, color: 0xf15bb5 },
];
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class Missions {
  constructor(scene, api) {
    this.api = api; this.active = null; this.near = null; this.t = 0; this.msg = '';
    this.count = DEFS.length;
    const layout = api.world.missionLayout(DEFS);
    this.markers = DEFS.map((def) => {
      const L = layout[def.id] || {}, spot = L.spot;
      const g = new THREE.Group(); g.position.set(spot.x, 0.16, spot.z);
      const col = new THREE.Color(def.color);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 24, 1, true),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 1.2; g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 32),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45),
        new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8 }));
      gem.position.y = 2.9; g.add(gem);
      scene.add(g);
      return { def, spot, g, gem, layout: L };
    });
    this.cpMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
    this.cp = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 14, 32, 1, true), this.cpMat);
    wall.position.y = 7; this.cp.add(wall);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.3, 5, 40), this.cpMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; this.cp.add(ring);
    this.cp.visible = false;
    scene.add(this.cp);
  }

  hintText() { return this.msg; }

  update(dt) {
    this.t += dt; this.msg = '';
    for (const m of this.markers) {
      m.gem.rotation.y += dt * 2;
      m.gem.position.y = 2.9 + Math.sin(this.t * 2.5) * 0.2;
      m.g.visible = !this.active;
    }
    const p = this.api.playerPos(), veh = this.api.vehicle();
    if (!this.active) {
      this.near = null;
      if (!veh) for (const m of this.markers) if (Math.hypot(p.x - m.spot.x, p.z - m.spot.z) < 2.2) { this.near = m; break; }
      if (this.near) {
        const d = this.near.def, done = this.api.done.has(d.id);
        this.msg = `${this.api.touch ? 'Tap ACT' : 'Press E'} to start "${d.name}"${done ? ' (replay)' : ''}: reward ₹${d.reward}`;
      }
      return;
    }
    const a = this.active, d = a.def;
    a.time -= dt;
    let obj = '';
    if (d.type === 'cp') {
      const cp = a.points[a.idx];
      this.cp.position.set(cp.x, 0, cp.z); this.cp.visible = true;
      this.cp.rotation.y += dt;
      const dist = Math.hypot(p.x - cp.x, p.z - cp.z);
      let ok;
      if (d.onFoot) { ok = !veh; if (veh) this.msg = 'On foot only! Get out and run.'; }
      else {
        ok = veh && (!d.needType || veh.type === d.needType);
        if (!veh) this.msg = d.needType ? `Get on the ${d.needType === 'bike' ? 'bike' : 'auto rickshaw'}!` : 'Get a vehicle!';
        else if (!ok) this.msg = `This job needs ${d.needType === 'bike' ? 'a bike' : 'an auto rickshaw'}!`;
      }
      obj = `Checkpoint ${a.idx + 1}/${a.points.length} · ${Math.round(dist)} m`;
      if (dist < (d.onFoot ? 3.5 : 7) && ok) {
        a.idx++;
        if (a.idx >= a.points.length) return this.complete();
        this.api.audio.checkpoint();
        this.api.hud.toast(`Checkpoint! ${a.points.length - a.idx} to go`);
      }
    } else if (d.type === 'escape') {
      const s = this.api.stars();
      if (s === 0) return this.complete();
      obj = `Lose the cops! (${s}★)`;
    } else if (d.type === 'fight') {
      const left = a.thugs.filter((t) => !t.ko).length;
      if (left === 0) return this.complete();
      obj = `Thugs left: ${left}`;
      if (veh) this.msg = 'Fists only! Get out of the vehicle.';
    } else if (d.type === 'wreck') {
      const hp = Math.max(0, a.target.health);
      if (hp <= 0) return this.complete();
      obj = `Wreck the getaway car! ${Math.ceil(hp)}%`;
      if (!veh) this.msg = 'Get a vehicle and ram the thief!';
    }
    if (a.time <= 0) return this.fail('Time up!');
    this.api.hud.mission({ title: d.name, obj, time: a.time, color: hex(d.color) });
  }

  tryStart() {
    if (this.active || !this.near) return false;
    const m = this.near, d = m.def;
    const L = m.layout || {}, points = L.points || [];
    this.active = { def: d, idx: 0, time: d.time, points };
    if (d.vehicle) this.api.spawnVehicle(d.vehicle, m.spot.park.x, m.spot.park.z, m.spot.park.heading);
    if (d.type === 'escape') this.api.setHeat(d.heat);
    if (d.type === "fight") this.active.thugs = this.api.spawnThugs(d.count, m.spot);
    if (d.type === 'wreck') {
      const s = laneSpot(L.route[0], L.route[1], 0.8);
      this.active.target = this.api.spawnFleeCar(s, L.route);
    }
    this.cpMat.color.set(d.color);
    this.cp.scale.setScalar(d.onFoot ? 0.6 : 1);
    this.api.hud.big(d.name, d.desc, hex(d.color), 4);
    this.api.audio.checkpoint();
    this.near = null;
    return true;
  }
  complete() {
    const d = this.active.def;
    this.api.reward(d.reward);
    this.api.done.add(d.id);
    this.api.save();
    this.api.audio.success();
    this.api.hud.big('MISSION COMPLETE', `${d.name}  +₹${d.reward}`, '#7CFC9A');
    this.end();
  }
  fail(reason) {
    if (!this.active) return;
    this.api.audio.fail();
    this.api.hud.big('MISSION FAILED', reason, '#ff4d6d');
    this.end();
  }
  end() {
    const a = this.active;
    if (a.thugs) this.api.removePeds(a.thugs);
    if (a.target) { a.target.flee = false; a.target.ai = null; }
    this.active = null;
    this.cp.visible = false;
    this.api.hud.mission(null);
  }
  blips() {
    if (this.active) {
      const a = this.active, col = hex(a.def.color);
      if (a.def.type === 'cp') { const cp = a.points[a.idx]; return [{ x: cp.x, z: cp.z, color: col, r: 6, edge: true }]; }
      if (a.def.type === 'fight') return a.thugs.filter((t) => !t.ko).map((t) => ({ x: t.pos.x, z: t.pos.z, color: '#ff3b30', r: 4, edge: true }));
      if (a.def.type === 'wreck') return [{ x: a.target.pos.x, z: a.target.pos.z, color: col, r: 6, edge: true }];
      return [];
    }
    return this.markers.map((m) => ({ x: m.spot.x, z: m.spot.z, color: hex(m.def.color), r: 6, edge: false, label: m.def.name[0] }));
  }
}
