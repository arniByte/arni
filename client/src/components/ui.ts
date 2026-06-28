// Shared chrome: brand wordmark, top bar, and self-updating countdowns.
import { el } from '../dom';
import { BRAND } from '../../../shared/protocol';
import { t, getLang, setLang, getTheme, setTheme } from '../i18n';
import { setState } from '../state';
import { rulesButton } from './rulesModal';
import { ICON } from './icons';

/** A round, frosted icon button carrying an inline SVG glyph. */
export function iconButton(svg: string, title: string, onClick: () => void): HTMLButtonElement {
  const btn = el('button', { class: 'icon-btn', type: 'button', title, 'aria-label': title, onClick });
  btn.innerHTML = svg;
  return btn;
}

/** Rules · language · theme toggles (shown on the home screen before joining). */
export function controls(): HTMLElement {
  const lang = getLang();
  const theme = getTheme();
  return el(
    'div',
    { class: 'row', style: { gap: '8px' } },
    rulesButton(),
    el(
      'button',
      {
        class: 'btn sm',
        type: 'button',
        title: 'Язык / Language',
        onClick: () => {
          setLang(lang === 'ru' ? 'en' : 'ru');
          setState({});
        },
      },
      lang === 'ru' ? 'EN' : 'RU',
    ),
    // Show the glyph of the theme you'd switch TO (moon while light, sun while dark).
    iconButton(theme === 'light' ? ICON.moon : ICON.sun, 'Тема / Theme', () => {
      setTheme(theme === 'light' ? 'dark' : 'light');
      setState({});
    }),
  );
}

/** KAO // 顔 wordmark with the mascot. */
export function brandWordmark(opts?: { withMascot?: boolean }): HTMLElement {
  return el(
    'span',
    { class: 'brand' },
    opts?.withMascot ? el('span', { class: 'mascot' }, BRAND.mascot + ' ') : null,
    'KAO ',
    el('span', { class: 'slash' }, '// '),
    '顔',
  );
}

/** Top bar with the wordmark on the left and arbitrary meta on the right. */
export function topbar(right?: Node | null): HTMLElement {
  return el('header', { class: 'topbar' }, brandWordmark(), right ?? el('span', { class: 'topmeta' }));
}

export function roomMeta(code: string, extra?: string): HTMLElement {
  return el(
    'span',
    { class: 'topmeta' },
    extra ? el('span', null, extra) : null,
    el('span', null, t('room') + ' '),
    el('span', { class: 'code' }, code),
  );
}

// ── countdowns ────────────────────────────────────────────────────────────────
// We avoid per-element timers: elements carry data-ends/data-total and a single
// global ticker (started in main.ts) updates them all.

export function countdown(endsAt: number): HTMLElement {
  const span = el('span', { class: 'timer', dataset: { ends: String(endsAt) } });
  paintCountdown(span);
  return span;
}

export function timerbar(endsAt: number, totalSecs: number): HTMLElement {
  const bar = el(
    'div',
    { class: 'timerbar', dataset: { ends: String(endsAt), total: String(totalSecs) } },
    el('span'),
  );
  paintBar(bar);
  return bar;
}

function paintCountdown(span: HTMLElement): void {
  const ends = Number(span.dataset.ends);
  const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
  span.textContent = `${left}s`;
  span.classList.toggle('crit', left <= 5);
}

function paintBar(bar: HTMLElement): void {
  const ends = Number(bar.dataset.ends);
  const total = Number(bar.dataset.total) || 1;
  const leftSecs = Math.max(0, (ends - Date.now()) / 1000);
  const pct = Math.max(0, Math.min(100, (leftSecs / total) * 100));
  const fill = bar.firstElementChild as HTMLElement | null;
  if (fill) fill.style.width = `${pct}%`;
  bar.classList.toggle('crit', leftSecs <= 5);
}

/** Called ~4x/sec by the global clock to refresh every visible countdown. */
export function tickClocks(): void {
  document.querySelectorAll<HTMLElement>('.timer[data-ends]').forEach(paintCountdown);
  document.querySelectorAll<HTMLElement>('.timerbar[data-ends]').forEach(paintBar);
}
