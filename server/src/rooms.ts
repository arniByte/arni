// Room model + lifecycle: create / join / reconnect / leave / host migration.
// Pure data layer — no socket emits live here (index.ts owns broadcasting).
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_SETTINGS,
  LIMITS,
  type Phase,
  type Lang,
  type Settings,
  type PublicPlayer,
  type RoomStatePayload,
  type RoundResultPayload,
  type MatchEndPayload,
  type BlitzRoundResultPayload,
  type BlitzMatchEndPayload,
  ERR,
} from '../../shared/protocol';
import { sanitizeHandle } from './validate';

export interface Player {
  id: string;
  handle: string;
  score: number;
  connected: boolean;
  socketId: string | null;
  faceAvatar?: string; // last REVEALED face — never set mid-round (preserves anonymity)
  bestRoundVotes: number; // tie-break: highest votes earned in a single round
  joinSeq: number; // tie-break: lower = joined earlier
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

// One face built by one author in the current round.
export interface Submission {
  faceId: string;
  authorId: string;
  authorHandle: string; // snapshot so results survive a mid-match leave
  glyphs: string;
  submittedAt: number;
  auto: boolean; // true = placeholder for a non-submitter
}

// Winning face of a finished round, accumulated for the recap card.
export interface RecapRound {
  situation: string;
  glyphs: string;
  handle: string;
  votes: number;
}

// BLITZ (2-player duel) per-match state.
export interface BlitzState {
  promptKey: Map<string, 'A' | 'B'>; // playerId -> which situation they got
  text: { A: string; B: string };
  choiceKey: ('A' | 'B')[]; // shuffled order: token index -> situation key
  guess: Map<string, 'A' | 'B'>; // playerId -> guessed key
  roundWins: Map<string, number>;
  streak: Map<string, number>;
  longestStreak: Map<string, number>;
  fastestMs: Map<string, number>;
  readHits: Map<string, number>;
  readCount: Map<string, number>;
  syncRounds: number;
  roundsPlayed: number;
  buildStart: number; // when the current race started (for fastest-build stats)
  worstRead: { situation: string; glyphs: string; guessedAs: string; handle: string } | null;
  lastResult?: BlitzRoundResultPayload;
  lastEnd?: BlitzMatchEndPayload;
}

export function newBlitzState(): BlitzState {
  return {
    promptKey: new Map(),
    text: { A: '', B: '' },
    choiceKey: [],
    guess: new Map(),
    roundWins: new Map(),
    streak: new Map(),
    longestStreak: new Map(),
    fastestMs: new Map(),
    readHits: new Map(),
    readCount: new Map(),
    syncRounds: 0,
    roundsPlayed: 0,
    buildStart: 0,
    worstRead: null,
  };
}

export interface Room {
  code: string;
  hostId: string;
  players: Map<string, Player>;
  phase: Phase;
  settings: Settings;
  lang: Lang; // language of the situation prompts for this room
  roundIndex: number; // -1 in lobby; 0-based during play

  // per-round transient state
  situation: string;
  decoySituation: string; // IMPOSTOR mode: the impostor's different situation
  impostorId: string | null; // IMPOSTOR mode: who is the impostor this round
  usedSituations: Set<string>;
  submissions: Map<string, Submission>; // authorId -> submission
  facesById: Map<string, Submission>; // faceId -> submission
  votes: Map<string, string>; // voterId -> faceId
  endsAt: number;
  phaseTimer?: ReturnType<typeof setTimeout>;

  recapRounds: RecapRound[];
  roundHistory: RoundResultPayload[]; // full per-round results for the match review
  blitz: BlitzState; // BLITZ mode state
  // Last emitted payloads, kept so a reconnecting player can resync mid-phase.
  lastResult?: RoundResultPayload;
  lastMatchEnd?: MatchEndPayload;
  createdAt: number;
}

export const rooms = new Map<string, Room>();

// How long a disconnected player's slot is held so a refresh can reconnect.
export const GRACE_MS = 45_000;

// Unambiguous code alphabet (no O/0/I/1).
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(): string {
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function uniqueCode(): string {
  // Vanishingly unlikely to loop, but stay safe.
  for (let i = 0; i < 50; i++) {
    const c = randomCode();
    if (!rooms.has(c)) return c;
  }
  // Fallback: extend search space.
  let c = randomCode();
  while (rooms.has(c)) c = randomCode();
  return c;
}

export function clampSettings(patch: Partial<Settings> | undefined, base: Settings): Settings {
  const clamp = (v: number | undefined, lo: number, hi: number, dflt: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
  return {
    rounds: clamp(patch?.rounds, LIMITS.MIN_ROUNDS, LIMITS.MAX_ROUNDS, base.rounds),
    buildSecs: clamp(patch?.buildSecs, 10, 120, base.buildSecs),
    voteSecs: clamp(patch?.voteSecs, 8, 90, base.voteSecs),
    mode:
      patch?.mode === 'IMPOSTOR' || patch?.mode === 'CLASSIC' || patch?.mode === 'BLITZ'
        ? patch.mode
        : base.mode,
  };
}

/** Max players for a room — BLITZ is a strict 2-player duel. */
export function maxPlayers(room: Room): number {
  return room.settings.mode === 'BLITZ' ? 2 : LIMITS.MAX_PLAYERS;
}

let joinCounter = 0;

function newPlayer(handle: string, socketId: string | null): Player {
  return {
    id: randomUUID(),
    handle,
    score: 0,
    connected: socketId != null,
    socketId,
    bestRoundVotes: 0,
    joinSeq: joinCounter++,
  };
}

export function createRoom(
  rawHandle: string,
  socketId: string,
  settings?: Partial<Settings>,
  lang: Lang = 'ru',
): { room: Room; player: Player } {
  const handle = sanitizeHandle(rawHandle) || 'PLAYER';
  const player = newPlayer(handle, socketId);
  const room: Room = {
    code: uniqueCode(),
    hostId: player.id,
    players: new Map([[player.id, player]]),
    phase: 'LOBBY',
    settings: clampSettings(settings, DEFAULT_SETTINGS),
    lang: lang === 'en' ? 'en' : 'ru',
    roundIndex: -1,
    situation: '',
    decoySituation: '',
    impostorId: null,
    usedSituations: new Set(),
    submissions: new Map(),
    facesById: new Map(),
    votes: new Map(),
    endsAt: 0,
    recapRounds: [],
    roundHistory: [],
    blitz: newBlitzState(),
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return { room, player };
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

type AddResult =
  | { ok: true; player: Player; reconnected: boolean }
  | { ok: false; code: string };

/**
 * Add a player to a room, or reconnect an existing one by playerId.
 * New players may only join during LOBBY; reconnects are allowed at any time.
 */
export function addPlayer(
  room: Room,
  rawHandle: string,
  socketId: string,
  playerId?: string,
): AddResult {
  // Reconnect path: known playerId already in the room.
  if (playerId && room.players.has(playerId)) {
    const player = room.players.get(playerId)!;
    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = undefined;
    }
    player.socketId = socketId;
    player.connected = true;
    const cleaned = sanitizeHandle(rawHandle);
    if (cleaned) player.handle = cleaned; // allow handle refresh on reconnect
    return { ok: true, player, reconnected: true };
  }

  // New player.
  if (room.phase !== 'LOBBY') return { ok: false, code: ERR.IN_PROGRESS };
  if (room.players.size >= maxPlayers(room)) return { ok: false, code: ERR.ROOM_FULL };

  const handle = sanitizeHandle(rawHandle) || 'PLAYER';
  const taken = [...room.players.values()].some(
    (p) => p.handle.toLowerCase() === handle.toLowerCase(),
  );
  if (taken) return { ok: false, code: ERR.NAME_TAKEN };

  const player = newPlayer(handle, socketId);
  room.players.set(player.id, player);
  return { ok: true, player, reconnected: false };
}

/** Fully remove a player. Returns whether the host migrated and if the room is now empty. */
export function removePlayer(
  room: Room,
  playerId: string,
): { removed: Player | null; hostMigratedTo: string | null; empty: boolean } {
  const removed = room.players.get(playerId) ?? null;
  if (removed?.disconnectTimer) clearTimeout(removed.disconnectTimer);
  room.players.delete(playerId);
  room.submissions.delete(playerId);
  room.votes.delete(playerId);

  let hostMigratedTo: string | null = null;
  if (room.hostId === playerId && room.players.size > 0) {
    // Prefer a connected player as the new host.
    const next =
      [...room.players.values()].find((p) => p.connected) ??
      [...room.players.values()][0];
    room.hostId = next.id;
    hostMigratedTo = next.id;
  }

  const empty = room.players.size === 0;
  return { removed, hostMigratedTo, empty };
}

export function publicPlayers(room: Room): PublicPlayer[] {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    handle: p.handle,
    score: p.score,
    connected: p.connected,
    faceAvatar: p.faceAvatar,
  }));
}

export function publicState(room: Room): RoomStatePayload {
  return {
    code: room.code,
    host: room.hostId,
    players: publicPlayers(room),
    phase: room.phase,
    settings: room.settings,
    roundIndex: room.roundIndex,
    totalRounds: room.settings.rounds,
  };
}

export function deleteRoom(room: Room): void {
  if (room.phaseTimer) clearTimeout(room.phaseTimer);
  for (const p of room.players.values()) {
    if (p.disconnectTimer) clearTimeout(p.disconnectTimer);
  }
  rooms.delete(room.code);
}
