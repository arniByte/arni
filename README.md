# KAO // 顔 — `[ ◕‿◕ ]`

> **WHEN WORDS ARE NOT ENOUGH**

A realtime, no-words online party game. You get a **situation**, you build a **face** out of pure Unicode (kaomoji / symbols — letters & digits are hard-blocked), and everyone **votes** on whose face nailed the vibe. Every match ends with a shareable recap card with a built-in play link.

*One sentence: you get a situation, you build a face, everyone votes for the best one.*

- No accounts, no database. Join with a 4-character room code (Jackbox / skribbl model).
- Mobile-first, cold monospace "terminal" aesthetic.
- One Node process serves the built client **and** the Socket.io endpoint.

---

## Quick start

```bash
npm install
npm run dev      # client on http://localhost:5173 (proxies sockets to the server on :3000)
```

Open a few browser tabs at <http://localhost:5173>, create a room in one, join with the code in the others (you need **≥ 3 players** to start).

### Production

```bash
npm run build    # builds the client into client/dist
npm start        # one process serves client/dist + sockets on $PORT (default 3000)
```

Then open <http://localhost:3000>.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Runs the server (`tsx watch`) and the Vite dev server concurrently. |
| `npm run build` | Vite-builds the client to `client/dist`. |
| `npm start` | Runs the production server (serves `client/dist` + sockets). |
| `npm run typecheck` | `tsc --noEmit` across `shared/`, `server/`, `client/`. |

---

## Configuration (env)

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port the Node server listens on (serves client + Socket.io). |
| `PUBLIC_URL` | _(empty)_ | Absolute base URL used to build the recap **join link** (e.g. `https://kao.example.com`). If unset, the client composes the link from `window.location.origin`, so it still works locally. |

> WebSockets: the game uses Socket.io on the **same port** as the HTTP server — no separate websocket port. Any host that supports a long-running Node process and WebSocket upgrades works.

---

## Deploy (persistent Node host: Render / Railway / Fly)

The whole game is one deployable service. It needs a host that keeps a **process alive** and allows **WebSocket** connections (the server holds live sockets, in-memory rooms, and the authoritative round timers). Render, Railway, and Fly all do. **Vercel/Netlify serverless does _not_** — they can't keep WebSockets open or share in-memory state between invocations, so the realtime backend can't run there.

### Render (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/arniByte/arni)

This repo ships a [`render.yaml`](./render.yaml) blueprint. Click the button (or **New + → Blueprint** in the dashboard and pick this repo). Render runs `npm install --include=dev && npm run build`, then `npm start`, injects `$PORT`, and health-checks `/healthz`. You'll get a public `https://<name>.onrender.com` URL playable on any device.

> Render's **free** web service spins down after ~15 min idle, so the first visitor after a quiet spell waits ~30s for a cold start. Any paid plan stays warm.

### Railway / Fly / any Docker host

This repo ships a [`Dockerfile`](./Dockerfile). On **Railway**: New Project → Deploy from GitHub repo → it auto-detects the Dockerfile and injects `$PORT`. On **Fly**: `fly launch` (uses the Dockerfile). Railway doesn't spin down.

### Config

- `PORT` — injected by the platform; the server reads it.
- `PUBLIC_URL` _(optional)_ — your public origin for recap join links. If unset, the client composes the link from `window.location.origin`, so it works regardless.

No database, no external services. Rooms live in memory and are cleaned up when empty, so a restart simply clears active rooms.

> **Why not Vercel?** KAO's backend is a stateful realtime server. Vercel serverless functions are stateless and short-lived and can't hold WebSocket connections — so multiplayer would be dead there. Use a persistent host (above), or split it (Vercel for the static client + a persistent host for the server, with CORS + a configured server URL).

---

## How it works

### Architecture

```
shared/protocol.ts     # the wire contract: event maps, payload types, constants (imported by BOTH sides)
server/
  src/index.ts         # express + socket.io bootstrap, disconnect/grace, serves client/dist
  src/rooms.ts         # Room model: create / join / reconnect / leave / host migration (pure data)
  src/game.ts          # authoritative phase state machine + timers + scoring + recap + reconnect snapshot
  src/validate.ts      # face/handle validation — the server re-checks everything
  src/situations.ts    # 165 situation prompts
client/
  index.html
  src/main.ts          # mount + global countdown clock
  src/net.ts           # socket client, actions, server-event -> state, auto-resume on reconnect
  src/state.ts         # tiny state store + pub/sub
  src/render.ts        # view-key-gated render loop (won't clobber interactive screens) + toast
  src/components/      # faceBuilder (the mechanic), palettes, kaomoji preview, shared UI/chrome
  src/screens/         # home / lobby / build / vote / result / recap
  src/recap/recapCard.ts  # html2canvas + qrcode -> shareable PNG
  src/styles/          # tokens.css (design tokens) + app.css (components)
```

No UI framework — the client is vanilla TypeScript with a ~30-line hyperscript helper (`dom.ts`) and a small pub/sub store. Bundled with Vite. The server runs directly from TypeScript via `tsx` (the only build step is the Vite client build).

### The server is authoritative

Clients render `endsAt` countdowns locally but **never** advance phases. The server:

- owns every phase transition and timer (`BUILD → VOTE → RESULT → …`),
- **re-validates every face** (letters/digits blocked on the server too) and ignores anything that arrives after a phase deadline,
- dedupes submissions per author and **anonymizes + shuffles** faces for voting (a face's author is never revealed before the result),
- rejects self-votes, gives non-submitters a placeholder so a missing player never stalls the round,
- migrates the host if the host leaves and deletes empty rooms,
- holds a disconnected player's slot for a short grace window so a refresh reconnects by `playerId` and resyncs the live phase.

### Game rules

- **Phases:** `LOBBY → (BUILD 45s → VOTE 25s → RESULT 8s) × rounds → END`
- **Players:** 3–12 (min 3 so no-self-vote works). **Rounds:** 3–8 (default 5). Timers are host-configurable in the lobby.
- **Scoring:** each vote = **+100** to the face's author. A **perfect read** (every voter — ≥2 of them — converges on one single face) adds a bonus and is tagged `PERFECT READ`.
- **Winner:** top cumulative score; ties broken by best single-round vote count, then earliest to join.

### The face constructor

Three input modes over one big live preview:

- **Slots** — 5 tap-to-cycle slots `[ bracket · eye · mouth · eye · bracket ]` plus arm toggles.
- **Free-type** — a symbols-only field; ASCII **and** full-width letters/digits are stripped live, capped at 28 code points.
- **Presets / Random** — seed chips (flip, shrug, sparkle, dead, love, smug) + a `RANDOM` roll.

Validation is enforced on the client (for feel) **and** re-enforced on the server (for trust):

```ts
const BLOCK = /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/; // ASCII + full-width letters/digits
// valid: 1..28 code points and no blocked characters
```

### The recap card (the growth loop)

At match end the client renders a hidden, exactly-styled **1600×900** node and exports a PNG with `html2canvas`: header wordmark + tagline, one row per round (`situation · winning face · @handle · N votes`), and a footer with the join URL + a QR code. Actions: **Download PNG**, native **Share** (`navigator.share` with the file, falling back to download), and **Share to X** (prefilled intent + join link).

---

## Tech

Node + Express + Socket.io (server, authoritative, in-memory) · TypeScript + Vite (vanilla client) · `html2canvas` + `qrcode` (recap) · run with `tsx`. Identity is just `{ playerId (uuid in localStorage), handle }` — no auth.

To rebrand, change the single `BRAND` constant in `shared/protocol.ts`.
