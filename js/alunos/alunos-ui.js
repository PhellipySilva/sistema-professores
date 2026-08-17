/* Interface do módulo de alunos: monta HTML e lê formulários.
 * Nenhuma chamada ao Supabase acontece aqui. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { selectField, showFieldErrors, textField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { CATEGORIES, centsToInputValue, formatCategory, formatCurrency, formatPhone, normalizePhone, parseCurrencyToCents } from '../utils/formatters.js';
import { financialStatusLabel } from '../financeiro/financeiro.js';
import {
  validateCategory,
  validateDueDay,
  validateGuardianName,
  validateMonthlyFee,
  validateName,
  validatePhone,
} from '../utils/validators.js';

/* ============================================================
   Badge de situação financeira
   ============================================================ */

export function financialBadge(status) {
  const variant = { ok: 'success', overdue: 'danger', none: 'neutral' }[status] ?? 'neutral';
  return el('span', { class: `badge badge--${variant}`, text: financialStatusLabel(status) });
}

/* ============================================================
   Card de aluno na listagem
   ============================================================ */

export function studentCard(student, financialStatus, { onEdit, onDelete }) {
  const meta = [formatCategory(student.category)];
  if (student.phone) meta.push(formatPhone(student.phone));

  const details = [
    el('a', {
      class: 'card__title',
      href: `/pages/aluno.html?id=${student.id}`,
      text: student.name,
    }),
    el('p', { class: 'card__meta', text: meta.join(' · ') }),
  ];

  if (student.guardian_name) {
    details.push(
      el('p', { class: 'card__meta', text: `Responsável: ${student.guardian_name}` }),
    );
  }

  return el('article', { class: 'card' }, [
    el('div', { class: 'card__header' }, [
      el('div', {}, details),
      financialBadge(financialStatus),
    ]),
    el('div', { class: 'card__footer' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Editar ${student.name}`,
        title: 'Editar',
        html: icon('edit', 18),
        onclick: () => onEdit(student),
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Excluir ${student.name}`,
        title: 'Excluir',
        html: icon('trash', 18),
        onclick: () => onDelete(student),
      }),
    ]),
  ]);
}

/* ============================================================
   Barra de busca
   ============================================================ */

export function searchBar({ value = '', onInput }) {
  const input = el('input', {
    class: 'input search__input',
    type: 'search',
    value,
    placeholder: 'Buscar por nome ou telefone...',
    'aria-label': 'Buscar alunos',
    oninput: (event) => onInput(event.target.value),
  });

  return el('div', { class: 'search' }, [
    el('span', { class: 'search__icon', html: icon('search', 18) }),
    input,
  ]);
}

/* ============================================================
   Modal de cadastro / edição
   ============================================================ */

/**
 * @param {object|null} student  null = cadastro novo
 * @param {Function}    onSave   async (dados) => void — lança em caso de erro
 */
export function openStudentModal({ student, onSave }) {
  const isEdit = Boolean(student);

  const categorySelect = selectField({
    name: 'category',
    label: 'Categoria',
    options: CATEGORIES,
    value: student?.category ?? 'adulto',
  });

  const guardianField = textField({
    name: 'guardian_name',
    label: 'Responsável',
    value: student?.guardian_name ?? '',
    placeholder: 'Nome do responsável',
    hint: 'Obrigatório para alunos da categoria Kids.',
  });

  const fields = [
    textField({
      name: 'name',
      label: 'Nome completo',
      value: student?.name ?? '',
      placeholder: 'Ex.: João Silva',
      autocomplete: 'name',
      required: true,
    }),
    textField({
      name: 'phone',
      label: 'Telefone',
      type: 'tel',
      value: student?.phone ? formatPhone(student.phone) : '',
      placeholder: '(82) 99999-9999',
      inputmode: 'tel',
      autocomplete: 'tel',
    }),
    categorySelect,
    guardianField,
    textField({
      name: 'monthly_fee',
      label: 'Mensalidade',
      value: centsToInputValue(student?.monthly_fee_cents),
      placeholder: '150,00',
      inputmode: 'decimal',
      hint: 'Deixe em branco se este aluno não paga mensalidade.',
    }),
    textField({
      name: 'due_day',
      label: 'Dia de vencimento',
      type: 'number',
      value: student?.due_day ?? '',
      placeholder: '10',
      inputmode: 'numeric',
      min: 1,
      max: 31,
      hint: 'Entre 1 e 31. Em meses mais curtos, vence no último dia.',
    }),
  ];

  return openFormModal({
    title: isEdit ? 'Editar aluno' : 'Novo aluno',
    fields,
    submitLabel: isEdit ? 'Salvar alterações' : 'Cadastrar aluno',
    onSubmit: async (form) => {
      const values = readStudentForm(form);

      const errors = {
        name: validateName(values.name),
        phone: validatePhone(values.phoneRaw),
        category: validateCategory(values.category),
        guardian_name: validateGuardianName(values.guardian_name, values.category),
        monthly_fee: validateMonthlyFee(values.monthlyFeeRaw),
        due_day: validateDueDay(values.dueDayRaw),
      };

      if (showFieldErrors(form, errors)) {
        // Lançar mantém o modal aberto e devolve o botão ao estado normal.
        throw new Error('validação');
      }

      await onSave(values.payload);
    },
  });
}

function readStudentForm(form) {
  const get = (name) => (form.elements[name]?.value ?? '').trim();

  const name = get('name');
  const phoneRaw = get('phone');
  const category = get('category');
  const guardian_name = get('guardian_name');
  const monthlyFeeRaw = get('monthly_fee');
  const dueDayRaw = get('due_day');

  return {
    name,
    phoneRaw,
    category,
    guardian_name,
    monthlyFeeRaw,
    dueDayRaw,
    payload: {
      name,
      phone: normalizePhone(phoneRaw),
      category,
      guardian_name: guardian_name || null,
      monthly_fee_cents: monthlyFeeRaw ? parseCurrencyToCents(monthlyFeeRaw) : null,
      due_day: dueDayRaw ? Number(dueDayRaw) : null,
    },
  };
}

/* ============================================================
   Linhas de dados do perfil
   ============================================================ */

export function infoRow(label, value) {
  return el('div', { class: 'info-row' }, [
    el('span', { class: 'info-row__label', text: label }),
    el('span', { class: 'info-row__value', text: value || '—' }),
  ]);
}

export function studentSummaryCard(student, financialStatus) {
  const rows = [
    infoRow('Categoria', formatCategory(student.category)),
    infoRow('Telefone', student.phone ? formatPhone(student.phone) : ''),
  ];

  if (student.category === 'kids' || student.guardian_name) {
    rows.push(infoRow('Responsável', student.guardian_name));
  }

  rows.push(
    infoRow(
      'Mensalidade',
      student.monthly_fee_cents
        ? `${formatCurrency(student.monthly_fee_cents)} · vence dia ${student.due_day ?? '—'}`
        : '',
    ),
  );

  return el('section', { class: 'card' }, [
    el('div', { class: 'card__header' }, [
      el('h2', { class: 'card__title', text: 'Dados do aluno' }),
      financialBadge(financialStatus),
    ]),
    el('div', { class: 'info-list' }, rows),
  ]);
}
