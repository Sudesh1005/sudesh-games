// Target Shooter: mouse-look with pointer lock, keyboard, touch (move stick, drag to look, buttons) and gamepad.
export class Input {
  constructor(canvas, isTouch) {
    this.canvas = canvas; this.isTouch = isTouch;
    this.keys = new Set(); this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.fire = false; this.aimHeld = false; this.aimToggle = false;
    this.locked = false; this.onLockChange = null; this.onPress = null;
    this.joy = { x: 0, y: 0 };

    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) { this.pressed.add(e.code); if (this.onPress) this.onPress(e.code); }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.aimHeld = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.fire = true;
      if (e.button === 2) this.aimHeld = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; if (e.button === 2) this.aimHeld = false; });
    addEventListener('contextmenu', (e) => { if (this.locked || e.target === canvas) e.preventDefault(); });
    addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } });
    addEventListener('wheel', (e) => { if (this.locked) this.pressed.add(e.deltaY > 0 ? 'WheelDown' : 'WheelUp'); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.fire = false; this.aimHeld = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    if (isTouch) this.bindTouch();
    this.padPrev = [];
  }

  lock() {
    if (this.isTouch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  bindTouch() {
    const joy = document.getElementById('joy'), knob = document.getElementById('knob');
    let jid = null, jx = 0, jy = 0, lookId = null, lx = 0, ly = 0;
    joy.addEventListener('pointerdown', (e) => {
      jid = e.pointerId; const r = joy.getBoundingClientRect(); jx = r.left + r.width / 2; jy = r.top + r.height / 2;
      joy.setPointerCapture(e.pointerId); moveJoy(e);
    });
    const moveJoy = (e) => {
      if (e.pointerId !== jid) return;
      let x = (e.clientX - jx) / 50, y = (e.clientY - jy) / 50; const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      this.joy.x = x; this.joy.y = -y; knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
    };
    joy.addEventListener('pointermove', moveJoy);
    const endJoy = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
    // drag anywhere else (right side) to look
    this.canvas.addEventListener('pointerdown', (e) => { if (lookId === null && e.pointerType !== 'mouse') { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; } });
    addEventListener('pointermove', (e) => { if (e.pointerId === lookId) { this.dx += (e.clientX - lx) * 2.2; this.dy += (e.clientY - ly) * 2.2; lx = e.clientX; ly = e.clientY; } });
    const endLook = (e) => { if (e.pointerId === lookId) lookId = null; };
    addEventListener('pointerup', endLook); addEventListener('pointercancel', endLook);
    document.querySelectorAll('#tbtns [data-k]').forEach((b) => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); b.classList.add('on');
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (k === 'fire') this.fire = true;
        else if (k === 'aim') this.aimToggle = !this.aimToggle;
        else { this.pressed.add(k); this.keys.add(k); if (this.onPress) this.onPress(k); }
        // a fire button you can also drag to aim
        if (k === 'fire') { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
      });
      const off = (e) => { b.classList.remove('on'); if (k === 'fire') { this.fire = false; if (lookId === e.pointerId) lookId = null; } else this.keys.delete(k); };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
      b.addEventListener('pointermove', (e) => { if (k === 'fire' && e.pointerId === lookId) { this.dx += (e.clientX - lx) * 2.2; this.dy += (e.clientY - ly) * 2.2; lx = e.clientX; ly = e.clientY; } });
    });
  }

  // Snapshot of controls for this frame.
  read() {
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    let my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.joy.y;
    let fire = this.fire, aim = this.aimHeld || this.aimToggle;
    let jump = this.pressed.has('Space') || this.pressed.has('jump');
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight') || this.joy.y > 0.92;
    let lookX = this.dx, lookY = this.dy;
    const pad = navigator.getGamepads ? [...navigator.getGamepads()].find((p) => p && p.connected) : null;
    if (pad) {
      const dz = (v) => (Math.abs(v) > 0.15 ? v : 0), b = (n) => (pad.buttons[n] ? pad.buttons[n].value : 0);
      mx += dz(pad.axes[0] || 0); my -= dz(pad.axes[1] || 0);
      lookX += dz(pad.axes[2] || 0) * 14; lookY += dz(pad.axes[3] || 0) * 14;
      fire = fire || b(7) > 0.4; aim = aim || b(6) > 0.4; sprint = sprint || b(10) > 0.5;
      for (const [n, code] of [[0, 'Space'], [2, 'KeyR'], [3, 'Swap'], [9, 'Escape']]) {
        const down = b(n) > 0.5;
        if (down && !this.padPrev[n]) { this.pressed.add(code); if (code === 'Space') jump = true; if (this.onPress) this.onPress(code); }
        this.padPrev[n] = down;
      }
    }
    this.dx = 0; this.dy = 0;
    return { move: { x: Math.max(-1, Math.min(1, mx)), y: Math.max(-1, Math.min(1, my)) }, fire, aim, jump, sprint, lookX, lookY };
  }
  endFrame() { this.pressed.clear(); }
}
