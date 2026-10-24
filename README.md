# Skribbl Clone

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

## Notes

Bans are based on IP address. On localhost, browser tabs share the same IP address.
