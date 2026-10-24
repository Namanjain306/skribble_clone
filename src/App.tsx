import { useEffect, useRef, useState, type ReactNode, type MutableRefObject } from 'react';
import { io } from 'socket.io-client';

const socket = io();
const AV = ['😀', '😎', '🤖', '🐱', '🐶', '🦊', '🐼', '🐸', '🦄', '👻', '🐙', '🦁'];
const COLORS = ['#000000', '#ffffff', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#e84393', '#8d5524'];
const CATS = ['animals', 'objects', 'actions', 'food'];

interface Player { id: string; name: string; score: number; guessed: boolean; avatar: number; ready: boolean; spectator: boolean }
interface Settings { maxPlayers: number; rounds: number; drawTime: number; wordCount: number; hints: number; isPrivate: boolean; wordMode: string; language: string }
interface GameState {
  roomId: string; phase: string; round: number; rounds: number; drawerId: string | null; hostId: string;
  word: string | null; hint: string; hints: string; timeLeft: number; drawTime: number; settings: Settings; players: Player[];
}
interface ChatMsg { system?: boolean; private?: boolean; playerId?: string; playerName?: string; text: string }
interface GameOver { winner: Player | null; leaderboard: Player[] }

export default function App() {
  const [S, setS] = useState<GameState | null>(null), [opts, setOpts] = useState<string[]>([]), [rd, setRd] = useState<{ word: string; scores: Player[] }>({ word: '', scores: [] });
  const [over, setOver] = useState<GameOver | null>(null), [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const recv = useRef(0);
  const add = (m: ChatMsg) => setMsgs(x => [...x.slice(-200), m]);
  useEffect(() => {
    socket.on('game_state', (st: GameState) => { if (st.phase === 'lobby' || st.phase === 'choosing') setOver(null); recv.current = Date.now(); setS(st); });
    socket.on('round_start', d => { setOpts(d.wordOptions || []); setOver(null); });
    socket.on('round_end', d => setRd({ word: d.word, scores: d.scores }));
    socket.on('game_over', setOver);
    socket.on('chat_message', add);
    socket.on('guess_result', r => r.correct && add({ system: true, text: `${r.playerName} guessed the word! (+${r.points})` }));
    socket.on('player_joined', d => add({ system: true, text: `${d.player.name} joined` }));
    socket.on('player_left', () => add({ system: true, text: 'A player left' }));
    socket.on('kicked', () => { alert('You were removed from the room'); location.href = '/'; });
    return () => socket.off();
  }, []);
  const lobby = S && S.phase === 'lobby';
  return (<>
    {!S && <Home />}
    {lobby && <Lobby S={S} />}
    <Game S={S} hidden={!S || lobby} opts={opts} setOpts={setOpts} rd={rd} over={over} msgs={msgs} recv={recv} />
  </>);
}

function Home() {
  const [name, setName] = useState(''), [av, setAv] = useState(0), [pub, setPub] = useState<any[] | null>(null), [spec, setSpec] = useState(false);
  const [code, setCode] = useState((new URLSearchParams(location.search).get('room') || '').toUpperCase());
  const [s, setS] = useState({ maxPlayers: 8, rounds: 3, drawTime: 80, wordCount: 3, hints: 2, isPrivate: true, wordMode: 'normal', language: 'en', customWords: '', categories: [...CATS] });
  const nm = (): string => name.trim() || 'Player' + Math.floor(Math.random() * 900 + 100);
  const err = (r: any) => { if (!r.ok) alert(r.error); };
  const join = (id: string) => socket.emit('join_room', { roomId: id, playerName: nm(), avatar: av, spectator: spec }, err);
  const parse = (v: string) => { v = v.trim(); const m = v.match(/room=([A-Za-z]{5})/); return (m ? m[1] : v).toUpperCase(); };
  const num = (k: string, label: string, min: number, max: number) => (
    <label>{label}<input type="number" min={min} max={max} value={s[k]} onChange={e => setS({ ...s, [k]: e.target.value })} /></label>);
  const toggle = (c: string) => setS({ ...s, categories: s.categories.includes(c) ? s.categories.filter(x => x !== c) : [...s.categories, c] });
  return (<div><h1>🎨 Skribbl Clone</h1><div className="card">
    <div className="row"><input style={{ flex: 1 }} placeholder="Your name" maxLength={16} value={name} onChange={e => setName(e.target.value)} /></div>
    <div className="row">{AV.map((a, i) => <button key={i} className="alt" style={{ outline: i === av ? '2px solid #2b5cc4' : '' }} onClick={() => setAv(i)}>{a}</button>)}</div>
    <h3>Create room</h3>
    <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
      {num('maxPlayers', 'Max players (2-20)', 2, 20)}{num('rounds', 'Rounds (2-10)', 2, 10)}{num('drawTime', 'Draw time (15-240s)', 15, 240)}
      {num('wordCount', 'Words (1-5)', 1, 5)}{num('hints', 'Hints (0-5)', 0, 5)}
      <label>Word mode<select value={s.wordMode} onChange={e => setS({ ...s, wordMode: e.target.value })}>
        <option value="normal">Normal</option><option value="hidden">Hidden</option><option value="combination">Combination</option></select></label>
      <label>Visibility<select value={s.isPrivate ? '1' : ''} onChange={e => setS({ ...s, isPrivate: !!e.target.value })}>
        <option value="1">Private</option><option value="">Public</option></select></label>
      <label>Word language<select value={s.language} onChange={e => setS({ ...s, language: e.target.value })}>
        <option value="en">English</option><option value="es">Español</option><option value="hi">Hindi (Roman)</option></select></label>
    </div>
    <div className="row">Categories: {CATS.map(c => <label key={c} className="chk" style={{ display: 'flex' }}><input type="checkbox" checked={s.categories.includes(c)} onChange={() => toggle(c)} />{c}</label>)}</div>
    <div className="row"><input style={{ flex: 1 }} placeholder="Custom words (comma separated, optional)" value={s.customWords} onChange={e => setS({ ...s, customWords: e.target.value })} /></div>
    <div className="row"><button onClick={() => socket.emit('create_room', { hostName: nm(), avatar: av, settings: s }, err)}>Create room</button></div><hr />
    <h3>Join room</h3>
    <div className="row"><input style={{ width: 200 }} placeholder="Room code or link" value={code} onChange={e => setCode(e.target.value)} />
      <button onClick={() => join(parse(code))}>Join</button>
      <button className="alt" onClick={() => socket.emit('list_rooms', null, setPub)}>Public rooms</button>
      <label className="chk" style={{ display: 'flex' }}><input type="checkbox" checked={spec} onChange={e => setSpec(e.target.checked)} />Join as spectator</label></div>
    {pub && (pub.length ? pub.map(r => <button key={r.id} className="alt" style={{ margin: 4 }} onClick={() => join(r.id)}>{r.host}'s room ({r.count}/{r.max})</button>) : <div>No public rooms open right now.</div>)}
  </div></div>);
}

function PlayerRow({ p, S, extra }: { p: Player; S: GameState; extra?: ReactNode }) {
  const me = socket.id, host = S.hostId === me;
  return (<div className={'pl' + (p.guessed ? ' g' : '')}>
    <span><span className="av">{AV[p.avatar] || '😀'}</span>{p.id === S.drawerId ? '✏️ ' : ''}{p.spectator ? '👁️ ' : ''}{p.name}{p.id === S.hostId ? ' 👑' : ''}{p.id === me ? ' (you)' : ''}{S.phase === 'lobby' && p.ready ? ' ✅' : ''}</span>
    <span>{extra}
      {p.id !== me && <button className="alt" title="Report" onClick={() => socket.emit('report', { playerId: p.id })}>⚑</button>}
      {p.id !== me && host && <><button className="alt" onClick={() => socket.emit('kick', { playerId: p.id })}>Kick</button><button className="alt" onClick={() => socket.emit('ban', { playerId: p.id })}>Ban</button></>}
      {p.id !== me && !host && S.players.length > 2 && <button className="alt" onClick={() => socket.emit('votekick', { playerId: p.id })}>Vote</button>}</span>
  </div>);
}

function Lobby({ S }: { S: GameState }) {
  const host = S.hostId === socket.id, s = S.settings, link = location.origin + '/?room=' + S.roomId;
  return (<div><h1>Lobby</h1><div className="card">
    <h3>Room code: {S.roomId}</h3>
    <div className="row"><input readOnly style={{ flex: 1 }} value={link} onFocus={e => e.target.select()} />
      <button className="alt" onClick={() => navigator.clipboard && navigator.clipboard.writeText(link)}>Copy link</button></div>
    <div style={{ fontSize: 13, color: '#555' }}>{s.isPrivate ? 'Private' : 'Public'} · max {s.maxPlayers} · {s.rounds} rounds · {s.drawTime}s · {s.wordCount} words · {s.hints} hints · {s.wordMode}</div>
    <h3 style={{ marginTop: 12 }}>Players</h3>
    {S.players.map(p => <PlayerRow key={p.id} p={p} S={S} />)}
    <div className="row">{!host && <button className="alt" onClick={() => socket.emit('toggle_ready')}>Ready / Unready</button>}{host && <button disabled={S.players.filter(p => !p.spectator).length < 2 || !S.players.every(p => p.ready || p.spectator || p.id === S.hostId)} onClick={() => socket.emit('start_game')}>Start game</button>}
      <span>{host ? (S.players.length < 2 ? 'Need 2+ players, all ready' : '') : 'Waiting for host to start...'}</span></div>
  </div></div>);
}

function Canvas({ canDraw, tool }: { canDraw: boolean; tool: MutableRefObject<{ color: string; size: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null), cd = useRef<boolean>(canDraw);
  cd.current = canDraw;
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d');
    ctx.lineCap = ctx.lineJoin = 'round';
    const W = cv.width, H = cv.height;
    const clear = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); };
    const dot = (p, c, s) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p[0] * W, p[1] * H, s / 2, 0, 7); ctx.fill(); };
    const seg = (a, b, c, s) => { ctx.strokeStyle = c; ctx.lineWidth = s; ctx.beginPath(); ctx.moveTo(a[0] * W, a[1] * H); ctx.lineTo(b[0] * W, b[1] * H); ctx.stroke(); };
    const redraw = strokes => { clear(); strokes.forEach(s => { dot(s.points[0], s.color, s.size); for (let i = 1; i < s.points.length; i++) seg(s.points[i - 1], s.points[i], s.color, s.size); }); };
    clear();
    let rem = null, drawing = false, last = null, col = '#000', size = 5;
    const onData = d => {
      if (cd.current) return;
      if (d.type === 'start') { rem = { c: d.color, s: d.size, last: [d.x, d.y] }; dot(rem.last, d.color, d.size); }
      else if (d.type === 'move' && rem) { const p = [d.x, d.y]; seg(rem.last, p, rem.c, rem.s); rem.last = p; }
    };
    const onSync = d => redraw(d.strokes || []);
    const onReplay = d => {
      clear(); const q = [];
      (d.strokes || []).forEach(st => { q.push([st.points[0], null, st]); for (let i = 1; i < st.points.length; i++) q.push([st.points[i], st.points[i - 1], st]); });
      let k = 0; const t = setInterval(() => {
        for (let n = 0; n < 4 && k < q.length; n++, k++) { const [pt0, pr, st] = q[k]; pr ? seg(pr, pt0, st.color, st.size) : dot(pt0, st.color, st.size); }
        if (k >= q.length) clearInterval(t);
      }, 16);
    };
    socket.on('draw_data', onData); socket.on('canvas_clear', clear); socket.on('canvas_sync', onSync); socket.on('replay', onReplay);
    const pt = e => { const r = cv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
    const down = e => {
      if (!cd.current) return;
      cv.setPointerCapture(e.pointerId); drawing = true; last = pt(e); col = tool.current.color; size = tool.current.size;
      dot(last, col, size); socket.emit('draw_start', { x: last[0], y: last[1], color: col, size });
    };
    const move = e => { if (!drawing) return; const p = pt(e); seg(last, p, col, size); last = p; socket.emit('draw_move', { x: p[0], y: p[1] }); };
    const up = () => { if (drawing) { drawing = false; socket.emit('draw_end', {}); } };
    cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    return () => {
      socket.off('draw_data', onData); socket.off('canvas_clear', clear); socket.off('canvas_sync', onSync); socket.off('replay', onReplay);
      cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move);
      cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
    };
  }, []);
  return <canvas ref={ref} width="800" height="600" />;
}

function Game({ S, hidden, opts, setOpts, rd, over, msgs, recv }: {
  S: GameState | null; hidden: boolean; opts: string[]; setOpts: (o: string[]) => void;
  rd: { word: string; scores: Player[] }; over: GameOver | null; msgs: ChatMsg[]; recv: MutableRefObject<number>;
}) {
  const [color, setColor] = useState('#000000'), [size, setSize] = useState(12), [er, setEr] = useState(false);
  const [text, setText] = useState(''), [mode, setMode] = useState('guess'), [, setTick] = useState(0);
  const tool = useRef({ color: '#000000', size: 12 }), box = useRef<HTMLDivElement>(null);
  tool.current = { color: er ? '#ffffff' : color, size };
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 500); return () => clearInterval(t); }, []);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  const me = socket.id, isDrawer = !!S && S.drawerId === me, host = !!S && S.hostId === me;
  const drawing = !!S && S.phase === 'drawing';
  const left = drawing ? Math.max(0, S.timeLeft - Math.floor((Date.now() - recv.current) / 1000)) : null;
  const drawer = S && S.players.find(p => p.id === S.drawerId);
  let word = '';
  if (S) word = drawing ? (isDrawer ? S.word : (S.hint || (S.settings.wordMode === 'hidden' ? 'Hidden word' : ''))) : S.phase === 'choosing' ? '...' : rd.word;
  let ov = null;
  if (S && S.phase === 'choosing') ov = isDrawer
    ? <><div>Choose a word to draw (15s)</div>{opts.map(w => <button key={w} onClick={() => { socket.emit('word_chosen', { word: w }); setOpts([]); }}>{w}</button>)}</>
    : <div>{drawer ? drawer.name : 'Someone'} is choosing a word...</div>;
  else if (S && S.phase === 'roundEnd') ov = <><div>The word was: {rd.word}</div>{rd.scores.map((p, i) => <div key={p.id}>{i + 1}. {p.name} — {p.score}</div>)}<button className="alt" onClick={() => socket.emit('request_replay')}>▶ Replay drawing</button></>;
  else if (S && S.phase === 'ended' && over) ov = <><div>🏆 Winner: {over.winner ? over.winner.name : '-'}</div>
    {over.leaderboard.map((p, i) => <div key={p.id}>{i + 1}. {p.name} — {p.score}</div>)}
    <button className="alt" onClick={() => socket.emit('request_replay')}>▶ Replay last drawing</button>{host ? <button onClick={() => socket.emit('start_game')}>Play again</button> : <div>Waiting for host to restart...</div>}</>;
  const send = e => { if (e.key === 'Enter' && text.trim()) { socket.emit(mode, { text }); setText(''); } };
  return (<div id="game" className={hidden ? 'hide' : ''}>
    <div className="panel"><h3>Players</h3>
      {S && [...S.players].sort((a, b) => b.score - a.score).map(p => <PlayerRow key={p.id} p={p} S={S} extra={<b>{p.score}</b>} />)}</div>
    <div id="center">
      <div id="bar"><span>{S ? `Round ${Math.min(S.round, S.rounds)}/${S.rounds}` : ''}</span><span id="word">{word}</span><span>{left !== null ? left + 's' : ''}</span></div>
      <div id="wrap"><Canvas canDraw={drawing && isDrawer} tool={tool} />{ov && <div id="ov" className={S.phase === 'choosing' ? '' : 'small'}>{ov}</div>}</div>
      {drawing && isDrawer && <div id="tools">
        {COLORS.map(c => <button key={c} className={'sw' + (c === color && !er ? ' on' : '')} style={{ background: c }} onClick={() => { setColor(c); setEr(false); }} />)}
        <button className="alt" onClick={() => setSize(4)}>Thin</button><button className="alt" onClick={() => setSize(12)}>Medium</button><button className="alt" onClick={() => setSize(26)}>Thick</button>
        <button className="alt" style={{ outline: er ? '2px solid #000' : '' }} onClick={() => setEr(!er)}>Eraser</button>
        <button className="alt" onClick={() => socket.emit('draw_undo')}>Undo</button>
        <button className="alt" onClick={() => socket.emit('canvas_clear')}>Clear</button></div>}
    </div>
    <div className="panel"><div id="msgs" ref={box}>{msgs.map((m, i) => <div key={i} className={m.system ? 'sys' : m.private ? 'pm' : ''}>{!m.system && <b>{m.playerName}: </b>}{m.text}</div>)}</div>
      <div className="row" style={{ margin: '6px 0 0' }}><input style={{ flex: 1, minWidth: 0 }} maxLength={100} placeholder={mode === 'guess' ? 'Type your guess...' : 'Chat...'} value={text} onChange={e => setText(e.target.value)} onKeyDown={send} /><button className="alt" onClick={() => setMode(mode === 'guess' ? 'chat' : 'guess')}>{mode === 'guess' ? 'Guess' : 'Chat'}</button></div></div>
  </div>);
}
