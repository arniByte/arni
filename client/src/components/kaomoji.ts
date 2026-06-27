// Big mono face preview, centered on a surface.
import { el } from '../dom';

export function facePreview(glyphs: string, opts?: { small?: boolean }): HTMLElement {
  return el(
    'div',
    { class: 'face-preview' + (opts?.small ? ' small' : '') },
    glyphs && glyphs.length ? glyphs : ' ',
  );
}
