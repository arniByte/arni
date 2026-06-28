// Big animated mascot for the home screen: cycles through expressive kaomoji
// with a smooth crossfade, framed in [ … ], plus a gentle "breathing" scale.
import { el } from '../dom';

// Curated, symbol-only faces (decorative — not submitted, so no validation).
const FACES = [
  '◕‿◕',
  '͡° ͜ʖ ͡°',
  '◑‿◐',
  '•‿•',
  '˘ ³˘',
  '◠‿◠',
  '¬‿¬',
  '⊙﹏⊙',
  'ᗒ‿ᗕ',
  '◔̯◔',
  '・‿・',
  '≧◡≦',
  '✜‿✜',
  'ʘ‿ʘ',
  '♥‿♥',
  '◉‿◉',
];

const SWAP_MS = 2600;
const FADE_MS = 380;

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
