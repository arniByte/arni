// "Top moments" review overlay shown after a CLASSIC/IMPOSTOR match: scroll back
// through every round to see who built what, the votes, the winner, and (impostor
// mode) who the impostor was. Opens from a button on the recap screen.
import { el } from '../dom';
import { t, votesWord } from '../i18n';
import { ICON } from './icons';
import type { RoundResultPayload } from '../../../shared/protocol';

function faceRow(
  glyphs: string,
  handle: string,
  votes: number,
  opts: { winner?: boolean; impostor?: boolean } = {},
): HTMLElement {
  return el(
    'div',
    { class: 'prow' + (opts.winner ? ' me' : '') },
    el('span', { class: 'face-cell' }, glyphs),
    el('span', { class: 'pname' + (opts.winner ? '' : ' dim') }, `@${handle}`),
    opts.winner ? el('span', { class: 'tag perfect' }, '★') : null,
    opts.impostor ? el('span', { class: 'tag you' }, t('theImpostorWas')) : null,
    el('span', { class: 'pscore' }, `${votes}`),
  );
}

function roundBlock(round: RoundResultPayload, i: number): HTMLElement {
  const impFaceId = round.impostor?.faceId;
  const maxVotes = round.ranked.length ? Math.max(...round.ranked.map((r) => r.votes)) : 0;
  return el(
    'div',
    { class: 'rule-block' },
    el('div', { class: 'rule-title' }, t('reviewRound', { i: i + 1 })),
    el('div', { class: 'situation', style: { fontSize: '15px', margin: '6px 0 10px' } }, round.situation),
    ...round.ranked.map((r) =>
      faceRow(r.glyphs, r.handle, r.votes, {
        winner: maxVotes > 0 && r.votes === maxVotes,
        impostor: !!impFaceId && r.id === impFaceId,
      }),
    ),
  );
}

/** Find the single highest-voted face of the whole match (the "top moment"). */
function topMoment(rounds: RoundResultPayload[]): { glyphs: string; handle: string; votes: number; situation: string } | null {
  let best: { glyphs: string; handle: string; votes: number; situation: string } | null = null;
  for (const round of rounds) {
    for (const r of round.ranked) {
      if (r.votes > 0 && (!best || r.votes > best.votes)) {
        best = { glyphs: r.glyphs, handle: r.handle, votes: r.votes, situation: round.situation };
      }
    }
  }
  return best;
}

function openReview(rounds: RoundResultPayload[]): void {
  if (document.querySelector('.modal-overlay')) return;
  const overlay = el('div', {
    class: 'modal-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('matchReview'),
  });
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const closeBtn = el('button', {
    class: 'icon-btn',
    type: 'button',
    title: t('close'),
    'aria-label': t('close'),
    onClick: close,
  });
  closeBtn.innerHTML = ICON.close;

  const top = topMoment(rounds);
  const topBlock = top
    ? el(
        'div',
        { class: 'panel stack center', style: { marginTop: '14px', padding: '14px' } },
        el('span', { class: 'reveal-label' }, t('topMoment')),
        el('div', { class: 'face-preview', style: { minHeight: '0', padding: '6px 0' } }, top.glyphs),
        el('div', { class: 'cyan', style: { fontWeight: '700' } }, `@${top.handle}`),
        el('div', { class: 'hint center' }, `${top.situation} · ${top.votes} ${votesWord(top.votes)}`),
      )
    : null;

  const modal = el(
    'div',
    { class: 'modal' },
    el(
      'div',
      { class: 'modal-head' },
      el('h2', { class: 'display', style: { fontSize: '24px' } }, t('matchReview')),
      closeBtn,
    ),
    topBlock,
    ...rounds.map((r, i) => roundBlock(r, i)),
    el(
      'button',
      { class: 'btn solid block', type: 'button', style: { marginTop: '20px' }, onClick: close },
      t('close'),
    ),
  );

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/** Button that opens the per-round "top moments" review. */
export function reviewButton(rounds: RoundResultPayload[]): HTMLButtonElement {
  return el(
    'button',
    { class: 'btn block', type: 'button', onClick: () => openReview(rounds) },
    t('topMoments'),
  ) as HTMLButtonElement;
}
