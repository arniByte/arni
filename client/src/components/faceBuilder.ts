// THE unique mechanic: a fast, tactile Unicode face constructor.
// Three input modes (slots, free-type, presets/random) over one big live preview.
// Letters & digits are hard-blocked so it stays pure expression.
import { el, clear } from '../dom';
import { facePreview } from './kaomoji';
import { t } from '../i18n';
import {
  EYES,
  MOUTHS,
  SIDES,
  ARMS,
  PRESETS,
  assemble,
  validFace,
  stripBlocked,
  randomFace,
} from './palettes';

const randInt = (n: number) => Math.floor(Math.random() * n);

interface BuilderState {
  side: number; // index into SIDES — both brackets cycle together as a pair
  le: number;
  m: number;
  re: number;
  arm: number; // -1 = none
  free: string | null; // free-type / preset override; null = use slots
  locked: boolean;
}

/**
 * Returns the builder node. `onSubmit` is called once with the final glyphs;
 * after that the builder locks itself into a confirmation state.
 */
export function createFaceBuilder(onSubmit: (glyphs: string) => void): HTMLElement {
  const st: BuilderState = { side: 0, le: 1, m: 0, re: 1, arm: -1, free: null, locked: false };

  const preview = facePreview('');

  const slotKeys: Array<{ label: string; get: () => string; cycle: () => void }> = [
    { label: 'BRKT', get: () => SIDES[st.side][0] || '·', cycle: bumpSide },
    { label: 'EYE', get: () => EYES[st.le], cycle: () => bump('le', EYES.length) },
    { label: 'MOUTH', get: () => MOUTHS[st.m], cycle: () => bump('m', MOUTHS.length) },
    { label: 'EYE', get: () => EYES[st.re], cycle: () => bump('re', EYES.length) },
    { label: 'BRKT', get: () => SIDES[st.side][1] || '·', cycle: bumpSide },
  ];

  const slotBtns = slotKeys.map((s) =>
    el('button', { class: 'slot', type: 'button', onClick: s.cycle }, s.get()),
  );
  const slots = el('div', { class: 'slots' }, ...slotBtns);
  const slotLabels = el(
    'div',
    { class: 'slot-labels' },
    ...slotKeys.map((s) => el('span', { class: 'label' }, s.label)),
  );

  const armChips = ARMS.map((arm, i) =>
    el(
      'button',
      { class: 'chip', type: 'button', onClick: () => toggleArm(i) },
      arm.replace(' ', '…'),
    ),
  );
  const armsRow = el('div', { class: 'row wrap' }, ...armChips);

  const presetChips = Object.entries(PRESETS).map(([name, glyphs]) =>
    el('button', { class: 'chip', type: 'button', title: glyphs, onClick: () => applyPreset(glyphs) }, name),
  );
  const randomBtn = el(
    'button',
    { class: 'chip lime', type: 'button', onClick: roll },
    t('random'),
  );
  const presetRow = el('div', { class: 'row wrap' }, ...presetChips, randomBtn);

  const freeInput = el('input', {
    class: 'pill',
    type: 'text',
    inputmode: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: false,
    placeholder: t('freeTypePlaceholder'),
    onInput: onFreeInput,
  }) as HTMLInputElement;

  const submitBtn = el(
    'button',
    { class: 'btn solid block', type: 'button', onClick: submit },
    t('lockInFace'),
  );

  const body = el(
    'div',
    { class: 'stack' },
    el('div', { class: 'panel' }, preview),
    el('div', { class: 'stack', style: { gap: '6px' } }, slots, slotLabels),
    el('div', { class: 'field' }, el('span', { class: 'label' }, t('arms')), armsRow),
    el('div', { class: 'field' }, el('span', { class: 'label' }, t('presets')), presetRow),
    freeInput,
    submitBtn,
  );

  const root = el('div', { class: 'stack' }, body);

  // ── state ops ───────────────────────────────────────────────────────────────
  function bump(key: 'le' | 'm' | 're', len: number): void {
    st.free = null;
    st[key] = (st[key] + 1) % len;
    refresh();
  }

  function bumpSide(): void {
    // Both bracket slots advance together so the pair always matches.
    st.free = null;
    st.side = (st.side + 1) % SIDES.length;
    refresh();
  }

  function toggleArm(i: number): void {
    st.free = null;
    st.arm = st.arm === i ? -1 : i;
    refresh();
  }

  function applyPreset(glyphs: string): void {
    st.free = glyphs;
    refresh();
  }

  function roll(): void {
    st.free = null;
    st.side = randInt(SIDES.length);
    st.le = randInt(EYES.length);
    st.m = randInt(MOUTHS.length);
    st.re = randInt(EYES.length);
    st.arm = Math.random() < 0.4 ? randInt(ARMS.length) : -1;
    // Guard against any odd combo by falling back to a known-good face.
    if (!validFace(current())) st.free = randomFace();
    refresh();
  }

  function onFreeInput(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    const cleaned = stripBlocked(raw);
    (e.target as HTMLInputElement).value = cleaned;
    st.free = cleaned === '' ? null : cleaned;
    refresh();
  }

  function current(): string {
    if (st.free != null) return st.free;
    return assemble({
      lbr: SIDES[st.side][0],
      le: EYES[st.le],
      mouth: MOUTHS[st.m],
      re: EYES[st.re],
      rbr: SIDES[st.side][1],
      arm: st.arm >= 0 ? ARMS[st.arm] : null,
    });
  }

  function refresh(): void {
    preview.textContent = current() || ' ';
    slotBtns.forEach((b, i) => (b.textContent = slotKeys[i].get()));
    armChips.forEach((c, i) => c.classList.toggle('active', i === st.arm));
    if (document.activeElement !== freeInput) freeInput.value = st.free ?? '';
    submitBtn.disabled = !validFace(current());
  }

  function submit(): void {
    if (st.locked) return;
    const glyphs = current();
    if (!validFace(glyphs)) return;
    st.locked = true;
    onSubmit(glyphs);
    lockUI(glyphs);
  }

  function lockUI(glyphs: string): void {
    clear(root);
    root.appendChild(
      el(
        'div',
        { class: 'stack center' },
        el('div', { class: 'panel' }, facePreview(glyphs)),
        el('div', { class: 'chip', style: { alignSelf: 'center' } }, t('lockedIn')),
        el('div', { class: 'hint center' }, t('waitingRoom')),
      ),
    );
  }

  refresh();
  return root;
}
