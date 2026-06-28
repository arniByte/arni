// Render loop: pick the screen for the current state and (re)mount it only when
// a meaningful "view key" changes — so interactive screens (BUILD/VOTE) aren't
// clobbered by unrelated updates. Toasts update on every change.
import { el } from './dom';
import { state, subscribe, setState, type AppState, type Screen } from './state';
import { getLang, getTheme } from './i18n';
import { renderHome } from './screens/home';
import { renderLobby } from './screens/lobby';
import { renderBuild } from './screens/build';
import { renderVote } from './screens/vote';
import { renderResult } from './screens/result';
import { renderRecap } from './screens/recap';

const screens: Record<Screen, () => HTMLElement> = {
  HOME: renderHome,
  LOBBY: renderLobby,
  BUILD: renderBuild,
  VOTE: renderVote,
  RESULT: renderResult,
  RECAP: renderRecap,
};

function viewKey(s: AppState): string {
  const i18n = `${getLang()}|${getTheme()}`;
  switch (s.screen) {
    case 'BUILD':
      // Rebuild on a new round, or when our submitted-state flips (submit /
      // reconnect-restore) — both preserve the face builder's local state otherwise.
      return `BUILD|${s.round?.index ?? 0}|${s.mySubmitted ? 1 : 0}|${i18n}`;
    case 'VOTE':
      return `VOTE|${s.round?.index ?? 0}|${s.myFaceId ?? ''}|${s.myVotedFaceId ?? ''}|${i18n}`;
    default: {
      const players =
        s.room?.players
          .map((p) => `${p.id}:${p.handle}:${p.score}:${p.connected ? 1 : 0}:${p.faceAvatar ?? ''}`)
          .join(',') ?? '';
      const settings = s.room
        ? `${s.room.settings.rounds}-${s.room.settings.buildSecs}-${s.room.settings.voteSecs}`
        : '';
      return [s.screen, players, settings, s.room?.host ?? '', s.result?.situation ?? '', s.matchEnd ? 1 : 0, i18n].join('|');
    }
  }
}

// ── toast (used for both errors and small notices) ────────────────────────────
let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;
let shownToast: string | null = null;

function syncToast(): void {
  if (state.error) {
    if (!toastEl) {
      toastEl = el('div', { class: 'toast' });
      document.body.appendChild(toastEl);
    }
    // Only (re)arm dismissal when the message actually changes, so unrelated
    // state updates can't keep an old toast on screen forever.
    if (state.error !== shownToast) {
      shownToast = state.error;
      toastEl.textContent = state.error;
      toastEl.style.display = 'block';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setState({ error: null }), 2600);
    }
  } else if (toastEl) {
    toastEl.style.display = 'none';
    shownToast = null;
  }
}

export function startRender(root: HTMLElement): void {
  let lastKey = '';
  let lastScreen: Screen | '' = '';
  const draw = () => {
    syncToast();
    const key = viewKey(state);
    if (key === lastKey) return;
    lastKey = key;
    const node = screens[state.screen]();
    // Entrance animations play only when the screen (phase) actually changes —
    // not on same-screen data updates like a player joining the lobby.
    if (state.screen !== lastScreen) node.classList.add('enter');
    lastScreen = state.screen;
    root.replaceChildren(node);
    window.scrollTo(0, 0);
  };
  subscribe(draw);
  draw();
}
