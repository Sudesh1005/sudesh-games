// All game audio is synthesised live with WebAudio: engine, horn, siren, effects and a procedural radio.
import { mulberry32 } from './world.js';

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('kadal-muted') === '1'; } catch (_) { /* ignore */ }
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(comp);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);

    const nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // engine: saw + square through a resonant low-pass
    const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 500; ef.Q.value = 2;
    const eg = c.createGain(); eg.gain.value = 0;
    const o1 = c.createOscillator(); o1.type = 'sawtooth';
    const o2 = c.createOscillator(); o2.type = 'square';
    const g2 = c.createGain(); g2.gain.value = 0.5;
    o1.connect(ef); o2.connect(g2); g2.connect(ef); ef.connect(eg); eg.connect(this.sfx);
    o1.start(); o2.start();
    this.eng = { o1, o2, ef, eg };

    // horn: two detuned squares
    const hf = c.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 1800;
    const hg = c.createGain(); hg.gain.value = 0;
    for (const f of [370, 466]) { const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(hf); o.start(); }
    hf.connect(hg); hg.connect(this.sfx);
    this.hornG = hg;

    // siren: a wailing triangle
    const so = c.createOscillator(); so.type = 'triangle';
    const sg = c.createGain(); sg.gain.value = 0;
    so.connect(sg); sg.connect(this.sfx); so.start();
    this.siren = { so, sg };

    this.radio = new Radio(this, c, this.music);
  }

  ok() { return this.ctx && this.ctx.state === 'running'; }
  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }
  toggleMute() {
    this.muted = !this.muted;
    try { localStorage.setItem('kadal-muted', this.muted ? '1' : '0'); } catch (_) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // s: { veh, throttle, horn, sirenDist, t }
  update(s) {
    if (!this.ok()) return;
    const now = this.ctx.currentTime, T = 0.06, e = this.eng;
    const v = s.veh;
    if (v && v.health > 0) {
      const frac = Math.min(1, Math.abs(v.speed) / v.cfg.maxSpeed);
      const g = Math.min(3, Math.floor(frac * 4)), within = frac * 4 - g;
      const base = { car: 42, sport: 52, auto: 78, police: 46, bike: 66 }[v.type] || 45;
      const f = base * (1 + within * 1.3 + g * 0.18);
      e.o1.frequency.setTargetAtTime(f, now, T);
      e.o2.frequency.setTargetAtTime(f * (v.type === 'auto' || v.type === 'bike' ? 1.5 : 0.5), now, T);
      e.ef.frequency.setTargetAtTime(350 + frac * 2200 + Math.abs(s.throttle) * 400, now, T);
      e.eg.gain.setTargetAtTime(0.05 + Math.abs(s.throttle) * 0.05 + frac * 0.03, now, T);
    } else e.eg.gain.setTargetAtTime(0, now, 0.1);
    this.hornG.gain.setTargetAtTime(s.horn ? 0.09 : 0, now, 0.02);
    if (s.sirenDist < 150) {
      const k = 1 - s.sirenDist / 150;
      this.siren.sg.gain.setTargetAtTime(0.05 * k * k + 0.004, now, 0.1);
      this.siren.so.frequency.setTargetAtTime(760 + 260 * Math.sin(s.t * 3.2), now, 0.02);
    } else this.siren.sg.gain.setTargetAtTime(0, now, 0.2);
    const radioOn = !!(v && this.radio.station.bpm);
    this.music.gain.setTargetAtTime(radioOn ? 0.3 : 0, now, 0.3);
    this.radio.tick(radioOn);
  }

  tone(f, start, dur, type = 'square', vol = 0.15, dest = this.sfx, slide = null, attack = 0.005) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, start);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest);
    o.start(start); o.stop(start + dur + 0.05);
  }
  noise(start, dur, vol, ftype, freq, dest = this.sfx, q = 1) {
    const c = this.ctx, s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(start, Math.random() * 0.5); s.stop(start + dur + 0.02);
  }

  punch(strong) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this.noise(t, 0.09, strong ? 0.7 : 0.45, 'lowpass', 1200);
    this.tone(strong ? 110 : 150, t, 0.1, 'sine', 0.5, this.sfx, 45);
  }
  whoosh() { if (this.ok()) this.noise(this.ctx.currentTime, 0.14, 0.12, 'bandpass', 900, this.sfx, 2); }
  hurt() { if (this.ok()) this.tone(220, this.ctx.currentTime, 0.14, 'square', 0.07, this.sfx, 110); }
  crash(i) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime, v = Math.min(0.9, i / 18);
    this.noise(t, 0.45, v, 'lowpass', 700);
    this.noise(t, 0.2, v * 0.5, 'highpass', 3000);
    this.tone(80, t, 0.3, 'sine', v * 0.6, this.sfx, 30);
  }
  seq(notes, gap, type = 'square', vol = 0.1, len = 0.12) {
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    notes.forEach((n, k) => this.tone(n, t + k * gap, k === notes.length - 1 ? len * 3 : len, type, vol));
  }
  coin() { this.seq([988, 1319], 0.07, 'square', 0.08, 0.08); }
  heal() { this.seq([523, 659, 784], 0.07, 'sine', 0.15); }
  checkpoint() { this.seq([660, 880], 0.08, 'triangle', 0.18); }
  success() { this.seq([523, 659, 784, 1047], 0.13, 'triangle', 0.2, 0.14); }
  fail() { this.seq([392, 330, 262], 0.18, 'sawtooth', 0.08, 0.16); }
  click() { this.seq([1200], 0.01, 'square', 0.05, 0.03); }

  nextStation() {
    if (!this.radio) return null;
    this.radio.next();
    if (this.ok()) this.noise(this.ctx.currentTime, 0.25, 0.12, 'bandpass', 2500, this.sfx, 0.5);
    return this.radio.station.name;
  }
  stationName() { return this.radio ? this.radio.station.name : STATIONS[0].name; }
}

/* ------------------------------------------------------------------ procedural radio */
const STATIONS = [
  { name: 'Kadal FM 91.2', bpm: 88, root: 50, style: 'chill', scale: [0, 2, 4, 7, 9], chords: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']] },
  { name: 'Beat Nagar 104', bpm: 124, root: 45, style: 'dance', scale: [0, 3, 5, 7, 10], chords: [[0, 'm'], [0, 'm'], [8, 'M'], [5, 'm']] },
  { name: 'Retro Waves 98.6', bpm: 108, root: 48, style: 'synth', scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 'm'], [5, 'M'], [10, 'M'], [3, 'M']] },
  { name: 'Raga Groove 100', bpm: 96, root: 52, style: 'raga', scale: [0, 1, 4, 5, 7, 8, 11], chords: [[0, 'M'], [1, 'M'], [0, 'M'], [5, 'm']] },
  { name: 'Radio Off' },
];
const DRUMS = {
  chill: { kick: [0, 10], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 8], bassLen: 6, bassType: 'triangle', pad: 'triangle' },
  dance: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], bass: [2, 6, 10, 14], bassLen: 1.5, bassType: 'sawtooth', pad: null },
  synth: { kick: [0, 6, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], bass: [0, 2, 4, 6, 8, 10, 12, 14], bassLen: 1.6, bassType: 'sawtooth', pad: 'sawtooth' },
  raga: { kick: [0, 7, 10], snare: [], hat: [2, 14], bass: [0, 7, 10], bassLen: 2, bassType: 'sine', pad: 'sine' },
};

class Radio {
  constructor(a, c, out) {
    this.a = a; this.c = c; this.out = out;
    this.idx = 0; this.station = STATIONS[0];
    this.song = (Math.random() * 1000) | 0;
    this.step = 0; this.bar = 0; this.next16 = 0; this.wasOn = false;
    this.newSong();
  }
  next() {
    this.idx = (this.idx + 1) % STATIONS.length;
    this.station = STATIONS[this.idx];
    this.song = (Math.random() * 1000) | 0;
    this.step = 0; this.bar = 0;
    this.next16 = this.c.currentTime + 0.3;
    this.newSong();
  }
  newSong() {
    const st = this.station;
    if (!st.bpm) return;
    const r = mulberry32(this.song * 31 + this.idx * 7 + 1);
    this.mel = [];
    for (let b = 0; b < 2; b++) {
      const arr = [];
      for (let s = 0; s < 16; s++) {
        const p = s % 4 === 0 ? 0.55 : s % 2 === 0 ? 0.35 : 0.12;
        arr.push(r() < p ? st.scale[(r() * st.scale.length) | 0] + (r() < 0.3 ? 12 : 0) : null);
      }
      this.mel.push(arr);
    }
    this.lead = st.style === 'chill' ? 'triangle' : st.style === 'raga' ? 'sine' : ['square', 'sawtooth'][(r() * 2) | 0];
    this.transpose = [0, 2, -3, 5][this.song % 4];
  }
  tick(on) {
    if (!on) { this.wasOn = false; return; }
    const c = this.c;
    if (!this.wasOn || this.next16 < c.currentTime - 0.3) { this.wasOn = true; this.next16 = c.currentTime + 0.05; }
    const spb = 60 / this.station.bpm / 4;
    while (this.next16 < c.currentTime + 0.25) {
      this.playStep(this.next16, spb);
      this.next16 += spb;
      if (++this.step >= 16) {
        this.step = 0;
        if (++this.bar >= 32) { this.bar = 0; this.song++; this.newSong(); }
      }
    }
  }
  playStep(t, spb) {
    const st = this.station, s = this.step, a = this.a, o = this.out, D = DRUMS[st.style];
    const root = st.root + this.transpose;
    const ch = st.chords[this.bar % st.chords.length];
    const croot = root + ch[0];
    const tri = (ch[1] === 'M' ? [0, 4, 7] : [0, 3, 7]).map((x) => croot + x);
    const intro = this.bar < 2;

    if (D.kick.includes(s) && !(intro && s !== 0)) a.tone(150, t, 0.25, 'sine', 0.6, o, 40, 0.002);
    if (D.snare.includes(s) && !intro) {
      a.noise(t, 0.14, 0.28, 'bandpass', 1800, o, 0.8);
      a.tone(190, t, 0.08, 'triangle', 0.12, o);
    }
    if (D.hat.includes(s)) a.noise(t, 0.04, s % 4 === 2 ? 0.2 : 0.1, 'highpass', 7500, o);
    if (!intro && D.bass.includes(s)) a.tone(NOTE(croot - 12), t, spb * D.bassLen, D.bassType, 0.2, o);

    if (s === 0 && D.pad) for (const n of tri) a.tone(NOTE(n), t, spb * 16, D.pad, st.style === 'synth' ? 0.025 : 0.045, o, null, 0.25);
    if (st.style === 'dance' && !intro && (s === 2 || s === 10)) for (const n of tri) a.tone(NOTE(n + 12), t, spb * 1.5, 'sawtooth', 0.035, o);
    if (st.style === 'raga') {
      if (s === 0) { a.tone(NOTE(root - 12), t, spb * 16, 'sine', 0.05, o, null, 0.3); a.tone(NOTE(root - 5), t, spb * 16, 'sine', 0.03, o, null, 0.3); }
      if (!intro && [3, 6, 11, 14].includes(s)) a.tone(s % 2 ? 330 : 240, t, 0.12, 'sine', 0.22, o, s % 2 ? 260 : 180, 0.002);
    }
    if (this.bar >= 4 && this.bar % 8 < 6) {
      const n = this.mel[this.bar % 2][s];
      if (n !== null) a.tone(NOTE(root + 12 + n), t, spb * 1.8, this.lead, 0.06, o, null, 0.01);
    }
  }
}
