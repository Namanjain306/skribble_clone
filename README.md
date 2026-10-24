# Skribbl Clone

**Live Demo:** https://skribble-clone-yns3.onrender.com/

A real-time multiplayer drawing and guessing game inspired by Skribbl.io. Create a room, invite friends, take turns drawing, and guess the secret word before time runs out.

## Features

- Public and private rooms with shareable room codes and links
- Customizable rounds, timers, word categories, and custom words
- Live drawing canvas with colors, brush sizes, eraser, undo, and clear
- Real-time chat, hints, scoring, and leaderboard
- Ready-up, spectator mode, replay, and play-again flow
- Host moderation tools, including kick, ban, and vote-kick
- English, Spanish, and Romanized Hindi word options

## Tech stack

React, TypeScript, Vite, Node.js, Express, Socket.IO, and HTML Canvas.

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). For frontend hot reload, run `npm run dev` in a second terminal and open [http://localhost:5173](http://localhost:5173).

## Deploy on Render

This app uses a persistent Socket.IO server, so deploy it as a Render **Web Service** (WebSockets are supported). The included `render.yaml` provides the service configuration. The build runs `npm install` and the start command is `npm start`.

## Project layout

- `server.js` — Express server, game and room logic, and Socket.IO event handling
- `src/` — React and TypeScript client
- `render.yaml` — Render deployment configuration

## Architecture

- **WebSockets (Socket.IO):** Drawing, guesses, chat and game state all sync in real time. The client emits events
  (`draw_start`, `draw_move`, `draw_end`, `guess`, `word_chosen`...) and the server validates and broadcasts them.
- **Canvas:** Strokes are captured with pointer events and sent as normalised (0-1) coordinates, so every screen size
  renders the same. The server stores strokes, so late joiners get the full drawing and undo works for everyone.
- **Game logic (OOP):** `Player`, `Game` (rounds, turn order, word choice, hints, scoring), `Room` (players, settings,
  broadcast, moderation) and `MessageHandler` (routes all socket events).
- **Word matching:** guesses are trimmed and lower-cased; an exact match scores, and a one-letter-off guess gets a private "close!" hint.
- **Scoring:** guesser gets `50 + 450 x timeLeft/drawTime`; the drawer gets +30 for each correct guess.
- **Deployment:** one Node service serves both the built React app and the Socket.IO server. Render supports WebSockets;
  Vercel and Netlify do not host long-lived WebSocket servers, so they would need a separate backend.

## Notes

Bans are based on IP address. On localhost, browser tabs share the same IP address.
