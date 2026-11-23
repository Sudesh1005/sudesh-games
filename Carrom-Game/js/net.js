// Carrom Raja: online rooms for 2 or 4 players over WebRTC using PeerJS.
// The host's browser runs the room: it shares a 6-letter code, friends join with the code and their name.
// Every message from a player goes to the host, which passes it on to everyone else.
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'carrom-raja-room-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I/L, so codes are easy to read out

let loading = null;
function loadPeerJS() {
  if (window.Peer) return Promise.resolve();
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL; s.async = true; s.onload = resolve;
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
  if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(type)) return new Error('Could not reach the online server. Check your internet connection and try again.');
  if (type === 'browser-incompatible') return new Error('This browser does not support online play.');
  if (type === 'webrtc') return new Error('Could not connect to the other player. Some networks (office or college Wi-Fi, some mobile data) block this.');
  return e instanceof Error ? e : new Error(String((e && e.message) || e || 'Connection error'));
}

export class Room {
  // h: { onLobby(players, info, state), onMsg(msg, fromId), onLeave(id, name), onClosed(reason) }
  constructor(h) {
    this.h = h; this.peer = null; this.isHost = false; this.code = ''; this.me = '';
    this.players = []; this.info = { n: 2 }; this.state = 'lobby';
    this.conns = new Map(); this.hostConn = null; this.closed = false;
  }

  get max() { return this.info.n === 4 ? 4 : 2; }

  openPeer(id) {
    return new Promise((resolve, reject) => {
      const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
      const fail = (e) => { p.destroy(); reject(e); };
      p.once('error', fail);
      p.once('open', () => {
        p.off('error', fail);
        p.on('error', (e) => {
          if (this.closed) return;
          if (e.type === 'peer-unavailable' && this.joinReject) this.joinReject(friendly(e));
        });
        this.peer = p;
        resolve();
      });
    });
  }

  /* ---------------------------------------------------------------- host */
  async create(name, info) {
    await loadPeerJS();
    this.isHost = true; this.info = info;
    for (let tries = 0; ; tries++) {
      const code = makeCode();
      try { await this.openPeer(PREFIX + code); this.code = code; break; }
      catch (e) { if (e.type !== 'unavailable-id' || tries >= 4) throw friendly(e); }
    }
    this.me = this.peer.id;
    this.players = [{ id: this.me, name, host: true }];
    this.peer.on('connection', (c) => {
      c.on('data', (m) => this.fromClient(c, m));
      c.on('close', () => this.drop(c.peer));
      c.on('error', () => this.drop(c.peer));
    });
    this.peer.on('disconnected', () => { if (!this.closed) try { this.peer.reconnect(); } catch (_) { /* ignore */ } });
    this.lobby();
    return this.code;
  }

  fromClient(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.state !== 'lobby') return this.reject(c, 'A game is running in this room. Try again when it finishes.');
      if (this.players.length >= this.max) return this.reject(c, `This room is full (${this.max} players).`);
      let name = cleanName(m.name) || 'Player';
      const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
      for (let k = 2; taken.has(name.toLowerCase()); k++) name = cleanName(m.name).slice(0, 11) + ' ' + k;
      this.conns.set(c.peer, c);
      this.players.push({ id: c.peer, name, host: false });
      this.lobby();
      return;
    }
    if (!this.conns.has(c.peer)) return;
    // game message: pass it on to everyone else, then handle it here
    for (const [id, o] of this.conns) if (id !== c.peer) this.sendTo(o, m);
    this.h.onMsg(m, c.peer);
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
    this.lobby();
    if (p) this.h.onLeave(id, p.name);
  }

  sendTo(c, m) { if (c && c.open) try { c.send(m); } catch (_) { /* ignore */ } }

  lobby() {
    const m = { t: 'lobby', players: this.players, info: this.info, state: this.state };
    for (const c of this.conns.values()) this.sendTo(c, m);
    this.h.onLobby(this.players, this.info, this.state);
  }

  setInfo(info) {
    this.info = info;
    // too many players for a 2-player room: the last ones are asked to leave
    while (this.players.length > this.max) { const p = this.players.pop(); const c = this.conns.get(p.id); if (c) this.reject(c, 'The host changed the room to 2 players.'); this.conns.delete(p.id); }
    this.lobby();
  }

  setState(state) { this.state = state; this.lobby(); }

  /* ---------------------------------------------------------------- client */
  async join(code, name) {
    await loadPeerJS();
    this.isHost = false; this.code = code;
    try { await this.openPeer(null); } catch (e) { throw friendly(e); }
    this.me = this.peer.id;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('Could not reach that room. Check the code and your connection, then try again.')), 15000);
      const done = (err) => { clearTimeout(timer); this.joinReject = null; if (err) { this.leave(); reject(err); } else resolve(); };
      this.joinReject = done;
      const c = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      c.on('open', () => { this.hostConn = c; c.send({ t: 'hello', name }); done(); });
      c.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'lobby') { this.players = m.players; this.info = m.info; this.state = m.state; this.h.onLobby(this.players, this.info, this.state); }
        else if (m.t === 'reject') { this.closed = true; this.h.onClosed(m.reason); this.leave(); }
        else this.h.onMsg(m, null);
      });
      c.on('close', () => { if (!this.closed) { this.closed = true; this.h.onClosed('The host closed the room or lost connection.'); this.leave(); } });
      c.on('error', () => {});
    });
  }

  /* ---------------------------------------------------------------- both */
  // send a game message to everyone else in the room
  send(m) {
    if (this.isHost) for (const c of this.conns.values()) this.sendTo(c, m);
    else this.sendTo(this.hostConn, m);
  }

  leave() {
    this.closed = true;
    try { for (const c of this.conns.values()) c.close(); if (this.hostConn) this.hostConn.close(); } catch (_) { /* ignore */ }
    try { if (this.peer) this.peer.destroy(); } catch (_) { /* ignore */ }
    this.conns.clear(); this.hostConn = null;
  }
}
