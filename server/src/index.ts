// Express + Socket.io bootstrap. One process serves the built client AND the
// realtime endpoint, so the whole game is a single deployable service.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  ERR,
  type ErrorPayload,
} from '../../shared/protocol';
import {
  rooms,
  getRoom,
  createRoom,
  addPlayer,
  removePlayer,
  deleteRoom,
  clampSettings,
  publicState,
  publicPlayers,
  GRACE_MS,
  type Room,
} from './rooms';
import {
  startGame,
  handleSubmit,
  handleVote,
  getRecap,
  snapshotTo,
  clearRoomTimers,
} from './game';
import { normalizeCode } from './validate';

// Nothing from the client is trusted: coerce any payload to a plain object so a
// null / non-object payload can never throw out of a socket listener.
function asObject(p: unknown): Record<string, unknown> {
  return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
}

// Last-resort safety net: a stray throw in a handler must never kill the process
// and drop every room. Log and keep serving.
process.on('uncaughtException', (e) => console.error('[uncaughtException]', e));
process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

interface SocketData {
  playerId?: string;
  code?: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const clientDist = path.resolve(__dirname, '../../client/dist');

const app = express();
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// In production we serve the built client; in dev the Vite server does that and
// proxies /socket.io here, so this block is simply skipped when dist is absent.
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
  { pingInterval: 10_000, pingTimeout: 8_000 },
);

const errFor = (code: string): ErrorPayload => {
  const messages: Record<string, string> = {
    [ERR.ROOM_NOT_FOUND]: 'Room not found',
    [ERR.ROOM_FULL]: 'Room is full',
    [ERR.NAME_TAKEN]: 'That handle is taken',
    [ERR.NEED_3_PLAYERS]: 'Need at least 3 players',
    [ERR.NOT_HOST]: 'Only the host can do that',
    [ERR.BAD_FACE]: 'Face must be symbols only',
    [ERR.IN_PROGRESS]: 'Match already in progress',
    [ERR.BAD_HANDLE]: 'Pick a handle first',
  };
  return { code, message: messages[code] ?? 'Something went wrong' };
};

function bindSocketToRoom(socket: { data: SocketData; join: (r: string) => void }, room: Room, playerId: string) {
  socket.data.code = room.code;
  socket.data.playerId = playerId;
  socket.join(room.code);
}

io.on('connection', (socket) => {
  // ── create ────────────────────────────────────────────────────────────────
  socket.on('room:create', (p, ack) => {
    const o = asObject(p);
    const { room, player } = createRoom(
      typeof o.handle === 'string' ? o.handle : '',
      socket.id,
      o.settings as Parameters<typeof createRoom>[2],
      o.lang === 'en' ? 'en' : 'ru',
    );
    bindSocketToRoom(socket, room, player.id);
    ack?.({ ok: true, code: room.code, playerId: player.id });
    io.to(room.code).emit('room:state', publicState(room));
  });

  // ── join / reconnect ────────────────────────────────────────────────────────
  socket.on('room:join', (p, ack) => {
    const o = asObject(p);
    const code = normalizeCode(o.code);
    const handle = typeof o.handle === 'string' ? o.handle : '';
    const playerId = typeof o.playerId === 'string' ? o.playerId : undefined;
    const room = getRoom(code);
    if (!room) {
      ack?.({ ok: false, error: errFor(ERR.ROOM_NOT_FOUND) });
      return;
    }
    const res = addPlayer(room, handle, socket.id, playerId);
    if (!res.ok) {
      ack?.({ ok: false, error: errFor(res.code) });
      return;
    }
    bindSocketToRoom(socket, room, res.player.id);
    ack?.({ ok: true, code: room.code, playerId: res.player.id });

    // Tell everyone the current state; announce genuinely new joiners.
    io.to(room.code).emit('room:state', publicState(room));
    if (!res.reconnected) {
      socket.to(room.code).emit('player:joined', {
        player: publicPlayers(room).find((p) => p.id === res.player.id)!,
      });
    }
    // Resync a (re)joining player who lands mid-match with the live phase payload.
    if (room.phase !== 'LOBBY') snapshotTo(io, room, socket.id);
  });

  // ── leave ────────────────────────────────────────────────────────────────────
  socket.on('room:leave', () => {
    const room = currentRoom(socket.data);
    if (!room || !socket.data.playerId) return;
    const pid = socket.data.playerId;
    socket.leave(room.code);
    finalizeRemoval(room, pid);
    socket.data.code = undefined;
    socket.data.playerId = undefined;
  });

  // ── settings (host, lobby only) ───────────────────────────────────────────────
  socket.on('room:settings', (patch) => {
    const room = currentRoom(socket.data);
    if (!room || room.hostId !== socket.data.playerId) return;
    if (room.phase !== 'LOBBY') return;
    room.settings = clampSettings(patch, room.settings);
    io.to(room.code).emit('room:state', publicState(room));
  });

  // ── start ─────────────────────────────────────────────────────────────────────
  socket.on('game:start', () => {
    const room = currentRoom(socket.data);
    if (!room || !socket.data.playerId) return;
    const err = startGame(io, room, socket.data.playerId);
    if (err) socket.emit('error', errFor(err));
  });

  // ── submit face ─────────────────────────────────────────────────────────────
  socket.on('face:submit', (p) => {
    const room = currentRoom(socket.data);
    if (!room || !socket.data.playerId) return;
    const glyphs = asObject(p).glyphs;
    // validFace rejects non-strings, so passing through is safe.
    const err = handleSubmit(io, room, socket.data.playerId, glyphs as string);
    if (err === 'BAD_FACE') socket.emit('error', errFor(ERR.BAD_FACE));
  });

  // ── cast vote ─────────────────────────────────────────────────────────────────
  socket.on('vote:cast', (p) => {
    const room = currentRoom(socket.data);
    if (!room || !socket.data.playerId) return;
    const faceId = asObject(p).faceId;
    if (typeof faceId !== 'string') return;
    handleVote(io, room, socket.data.playerId, faceId);
  });

  // ── recap ───────────────────────────────────────────────────────────────────
  socket.on('recap:request', (ack) => {
    const room = currentRoom(socket.data);
    ack?.(room ? getRecap(room) : null);
  });

  // ── disconnect (hold the slot for a grace window) ─────────────────────────────
  socket.on('disconnect', () => {
    const room = currentRoom(socket.data);
    if (!room || !socket.data.playerId) return;
    const player = room.players.get(socket.data.playerId);
    if (!player) return;
    // Ignore a stale socket whose player already reconnected on a newer socket —
    // otherwise an old socket's late close would tear down a live player.
    if (player.socketId !== socket.id) return;
    player.connected = false;
    player.socketId = null;
    io.to(room.code).emit('room:state', publicState(room));

    const pid = player.id;
    player.disconnectTimer = setTimeout(() => finalizeRemoval(room, pid), GRACE_MS);
  });
});

// Resolve the room a socket currently belongs to.
function currentRoom(data: SocketData): Room | undefined {
  return data.code ? getRoom(data.code) : undefined;
}

// Remove a player for good, migrating host / deleting the room as needed.
function finalizeRemoval(room: Room, playerId: string): void {
  const { empty } = removePlayer(room, playerId);
  if (empty) {
    clearRoomTimers(room);
    deleteRoom(room);
    return;
  }
  io.to(room.code).emit('player:left', { playerId });
  io.to(room.code).emit('room:state', publicState(room));
}

httpServer.listen(PORT, () => {
  const mode = existsSync(clientDist) ? 'serving client + sockets' : 'sockets only (dev: use Vite on 5173)';
  // eslint-disable-next-line no-console
  console.log(`KAO server on :${PORT} — ${mode}`);
});
