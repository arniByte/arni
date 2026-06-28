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
  type BlitzRoundResultPayload,
  type BlitzMatchEndPayload,
  type BlitzPoints,
  type BlitzFaceReveal,
  type BlitzGuessInfo,
} from '../../shared/protocol';
import { type Room, type Submission, publicState, newBlitzState } from './rooms';
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
  const isBlitz = room.settings.mode === 'BLITZ';
  if (isBlitz) {
    if (connectedCount(room) !== 2) return 'NEED_2_PLAYERS';
  } else if (connectedCount(room) < LIMITS.MIN_PLAYERS) {
    return 'NEED_3_PLAYERS';
  }

  // Fresh match.
  clearPhaseTimer(room);
  room.roundIndex = -1;
  room.usedSituations.clear();
  room.recapRounds = [];
  room.roundHistory = [];
  for (const p of room.players.values()) {
    p.score = 0;
    p.bestRoundVotes = 0;
    p.faceAvatar = undefined;
  }
  if (isBlitz) {
    room.blitz = newBlitzState();
    beginBlitzRound(io, room);
  } else {
    beginBuild(io, room);
  }
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
  if (room.phase !== 'BUILD' && room.phase !== 'BLITZ_BUILD') return 'NOT_BUILDING';
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
    if (room.settings.mode === 'BLITZ') beginBlitzGuess(io, room);
    else beginVote(io, room);
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

    // Build the reveal from the submission snapshot (authorId/authorHandle) so
    // it survives even if the impostor left mid-round (the +250 evade above is
    // the only thing that needs a still-present player).
    if (impSub) {
      impostorReveal = {
        id: impSub.authorId,
        handle: impSub.authorHandle,
        glyphs: impSub.glyphs,
        faceId: impSub.faceId,
        decoySituation: room.decoySituation,
        caught,
        votes: impVotes,
      };
      room.recapRounds.push({
        situation: room.situation,
        glyphs: impSub.glyphs,
        handle: impSub.authorHandle,
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
  room.roundHistory.push(payload);
  io.to(room.code).emit('round:result', payload);

  const isLast = room.roundIndex + 1 >= room.settings.rounds;
  room.phaseTimer = setTimeout(() => {
    if (isLast) endMatch(io, room);
    else beginBuild(io, room);
  }, TIMERS.RESULT * 1000);
}

// ── BLITZ (2-player duel) ────────────────────────────────────────────────────
// Each round both players secretly get THEIR OWN situation and race to build a
// face; then each guesses which of the two real situations drove the OPPONENT's
// face. The server assigned the prompts, so every answer is server-checkable —
// a clean winner with no third-party voter.

const blitzSub = (room: Room, id: string): Submission | undefined =>
  [...room.submissions.values()].find((s) => s.authorId === id);

/** End the match immediately (with a winner) if the duel can no longer continue. */
export function blitzForfeitIfAlone(io: IO, room: Room): void {
  if (room.settings.mode !== 'BLITZ') return;
  if (room.phase !== 'BLITZ_BUILD' && room.phase !== 'BLITZ_GUESS' && room.phase !== 'BLITZ_RESULT') return;
  if (room.players.size < 2) endBlitzMatch(io, room, true);
}

function blitzForfeitCheck(io: IO, room: Room): boolean {
  if (room.players.size >= 2) return false;
  endBlitzMatch(io, room, true);
  return true;
}

function beginBlitzRound(io: IO, room: Room): void {
  clearPhaseTimer(room);
  if (blitzForfeitCheck(io, room)) return;
  room.roundIndex += 1;
  room.submissions.clear();
  room.facesById.clear();

  const b = room.blitz;
  b.promptKey.clear();
  b.guess.clear();
  b.choiceKey = [];

  const A = pickSituation(room);
  let B = pickSituation(room);
  if (B === A) B = pickSituation(room); // keep the two prompts distinct
  b.text = { A, B };

  // Assign over the FULL 2-player roster (capped at 2 by maxPlayers), not just
  // connected players, so a grace-disconnected player still holds a prompt and
  // resyncs to the correct situation on reconnect (the emit loop below skips
  // anyone without a live socket).
  const order = shuffle([...room.players.values()]);
  if (order[0]) b.promptKey.set(order[0].id, 'A');
  if (order[1]) b.promptKey.set(order[1].id, 'B');

  room.phase = 'BLITZ_BUILD';
  room.endsAt = now() + TIMERS.BLITZ_RACE * 1000;
  b.buildStart = now();

  broadcastState(io, room);
  for (const p of order) {
    if (!p.socketId) continue;
    const key = b.promptKey.get(p.id)!;
    const opp = order.find((q) => q.id !== p.id);
    io.to(p.socketId).emit('blitz:round', {
      index: room.roundIndex + 1,
      total: room.settings.rounds,
      situation: key === 'A' ? b.text.A : b.text.B,
      endsAt: room.endsAt,
      oppHandle: opp ? opp.handle : '—',
      roundWins: { me: b.roundWins.get(p.id) ?? 0, opp: opp ? b.roundWins.get(opp.id) ?? 0 : 0 },
      streak: { me: b.streak.get(p.id) ?? 0, opp: opp ? b.streak.get(opp.id) ?? 0 : 0 },
    });
  }
  room.phaseTimer = setTimeout(() => beginBlitzGuess(io, room), TIMERS.BLITZ_RACE * 1000);
}

function beginBlitzGuess(io: IO, room: Room): void {
  clearPhaseTimer(room);
  if (blitzForfeitCheck(io, room)) return;
  const b = room.blitz;

  // Placeholder for whoever didn't lock a face in time.
  for (const p of room.players.values()) {
    if (!p.connected) continue;
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

  room.phase = 'BLITZ_GUESS';
  room.endsAt = now() + TIMERS.BLITZ_GUESS * 1000;
  b.guess.clear();
  b.choiceKey = shuffle<'A' | 'B'>(['A', 'B']);
  const choices = b.choiceKey.map((key, token) => ({ token, text: key === 'A' ? b.text.A : b.text.B }));

  broadcastState(io, room);
  const players = [...room.players.values()].filter((p) => p.connected);
  for (const p of players) {
    if (!p.socketId) continue;
    const opp = players.find((q) => q.id !== p.id);
    const oppSub = opp ? blitzSub(room, opp.id) : undefined;
    io.to(p.socketId).emit('blitz:guess', {
      opponentFace: oppSub ? oppSub.glyphs : PLACEHOLDER_FACE,
      oppHandle: opp ? opp.handle : '—',
      choices,
      endsAt: room.endsAt,
    });
  }
  room.phaseTimer = setTimeout(() => finishBlitzRound(io, room), TIMERS.BLITZ_GUESS * 1000);
}

/** A blitz guess. Returns an error code or null on success. First answer locks. */
export function handleBlitzAnswer(io: IO, room: Room, playerId: string, token: number): string | null {
  if (room.phase !== 'BLITZ_GUESS') return 'NOT_GUESSING';
  if (now() > room.endsAt) return 'TOO_LATE';
  if (!room.players.has(playerId)) return 'NOT_IN_ROOM';
  const b = room.blitz;
  if (b.guess.has(playerId)) return 'ALREADY';
  if (token !== 0 && token !== 1) return 'BAD_TOKEN';
  const key = b.choiceKey[token];
  if (!key) return 'BAD_TOKEN';
  b.guess.set(playerId, key);

  const connected = [...room.players.values()].filter((p) => p.connected);
  if (connected.length >= 2 && connected.every((p) => b.guess.has(p.id))) {
    finishBlitzRound(io, room);
  }
  return null;
}

function finishBlitzRound(io: IO, room: Room): void {
  clearPhaseTimer(room);
  const b = room.blitz;
  room.phase = 'BLITZ_RESULT';
  b.roundsPlayed += 1;

  const ids = [...b.promptKey.keys()];

  // Reveal faces as avatars.
  for (const s of room.facesById.values()) {
    const author = room.players.get(s.authorId);
    if (author) author.faceAvatar = s.glyphs;
  }

  // SPEED: the faster valid (non-placeholder) submit wins; both auto/tie handled.
  const real = ids.map((id) => ({ id, sub: blitzSub(room, id) })).filter((x) => x.sub && !x.sub.auto) as {
    id: string;
    sub: Submission;
  }[];
  let speedWinner: string | null = null;
  let speedTie = false;
  if (real.length === 2) {
    if (real[0].sub.submittedAt < real[1].sub.submittedAt) speedWinner = real[0].id;
    else if (real[1].sub.submittedAt < real[0].sub.submittedAt) speedWinner = real[1].id;
    else speedTie = true;
  } else if (real.length === 1) {
    speedWinner = real[0].id;
  }

  // READ correctness per player (did you guess the opponent's real situation?).
  const correct: Record<string, boolean> = {};
  for (const id of ids) {
    const oppId = ids.find((q) => q !== id);
    const oppKey = oppId ? b.promptKey.get(oppId) : undefined;
    const oppSub = oppId ? blitzSub(room, oppId) : undefined;
    const guessed = b.guess.get(id);
    correct[id] = !!guessed && guessed === oppKey && !!oppSub && !oppSub.auto;
    b.readCount.set(id, (b.readCount.get(id) ?? 0) + 1);
    if (correct[id]) b.readHits.set(id, (b.readHits.get(id) ?? 0) + 1);
  }
  const syncBonus = ids.length === 2 && ids.every((id) => correct[id]);
  if (syncBonus) b.syncRounds += 1;

  const points: Record<string, BlitzPoints> = {};
  const guesses: Record<string, BlitzGuessInfo> = {};
  const roundScore: Record<string, number> = {};
  for (const id of ids) {
    const oppId = ids.find((q) => q !== id);
    const mySub = blitzSub(room, id);
    const read = correct[id] ? SCORE.BLITZ_READ : 0;
    const expr = oppId && correct[oppId] && mySub && !mySub.auto ? SCORE.BLITZ_EXPR : 0;
    const speed = speedTie ? Math.round(SCORE.BLITZ_SPEED / 2) : speedWinner === id ? SCORE.BLITZ_SPEED : 0;
    const sync = syncBonus ? SCORE.BLITZ_SYNC : 0;

    const newStreak = correct[id] ? (b.streak.get(id) ?? 0) + 1 : 0;
    b.streak.set(id, newStreak);
    b.longestStreak.set(id, Math.max(b.longestStreak.get(id) ?? 0, newStreak));
    const combo = 1 + SCORE.BLITZ_COMBO_STEP * Math.min(newStreak, SCORE.BLITZ_COMBO_CAP);
    const total = Math.floor((read + expr + speed + sync) * combo);
    roundScore[id] = total;
    const player = room.players.get(id);
    if (player) player.score += total;
    points[id] = { read, expr, speed, sync, combo, total };

    if (mySub && !mySub.auto) {
      const buildMs = Math.max(0, mySub.submittedAt - b.buildStart);
      const prev = b.fastestMs.get(id) ?? 0;
      if (prev === 0 || buildMs < prev) b.fastestMs.set(id, buildMs);
    }

    const gk = b.guess.get(id);
    guesses[id] = {
      guessed: gk ? (gk === 'A' ? b.text.A : b.text.B) : null,
      correct: correct[id],
    };

    // The most recent misread becomes the shareable "caught of the match".
    if (!correct[id] && oppId) {
      const oppSub2 = blitzSub(room, oppId);
      const oppKey = b.promptKey.get(oppId);
      b.worstRead = {
        situation: oppKey === 'A' ? b.text.A : b.text.B,
        glyphs: oppSub2 ? oppSub2.glyphs : PLACEHOLDER_FACE,
        guessedAs: gk ? (gk === 'A' ? b.text.A : b.text.B) : '—',
        handle: room.players.get(oppId)?.handle ?? '—',
      };
    }
  }

  let roundWinner: string | null = null;
  if (ids.length === 2) {
    if (roundScore[ids[0]] > roundScore[ids[1]]) roundWinner = ids[0];
    else if (roundScore[ids[1]] > roundScore[ids[0]]) roundWinner = ids[1];
  } else if (ids.length === 1) {
    roundWinner = ids[0];
  }
  if (roundWinner) b.roundWins.set(roundWinner, (b.roundWins.get(roundWinner) ?? 0) + 1);

  const faces: BlitzFaceReveal[] = ids.map((id) => {
    const s = blitzSub(room, id);
    const key = b.promptKey.get(id);
    return {
      id,
      handle: room.players.get(id)?.handle ?? '—',
      glyphs: s ? s.glyphs : PLACEHOLDER_FACE,
      situation: key === 'A' ? b.text.A : b.text.B,
    };
  });
  const roundWins: Record<string, number> = {};
  const scores: Record<string, number> = {};
  const streaks: Record<string, number> = {};
  for (const id of ids) {
    roundWins[id] = b.roundWins.get(id) ?? 0;
    scores[id] = room.players.get(id)?.score ?? 0;
    streaks[id] = b.streak.get(id) ?? 0;
  }

  const payload: BlitzRoundResultPayload = {
    index: room.roundIndex + 1,
    total: room.settings.rounds,
    faces,
    points,
    guesses,
    roundWinner,
    roundWins,
    scores,
    streaks,
    syncBonus,
  };
  b.lastResult = payload;
  broadcastState(io, room);
  io.to(room.code).emit('blitz:result', payload);

  const isLast = room.roundIndex + 1 >= room.settings.rounds;
  room.phaseTimer = setTimeout(() => {
    if (isLast) endBlitzMatch(io, room, false);
    else beginBlitzRound(io, room);
  }, TIMERS.BLITZ_RESULT * 1000);
}

function endBlitzMatch(io: IO, room: Room, forfeit: boolean): void {
  clearPhaseTimer(room);
  room.phase = 'END';
  const b = room.blitz;
  const ps = [...room.players.values()];

  let winner: string | null = null;
  if (forfeit) {
    const alive = ps.filter((p) => p.connected);
    winner = alive.length ? alive[0].id : ps[0]?.id ?? null;
  } else if (ps.length >= 2) {
    const [x, y] = ps;
    const rwX = b.roundWins.get(x.id) ?? 0;
    const rwY = b.roundWins.get(y.id) ?? 0;
    if (rwX > rwY) winner = x.id;
    else if (rwY > rwX) winner = y.id;
    else if (x.score > y.score) winner = x.id;
    else if (y.score > x.score) winner = y.id;
    else winner = null; // genuine draw
  } else if (ps.length === 1) {
    winner = ps[0].id;
  }

  const roundWins: Record<string, number> = {};
  const scores: Record<string, number> = {};
  const longestStreak: Record<string, number> = {};
  const readAccuracy: Record<string, number> = {};
  const fastestMs: Record<string, number> = {};
  for (const p of ps) {
    roundWins[p.id] = b.roundWins.get(p.id) ?? 0;
    scores[p.id] = p.score;
    longestStreak[p.id] = b.longestStreak.get(p.id) ?? 0;
    const rc = b.readCount.get(p.id) ?? 0;
    readAccuracy[p.id] = rc ? Math.round((100 * (b.readHits.get(p.id) ?? 0)) / rc) : 0;
    fastestMs[p.id] = b.fastestMs.get(p.id) ?? 0;
  }
  const syncPct = b.roundsPlayed ? Math.round((100 * b.syncRounds) / b.roundsPlayed) : 0;

  const payload: BlitzMatchEndPayload = {
    players: ps.map((p) => ({ id: p.id, handle: p.handle })),
    winner,
    roundWins,
    scores,
    longestStreak,
    readAccuracy,
    fastestMs,
    syncPct,
    worstRead: b.worstRead,
    recap: buildRecap(room),
    forfeit,
  };
  b.lastEnd = payload;
  broadcastState(io, room);
  io.to(room.code).emit('blitz:end', payload);
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
    rounds: room.roundHistory,
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
    case 'BLITZ_BUILD': {
      const me = [...room.players.values()].find((p) => p.socketId === socketId);
      if (me) {
        const b = room.blitz;
        const key = b.promptKey.get(me.id);
        if (!key) break; // defensive: never render a phantom situation
        const opp = [...room.players.values()].find((p) => p.id !== me.id);
        to.emit('blitz:round', {
          index: room.roundIndex + 1,
          total: room.settings.rounds,
          situation: key === 'A' ? b.text.A : b.text.B,
          endsAt: room.endsAt,
          oppHandle: opp?.handle ?? '—',
          roundWins: { me: b.roundWins.get(me.id) ?? 0, opp: opp ? b.roundWins.get(opp.id) ?? 0 : 0 },
          streak: { me: b.streak.get(me.id) ?? 0, opp: opp ? b.streak.get(opp.id) ?? 0 : 0 },
        });
        const mineBuild = blitzSub(room, me.id);
        if (mineBuild && !mineBuild.auto) to.emit('face:mine', { glyphs: mineBuild.glyphs });
      }
      break;
    }
    case 'BLITZ_GUESS': {
      const me = [...room.players.values()].find((p) => p.socketId === socketId);
      if (me) {
        const b = room.blitz;
        const opp = [...room.players.values()].find((p) => p.id !== me.id);
        const oppSub = opp ? blitzSub(room, opp.id) : undefined;
        const choices = b.choiceKey.map((key, token) => ({ token, text: key === 'A' ? b.text.A : b.text.B }));
        // restore an already-locked guess so a reconnect keeps the UI locked
        const lockedKey = b.guess.get(me.id);
        const lockedToken = lockedKey ? b.choiceKey.indexOf(lockedKey) : -1;
        to.emit('blitz:guess', {
          opponentFace: oppSub?.glyphs ?? PLACEHOLDER_FACE,
          oppHandle: opp?.handle ?? '—',
          choices,
          endsAt: room.endsAt,
          lockedToken: lockedToken >= 0 ? lockedToken : undefined,
        });
      }
      break;
    }
    case 'BLITZ_RESULT':
      if (room.blitz.lastResult) to.emit('blitz:result', room.blitz.lastResult);
      break;
    case 'END':
      if (room.settings.mode === 'BLITZ' && room.blitz.lastEnd) to.emit('blitz:end', room.blitz.lastEnd);
      else if (room.lastMatchEnd) to.emit('match:end', room.lastMatchEnd);
      break;
  }
}
