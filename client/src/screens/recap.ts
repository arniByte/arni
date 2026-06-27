// RECAP — match over: winner, final board, and the shareable recap card.
import { el } from '../dom';
import { topbar, roomMeta } from '../components/ui';
import { actions } from '../net';
import { state, isHost, setState } from '../state';
import { downloadRecap, shareRecap, shareToX, absoluteJoinUrl } from '../recap/recapCard';
import { t } from '../i18n';

async function withBusy(btn: HTMLButtonElement, label: string, fn: () => Promise<unknown>): Promise<void> {
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = label;
  try {
    await fn();
  } catch {
    setState({ error: t('cardError') });
  } finally {
    btn.disabled = false;
    btn.textContent = prev;
  }
}

export function renderRecap(): HTMLElement {
  const room = state.room!;
  const end = state.matchEnd;
  const recap = end?.recap;
  const winner = end?.winner ?? null;
  const board = end?.scoreboard ?? [];

  const winnerPanel = el(
    'div',
    { class: 'panel stack center' },
    el('span', { class: 'label' }, t('winner')),
    el('div', { class: 'face-preview', style: { minHeight: '0', color: 'var(--cyan)' } }, '◕‿◕'),
    el('div', { class: 'display lg' }, winner ? `@${winner.handle}` : '—'),
    el('div', { class: 'dim' }, winner ? `${winner.score} ${t('pts')}` : ''),
  );

  const boardPanel = el(
    'div',
    { class: 'panel stack' },
    el('span', { class: 'label' }, t('finalScoreboard')),
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

  const rowsPreview = recap
    ? el(
        'div',
        { class: 'panel stack' },
        el('span', { class: 'label' }, t('recapCardLabel')),
        ...recap.rows.map((r, i) =>
          el(
            'div',
            { class: 'prow' },
            el('span', { class: 'rank' }, `0${i + 1}`),
            el('span', { class: 'pname dim', style: { fontSize: '12px' } }, r.situation),
            el('span', { class: 'face-preview small', style: { minHeight: '0', flex: 'none', width: '90px' } }, r.glyphs),
            el('span', { class: 'pscore' }, `${r.votes}`),
          ),
        ),
      )
    : null;

  const dlBtn = el('button', { class: 'btn solid', type: 'button' }, t('downloadPng')) as HTMLButtonElement;
  dlBtn.onclick = () => recap && withBusy(dlBtn, t('rendering'), () => downloadRecap(recap));

  const shareBtn = el('button', { class: 'btn', type: 'button' }, t('shareBtn')) as HTMLButtonElement;
  shareBtn.onclick = () => recap && withBusy(shareBtn, t('rendering'), () => shareRecap(recap));

  const xBtn = el('button', { class: 'btn lime', type: 'button' }, t('shareToX')) as HTMLButtonElement;
  xBtn.onclick = () => recap && shareToX(recap);

  const actionsRow = el('div', { class: 'row wrap', style: { justifyContent: 'center' } }, dlBtn, shareBtn, xBtn);

  const playAgain = isHost()
    ? el('button', { class: 'btn solid block', type: 'button', onClick: () => actions.startGame() }, t('playAgain'))
    : el('div', { class: 'hint center' }, t('waitingHostNew'));

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code, t('phaseOver') + ' ·')),
    winnerPanel,
    actionsRow,
    rowsPreview,
    boardPanel,
    playAgain,
    el(
      'div',
      { class: 'row spread headline-foot' },
      el('span', { class: 'hint' }, recap ? absoluteJoinUrl(recap) : ''),
      el('button', { class: 'btn sm', type: 'button', onClick: () => actions.leaveRoom() }, t('leave')),
    ),
  );
}
