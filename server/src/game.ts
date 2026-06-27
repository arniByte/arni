// Authoritative game state machine + timers.
// LOBBY -> (BUILD -> VOTE -> RESULT) x rounds -> END.
// The server owns every transition; clients only render countdowns.
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  LIMITS,
  SCORE,
  TIMERS,
  PLACEHOLDER_FACE,
  type RankedFace,
  type ScoreRow,
  type RoundResultPayload,
  type MatchEndPayload,
  type RecapPayload,
} from '../../shared/protocol';
import { type Room, type Submission, publicState } from './rooms';
import { SITUATIONS } from './situations';
import { validFace } from './validate';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const PUBLIC_URL = process.env.PUBLIC_URL || '';

// ── helpers ──────────────────────────────────────────────────────────────────
function now(): number {
  return Date.now();
}

function clearPhaseTimer(room: Room): void {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = undefined;
  }
}

/** Called on room teardown so no stray timers fire. */
export function clearRoomTimers(room: Room): void {
  clearPhaseTimer(room);
}

function pickSituation(room: Room): string {
  // Fresh situation, no repeats within a match; reset the pool if exhausted.
  let pool = SITUATIONS.filter((s) => !room.usedSituations.has(s));
  if (pool.length === 0) {
    room.usedSituations.clear();
    pool = SITUATIONS.slice();
  }
  const choice = pool[Math.floor(Math.random() * pool.length)];
  room.usedSituations.add(choice);
  return choice;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function connectedCount(room: Room): number {
  let n = 0;
  for (const p of room.players.values()) if (p.connected) n++;
  return n;
}

function broadcastState(io: IO, room: Room): void {
  io.to(room.code).emit('room:state', publicState(room));
}

// ── match lifecycle ──────────────────────────────────────────────────────────

/** Host pressed start. Validates, resets a fresh match, begins round 1. */
export function startGame(io: IO, room: Room, byPlayerId: string): string | null {
  if (room.hostId !== byPlayerId) return 'NOT_HOST';
  if (room.phase !== 'LOBBY' && room.phase !== 'END') return 'IN_PROGRESS';
  if (connectedCount(room) < LIMITS.MIN_PLAYERS) return 'NEED_3_PLAYERS';

  // Fresh match.
  clearPhaseTimer(room);
  room.roundIndex = -1;
  room.usedSituations.clear();
  room.recapRounds = [];
  for (const p of room.players.values()) {
    p.score = 0;
    p.bestRoundVotes = 0;
    p.faceAvatar = undefined;
  }
  beginBuild(io, room);
  return null;
}

function resetRoundState(room: Room): void {
  room.submissions.clear();
  room.facesById.clear();
  room.votes.clear();
}

function beginBuild(io: IO, room: Room): void {
  clearPhaseTimer(room);
  room.roundIndex += 1;
  resetRoundState(room);
  room.situation = pickSituation(room);
  room.phase = 'BUILD';
  room.endsAt = now() + room.settings.buildSecs * 1000;

  broadcastState(io, room);
  io.to(room.code).emit('round:start', {
    index: room.roundIndex + 1,
    total: room.settings.rounds,
    situation: room.situation,
    endsAt: room.endsAt,
  });

  room.phaseTimer = setTimeout(() => beginVote(io, room), room.settings.buildSecs * 1000);
}

/** A face submission during BUILD. Returns an error code or null on success. */
export function handleSubmit(
  io: IO,
  room: Room,
  playerId: string,
  glyphs: string,
): string | null {
  if (room.phase !== 'BUILD') return 'NOT_BUILDING';
  if (now() > room.endsAt) return 'TOO_LATE';
  if (!room.players.has(playerId)) return 'NOT_IN_ROOM';
  if (room.submissions.has(playerId)) return 'ALREADY_SUBMITTED'; // first one wins
  if (!validFace(glyphs)) return 'BAD_FACE';

  const player = room.players.get(playerId)!;
  const sub: Submission = {
    faceId: randomUUID(),
    authorId: playerId,
    authorHandle: player.handle,
    glyphs: glyphs.trim(),
    submittedAt: now(),
    auto: false,
  };
  room.submissions.set(playerId, sub);
  room.facesById.set(sub.faceId, sub);

  // Early advance once every connected player has submitted.
  if (room.submissions.size >= connectedCount(room) && room.submissions.size >= 2) {
    beginVote(io, room);
  }
  return null;
}

function beginVote(io: IO, room: Room): void {
  clearPhaseTimer(room);
  room.phase = 'VOTE';

  // Anyone in the room without a submission gets a placeholder so the grid stays full.
  for (const p of room.players.values()) {
    if (!room.submissions.has(p.id)) {
      const sub: Submission = {
        faceId: randomUUID(),
        authorId: p.id,
        authorHandle: p.handle,
        glyphs: PLACEHOLDER_FACE,
        submittedAt: now(),
        auto: true,
      };
      room.submissions.set(p.id, sub);
      room.facesById.set(sub.faceId, sub);
    }
  }

  room.endsAt = now() + room.settings.voteSecs * 1000;

  const faces = shuffle([...room.facesById.values()]).map((s) => ({
    id: s.faceId,
    glyphs: s.glyphs,
  }));

  broadcastState(io, room);
  io.to(room.code).emit('round:vote', {
    situation: room.situation,
    faces, // anonymized + shuffled
    endsAt: room.endsAt,
  });

  // Privately tell each author which face is theirs so the UI can disable self-voting.
  for (const sub of room.submissions.values()) {
    const author = room.players.get(sub.authorId);
    if (author?.socketId) io.to(author.socketId).emit('vote:mine', { faceId: sub.faceId });
  }

  room.phaseTimer = setTimeout(() => finishRound(io, room), room.settings.voteSecs * 1000);
}

/** A vote during VOTE. Returns an error code or null on success. */
export function handleVote(
  io: IO,
  room: Room,
  playerId: string,
  faceId: string,
): string | null {
  if (room.phase !== 'VOTE') return 'NOT_VOTING';
  if (now() > room.endsAt) return 'TOO_LATE';
  if (!room.players.has(playerId)) return 'NOT_IN_ROOM';
  const face = room.facesById.get(faceId);
  if (!face) return 'NO_SUCH_FACE';
  if (face.authorId === playerId) return 'NO_SELF_VOTE';

  room.votes.set(playerId, faceId); // last vote before deadline wins

  // Early advance once every connected player has voted.
  if (room.votes.size >= connectedCount(room) && room.votes.size >= 1) {
    finishRound(io, room);
  }
  return null;
}

function finishRound(io: IO, room: Room): void {
  clearPhaseTimer(room);
  room.phase = 'RESULT';

  // Tally votes per face.
  const tally = new Map<string, number>();
  for (const faceId of room.votes.values()) {
    tally.set(faceId, (tally.get(faceId) ?? 0) + 1);
  }

  const totalVoters = room.votes.size;
  const distinctFacesVotedFor = new Set(room.votes.values()).size;

  // Build ranked list across all faces.
  const ranked: RankedFace[] = [...room.facesById.values()].map((sub) => {
    const votes = tally.get(sub.faceId) ?? 0;
    // Perfect read: every voter (>=2) converged on this single face.
    const perfectRead =
      totalVoters >= 2 && distinctFacesVotedFor === 1 && votes === totalVoters;
    return {
      id: sub.faceId,
      glyphs: sub.glyphs,
      handle: sub.authorHandle,
      votes,
      perfectRead,
    };
  });
  ranked.sort((a, b) => b.votes - a.votes);

  // Apply scores.
  for (const r of ranked) {
    const sub = room.facesById.get(r.id);
    if (!sub) continue;
    const author = room.players.get(sub.authorId);
    if (!author) continue;
    let gained = r.votes * SCORE.PER_VOTE;
    if (r.perfectRead) gained += SCORE.PERFECT_READ_BONUS;
    author.score += gained;
    if (r.votes > author.bestRoundVotes) author.bestRoundVotes = r.votes;
    // Reveal the face as the player's avatar now that voting is over.
    author.faceAvatar = r.glyphs;
  }

  // Record the round winner for the recap (skip if nobody voted at all).
  const winner = ranked[0];
  if (winner) {
    room.recapRounds.push({
      situation: room.situation,
      glyphs: winner.glyphs,
      handle: winner.handle,
      votes: winner.votes,
    });
  }

  const scoreboard = buildScoreboard(room);

  broadcastState(io, room);
  const payload: RoundResultPayload = {
    situation: room.situation,
    ranked,
    scoreboard,
  };
  room.lastResult = payload;
  io.to(room.code).emit('round:result', payload);

  const isLast = room.roundIndex + 1 >= room.settings.rounds;
  room.phaseTimer = setTimeout(() => {
    if (isLast) endMatch(io, room);
    else beginBuild(io, room);
  }, TIMERS.RESULT * 1000);
}

function buildScoreboard(room: Room): ScoreRow[] {
  return [...room.players.values()]
    .map((p) => ({ id: p.id, handle: p.handle, score: p.score, _seq: p.joinSeq, _best: p.bestRoundVotes }))
    .sort((a, b) => b.score - a.score || b._best - a._best || a._seq - b._seq)
    .map(({ id, handle, score }) => ({ id, handle, score }));
}

function buildRecap(room: Room): RecapPayload {
  const joinUrl = PUBLIC_URL ? `${PUBLIC_URL}/?c=${room.code}` : `/?c=${room.code}`;
  return {
    rows: room.recapRounds.map((r) => ({
      situation: r.situation,
      glyphs: r.glyphs,
      handle: r.handle,
      votes: r.votes,
    })),
    code: room.code,
    joinUrl,
  };
}

function endMatch(io: IO, room: Room): void {
  clearPhaseTimer(room);
  room.phase = 'END';

  const scoreboard = buildScoreboard(room);
  const winner = scoreboard.length > 0 ? scoreboard[0] : null;
  const payload: MatchEndPayload = {
    winner,
    scoreboard,
    recap: buildRecap(room),
  };
  room.lastMatchEnd = payload;

  broadcastState(io, room);
  io.to(room.code).emit('match:end', payload);
}

/** Recompute the recap payload on demand (recap:request). */
export function getRecap(room: Room): RecapPayload {
  return buildRecap(room);
}

/**
 * Push the current phase's payload to a single (re)joining socket so it can
 * resync mid-match. room:state is sent separately by the caller.
 */
export function snapshotTo(io: IO, room: Room, socketId: string): void {
  const to = io.to(socketId);
  switch (room.phase) {
    case 'BUILD':
      to.emit('round:start', {
        index: room.roundIndex + 1,
        total: room.settings.rounds,
        situation: room.situation,
        endsAt: room.endsAt,
      });
      break;
    case 'VOTE': {
      to.emit('round:vote', {
        situation: room.situation,
        faces: shuffle([...room.facesById.values()]).map((s) => ({ id: s.faceId, glyphs: s.glyphs })),
        endsAt: room.endsAt,
      });
      const mine = [...room.submissions.values()].find(
        (s) => room.players.get(s.authorId)?.socketId === socketId,
      );
      if (mine) to.emit('vote:mine', { faceId: mine.faceId });
      break;
    }
    case 'RESULT':
      if (room.lastResult) to.emit('round:result', room.lastResult);
      break;
    case 'END':
      if (room.lastMatchEnd) to.emit('match:end', room.lastMatchEnd);
      break;
  }
}
