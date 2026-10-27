import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { Activity, ArrowRight, Check, Copy, Gamepad2, Info, LoaderCircle, Radio, RotateCcw, Trophy, Wifi, WifiOff, X } from "lucide-react";
const SERVER = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

const METER_MS = 1100;
const meterAt = ms => { const ph = (ms % METER_MS) / METER_MS; return ph < .5 ? ph * 2 : 2 - ph * 2; };
const lerp = (a, b, t) => a + (b - a) * t;
const EVENT_TEXT = { score: "SWISH!", miss: "MISS", block: "BLOCKED!" };


function Court({ state, me, onMove, onStop, onCharge, onShoot, mobile }) {
  const canvasRef = useRef(null);
  const keys = useRef(new Set());
  const stateRef = useRef(state);
  const prevRef = useRef(null);
  const recvRef = useRef(0);
  const chargeRef = useRef(null);
  const meRef = useRef(me);
  const popupRef = useRef(null);
  useEffect(() => { meRef.current = me; }, [me]);
  useEffect(() => {

    prevRef.current = stateRef.current; stateRef.current = state; recvRef.current = performance.now();
    const ev = state?.event;
    if (ev && ev.id !== popupRef.current?.id) popupRef.current = { ...ev, at: performance.now() };
  }, [state]);
  const startCharge = useCallback(() => { if (chargeRef.current === null) { chargeRef.current = performance.now(); onCharge(); } }, [onCharge]);
  const release = useCallback(() => { if (chargeRef.current !== null) { chargeRef.current = null; onShoot(); } }, [onShoot]);
  useEffect(() => {
    const down = e => { const k = e.key.toLowerCase(); if (e.target.tagName === "INPUT") return; if (k === " ") { e.preventDefault(); if (!e.repeat) startCharge(); return; } if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { e.preventDefault(); keys.current.add(k); } };
    const up = e => { const k = e.key.toLowerCase(); if (k === " ") release(); keys.current.delete(k); };
    const clear = () => { keys.current.clear(); chargeRef.current = null; };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", clear);
    let moving = false;
    const loop = setInterval(() => {
      const k = keys.current; let dx = 0, dy = 0;
      if (k.has("w") || k.has("arrowup")) dy -= 1; if (k.has("s") || k.has("arrowdown")) dy += 1;
      if (k.has("a") || k.has("arrowleft")) dx -= 1; if (k.has("d") || k.has("arrowright")) dx += 1;
      // Only send stop on key release, otherwise idle keyboard would spam stops and cancel the mobile d-pad.
      if (dx || dy) { onMove(dx, dy); moving = true; }
      else if (moving) { onStop(); moving = false; }
    }, 55);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", clear); clearInterval(loop); };
  }, [onMove, onStop, startCharge, release]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf;
    const pos = (prev, cur, t) => prev && Math.hypot(cur.x - prev.x, cur.y - prev.y) < 150 ? { x: lerp(prev.x, cur.x, t), y: lerp(prev.y, cur.y, t) } : { x: cur.x, y: cur.y };
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const s = stateRef.current, prev = prevRef.current; const w = 1000, h = 560, now = performance.now();
      const t = Math.min(1, (now - recvRef.current) / 50);
      ctx.clearRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, w, h); grad.addColorStop(0, "#111c37"); grad.addColorStop(.5, "#0a1730"); grad.addColorStop(1, "#15102f"); ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.strokeStyle = "rgba(75,226,255,.18)"; ctx.lineWidth = 1;
      for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.restore();
      ctx.strokeStyle = "rgba(95,230,255,.65)"; ctx.lineWidth = 3; ctx.strokeRect(20, 20, w - 40, h - 40);
      ctx.beginPath(); ctx.moveTo(w / 2, 20); ctx.lineTo(w / 2, h - 20); ctx.strokeStyle = "rgba(178,112,255,.55)"; ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 74, 0, Math.PI * 2); ctx.stroke();
      for (const side of [0, 1]) {
        const hx = side === 0 ? 40 : w - 40, dir = side === 0 ? 1 : -1;
        ctx.strokeStyle = side === 0 ? "#52eaff" : "#ff6bca"; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 14; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(hx, h / 2 - 58); ctx.lineTo(hx, h / 2 + 58); ctx.stroke();
        ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(hx + dir * 22, h / 2, 12, 24, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(hx + dir * 22, h / 2, 90, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : Math.PI * 1.5); ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 2; ctx.stroke();
      }
      if (s) {
        for (const p of s.players) {
          const q = pos(prev?.players?.find(o => o.id === p.id), p, t);
          ctx.save(); ctx.shadowColor = p.side === 0 ? "#4ce9ff" : "#ff62cf"; ctx.shadowBlur = 18;
          ctx.fillStyle = p.side === 0 ? "#4ce9ff" : "#ff62cf"; ctx.beginPath(); ctx.arc(q.x, q.y, 18, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "#08101f"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.side === 0 ? "1" : "2", q.x, q.y);
          ctx.fillStyle = "#f2f7ff"; ctx.font = "12px sans-serif"; ctx.fillText(p.name.slice(0, 14), q.x, q.y - 30); ctx.restore();
          // Shot meter above the local player while charging with the ball.
          if (p.id === meRef.current?.id && chargeRef.current !== null && s.ball.owner === p.id) {
            const m = meterAt(now - chargeRef.current), bx = q.x + 28, by = q.y - 24, bh = 48;
            ctx.save(); ctx.fillStyle = "rgba(4,8,20,.8)"; ctx.fillRect(bx, by, 9, bh);
            ctx.fillStyle = "rgba(120,255,160,.35)"; ctx.fillRect(bx, by, 9, bh * .1);
            ctx.fillStyle = m >= .9 ? "#7dffa4" : m >= .7 ? "#ffe66b" : "#ff6b6b"; ctx.fillRect(bx, by + bh * (1 - m), 9, bh * m);
            ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = 1; ctx.strokeRect(bx, by, 9, bh); ctx.restore();
          }
        }
        const bp = pos(prev?.ball, s.ball, t);
        const b = s.ball; ctx.save(); ctx.shadowColor = "#ff9d4a"; ctx.shadowBlur = 22; ctx.fillStyle = "#ff9d4a"; ctx.beginPath(); ctx.arc(bp.x, bp.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "#6d3512"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bp.x - 8, bp.y); ctx.lineTo(bp.x + 8, bp.y); ctx.moveTo(bp.x, bp.y - 8); ctx.lineTo(bp.x, bp.y + 8); ctx.stroke(); ctx.restore();
        // Event popup: shot quality, then SWISH / MISS / BLOCKED.
        const pop = popupRef.current, age = pop ? now - pop.at : Infinity;
        if (age < 1200 && s.status === "playing") {
          const text = pop.type === "shot" ? `${pop.label}${pop.contested ? " · CONTESTED" : ""}` : pop.type === "score" ? `SWISH! +2${pop.label === "PERFECT" ? " · PERFECT" : ""}` : EVENT_TEXT[pop.type];
          const color = pop.type === "score" ? "#7dffa4" : pop.type === "shot" ? (pop.label === "PERFECT" ? "#7dffa4" : pop.label === "GOOD" ? "#ffe66b" : "#ff9d6b") : "#ff6b8f";
          ctx.save(); ctx.globalAlpha = Math.max(0, 1 - age / 1200); ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 16; ctx.textAlign = "center";
          ctx.font = `bold ${pop.type === "shot" ? 22 : 40}px sans-serif`; ctx.fillText(text, w / 2, 110 - age / 40); ctx.restore();
        }
      }
      if (s?.status === "waiting") { ctx.fillStyle = "rgba(4,8,20,.72)"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#e8f5ff"; ctx.textAlign = "center"; ctx.font = "bold 25px sans-serif"; ctx.fillText("WAITING FOR OPPONENT", w / 2, h / 2 - 5); ctx.fillStyle = "#6fe9ff"; ctx.font = "15px monospace"; ctx.fillText("SHARE THE ROOM CODE TO TIP OFF", w / 2, h / 2 + 26); }
      if (s?.status === "finished") { ctx.fillStyle = "rgba(4,8,20,.65)"; ctx.fillRect(0, 0, w, h); ctx.fillStyle = "#e8f5ff"; ctx.textAlign = "center"; ctx.font = "bold 34px sans-serif"; ctx.fillText("FINAL BUZZER", w / 2, h / 2); }
    };
    draw(); return () => cancelAnimationFrame(raf);
  }, []);
  const shootProps = { onPointerDown: e => { e.preventDefault(); startCharge(); }, onPointerUp: release, onPointerLeave: release, onPointerCancel: release };
  return <div className="court-wrap"><canvas ref={canvasRef} width="1000" height="560" aria-label="Basketball court game area" />{mobile && state?.status === "playing" && <div className="mobile-controls"><div className="dpad"><button onTouchStart={e => { e.preventDefault(); onMove(0, -1) }} onTouchEnd={onStop} onMouseDown={() => onMove(0, -1)} onMouseUp={onStop}>▲</button><div><button onTouchStart={e => { e.preventDefault(); onMove(-1, 0) }} onTouchEnd={onStop} onMouseDown={() => onMove(-1, 0)} onMouseUp={onStop}>◀</button><button onTouchStart={e => { e.preventDefault(); onMove(0, 1) }} onTouchEnd={onStop} onMouseDown={() => onMove(0, 1)} onMouseUp={onStop}>▼</button><button onTouchStart={e => { e.preventDefault(); onMove(1, 0) }} onTouchEnd={onStop} onMouseDown={() => onMove(1, 0)} onMouseUp={onStop}>▶</button></div></div><button className="shoot-mobile" style={{ touchAction: "none" }} {...shootProps}>HOLD · SHOOT</button></div>}</div>;
}

export default function App() {
  const socketRef = useRef(null); const moveRef = useRef({ dx: 0, dy: 0, last: 0 });
  const [connected, setConnected] = useState(false), [name, setName] = useState(""), [code, setCode] = useState(""), [room, setRoom] = useState(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [copied, setCopied] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { setMobile(window.matchMedia("(pointer: coarse)").matches); const socket = io(SERVER); socketRef.current = socket; socket.on("connect", () => setConnected(true)); socket.on("disconnect", () => setConnected(false)); socket.on("game:state", setRoom); return () => socket.disconnect(); }, []);
  const emit = (event, payload = {}) => socketRef.current?.emit(event, payload);
  const request = (event, payload = {}) => new Promise(resolve => socketRef.current.timeout(5000).emit(event, payload, (err, res) => { if (err) setError("Server timeout. Check your connection."); else if (!res?.ok) setError(res?.error || "Request failed."); else setError(""); resolve(res || { ok: false }); }));
  const create = async e => { e.preventDefault(); setBusy(true); const r = await request("room:create", { name: name || "Player 1" }); if (r.ok) setCode(r.code); setBusy(false); };
  const join = async e => { e.preventDefault(); if (code.length !== 6) { setError("Enter a 6-character room code."); return; } setBusy(true); const r = await request("room:join", { code, name: name || "Player 2" }); if (r.ok) setCode(r.code); setBusy(false); };
  const move = useCallback((dx, dy) => { moveRef.current = { dx, dy, last: Date.now() }; emit("player:move", { dx, dy }); }, []);
  const stop = useCallback(() => { moveRef.current = { dx: 0, dy: 0, last: Date.now() }; emit("player:stop"); }, []);
  const charge = useCallback(() => emit("ball:charge"), []);
  const shoot = useCallback(() => emit("ball:shoot"), []);
  useEffect(() => { const id = setInterval(() => { const m = moveRef.current; if ((m.dx || m.dy) && Date.now() - m.last > 75) { emit("player:move", { dx: m.dx, dy: m.dy }); moveRef.current.last = Date.now(); } }, 55); return () => clearInterval(id); }, []);
  const copy = async () => { try { await navigator.clipboard.writeText(room?.code || code); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { setError("Copy unavailable. Select the room code to copy it."); } };
  const rematch = () => request("game:rematch");
  const me = room?.players?.find(p => p.id === socketRef.current?.id);
  const time = Math.ceil(room?.time || 90), mm = String(Math.floor(time / 60)).padStart(2, "0"), ss = String(time % 60).padStart(2, "0");
  return <div className="app">
    <header className="header"><div className="logo"><span className="logo-icon">✦</span><div>NEON <b>HOOPS</b><small>1V1 CYBER BASKETBALL</small></div></div><div className={`connection ${connected ? "up" : ""}`}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />} {connected ? "SERVER ONLINE" : "CONNECTING"}</div></header>
    {!room ? <main className="lobby">
      <section className="intro"><div className="eyebrow"><span /> THE FUTURE OF STREETBALL</div><h1>OWN THE<br /><em>COURT.</em></h1><p>One ball. Two rivals. Ninety seconds to make your mark. Enter the neon arena and settle it on the court.</p><div className="feature-row"><span><Activity size={16} /> REAL-TIME PLAY</span><span><Radio size={16} /> PRIVATE ROOMS</span></div><div className="hero-ball">🏀<div className="ball-ring ring1" /><div className="ball-ring ring2" /></div><div className="court-label">ARENA 01 <i /> READY FOR TIP-OFF</div></section>
      <section className="join-card"><div className="card-label">PLAYER ACCESS <span>● SECURE LINK</span></div><h2>Enter the arena</h2><p>Pick a callsign, create a room, or join a rival.</p><form onSubmit={create}><label htmlFor="name">CALLSIGN</label><input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={18} placeholder="Your player name" /><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <><Gamepad2 size={18} /> Create a match <ArrowRight size={17} /></>}</button></form><div className="or"><span /> OR JOIN WITH CODE <span /></div><form onSubmit={join}><label htmlFor="code">ROOM CODE</label><div className="join-row"><input id="code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} placeholder="A7K2QX" maxLength={6} /><button className="join" disabled={busy || code.length !== 6}>Join <ArrowRight size={16} /></button></div></form>{error && <div className="error"><X size={15} />{error}</div>}<div className="card-foot"><Info size={14} /> No account needed for this demo.</div></section>
      <footer className="lobby-foot">NEON HOOPS // BUILD 01.0 <span>PLAY FAIR. PLAY FAST.</span></footer>
    </main> : <main className="game">
      <div className="game-head"><div><div className="eyebrow"><span /> LIVE MATCH // {room.code}</div><h1>THE <em>ARENA</em></h1></div><button className="leave" onClick={() => { socketRef.current.disconnect(); socketRef.current.connect(); setRoom(null); setCode(""); setError(""); }}> <X size={15} /> Leave</button></div>
      <div className="scoreboard"><div className="team team-a"><span className="team-badge">01</span><div><small>CYAN SQUAD</small><b>{room.players?.[0]?.name || "PLAYER 1"}</b></div></div><div className="score"><strong>{room.score?.[0] || 0}</strong><span>—</span><strong>{room.score?.[1] || 0}</strong><small> {room.status === "playing" ? "LIVE SCORE" : "FINAL SCORE"} </small></div><div className="team team-b"><div><small>MAGENTA SQUAD</small><b>{room.players?.[1]?.name || "PLAYER 2"}</b></div><span className="team-badge">02</span></div></div>
      <div className="timer"><span>GAME CLOCK</span><strong className={time <= 15 ? "danger" : ""}>{mm}:{ss}</strong><span className="live-pill">{room.status === "playing" ? "● LIVE" : room.status === "waiting" ? "● WAITING" : "● FINAL"}</span></div>
      <Court state={room} me={me} onMove={move} onStop={stop} onCharge={charge} onShoot={shoot} mobile={mobile} />
      <div className="controls-hint"><span>⌨ WASD / ARROWS <small>MOVE</small></span><span>HOLD SPACE <small>RELEASE AT THE TOP OF THE METER</small></span><button onClick={copy}><Copy size={14} />{copied ? "Copied" : `Room ${room.code}`}</button></div>
      {room.status === "waiting" && <div className="overlay-card"><h2>Waiting for your rival</h2><p>Send them this code to start the match.</p><button className="code-copy" onClick={copy}>{room.code} {copied ? <Check size={16} /> : <Copy size={16} />}</button></div>}
      {room.status === "finished" && <div className="overlay-card result"><Trophy size={28} /><h2>{room.score[0] === room.score[1] ? "It's a tie!" : room.score[0] > room.score[1] ? `${room.players[0]?.name || "Player 1"} wins!` : `${room.players[1]?.name || "Player 2"} wins!`}</h2><p>Final score · {room.score[0]} — {room.score[1]}</p><button className="primary" onClick={rematch}><RotateCcw size={17} /> Rematch</button>{error && <div className="error">{error}</div>}</div>}
      <footer className="game-foot">NEON HOOPS // LIVE SERVER SYNC <span>KEEP YOUR EYES ON THE BALL <span className="tiny-ball">●</span></span></footer>
    </main>}
  </div>;
}
