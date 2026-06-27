// BUILD — a situation is shown; assemble a face before the timer runs out.
import { el } from '../dom';
import { topbar, roomMeta, countdown, timerbar } from '../components/ui';
import { facePreview } from '../components/kaomoji';
import { createFaceBuilder } from '../components/faceBuilder';
import { actions } from '../net';
import { state } from '../state';

export function renderBuild(): HTMLElement {
  const round = state.round;
  const room = state.room!;

  const header = el(
    'div',
    { class: 'panel stack' },
    el(
      'div',
      { class: 'row spread' },
      el('span', { class: 'label' }, round ? `ROUND ${round.index} / ${round.total}` : 'ROUND'),
      round ? countdown(round.endsAt) : null,
    ),
    round ? timerbar(round.endsAt, room.settings.buildSecs) : null,
    el('div', { class: 'situation' }, round?.situation ?? '…'),
  );

  // If we already locked a face this round (e.g. after a reconnect), show it.
  const body =
    state.mySubmitted && state.mySubmittedGlyphs
      ? el(
          'div',
          { class: 'stack center' },
          el('div', { class: 'panel' }, facePreview(state.mySubmittedGlyphs)),
          el('div', { class: 'chip', style: { alignSelf: 'center' } }, '✓ LOCKED IN'),
          el('div', { class: 'hint center' }, 'waiting for the room…'),
        )
      : createFaceBuilder((glyphs) => actions.submitFace(glyphs));

  return el('main', { class: 'screen' }, topbar(roomMeta(room.code, 'BUILD ·')), header, body);
}
