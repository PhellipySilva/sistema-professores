/* Confirmação antes de ações destrutivas (spec, seção 31).
 *
 * Devolve uma Promise<boolean>, para o chamador poder escrever:
 *
 *   if (!(await confirmDialog({ ... }))) return;
 */

import { el } from '../utils/dom.js';
import { openModal } from './modal.js';

/**
 * @param {string}  options.title
 * @param {string}  options.message      O que exatamente vai acontecer.
 * @param {string}  [options.confirmLabel]
 * @param {string}  [options.cancelLabel]
 * @param {boolean} [options.danger]     Pinta o botão de confirmar de vermelho.
 * @returns {Promise<boolean>}
 */
export function confirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
}) {
  return new Promise((resolve) => {
    let confirmed = false;

    const cancelButton = el('button', {
      type: 'button',
      class: 'btn btn--secondary',
      text: cancelLabel,
      onclick: () => modal.close(),
    });

    const confirmButton = el('button', {
      type: 'button',
      class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
      text: confirmLabel,
      onclick: () => {
        confirmed = true;
        modal.close();
      },
    });

    const modal = openModal({
      title,
      content: el('p', { text: message }),
      actions: [cancelButton, confirmButton],
      // Fechar pelo Esc, pelo X ou pelo backdrop conta como cancelar.
      onClose: () => resolve(confirmed),
    });

    // O foco começa em "Cancelar": Enter sem querer não apaga nada.
    cancelButton.focus();
  });
}
