import express from "express";
import http from "node:http";
import cors from "cors";
import { Server } from "socket.io";
import { randomInt } from "node:crypto";

const PORT = Number(process.env.PORT || 3001);
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map(s => s.trim());
const app = express();
app.use(cors({ origin: origins }));
app.get("/health", (_req, res) => res.json({ ok: true, service: "neon-hoops", rooms: rooms.size }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: origins, methods: ["GET", "POST"] } });

const W = 1000, H = 560, PLAYER_R = 18, BALL_R = 10;
// Rim centers sit 62px in from each end; backboards 40px in. Side 0 attacks the right rim, side 1 the left.
const RIM_OFF = 62, RIM_HALF = 24, BOARD_OFF = 40, BOARD_HALF = 58;
const SHOT_POWER = 28, METER_MS = 1100;
// Shot meter: triangle wave 0 -> 1 -> 0 over METER_MS. Releasing near the top (1) is a perfect shot.
const meterAt = ms => { const ph = (ms % METER_MS) / METER_MS; return ph < .5 ? ph * 2 : 2 - ph * 2; };
const freshBall = () => ({x:W/2,y:H/2,vx:0,vy:0,owner:null,shooter:null});
const rooms = new Map();
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const makeCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do { code = Array.from({length: 6}, () => chars[randomInt(chars.length)]).join(""); } while (rooms.has(code));
  return code;
};
function newPlayer(id, name, side) {
  return { id, name, side, x: side === 0 ? 170 : 830, y: H/2, vx: 0, vy: 0, connected: true };
}
function createRoom(code, socket, name) {
  const room = {
    code, players: [newPlayer(socket.id, name, 0)], ball: freshBall(),
    score: [0,0], time: 90, status: "waiting", lastScorer: null, tick: null, lastShot: 0, event: null, eventId: 0
  };
  rooms.set(code, room); socket.join(code); return room;
}
function snapshot(room) {
  return { code: room.code, players: room.players.map(p => ({id:p.id,name:p.name,side:p.side,x:p.x,y:p.y,connected:p.connected})),
    ball: {...room.ball}, score:[...room.score], time:room.time, status:room.status, lastScorer:room.lastScorer, event:room.event, court:{width:W,height:H} };
}
function emitEvent(room, type, side, extra={}) { room.event = {id: ++room.eventId, type, side, ...extra}; }
function takeBall(room, p) {
  const b = room.ball;
  if (b.shooter !== null && b.shooter !== p.side) emitEvent(room, "block", p.side);
  b.owner = p.id; b.shooter = null; p.chargeAt = null;
}
function broadcast(room) { io.to(room.code).emit("game:state", snapshot(room)); }
function start(room) {
  if (room.tick) clearInterval(room.tick);
  room.status = "playing"; room.time = 90; room.score = [0,0]; room.lastScorer = null; room.event = null;
  room.ball = freshBall();
  room.players.forEach((p,i) => { p.x = i===0 ? 170 : 830; p.y=H/2; p.vx=0; p.vy=0; });
  room.tick = setInterval(() => {
    if (room.status !== "playing") return;
    room.time = Math.max(0, room.time - 0.05);
    const b = room.ball;
    if (b.owner) {
      const owner = room.players.find(p => p.id === b.owner);
      if (owner) { b.x = owner.x + (owner.side===0 ? 22 : -22); b.y = owner.y + 7; b.vx=0; b.vy=0; }
      else b.owner = null;
    } else {
      const px = b.x, py = b.y;
      b.x += b.vx; b.y += b.vy;
      // Shots fly at constant speed until they reach the rim; loose balls roll and slow down.
      if (b.shooter === null) { b.vx *= .985; b.vy *= .985; }
      // A shot scores only if it crosses its target rim line inside the rim; otherwise it's a miss and a live rebound.
      let scored = false;
      if (b.shooter !== null) {
        const rimX = b.shooter===0 ? W-RIM_OFF : RIM_OFF;
        if (b.shooter===0 ? px<rimX && b.x>=rimX : px>rimX && b.x<=rimX) {
          const yAt = py + (b.y-py) * (rimX-px) / (b.x-px);
          if (Math.abs(yAt-H/2) <= RIM_HALF) { score(room, b.shooter, b.shotLabel); scored = true; }
          else { emitEvent(room, "miss", b.shooter); b.shooter = null; }
        }
      }
      if (!scored) {
        // Backboards bounce the ball back into play.
        for (const bx of [BOARD_OFF, W-BOARD_OFF]) {
          if ((px-bx)*(b.x-bx) < 0 && Math.abs(b.y-H/2) <= BOARD_HALF) { b.x = bx + Math.sign(px-bx); b.vx *= -0.55; }
        }
        if (b.y < BALL_R || b.y > H-BALL_R) b.vy *= -0.82;
        if (b.x < BALL_R || b.x > W-BALL_R) b.vx *= -0.82;
        b.x=clamp(b.x,BALL_R,W-BALL_R); b.y=clamp(b.y,BALL_R,H-BALL_R);
        for (const p of room.players) {
          if (Math.hypot(p.x-b.x,p.y-b.y) < PLAYER_R+BALL_R+3 && Math.hypot(b.vx,b.vy)<5) { takeBall(room,p); break; }
        }
      }
    }
    if (room.time <= 0) {
      room.time=0; room.status="finished"; clearInterval(room.tick); room.tick=null;
    }
    broadcast(room);
  }, 50);
}
function score(room, side, label) {
  room.score[side] += 2;
  room.lastScorer = room.players[side]?.name || (side===0?"Player 1":"Player 2");
  emitEvent(room, "score", side, {label});
  room.ball = freshBall();
  room.players.forEach((p,i) => { p.x=i===0?170:830; p.y=H/2; });
}
function getRoom(socket) { return [...rooms.values()].find(r => r.players.some(p=>p.id===socket.id)); }
io.on("connection", socket => {
  socket.emit("server:ready", {ok:true});
  socket.on("room:create", ({name}={}, cb=()=>{}) => {
    if (getRoom(socket)) return cb({ok:false,error:"You are already in a room."});
    const code=makeCode(), room=createRoom(code,socket,String(name||"Player 1").trim().slice(0,18)||"Player 1");
    cb({ok:true,code}); broadcast(room);
  });
  socket.on("room:join", ({code,name}={}, cb=()=>{}) => {
    if (getRoom(socket)) return cb({ok:false,error:"You are already in a room."});
    const room=rooms.get(String(code||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));
    if (!room) return cb({ok:false,error:"Room not found. Check the 6-character code."});
    if (room.players.length>=2) return cb({ok:false,error:"Room is full."});
    // Take whichever side is free (the remaining player may be side 1 after a disconnect) and keep players[i].side === i.
    const side=room.players[0]?.side===1?0:1;
    room.players.push(newPlayer(socket.id,String(name||`Player ${side+1}`).trim().slice(0,18)||`Player ${side+1}`,side));
    room.players.sort((a,b)=>a.side-b.side);
    socket.join(room.code); start(room); cb({ok:true,code:room.code}); broadcast(room);
  });
  socket.on("player:move", ({dx=0,dy=0}={}) => {
    const room=getRoom(socket); if (!room || room.status!=="playing") return;
    const p=room.players.find(p=>p.id===socket.id); if (!p) return;
    // Clients send ~every 55ms; drop faster bursts so spamming moves can't act as a speed hack.
    const now=Date.now(); if (now-(p.lastMove||0)<40) return; p.lastMove=now;
    dx=clamp(Number(dx)||0,-1,1); dy=clamp(Number(dy)||0,-1,1);
    const speed=4.1;
    p.vx=dx*speed; p.vy=dy*speed;
    p.x=clamp(p.x+p.vx,PLAYER_R,W-PLAYER_R); p.y=clamp(p.y+p.vy,PLAYER_R,H-PLAYER_R);
    // Player bodies gently repel each other.
    const other=room.players.find(q=>q.id!==p.id);
    if (other && Math.hypot(p.x-other.x,p.y-other.y)<PLAYER_R*2) {
      const a=Math.atan2(p.y-other.y,p.x-other.x); p.x=clamp(p.x+Math.cos(a)*3,PLAYER_R,W-PLAYER_R); p.y=clamp(p.y+Math.sin(a)*3,PLAYER_R,H-PLAYER_R);
    }
    const b=room.ball;
    if (b.owner===p.id) { b.x=p.x+(p.side===0?22:-22); b.y=p.y+7; }
    else if (!b.owner && Math.hypot(p.x-b.x,p.y-b.y)<PLAYER_R+BALL_R+4) takeBall(room,p);
    broadcast(room);
  });
  socket.on("player:stop", () => {
    const room=getRoom(socket); const p=room?.players.find(p=>p.id===socket.id); if(p){p.vx=0;p.vy=0;}
  });
  // Hold to charge (starts the meter), release to shoot. Timing is measured on the server so clients can't fake a perfect release.
  socket.on("ball:charge", () => {
    const room=getRoom(socket); const p=room?.players.find(p=>p.id===socket.id);
    if(p && room.ball.owner===p.id) p.chargeAt=Date.now();
  });
  socket.on("ball:shoot", () => {
    const room=getRoom(socket); if(!room || room.status!=="playing") return;
    const p=room.players.find(p=>p.id===socket.id), b=room.ball;
    if(!p || b.owner!==p.id || Date.now()-room.lastShot<450) return;
    const now=Date.now(), q=p.chargeAt ? meterAt(now-p.chargeAt) : 0;
    const rising=p.chargeAt && (now-p.chargeAt)%METER_MS < METER_MS/2;
    room.lastShot=now; p.chargeAt=null; b.owner=null; b.shooter=p.side;
    b.shotLabel = q>=.9 ? "PERFECT" : q>=.7 ? "GOOD" : rising ? "EARLY" : "LATE";
    const rimX=p.side===0?W-RIM_OFF:RIM_OFF, dx=rimX-b.x, dy=H/2-b.y, dist=Math.hypot(dx,dy)||1;
    const other=room.players.find(o=>o.id!==p.id);
    const defender=other ? Math.hypot(other.x-p.x,other.y-p.y) : Infinity;
    const contest=defender<80 ? 0.1*(1-defender/80) : 0;
    const moving=p.vx!==0 || p.vy!==0;
    // Spread grows with bad timing, distance, a close defender and shooting on the move.
    const spread=0.025+(1-q)*0.32+dist/1000*0.07+contest+(moving?0.035:0);
    const angle=Math.atan2(dy,dx)+(Math.random()+Math.random()-1)*spread;
    b.vx=Math.cos(angle)*SHOT_POWER; b.vy=Math.sin(angle)*SHOT_POWER;
    emitEvent(room, "shot", p.side, {label:b.shotLabel, contested:contest>0});
    broadcast(room);
  });
  socket.on("game:rematch", (_payload, cb=()=>{}) => {
    const room=getRoom(socket); if(!room || room.players.length!==2) return cb({ok:false,error:"Both players must be in the room."});
    start(room); cb({ok:true}); broadcast(room);
  });
  socket.on("disconnect", () => {
    for (const [code,room] of rooms) {
      const index=room.players.findIndex(p=>p.id===socket.id);
      if(index!==-1) {
        room.players.splice(index,1);
        if(room.tick) clearInterval(room.tick);
        room.tick=null; room.status="waiting";
        if(room.players.length===0) rooms.delete(code);
        else { room.ball=freshBall(); broadcast(room); }
        break;
      }
    }
  });
});
server.listen(PORT,()=>console.log(`Neon Hoops server running on http://localhost:${PORT}`));
