// Theevu Yudham: gunshots, reloads, hit markers, footsteps and pickups, all synthesised (no audio files).
export class BattleAudio {
  constructor() {
    this.ctx = null; this.on = true;
    try { this.on = localStorage.getItem('battle-sound') !== 'off'; } catch (_) { /* ignore */ }
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.on ? 0.6 : 0;
    const comp = ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(ctx.destination);
    const len = ctx.sampleRate, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
  }
  // filtered noise burst
  burst(freq, q, vol, dur, type = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, vol, type = 'sine', slide = 0, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  shot(id) {
    if (id === 'pistol') { this.burst(2400, 0.8, 0.7, 0.12); this.tone(160, 0.1, 0.5, 'sine', 0.4); }
    else if (id === 'rifle') { this.burst(3000, 0.7, 0.55, 0.09); this.burst(900, 1, 0.4, 0.15); this.tone(120, 0.08, 0.4, 'sine', 0.5); }
    else { this.burst(1400, 0.6, 0.9, 0.3); this.tone(90, 0.25, 0.7, 'sine', 0.4); this.burst(500, 1, 0.3, 0.2, 'bandpass', 0.35); }
  }
  // a shot from someone else: quieter and duller with distance
  far(id, dist) {
    const k = Math.max(0.05, 1 - dist / 260);
    if (id === 'pistol') this.burst(1200, 0.7, 0.45 * k, 0.12); else { this.burst(1500 - dist * 3, 0.7, 0.5 * k, 0.12); this.tone(110, 0.1, 0.3 * k, 'sine', 0.5); }
  }
  marker(head) { this.tone(head ? 2200 : 1500, 0.05, 0.18, 'square'); if (head) this.tone(2900, 0.06, 0.12, 'square', 1, 0.04); }
  step(k = 1) { this.burst(380, 1.2, 0.07 * k, 0.05); }
  land() { this.burst(260, 1, 0.25, 0.1); }
  splash() { this.burst(1200, 0.6, 0.2, 0.25, 'bandpass'); }
  empty() { this.tone(1800, 0.03, 0.2, 'square'); }
  reload(dur) { this.burst(2500, 3, 0.25, 0.05, 'bandpass', 0.1); this.burst(1800, 3, 0.3, 0.06, 'bandpass', dur * 0.55); this.burst(3200, 4, 0.3, 0.05, 'bandpass', dur * 0.85); }
  swap() { this.burst(2200, 3, 0.2, 0.05, 'bandpass'); }
  hit(bull) { this.tone(bull ? 1760 : 1200, 0.12, 0.25, 'triangle'); if (bull) this.tone(2640, 0.18, 0.18, 'triangle', 1, 0.06); }
  ding() { this.tone(880, 0.25, 0.25, 'triangle'); this.tone(1320, 0.3, 0.2, 'triangle', 1, 0.08); }
  bad() { this.tone(220, 0.3, 0.3, 'square', 0.6); }
  tick() { this.tone(1400, 0.04, 0.12, 'square'); }
  thud() { this.burst(300, 1, 0.5, 0.15); }
  zap() { this.tone(900, 0.18, 0.12, 'sawtooth', 0.3); }
  hurt() { this.burst(400, 1, 0.6, 0.2); this.tone(110, 0.2, 0.4, 'sine', 0.6); }
  boom(k = 1) { this.burst(700, 0.7, 0.9 * k, 0.7); this.tone(70, 0.6, 0.7 * k, 'sine', 0.4); }
  pickup() { this.tone(660, 0.1, 0.2, 'triangle'); this.tone(990, 0.15, 0.2, 'triangle', 1, 0.08); }
  horn() { this.tone(330, 0.5, 0.18, 'sawtooth'); this.tone(415, 0.5, 0.14, 'sawtooth', 1, 0.15); }
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('battle-sound', this.on ? 'on' : 'off'); } catch (_) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.6 : 0, this.ctx.currentTime, 0.03);
    return this.on;
  }
}
