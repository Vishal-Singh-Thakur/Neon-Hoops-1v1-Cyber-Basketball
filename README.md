# Neon Hoops — 1v1 Neon Basketball

A runnable real-time browser basketball MVP built with React, Vite, Node.js and Socket.IO.

## Included
- Create/join a 6-character private room.
- 1v1 realtime court with two player avatars and a shared ball.
- Keyboard controls: WASD / arrow keys to move; hold Space to charge the shot meter, release at the top to shoot.
- Skill-based shooting: accuracy depends on meter timing (PERFECT / GOOD / EARLY / LATE), distance to the rim, a nearby defender (contested shots) and shooting on the move. Missed shots bounce off the backboard/wall as live rebounds; the opponent can block a shot by intercepting it.
- Server-authoritative movement, ball pickup, shot timing and accuracy, rim detection, score and 90-second match timer.
- Responsive neon dashboard, room code copy, connection status, match result and rematch.
- No database required.

## Requirements
Node.js 18+ (Node 20 LTS recommended), npm 9+.

## Run
From the project root:
```bash
npm install
npm run dev
```
Open the Vite URL printed by Vite (normally http://localhost:5173) in two browser tabs/devices. Create a room in one and join the room code in the other. Server health check: http://localhost:3001/health

## Controls
- Player 1 / left side: WASD or arrow keys
- Player 2 / right side: WASD or arrow keys on their own device
- Hold Space while carrying the ball: a meter fills up and down. Release at the top (green zone) for a perfect shot.
- On mobile, use the on-screen directional pad and hold/release the SHOOT button.

## Production deployment
Deploy `client` to a static host and `server` to a Node host with WebSocket support.
Set `VITE_SERVER_URL` in `client/.env` to the public server URL, e.g. `https://your-game-server.example`.
Set `CLIENT_ORIGIN` on server to your frontend origin, e.g. `https://your-game.example`; set `PORT` if required by host.
Use HTTPS/WSS in production. This MVP uses in-memory rooms and does not persist matches. Add rate limiting, validation, tests, monitoring and production security controls before public scale.

## Contest checklist
The uploaded Handshake AI Skills Studio × OpenAI Multiplayer Game Challenge rules require: project title, cover image, description and project URL submitted to the “Create a Multiplayer Game” mission before the deadline. The rules score Execution, Creativity, Usefulness/Value, and Polish & Thoughtfulness at 25% each. Test the public link with two real browser sessions and only describe features that are implemented and verified. Deadline in the rules: October 30, 2026, 11:59 PM Pacific Time.
