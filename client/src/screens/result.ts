// RESULT — ranked faces for the round + the running scoreboard.
import { el } from '../dom';
import { topbar, roomMeta } from '../components/ui';
import { state } from '../state';
import { t, votesWord } from '../i18n';

export function renderResult(): HTMLElement {
  const result = state.result;
  const room = state.room!;
  const ranked = result?.ranked ?? [];
  const board = result?.scoreboard ?? [];
  const isImp = room.settings.mode === 'IMPOSTOR';
  const imp = result?.impostor;

  // IMPOSTOR mode: reveal who it was, their face, decoy situation, caught or not.
  const impostorPanel =
    isImp && imp
      ? el(
          'div',
          { class: 'panel stack center' },
          el('span', { class: 'reveal-label' }, t('theImpostorWas')),
          el('div', { class: 'face-preview' }, imp.glyphs),
          el('div', { class: 'display lg' }, `@${imp.handle}`),
          el(
            'div',
            { class: 'row', style: { justifyContent: 'center', gap: '10px' } },
            el('span', { class: 'verdict ' + (imp.caught ? 'caught' : 'evaded') }, imp.caught ? t('impostorCaught') : t('impostorEvaded')),
            el('span', { class: 'dim' }, `${imp.votes} ${votesWord(imp.votes)}`),
          ),
          el('div', { class: 'hint center' }, `${t('theirSituationWas')}: ${imp.decoySituation}`),
        )
      : null;

  const top = ranked[0];

  const winnerPanel = top
    ? el(
        'div',
        { class: 'panel stack center' },
        el('span', { class: 'label' }, top.perfectRead ? t('perfectRead') : t('topFace')),
        el('div', { class: 'face-preview' }, top.glyphs),
        el(
          'div',
          { class: 'row', style: { justifyContent: 'center', gap: '10px' } },
          el('span', { class: 'cyan' }, `@${top.handle}`),
          el('span', { class: 'dim' }, `· ${top.votes} ${votesWord(top.votes)}`),
          top.perfectRead ? el('span', { class: 'tag perfect' }, t('perfect')) : null,
        ),
      )
    : el('div', { class: 'panel center dim' }, t('noVotesRound'));

  const others = ranked.slice(1);
  const rest = others.length
    ? el(
        'div',
        { class: 'panel stack' },
        el('span', { class: 'label' }, t('theRest')),
        ...others.map((r, i) =>
          el(
            'div',
            { class: 'prow' },
            el('span', { class: 'rank' }, String(i + 2)),
            el('span', { class: 'face-cell' }, r.glyphs),
            el('span', { class: 'pname dim' }, `@${r.handle}`),
            el('span', { class: 'pscore' }, `${r.votes}`),
          ),
        ),
      )
    : null;

  const scoreboard = el(
    'div',
    { class: 'panel stack' },
    el('span', { class: 'label' }, t('scoreboard')),
    el(
      'div',
      { class: 'players' },
      ...board.map((s, i) =>
        el(
          'div',
          { class: 'prow' + (s.id === state.playerId ? ' me' : '') },
          el('span', { class: 'rank' }, String(i + 1)),
          el('span', { class: 'pname' }, s.handle),
          el('span', { class: 'pscore' }, String(s.score)),
        ),
      ),
    ),
  );

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code, t('phaseResult') + ' ·')),
    el('div', { class: 'situation' }, result?.situation ?? ''),
    isImp ? impostorPanel : winnerPanel,
    isImp ? null : rest,
    scoreboard,
    el('div', { class: 'hint center' }, t('nextRound')),
  );
}
