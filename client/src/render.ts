// Render loop: pick the screen for the current state and (re)mount it only when
// a meaningful "view key" changes — so interactive screens (BUILD/VOTE) aren't
// clobbered by unrelated updates. Toasts update on every change.
import { el } from './dom';
import { state, subscribe, setState, type AppState, type Screen } from './state';
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
  switch (s.screen) {
    case 'BUILD':
      // Rebuild only on a new round — preserves the face builder's local state.
      return `BUILD|${s.round?.index ?? 0}`;
    case 'VOTE':
      return `VOTE|${s.round?.index ?? 0}|${s.myFaceId ?? ''}|${s.myVotedFaceId ?? ''}`;
    default: {
      const players =
        s.room?.players
          .map((p) => `${p.id}:${p.handle}:${p.score}:${p.connected ? 1 : 0}:${p.faceAvatar ?? ''}`)
          .join(',') ?? '';
      const settings = s.room
        ? `${s.room.settings.rounds}-${s.room.settings.buildSecs}-${s.room.settings.voteSecs}`
        : '';
      return [s.screen, players, settings, s.room?.host ?? '', s.result?.situation ?? '', s.matchEnd ? 1 : 0].join('|');
    }
  }
}

// ── toast (used for both errors and small notices) ────────────────────────────
let toastEl: HTMLElement | null = null;
let toastTimer: number | undefined;

function syncToast(): void {
  if (state.error) {
    if (!toastEl) {
      toastEl = el('div', { class: 'toast' });
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = state.error;
    toastEl.style.display = 'block';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setState({ error: null }), 2600);
  } else if (toastEl) {
    toastEl.style.display = 'none';
  }
}

export function startRender(root: HTMLElement): void {
  let lastKey = '';
  const draw = () => {
    syncToast();
    const key = viewKey(state);
    if (key === lastKey) return;
    lastKey = key;
    root.replaceChildren(screens[state.screen]());
    window.scrollTo(0, 0);
  };
  subscribe(draw);
  draw();
}
