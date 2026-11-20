// Vegam Racing: engine, tyre skid, wind, crash and countdown sounds, all synthesised (no audio files).
export class RaceAudio {
  constructor() {
    this.ctx = null;
    this.on = true;
    try { this.on = localStorage.getItem('vegam-sound') !== 'off'; } catch (_) { /* ignore */ }
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.7 : 0; this.master.connect(ctx.destination);

    this.eFilter = ctx.createBiquadFilter(); this.eFilter.type = 'lowpass'; this.eFilter.frequency.value = 600; this.eFilter.Q.value = 3;
    this.eGain = ctx.createGain(); this.eGain.gain.value = 0;
    this.eFilter.connect(this.eGain); this.eGain.connect(this.master);
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth'; this.o1.frequency.value = 50;
    this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o2.frequency.value = 25;
    const g2 = ctx.createGain(); g2.gain.value = 0.45;
    this.o1.connect(this.eFilter); this.o2.connect(g2); g2.connect(this.eFilter);
    this.o1.start(); this.o2.start();

    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = (type, freq, q) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return g;
    };
    this.sGain = loop('bandpass', 1150, 2.5);
    this.wGain = loop('lowpass', 520, 0.7);
  }

  // r = speed / top speed (0..1+)
  update(r, throttle, skid, boost) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gear = Math.min(4, Math.floor(r * 5));
    const within = r < 0.01 ? 0 : r * 5 - gear;
    const rpm = Math.min(1.1, 0.16 + within * 0.72 + throttle * 0.12);
    const f = 40 + rpm * 150 + gear * 6;
    this.o1.frequency.setTargetAtTime(f, t, 0.04);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    this.eFilter.frequency.setTargetAtTime(300 + rpm * 1700 + (boost ? 900 : 0), t, 0.05);
    this.eGain.gain.setTargetAtTime(0.05 + throttle * 0.07, t, 0.05);
    this.sGain.gain.setTargetAtTime(skid * 0.2, t, 0.05);
    this.wGain.gain.setTargetAtTime(Math.min(1, r) * 0.1 + (boost ? 0.1 : 0), t, 0.1);
  }

  silence() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [this.eGain, this.sGain, this.wGain]) g.gain.setTargetAtTime(0, t, 0.05);
  }

  beep(freq, dur = 0.18, vol = 0.22) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  crash(k) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 700 + k * 900;
    g.gain.setValueAtTime(0.55 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t, Math.random()); src.stop(t + 0.45);
  }

  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('vegam-sound', this.on ? 'on' : 'off'); } catch (_) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.7 : 0, this.ctx.currentTime, 0.03);
    return this.on;
  }
}
