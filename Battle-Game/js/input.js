// Theevu Yudham: controls. Computer: pointer-lock mouse look, WASD, click to fire, right-click to aim.
// Phones: move stick on the left, drag anywhere on the right to look, fire / aim / jump / crouch / reload buttons.
export class Input {
  constructor(canvas, isTouch) {
    this.canvas = canvas; this.isTouch = isTouch;
    this.keys = new Set(); this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.fire = false; this.aimHeld = false; this.aimToggle = false;
    this.locked = false; this.onLockChange = null; this.onPress = null;
    this.joy = { x: 0, y: 0 }; this.crouchToggle = false;

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
    addEventListener('wheel', (e) => { if (this.locked) this.pressed.add('Swap'); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.fire = false; this.aimHeld = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    if (isTouch) this.bindTouch();
  }

  lock() {
    if (this.isTouch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  bindTouch() {
    const joy = document.getElementById('joy'), knob = document.getElementById('knob');
    let jid = null, jx = 0, jy = 0;
    const looks = new Map(); // pointerId -> last x, y
    const SENS = 2.4;
    joy.addEventListener('pointerdown', (e) => {
      jid = e.pointerId; const r = joy.getBoundingClientRect(); jx = r.left + r.width / 2; jy = r.top + r.height / 2;
      joy.setPointerCapture(e.pointerId); moveJoy(e);
    });
    const moveJoy = (e) => {
      if (e.pointerId !== jid) return;
      let x = (e.clientX - jx) / 55, y = (e.clientY - jy) / 55; const l = Math.hypot(x, y);
      if (l > 1.25) { x = (x / l) * 1.25; y = (y / l) * 1.25; }   // past the rim = sprint
      this.joy.x = x; this.joy.y = -y;
      const kl = Math.min(1, l); knob.style.transform = `translate(${(x / Math.max(l, 1e-6)) * kl * 44}px, ${(y / Math.max(l, 1e-6)) * kl * 44}px)`;
    };
    joy.addEventListener('pointermove', moveJoy);
    const endJoy = (e) => { if (e.pointerId !== jid) return; jid = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; };
    joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
    // drag on the right side of the screen to look around
    this.canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') looks.set(e.pointerId, [e.clientX, e.clientY]); });
    addEventListener('pointermove', (e) => {
      const l = looks.get(e.pointerId); if (!l) return;
      this.dx += (e.clientX - l[0]) * SENS; this.dy += (e.clientY - l[1]) * SENS; l[0] = e.clientX; l[1] = e.clientY;
    });
    const endLook = (e) => looks.delete(e.pointerId);
    addEventListener('pointerup', endLook); addEventListener('pointercancel', endLook);
    document.querySelectorAll('#tbtns [data-k]').forEach((b) => {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); b.classList.add('on');
        try { b.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        if (k === 'fire') { this.fire = true; looks.set(e.pointerId, [e.clientX, e.clientY]); } // drag the fire button to aim while shooting
        else if (k === 'aim') this.aimToggle = !this.aimToggle;
        else if (k === 'crouch') this.crouchToggle = !this.crouchToggle;
        else { this.pressed.add(k); if (this.onPress) this.onPress(k); }
      });
      const off = (e) => { b.classList.remove('on'); if (k === 'fire') { this.fire = false; looks.delete(e.pointerId); } };
      b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
      b.addEventListener('pointermove', (e) => {
        const l = looks.get(e.pointerId); if (!l || k !== 'fire') return;
        this.dx += (e.clientX - l[0]) * SENS; this.dy += (e.clientY - l[1]) * SENS; l[0] = e.clientX; l[1] = e.clientY;
      });
    });
  }

  // Snapshot of the controls for this frame.
  read() {
    const k = this.keys;
    const mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.joy.x;
    const my = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) + this.joy.y;
    const joyLen = Math.hypot(this.joy.x, this.joy.y);
    const sprint = k.has('ShiftLeft') || k.has('ShiftRight') || joyLen > 1.08;
    const walk = k.has('AltLeft') || (joyLen > 0.05 && joyLen < 0.45);
    if (k.has('KeyC') && this.pressed.has('KeyC')) this.crouchToggle = !this.crouchToggle;
    const out = {
      mx: Math.max(-1, Math.min(1, mx)), my: Math.max(-1, Math.min(1, my)),
      fire: this.fire, aim: this.aimHeld || this.aimToggle, sprint, walk,
      jump: this.pressed.has('Space') || this.pressed.has('jump'),
      crouch: this.crouchToggle || k.has('ControlLeft'),
      reload: this.pressed.has('KeyR') || this.pressed.has('reload'),
      swap: this.pressed.has('Swap') || this.pressed.has('swap') || this.pressed.has('KeyQ'),
      slot1: this.pressed.has('Digit1'), slot2: this.pressed.has('Digit2'),
      lookX: this.dx, lookY: this.dy,
    };
    this.dx = 0; this.dy = 0;
    return out;
  }
  endFrame() { this.pressed.clear(); }
}
