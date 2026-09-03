/* Interface do módulo de alunos: monta HTML e lê formulários.
 * Nenhuma chamada ao Supabase acontece aqui. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { categoryVariant, levelBadge, studentTypeBadge } from '../components/badges.js';
import { checkboxField, selectField, showFieldErrors, textField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { LEVELS, LEVEL_OPTIONS, STUDENT_TYPES, centsToInputValue, formatCategory, formatCurrency, formatPhone, normalizePhone, parseCurrencyToCents } from '../utils/formatters.js';
import { financialStatusLabel, selectableReferenceMonths } from '../financeiro/financeiro.js';
import { monthLabel } from '../utils/dates.js';
import { openClassModal } from '../turmas/turmas-ui.js';
import {
  validateDueDay,
  validateGuardianName,
  validateLevel,
  validateMonthlyFee,
  validateName,
  validatePhone,
  validateStudentType,
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

/**
 * Card do aluno na listagem.
 *
 * O TIPO dá a cor do CARD INTEIRO — verde para Kids, azul para Adulto —, e não
 * só a do selo ao lado do nome. Ver a nota de .student-card em
 * css/components.css: nenhuma cor é escolhida aqui, só a classe do tipo.
 *
 * Ao lado do tipo vem a CATEGORIA (E, D, C, B, A, PRO): são duas perguntas
 * diferentes sobre o mesmo aluno, e desde a migration 0009 elas moram em duas
 * colunas — `student_type` e `category`.
 *
 * O selo da direita continua sendo o da situação financeira, inclusive o roxo
 * de "Patrocinado", que pode aparecer em qualquer categoria.
 */
export function studentCard(student, financialStatus, { onEdit, onDelete, onToggleLeave }) {
  const meta = student.phone ? [formatPhone(student.phone)] : [];

  const details = [
    el('a', {
      class: 'card__title',
      href: `/pages/aluno.html?id=${student.id}`,
      text: student.name,
    }),
    el('div', { class: 'row row--wrap' }, [
      levelBadge(student.category),
      studentTypeBadge(student.student_type),
      meta.length > 0 ? el('p', { class: 'card__meta', text: meta.join(' · ') }) : null,
    ]),
  ];

  if (student.guardian_name) {
    details.push(
      el('p', { class: 'card__meta', text: `Responsável: ${student.guardian_name}` }),
    );
  }

  /* Mover entre "Geral" e "Alunos afastados" é UM toque, no mesmo lugar em que
     já se edita e exclui — sem formulário, sem motivo obrigatório, sem confirmar.
     É o oposto de excluir: nada do cadastro se perde, e o caminho de volta é o
     mesmo botão. */
  const leaveButton = onToggleLeave
    ? el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': student.on_leave
          ? `Trazer ${student.name} de volta às aulas`
          : `Afastar ${student.name} temporariamente`,
        title: student.on_leave ? 'Trazer de volta' : 'Afastar',
        html: icon(student.on_leave ? 'check' : 'clock', 18),
        onclick: () => onToggleLeave(student),
      })
    : null;

  return el('article', {
    class: `card student-card student-card--${categoryVariant(student.student_type)}`,
  }, [
    el('div', { class: 'card__header' }, [
      el('div', { class: 'stack-tight' }, details),
      el('div', { class: 'row row--wrap' }, [
        student.on_leave ? el('span', { class: 'badge badge--warning', text: 'Afastado' }) : null,
        financialBadge(financialStatus),
      ]),
    ]),
    el('div', { class: 'card__footer' }, [
      leaveButton,
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
   Resumo: quantos alunos por categoria e por tipo
   ============================================================ */

/**
 * Conta os alunos por categoria (E…PRO) e por tipo (Kids/Adulto).
 *
 * Função pura, separada do desenho, porque a pergunta é de contagem e não de
 * tela. As seis categorias aparecem SEMPRE, mesmo zeradas: a escala só se lê
 * inteira — "nenhum PRO" é uma resposta, e uma lista que muda de tamanho a cada
 * mês esconderia isso.
 *
 * @param {object[]} students
 * @returns {{total: number, byLevel: {level: string, count: number}[],
 *            byType: {type: string, count: number}[]}}
 */
export function summarizeStudents(students) {
  const levels = new Map(LEVELS.map((level) => [level, 0]));
  const types = new Map([['kids', 0], ['adulto', 0]]);

  for (const student of students) {
    if (levels.has(student.category)) levels.set(student.category, levels.get(student.category) + 1);
    if (types.has(student.student_type)) types.set(student.student_type, types.get(student.student_type) + 1);
  }

  return {
    total: students.length,
    byLevel: [...levels].map(([level, count]) => ({ level, count })),
    byType: [...types].map(([type, count]) => ({ type, count })),
  };
}

/** Selo + número: 'B 4'. O selo dá a cor, o número dá a resposta. */
function countPill(badge, count) {
  return el('span', { class: `count-pill${count === 0 ? ' count-pill--empty' : ''}` }, [
    badge,
    el('span', { class: 'count-pill__value', text: String(count) }),
  ]);
}

/**
 * A dashboard da tela de alunos: um card, duas linhas de contagem.
 *
 * Fica acima da busca porque responde à pergunta que se faz ANTES de procurar
 * alguém — "como está distribuída a minha turma?". Conta o GRUPO exibido
 * (ativos ou afastados) inteiro, sem olhar a busca nem os filtros: é um retrato
 * do grupo, e um retrato que mudasse a cada tecla digitada não seria retrato.
 *
 * @param {object[]} students  o grupo já exibido na tela
 * @param {string}   title     'Alunos ativos' ou 'Alunos afastados'
 */
export function studentsOverview(students, { title }) {
  const summary = summarizeStudents(students);

  const block = (label, pills) =>
    el('div', { class: 'stack-tight' }, [
      el('p', { class: 'overview__label', text: label }),
      el('div', { class: 'row row--wrap' }, pills),
    ]);

  return el('section', { class: 'card overview' }, [
    el('div', { class: 'card__header' }, [
      el('h2', { class: 'card__title', text: title }),
      el('span', { class: 'badge badge--primary', text: String(summary.total) }),
    ]),
    el('div', { class: 'overview__blocks' }, [
      block('Por categoria', summary.byLevel.map(({ level, count }) =>
        countPill(levelBadge(level), count),
      )),
      block('Por tipo de aluno', summary.byType.map(({ type, count }) =>
        countPill(studentTypeBadge(type), count),
      )),
    ]),
  ]);
}

/* ============================================================
   Filtro por categoria e tipo de aluno
   ============================================================ */

/** Nenhum filtro ligado. Estado inicial da tela e resultado de "limpar". */
export const NO_STUDENT_FILTERS = { category: null, student_type: null };

/**
 * O aluno passa pelos filtros ligados?
 *
 * Função pura, e cada filtro é independente do outro: sem valor escolhido, o
 * campo não opina. É o que faz "Categoria B" e "Categoria B + Kids" serem duas
 * perguntas que convivem sem uma anular a outra.
 */
export function matchesStudentFilters(student, filters = NO_STUDENT_FILTERS) {
  if (filters.category && student.category !== filters.category) return false;
  if (filters.student_type && student.student_type !== filters.student_type) return false;
  return true;
}

/** Quantos filtros estão ligados — vira o número no botão "Filtrar". */
export function countStudentFilters(filters = NO_STUDENT_FILTERS) {
  return [filters.category, filters.student_type].filter(Boolean).length;
}

/**
 * Botão "Filtrar", com a contagem do que está ligado.
 *
 * A contagem existe para o filtro nunca ficar invisível: dois toques depois, a
 * lista curta na tela tem uma explicação à vista, em vez de parecer que o
 * sistema perdeu alunos.
 */
export function filterButton({ filters, onClick }) {
  const active = countStudentFilters(filters);

  return el('button', {
    type: 'button',
    class: 'btn btn--secondary',
    'aria-label': 'Filtrar alunos por categoria e tipo',
    html: `${icon('layers', 18)}<span>Filtrar</span>`,
    onclick: onClick,
  }, active > 0 ? [el('span', { class: 'badge badge--primary', text: String(active) })] : []);
}

/**
 * Modal com os dois filtros pedidos.
 *
 * A primeira opção de cada campo é "Todas"/"Todos" e vale string vazia — é
 * assim que se DESLIGA um filtro. Um placeholder desabilitado (o padrão de
 * `selectField`) deixaria o professor sem caminho de volta depois de escolher.
 */
export function openStudentFilterModal({ filters = NO_STUDENT_FILTERS, onApply }) {
  const fields = [
    selectField({
      name: 'category',
      label: 'Categoria',
      options: [{ value: '', label: 'Todas as categorias' }, ...LEVEL_OPTIONS],
      value: filters.category ?? '',
    }),
    selectField({
      name: 'student_type',
      label: 'Tipo de aluno',
      options: [{ value: '', label: 'Todos os tipos' }, ...STUDENT_TYPES],
      value: filters.student_type ?? '',
    }),
  ];

  return openFormModal({
    title: 'Filtrar alunos',
    fields,
    submitLabel: 'Aplicar filtros',
    onSubmit: async (form) => {
      onApply({
        category: form.elements.category.value || null,
        student_type: form.elements.student_type.value || null,
      });
    },
  });
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
    // "Categoria" agora é o NÍVEL; Kids/Adulto desceu para o campo seguinte.
    selectField({
      name: 'category',
      label: 'Categoria',
      placeholder: 'Selecione a categoria',
      options: LEVEL_OPTIONS,
      value: student?.category ?? '',
    }),
    selectField({
      name: 'student_type',
      label: 'Tipo de aluno',
      options: STUDENT_TYPES,
      value: student?.student_type ?? 'adulto',
    }),
    textField({
      name: 'guardian_name',
      label: 'Responsável',
      value: student?.guardian_name ?? '',
      placeholder: 'Nome do responsável',
      hint: 'Obrigatório para alunos do tipo Kids.',
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
        category: validateLevel(values.category),
        student_type: validateStudentType(values.student_type),
        guardian_name: validateGuardianName(values.guardian_name, values.student_type),
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
  const student_type = get('student_type');
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
    student_type,
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
      student_type,
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

/** Mesma linha rótulo/valor, mas com um elemento no lugar do texto. */
export function infoBadgeRow(label, node) {
  return el('div', { class: 'info-row' }, [
    el('span', { class: 'info-row__label', text: label }),
    node,
  ]);
}

export function studentSummaryCard(student, financialStatus) {
  const rows = [
    // "Categoria" na tela, `category` no banco: E, D, C, B, A ou PRO.
    infoBadgeRow('Categoria', levelBadge(student.category) ?? el('span', { text: '—' })),
    infoBadgeRow('Tipo de aluno', studentTypeBadge(student.student_type)),
    infoRow('Telefone', student.phone ? formatPhone(student.phone) : ''),
  ];

  if (student.student_type === 'kids' || student.guardian_name) {
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

  // A mesma cor de tipo da listagem: o aluno que era um card verde na lista não
  // pode virar um card branco ao ser aberto.
  return el('section', {
    class: `card student-card student-card--${categoryVariant(student.student_type)}`,
  }, [
    el('div', { class: 'card__header' }, [
      el('h2', { class: 'card__title', text: 'Dados do aluno' }),
      el('div', { class: 'row row--wrap' }, [
        student.on_leave ? el('span', { class: 'badge badge--warning', text: 'Afastado' }) : null,
        financialBadge(financialStatus),
      ]),
    ]),
    el('div', { class: 'info-list' }, rows),
  ]);
}
