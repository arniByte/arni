// Tiny hyperscript helper — just enough to build DOM without a framework.
// el('div', { class: 'x', onClick: fn }, child, child)
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class' || k === 'className') node.className = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v as object);
      else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v as object);
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      } else if (k in node) {
        // Set as a property when the element supports it (value, disabled, etc.)
        (node as unknown as Record<string, unknown>)[k] = v;
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  appendAll(node, children);
  return node;
}

function appendAll(node: Node, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    node.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function frag(...children: Child[]): DocumentFragment {
  const f = document.createDocumentFragment();
  appendAll(f, children);
  return f;
}
