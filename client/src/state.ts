// Client-side mirror of the room/game state. A single object + a pub/sub.
import type {
  RoomStatePayload,
  RoundStartPayload,
  RoundVotePayload,
  RoundResultPayload,
  MatchEndPayload,
} from '../../shared/protocol';

export type Screen = 'HOME' | 'LOBBY' | 'BUILD' | 'VOTE' | 'RESULT' | 'RECAP';

export interface AppState {
  screen: Screen;
  connected: boolean;
  busy: boolean; // a create/join request is in flight
  playerId: string | null;
  handle: string;
  error: string | null;

  room: RoomStatePayload | null;
  round: RoundStartPayload | null;
  vote: RoundVotePayload | null;
  result: RoundResultPayload | null;
  matchEnd: MatchEndPayload | null;

  // per-round local bookkeeping
  mySubmitted: boolean;
  mySubmittedGlyphs: string | null;
  myFaceId: string | null; // id of my own face during VOTE (server-told, private)
  myVotedFaceId: string | null;
  myRole: 'impostor' | null; // IMPOSTOR mode: am I the impostor this round?
}

export const state: AppState = {
  screen: 'HOME',
  connected: false,
  busy: false,
  playerId: null,
  handle: '',
  error: null,
  room: null,
  round: null,
  vote: null,
  result: null,
  matchEnd: null,
  mySubmitted: false,
  mySubmittedGlyphs: null,
  myFaceId: null,
  myVotedFaceId: null,
  myRole: null,
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  for (const fn of listeners) fn();
}

/** Convenience: is the local player the room host? */
export function isHost(): boolean {
  return !!state.room && !!state.playerId && state.room.host === state.playerId;
}

export function me() {
  return state.room?.players.find((p) => p.id === state.playerId) ?? null;
}
