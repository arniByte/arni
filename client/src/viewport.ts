// Viewport wiring: Telegram Mini App safe-area + scroll parallax.
//
// 1. Telegram fullscreen — the native header/notch overlaps our floating top bar
//    and swallows taps. We read the SDK's safe-area + content-safe-area insets and
//    expose the total as --safe-top/--safe-bottom so the bar clears the header and
//    stays clickable. Re-applied on every safe-area / viewport change event.
// 2. Scroll parallax — the fixed background-faces layer is translated as you
//    scroll, so the faces visibly drift behind the frosted-glass panels (you can
//    see the distortion move = you can see you're scrolling).

interface TgInsets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}
interface TgWebApp {
  ready?: () => void;
  expand?: () => void;
  safeAreaInset?: TgInsets;
  contentSafeAreaInset?: TgInsets;
  onEvent?: (event: string, cb: () => void) => void;
}

function tg(): TgWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
}

function applyTelegramInsets(): void {
  const wa = tg();
  if (!wa) return;
  const safe = wa.safeAreaInset || {};
  const content = wa.contentSafeAreaInset || {};
  // device notch/home-bar PLUS Telegram's own chrome (header in fullscreen).
  const top = (safe.top || 0) + (content.top || 0);
  const bottom = (safe.bottom || 0) + (content.bottom || 0);
  const root = document.documentElement.style;
  // Only override the env() fallback when Telegram actually reports an inset.
  if (top > 0) root.setProperty('--safe-top', `${top}px`);
  if (bottom > 0) root.setProperty('--safe-bottom', `${bottom}px`);
}

let tgInited = false;
export function initTelegram(): void {
  const wa = tg();
  if (!wa || tgInited) return;
  tgInited = true;
  try {
    wa.ready?.();
    wa.expand?.();
    applyTelegramInsets();
    wa.onEvent?.('safeAreaChanged', applyTelegramInsets);
    wa.onEvent?.('contentSafeAreaChanged', applyTelegramInsets);
    wa.onEvent?.('viewportChanged', applyTelegramInsets);
  } catch {
    /* SDK shape differs across Telegram versions — never block app start */
    tgInited = false;
  }
}

export function initScrollParallax(): void {
  let ticking = false;
  const update = (): void => {
    ticking = false;
    const layer = document.querySelector<HTMLElement>('.bg-faces');
    if (!layer) return;
    const y = window.scrollY || 0;
    // Faces lag the page (~22%) → parallax depth; the frosted panels above them
    // render the shift as live distortion while you scroll.
    layer.style.transform = `translate3d(0, ${(-y * 0.22).toFixed(1)}px, 0)`;
  };
  window.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    },
    { passive: true },
  );
}
