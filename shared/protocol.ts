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
  // BLITZ (2-player duel) — fast, fixed timers.
  BLITZ_RACE: 14, // race to build a face
  BLITZ_GUESS: 9, // guess the opponent's situation
  BLITZ_RESULT: 4, // snappy reveal
} as const;

export const LIMITS = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 5,
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
  IMPOSTOR_EVADE: 250, // jackpot for an impostor whose face was NOT the top-accused
  // BLITZ
  BLITZ_READ: 100, // you guessed the opponent's situation
  BLITZ_EXPR: 60, // the opponent guessed YOUR situation (your face was legible)
  BLITZ_SPEED: 40, // you submitted faster
  BLITZ_SYNC: 30, // both read each other right (shared bonus)
  BLITZ_COMBO_STEP: 0.25, // +25% per read-streak, capped
  BLITZ_COMBO_CAP: 4,
} as const;

// Placeholder face given to players who don't submit in time.
export const PLACEHOLDER_FACE = '( ¬_¬ )';

// ── Language (situation prompts are room-level) ──────────────────────────────
export type Lang = 'ru' | 'en';

// ── Game mode (room-level) ───────────────────────────────────────────────────
export type GameMode = 'CLASSIC' | 'IMPOSTOR' | 'BLITZ';

// ── Phases ───────────────────────────────────────────────────────────────────
export type Phase =
  | 'LOBBY'
  | 'BUILD'
  | 'VOTE'
  | 'RESULT'
  | 'BLITZ_BUILD'
  | 'BLITZ_GUESS'
  | 'BLITZ_RESULT'
  | 'END';

// ── Settings ─────────────────────────────────────────────────────────────────
export interface Settings {
  rounds: number; // MIN_ROUNDS..MAX_ROUNDS
  buildSecs: number;
  voteSecs: number;
  mode: GameMode;
}

export const DEFAULT_SETTINGS: Settings = {
  rounds: LIMITS.DEFAULT_ROUNDS,
  buildSecs: TIMERS.BUILD,
  voteSecs: TIMERS.VOTE,
  mode: 'CLASSIC',
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
  role?: 'impostor'; // IMPOSTOR mode: present (privately) only for the impostor
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

// IMPOSTOR mode reveal, attached to the round result.
export interface ImpostorReveal {
  id: string;
  handle: string;
  glyphs: string; // the impostor's face
  faceId: string;
  decoySituation: string; // the different situation the impostor secretly had
  caught: boolean; // their face was the (tied) most-accused
  votes: number; // accusations against the impostor's face
}

export interface RoundResultPayload {
  situation: string;
  ranked: RankedFace[];
  scoreboard: ScoreRow[];
  impostor?: ImpostorReveal; // present only in IMPOSTOR mode
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
  rounds: RoundResultPayload[]; // full per-round breakdown for the "top moments" review
}

// ── BLITZ (2-player duel) payloads ───────────────────────────────────────────
export interface BlitzRoundPayload {
  index: number; // 1-based
  total: number;
  situation: string; // YOUR situation (private — opponent never sees it)
  endsAt: number;
  oppHandle: string;
  roundWins: { me: number; opp: number };
  streak: { me: number; opp: number };
}

export interface BlitzChoice {
  token: number; // stable index into the choices array (client sends this, never raw text)
  text: string;
}

export interface BlitzGuessPayload {
  opponentFace: string; // the opponent's built face
  oppHandle: string;
  choices: BlitzChoice[]; // the two real situations, shuffled
  endsAt: number;
  lockedToken?: number; // set only on reconnect when this player already answered
}

export interface BlitzPoints {
  read: number;
  expr: number;
  speed: number;
  sync: number;
  combo: number; // the multiplier applied (e.g. 1.5)
  total: number;
}

export interface BlitzFaceReveal {
  id: string; // playerId
  handle: string;
  glyphs: string;
  situation: string; // their true situation
}

export interface BlitzGuessInfo {
  guessed: string | null; // the situation text they picked
  correct: boolean;
}

export interface BlitzRoundResultPayload {
  index: number;
  total: number;
  faces: BlitzFaceReveal[]; // both players
  points: Record<string, BlitzPoints>; // by playerId
  guesses: Record<string, BlitzGuessInfo>; // by playerId
  roundWinner: string | null; // playerId, or null on a draw
  roundWins: Record<string, number>;
  scores: Record<string, number>;
  streaks: Record<string, number>;
  syncBonus: boolean;
}

export interface BlitzMatchEndPayload {
  players: { id: string; handle: string }[];
  winner: string | null; // playerId, or null on a draw
  roundWins: Record<string, number>;
  scores: Record<string, number>;
  longestStreak: Record<string, number>;
  readAccuracy: Record<string, number>; // 0..100
  fastestMs: Record<string, number>; // fastest single build per player (ms); 0 if none
  syncPct: number; // 0..100 — how often the pair read each other right
  worstRead: { situation: string; glyphs: string; guessedAs: string; handle: string } | null;
  recap: RecapPayload;
  forfeit: boolean;
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
  NEED_2_PLAYERS: 'NEED_2_PLAYERS',
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
  'room:create': (p: { handle: string; settings?: Partial<Settings>; lang?: Lang }, ack: (r: CreateAck) => void) => void;
  'room:join': (p: { code: string; handle: string; playerId?: string }, ack: (r: JoinAck) => void) => void;
  'room:leave': () => void;
  'room:settings': (p: Partial<Settings>) => void;
  'game:start': () => void;
  'face:submit': (p: { glyphs: string }) => void;
  'vote:cast': (p: { faceId: string }) => void;
  'blitz:answer': (p: { token: number }) => void;
  'recap:request': (ack: (r: RecapPayload | null) => void) => void;
}

export interface ServerToClientEvents {
  'room:state': (p: RoomStatePayload) => void;
  'error': (p: ErrorPayload) => void;
  'round:start': (p: RoundStartPayload) => void;
  'round:vote': (p: RoundVotePayload) => void;
  // Private to each author so the client can grey out their own (still-anonymous) face.
  'vote:mine': (p: { faceId: string }) => void;
  // Private to a reconnecting author during BUILD: restores their already-locked face.
  'face:mine': (p: { glyphs: string }) => void;
  'round:result': (p: RoundResultPayload) => void;
  'match:end': (p: MatchEndPayload) => void;
  // BLITZ — private round (your situation) / private guess (opponent's face) / public result + end.
  'blitz:round': (p: BlitzRoundPayload) => void;
  'blitz:guess': (p: BlitzGuessPayload) => void;
  'blitz:result': (p: BlitzRoundResultPayload) => void;
  'blitz:end': (p: BlitzMatchEndPayload) => void;
  'player:joined': (p: { player: PublicPlayer }) => void;
  'player:left': (p: { playerId: string }) => void;
}
