// Kaathu Riders: rival riders. They pick the lane with the most room through traffic,
// brake for bends and for vehicles they can't get round, and use nitro on clear straights.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Rider {
  constructor(bike, road, traffic, skill) {
    this.bike = bike; this.road = road; this.traffic = traffic; this.skill = skill;
    this.profile = road.speedProfile(bike.stats.grip * 0.85, bike.stats.vmax, 18);
    this.lane = bike.loc.lat; this.goal = this.lane;
    this.scanT = Math.random() * 0.2;
    // reaction: worse riders look less far ahead and decide later
    this.margin = 0.6 + (1 - skill) * 3;
  }

  update(dt, bikes, rubber, running) {
    const b = this.bike, r = this.road, inp = b.input;
    if (!running || b.crashed) { inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.nitro = false; if (b.crashed) this.lane = this.goal = b.loc.lat; return; }
    const i = b.loc.i, sp = Math.max(b.speed, 8), N = r.N;

    // choose a lane every ~0.2 s by time-to-impact with traffic (and other riders)
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.18 + Math.random() * 0.12;
      let best = -Infinity, bestLat = this.goal;
      for (let k = 0; k < r.lanes; k++) {
        for (const off of [-0.9, 0.9]) {
          const lat = r.laneLat(k) + off;
          let ttc = this.traffic.timeTo(b.s, lat, sp);
          for (const o of bikes) {
            if (o === b || o.crashed) continue;
            const gap = o.s - b.s;
            if (gap > 0 && gap < 25 && Math.abs(o.loc.lat - lat) < 1.2 && o.speed < b.speed) ttc = Math.min(ttc, gap / Math.max(1, b.speed - o.speed));
          }
          let score = Math.min(ttc, 6);
          if (r.isOpp(k)) score -= 0.9;
          score -= Math.abs(lat - b.loc.lat) * 0.08;
          if (Math.abs(lat - this.goal) < 0.5) score += 0.4;
          if (score > best) { best = score; bestLat = lat; }
        }
      }
      this.goal = bestLat;
    }
    this.lane += clamp(this.goal - this.lane, -6 * dt, 6 * dt);

    // steer toward a point ahead on the chosen line
    const look = Math.max(3, Math.round((6 + b.speed * 0.38) / r.seg));
    const j = Math.min(N - 1, i + look);
    const tx = r.px[j] + r.rx[j] * this.lane, tz = r.pz[j] + r.rz[j] * this.lane;
    inp.steer = clamp(-wrapAngle(Math.atan2(tx - b.x, tz - b.z) - b.h) * 2.8, -1, 1);

    // speed: bends ahead, then whatever is blocking our current line
    let target = this.profile[Math.min(N - 1, i + Math.round((4 + b.speed * 0.2) / r.seg))] * this.skill * rubber;
    const blk = this.traffic.ahead(b.s, b.loc.lat, b.speed * this.margin + 10);
    if (blk) target = Math.min(target, blk.v + Math.max(0, blk.gap - 6) * 0.6);
    inp.throttle = b.speed < target ? 1 : 0;
    inp.brake = b.speed > target + 2 ? 1 : 0;
    const clear = this.traffic.timeTo(b.s, b.loc.lat, sp) > 4 && this.profile[Math.min(N - 1, i + Math.round(80 / r.seg))] >= b.stats.vmax * 0.97;
    inp.nitro = clear && b.speed > 22 && this.skill > 0.86 && (b.boosting || b.nitro > 0.35);
  }
}
