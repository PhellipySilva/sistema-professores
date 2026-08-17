/* Toast — mensagens curtas de sucesso, erro e informação (spec, seção 29).
 *
 * A região é um live region ARIA, então leitores de tela anunciam a mensagem
 * sem que o foco precise sair de onde está.
 */

import { el } from '../utils/dom.js';

const DURATION = 4000;
const EXIT_ANIMATION = 200;

let region = null;

function getRegion() {
  if (region) return region;

  region = el('div', {
    class: 'toast-region',
    role: 'status',
    'aria-live': 'polite',
    'aria-atomic': 'false',
  });
  document.body.append(region);
  return region;
}

function show(message, variant) {
  const node = el('div', { class: `toast toast--${variant}` }, message);
  getRegion().append(node);

  setTimeout(() => {
    node.classList.add('toast--leaving');
    setTimeout(() => node.remove(), EXIT_ANIMATION);
  }, DURATION);

  return node;
}

export const toast = {
  success: (message) => show(message, 'success'),
  error: (message) => show(message, 'error'),
  info: (message) => show(message, 'info'),
};

export default toast;
