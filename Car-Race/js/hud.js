// Vegam Racing: time formatting and the minimap.
export function fmtTime(s) {
  if (!isFinite(s) || s == null) return '--:--.---';
  const m = Math.floor(s / 60), r = s - m * 60;
  return m + ':' + r.toFixed(3).padStart(6, '0');
}
export const ordinal = (n) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
export const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class Minimap {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    const d = Math.min(2, devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(150 * d);
  }

  setTrack(t) {
    const S = this.c.width, pad = S * 0.09;
    this.bg.width = this.bg.height = S;
    const w = t.maxX - t.minX, h = t.maxZ - t.minZ, sc = (S - pad * 2) / Math.max(w, h);
    const ox = pad + (S - pad * 2 - w * sc) / 2, oy = pad + (S - pad * 2 - h * sc) / 2;
    // north-up with +z up and +x to the left, matching the chase camera's view
    this.map = (x, z) => [ox + (t.maxX - x) * sc, oy + (t.maxZ - z) * sc];
    const g = this.bg.getContext('2d');
    g.clearRect(0, 0, S, S);
    g.lineJoin = 'round';
    const path = () => { g.beginPath(); for (let i = 0; i <= t.N; i += 2) { const [x, y] = this.map(t.px[i % t.N], t.pz[i % t.N]); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
    path(); g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = S * 0.06; g.stroke();
    path(); g.strokeStyle = '#d9d6ee'; g.lineWidth = S * 0.032; g.stroke();
    const [sx, sy] = this.map(t.px[0], t.pz[0]);
    g.fillStyle = '#ffd23f'; g.fillRect(sx - S * 0.025, sy - S * 0.025, S * 0.05, S * 0.05);
  }

  draw(cars, player) {
    if (!this.map) return;
    const g = this.g, S = this.c.width;
    g.clearRect(0, 0, S, S);
    g.drawImage(this.bg, 0, 0);
    for (const c of cars) {
      if (c === player) continue;
      const [x, y] = this.map(c.x, c.z);
      g.fillStyle = hex(c.color); g.strokeStyle = '#000'; g.lineWidth = S * 0.012;
      g.beginPath(); g.arc(x, y, S * 0.028, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    if (player) {
      const [x, y] = this.map(player.x, player.z);
      g.save(); g.translate(x, y); g.rotate(-player.h);
      g.fillStyle = '#ffd23f'; g.strokeStyle = '#1a1236'; g.lineWidth = S * 0.014;
      g.beginPath(); g.moveTo(0, -S * 0.05); g.lineTo(S * 0.035, S * 0.035); g.lineTo(-S * 0.035, S * 0.035); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  }
}
