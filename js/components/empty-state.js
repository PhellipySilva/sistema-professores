/* Estado vazio (spec, seção 29).
 *
 * Toda lista do sistema usa isto quando não há dados — em vez de mostrar uma
 * área em branco que parece bug. */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';

/**
 * @param {string}   options.title
 * @param {string}   [options.message]
 * @param {string}   [options.iconName]
 * @param {string}   [options.actionLabel]  Sem isto, não há botão.
 * @param {Function} [options.onAction]
 * @returns {HTMLElement}
 */
export function emptyState({
  title,
  message,
  iconName = 'clipboard',
  actionLabel,
  onAction,
}) {
  const children = [
    el('div', { class: 'empty-state__icon', html: icon(iconName, 24) }),
    el('p', { class: 'empty-state__title', text: title }),
  ];

  if (message) {
    children.push(el('p', { class: 'empty-state__message', text: message }));
  }

  if (actionLabel && onAction) {
    children.push(
      el('button', {
        type: 'button',
        class: 'btn btn--primary',
        html: `${icon('plus', 18)}<span>${actionLabel}</span>`,
        onclick: onAction,
      }),
    );
  }

  return el('div', { class: 'empty-state' }, children);
}

/**
 * Estado de erro. Tem a mesma forma do vazio, mas com o tom certo e um botão
 * de tentar de novo — a spec (seção 30) proíbe mostrar a mensagem técnica.
 */
export function errorState({ message = 'Não foi possível carregar os dados.', onRetry }) {
  return emptyState({
    iconName: 'alert',
    title: 'Algo deu errado',
    message,
    actionLabel: onRetry ? 'Tentar novamente' : undefined,
    onAction: onRetry,
  });
}
