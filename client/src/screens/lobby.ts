// LOBBY — room code, live roster, host settings + start.
import { el } from '../dom';
import { topbar, roomMeta } from '../components/ui';
import { LIMITS } from '../../../shared/protocol';
import { actions } from '../net';
import { state, isHost, setState } from '../state';
import { t } from '../i18n';

function joinUrl(code: string): string {
  return `${location.origin}/?c=${code}`;
}

function copy(text: string, okMsg: string): void {
  navigator.clipboard?.writeText(text).then(
    () => setState({ error: okMsg }),
    () => setState({ error: t('copyFailed') }),
  );
}

function stepper(label: string, value: number, lo: number, hi: number, onSet: (v: number) => void): HTMLElement {
  const host = isHost();
  const dec = el('button', { class: 'btn sm', type: 'button', disabled: !host || value <= lo, onClick: () => onSet(value - 1) }, '−');
  const inc = el('button', { class: 'btn sm', type: 'button', disabled: !host || value >= hi, onClick: () => onSet(value + 1) }, '+');
  return el(
    'div',
    { class: 'row spread' },
    el('span', { class: 'label' }, label),
    el('div', { class: 'row', style: { gap: '8px' } }, dec, el('span', { class: 'count-pill' }, String(value)), inc),
  );
}

export function renderLobby(): HTMLElement {
  const room = state.room!;
  const connected = room.players.filter((p) => p.connected).length;
  const canStart = isHost() && connected >= LIMITS.MIN_PLAYERS;

  const roster = el(
    'div',
    { class: 'players' },
    ...room.players.map((p) =>
      el(
        'div',
        { class: 'prow' + (p.id === state.playerId ? ' me' : '') + (p.connected ? '' : ' off') },
        el('span', { class: 'avatar' }, p.faceAvatar || '◌'),
        el('span', { class: 'pname' }, p.handle),
        p.id === room.host ? el('span', { class: 'tag host' }, t('host')) : null,
        p.id === state.playerId ? el('span', { class: 'tag you' }, t('you')) : null,
      ),
    ),
  );

  const mode = room.settings.mode ?? 'CLASSIC';
  const modeBtn = (m: 'CLASSIC' | 'IMPOSTOR', label: string) =>
    el(
      'button',
      {
        class: 'btn sm' + (mode === m ? ' active' : ''),
        type: 'button',
        disabled: !isHost(),
        onClick: () => actions.updateSettings({ mode: m }),
      },
      label,
    );
  const modeRow = el(
    'div',
    { class: 'row spread' },
    el('span', { class: 'label' }, t('gameMode')),
    el('div', { class: 'row', style: { gap: '8px' } }, modeBtn('CLASSIC', t('modeClassic')), modeBtn('IMPOSTOR', t('modeImpostor'))),
  );

  const settings = el(
    'div',
    { class: 'panel stack' },
    el('span', { class: 'label' }, t('settings')),
    modeRow,
    mode === 'IMPOSTOR' ? el('div', { class: 'hint', style: { marginTop: '-4px' } }, t('impostorLobbyHint')) : null,
    stepper(t('rounds'), room.settings.rounds, LIMITS.MIN_ROUNDS, LIMITS.MAX_ROUNDS, (v) => actions.updateSettings({ rounds: v })),
    stepper(t('buildSecs'), room.settings.buildSecs, 15, 90, (v) => actions.updateSettings({ buildSecs: v })),
    stepper(t('voteSecs'), room.settings.voteSecs, 10, 60, (v) => actions.updateSettings({ voteSecs: v })),
    isHost() ? null : el('div', { class: 'hint' }, t('hostOnlySettings')),
  );

  const startBlock = isHost()
    ? el(
        'div',
        { class: 'stack' },
        el(
          'button',
          { class: 'btn lime block', type: 'button', disabled: !canStart, onClick: () => actions.startGame() },
          canStart ? t('startMatch') : t('needMore', { n: LIMITS.MIN_PLAYERS - connected }),
        ),
        connected < LIMITS.MIN_PLAYERS
          ? el('div', { class: 'hint center' }, t('minPlayers', { n: connected, m: LIMITS.MIN_PLAYERS }))
          : null,
      )
    : el('div', { class: 'hint center' }, t('waitingHostStart'));

  return el(
    'main',
    { class: 'screen' },
    topbar(roomMeta(room.code)),

    el(
      'div',
      { class: 'panel stack center' },
      el('span', { class: 'label' }, t('roomCode')),
      el('div', { class: 'display lg', style: { letterSpacing: '0.28em', color: 'var(--cyan)' } }, room.code),
      el(
        'div',
        { class: 'row', style: { justifyContent: 'center' } },
        el('button', { class: 'btn sm', type: 'button', onClick: () => copy(room.code, t('codeCopied')) }, t('copyCode')),
        el('button', { class: 'btn sm', type: 'button', onClick: () => copy(joinUrl(room.code), t('linkCopied')) }, t('copyLink')),
      ),
    ),

    el(
      'div',
      { class: 'panel stack' },
      el('div', { class: 'row spread' }, el('span', { class: 'label' }, t('players')), el('span', { class: 'count-pill' }, `${connected}/${LIMITS.MAX_PLAYERS}`)),
      roster,
    ),

    settings,
    startBlock,

    el('div', { class: 'row spread headline-foot' }, el('span', { class: 'hint' }, t('leaveAnytime')), el('button', { class: 'btn sm', type: 'button', onClick: () => actions.leaveRoom() }, t('leave'))),
  );
}
