// HOME — create or join a room. No accounts: just a handle.
import { el } from '../dom';
import { topbar, controls } from '../components/ui';
import { LIMITS } from '../../../shared/protocol';
import { actions, storedHandle } from '../net';
import { setState, state } from '../state';
import { t } from '../i18n';
import { animatedMascot } from '../components/animatedFace';
import { bgFaces } from '../components/bgFaces';

// Drafts kept across re-renders so an error toast doesn't wipe what you typed.
let draftHandle = '';
let draftCode = '';

export function renderHome(): HTMLElement {
  const urlCode = (new URLSearchParams(location.search).get('c') ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4);
  const handle0 = draftHandle || state.handle || storedHandle();
  const code0 = draftCode || urlCode;

  const handleInput = el('input', {
    class: 'pill',
    type: 'text',
    maxLength: LIMITS.HANDLE_MAX,
    placeholder: t('handlePlaceholder'),
    autocomplete: 'off',
    value: handle0,
    onInput: (e: Event) => (draftHandle = (e.target as HTMLInputElement).value),
  }) as HTMLInputElement;

  const codeInput = el('input', {
    class: 'pill code-input',
    type: 'text',
    maxLength: 4,
    placeholder: t('codeLabel'),
    autocomplete: 'off',
    value: code0,
    onInput: (e: Event) => {
      const tg = e.target as HTMLInputElement;
      tg.value = tg.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      draftCode = tg.value;
    },
  }) as HTMLInputElement;

  const handleOf = () => handleInput.value.trim();

  const create = () => {
    if (!handleOf()) return setState({ error: t('enterHandle') });
    actions.createRoom(handleOf());
  };
  const join = () => {
    if (!handleOf()) return setState({ error: t('enterHandle') });
    if (codeInput.value.length !== 4) return setState({ error: t('enterCode') });
    actions.joinRoom(codeInput.value, handleOf());
  };

  return el(
    'main',
    { class: 'screen home' },
    bgFaces(),
    topbar(controls()),

    el(
      'div',
      { class: 'stack center', style: { marginTop: '5vh' } },
      animatedMascot(),
    ),

    el(
      'div',
      { class: 'panel stack', style: { marginTop: '4vh' } },
      el('div', { class: 'field' }, el('span', { class: 'label' }, t('handle')), handleInput),
      el('button', { class: 'btn solid block', type: 'button', onClick: create }, t('createRoom')),
      el('div', { class: 'divider' }),
      el(
        'div',
        { class: 'field' },
        el('span', { class: 'label' }, t('joinRoomLabel')),
        el(
          'div',
          { class: 'row' },
          codeInput,
          el('button', { class: 'btn', type: 'button', onClick: join, style: { whiteSpace: 'nowrap' } }, t('join')),
        ),
      ),
      el('div', { class: 'hint' }, t('homeHint')),
    ),

    el(
      'div',
      { class: 'headline-foot' },
      el('h1', { class: 'display xl' }, t('home_h1')),
      el('h1', { class: 'display xl' }, t('home_h2')),
      el('h1', { class: 'display xl', style: { color: 'var(--dim)' } }, t('home_h3')),
    ),
  );
}
