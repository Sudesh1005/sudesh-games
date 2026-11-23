// Carrom Raja: coin clicks, cushion knocks, pocket drops and the striker flick, synthesised (no audio files).
export class CarromAudio {
  constructor() { this.ctx = null; this.on = true; this.budget = 0; try { this.on = localStorage.getItem('carrom-sound') !== 'off'; } catch (_) { /* ignore */ } }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.8 : 0; this.master.connect(ctx.destination);
    const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
  frame() { this.budget = 4; } // limit sounds per frame (a break shot makes dozens of clicks)
  burst(freq, q, vol, dur, type = 'bandpass', delay = 0) {
    if (!this.ctx || this.budget <= 0) return;
    this.budget--;
    const ctx = this.ctx, t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, vol, type = 'sine', delay = 0, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  hit(v) { const k = Math.min(1, v / 3); this.burst(2600 + k * 1400, 3.5, 0.12 + k * 0.6, 0.035); if (k > 0.25 && this.budget > 0) this.tone(1900 + k * 600, 0.025, 0.06 + k * 0.12, 'triangle'); }
  wall(v) { const k = Math.min(1, v / 3); this.burst(420 + k * 250, 1.2, 0.15 + k * 0.5, 0.07, 'lowpass'); }
  pocket() { this.budget = Math.max(this.budget, 1); this.burst(300, 1, 0.5, 0.14, 'lowpass'); this.tone(150, 0.16, 0.25, 'sine', 0.02, 0.6); }
  flick(p) { this.budget = Math.max(this.budget, 1); this.burst(1800, 1.5, 0.2 + p * 0.3, 0.05); }
  turn() { this.tone(660, 0.12, 0.08, 'sine'); this.tone(880, 0.16, 0.07, 'sine', 0.09); }
  foul() { this.tone(220, 0.3, 0.15, 'square', 0, 0.7); }
  queen() { this.tone(784, 0.15, 0.1, 'triangle'); this.tone(988, 0.15, 0.1, 'triangle', 0.1); this.tone(1318, 0.3, 0.1, 'triangle', 0.2); }
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 0.12, 'triangle', i * 0.14)); }
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('carrom-sound', this.on ? 'on' : 'off'); } catch (_) { /* ignore */ }
    if (this.master) this.master.gain.value = this.on ? 0.8 : 0;
  }
}
