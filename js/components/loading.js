/* Estados de carregamento (spec, seção 29).
 *
 * Regra do projeto: skeleton quando já sabemos o formato do que vem (listas),
 * spinner com texto quando não sabemos. Sem exagero — nada de skeleton dentro
 * de skeleton. */

import { el, render } from '../utils/dom.js';

/** Bloco central com spinner e mensagem. */
export function loadingBlock(message = 'Carregando...') {
  return el('div', { class: 'loading-block', role: 'status', 'aria-live': 'polite' }, [
    el('div', { class: 'spinner' }),
    el('span', { text: message }),
  ]);
}

/** Placeholder no formato de uma lista de cards. */
export function skeletonList(count = 3) {
  const items = Array.from({ length: count }, () =>
    el('div', { class: 'skeleton skeleton--card' }),
  );
  return el(
    'div',
    { class: 'grid-cards', 'aria-hidden': 'true' },
    items,
  );
}

/** Atalho: troca o conteúdo de um container pelo estado de carregando. */
export function showLoading(container, message) {
  render(container, loadingBlock(message));
}

/** Atalho: troca o conteúdo de um container por skeletons. */
export function showSkeletons(container, count) {
  render(container, skeletonList(count));
}
