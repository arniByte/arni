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
  type ImpostorReveal,
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
  // Track "used" by the stable English id so language never affects de-duping.
  let pool = SITUATIONS.filter((s) => !room.usedSituations.has(s.en));
  if (pool.length === 0) {
    room.usedSituations.clear();
    pool = SITUATIONS.slice();
  }
  const choice = pool[Math.floor(Math.random() * pool.length)];
  room.usedSituations.add(choice.en);
  return room.lang === 'en' ? choice.en : choice.ru;
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
  room.impostorId = null;
  room.decoySituation = '';
}

function beginBuild(io: IO, room: Room): void {
  clearPhaseTimer(room);
  room.roundIndex += 1;
  resetRoundState(room);
  room.situation = pickSituation(room);
  room.phase = 'BUILD';
  room.endsAt = now() + room.settings.buildSecs * 1000;

  broadcastState(io, room);

  if (room.settings.mode === 'IMPOSTOR') {
    // A different (decoy) situation + one random connected impostor. The round
    // is delivered PER-PLAYER: only the impostor secretly gets the decoy + role.
    room.decoySituation = pickSituation(room);
    const connected = [...room.players.values()].filter((p) => p.connected);
    const impostor = connected.length ? connected[Math.floor(Math.random() * connected.length)] : null;
    room.impostorId = impostor ? impostor.id : null;
    for (const p of room.players.values()) {
      if (!p.socketId) continue;
      const isImp = p.id === room.impostorId;
      io.to(p.socketId).emit('round:start', {
        index: room.roundIndex + 1,
        total: room.settings.rounds,
        situation: isImp ? room.decoySituation : room.situation,
        endsAt: room.endsAt,
        role: isImp ? 'impostor' : undefined,
      });
    }
  } else {
    io.to(room.code).emit('round:start', {
      index: room.roundIndex + 1,
      total: room.settings.rounds,
      situation: room.situation,
      endsAt: room.endsAt,
    });
  }

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

  const isImpostor = room.settings.mode === 'IMPOSTOR';

  // Tally votes per face (shared by both modes).
  const tally = new Map<string, number>();
  for (const faceId of room.votes.values()) {
    tally.set(faceId, (tally.get(faceId) ?? 0) + 1);
  }
  const totalVoters = room.votes.size;
  const distinctFacesVotedFor = new Set(room.votes.values()).size;
  const maxVotes = tally.size ? Math.max(...tally.values()) : 0;

  const ranked: RankedFace[] = [...room.facesById.values()].map((sub) => {
    const votes = tally.get(sub.faceId) ?? 0;
    // Perfect read only applies to CLASSIC (best-face) voting.
    const perfectRead =
      !isImpostor && totalVoters >= 2 && distinctFacesVotedFor === 1 && votes === totalVoters;
    return { id: sub.faceId, glyphs: sub.glyphs, handle: sub.authorHandle, votes, perfectRead };
  });
  ranked.sort((a, b) => b.votes - a.votes);

  // Reveal every face as its author's avatar now that voting is over (both modes).
  for (const sub of room.facesById.values()) {
    const author = room.players.get(sub.authorId);
    if (author) author.faceAvatar = sub.glyphs;
  }

  let impostorReveal: ImpostorReveal | undefined;

  if (isImpostor) {
    const impSub = room.impostorId
      ? [...room.facesById.values()].find((s) => s.authorId === room.impostorId)
      : undefined;
    const impVotes = impSub ? tally.get(impSub.faceId) ?? 0 : 0;
    const caught = !!impSub && maxVotes > 0 && impVotes === maxVotes;
    const impPlayer = room.impostorId ? room.players.get(room.impostorId) : undefined;

    if (caught && impSub) {
      // Detectives who accused the impostor's face each score.
      for (const [voterId, faceId] of room.votes) {
        if (faceId === impSub.faceId) {
          const voter = room.players.get(voterId);
          if (voter) {
            voter.score += SCORE.PER_VOTE;
            voter.bestRoundVotes = Math.max(voter.bestRoundVotes, 1);
          }
        }
      }
    } else if (impPlayer) {
      impPlayer.score += SCORE.IMPOSTOR_EVADE; // jackpot for slipping past
    }

    if (impSub && impPlayer) {
      impostorReveal = {
        id: impPlayer.id,
        handle: impPlayer.handle,
        glyphs: impSub.glyphs,
        faceId: impSub.faceId,
        decoySituation: room.decoySituation,
        caught,
        votes: impVotes,
      };
      room.recapRounds.push({
        situation: room.situation,
        glyphs: impSub.glyphs,
        handle: impPlayer.handle,
        votes: impVotes,
      });
    }
  } else {
    // CLASSIC: +100 per vote, perfect-read bonus.
    for (const r of ranked) {
      const sub = room.facesById.get(r.id);
      if (!sub) continue;
      const author = room.players.get(sub.authorId);
      if (!author) continue;
      let gained = r.votes * SCORE.PER_VOTE;
      if (r.perfectRead) gained += SCORE.PERFECT_READ_BONUS;
      author.score += gained;
      if (r.votes > author.bestRoundVotes) author.bestRoundVotes = r.votes;
    }
    const winner = ranked[0];
    if (winner && winner.votes > 0) {
      room.recapRounds.push({
        situation: room.situation,
        glyphs: winner.glyphs,
        handle: winner.handle,
        votes: winner.votes,
      });
    }
  }

  const scoreboard = buildScoreboard(room);
  broadcastState(io, room);
  const payload: RoundResultPayload = {
    situation: room.situation,
    ranked,
    scoreboard,
    impostor: impostorReveal,
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
    case 'BUILD': {
      // In IMPOSTOR mode the reconnecting player must get THEIR situation + role.
      const me = [...room.players.values()].find((p) => p.socketId === socketId);
      const isImp = room.settings.mode === 'IMPOSTOR' && !!me && me.id === room.impostorId;
      to.emit('round:start', {
        index: room.roundIndex + 1,
        total: room.settings.rounds,
        situation: isImp ? room.decoySituation : room.situation,
        endsAt: room.endsAt,
        role: isImp ? 'impostor' : undefined,
      });
      // If this player already locked a face this round, restore it (the
      // round:start above reset the client's per-round flags first).
      const mineBuild = [...room.submissions.values()].find(
        (s) => room.players.get(s.authorId)?.socketId === socketId,
      );
      if (mineBuild && !mineBuild.auto) to.emit('face:mine', { glyphs: mineBuild.glyphs });
      break;
    }
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
