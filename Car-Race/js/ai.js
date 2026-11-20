// Vegam Racing: AI drivers. They follow the track, pick lanes, take the inside of corners,
// brake before bends, pass slower cars and use nitro on straights.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

export class Driver {
  constructor(car, track, skill) {
    this.car = car; this.track = track; this.skill = skill;
    this.profile = track.speedProfile(car.stats.grip * 0.86, car.stats.vmax, 20);
    this.lane = car.loc.lat || 0; this.laneGoal = this.lane;
    this.laneT = 1.5 + Math.random() * 2;
    this.stuck = 0;
  }

  update(dt, cars, rubber, running) {
    const c = this.car, t = this.track, N = t.N, inp = c.input;
    if (!running) { inp.throttle = 0; inp.brake = 0; inp.steer = 0; inp.nitro = false; inp.hand = false; return; }
    const i = c.loc.i, sp = c.speed, maxLane = t.half - 1.6;

    this.laneT -= dt;
    if (this.laneT <= 0) { this.laneT = 2 + Math.random() * 4; this.laneGoal = (Math.random() * 2 - 1) * maxLane * 0.55; }
    // lean to the inside of the next corner
    const sc = t.scurv[(i + Math.round(30 / t.seg)) % N];
    let goal = this.laneGoal + clamp(sc * 60, -1, 1) * maxLane * 0.45;

    // a slower car ahead in our lane: pass it, or follow if there's no room
    let follow = Infinity;
    for (const o of cars) {
      if (o === c) continue;
      let dp = o.prog - c.prog;
      if (dp < -N / 2) dp += N;
      const dm = dp * t.seg;
      if (dm > 0 && dm < 7 + sp * 0.45 && Math.abs(o.loc.lat - this.lane) < 2.5 && o.speed < sp + 1) {
        goal = o.loc.lat + (o.loc.lat > 0 ? -3.4 : 3.4);
        if (dm < 6 && Math.abs(o.loc.lat - c.loc.lat) < 1.9) follow = Math.min(follow, o.speed * 0.97);
        break;
      }
    }
    goal = clamp(goal, -maxLane, maxLane);
    this.lane += clamp(goal - this.lane, -4 * dt, 4 * dt);

    // steer toward a point ahead on our lane
    const look = Math.max(3, Math.round((7 + sp * 0.42) / t.seg));
    const j = (i + look) % N;
    const tx = t.px[j] + t.rx[j] * this.lane, tz = t.pz[j] + t.rz[j] * this.lane;
    const diff = wrapAngle(Math.atan2(tx - c.x, tz - c.z) - c.h);
    inp.steer = clamp(-diff * 2.6, -1, 1);

    // speed: the corner-safe speed for the road just ahead
    const k = (i + Math.round((4 + sp * 0.2) / t.seg)) % N;
    const target = Math.min(this.profile[k] * this.skill * rubber, follow);
    inp.throttle = sp < target ? 1 : 0;
    inp.brake = sp > target + 2.5 ? 1 : 0;
    inp.hand = false;
    const fast = c.stats.vmax * 0.97;
    const straight = this.profile[k] >= fast && this.profile[(i + Math.round(60 / t.seg)) % N] >= fast;
    inp.nitro = straight && sp > 25 && this.skill > 0.85 && (c.boosting || c.nitro > 0.3);

    // stuck against a wall or facing backwards: put it back on the road
    const dot = c.fx * t.tx[i] + c.fz * t.tz[i];
    if (sp < 2 || dot < -0.2) this.stuck += dt; else this.stuck = 0;
    if (this.stuck > 2.5) { this.stuck = 0; c.place(t, i + 2, clamp(this.lane, -maxLane, maxLane), false); }
  }
}
