// Big animated mascot for the home screen: cycles through expressive kaomoji
// with a smooth crossfade, framed in [ … ], plus a gentle "breathing" scale.
import { el } from '../dom';

// Curated, symbol-only faces (decorative — not submitted, so no validation).
// Clean, single-code-point faces only — no combining diacritics (which render
// "crooked" on some devices). Each renders reliably in a monospace font.
const FACES = [
  '◕‿◕',
  '◑‿◐',
  '•‿•',
  '◠‿◠',
  '¬‿¬',
  '⊙﹏⊙',
  '・‿・',
  '≧◡≦',
  'ʘ‿ʘ',
  '♥‿♥',
  '◉‿◉',
  '◔◡◔',
  '◔‿◔',
  '•◡•',
  '╹◡╹',
  '°□°',
];

const SWAP_MS = 1100; // quick changes (no pulse)
const FADE_MS = 160;

export function animatedMascot(): HTMLElement {
  const face = el('div', { class: 'mascot-face' }, `[ ${FACES[0]} ]`);
  let i = 0;

  const id = window.setInterval(() => {
    // Self-clean once the node leaves the DOM (home re-rendered / left).
    if (!document.contains(face)) {
      window.clearInterval(id);
      return;
    }
    face.style.opacity = '0';
    window.setTimeout(() => {
      if (!document.contains(face)) return;
      i = (i + 1) % FACES.length;
      face.textContent = `[ ${FACES[i]} ]`;
      face.style.opacity = '1';
    }, FADE_MS);
  }, SWAP_MS);

  return el('div', { class: 'mascot-wrap' }, face);
}
