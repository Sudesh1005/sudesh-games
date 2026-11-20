// Kaathu Cricket: bat knock, ball bounce, stumps crash, crowd murmur and cheers, all synthesised (no audio files).
export class CricketAudio {
  constructor() { this.ctx = null; this.on = true; try { this.on = localStorage.getItem('cricket-sound') !== 'off'; } catch (_) { /* ignore */ } }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.7 : 0; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // crowd: filtered noise, always on, swells for big moments
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    this.crowd = ctx.createGain(); this.crowd.gain.value = 0.05;
    src.connect(f); f.connect(this.crowd); this.crowd.connect(this.master); src.start();
  }
  burst(freq, q, vol, dur, type = 'bandpass', delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, vol, type = 'sine', delay = 0, slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  bat(q) { this.burst(1600 + q * 600, 2.5, 0.6 + q * 0.4, 0.09); this.tone(700 + q * 300, 0.08, 0.35 + q * 0.2, 'triangle'); }
  edge() { this.burst(2600, 4, 0.35, 0.05); }
  bounce() { this.burst(500, 1.5, 0.25, 0.06, 'lowpass'); }
  stumps() { this.burst(2200, 2, 0.6, 0.18); this.tone(1200, 0.12, 0.2, 'triangle', 0.02); this.burst(1500, 3, 0.4, 0.14, 'bandpass', 0.08); }
  catchSmack() { this.burst(900, 1.2, 0.4, 0.07, 'lowpass'); }
  cheer(k = 1, dur = 2.5) {
    if (!this.ctx) return;
    const g = this.crowd.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.05 + 0.32 * k, t + 0.25); g.linearRampToValueAtTime(0.05, t + dur);
  }
  groan() { this.cheer(0.35, 1.4); this.tone(180, 0.6, 0.08, 'sawtooth', 0, 0.7); }
  beep(f = 880) { this.tone(f, 0.12, 0.15, 'triangle'); }
  toss() { this.tone(1400, 0.05, 0.15, 'square'); this.tone(1800, 0.05, 0.12, 'square', 0.6); }
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('cricket-sound', this.on ? 'on' : 'off'); } catch (_) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.7 : 0, this.ctx.currentTime, 0.03);
    return this.on;
  }
}
