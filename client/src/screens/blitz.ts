// BLITZ — the 2-player duel screens: race to build (BLITZ_BUILD), guess the
// rival's situation (BLITZ_GUESS), the reveal (BLITZ_RESULT), and the scorecard
// (shown on RECAP when a blitz match ends).
import { el } from '../dom';
import { topbar, roomMeta, countdown, timerbar } from '../components/ui';
import { facePreview } from '../components/kaomoji';
import { createFaceBuilder } from '../components/faceBuilder';
import { actions } from '../net';
import { state, isHost } from '../state';
import { t } from '../i18n';
import { TIMERS } from '../../../shared/protocol';

/** VS header: round, the running round-win scoreline, and 🔥 streaks. */
function vsHeader(
  index: number,
  total: number,
  wins: { me: number; opp: number },
  streak: { me: number; opp: number },
  oppHandle: string,
  endsAt: number,
  totalSecs: number,
): HTMLElement {
  const myHandle = state.handle || '—';
  return el(
    'div',
    { class: 'panel stack' },
    el(
      'div',
      { class: 'row spread' },
      el('span', { class: 'label' }, t('roundOf', { i: index, n: total })),
      countdown(endsAt),
    ),
    timerbar(endsAt, totalSecs),
    el(
      'div',
      { class: 'vs' },
      el(
        'div',
        { class: 'vs-side' },
        el('div', { class: 'pname cyan', style: { fontWeight: '700' } }, myHandle),
        streak.me > 0 ? el('div', { class: 'hint' }, `🔥 ${streak.me}`) : null,
      ),
      el('div', { class: 'vs-score' }, `${wins.me} : ${wins.opp}`),
      el(
        'div',
        { class: 'vs-side', style: { textAlign: 'right' } },
        el('div', { class: 'pname' }, oppHandle),
        streak.opp > 0 ? el('div', { class: 'hint' }, `🔥 ${streak.opp}`) : null,
      ),
    ),
  );
}

export function renderBlitzBuild(): HTMLElement {
  const b = state.blitzRound;
  const room = state.room!;
  const header = b
    ? vsHeader(b.index, b.total, b.roundWins, b.streak, b.oppHandle, b.endsAt, TIMERS.BLITZ_RACE)
    : el('div', { class: 'panel' }, '…');

  const situation = el(
    'div',
    { class: 'panel stack' },
    el('span', { class: 'reveal-label' }, t('blitzYourSituation')),
    el('div', { class: 'situation', style: { marginTop: '4px' } }, b?.situation ?? '…'),
  );

  const body =
    state.mySubmitted && state.mySubmittedGlyphs
      ? el(
          'div',
          { class: 'stack center' },
          el('div', { class: 'panel' }, facePreview(state.mySubmittedGlyphs)),
          el('div', { class: 'chip', style: { alignSelf: 'center' } }, t('lockedIn')),
          el('div', { class: 'hint center' }, t('blitzWaitingOpp')),
        )
      : createFaceBuilder((glyphs) => actions.submitFace(glyphs));

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code, t('modeBlitz') + ' ·')),
    header,
    situation,
    body,
    el('div', { class: 'cue center headline-foot' }, t('blitzRaceHint')),
  );
}

export function renderBlitzGuess(): HTMLElement {
  const g = state.blitzGuess;
  const room = state.room!;
  const answered = state.myBlitzAnswer != null;

  const header = el(
    'div',
    { class: 'panel stack' },
    el(
      'div',
      { class: 'row spread' },
      el('span', { class: 'label' }, t('blitzGuessTitle')),
      g ? countdown(g.endsAt) : null,
    ),
    g ? timerbar(g.endsAt, TIMERS.BLITZ_GUESS) : null,
  );

  const oppFace = el(
    'div',
    { class: 'panel stack center' },
    el('span', { class: 'reveal-label' }, t('blitzOppFace')),
    el('div', { class: 'face-preview' }, g?.opponentFace ?? '…'),
  );

  const choices = el(
    'div',
    { class: 'stack' },
    ...(g?.choices ?? []).map((c) =>
      el(
        'button',
        {
          class: 'btn block blitz-choice' + (state.myBlitzAnswer === c.token ? ' solid' : ''),
          type: 'button',
          disabled: answered,
          onClick: () => actions.blitzAnswer(c.token),
        },
        c.text,
      ),
    ),
  );

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code, t('modeBlitz') + ' ·')),
    header,
    oppFace,
    choices,
    el('div', { class: 'cue center headline-foot' }, answered ? t('blitzWaitingOpp') : t('blitzGuessHint')),
  );
}

function playerResultCard(
  face: { id: string; handle: string; glyphs: string; situation: string },
  pts: { read: number; expr: number; speed: number; sync: number; combo: number; total: number } | undefined,
  guess: { guessed: string | null; correct: boolean } | undefined,
  isWinner: boolean,
): HTMLElement {
  const chip = (label: string, on: boolean) =>
    on ? el('span', { class: 'pchip' }, label) : null;
  return el(
    'div',
    { class: 'panel stack center' + (isWinner ? ' win' : '') },
    el('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } },
      el('span', { class: 'pname' + (isWinner ? ' cyan' : '') , style: { fontWeight: '700' } }, `@${face.handle}`),
      isWinner ? el('span', { class: 'tag perfect' }, `+${pts?.total ?? 0}`) : el('span', { class: 'dim' }, `+${pts?.total ?? 0}`),
    ),
    el('div', { class: 'face-preview', style: { minHeight: '0', padding: '6px 0' } }, face.glyphs),
    el('div', { class: 'hint center' }, `${t('blitzWasReactingTo')}: ${face.situation}`),
    el(
      'div',
      { class: 'review-guess ' + (guess?.correct ? 'ok' : 'no') },
      guess?.correct ? t('blitzCorrect') : t('blitzWrong'),
    ),
    el(
      'div',
      { class: 'blitz-points' },
      chip(`${t('blitzRead')} +${pts?.read ?? 0}`, !!pts && pts.read > 0),
      chip(`${t('blitzExpr')} +${pts?.expr ?? 0}`, !!pts && pts.expr > 0),
      chip(`${t('blitzSpeed')} +${pts?.speed ?? 0}`, !!pts && pts.speed > 0),
      chip(`${t('blitzSync')} +${pts?.sync ?? 0}`, !!pts && pts.sync > 0),
      pts && pts.combo > 1 ? el('span', { class: 'pchip combo' }, `${t('blitzCombo')} ×${pts.combo.toFixed(2)}`) : null,
    ),
  );
}

export function renderBlitzResult(): HTMLElement {
  const r = state.blitzResult;
  const room = state.room!;
  const myId = state.playerId;
  const mine = r?.faces.find((f) => f.id === myId);
  const opp = r?.faces.find((f) => f.id !== myId);

  let verdict = t('blitzDrawRound');
  let vcls = 'draw';
  if (r?.roundWinner) {
    if (r.roundWinner === myId) { verdict = t('blitzRoundWin'); vcls = 'win'; }
    else { verdict = t('blitzRoundLose'); vcls = 'lose'; }
  }
  const wins = r ? `${r.roundWins[myId ?? ''] ?? 0} : ${opp ? r.roundWins[opp.id] ?? 0 : 0}` : '0 : 0';

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code, t('modeBlitz') + ' ·')),
    el(
      'div',
      { class: 'panel stack center' },
      el('div', { class: 'verdict-line ' + vcls }, verdict),
      el('div', { class: 'vs-score big' }, wins),
      r?.syncBonus ? el('div', { class: 'sync-flash' }, `${t('blitzSync')} +${r.points[myId ?? '']?.sync ?? 0}`) : null,
    ),
    mine ? playerResultCard(mine, r?.points[mine.id], r?.guesses[mine.id], r?.roundWinner === mine.id) : null,
    opp ? playerResultCard(opp, r?.points[opp.id], r?.guesses[opp.id], r?.roundWinner === opp.id) : null,
  );
}

// ── BLITZ scorecard (END) ────────────────────────────────────────────────────
function statBox(value: string, key: string): HTMLElement {
  return el('div', { class: 'stat' }, el('div', { class: 'v' }, value), el('div', { class: 'k' }, key));
}

export function renderBlitzRecap(): HTMLElement {
  const e = state.blitzEnd!;
  const room = state.room!;
  const [p1, p2] = e.players;
  const ms = (n: number) => (n > 0 ? `${(n / 1000).toFixed(1)}с` : '—');

  const winnerHandle = e.winner ? e.players.find((p) => p.id === e.winner)?.handle ?? '' : null;

  const head = el(
    'div',
    { class: 'panel stack center' },
    el('span', { class: 'reveal-label' }, t('blitzScorecard')),
    el('div', { class: 'vs-score big' }, p1 && p2 ? `${e.roundWins[p1.id] ?? 0} : ${e.roundWins[p2.id] ?? 0}` : '—'),
    el('div', { class: 'display lg' }, winnerHandle ? `@${winnerHandle}` : t('blitzDraw')),
    e.forfeit ? el('div', { class: 'hint' }, t('blitzForfeit')) : null,
    el('div', { class: 'sync-badge' }, `${t('blitzSyncStat')} ${e.syncPct}%`),
  );

  const statsFor = (p: { id: string; handle: string }) =>
    el(
      'div',
      { class: 'panel stack' },
      el('span', { class: 'label cyan' }, `@${p.handle}`),
      el(
        'div',
        { class: 'row spread' },
        statBox(`🔥 ${e.longestStreak[p.id] ?? 0}`, t('blitzStreakStat')),
        statBox(ms(e.fastestMs[p.id] ?? 0), t('blitzFastestStat')),
        statBox(`${e.readAccuracy[p.id] ?? 0}%`, t('blitzAccuracyStat')),
      ),
    );

  const worst = e.worstRead
    ? el(
        'div',
        { class: 'panel stack center' },
        el('span', { class: 'reveal-label' }, t('blitzWorstRead')),
        el('div', { class: 'situation', style: { fontSize: '15px', textAlign: 'center' } }, e.worstRead.situation),
        el('div', { class: 'face-preview', style: { minHeight: '0', padding: '6px 0' } }, e.worstRead.glyphs),
        el('div', { class: 'hint center' }, `${t('blitzReadAs')}: ${e.worstRead.guessedAs}`),
      )
    : null;

  const rematch = isHost()
    ? el('button', { class: 'btn solid block', type: 'button', onClick: () => actions.startGame() }, t('blitzRematch'))
    : el('div', { class: 'hint center' }, t('waitingHostNew'));

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code, t('phaseOver') + ' ·')),
    head,
    p1 ? statsFor(p1) : null,
    p2 ? statsFor(p2) : null,
    worst,
    rematch,
    el(
      'div',
      { class: 'row spread headline-foot', style: { gap: '12px' } },
      el('span', { class: 'hint' }, ''),
      el('button', { class: 'btn sm outline', type: 'button', onClick: () => actions.leaveRoom() }, t('leave')),
    ),
  );
}
