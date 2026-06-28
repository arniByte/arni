// Decorative full-bleed layer of ASCII faces that fly around the whole menu
// background. Positions/paths/speed are derived deterministically from the index
// so they stay stable across re-renders (language/theme toggles don't reshuffle).
import { el } from '../dom';

const FACES = [
  '(◕‿◕)',
  '(╯°□°)╯',
  '( ˘ ³˘)',
  '(¬‿¬)',
  '(°□°)',
  '(◠‿◠)',
  'ʕ•ᴥ•ʔ',
  '(◑‿◐)',
  '(•_•)',
  '(≧◡≦)',
  '(>‿◠)',
  '(￣ω￣)',
  '(◔_◔)',
  '(ʘ‿ʘ)',
  '(◉◡◉)',
  '(•◡•)',
];

const N = 16;

export function bgFaces(): HTMLElement {
  const layer = el('div', { class: 'bg-faces', 'aria-hidden': 'true' });
  for (let i = 0; i < N; i++) {
    const top = (i * 61) % 92; // start %
    const left = (i * 37 + 6) % 88;
    const size = 18 + ((i * 13) % 28); // 18..45 px
    const rot = ((i * 47) % 40) - 20; // -20..19 deg
    // large fly deltas so they roam the whole area
    const dx = ((i * 53) % 80) - 40; // -40..39 vw
    const dy = ((i * 71) % 70) - 35; // -35..34 vh
    const dr = ((i * 37) % 70) - 35; // rotation delta
    const dur = 11 + ((i * 5) % 13); // 11..23 s (faster than before)
    const delay = -((i * 7) % 20); // desync

    const span = el(
      'span',
      {
        class: 'bg-face',
        style: {
          top: `${top}%`,
          left: `${left}%`,
          fontSize: `${size}px`,
          animationDuration: `${dur}s`,
          animationDelay: `${delay}s`,
        },
      },
      FACES[i % FACES.length],
    );
    span.style.setProperty('--r', `${rot}deg`);
    span.style.setProperty('--dx', `${dx}vw`);
    span.style.setProperty('--dy', `${dy}vh`);
    span.style.setProperty('--dr', `${dr}deg`);
    layer.appendChild(span);
  }
  return layer;
}
