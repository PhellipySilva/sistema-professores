/* Interface do módulo financeiro: modal de registrar pagamento e histórico. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { openFormModal } from '../components/modal.js';
import { selectField, showFieldErrors, textField } from '../components/form.js';
import { centsToInputValue, formatCurrency, parseCurrencyToCents } from '../utils/formatters.js';
import { addMonths, formatDateBR, monthLabel, startOfMonth, todayISO } from '../utils/dates.js';
import { dueDateForMonth, paymentStatus } from './financeiro.js';

const STATUS_LABELS = { paid: 'Pago', overdue: 'Atrasado', pending: 'A vencer' };
const STATUS_VARIANTS = { paid: 'success', overdue: 'danger', pending: 'neutral' };

export function paymentBadge(payment) {
  const status = paymentStatus(payment);
  return el('span', {
    class: `badge badge--${STATUS_VARIANTS[status]}`,
    text: STATUS_LABELS[status],
  });
}

/* ============================================================
   Histórico de pagamentos no perfil do aluno
   ============================================================ */

export function paymentHistorySection(payments, { onRegister }) {
  const header = el('div', { class: 'row-between section__header' }, [
    el('h2', { class: 'section__title', text: 'Pagamentos' }),
    el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm',
      html: `${icon('plus', 16)}<span>Registrar</span>`,
      onclick: onRegister,
    }),
  ]);

  const body = payments.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Nenhum pagamento registrado.' })]
    : payments.map((payment) =>
        el('div', { class: 'list-item' }, [
          el('div', {}, [
            el('p', { class: 'list-item__title', text: monthLabel(payment.reference_month) }),
            el('p', {
              class: 'list-item__meta',
              text: payment.paid_date
                ? `${formatCurrency(payment.amount_cents)} · pago em ${formatDateBR(payment.paid_date)}`
                : `${formatCurrency(payment.amount_cents)} · vence em ${formatDateBR(payment.due_date)}`,
            }),
          ]),
          paymentBadge(payment),
        ]),
      );

  return el('section', { class: 'section' }, [header, el('div', { class: 'card card--flush' }, body)]);
}

/* ============================================================
   Modal de registrar pagamento (spec, seção 13)
   ============================================================ */

/**
 * @param {object}   options.student  precisa de monthly_fee_cents e due_day
 * @param {Function} options.onSave   async ({ amount_cents, reference_month, due_date, paid_date })
 */
export function openPaymentModal({ student, onSave }) {
  const today = todayISO();
  const currentMonth = startOfMonth(today);
  const defaultDue = student.due_day ? dueDateForMonth(currentMonth, student.due_day) : today;

  // Um <select> em vez de <input type="month">: o Firefox não implementa esse
  // tipo (vira campo de texto livre), e no celular escolher numa lista curta é
  // mais rápido do que abrir o seletor nativo.
  const monthOptions = [];
  for (let offset = 1; offset >= -11; offset--) {
    const month = startOfMonth(addMonths(currentMonth, offset));
    monthOptions.push({ value: month, label: monthLabel(month) });
  }

  const fields = [
    selectField({
      name: 'reference_month',
      label: 'Mês de referência',
      options: monthOptions,
      value: currentMonth,
      hint: 'A qual mensalidade este pagamento se refere.',
    }),
    textField({
      name: 'amount',
      label: 'Valor',
      value: centsToInputValue(student.monthly_fee_cents),
      placeholder: '150,00',
      inputmode: 'decimal',
      required: true,
    }),
    textField({
      name: 'due_date',
      label: 'Vencimento',
      type: 'date',
      value: defaultDue,
      required: true,
    }),
    textField({
      name: 'paid_date',
      label: 'Data do pagamento',
      type: 'date',
      value: today,
      hint: 'Deixe em branco para lançar como ainda não pago.',
    }),
  ];

  return openFormModal({
    title: 'Registrar pagamento',
    fields,
    submitLabel: 'Registrar',
    onSubmit: async (form) => {
      const get = (name) => (form.elements[name]?.value ?? '').trim();

      const monthValue = get('reference_month');
      const amountRaw = get('amount');
      const dueDate = get('due_date');
      const paidDate = get('paid_date');
      const cents = parseCurrencyToCents(amountRaw);

      const errors = {
        reference_month: monthValue ? null : 'Informe o mês de referência.',
        amount: cents && cents > 0 ? null : 'Informe um valor válido.',
        due_date: dueDate ? null : 'Informe o vencimento.',
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      await onSave({
        // O select já entrega 'YYYY-MM-01', que é o que a constraint do banco exige.
        reference_month: monthValue,
        amount_cents: cents,
        due_date: dueDate,
        paid_date: paidDate || null,
      });
    },
  });
}
