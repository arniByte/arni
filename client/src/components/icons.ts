// Inline SVG glyphs for the menu controls. Stroke-based (Feather-style), so they
// inherit `currentColor` and stay crisp at any size — unlike the unicode ☾/☀
// glyphs, which render inconsistently ("crooked") across devices/fonts.

const wrap = (paths: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICON = {
  // crescent moon (switch to dark)
  moon: wrap('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  // sun with rays (switch to light)
  sun: wrap(
    '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41' +
      'M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>',
  ),
  // help / question (open rules)
  help: wrap(
    '<circle cx="12" cy="12" r="10"/>' +
      '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>' +
      '<line x1="12" y1="17" x2="12.01" y2="17"/>',
  ),
  // close / dismiss
  close: wrap('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
};
