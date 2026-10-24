const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const DIST = path.join(__dirname, 'dist');
app.use(express.static(DIST));
app.get('/', (req, res, next) => require('fs').existsSync(path.join(DIST, 'index.html')) ? next() : res.send('Run `npm run build` first.'));

const WORDS = {
  animals: 'cat dog elephant giraffe penguin dolphin butterfly kangaroo snake owl monkey rabbit turtle shark spider'.split(' '),
  objects: 'chair umbrella guitar bicycle clock camera lamp key scissors bottle glasses candle ladder envelope telescope'.split(' '),
  actions: 'swimming dancing sleeping running cooking fishing painting climbing laughing singing'.split(' '),
  food: 'pizza banana burger icecream cake sandwich watermelon popcorn donut noodles'.split(' ')
};
const WORDS_BY_LANG = {
  en: WORDS,
  es: { animales: 'gato perro elefante jirafa pinguino delfin serpiente conejo tortuga tiburon'.split(' '), objetos: 'silla paraguas guitarra bicicleta reloj camara lampara llave tijeras botella'.split(' ') },
  hi: { janwar: 'billi kutta hathi sher bandar machhli mor ullu sanp kachua'.split(' '), cheezein: 'kursi chhata ghadi chabi kainchi botal diya patang pankha taala'.split(' ') }
};
const clamp = (n, a, b, d) => { n = parseInt(n); return isNaN(n) ? d : Math.min(b, Math.max(a, n)); };
const norm = s => String(s).trim().toLowerCase().replace(/\s+/g, ' ');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

class Player {
  constructor(id, name, avatar, spectator) {
    this.id = id; this.score = 0; this.guessed = false; this.ready = false; this.spectator = !!spectator; this.avatar = clamp(avatar, 0, 11, 0);
    this.name = String(name || '').trim().slice(0, 16) || 'Player';
  }
  pub() { return { id: this.id, name: this.name, score: this.score, guessed: this.guessed, avatar: this.avatar, ready: this.ready, spectator: this.spectator }; }
}

// Game: rounds, turn order, word choice, hints, guessing, scoring.
class Game {
  timeLeft() {
    return this.phase === 'drawing' ? Math.max(0, Math.ceil((this.startedAt + this.s.drawTime * 1000 - Date.now()) / 1000)) : 0;
  }
  hint() {
    if (!this.word || this.phase === 'choosing' || (this.s.wordMode === 'hidden' && this.phase === 'drawing')) return '';
    return this.word.split('').map((c, i) => c === ' ' ? ' ' : this.revealed.has(i) ? c : '_').join(' ');
  }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

  start() {
    for (const p of this.players.values()) p.score = 0;
    this.round = 1; this.order = this.active(); this.idx = -1;
    this.next();
  }
  next() {
    this.clearTimers();
    this.idx++;
    while (this.idx < this.order.length && !this.players.has(this.order[this.idx])) this.idx++;
    if (this.idx >= this.order.length) {
      this.round++; this.order = this.active(); this.idx = 0;
      if (this.round > this.s.rounds) return this.end();
    }
    this.drawerId = this.order[this.idx];
    this.strokes = []; this.cur = null; this.word = null; this.revealed = new Set();
    for (const p of this.players.values()) p.guessed = false;
    this.phase = 'choosing';
    const pick = () => [...this.pool].sort(() => Math.random() - 0.5);
    this.options = this.s.wordMode === 'combination'
      ? Array.from({ length: this.s.wordCount }, () => pick().slice(0, 2).join(' '))
      : pick().slice(0, this.s.wordCount);
    this.emit('canvas_clear', {});
    for (const p of this.players.values()) {
      const d = { drawerId: this.drawerId, drawTime: this.s.drawTime, round: this.round };
      if (p.id === this.drawerId) d.wordOptions = this.options;
      io.to(p.id).emit('round_start', d);
    }
    this.sendState();
    this.later(() => this.choose(this.drawerId, this.options[0]), 15000);
  }
  choose(pid, word) {
    if (this.phase !== 'choosing' || pid !== this.drawerId || !this.options.includes(word)) return;
    this.clearTimers();
    this.word = word; this.phase = 'drawing'; this.startedAt = Date.now();
    const n = this.s.wordMode === 'hidden' ? 0 : Math.min(this.s.hints, word.replace(/ /g, '').length - 1);
    for (let i = 1; i <= n; i++) this.later(() => this.reveal(), (i * this.s.drawTime * 1000) / (n + 1));
    this.later(() => this.endRound(), this.s.drawTime * 1000);
    this.sendState();
  }
  reveal() {
    const c = [...this.word].map((ch, i) => i).filter(i => this.word[i] !== ' ' && !this.revealed.has(i));
    if (c.length > 1) { this.revealed.add(c[Math.floor(Math.random() * c.length)]); this.sendState(); }
  }
  guess(p, text) {
    text = String(text || '').slice(0, 100);
    if (!text.trim()) return;
    if (this.phase !== 'drawing' || p.spectator) return this.chat(p, text);
    if (p.id === this.drawerId || p.guessed) return this.chat(p, text, true);
    const t = norm(text);
    if (t === this.word) {
      const pts = Math.round(50 + 450 * (this.timeLeft() / this.s.drawTime));
      p.score += pts; p.guessed = true;
      const d = this.players.get(this.drawerId); if (d) d.score += 30;
      this.emit('guess_result', { correct: true, playerId: p.id, playerName: p.name, points: pts });
      this.sendState();
      this.checkAllGuessed();
    } else {
      if (this.word.length > 3 && lev(t, this.word) === 1)
        io.to(p.id).emit('chat_message', { system: true, text: `"${text}" is close!` });
      this.emit('guess_result', { correct: false, playerId: p.id, playerName: p.name, points: 0 });
      this.emit('chat_message', { playerId: p.id, playerName: p.name, text });
    }
  }
  chat(p, text, privateToGuessers) {
    text = String(text || '').slice(0, 100);
    if (!text.trim()) return;
    if (this.phase === 'drawing' && this.word && !privateToGuessers && p.id !== this.drawerId && norm(text).includes(this.word)) return;
    const msg = { playerId: p.id, playerName: p.name, text };
    if (privateToGuessers) {
      for (const q of this.players.values())
        if (q.guessed || q.id === this.drawerId) io.to(q.id).emit('chat_message', { ...msg, private: true });
    } else this.emit('chat_message', msg);
  }
  checkAllGuessed() {
    const g = [...this.players.values()].filter(p => p.id !== this.drawerId && !p.spectator);
    if (this.phase === 'drawing' && g.length && g.every(p => p.guessed)) this.endRound();
  }
  endRound() {
    if (this.phase !== 'drawing') return;
    this.clearTimers(); this.phase = 'roundEnd'; this.replay = this.strokes.slice();
    const scores = [...this.players.values()].map(p => p.pub()).sort((a, b) => b.score - a.score);
    this.emit('round_end', { word: this.word, scores, nextDrawer: this.order[this.idx + 1] || null });
    this.sendState();
    this.later(() => this.next(), 5000);
  }
  end() {
    this.clearTimers(); this.phase = 'ended'; this.drawerId = null;
    const leaderboard = [...this.players.values()].map(p => p.pub()).sort((a, b) => b.score - a.score);
    this.emit('game_over', { winner: leaderboard[0] || null, leaderboard });
    this.sendState();
  }
}

// Room: participants, settings, broadcasting, moderation.
class Room extends Game {
  constructor(id, hostId, s) {
    super();
    this.id = id; this.hostId = hostId;
    const custom = String(s.customWords || '').split(',').map(w => norm(w)).filter(w => w && w.length <= 30);
    this.s = {
      maxPlayers: clamp(s.maxPlayers, 2, 20, 8), rounds: clamp(s.rounds, 2, 10, 3),
      drawTime: clamp(s.drawTime, 15, 240, 80), wordCount: clamp(s.wordCount, 1, 5, 3),
      hints: clamp(s.hints, 0, 5, 2), isPrivate: !!s.isPrivate,
      wordMode: ['normal', 'hidden', 'combination'].includes(s.wordMode) ? s.wordMode : 'normal',
      language: ['en', 'es', 'hi'].includes(s.language) ? s.language : 'en'
    };
    const W = WORDS_BY_LANG[this.s.language];
    const cats = (Array.isArray(s.categories) ? s.categories : []).filter(c => W[c]);
    this.pool = [...new Set([...(cats.length ? cats : Object.keys(W)).flatMap(c => W[c]), ...custom])];
    this.players = new Map();
    this.phase = 'lobby'; this.round = 0; this.order = []; this.idx = 0;
    this.drawerId = null; this.word = null; this.options = []; this.revealed = new Set();
    this.strokes = []; this.cur = null; this.startedAt = 0; this.timers = [];
  }
  emit(ev, data) { io.to(this.id).emit(ev, data); }
  state(pid) {
    return {
      roomId: this.id, phase: this.phase, round: this.round, rounds: this.s.rounds, drawerId: this.drawerId,
      hostId: this.hostId, word: pid === this.drawerId && this.phase === 'drawing' ? this.word : null,
      hint: this.hint(), hints: this.hint(), timeLeft: this.timeLeft(), drawTime: this.s.drawTime, settings: this.s,
      players: [...this.players.values()].map(p => p.pub())
    };
  }
  sendState() { for (const p of this.players.values()) io.to(p.id).emit('game_state', this.state(p.id)); }
  active() { return [...this.players.values()].filter(p => !p.spectator).map(p => p.id); }
  remove(pid) {
    this.players.delete(pid);
    if (!this.players.size) { this.clearTimers(); rooms.delete(this.id); return; }
    if (this.hostId === pid) this.hostId = this.players.keys().next().value;
    this.emit('player_left', { playerId: pid, players: [...this.players.values()].map(p => p.pub()) });
    if (['choosing', 'drawing', 'roundEnd'].includes(this.phase)) {
      if (this.active().length < 2) { this.clearTimers(); this.phase = 'lobby'; this.drawerId = null; }
      else if (pid === this.drawerId && this.phase === 'drawing') this.endRound();
      else if (pid === this.drawerId && this.phase === 'choosing') this.next();
      else this.checkAllGuessed();
    }
    this.sendState();
  }
}

const rooms = new Map();
function newCode() {
  let c; do { c = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join(''); } while (rooms.has(c));
  return c;
}
function join(socket, room, name, avatar, spectator) {
  const p = new Player(socket.id, name, avatar, spectator);
  room.players.set(socket.id, p);
  socket.join(room.id); socket.data.room = room;
  socket.to(room.id).emit('player_joined', { player: p.pub(), players: [...room.players.values()].map(x => x.pub()) });
  room.sendState();
  socket.emit('canvas_sync', { strokes: room.strokes });
}
function leave(socket) {
  const r = socket.data.room;
  if (!r) return;
  socket.leave(r.id); socket.data.room = null;
  r.remove(socket.id);
}

class MessageHandler {
  constructor(socket) {
  socket.on('create_room', (d, cb) => {
    if (typeof cb !== 'function') return;
    d = d || {};
    const room = new Room(newCode(), socket.id, d.settings || {});
    rooms.set(room.id, room);
    join(socket, room, d.hostName, d.avatar);
    cb({ ok: true, roomId: room.id });
  });
  socket.on('join_room', (d, cb) => {
    if (typeof cb !== 'function') return;
    d = d || {};
    const room = rooms.get(String(d.roomId || '').trim().toUpperCase());
    if (!room) return cb({ ok: false, error: 'Room not found' });
    if (room.banned && room.banned.has(socket.handshake.address)) return cb({ ok: false, error: 'You are banned from this room' });
    if (room.players.size >= room.s.maxPlayers) return cb({ ok: false, error: 'Room is full' });
    if (socket.data.room) leave(socket);
    join(socket, room, d.playerName, d.avatar, !!d.spectator);
    cb({ ok: true, roomId: room.id });
  });
  socket.on('list_rooms', (_, cb) => {
    if (typeof cb !== 'function') return;
    cb([...rooms.values()].filter(r => !r.s.isPrivate && r.phase === 'lobby' && r.players.size < r.s.maxPlayers)
      .map(r => ({ id: r.id, host: r.players.get(r.hostId).name, count: r.players.size, max: r.s.maxPlayers })));
  });
  socket.on('start_game', () => {
    const r = socket.data.room;
    if (r && r.hostId === socket.id && ['lobby', 'ended'].includes(r.phase) && r.active().length >= 2 &&
      (r.phase === 'ended' || [...r.players.values()].every(p => p.ready || p.spectator || p.id === r.hostId))) r.start();
  });
  socket.on('word_chosen', d => { const r = socket.data.room; if (r) r.choose(socket.id, d && d.word); });
  socket.on('guess', d => { const r = socket.data.room; if (r) r.guess(r.players.get(socket.id), d && d.text); });
  socket.on('chat', d => { const r = socket.data.room; if (r) r.chat(r.players.get(socket.id), d && d.text); });
  const canDraw = () => { const r = socket.data.room; return r && r.phase === 'drawing' && r.drawerId === socket.id ? r : null; };
  const n01 = v => Math.min(1, Math.max(0, Number(v) || 0));
  socket.on('draw_start', d => {
    const r = canDraw(); if (!r || !d) return;
    const color = /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#000000';
    const size = clamp(d.size, 1, 60, 5);
    r.cur = { color, size, points: [[n01(d.x), n01(d.y)]] };
    r.strokes.push(r.cur);
    r.emit('draw_data', { type: 'start', x: n01(d.x), y: n01(d.y), color, size });
  });
  socket.on('draw_move', d => {
    const r = canDraw(); if (!r || !r.cur || !d) return;
    r.cur.points.push([n01(d.x), n01(d.y)]);
    r.emit('draw_data', { type: 'move', x: n01(d.x), y: n01(d.y) });
  });
  socket.on('draw_end', () => { const r = canDraw(); if (r) { r.cur = null; r.emit('draw_data', { type: 'end' }); } });
  socket.on('canvas_clear', () => { const r = canDraw(); if (r) { r.strokes = []; r.cur = null; r.emit('canvas_clear', {}); } });
  socket.on('draw_undo', () => { const r = canDraw(); if (r) { r.strokes.pop(); r.cur = null; r.emit('canvas_sync', { strokes: r.strokes }); } });
  socket.on('kick', d => {
    const r = socket.data.room;
    if (!r || r.hostId !== socket.id || !d || d.playerId === socket.id) return;
    const t = io.sockets.sockets.get(d.playerId);
    if (t && t.data.room === r) { t.emit('kicked'); leave(t); }
  });
  socket.on('toggle_ready', () => { const r = socket.data.room; const p = r && r.players.get(socket.id); if (p && r.phase === 'lobby') { p.ready = !p.ready; r.sendState(); } });
  socket.on('ban', d => {
    const r = socket.data.room;
    if (!r || r.hostId !== socket.id || !d || d.playerId === socket.id) return;
    const t = io.sockets.sockets.get(d.playerId);
    if (t && t.data.room === r) { (r.banned = r.banned || new Set()).add(t.handshake.address); t.emit('kicked'); leave(t); }
  });
  socket.on('report', d => {
    const r = socket.data.room, a = r && r.players.get(socket.id), b = r && d && r.players.get(d.playerId);
    if (a && b) io.to(r.hostId).emit('chat_message', { system: true, text: `Report: ${a.name} reported ${b.name}` });
  });
  socket.on('request_replay', () => { const r = socket.data.room; if (r) socket.emit('replay', { strokes: r.replay || [] }); });
  socket.on('votekick', d => {
    const r = socket.data.room;
    if (!r || !d || d.playerId === socket.id || !r.players.has(d.playerId) || r.players.size < 3) return;
    const v = r.votes = r.votes || new Map();
    const set = v.get(d.playerId) || new Set(); set.add(socket.id); v.set(d.playerId, set);
    const need = Math.floor((r.players.size - 1) / 2) + 1;
    r.emit('chat_message', { system: true, text: `Votekick ${r.players.get(d.playerId).name}: ${set.size}/${need}` });
    if (set.size >= need) { v.delete(d.playerId); const t = io.sockets.sockets.get(d.playerId); if (t) { t.emit('kicked'); leave(t); } }
  });
  socket.on('disconnect', () => leave(socket));
  }
}
io.on('connection', socket => new MessageHandler(socket));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Skribbl clone running on port ' + PORT));
