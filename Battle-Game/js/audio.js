// Theevu Yudham: all the sounds, synthesised (no audio files). Other people's shots and footsteps
// come from their direction (left / right) and get quieter and duller with distance. The sea, the
// wind and the plane's engines play in the background.
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
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // background: surf (low rumble that swells) and wind (higher hiss)
    const loop = (freq, type, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return g;
    };
    this.sea = loop(380, 'lowpass', 0.7);
    this.windG = loop(900, 'bandpass', 0.4);
    // the plane: two detuned saws through a low-pass
    this.engG = ctx.createGain(); this.engG.gain.value = 0;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 320;
    for (const f of [68, 71.5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(ef); o.start(); }
    ef.connect(this.engG); this.engG.connect(this.master);
  }
  out(pan) {
    if (!pan || !this.ctx.createStereoPanner) return this.master;
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(this.master);
    return p;
  }
  // filtered noise burst
  burst(freq, q, vol, dur, type = 'lowpass', delay = 0, pan = 0) {
    if (!this.ctx || vol < 0.003) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out(pan)); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  tone(freq, dur, vol, type = 'sine', slide = 0, delay = 0, pan = 0) {
    if (!this.ctx || vol < 0.003) return;
    const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.out(pan)); o.start(t); o.stop(t + dur + 0.02);
  }
  shot(id) {
    if (id === 'pistol') { this.burst(2400, 0.8, 0.7, 0.12); this.tone(160, 0.1, 0.5, 'sine', 0.4); }
    else if (id === 'smg') { this.burst(3400, 0.8, 0.45, 0.07); this.tone(150, 0.06, 0.3, 'sine', 0.5); }
    else if (id === 'sniper') { this.burst(2000, 0.6, 1.0, 0.35); this.tone(70, 0.45, 0.8, 'sine', 0.35); this.burst(4500, 1, 0.4, 0.06); }
    else if (id === 'rifle') { this.burst(3000, 0.7, 0.55, 0.09); this.burst(900, 1, 0.4, 0.15); this.tone(120, 0.08, 0.4, 'sine', 0.5); }
    else { this.burst(1400, 0.6, 0.9, 0.3); this.tone(90, 0.25, 0.7, 'sine', 0.4); this.burst(500, 1, 0.3, 0.2, 'bandpass', 0.35); }
  }
  // someone else's shot: from their side, quieter and duller far away (with a late echo)
  far(id, dist, pan = 0) {
    const k = Math.max(0.04, 1 - dist / 280), dull = Math.max(500, 3000 - dist * 12);
    if (id === 'sniper') { this.burst(dull, 0.6, 0.8 * k, 0.3, 'lowpass', 0, pan); this.tone(70, 0.35, 0.5 * k, 'sine', 0.4, 0, pan); }
    else if (id === 'pistol' || id === 'smg') this.burst(dull, 0.7, 0.45 * k, 0.1, 'lowpass', 0, pan);
    else if (id === 'shotgun') { this.burst(dull * 0.6, 0.6, 0.7 * k, 0.25, 'lowpass', 0, pan); this.tone(90, 0.2, 0.4 * k, 'sine', 0.4, 0, pan); }
    else { this.burst(dull, 0.7, 0.5 * k, 0.12, 'lowpass', 0, pan); this.tone(110, 0.1, 0.3 * k, 'sine', 0.5, 0, pan); }
    if (dist > 60) this.burst(dull * 0.5, 0.5, 0.15 * k, 0.4, 'lowpass', 0.12 + dist / 1000, pan * 0.5);
  }
  whiz(pan) { this.burst(3500, 2.5, 0.22, 0.12, 'bandpass', 0, pan); this.tone(2600, 0.1, 0.05, 'sine', 0.5, 0, pan); }
  marker(head) { this.tone(head ? 2200 : 1500, 0.05, 0.18, 'square'); if (head) this.tone(2900, 0.06, 0.12, 'square', 1, 0.04); }
  kill() { this.tone(660, 0.08, 0.2, 'square'); this.tone(990, 0.12, 0.18, 'square', 1, 0.07); }
  step(k = 1, pan = 0) { this.burst(380 + Math.random() * 80, 1.2, 0.07 * k, 0.05, 'lowpass', 0, pan); }
  land() { this.burst(260, 1, 0.25, 0.1); }
  wind(k) { this.burst(500 + k * 600, 0.5, 0.06 + k * 0.12, 0.25); }
  chute() { this.burst(900, 0.6, 0.6, 0.35); this.tone(140, 0.25, 0.25, 'sine', 0.6); }
  heal() { this.tone(523, 0.12, 0.15, 'triangle'); this.tone(784, 0.2, 0.15, 'triangle', 1, 0.1); }
  zoneTick() { this.tone(300, 0.08, 0.12, 'square', 0.8); }
  alarm() { for (let i = 0; i < 3; i++) { this.tone(880, 0.18, 0.12, 'square', 0.9, i * 0.32); this.tone(660, 0.14, 0.1, 'square', 1, i * 0.32 + 0.16); } }
  heartbeat() { this.tone(60, 0.12, 0.35, 'sine', 0.7); this.tone(55, 0.12, 0.28, 'sine', 0.7, 0.22); }
  splash() { this.burst(1200, 0.6, 0.2, 0.25, 'bandpass'); }
  empty() { this.tone(1800, 0.03, 0.2, 'square'); }
  reload(dur) { this.burst(2500, 3, 0.25, 0.05, 'bandpass', 0.1); this.burst(1800, 3, 0.3, 0.06, 'bandpass', dur * 0.55); this.burst(3200, 4, 0.3, 0.05, 'bandpass', dur * 0.85); }
  swap() { this.burst(2200, 3, 0.2, 0.05, 'bandpass'); }
  ding() { this.tone(880, 0.25, 0.25, 'triangle'); this.tone(1320, 0.3, 0.2, 'triangle', 1, 0.08); }
  hurt() { this.burst(400, 1, 0.6, 0.2); this.tone(110, 0.2, 0.4, 'sine', 0.6); }
  boom(k = 1, pan = 0) { this.burst(700, 0.7, 0.9 * k, 0.7, 'lowpass', 0, pan); this.tone(70, 0.6, 0.7 * k, 'sine', 0.4, 0, pan); }
  pickup() { this.tone(660, 0.1, 0.2, 'triangle'); this.tone(990, 0.15, 0.2, 'triangle', 1, 0.08); }
  // background levels, 0..1 (called every frame)
  ambience(sea, wind, engine) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sea.gain.setTargetAtTime(0.16 * sea * (0.7 + 0.3 * Math.sin(t * 0.5)), t, 0.4);
    this.windG.gain.setTargetAtTime(0.03 + 0.1 * wind, t, 0.3);
    this.engG.gain.setTargetAtTime(0.09 * engine, t, 0.3);
  }
  toggle() {
    this.on = !this.on;
    try { localStorage.setItem('battle-sound', this.on ? 'on' : 'off'); } catch (_) { /* ignore */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.on ? 0.6 : 0, this.ctx.currentTime, 0.03);
    return this.on;
  }
}
