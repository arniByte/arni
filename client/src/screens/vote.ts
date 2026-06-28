// VOTE — anonymized, shuffled grid. One vote, never your own.
import { el } from '../dom';
import { topbar, roomMeta, countdown, timerbar } from '../components/ui';
import { actions } from '../net';
import { state } from '../state';
import { t } from '../i18n';

export function renderVote(): HTMLElement {
  const vote = state.vote;
  const room = state.room!;
  const faces = vote?.faces ?? [];
  const isImp = room.settings.mode === 'IMPOSTOR';

  const grid = el(
    'div',
    { class: 'vote-grid' },
    ...faces.map((f) => {
      const mine = f.id === state.myFaceId;
      const picked = f.id === state.myVotedFaceId;
      const cls = 'vote-card' + (mine ? ' mine disabled' : '') + (picked ? ' picked' : '');
      return el(
        'button',
        {
          class: cls,
          type: 'button',
          disabled: mine,
          onClick: mine ? undefined : () => actions.castVote(f.id),
        },
        mine ? el('span', { class: 'pick-tag' }, t('you')) : picked ? el('span', { class: 'pick-tag' }, t('voteTag')) : null,
        f.glyphs,
      );
    }),
  );

  const header = el(
    'div',
    { class: 'panel stack' },
    el(
      'div',
      { class: 'row spread' },
      el('span', { class: 'label' }, isImp ? t('findImpostor') : t('voteTheVibe')),
      vote ? countdown(vote.endsAt) : null,
    ),
    vote ? timerbar(vote.endsAt, room.settings.voteSecs) : null,
    el('div', { class: 'situation' }, vote?.situation ?? ''),
  );

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code, t('phaseVote') + ' ·')),
    header,
    grid,
    el(
      'div',
      { class: 'hint center' },
      state.myVotedFaceId ? t('voteLockedChange') : isImp ? t('votePickImpostor') : t('votePick'),
    ),
  );
}
