// Vegam Racing: online rooms over WebRTC using PeerJS.
// The host's browser runs the room: it gets a short code, others join with that code and their name.
// Each player drives their own car and sends its position ~15 times a second; the host relays everyone's to everyone.
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'vegam-race-room-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L, so codes are easy to read out
export const MAX_PLAYERS = 6;

let loading = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL; s.async = true;
      s.onload = resolve;
      s.onerror = () => { loading = null; reject(new Error('Could not load the online play library. Check your internet connection.')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

export const makeCode = () => Array.from({ length: 6 }, () => ALPHA[(Math.random() * ALPHA.length) | 0]).join('');
export const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const cleanName = (s) => String(s || '').replace(/[<>&"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);

function friendly(e) {
  const type = e && e.type;
  if (type === 'peer-unavailable') return new Error('Room not found. Check the code, or ask your friend to create a new room.');
  if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return new Error('Could not reach the online server. Check your internet connection and try again.');
  if (type === 'browser-incompatible') return new Error('This browser does not support online play.');
  if (type === 'webrtc') return new Error('Could not connect to the other player. Some networks (office or college Wi-Fi, some mobile data) block this.');
  return e instanceof Error ? e : new Error(String((e && e.message) || e || 'Connection error'));
}

export class Room {
  // h: { onLobby(players, info, state), onStart(msg), onState(id, s), onLeave(id, name), onClosed(reason) }
  constructor(h) {
    this.h = h; this.peer = null; this.isHost = false; this.code = ''; this.me = '';
    this.players = []; this.info = {}; this.state = 'lobby';
    this.conns = new Map(); this.hostConn = null; this.latest = {}; this.lastN = {}; this.closed = false;
  }

  openPeer(id) {
    return new Promise((resolve, reject) => {
      const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
      const fail = (e) => { p.destroy(); reject(e); };
      p.once('error', fail);
      p.once('open', () => {
        p.off('error', fail);
        p.on('error', (e) => this.peerError(e));
        this.peer = p;
        resolve();
      });
    });
  }

  peerError(e) {
    if (this.closed) return;
    if (e.type === 'peer-unavailable' && this.joinReject) { this.joinReject(friendly(e)); return; }
    if (e.type === 'network' || e.type === 'disconnected') return; // the PeerJS server dropped; existing games keep working
    console.warn('PeerJS:', e.type || e);
  }

  /* ---------------------------------------------------------------- host */
  async create(profile) {
    await loadPeerJS();
    this.isHost = true;
    for (let tries = 0; ; tries++) {
      const code = makeCode();
      try { await this.openPeer(PREFIX + code); this.code = code; break; }
      catch (e) { if (e.type !== 'unavailable-id' || tries >= 4) throw friendly(e); }
    }
    this.me = this.peer.id;
    this.players = [{ id: this.me, name: profile.name, car: profile.car, paint: profile.paint, host: true }];
    this.peer.on('connection', (c) => this.accept(c));
    this.peer.on('disconnected', () => { if (!this.closed) try { this.peer.reconnect(); } catch (_) { /* ignore */ } });
    this.lobby();
    return this.code;
  }

  accept(c) {
    c.on('data', (m) => this.fromClient(c, m));
    c.on('close', () => this.drop(c.peer));
    c.on('error', () => this.drop(c.peer));
  }

  fromClient(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.state !== 'lobby') return this.reject(c, 'A race is running in this room. Try again when it finishes.');
      if (this.players.length >= MAX_PLAYERS) return this.reject(c, `This room is full (${MAX_PLAYERS} players).`);
      let name = cleanName(m.name) || 'Player';
      const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
      for (let k = 2; taken.has(name.toLowerCase()); k++) name = cleanName(m.name).slice(0, 11) + ' ' + k;
      this.conns.set(c.peer, c);
      this.players.push({ id: c.peer, name, car: m.car | 0, paint: m.paint | 0, host: false });
      this.lobby();
    } else if (m.t === 'profile') {
      const p = this.players.find((x) => x.id === c.peer);
      if (p) { p.car = m.car | 0; p.paint = m.paint | 0; this.lobby(); }
    } else if (m.t === 's' && m.s) {
      this.gotState(c.peer, m.s);
    }
  }

  reject(c, reason) {
    try { c.send({ t: 'reject', reason }); } catch (_) { /* ignore */ }
    setTimeout(() => c.close(), 400);
  }

  drop(id) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    const p = this.players.find((x) => x.id === id);
    this.players = this.players.filter((x) => x.id !== id);
    delete this.latest[id]; delete this.lastN[id];
    this.lobby();
    if (p) this.h.onLeave(id, p.name);
  }

  send(c, m) { if (c && c.open) try { c.send(m); } catch (_) { /* ignore */ } }

  lobby() {
    const m = { t: 'lobby', players: this.players, info: this.info, state: this.state };
    for (const c of this.conns.values()) this.send(c, m);
    this.h.onLobby(this.players, this.info, this.state);
  }

  setInfo(info) { this.info = info; this.lobby(); }

  // Host: start a race for everyone in the lobby. grid = players in starting order.
  start(grid) {
    this.state = 'racing'; this.latest = {}; this.lastN = {};
    const m = { t: 'start', grid, track: this.info.track, laps: this.info.laps };
    for (const c of this.conns.values()) this.send(c, m);
    this.lobby();
    this.h.onStart(m);
  }

  backToLobby() { if (this.isHost && this.state !== 'lobby') { this.state = 'lobby'; this.lobby(); } }

  // Host: send everyone the latest state of every car (called ~15 times a second).
  relay() {
    if (!this.isHost || !this.conns.size) return;
    const m = { t: 'S', p: this.latest };
    for (const c of this.conns.values()) this.send(c, m);
  }

  /* ---------------------------------------------------------------- client */
  async join(code, profile) {
    await loadPeerJS();
    this.isHost = false; this.code = code;
    try { await this.openPeer(null); } catch (e) { throw friendly(e); }
    this.me = this.peer.id;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('Could not reach that room. Check the code and your connection, then try again.')), 15000);
      const done = (err) => { clearTimeout(timer); this.joinReject = null; if (err) { this.leave(); reject(err); } else resolve(); };
      this.joinReject = (e) => done(e);
      const c = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      c.on('open', () => { this.hostConn = c; c.send({ t: 'hello', name: profile.name, car: profile.car, paint: profile.paint }); done(); });
      c.on('data', (m) => this.fromHost(m));
      c.on('close', () => { if (!this.closed) { this.closed = true; this.h.onClosed('The host closed the room or lost connection.'); this.leave(); } });
      c.on('error', () => {});
    });
  }

  fromHost(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'lobby') { this.players = m.players; this.info = m.info; this.state = m.state; this.h.onLobby(this.players, this.info, this.state); }
    else if (m.t === 'start') { this.state = 'racing'; this.lastN = {}; this.h.onStart(m); }
    else if (m.t === 'S') { for (const id in m.p) if (id !== this.me) this.gotState(id, m.p[id]); }
    else if (m.t === 'reject') { this.closed = true; this.h.onClosed(m.reason); this.leave(); }
  }

  setProfile(car, paint) {
    if (this.isHost) { const p = this.players[0]; if (p) { p.car = car; p.paint = paint; this.lobby(); } }
    else this.send(this.hostConn, { t: 'profile', car, paint });
  }

  /* ---------------------------------------------------------------- both */
  gotState(id, s) {
    if (!(s.n > (this.lastN[id] || 0))) return; // relays repeat old states; keep only newer ones
    this.lastN[id] = s.n;
    if (this.isHost) this.latest[id] = s;
    this.h.onState(id, s);
  }

  // Send my car's state (host keeps it for the next relay).
  sendState(s) {
    if (this.isHost) this.latest[this.me] = s;
    else this.send(this.hostConn, { t: 's', s });
  }

  nameOf(id) { const p = this.players.find((x) => x.id === id); return p ? p.name : ''; }

  leave() {
    this.closed = true;
    try { for (const c of this.conns.values()) c.close(); if (this.hostConn) this.hostConn.close(); } catch (_) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (_) { /* ignore */ }
    this.conns.clear(); this.hostConn = null;
  }
}
