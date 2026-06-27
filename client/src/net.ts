// Socket client: actions out, server events in -> state patches.
// Reconnect-by-playerId is handled transparently on socket reconnect.
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  CreateAck,
  JoinAck,
  RecapPayload,
  Settings,
} from '../../shared/protocol';
import { state, setState } from './state';

const LS = { pid: 'kao.playerId', handle: 'kao.handle', code: 'kao.code' } as const;

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
});

let lastCode: string | null = localStorage.getItem(LS.code);

function persistIdentity(): void {
  if (state.playerId) localStorage.setItem(LS.pid, state.playerId);
  if (state.handle) localStorage.setItem(LS.handle, state.handle);
  if (lastCode) localStorage.setItem(LS.code, lastCode);
}

export function storedHandle(): string {
  return localStorage.getItem(LS.handle) ?? '';
}

export function storedSession(): { code: string; handle: string; playerId: string } | null {
  const code = localStorage.getItem(LS.code);
  const handle = localStorage.getItem(LS.handle);
  const playerId = localStorage.getItem(LS.pid);
  if (code && handle && playerId) return { code, handle, playerId };
  return null;
}

// ── actions (client -> server) ───────────────────────────────────────────────
export const actions = {
  createRoom(handle: string): void {
    setState({ handle, busy: true, error: null });
    socket.emit('room:create', { handle }, (res: CreateAck) => {
      setState({ busy: false });
      if (res.ok) {
        lastCode = res.code;
        setState({ playerId: res.playerId, handle });
        persistIdentity();
      } else {
        setState({ error: res.error.message });
      }
    });
  },

  joinRoom(code: string, handle: string): void {
    setState({ handle, busy: true, error: null });
    const playerId = state.playerId ?? localStorage.getItem(LS.pid) ?? undefined;
    socket.emit('room:join', { code, handle, playerId }, (res: JoinAck) => {
      setState({ busy: false });
      if (res.ok) {
        lastCode = res.code;
        setState({ playerId: res.playerId, handle });
        persistIdentity();
      } else {
        setState({ error: res.error.message });
      }
    });
  },

  // Silent reconnect used on socket reconnect / page reload.
  resume(session: { code: string; handle: string; playerId: string }): void {
    socket.emit(
      'room:join',
      { code: session.code, handle: session.handle, playerId: session.playerId },
      (res: JoinAck) => {
        if (res.ok) {
          lastCode = res.code;
          setState({ playerId: res.playerId, handle: session.handle });
          persistIdentity();
        } else {
          // Room gone — drop back to home.
          lastCode = null;
          localStorage.removeItem(LS.code);
          setState({ screen: 'HOME', room: null });
        }
      },
    );
  },

  leaveRoom(): void {
    socket.emit('room:leave');
    lastCode = null;
    localStorage.removeItem(LS.code);
    setState({
      screen: 'HOME',
      room: null,
      round: null,
      vote: null,
      result: null,
      matchEnd: null,
      mySubmitted: false,
      myVotedFaceId: null,
      myFaceId: null,
    });
  },

  updateSettings(patch: Partial<Settings>): void {
    socket.emit('room:settings', patch);
  },

  startGame(): void {
    socket.emit('game:start');
  },

  submitFace(glyphs: string): void {
    socket.emit('face:submit', { glyphs });
    setState({ mySubmitted: true, mySubmittedGlyphs: glyphs });
  },

  castVote(faceId: string): void {
    socket.emit('vote:cast', { faceId });
    setState({ myVotedFaceId: faceId });
  },

  requestRecap(): Promise<RecapPayload | null> {
    return new Promise((resolve) => socket.emit('recap:request', resolve));
  },
};

// ── events (server -> client) ────────────────────────────────────────────────
socket.on('connect', () => {
  setState({ connected: true });
  // If we were in a room, silently rebind by playerId.
  const session = storedSession();
  if (lastCode && session) actions.resume(session);
});

socket.on('disconnect', () => setState({ connected: false }));

socket.on('room:state', (room) => {
  // room:state carries roster/host/settings. Only it drives the LOBBY screen;
  // the richer phase events drive BUILD/VOTE/RESULT/RECAP to avoid stale renders.
  const patch: Partial<typeof state> = { room };
  if (room.phase === 'LOBBY') patch.screen = 'LOBBY';
  setState(patch);
});

socket.on('round:start', (p) => {
  setState({
    round: p,
    vote: null,
    result: null,
    mySubmitted: false,
    mySubmittedGlyphs: null,
    myFaceId: null,
    myVotedFaceId: null,
    screen: 'BUILD',
    error: null,
  });
});

socket.on('round:vote', (p) => {
  setState({ vote: p, screen: 'VOTE', myVotedFaceId: null });
});

socket.on('vote:mine', (p) => {
  setState({ myFaceId: p.faceId });
});

// Reconnect during BUILD: round:start (above) just cleared our per-round flags;
// this restores the face we had already locked in so we don't rebuild/resubmit.
socket.on('face:mine', (p) => {
  setState({ mySubmitted: true, mySubmittedGlyphs: p.glyphs });
});

socket.on('round:result', (p) => {
  setState({ result: p, screen: 'RESULT' });
});

socket.on('match:end', (p) => {
  setState({ matchEnd: p, screen: 'RECAP' });
});

socket.on('player:joined', () => {
  /* roster comes via room:state; nothing extra needed */
});
socket.on('player:left', () => {
  /* roster comes via room:state */
});

socket.on('error', (e) => {
  const patch: Partial<typeof state> = { error: e.message };
  if (e.code === 'BAD_FACE') patch.mySubmitted = false; // let them retry
  setState(patch);
});
