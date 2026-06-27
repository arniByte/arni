// ─────────────────────────────────────────────────────────────────────────────
// KAO // 顔 — shared realtime protocol & domain types.
// Imported by BOTH the server and the client so the wire contract can never drift.
// The server is the single source of truth: clients render `endsAt` countdowns
// locally but never advance phases themselves.
// ─────────────────────────────────────────────────────────────────────────────

export const BRAND = {
  name: 'KAO // 顔',
  tagline: 'WHEN WORDS ARE NOT ENOUGH',
  mascot: '[ ◕‿◕ ]',
} as const;

// Authoritative game constants. Timers are seconds; everything else is counts.
export const TIMERS = {
  BUILD: 45,
  VOTE: 25,
  RESULT: 8,
} as const;

export const LIMITS = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 12,
  MIN_ROUNDS: 3,
  MAX_ROUNDS: 8,
  DEFAULT_ROUNDS: 5,
  FACE_MAX_CP: 28, // max Unicode code points in a face
  HANDLE_MAX: 16,
} as const;

// Scoring
export const SCORE = {
  PER_VOTE: 100,
  PERFECT_READ_BONUS: 150, // added on top of the per-vote total → 250 when unanimous
} as const;

// Placeholder face given to players who don't submit in time.
export const PLACEHOLDER_FACE = '( ¬_¬ )';

// ── Phases ───────────────────────────────────────────────────────────────────
export type Phase = 'LOBBY' | 'BUILD' | 'VOTE' | 'RESULT' | 'END';

// ── Settings ─────────────────────────────────────────────────────────────────
export interface Settings {
  rounds: number; // MIN_ROUNDS..MAX_ROUNDS
  buildSecs: number;
  voteSecs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  rounds: LIMITS.DEFAULT_ROUNDS,
  buildSecs: TIMERS.BUILD,
  voteSecs: TIMERS.VOTE,
};

// ── Public (broadcastable) shapes ────────────────────────────────────────────
export interface PublicPlayer {
  id: string;
  handle: string;
  score: number;
  connected: boolean;
  faceAvatar?: string; // last face they submitted, used as a small avatar
}

export interface RoomStatePayload {
  code: string;
  host: string; // playerId of the host
  players: PublicPlayer[];
  phase: Phase;
  settings: Settings;
  roundIndex: number; // 0-based current round; -1 in lobby
  totalRounds: number;
}

export interface RoundStartPayload {
  index: number; // 1-based for display
  total: number;
  situation: string;
  endsAt: number; // epoch ms
}

export interface VoteFace {
  id: string;
  glyphs: string;
}

export interface RoundVotePayload {
  situation: string;
  faces: VoteFace[]; // anonymized + shuffled
  endsAt: number;
}

export interface RankedFace {
  id: string;
  glyphs: string;
  handle: string;
  votes: number;
  perfectRead: boolean;
}

export interface ScoreRow {
  id: string;
  handle: string;
  score: number;
}

export interface RoundResultPayload {
  situation: string;
  ranked: RankedFace[];
  scoreboard: ScoreRow[];
}

export interface RecapRow {
  situation: string;
  glyphs: string;
  handle: string;
  votes: number;
}

export interface RecapPayload {
  rows: RecapRow[];
  code: string;
  joinUrl: string;
}

export interface MatchEndPayload {
  winner: ScoreRow | null;
  scoreboard: ScoreRow[];
  recap: RecapPayload;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

// Well-known error codes (kept as plain strings on the wire).
export const ERR = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  NAME_TAKEN: 'NAME_TAKEN',
  NEED_3_PLAYERS: 'NEED_3_PLAYERS',
  NOT_HOST: 'NOT_HOST',
  BAD_FACE: 'BAD_FACE',
  IN_PROGRESS: 'IN_PROGRESS',
  BAD_HANDLE: 'BAD_HANDLE',
} as const;

// ── Acks (request/response callbacks) ────────────────────────────────────────
export type CreateAck =
  | { ok: true; code: string; playerId: string }
  | { ok: false; error: ErrorPayload };

export type JoinAck =
  | { ok: true; code: string; playerId: string }
  | { ok: false; error: ErrorPayload };

// ── Socket.io typed event maps ───────────────────────────────────────────────
export interface ClientToServerEvents {
  'room:create': (p: { handle: string; settings?: Partial<Settings> }, ack: (r: CreateAck) => void) => void;
  'room:join': (p: { code: string; handle: string; playerId?: string }, ack: (r: JoinAck) => void) => void;
  'room:leave': () => void;
  'room:settings': (p: Partial<Settings>) => void;
  'game:start': () => void;
  'face:submit': (p: { glyphs: string }) => void;
  'vote:cast': (p: { faceId: string }) => void;
  'recap:request': (ack: (r: RecapPayload | null) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (p: RoomStatePayload) => void;
  'error': (p: ErrorPayload) => void;
  'round:start': (p: RoundStartPayload) => void;
  'round:vote': (p: RoundVotePayload) => void;
  // Private to each author so the client can grey out their own (still-anonymous) face.
  'vote:mine': (p: { faceId: string }) => void;
  'round:result': (p: RoundResultPayload) => void;
  'match:end': (p: MatchEndPayload) => void;
  'player:joined': (p: { player: PublicPlayer }) => void;
  'player:left': (p: { playerId: string }) => void;
}
