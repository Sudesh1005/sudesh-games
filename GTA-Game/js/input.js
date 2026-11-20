// Keyboard + mouse (pointer lock) + touch (virtual joystick, buttons, drag-to-look).
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Input {
  constructor(canvas, isTouch) {
    this.down = new Set();
    this.pressed = new Set();
    this.lookX = 0; this.lookY = 0;
    this.joy = { x: 0, y: 0 };
    this.locked = false;
    this.canvas = canvas;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code); this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());

    let dragging = false;
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 2) { this.down.add('Mouse2'); return; }
      if (e.button !== 0) return;
      if (this.locked) this.pressed.add('Mouse0');
      else dragging = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 2) this.down.delete('Mouse2'); else dragging = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (this.locked || dragging) { this.lookX += e.movementX; this.lookY += e.movementY; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    if (isTouch) this.setupTouch(canvas);
  }

  lock() {
    try {
      const r = this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch (_) { /* not supported */ }
  }

  setupTouch(canvas) {
    const joy = document.getElementById('joy'), knob = document.getElementById('knob');
    let joyId = null, cx = 0, cy = 0, R = 50;
    let lookId = null, lx = 0, ly = 0;
    const moveJoy = (t) => {
      let dx = (t.clientX - cx) / R, dy = (t.clientY - cy) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.joy.x = dx; this.joy.y = -dy;
      knob.style.transform = `translate(${dx * R * 0.6}px, ${dy * R * 0.6}px)`;
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2;
      moveJoy(t);
    }, { passive: false });
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) moveJoy(t);
        else if (t.identifier === lookId) {
          this.lookX += (t.clientX - lx) * 1.4; this.lookY += (t.clientY - ly) * 1.4;
          lx = t.clientX; ly = t.clientY;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { joyId = null; this.joy.x = this.joy.y = 0; knob.style.transform = ''; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    document.querySelectorAll('[data-key]').forEach((b) => {
      const code = b.dataset.key;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.down.add(code); this.pressed.add(code); b.classList.add('on'); }, { passive: false });
      const up = (e) => { e.preventDefault(); this.down.delete(code); b.classList.remove('on'); };
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
    });
  }

  has(...codes) { for (const c of codes) if (this.down.has(c)) return true; return false; }
  hit(...codes) { for (const c of codes) if (this.pressed.has(c)) return true; return false; }

  // normalize=false keeps full throttle while steering on keyboard
  move(normalize = true) {
    let x = 0, y = 0;
    if (this.has('KeyW', 'ArrowUp')) y += 1;
    if (this.has('KeyS', 'ArrowDown')) y -= 1;
    if (this.has('KeyD', 'ArrowRight')) x += 1;
    if (this.has('KeyA', 'ArrowLeft')) x -= 1;
    const l = Math.hypot(x, y);
    if (normalize && l > 1) { x /= l; y /= l; }
    x += this.joy.x; y += this.joy.y;
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }
  consumeLook() {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = this.lookY = 0;
    return r;
  }
  endFrame() { this.pressed.clear(); }
}
