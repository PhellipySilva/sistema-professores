/* Interface do módulo de alunos: monta HTML e lê formulários.
 * Nenhuma chamada ao Supabase acontece aqui. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { checkboxField, selectField, showFieldErrors, textField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { CATEGORIES, centsToInputValue, formatCategory, formatCurrency, formatPhone, normalizePhone, parseCurrencyToCents } from '../utils/formatters.js';
import { financialStatusLabel, selectableReferenceMonths } from '../financeiro/financeiro.js';
import { monthLabel } from '../utils/dates.js';
import { openClassModal } from '../turmas/turmas-ui.js';
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

/* O patrocinado tem cor PRÓPRIA, e não uma das três já existentes, porque a
   pergunta que ele responde é outra: "em dia" e "atrasado" falam de uma dívida
   que existe; "patrocinado" diz que não há dívida nenhuma a acompanhar. */
export function financialBadge(status) {
  const variant = {
    ok: 'success',
    overdue: 'danger',
    none: 'neutral',
    sponsored: 'sponsored',
  }[status] ?? 'neutral';

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

/** Valor especial do select de turma que dispara o modal de criar turma. */
const NEW_CLASS = '__nova__';

/**
 * @param {object|null}  options.student        null = cadastro novo
 * @param {object}       [options.defaults]     { name, phone, classId } para pré-preencher
 *                                              um cadastro novo (vem da lista de espera)
 * @param {object[]}     [options.classes]      turmas existentes, para o select
 * @param {Function}     options.onSave         async (payload, extras) => void
 * @param {Function}     [options.onCreateClass] async (dadosDaTurma) => turma criada
 *
 * `extras` traz { classId, lastPaidMonth } — só preenchidos no cadastro novo.
 * Na edição, turma e pagamento são gerenciados nas telas próprias, para o
 * formulário não virar dois assuntos ao mesmo tempo.
 */
export function openStudentModal({ student, defaults = {}, classes = [], onSave, onCreateClass }) {
  const isEdit = Boolean(student);

  const fields = [
    textField({
      name: 'name',
      label: 'Nome completo',
      value: student?.name ?? defaults.name ?? '',
      placeholder: 'Ex.: João Silva',
      autocomplete: 'name',
      required: true,
    }),
    textField({
      name: 'phone',
      label: 'Telefone',
      type: 'tel',
      value: student?.phone ? formatPhone(student.phone) : (defaults.phone ?? ''),
      placeholder: '(82) 99999-9999',
      inputmode: 'tel',
      autocomplete: 'tel',
    }),
    selectField({
      name: 'category',
      label: 'Categoria',
      options: CATEGORIES,
      value: student?.category ?? 'adulto',
    }),
    textField({
      name: 'guardian_name',
      label: 'Responsável',
      value: student?.guardian_name ?? '',
      placeholder: 'Nome do responsável',
      hint: 'Obrigatório para alunos da categoria Kids.',
    }),
  ];

  const sponsoredField = checkboxField({
    name: 'sponsored',
    label: 'Atleta patrocinado',
    checked: student?.sponsored ?? false,
    hint: 'Atleta bancado pelo projeto: não paga mensalidade, não é cobrado e nunca aparece como atrasado.',
  });

  const feeField = textField({
    name: 'monthly_fee',
    label: 'Mensalidade',
    value: centsToInputValue(student?.monthly_fee_cents),
    placeholder: '150,00',
    inputmode: 'decimal',
    hint: 'Deixe em branco se este aluno não paga mensalidade.',
  });

  const dueDayField = textField({
    name: 'due_day',
    label: 'Dia de vencimento',
    type: 'number',
    value: student?.due_day ?? '',
    placeholder: '10',
    inputmode: 'numeric',
    min: 1,
    max: 31,
    hint: 'Entre 1 e 31. Em meses mais curtos, vence no último dia.',
  });

  fields.push(formSectionTitle('Financeiro'), sponsoredField, feeField, dueDayField);

  let classSelect = null;
  let lastPaymentField = null;

  if (!isEdit) {
    classSelect = buildClassField(classes, onCreateClass, defaults.classId);
    lastPaymentField = buildLastPaymentField();

    fields.push(
      formSectionTitle('Matrícula e situação inicial'),
      classSelect.field,
      lastPaymentField,
    );
  }

  /* Marcar "patrocinado" esconde os campos de cobrança: eles não valem para
     esse aluno. Os VALORES continuam no formulário e continuam sendo salvos —
     é o que faz o cadastro voltar inteiro (mensalidade e vencimento) no dia em
     que o patrocínio terminar, sem o professor ter que digitar tudo de novo. */
  const billingFields = [feeField, dueDayField, lastPaymentField].filter(Boolean);
  const sponsoredInput = sponsoredField.querySelector('input');

  const syncBillingFields = () => {
    for (const field of billingFields) field.classList.toggle('hidden', sponsoredInput.checked);
  };

  sponsoredInput.addEventListener('change', syncBillingFields);
  syncBillingFields();

  return openFormModal({
    title: isEdit ? 'Editar aluno' : 'Novo aluno',
    fields,
    submitLabel: isEdit ? 'Salvar alterações' : 'Cadastrar aluno',
    onSubmit: async (form) => {
      const values = readStudentForm(form);

      // Aluno patrocinado não tem cobrança a validar: os campos estão escondidos,
      // e o que houver neles é histórico guardado, não exigência.
      const errors = {
        name: validateName(values.name),
        phone: validatePhone(values.phoneRaw),
        category: validateCategory(values.category),
        guardian_name: validateGuardianName(values.guardian_name, values.category),
        monthly_fee: values.sponsored ? null : validateMonthlyFee(values.monthlyFeeRaw),
        due_day: values.sponsored ? null : validateDueDay(values.dueDayRaw),
      };

      // O pagamento inicial precisa de valor e vencimento para existir.
      if (!isEdit && values.lastPaidMonth) {
        if (!values.payload.monthly_fee_cents) {
          errors.monthly_fee = 'Informe a mensalidade para registrar um pagamento.';
        }
        if (!values.payload.due_day) {
          errors.due_day = 'Informe o dia de vencimento para registrar um pagamento.';
        }
      }

      if (showFieldErrors(form, errors)) {
        // Lançar mantém o modal aberto e devolve o botão ao estado normal.
        throw new Error('validação');
      }

      await onSave(values.payload, {
        classId: values.classId,
        lastPaidMonth: values.lastPaidMonth,
      });
    },
  });
}

/** Título de seção dentro do formulário, para separar assuntos. */
function formSectionTitle(text) {
  return el('p', { class: 'form__section-title', text });
}

/**
 * Select de turma com a opção de criar uma na hora.
 *
 * Ao escolher "criar nova", abre o modal de turma por cima deste. O <dialog>
 * nativo empilha, então o modal de cima recebe o foco e o de baixo continua
 * intacto com o que já foi digitado.
 */
function buildClassField(classes, onCreateClass, selectedClassId) {
  const options = classes.map((turma) => ({
    value: turma.id,
    label: `${turma.name} · ${formatCategory(turma.category)}`,
  }));

  if (onCreateClass) {
    options.push({ value: NEW_CLASS, label: '+ Criar nova turma...' });
  }

  const field = selectField({
    name: 'class_id',
    label: 'Turma',
    placeholder: 'Sem turma por enquanto',
    options,
    value: selectedClassId ?? '',
    hint: 'Opcional. Você pode matricular depois, na página da turma.',
  });

  const select = field.querySelector('select');
  let previousValue = selectedClassId ?? '';

  select.addEventListener('change', async () => {
    if (select.value !== NEW_CLASS) {
      previousValue = select.value;
      return;
    }

    // Volta ao valor anterior enquanto o modal de turma está aberto, para o
    // campo nunca ficar exibindo "+ Criar nova turma..." como se fosse a escolha.
    select.value = previousValue;

    const created = await promptNewClass(onCreateClass);
    if (!created) return;

    const option = el('option', { value: created.id, text: `${created.name} · ${formatCategory(created.category)}` });
    select.insertBefore(option, select.querySelector(`option[value="${NEW_CLASS}"]`));
    select.value = created.id;
    previousValue = created.id;
  });

  return { field, select };
}

/** Abre o modal de turma e resolve com a turma criada, ou null se cancelou. */
function promptNewClass(onCreateClass) {
  return new Promise((resolve) => {
    let result = null;

    openClassModal({
      turma: null,
      onSave: async (payload) => {
        result = await onCreateClass(payload);
      },
      onClose: () => resolve(result),
    });
  });
}

function buildLastPaymentField() {
  const options = selectableReferenceMonths().map((month) => ({
    value: month,
    label: monthLabel(month),
  }));

  return selectField({
    name: 'last_paid_month',
    label: 'Última mensalidade paga',
    placeholder: 'Nenhuma ainda',
    options,
    hint: 'Define se o aluno começa como Em dia ou Atrasado. A data do pagamento fica no vencimento do mês escolhido — dá para ajustar depois no perfil.',
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

  const sponsored = form.elements.sponsored?.checked ?? false;

  const classId = get('class_id');
  const lastPaidMonth = get('last_paid_month');

  return {
    name,
    phoneRaw,
    category,
    guardian_name,
    monthlyFeeRaw,
    dueDayRaw,
    sponsored,
    classId: classId && classId !== NEW_CLASS ? classId : null,
    // Patrocinado não gera lançamento de mensalidade, mesmo que o campo
    // escondido ainda tenha um mês selecionado.
    lastPaidMonth: sponsored ? null : lastPaidMonth || null,
    payload: {
      name,
      phone: normalizePhone(phoneRaw),
      category,
      guardian_name: guardian_name || null,
      // Mensalidade e vencimento são gravados mesmo com o patrocínio ligado:
      // ficam guardados, ignorados pelo cálculo, prontos para quando ele acabar.
      monthly_fee_cents: monthlyFeeRaw ? parseCurrencyToCents(monthlyFeeRaw) : null,
      due_day: dueDayRaw ? Number(dueDayRaw) : null,
      sponsored,
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
    student.sponsored
      ? infoRow('Mensalidade', 'Atleta patrocinado — sem cobrança')
      : infoRow(
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
