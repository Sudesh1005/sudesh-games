// Vegam Racing: keyboard, touch buttons and gamepad.
export class Input {
  constructor() {
    this.keys = new Set();
    this.t = { left: 0, right: 0, gas: 0, brake: 0, nitro: 0, drift: 0 };
    this.onPress = null;
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat && this.onPress) this.onPress(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); for (const k in this.t) this.t[k] = 0; });

    document.querySelectorAll('[data-t]').forEach((b) => {
      const k = b.dataset.t;
      const on = (e) => { e.preventDefault(); this.t[k] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } };
      const off = () => { this.t[k] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on);
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    this.padPrev = [];
  }

  read(inp) {
    const k = this.keys, t = this.t;
    let throttle = k.has('KeyW') || k.has('ArrowUp') || t.gas ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') || t.brake ? 1 : 0;
    let steer = (k.has('KeyD') || k.has('ArrowRight') || t.right ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') || t.left ? 1 : 0);
    let hand = k.has('Space') || !!t.drift;
    let nitro = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyN') || !!t.nitro;
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p && p.connected) : null;
    if (pad) {
      const b = (n) => (pad.buttons[n] ? pad.buttons[n].value : 0);
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = ax;
      throttle = Math.max(throttle, b(7), b(0));
      brake = Math.max(brake, b(6) > 0.2 ? 1 : 0);
      hand = hand || b(2) > 0.5;
      nitro = nitro || b(1) > 0.5 || b(5) > 0.5;
      // Start = pause, Y = camera
      for (const [n, code] of [[9, 'Escape'], [3, 'KeyC']]) {
        const down = b(n) > 0.5;
        if (down && !this.padPrev[n] && this.onPress) this.onPress(code);
        this.padPrev[n] = down;
      }
    }
    inp.throttle = throttle; inp.brake = brake; inp.steer = steer; inp.hand = hand; inp.nitro = nitro;
  }
}
