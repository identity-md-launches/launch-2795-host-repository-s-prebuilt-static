import { h } from '../dom';

const VARIABLES = new Set(['t', 'x', 'y', 'i', 'u', 'v', 'r', 'a']);
const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'sign', 'min', 'max', 'mod',
  'atan2', 'hypot', 'clamp', 'mix', 'step', 'fract', 'hash', 'noise',
]);

const TOKEN = /(\d+\.?\d*|\.\d+)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([\s\S])/g;

/** Colours only. The real parser owns validity, so this never tries to judge the program. */
export function highlight(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const match of source.matchAll(TOKEN)) {
    const [text, number, word, space] = match;
    if (space !== undefined) {
      fragment.appendChild(document.createTextNode(text));
    } else if (number !== undefined) {
      fragment.appendChild(h('span', { class: 'tok-num' }, text));
    } else if (word !== undefined) {
      const tone = VARIABLES.has(word) ? 'tok-var' : FUNCTIONS.has(word) ? 'tok-fn' : 'tok-word';
      fragment.appendChild(h('span', { class: tone }, text));
    } else {
      fragment.appendChild(h('span', { class: 'tok-op' }, text));
    }
  }
  return fragment;
}
