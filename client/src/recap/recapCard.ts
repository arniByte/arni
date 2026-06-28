// Viral recap card: render a hidden, exactly-styled 1600x900 node and export a PNG.
// Client-side via html2canvas (MVP). Inline styles keep the export independent of app CSS.
// NOTE: html2canvas (~140KB) and qrcode are imported DYNAMICALLY inside the
// functions below, so they're code-split into a separate chunk that loads only
// when a player exports the recap card at match end — not in the initial bundle.
import { el } from '../dom';
import { BRAND, LIMITS, type RecapPayload } from '../../../shared/protocol';
import { t, votesWord, getTheme } from '../i18n';

const THEMES = {
  dark: {
    paper: '#120D11',
    surface: '#1A1318',
    ink: '#EAE7E9',
    dim: '#807580',
    cyan: '#E89BB5',
    steel: '#C89AAC',
    lime: '#D7F25A',
    grid: 'rgba(232,155,181,0.06)',
    hair: 'rgba(232,155,181,0.16)',
    qrDark: '#EAE7E9',
    qrLight: '#120D11',
  },
  light: {
    paper: '#F7F5F7',
    surface: '#FFFFFF',
    ink: '#2A222A',
    dim: '#847480',
    cyan: '#CB6386',
    steel: '#B07B94',
    lime: '#A9C400',
    grid: 'rgba(203,99,134,0.05)',
    hair: 'rgba(203,99,134,0.16)',
    qrDark: '#2A222A',
    qrLight: '#FFFFFF',
  },
};
const MONO = "'Space Mono', ui-monospace, 'Noto Sans JP', monospace";
const DISPLAY = "'Inter', 'Noto Sans JP', sans-serif";

export function absoluteJoinUrl(recap: RecapPayload): string {
  try {
    return new URL(recap.joinUrl, location.origin).href;
  } catch {
    return `${location.origin}/?c=${recap.code}`;
  }
}

async function buildCardNode(recap: RecapPayload): Promise<HTMLElement> {
  const C = THEMES[getTheme()];
  const joinUrl = absoluteJoinUrl(recap);
  const QRCode = (await import('qrcode')).default;
  const qr = await QRCode.toDataURL(joinUrl, {
    margin: 1,
    width: 150,
    color: { dark: C.qrDark, light: C.qrLight },
  });

  // Render every round (bounded by the max round count) so the PNG matches the
  // on-screen preview — the space-evenly layout fits up to 8 rows in 900px.
  const rows = recap.rows.slice(0, LIMITS.MAX_ROUNDS);

  const card = el('div', {
    style: {
      width: '1600px',
      height: '900px',
      boxSizing: 'border-box',
      padding: '56px 64px',
      background: C.paper,
      backgroundImage: `linear-gradient(${C.grid} 1px, transparent 1px), linear-gradient(90deg, ${C.grid} 1px, transparent 1px)`,
      backgroundSize: '40px 40px',
      color: C.ink,
      fontFamily: MONO,
      display: 'flex',
      flexDirection: 'column',
    },
  });

  // header
  card.appendChild(
    el(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: `1px solid ${C.hair}`, paddingBottom: '22px' } },
      el(
        'div',
        null,
        el('div', { style: { fontFamily: DISPLAY, fontWeight: '800', fontSize: '40px', letterSpacing: '0.02em' } },
          el('span', { style: { color: C.cyan } }, '[ ◕‿◕ ] '), 'KAO ', el('span', { style: { color: C.dim } }, '// '), '顔'),
        el('div', { style: { color: C.steel, letterSpacing: '0.32em', fontSize: '16px', marginTop: '8px' } }, t('tagline')),
      ),
      el('div', { style: { textAlign: 'right', color: C.dim, fontSize: '15px', letterSpacing: '0.18em' } },
        el('div', null, t('matchRecap')),
        el('div', { style: { color: C.steel, fontSize: '22px', marginTop: '6px', letterSpacing: '0.24em' } }, `${t('room')} ${recap.code}`)),
    ),
  );

  // rows
  const body = el('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', padding: '8px 0' } });
  rows.forEach((r, i) => {
    body.appendChild(
      el(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: '28px', padding: '6px 0', borderBottom: i < rows.length - 1 ? `1px solid ${C.hair}` : 'none' } },
        el('div', { style: { width: '40px', color: C.dim, fontSize: '20px' } }, `0${i + 1}`),
        el('div', { style: { flex: '1.5', color: C.ink, fontSize: '24px', lineHeight: '1.3' } }, r.situation),
        el('div', { style: { flex: '1', textAlign: 'center', fontSize: '46px', color: C.ink, wordBreak: 'break-word' } }, r.glyphs),
        el(
          'div',
          { style: { width: '260px', textAlign: 'right' } },
          el('div', { style: { color: C.cyan, fontSize: '22px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `@${r.handle}`),
          el('div', { style: { color: C.dim, fontSize: '17px', marginTop: '4px' } }, `${r.votes} ${votesWord(r.votes)}`),
        ),
      ),
    );
  });
  card.appendChild(body);

  // footer
  card.appendChild(
    el(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.hair}`, paddingTop: '22px' } },
      el(
        'div',
        null,
        el('div', { style: { color: C.dim, fontSize: '18px', letterSpacing: '0.08em' } }, t('play')),
        el('div', { style: { color: C.steel, fontSize: '26px', marginTop: '6px' } }, joinUrl),
      ),
      el('img', { src: qr, width: 120, height: 120, style: { borderRadius: '8px', background: C.paper } }),
    ),
  );

  return card;
}

async function renderToCanvas(recap: RecapPayload): Promise<HTMLCanvasElement> {
  const stage = el('div', { class: 'export-stage' });
  const card = await buildCardNode(recap);
  stage.appendChild(card);
  document.body.appendChild(stage);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const html2canvas = (await import('html2canvas')).default;
    return await html2canvas(card, { backgroundColor: THEMES[getTheme()].paper, width: 1600, height: 900, scale: 1 });
  } finally {
    stage.remove();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export async function recapPngBlob(recap: RecapPayload): Promise<Blob> {
  return canvasToBlob(await renderToCanvas(recap));
}

export async function downloadRecap(recap: RecapPayload): Promise<void> {
  const blob = await recapPngBlob(recap);
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `kao-${recap.code}.png` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareRecap(recap: RecapPayload): Promise<boolean> {
  try {
    const blob = await recapPngBlob(recap);
    const file = new File([blob], `kao-${recap.code}.png`, { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({
        files: [file],
        title: BRAND.name,
        text: t('tagline'),
      });
      return true;
    }
  } catch {
    /* fall through to download */
  }
  await downloadRecap(recap);
  return false;
}

export function shareToX(recap: RecapPayload): void {
  const joinUrl = absoluteJoinUrl(recap);
  const text = t('shareText', { mascot: BRAND.mascot });
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(joinUrl)}`;
  window.open(url, '_blank', 'noopener');
}
