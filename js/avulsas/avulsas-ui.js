/* Interface das aulas avulsas: card da aula e o modal de criar/editar.
 *
 * O modal tem uma lista de participantes que cresce e encolhe — nome, valor e
 * pago/não pago por linha. Ela não passa por `showFieldErrors`, que conhece um
 * campo por nome: aqui são N linhas com os mesmos campos, e o erro é um só,
 * embaixo da lista, apontando o primeiro que falta.
 */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { openFormModal } from '../components/modal.js';
import { showFieldErrors, textField } from '../components/form.js';
import { centsToInputValue, formatCurrency, parseCurrencyToCents, pluralize } from '../utils/formatters.js';
import { formatDateShortBR, formatTimeRange, todayISO } from '../utils/dates.js';
import { validateDate } from '../utils/validators.js';
import {
  formatDuration,
  lessonEndTime,
  lessonPaymentStatus,
  lessonTotals,
  participantsOf,
  participantsTotals,
  validateParticipants,
} from './avulsas.js';

/* ============================================================
   Totais (card e topo da tela)
   ============================================================ */

/** "Total · Recebido · A receber" numa linha só, dentro do card. */
export function totalsLine(totals) {
  const item = (label, value, variant) =>
    el('div', { class: `dropin-totals__item${variant ? ` dropin-totals__item--${variant}` : ''}` }, [
      el('span', { class: 'dropin-totals__label', text: label }),
      el('span', { class: 'dropin-totals__value', text: formatCurrency(value) }),
    ]);

  return el('div', { class: 'dropin-totals' }, [
    item('Total', totals.totalCents),
    item('Recebido', totals.receivedCents, 'success'),
    item('A receber', totals.toReceiveCents, totals.toReceiveCents > 0 ? 'warning' : null),
  ]);
}

/* ============================================================
   Card da aula
   ============================================================ */

export function paymentStatusBadge(lesson) {
  return lessonPaymentStatus(lesson) === 'paid'
    ? el('span', { class: 'badge badge--success', text: 'Quitada' })
    : el('span', { class: 'badge badge--warning', text: 'Com pendência' });
}

/**
 * @param {object}   lesson
 * @param {Function} options.onEdit        (lesson) => void
 * @param {Function} options.onDelete      (lesson) => void
 * @param {Function} options.onTogglePaid  (lesson, participant, button) => void
 */
export function lessonCard(lesson, { onEdit, onDelete, onTogglePaid }) {
  const participants = participantsOf(lesson);
  const time = formatTimeRange(lesson.start_time, lessonEndTime(lesson));

  const rows = participants.map((participant) =>
    el('div', { class: 'dropin-participant' }, [
      el('div', { class: 'dropin-participant__info' }, [
        el('p', { class: 'dropin-participant__name', text: participant.name }),
        el('p', { class: 'dropin-participant__amount', text: formatCurrency(participant.amount_cents) }),
      ]),
      // O selo É o botão: um toque troca pago ↔ não pago, que é a ação mais
      // comum da tela — o professor recebe o Pix e marca na hora.
      el('button', {
        type: 'button',
        class: `badge badge--button ${participant.paid ? 'badge--success' : 'badge--warning'}`,
        'aria-pressed': participant.paid ? 'true' : 'false',
        'aria-label': participant.paid
          ? `${participant.name} pagou. Tocar para marcar como não pago`
          : `${participant.name} não pagou. Tocar para marcar como pago`,
        html: participant.paid ? `${icon('check', 14)}<span>Pago</span>` : '<span>Não pago</span>',
        onclick: (event) => onTogglePaid(lesson, participant, event.currentTarget),
      }),
    ]),
  );

  return el('article', { class: 'card dropin-card' }, [
    el('div', { class: 'card__header' }, [
      el('div', { class: 'stack-tight' }, [
        el('p', { class: 'card__title', text: formatDateShortBR(lesson.lesson_date) }),
        el('p', {
          class: 'card__meta',
          text: `${time} · ${formatDuration(lesson.duration_minutes)} · ${pluralize('participante', 'participantes', participants.length)}`,
        }),
      ]),
      paymentStatusBadge(lesson),
    ]),
    el('div', { class: 'dropin-participants' }, rows),
    totalsLine(lessonTotals(lesson)),
    el('div', { class: 'card__footer' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Editar aula de ${formatDateShortBR(lesson.lesson_date)}`,
        title: 'Editar',
        html: icon('edit', 18),
        onclick: () => onEdit(lesson),
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Excluir aula de ${formatDateShortBR(lesson.lesson_date)}`,
        title: 'Excluir',
        html: icon('trash', 18),
        onclick: () => onDelete(lesson),
      }),
    ]),
  ]);
}

/* ============================================================
   Modal de criar / editar
   ============================================================ */

/**
 * @param {object|null} options.lesson  null = nova aula
 * @param {Function}    options.onSave  async ({ lesson_date, start_time,
 *                                       duration_minutes, participants }) => void
 */
export function openLessonModal({ lesson, onSave }) {
  const isEdit = Boolean(lesson);
  const editor = participantsEditor(isEdit ? participantsOf(lesson) : []);

  const fields = [
    textField({
      name: 'lesson_date',
      label: 'Data',
      type: 'date',
      value: lesson?.lesson_date ?? todayISO(),
      required: true,
    }),
    el('div', { class: 'dropin-form__pair' }, [
      textField({
        name: 'start_time',
        label: 'Horário',
        type: 'time',
        value: lesson?.start_time?.slice(0, 5) ?? '',
        required: true,
      }),
      textField({
        name: 'duration',
        label: 'Duração (minutos)',
        type: 'number',
        value: lesson?.duration_minutes ?? 60,
        inputmode: 'numeric',
        min: 15,
        max: 600,
        required: true,
      }),
    ]),
    el('p', { class: 'form__section-title', text: 'Participantes' }),
    editor.element,
  ];

  return openFormModal({
    title: isEdit ? 'Editar aula avulsa' : 'Nova aula avulsa',
    fields,
    submitLabel: isEdit ? 'Salvar alterações' : 'Criar aula',
    onSubmit: async (form) => {
      const lessonDate = form.elements.lesson_date.value;
      const startTime = form.elements.start_time.value;
      const duration = Number(form.elements.duration.value);
      const participants = editor.read();

      const errors = {
        lesson_date: validateDate(lessonDate, 'A data'),
        start_time: startTime ? null : 'Informe o horário.',
        duration:
          Number.isInteger(duration) && duration >= 15 && duration <= 600
            ? null
            : 'A duração deve ser entre 15 e 600 minutos.',
      };

      const fieldsInvalid = showFieldErrors(form, errors);
      const participantsInvalid = editor.showError(validateParticipants(participants));
      if (fieldsInvalid || participantsInvalid) throw new Error('validação');

      await onSave({
        lesson_date: lessonDate,
        start_time: `${startTime}:00`,
        duration_minutes: duration,
        participants: participants.map((participant) => ({
          name: participant.name.trim(),
          amount_cents: participant.amount_cents,
          paid: participant.paid,
        })),
      });
    },
  });
}

/**
 * A lista editável de participantes.
 *
 * Os campos NÃO têm `name`: se tivessem, `form.elements.name` deixaria de ser
 * um campo e viraria uma lista, e os outros formulários deste módulo não
 * precisam saber disso. Cada linha é lida pelo seletor da classe.
 *
 * @returns {{ element: HTMLElement, read: Function, showError: Function }}
 */
function participantsEditor(initial) {
  const list = el('div', { class: 'dropin-editor__list' });
  const summary = el('div', { class: 'dropin-editor__summary' });
  const error = el('p', { class: 'field__error hidden', role: 'alert' });

  const refreshSummary = () => {
    const totals = participantsTotals(read().map((p) => ({ ...p, amount_cents: p.amount_cents ?? 0 })));
    summary.replaceChildren(totalsLine(totals));
  };

  const addRow = (participant = {}) => {
    const nameInput = el('input', {
      class: 'input dropin-editor__name',
      type: 'text',
      placeholder: 'Nome',
      'aria-label': 'Nome do participante',
      autocomplete: 'off',
      value: participant.name ?? '',
    });

    const amountInput = el('input', {
      class: 'input dropin-editor__amount',
      type: 'text',
      inputmode: 'decimal',
      placeholder: '40,00',
      'aria-label': 'Valor cobrado',
      value: participant.amount_cents !== undefined ? centsToInputValue(participant.amount_cents) : '',
    });

    const paidInput = el('input', {
      type: 'checkbox',
      class: 'picker__checkbox dropin-editor__paid',
      checked: participant.paid ? '' : null,
    });

    const row = el('div', { class: 'dropin-editor__row' }, [
      nameInput,
      amountInput,
      el('label', { class: 'dropin-editor__paid-label' }, [paidInput, el('span', { text: 'Pago' })]),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': 'Remover participante',
        title: 'Remover',
        html: icon('trash', 18),
        onclick: () => {
          row.remove();
          refreshSummary();
        },
      }),
    ]);

    for (const input of [nameInput, amountInput, paidInput]) {
      input.addEventListener('input', refreshSummary);
      input.addEventListener('change', refreshSummary);
    }

    list.append(row);
    return nameInput;
  };

  const addButton = el('button', {
    type: 'button',
    class: 'btn btn--secondary btn--sm',
    html: `${icon('plus', 16)}<span>Adicionar participante</span>`,
    onclick: () => {
      addRow().focus();
      refreshSummary();
    },
  });

  function read() {
    return [...list.querySelectorAll('.dropin-editor__row')].map((row) => {
      const amountRaw = row.querySelector('.dropin-editor__amount').value.trim();
      return {
        name: row.querySelector('.dropin-editor__name').value,
        amount_cents: amountRaw === '' ? null : parseCurrencyToCents(amountRaw),
        paid: row.querySelector('.dropin-editor__paid').checked,
      };
    });
  }

  function showError(message) {
    error.textContent = message ?? '';
    error.classList.toggle('hidden', !message);
    return Boolean(message);
  }

  // Aula nova já abre com uma linha: ninguém cria aula sem participante.
  if (initial.length === 0) addRow();
  else initial.forEach((participant) => addRow(participant));
  refreshSummary();

  const element = el('div', { class: 'field dropin-editor' }, [list, addButton, error, summary]);

  return { element, read, showError };
}
