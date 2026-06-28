# KAO // 顔 — `[ ◕‿◕ ]`

> **WHEN WORDS ARE NOT ENOUGH**

A realtime, no-words online party game. You get a **situation**, you build a **face** out of pure Unicode (kaomoji / symbols — letters & digits are hard-blocked), and everyone **votes** on whose face nailed the vibe. Every match ends with a shareable recap card with a built-in play link.

*One sentence: you get a situation, you build a face, everyone votes for the best one.*

- No accounts, no database. Join with a 4-character room code (Jackbox / skribbl model).
- **Three game modes:** CLASSIC (everyone gets the same situation, vote the best), IMPOSTOR (one player secretly gets a *different* situation — find them), and **BLITZ** (a fast 2-player duel — race to build, then guess which situation drove your rival's face).
- **Post-match "top moments" review** — scroll back through every round to see who built what and the votes.
- Mobile-first, **glassmorphism** UI with a vivid **neon magenta-pink** accent; light (default) + dark themes.
- **Russian default, English toggle.** Telegram Mini App-aware (safe-area handling).
- **Synthesized, file-free sound** (Web Audio): adaptive taps, phase cues, countdown ticks, and a quiet **8-bit chiptune** — all muteable.
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

### Vercel (static client) + Render (server) — split deploy

Vercel can host the **client** for free from GitHub, but **not** the realtime server (serverless can't hold WebSockets). So pair it with a server on Render/Railway:

1. **Server** → deploy to Render/Railway (above). Copy its URL, e.g. `https://kao.onrender.com`.
2. **Client on Vercel** → Import the repo (Vercel reads [`vercel.json`](./vercel.json): build `npm run build`, output `client/dist`). Add an env var **`VITE_SERVER_URL`** = your server URL, then deploy.
3. The client connects to `VITE_SERVER_URL` when set (otherwise same-origin). The server allows cross-origin sockets by default; restrict it with `CORS_ORIGIN` (comma-separated origins) if you like.

> **Why the split?** KAO's backend is a stateful realtime server. Vercel serverless functions are stateless/short-lived and can't hold WebSocket connections, so the server lives on a persistent host while Vercel just serves the static client.

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
  index.html            # fonts (Space Mono + JetBrains Mono + Unbounded + Noto Sans JP), Telegram SDK, favicon
  src/main.ts           # mount + global countdown clock + sound/Telegram/parallax init
  src/net.ts            # socket client, actions, server-event -> state, auto-resume on reconnect
  src/state.ts          # tiny state store + pub/sub
  src/render.ts         # view-key-gated render loop (won't clobber interactive screens) + toast + phase sound
  src/i18n.ts           # RU/EN dictionaries + t(), pluralization, theme get/set
  src/sound.ts          # Web Audio sound engine (taps, phase cues, ticks, ambient pad) — no audio files
  src/viewport.ts       # Telegram safe-area insets + scroll parallax for the background faces
  src/components/       # faceBuilder (the mechanic), palettes, kaomoji preview, ui chrome,
                        #   icons (inline SVG), rulesModal, reviewModal, animatedFace, bgFaces
  src/screens/          # home / lobby / build / vote / result / recap / blitz (duel screens)
  src/recap/recapCard.ts  # html2canvas + qrcode -> shareable PNG
  src/styles/           # tokens.css (design tokens, themes, grid, aurora) + app.css (components)
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
- **Players:** 3–12 (min 3 so no-self-vote works). **Rounds:** 3–8 (default 5). Timers + mode are host-configurable in the lobby.
- **Modes:**
  - **CLASSIC** — everyone gets the **same** situation; build the face that reads it best, collect votes.
  - **IMPOSTOR** — one player secretly gets a **different** situation. Everyone builds faces, then hunts the one that doesn't fit. The room scores for catching the impostor; the impostor scores (`IMPOSTOR_EVADE`) for slipping by. Best with 4–5 players.
  - **BLITZ** (exactly **2 players**) — a twitch duel with its own phase flow `BLITZ_BUILD → BLITZ_GUESS → BLITZ_RESULT`. Each round both players secretly get **their own** situation and race to build a face; then each **guesses which of the two real situations drove the opponent's face** (server-checkable truth — no third-party voter). Points for the READ (+100), being legible / EXPRESSION (+60), SPEED (+40), a read-streak COMBO multiplier, and a shared SYNC bonus when both read each other. The end **scorecard** shows the scoreline, a **СИНХРОН %** couples-test stat, per-player streak / fastest-face / read-accuracy, and the "biggest misread" comedy pin. Disconnect/forfeit hands the win to the remaining player.
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

## Look & feel (client experience)

The client is deliberately "no framework" but heavily designed. Everything below is driven by CSS custom properties + small vanilla modules, so it stays tiny (~29 KB gzip main bundle; `html2canvas` is lazy-loaded only for the recap export).

- **Themes** — light (default) + dark, toggled in the menu and persisted (`kao.theme`); applied before first paint to avoid a flash. All colors are tokens in `tokens.css`; `[data-theme="dark"]` overrides them.
- **Accent** — a vivid **neon magenta-pink** (`--cyan` token name is legacy): `#fb1fa0` light / `#ff58c0` dark for fills/buttons/mascot, with a deeper `--accent-text` (`#bd1379` light) for small text so it clears WCAG AA.
- **Glassmorphism** — panels, top bar, vote cards, modal and icon buttons are frosted glass: a `backdrop-filter` blur/saturate over a gradient + a radial **specular sheen**, an inset bright **edge**, and a faint accent **refraction** glow. Behind the glass, soft **aurora** color blobs drift so there's real color to frost.
- **Pinned grid + parallax** — the lattice is a `position:fixed` layer (`html::before`), so the floating background kaomoji (`bgFaces`) and content **slide over a stationary grid** as you scroll; the faces also drift continuously and parallax on scroll (`viewport.ts`).
- **Fonts** — **Space Mono** (Latin) + **JetBrains Mono** (Cyrillic body) for the mono UI, paired with **Unbounded** for the big display headlines (full Cyrillic).
- **Sound** (`sound.ts`) — a synthesized, file-free Web Audio engine: **adaptive taps** (each press walks a pentatonic scale), **phase cues** (a motif per `BUILD/VOTE/RESULT/RECAP`), **countdown ticks** in the final seconds, and a quiet looping **8-bit chiptune** (a lookahead-scheduled square-lead arpeggio over C–G–Am–F + a triangle bass). The `AudioContext` is created/resumed only on the first user gesture (autoplay-safe); a menu toggle mutes everything and persists (`kao.muted`).
- **Match review** (`components/reviewModal.ts`) — after a CLASSIC/IMPOSTOR match, a "★ ТОП МОМЕНТЫ" button opens a per-round breakdown (every face + votes, winner starred, impostor revealed) plus the single highest-voted "top moment". Fed by `MatchEndPayload.rounds` (the server keeps `roundHistory`).
- **i18n** (`i18n.ts`) — flat RU/EN dictionaries + `t(key, params)` with Russian plural rules; **Russian is the default**, English is a toggle.
- **Telegram Mini App** — `viewport.ts` reads the WebApp safe-area + content-safe-area insets and exposes them as `--safe-top`/`--safe-bottom` so the floating top bar clears Telegram's fullscreen header and stays tappable; `env(safe-area-inset-*)` is the non-Telegram fallback.
- **Rules modal** — a "how to play" overlay (help icon) explaining the flow + both modes, in RU/EN.
- **Readable result/recap rows** — kaomoji shown in compact list rows (result "the rest", recap card preview) render on a single line via `.face-cell` (`white-space:nowrap; overflow:hidden`) so wide faces never wrap into mush; long situations truncate with an ellipsis. The vote instruction is a prominent bottom `.cue`; the IMPOSTOR reveal uses a bold accent label + a **filled** verdict pill (`.verdict.caught`/`.evaded`) instead of tiny low-contrast tags; the recap "leave" is a clearly-bordered `.btn.outline`.
- **Accessibility** — keyboard focus rings (`:focus-visible`), `prefers-reduced-motion` disables the animations (incl. press/hover transforms), and accent/secondary text colors are tuned to clear WCAG AA contrast.

---

## Tech

Node + Express + Socket.io (server, authoritative, in-memory) · TypeScript + Vite (vanilla client) · `html2canvas` + `qrcode` (recap, lazy-loaded) · Web Audio (sound) · run with `tsx`. Identity is just `{ playerId (uuid in localStorage), handle }` — no auth.

To rebrand, change the single `BRAND` constant in `shared/protocol.ts`. To re-accent, change `--cyan`/`--accent-text` (+ aura/glass tokens) in `client/src/styles/tokens.css`.
