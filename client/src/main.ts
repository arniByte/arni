// Entry point: mount the app, start the global countdown clock.
// Importing ./net registers the socket + all server-event handlers (incl. the
// auto-resume on connect), so we just need it imported.
import './net';
import { startRender } from './render';
import { tickClocks } from './components/ui';
import { applyThemeFromStorage } from './i18n';
import { initTelegram, initScrollParallax } from './viewport';

applyThemeFromStorage();

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

startRender(root);
window.setInterval(tickClocks, 250);

// Telegram safe-area + background parallax. initTelegram is idempotent; we call
// it now and again on load in case the async Telegram SDK lands after first paint.
initTelegram();
initScrollParallax();
window.addEventListener('load', initTelegram);
