// "How to play" overlay: explains the round flow plus each game mode (CLASSIC,
// IMPOSTOR) so a brand-new player understands what to do. Opened from a small
// help-icon button in the menu top bar.
import { el } from '../dom';
import { t } from '../i18n';
import { ICON } from './icons';

function ruleBlock(titleKey: string, bodyKey: string): HTMLElement {
  return el(
    'div',
    { class: 'rule-block' },
    el('div', { class: 'rule-title' }, t(titleKey)),
    el('div', { class: 'rule-body' }, t(bodyKey)),
  );
}

function openRules(): void {
  // guard against stacking duplicates
  if (document.querySelector('.modal-overlay')) return;

  const overlay = el('div', {
    class: 'modal-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': t('rulesTitle'),
  });

  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  // click on the dimmed backdrop (but not the card) dismisses
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

  const modal = el(
    'div',
    { class: 'modal' },
    el(
      'div',
      { class: 'modal-head' },
      el('h2', { class: 'display', style: { fontSize: '24px' } }, t('rulesTitle')),
      closeBtn,
    ),
    el('p', { class: 'rule-body', style: { marginTop: '12px' } }, t('rulesIntro')),
    ruleBlock('rulesFlowTitle', 'rulesFlowBody'),
    ruleBlock('rulesClassicTitle', 'rulesClassicBody'),
    ruleBlock('rulesImpostorTitle', 'rulesImpostorBody'),
    el(
      'button',
      {
        class: 'btn solid block',
        type: 'button',
        style: { marginTop: '20px' },
        onClick: close,
      },
      t('close'),
    ),
  );

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

/** The help-icon button that opens the rules overlay. */
export function rulesButton(): HTMLButtonElement {
  const btn = el('button', {
    class: 'icon-btn',
    type: 'button',
    title: t('rules'),
    'aria-label': t('rules'),
    onClick: openRules,
  });
  btn.innerHTML = ICON.help;
  return btn;
}
