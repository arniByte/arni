// Decorative full-bleed layer of scattered ASCII faces for the menu background.
// Positions/sizes/rotation/drift are derived deterministically from the index so
// they stay stable across re-renders (language/theme toggles don't reshuffle).
import { el } from '../dom';

const FACES = [
  '(◕‿◕)',
  '(╯°□°)╯',
  '( ˘ ³˘)',
  '(¬‿¬)',
  '(°ロ°)',
  '(✿◠‿◠)',
  'ʕ•ᴥ•ʔ',
  '(◑‿◐)',
  '(•_•)',
  '(ᵔ◡ᵔ)',
  '(>‿◠)',
  '(ノ´ヮ`)',
  '(￣ω￣)',
  '(◔_◔)',
  '(⌐■_■)',
  '(っ◔◡◔)っ',
];

const N = 16;

export function bgFaces(): HTMLElement {
  const layer = el('div', { class: 'bg-faces', 'aria-hidden': 'true' });
  for (let i = 0; i < N; i++) {
    const top = (i * 61) % 94; // 0..93 %
    const left = (i * 37 + 6) % 90; // %
    const size = 18 + ((i * 13) % 30); // 18..47 px
    const rot = ((i * 47) % 40) - 20; // -20..19 deg
    const dur = 18 + ((i * 7) % 16); // 18..33 s
    const delay = (i * 3) % 12; // s

    const span = el(
      'span',
      {
        class: 'bg-face',
        style: {
          top: `${top}%`,
          left: `${left}%`,
          fontSize: `${size}px`,
          animationDuration: `${dur}s`,
          animationDelay: `-${delay}s`,
        },
      },
      FACES[i % FACES.length],
    );
    span.style.setProperty('--r', `${rot}deg`); // custom prop needs setProperty
    layer.appendChild(span);
  }
  return layer;
}
