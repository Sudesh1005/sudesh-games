// HUD: clock, money, wanted stars, health, speedometer, mission panel, messages and the rotating minimap.
export class HUD {
  constructor(map) {
    const $ = (id) => document.getElementById(id);
    this.el = {
      hud: $('hud'), clock: $('clock'), money: $('money'), stars: $('stars'), hp: $('hp'),
      vbar: $('vbar'), vhp: $('vhp'), speedo: $('speedo'), spd: $('spd'),
      mission: $('mission'), mt: $('m-title'), mo: $('m-obj'), mtm: $('m-timer'),
      hint: $('hint'), toast: $('toast'), area: $('area'), big: $('big'), bt: $('big-title'), bs: $('big-sub'),
    };
    for (let i = 0; i < 5; i++) { const s = document.createElement('span'); s.textContent = '★'; this.el.stars.appendChild(s); }
    this.starEls = [...this.el.stars.children];
    this.mini = $('minimap');
    this.ctx = this.mini.getContext('2d');
    this.map = map;
    this.cache = {};
    this.toastT = 0; this.bigT = 0; this.areaT = 0;
  }
  set(key, el, val, prop = 'textContent') {
    if (this.cache[key] !== val) { this.cache[key] = val; el[prop] = val; }
  }
  show(v) { this.el.hud.classList.toggle('hidden', !v); }
  radio(name) {
    const el = document.getElementById('radio');
    this.set('radio', el, name ? '♪ ' + name : '');
    el.classList.toggle('hidden', !name);
  }
  toast(text, sec = 2.5) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('show');
    this.toastT = sec;
  }
  big(title, sub, color = '#ffd23f', sec = 3.2) {
    const { big, bt, bs } = this.el;
    bt.textContent = title; bt.style.color = color; bs.textContent = sub || '';
    big.classList.remove('hidden', 'pop'); void big.offsetWidth; big.classList.add('pop');
    this.bigT = sec;
  }
  area(name) {
    this.el.area.textContent = name;
    this.el.area.classList.add('show');
    this.areaT = 3;
  }
  hint(text) {
    this.set('hint', this.el.hint, text || '');
    this.el.hint.classList.toggle('hidden', !text);
  }
  mission(m) {
    if (!m) { this.el.mission.classList.add('hidden'); return; }
    this.el.mission.classList.remove('hidden');
    this.set('mt', this.el.mt, m.title);
    this.set('mo', this.el.mo, m.obj);
    const t = Math.max(0, Math.ceil(m.time));
    this.set('mtm', this.el.mtm, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
    this.el.mtm.classList.toggle('low', t <= 15);
    this.el.mission.style.borderColor = m.color;
  }
  update(dt, s) {
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.el.toast.classList.remove('show');
    if (this.bigT > 0 && (this.bigT -= dt) <= 0) this.el.big.classList.add('hidden');
    if (this.areaT > 0 && (this.areaT -= dt) <= 0) this.el.area.classList.remove('show');

    const mins = Math.floor(s.time) % 1440;
    this.set('clock', this.el.clock, `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
    this.set('money', this.el.money, '₹' + Math.floor(s.money).toLocaleString('en-IN'));
    if (this.cache.stars !== s.stars) {
      this.cache.stars = s.stars;
      this.starEls.forEach((e, i) => e.classList.toggle('on', i < s.stars));
    }
    this.el.stars.classList.toggle('flash', s.chased);
    this.set('hp', this.el.hp.style, Math.max(0, s.health).toFixed(0) + '%', 'width');
    const inCar = !!s.veh;
    this.el.vbar.classList.toggle('hidden', !inCar);
    this.el.speedo.classList.toggle('hidden', !inCar);
    if (inCar) {
      this.set('vhp', this.el.vhp.style, Math.max(0, s.veh.hp).toFixed(0) + '%', 'width');
      this.set('spd', this.el.spd, String(Math.round(s.veh.kmh)));
    }
    this.drawMini(s);
  }
  drawMini(s) {
    const c = this.ctx, W = this.mini.width, R = W / 2, k = s.veh ? 0.5 : 0.85;
    const th = s.yaw - Math.PI;
    c.clearRect(0, 0, W, W);
    c.save();
    c.beginPath(); c.arc(R, R, R - 2, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#56733f'; c.fillRect(0, 0, W, W);
    c.translate(R, R); c.rotate(th); c.scale(k, k); c.translate(-s.px, -s.pz);
    c.drawImage(this.map.canvas, this.map.minX, this.map.minZ);
    c.restore();

    const cos = Math.cos(th), sin = Math.sin(th), lim = R - 9;
    for (const b of s.blips) {
      const dx = (b.x - s.px) * k, dz = (b.z - s.pz) * k;
      let sx = dx * cos - dz * sin, sy = dx * sin + dz * cos;
      const d = Math.hypot(sx, sy);
      if (d > lim) { if (!b.edge) continue; sx *= lim / d; sy *= lim / d; }
      c.beginPath(); c.arc(R + sx, R + sy, b.r || 4, 0, Math.PI * 2);
      c.fillStyle = b.color; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke();
      if (b.label) {
        c.fillStyle = '#111'; c.font = 'bold 9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(b.label, R + sx, R + sy + 0.5);
      }
    }
    // player arrow
    c.save();
    c.translate(R, R); c.rotate(th + Math.PI - s.heading);
    c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath();
    c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#111'; c.stroke();
    c.restore();
    // north marker
    const nx = R + Math.sin(th) * (R - 11), ny = R - Math.cos(th) * (R - 11);
    c.beginPath(); c.arc(nx, ny, 8, 0, Math.PI * 2); c.fillStyle = '#111'; c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', nx, ny + 0.5);
  }
}
