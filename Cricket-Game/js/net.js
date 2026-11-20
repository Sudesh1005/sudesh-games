// Kaathu Cricket: 2-player online rooms over WebRTC using PeerJS.
// The creator's browser hosts the room and shares a 6-letter code; the friend joins with their name and the code.
const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
const PREFIX = 'kaathu-cricket-room-';
const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

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
  if (type === 'webrtc') return new Error('Could not connect to the other player. Some networks block this; try home Wi-Fi.');
  return e instanceof Error ? e : new Error(String((e && e.message) || e || 'Connection error'));
}

export class Room {
  // h: { onLobby(room), onMsg(msg), onClosed(reason) }
  constructor(h) { this.h = h; this.peer = null; this.conn = null; this.isHost = false; this.code = ''; this.players = []; this.info = {}; this.closed = false; }

  openPeer(id) {
    return new Promise((resolve, reject) => {
      const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
      const fail = (e) => { p.destroy(); reject(e); };
      p.once('error', fail);
      p.once('open', () => {
        p.off('error', fail);
        p.on('error', (e) => { if (e.type === 'peer-unavailable' && this.joinReject) this.joinReject(friendly(e)); });
        this.peer = p; resolve();
      });
    });
  }

  async create(name, info) {
    await loadPeerJS();
    this.isHost = true; this.info = info;
    for (let tries = 0; ; tries++) {
      const code = makeCode();
      try { await this.openPeer(PREFIX + code); this.code = code; break; } catch (e) { if (e.type !== 'unavailable-id' || tries >= 4) throw friendly(e); }
    }
    this.players = [{ name, host: true }];
    this.peer.on('connection', (c) => {
      c.on('data', (m) => this.fromGuest(c, m));
      c.on('close', () => { if (c === this.conn) { this.conn = null; this.players = this.players.slice(0, 1); this.lobby(); this.h.onMsg({ t: 'left', name: this.guestName }); } });
    });
    this.peer.on('disconnected', () => { if (!this.closed) try { this.peer.reconnect(); } catch (_) { /* ignore */ } });
    this.lobby();
    return this.code;
  }

  fromGuest(c, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.conn && this.conn !== c) { try { c.send({ t: 'reject', reason: 'This room already has 2 players.' }); } catch (_) { /* ignore */ } setTimeout(() => c.close(), 400); return; }
      this.conn = c;
      this.guestName = cleanName(m.name) || 'Friend';
      if (this.guestName.toLowerCase() === this.players[0].name.toLowerCase()) this.guestName += ' 2';
      this.players = [this.players[0], { name: this.guestName, host: false }];
      this.lobby();
    } else if (c === this.conn) this.h.onMsg(m);
  }

  lobby() {
    this.send({ t: 'lobby', players: this.players, info: this.info });
    this.h.onLobby(this);
  }
  setInfo(info) { this.info = info; this.lobby(); }

  async join(code, name) {
    await loadPeerJS();
    this.isHost = false; this.code = code;
    try { await this.openPeer(null); } catch (e) { throw friendly(e); }
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('Could not reach that room. Check the code and your connection, then try again.')), 15000);
      const done = (err) => { clearTimeout(timer); this.joinReject = null; if (err) { this.leave(); reject(err); } else resolve(); };
      this.joinReject = done;
      const c = this.peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
      c.on('open', () => { this.conn = c; c.send({ t: 'hello', name }); done(); });
      c.on('data', (m) => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'lobby') { this.players = m.players; this.info = m.info; this.h.onLobby(this); }
        else if (m.t === 'reject') { this.closed = true; this.h.onClosed(m.reason); this.leave(); }
        else this.h.onMsg(m);
      });
      c.on('close', () => { if (!this.closed) { this.closed = true; this.h.onClosed('Your friend closed the room or lost connection.'); this.leave(); } });
      c.on('error', () => {});
    });
  }

  get ready() { return !!(this.conn && this.conn.open); }
  send(m) { if (this.conn && this.conn.open) try { this.conn.send(m); } catch (_) { /* ignore */ } }

  leave() {
    this.closed = true;
    try { if (this.conn) this.conn.close(); if (this.peer) this.peer.destroy(); } catch (_) { /* ignore */ }
    this.conn = null;
  }
}
