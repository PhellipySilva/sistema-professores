/* Modal (spec, seção 28).
 *
 * Construído sobre o <dialog> nativo. Isso entrega de graça, e correto:
 * fechar com Esc, foco preso dentro do diálogo, backdrop, e o resto da página
 * marcado como inerte para leitores de tela. Uma implementação manual erraria
 * pelo menos uma dessas coisas.
 */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';

// Ids únicos: dois modais abertos ao mesmo tempo não podem compartilhar o id do
// formulário, senão o botão do rodapé submete o formulário errado.
let modalCounter = 0;

/**
 * Abre um modal.
 *
 * @param {object}  options
 * @param {string}  options.title       Título exibido no cabeçalho.
 * @param {Node|Node[]} options.content Corpo do modal.
 * @param {Node[]}  [options.actions]   Botões do rodapé. Sem isso, não há rodapé.
 * @param {Function}[options.onClose]   Chamado quando o modal fecha, de qualquer forma.
 * @returns {{ close: Function, element: HTMLDialogElement }}
 */
export function openModal({ title, content, actions = [], onClose }) {
  const body = el('div', { class: 'modal__body' }, content);

  const closeButton = el('button', {
    type: 'button',
    class: 'btn btn--ghost btn--icon',
    'aria-label': 'Fechar',
    html: icon('close', 20),
    onclick: () => close(),
  });

  const header = el('div', { class: 'modal__header' }, [
    el('h2', { class: 'modal__title', text: title }),
    closeButton,
  ]);

  const children = [header, body];
  if (actions.length > 0) {
    children.push(el('div', { class: 'modal__footer' }, actions));
  }

  // aria-label vai via setAttribute — texto cru, sem escape de HTML.
  const dialog = el('dialog', { class: 'modal', 'aria-label': title }, children);

  // Clique no backdrop fecha. O <dialog> ocupa a área toda, então o alvo do
  // clique só é o próprio dialog quando o clique caiu fora do conteúdo.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });

  dialog.addEventListener('close', () => {
    dialog.remove();
    onClose?.();
  });

  document.body.append(dialog);
  dialog.showModal();

  function close() {
    if (dialog.open) dialog.close();
  }

  return { close, element: dialog };
}

/**
 * Modal com formulário — o caso mais comum do sistema.
 * Cuida do estado "salvando", do submit por Enter e da exibição de erro.
 *
 * @param {Function} options.onSubmit  async (dadosDoForm) => void.
 *                                     Se lançar, o modal continua aberto.
 */
export function openFormModal({
  title,
  fields,
  submitLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  onSubmit,
  onClose,
}) {
  const formId = `modal-form-${++modalCounter}`;
  const form = el('form', { class: 'form', id: formId, novalidate: true }, fields);

  // O botão fica no rodapé, fora do <form>. O atributo `form` faz a ligação.
  const submitButton = el('button', {
    type: 'submit',
    class: 'btn btn--primary',
    form: formId,
    text: submitLabel,
  });

  const cancelButton = el('button', {
    type: 'button',
    class: 'btn btn--secondary',
    text: cancelLabel,
    onclick: () => modal.close(),
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    submitButton.disabled = true;
    submitButton.textContent = 'Salvando...';

    try {
      await onSubmit(form);
      modal.close();
    } catch (error) {
      // O chamador já mostrou a mensagem amigável; aqui só devolvemos o botão.
      console.error('[modal] falha ao salvar', error);
      submitButton.disabled = false;
      submitButton.textContent = submitLabel;
    }
  });

  const modal = openModal({
    title,
    content: form,
    actions: [cancelButton, submitButton],
    onClose,
  });

  // Foca o primeiro campo — no celular isso abre o teclado direto.
  form.querySelector('input, select, textarea')?.focus();

  return modal;
}
