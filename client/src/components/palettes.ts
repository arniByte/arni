// Seed Unicode part palettes + presets + validation for the face constructor.
// These are STARTING sets, not limits — expand freely.
import { LIMITS } from '../../../shared/protocol';

export const EYES = [
  '•', '◕', '◔', '⊙', '°', '˘', '¬', 'ﾟ', '◣', '▰', 'ㅇ', '╥', '≖', '◠', '˙', '⌐', '$', '×', '＾', '◉',
];

export const MOUTHS = [
  '‿', '﹏', 'ω', '◡', '_', 'ε', 'Д', '益', 'ʖ', '⌣', '︿', '▾', 'Σ', '□', 'ヘ', '◇', '౪', 'ᗨ', '∀', '・',
];

// Bracket pairs. A blank pair lets you build a bracket-less face.
export const SIDES: [string, string][] = [
  ['(', ')'],
  ['[', ']'],
  ['｜', '｜'],
  ['{', '}'],
  ['⦅', '⦆'],
  ['〔', '〕'],
  ['', ''],
];
export const LBR = SIDES.map((s) => s[0]);
export const RBR = SIDES.map((s) => s[1]);

// Arms wrap (when they contain a space) or suffix (when they don't).
export const ARMS = ['╯︵', 'ヽ ノ', '٩ ۶', 'つ ⊂', '┌ ┐', 'ﾉ', '୧ ୨', '乁 ㄏ', '╯︵ ┻━┻'];

export const EXTRAS = ['✧', 'ﾟ', '｡', '‼', '☆', '♪', '✦', '〜', '՞', 'ᕗ'];

export const PRESETS: Record<string, string> = {
  flip: '(╯°□°)╯︵ ┻━┻',
  shrug: '¯\\_(ツ)_/¯',
  sparkle: '✧(◕‿◕)✧',
  dead: '( ╳_╳ )',
  love: '(♡‿♡)',
  smug: '( ͡° ͜ʖ ͡°)',
};

// ── validation (mirror of the server; client validates only for UX) ───────────
export const BLOCK = /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/;
const BLOCK_GLOBAL = /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/g;

export function validFace(s: string): boolean {
  const cps = [...s.trim()];
  return cps.length > 0 && cps.length <= LIMITS.FACE_MAX_CP && !BLOCK.test(s);
}

/** Strip letters/digits and cap to the code-point limit (used for the free-type field). */
export function stripBlocked(s: string): string {
  const cleaned = s.replace(BLOCK_GLOBAL, '');
  const cps = [...cleaned];
  return cps.length > LIMITS.FACE_MAX_CP ? cps.slice(0, LIMITS.FACE_MAX_CP).join('') : cleaned;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Assemble a face from explicit parts (used by the slot builder). */
export function assemble(parts: {
  lbr: string;
  le: string;
  mouth: string;
  re: string;
  rbr: string;
  arm?: string | null;
}): string {
  const core = `${parts.lbr}${parts.le}${parts.mouth}${parts.re}${parts.rbr}`;
  if (!parts.arm) return core;
  if (parts.arm.includes(' ')) {
    const [a, b] = parts.arm.split(' ');
    return `${a}${core}${b}`;
  }
  return `${core}${parts.arm}`;
}

/** Roll a valid random face. */
export function randomFace(): string {
  const sideIdx = Math.floor(Math.random() * SIDES.length);
  const useArm = Math.random() < 0.4;
  const face = assemble({
    lbr: LBR[sideIdx],
    le: pick(EYES),
    mouth: pick(MOUTHS),
    re: pick(EYES),
    rbr: RBR[sideIdx],
    arm: useArm ? pick(ARMS) : null,
  });
  return validFace(face) ? face : '( ◕‿◕ )';
}
