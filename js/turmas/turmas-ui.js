/* Interface do módulo de turmas. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { checkboxChips, selectField, showFieldErrors, textField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { CATEGORIES, formatCategory } from '../utils/formatters.js';
import { categoryBadge, weekdayBadges } from '../components/badges.js';
import { addMinutesToTime, formatTime, formatWeekdayList, minutesBetween, weekdayShort } from '../utils/dates.js';
import { validateCategory, validateName } from '../utils/validators.js';
import { buildStudentPicker } from './aluno-picker.js';
import { classDaysOf, expandEnrollmentDays, normalizeEnrollmentDays } from './matriculas.js';
import { formatOccupancy, isFull } from '../lista-espera/vagas.js';

const WEEKDAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  value: day,
  label: weekdayShort(day),
}));

/** 'Segunda e Quarta · 17:00 · 60 min' */
export function scheduleSummary(schedules) {
  if (schedules.length === 0) return 'Sem horário definido';

  const days = formatWeekdayList(schedules.map((schedule) => schedule.day_of_week));
  const time = scheduleTime(schedules);
  return time ? `${days} · ${time}` : days;
}

/**
 * Só a parte de horário: '17:00 · 60 min'.
 *
 * Existe separada porque o card da turma mostra os dias como chips coloridos e
 * precisa do resto do texto sem eles. Vazio quando os dias têm horários
 * diferentes — aí não existe "o horário" da turma para exibir em uma linha.
 */
export function scheduleTime(schedules) {
  const first = schedules[0];
  if (!first) return '';

  const sameTime = schedules.every((schedule) => schedule.start_time === first.start_time);
  if (!sameTime) return '';

  return `${formatTime(first.start_time)} · ${minutesBetween(first.start_time, first.end_time)} min`;
}

/**
 * Versão curta da grade, para caber num selo: 'Seg/Qua 18h'.
 *
 * Existe porque a lista de espera mostra VÁRIOS horários lado a lado na mesma
 * linha — com o formato longo ('Segunda e Quarta · 18:00 · 60 min') três
 * interesses não caberiam na tela de um celular. Horários diferentes entre os
 * dias devolvem só os dias: não existe "o horário" para resumir.
 */
export function scheduleShort(schedules) {
  if (!schedules || schedules.length === 0) return '';

  const days = [...new Set(schedules.map((schedule) => schedule.day_of_week))]
    .sort((a, b) => a - b)
    .map((day) => capitalize(weekdayShort(day)))
    .join('/');

  const first = schedules[0];
  const sameTime = schedules.every((schedule) => schedule.start_time === first.start_time);

  return sameTime ? `${days} ${shortTime(first.start_time)}` : days;
}

/* A inicial maiúscula é feita aqui, e não com text-transform no CSS: este texto
   também é GRAVADO (vira o `desired_slot` da lista de espera) e lido em lugares
   sem estilo nenhum. 'ter/qui' salvo no banco seria descuido. */
function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** '18:00:00' → '18h' · '18:30:00' → '18h30' */
function shortTime(time) {
  const [hour, minute] = formatTime(time).split(':');
  return minute === '00' ? `${Number(hour)}h` : `${Number(hour)}h${minute}`;
}

/* ============================================================
   Filtro por dia da semana
   ============================================================ */

/**
 * Barra de chips: 'Todas' mais um chip por dia que TEM turma.
 *
 * Só os dias com turma aparecem — uma barra com sete dias fixos ofereceria
 * filtros que devolvem lista vazia, e o professor de terça e quinta veria cinco
 * botões inúteis. É também o que a funcionalidade pede quanto ao domingo:
 * ele entra quando existir turma nele.
 *
 * O chip carrega um ponto na cor do dia, a mesma dos chips do card, para as
 * duas coisas serem lidas como a mesma linguagem.
 *
 * @param {object}        options
 * @param {number[]}      options.days      dias existentes, em ordem
 * @param {Map<number,number>} options.counts  quantas turmas por dia
 * @param {number|null}   options.selected  dia ativo, ou null para 'Todas'
 * @param {Function}      options.onSelect
 */
export function weekdayFilterBar({ days, counts, selected, onSelect, total }) {
  const chip = ({ day, label, count, ativo }) =>
    el('button', {
      type: 'button',
      class: 'filter-chip',
      'aria-pressed': ativo ? 'true' : 'false',
      onclick: () => onSelect(day),
    }, [
      day === null ? null : el('span', { class: `filter-chip__dot day-${day}` }),
      el('span', { text: label }),
      el('span', { class: 'filter-chip__count', text: String(count) }),
    ]);

  return el('div', {
    class: 'filter-bar',
    role: 'group',
    'aria-label': 'Filtrar turmas por dia da semana',
  }, [
    chip({ day: null, label: 'Todas', count: total, ativo: selected === null }),
    ...days.map((day) =>
      chip({
        day,
        label: weekdayShort(day),
        count: counts.get(day) ?? 0,
        ativo: selected === day,
      }),
    ),
  ]);
}

/**
 * Barra do topo do card: um segmento por dia da turma, cada um na cor do dia.
 *
 * É a solução para a turma de vários dias sem poluir o card — 'Seg • Qua • Sex'
 * vira três faixas de cor, lidas de uma vez, e os chips logo abaixo dizem quais
 * dias são. Turma de um dia só recebe uma faixa inteira, o que dá o mesmo
 * resultado visual de uma borda colorida.
 */
function dayStripe(days) {
  const segments = days.length > 0 ? days : [null];

  return el('div', { class: 'class-card__stripe', 'aria-hidden': 'true' },
    segments.map((day) =>
      el('span', { class: `class-card__segment${day === null ? '' : ` day-${day}`}` }),
    ),
  );
}

/**
 * Card da turma, com a cor do dia como identidade.
 *
 * A cor do CARD (cabeçalho tingido, ícone) é a do primeiro dia; a barra do topo
 * mostra todos. Ver a nota de .class-card em css/components.css — nenhuma cor é
 * escolhida aqui, só a classe do dia.
 */
export function classCard(turma, { onEdit, onDelete }) {
  const schedules = turma.class_schedules ?? [];
  const days = classDaysOf(turma);
  const time = scheduleTime(schedules);
  const primaryDay = days[0];

  return el('article', {
    class: `card class-card${primaryDay === undefined ? '' : ` day-${primaryDay}`}`,
  }, [
    dayStripe(days),
    el('div', { class: 'class-card__head' }, [
      el('div', { class: 'card__header' }, [
        el('div', { class: 'stack-tight' }, [
          el('a', { class: 'card__title', href: `/pages/turma.html?id=${turma.id}`, text: turma.name }),
          // Os dias viram chips coloridos; o horário continua texto. A cor serve
          // para achar a turma de terça no meio da lista sem ler dia por dia.
          schedules.length > 0
            ? el('div', { class: 'row row--wrap' }, [
                weekdayBadges(schedules),
                time ? el('p', { class: 'card__meta', text: time }) : null,
              ])
            : el('p', { class: 'card__meta', text: 'Sem horário definido' }),
        ]),
        categoryBadge(turma.category),
      ]),
    ]),
    el('div', { class: 'class-card__body' }, [
      el('span', { class: 'class-card__icon', html: icon('users', 18) }),
      el('p', { class: 'card__meta', text: formatOccupancy(turma.student_count, turma.capacity) }),
      isFull(turma.capacity, turma.student_count)
        ? el('span', { class: 'badge badge--warning', text: 'Turma cheia' })
        : null,
    ]),
    el('div', { class: 'card__footer' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Editar ${turma.name}`,
        title: 'Editar',
        html: icon('edit', 18),
        onclick: () => onEdit(turma),
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Excluir ${turma.name}`,
        title: 'Excluir',
        html: icon('trash', 18),
        onclick: () => onDelete(turma),
      }),
    ]),
  ]);
}

/* ============================================================
   Modal de turma
   ============================================================ */

/**
 * O formulário pergunta horário de início + duração, porque é assim que o
 * professor pensa. O end_time é calculado na hora de salvar — o banco não
 * guarda duração, justamente para os dois nunca divergirem.
 */
/**
 * @param {object[]} [options.students]     todos os alunos, para o seletor
 * @param {object[]} [options.enrollments]  matrículas atuais, na edição
 *
 * Sem `students`, o seletor não aparece e o modal se comporta como antes —
 * é assim que a página do aluno reaproveita este modal para criar uma turma
 * no meio do cadastro, sem virar duas telas de uma vez.
 */
export function openClassModal({ turma, students, enrollments = [], onSave, onClose }) {
  const isEdit = Boolean(turma);
  const schedules = turma?.class_schedules ?? [];
  const first = schedules[0];
  const initialDays = [...new Set(schedules.map((schedule) => schedule.day_of_week))].sort(
    (a, b) => a - b,
  );

  const daysField = checkboxChips({
    name: 'days',
    label: 'Dias da semana',
    options: WEEKDAY_OPTIONS,
    values: initialDays,
  });

  const fields = [
    textField({
      name: 'name',
      label: 'Nome da turma',
      value: turma?.name ?? '',
      placeholder: 'Ex.: Kids Iniciante',
      required: true,
    }),
    selectField({
      name: 'category',
      label: 'Categoria',
      options: CATEGORIES,
      value: turma?.category ?? 'adulto',
    }),
    daysField,
    textField({
      name: 'start_time',
      label: 'Horário de início',
      type: 'time',
      value: first ? formatTime(first.start_time) : '17:00',
      required: true,
    }),
    textField({
      name: 'duration',
      label: 'Duração (minutos)',
      type: 'number',
      value: first ? minutesBetween(first.start_time, first.end_time) : 60,
      inputmode: 'numeric',
      min: 15,
      max: 300,
      required: true,
    }),
    textField({
      name: 'capacity',
      label: 'Vagas',
      type: 'number',
      value: turma?.capacity ?? '',
      placeholder: '8',
      inputmode: 'numeric',
      min: 1,
      max: 100,
      hint: 'Opcional. Com as vagas definidas, a turma mostra "7/8" e a saída de um aluno vira aviso para a lista de espera.',
    }),
  ];

  let picker = null;

  if (students) {
    picker = buildStudentPicker({ students, classDays: initialDays, enrollments });

    fields.push(
      el('p', { class: 'form__section-title', text: 'Alunos' }),
      el('p', {
        class: 'field__hint',
        text: 'Marcar o aluno já o coloca em todos os dias da turma. Com dois ou mais dias, use os botões ao lado para tirar quem não vai em algum deles.',
      }),
      picker.element,
    );

    // Mexer nos dias da turma precisa refletir nos chips de cada aluno.
    daysField.addEventListener('change', () => {
      picker.setClassDays(readCheckedDays(daysField));
    });
  }

  return openFormModal({
    title: isEdit ? 'Editar turma' : 'Nova turma',
    fields,
    submitLabel: isEdit ? 'Salvar alterações' : 'Criar turma',
    onClose,
    onSubmit: async (form) => {
      const name = (form.elements.name.value ?? '').trim();
      const category = form.elements.category.value;
      const startTime = form.elements.start_time.value;
      const duration = Number(form.elements.duration.value);
      const capacityRaw = (form.elements.capacity.value ?? '').trim();
      const capacity = capacityRaw ? Number(capacityRaw) : null;
      const days = readCheckedDays(form);

      const errors = {
        name: validateName(name),
        category: validateCategory(category),
        days: days.length === 0 ? 'Selecione pelo menos um dia da semana.' : null,
        start_time: startTime ? null : 'Informe o horário de início.',
        duration:
          Number.isInteger(duration) && duration >= 15 && duration <= 300
            ? null
            : 'A duração deve ser entre 15 e 300 minutos.',
        capacity:
          capacity === null || (Number.isInteger(capacity) && capacity >= 1 && capacity <= 100)
            ? null
            : 'As vagas devem ser um número entre 1 e 100.',
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      await onSave({
        name,
        category,
        capacity,
        schedules: days.map((day) => ({
          day_of_week: day,
          start_time: `${startTime}:00`,
          end_time: addMinutesToTime(startTime, duration),
        })),
        enrollments: picker ? picker.read() : undefined,
      });
    },
  });
}

function readCheckedDays(scope) {
  return [...scope.querySelectorAll('input[name="days"]:checked')]
    .map((input) => Number(input.value))
    .sort((a, b) => a - b);
}

/* ============================================================
   Modal de adicionar aluno à turma
   ============================================================ */

/**
 * @param {number[]} [options.classDays]  dias da turma; com 2+ o modal oferece
 *                                        escolher em quais o aluno frequenta
 * @param {Function} options.onSave       async (studentId, daysOfWeek|null)
 */
export function openAddStudentModal({ availableStudents, classDays = [], onSave }) {
  if (availableStudents.length === 0) {
    return openFormModal({
      title: 'Adicionar aluno',
      fields: [
        el('p', {
          class: 'text-muted text-sm',
          text: 'Todos os seus alunos já estão nesta turma.',
        }),
      ],
      submitLabel: 'Fechar',
      cancelLabel: 'Voltar',
      onSubmit: async () => {},
    });
  }

  const fields = [
    selectField({
      name: 'student_id',
      label: 'Aluno',
      placeholder: 'Selecione um aluno',
      options: availableStudents.map((student) => ({
        value: student.id,
        label: `${student.name} · ${formatCategory(student.category)}`,
      })),
    }),
  ];

  const hasMultipleDays = classDays.length > 1;

  if (hasMultipleDays) {
    fields.push(
      checkboxChips({
        name: 'days',
        label: 'Frequenta em',
        options: classDays.map((day) => ({ value: day, label: weekdayShort(day) })),
        values: classDays, // padrão: todos os dias da turma
      }),
    );
  }

  return openFormModal({
    title: 'Adicionar aluno à turma',
    fields,
    submitLabel: 'Adicionar',
    onSubmit: async (form) => {
      const studentId = form.elements.student_id.value;
      const days = hasMultipleDays ? readCheckedDays(form) : [];

      const errors = {
        student_id: studentId ? null : 'Selecione um aluno.',
        days: hasMultipleDays && days.length === 0 ? 'Selecione pelo menos um dia.' : null,
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      await onSave(studentId, normalizeEnrollmentDays(days, classDays));
    },
  });
}

/** Modal curto para trocar os dias de quem já está matriculado. */
export function openEnrollmentDaysModal({ student, classDays, onSave }) {
  const current = expandEnrollmentDays(student.days_of_week, classDays);

  return openFormModal({
    title: `Dias de ${student.name}`,
    fields: [
      checkboxChips({
        name: 'days',
        label: 'Frequenta em',
        options: classDays.map((day) => ({ value: day, label: weekdayShort(day) })),
        values: current,
      }),
    ],
    submitLabel: 'Salvar',
    onSubmit: async (form) => {
      const days = readCheckedDays(form);

      if (showFieldErrors(form, { days: days.length === 0 ? 'Selecione pelo menos um dia.' : null })) {
        throw new Error('validação');
      }
      await onSave(normalizeEnrollmentDays(days, classDays));
    },
  });
}
