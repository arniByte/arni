// HOME — create or join a room. No accounts: just a handle.
import { el } from '../dom';
import { topbar } from '../components/ui';
import { BRAND, LIMITS } from '../../../shared/protocol';
import { actions, storedHandle } from '../net';
import { setState, state } from '../state';

// Drafts kept across re-renders so an error toast doesn't wipe what you typed.
let draftHandle = '';
let draftCode = '';

export function renderHome(): HTMLElement {
  const urlCode = new URLSearchParams(location.search).get('c') ?? '';
  const handle0 = draftHandle || state.handle || storedHandle();
  const code0 = draftCode || urlCode;

  const handleInput = el('input', {
    class: 'pill',
    type: 'text',
    maxLength: LIMITS.HANDLE_MAX,
    placeholder: 'your handle',
    autocomplete: 'off',
    value: handle0,
    onInput: (e: Event) => (draftHandle = (e.target as HTMLInputElement).value),
  }) as HTMLInputElement;

  const codeInput = el('input', {
    class: 'pill code-input',
    type: 'text',
    maxLength: 4,
    placeholder: 'CODE',
    autocomplete: 'off',
    value: code0,
    onInput: (e: Event) => {
      const t = e.target as HTMLInputElement;
      t.value = t.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
      draftCode = t.value;
    },
  }) as HTMLInputElement;

  const handleOf = () => handleInput.value.trim();

  const create = () => {
    if (!handleOf()) return setState({ error: 'Enter a handle first' });
    actions.createRoom(handleOf());
  };
  const join = () => {
    if (!handleOf()) return setState({ error: 'Enter a handle first' });
    if (codeInput.value.length !== 4) return setState({ error: 'Enter a 4-letter room code' });
    actions.joinRoom(codeInput.value, handleOf());
  };

  return el(
    'main',
    { class: 'screen' },
    topbar(),

    el(
      'div',
      { class: 'stack center', style: { marginTop: '6vh', gap: '10px' } },
      el('div', { class: 'face-preview', style: { minHeight: '0', color: 'var(--cyan)' } }, BRAND.mascot),
      el('span', { class: 'chip lime', style: { alignSelf: 'center' } }, BRAND.tagline),
    ),

    el(
      'div',
      { class: 'panel stack', style: { marginTop: '4vh' } },
      el(
        'div',
        { class: 'field' },
        el('span', { class: 'label' }, 'HANDLE'),
        handleInput,
      ),
      el('button', { class: 'btn solid block', type: 'button', onClick: create }, 'CREATE NEW ROOM'),
      el('div', { class: 'divider' }),
      el(
        'div',
        { class: 'field' },
        el('span', { class: 'label' }, 'JOIN A ROOM'),
        el('div', { class: 'row' }, codeInput, el('button', { class: 'btn', type: 'button', onClick: join, style: { whiteSpace: 'nowrap' } }, 'JOIN →')),
      ),
      el('div', { class: 'hint' }, 'no signup · 3–12 players · share the code'),
    ),

    el(
      'div',
      { class: 'headline-foot' },
      el('h1', { class: 'display xl' }, 'WHEN'),
      el('h1', { class: 'display xl' }, 'WORDS ARE'),
      el('h1', { class: 'display xl', style: { color: 'var(--dim)' } }, 'NOT ENOUGH'),
    ),
  );
}
