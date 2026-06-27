// Face & input validation. The CLIENT validates for UX, but the SERVER re-checks
// everything here — nothing from the client is trusted.
import { LIMITS } from '../../shared/protocol';

// ASCII letters/digits + full-width A-Z, a-z, 0-9. Faces must be "no words, all feeling".
export const BLOCK = /[A-Za-z0-9Ａ-Ｚａ-ｚ０-９]/;

/** A valid face is non-empty, <= FACE_MAX_CP code points, and contains no letters/digits. */
export function validFace(s: string): boolean {
  if (typeof s !== 'string') return false;
  const cps = [...s.trim()]; // spread iterates by code point, not UTF-16 unit
  return cps.length > 0 && cps.length <= LIMITS.FACE_MAX_CP && !BLOCK.test(s);
}

/** Clean a handle: strip control chars, collapse whitespace, cap length. */
export function sanitizeHandle(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s
    .replace(/\p{Cc}/gu, '') // strip control chars (no literal control bytes in source)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.HANDLE_MAX);
}

export function validHandle(s: string): boolean {
  return s.length >= 1 && s.length <= LIMITS.HANDLE_MAX;
}

/** Normalize a room code to the 4-char unambiguous uppercase alphabet. */
export function normalizeCode(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}
