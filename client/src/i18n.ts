// Tiny i18n + theme helpers. Russian is the default; English is available.
// Strings are looked up by key with {param} interpolation.

export type Lang = 'ru' | 'en';

const RU: Record<string, string> = {
  tagline: 'КОГДА СЛОВ НЕДОСТАТОЧНО',
  home_h1: 'КОГДА',
  home_h2: 'СЛОВ',
  home_h3: 'НЕДОСТАТОЧНО',
  handle: 'ИМЯ',
  handlePlaceholder: 'ваше имя',
  createRoom: 'СОЗДАТЬ КОМНАТУ',
  joinRoomLabel: 'ВОЙТИ В КОМНАТУ',
  codeLabel: 'КОД',
  join: 'ВОЙТИ →',
  homeHint: 'без регистрации · 3–12 игроков · поделитесь кодом',
  enterHandle: 'Сначала введите имя',
  enterCode: 'Введите код из 4 символов',
  roomCode: 'КОД КОМНАТЫ',
  copyCode: 'КОПИРОВАТЬ КОД',
  copyLink: 'КОПИРОВАТЬ ССЫЛКУ',
  codeCopied: 'Код скопирован',
  linkCopied: 'Ссылка скопирована',
  copyFailed: 'Не удалось скопировать',
  players: 'ИГРОКИ',
  settings: 'НАСТРОЙКИ',
  rounds: 'РАУНДЫ',
  buildSecs: 'СЕК. НА ЛИЦО',
  voteSecs: 'СЕК. НА ГОЛОС',
  hostOnlySettings: 'настройки меняет только хост',
  startMatch: 'НАЧАТЬ ИГРУ ▶',
  needMore: 'НУЖНО ЕЩЁ {n}',
  minPlayers: '{n}/{m} — минимум игроков',
  waitingHostStart: 'ждём, пока хост начнёт…',
  leaveAnytime: 'выйти можно в любой момент',
  leave: 'ВЫЙТИ',
  host: 'ХОСТ',
  you: 'ВЫ',
  roundOf: 'РАУНД {i} / {n}',
  phaseBuild: 'ЛИЦО',
  phaseVote: 'ГОЛОС',
  phaseResult: 'ИТОГ',
  phaseOver: 'КОНЕЦ',
  lockedIn: '✓ ГОТОВО',
  waitingRoom: 'ждём остальных…',
  arms: 'РУКИ',
  presets: 'ПРЕСЕТЫ',
  random: '⟳ СЛУЧАЙНО',
  freeTypePlaceholder: 'или введите символы — без букв и цифр',
  lockInFace: 'ЗАФИКСИРОВАТЬ ⏎',
  voteTheVibe: 'ГОЛОСУЙ ЗА ВАЙБ',
  voteTag: '✓ ГОЛОС',
  voteLockedChange: 'голос принят — нажмите другое лицо',
  votePick: 'выберите лучшее лицо (не своё)',
  perfectRead: 'ИДЕАЛЬНОЕ ПОПАДАНИЕ',
  topFace: 'ЛУЧШЕЕ ЛИЦО',
  perfect: 'ИДЕАЛЬНО',
  noVotesRound: 'в этом раунде без голосов',
  theRest: 'ОСТАЛЬНЫЕ',
  scoreboard: 'ТАБЛО',
  nextRound: 'следующий раунд…',
  winner: 'ПОБЕДИТЕЛЬ',
  finalScoreboard: 'ФИНАЛЬНОЕ ТАБЛО',
  recapCardLabel: 'ИТОГОВАЯ КАРТОЧКА',
  downloadPng: '↓ СКАЧАТЬ PNG',
  shareBtn: '⇪ ПОДЕЛИТЬСЯ',
  shareToX: 'ПОДЕЛИТЬСЯ В X',
  playAgain: 'ИГРАТЬ СНОВА ▶',
  waitingHostNew: 'ждём новую игру от хоста…',
  rendering: 'рендерим…',
  cardError: 'Не удалось создать карточку',
  pts: 'очк.',
  room: 'КОМНАТА',
  matchRecap: 'ИТОГИ ИГРЫ',
  play: 'играть →',
  shareText: 'Я сыграл в KAO // 顔 {mascot}\nКОГДА СЛОВ НЕДОСТАТОЧНО',
  // error codes
  err_ROOM_NOT_FOUND: 'Комната не найдена',
  err_ROOM_FULL: 'Комната заполнена',
  err_NAME_TAKEN: 'Это имя занято',
  err_NEED_3_PLAYERS: 'Нужно минимум 3 игрока',
  err_NOT_HOST: 'Это может только хост',
  err_BAD_FACE: 'Лицо — только символы',
  err_IN_PROGRESS: 'Игра уже идёт',
  err_BAD_HANDLE: 'Сначала введите имя',
  err_DEFAULT: 'Что-то пошло не так',
};

const EN: Record<string, string> = {
  tagline: 'WHEN WORDS ARE NOT ENOUGH',
  home_h1: 'WHEN',
  home_h2: 'WORDS ARE',
  home_h3: 'NOT ENOUGH',
  handle: 'HANDLE',
  handlePlaceholder: 'your handle',
  createRoom: 'CREATE NEW ROOM',
  joinRoomLabel: 'JOIN A ROOM',
  codeLabel: 'CODE',
  join: 'JOIN →',
  homeHint: 'no signup · 3–12 players · share the code',
  enterHandle: 'Enter a handle first',
  enterCode: 'Enter a 4-letter room code',
  roomCode: 'ROOM CODE',
  copyCode: 'COPY CODE',
  copyLink: 'COPY LINK',
  codeCopied: 'Code copied',
  linkCopied: 'Invite link copied',
  copyFailed: 'Copy failed — long-press to copy',
  players: 'PLAYERS',
  settings: 'SETTINGS',
  rounds: 'ROUNDS',
  buildSecs: 'BUILD SECS',
  voteSecs: 'VOTE SECS',
  hostOnlySettings: 'only the host can change settings',
  startMatch: 'START MATCH ▶',
  needMore: 'NEED {n} MORE',
  minPlayers: '{n}/{m} players minimum',
  waitingHostStart: 'waiting for the host to start…',
  leaveAnytime: 'leave anytime',
  leave: 'LEAVE',
  host: 'HOST',
  you: 'YOU',
  roundOf: 'ROUND {i} / {n}',
  phaseBuild: 'BUILD',
  phaseVote: 'VOTE',
  phaseResult: 'RESULT',
  phaseOver: 'OVER',
  lockedIn: '✓ LOCKED IN',
  waitingRoom: 'waiting for the room…',
  arms: 'ARMS',
  presets: 'PRESETS',
  random: '⟳ RANDOM',
  freeTypePlaceholder: 'or free-type symbols — no letters / digits',
  lockInFace: 'LOCK IN FACE ⏎',
  voteTheVibe: 'VOTE THE VIBE',
  voteTag: '✓ VOTE',
  voteLockedChange: 'vote locked — tap another to change',
  votePick: 'pick the face that nails it (not your own)',
  perfectRead: 'PERFECT READ',
  topFace: 'TOP FACE',
  perfect: 'PERFECT',
  noVotesRound: 'no votes this round',
  theRest: 'THE REST',
  scoreboard: 'SCOREBOARD',
  nextRound: 'next round starting…',
  winner: 'WINNER',
  finalScoreboard: 'FINAL SCOREBOARD',
  recapCardLabel: 'RECAP CARD',
  downloadPng: '↓ DOWNLOAD PNG',
  shareBtn: '⇪ SHARE',
  shareToX: 'SHARE TO X',
  playAgain: 'PLAY AGAIN ▶',
  waitingHostNew: 'waiting for the host to start a new match…',
  rendering: 'rendering…',
  cardError: 'Could not render the card',
  pts: 'pts',
  room: 'ROOM',
  matchRecap: 'MATCH RECAP',
  play: 'play →',
  shareText: 'I just played KAO // 顔 {mascot}\nWHEN WORDS ARE NOT ENOUGH',
  err_ROOM_NOT_FOUND: 'Room not found',
  err_ROOM_FULL: 'Room is full',
  err_NAME_TAKEN: 'That handle is taken',
  err_NEED_3_PLAYERS: 'Need at least 3 players',
  err_NOT_HOST: 'Only the host can do that',
  err_BAD_FACE: 'Face must be symbols only',
  err_IN_PROGRESS: 'Match already in progress',
  err_BAD_HANDLE: 'Pick a handle first',
  err_DEFAULT: 'Something went wrong',
};

const DICTS: Record<Lang, Record<string, string>> = { ru: RU, en: EN };

let lang: Lang = (localStorage.getItem('kao.lang') as Lang) || 'ru';

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  localStorage.setItem('kao.lang', l);
}

export function t(key: string, params?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? EN[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replace(`{${k}}`, String(v));
  }
  return s;
}

/** Localized "vote(s)" word with Russian plural rules. */
export function votesWord(n: number): string {
  if (lang === 'ru') {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'голос';
    if (m10 >= 2 && m10 <= 4 && !(m100 >= 12 && m100 <= 14)) return 'голоса';
    return 'голосов';
  }
  return n === 1 ? 'vote' : 'votes';
}

// ── theme ─────────────────────────────────────────────────────────────────────
export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  return (localStorage.getItem('kao.theme') as Theme) || 'light';
}

export function setTheme(th: Theme): void {
  localStorage.setItem('kao.theme', th);
  document.documentElement.dataset.theme = th;
}

export function applyThemeFromStorage(): void {
  document.documentElement.dataset.theme = getTheme();
}
