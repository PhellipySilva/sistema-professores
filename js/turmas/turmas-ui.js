/* Interface do módulo de turmas. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { checkboxChips, selectField, showFieldErrors, textField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { CATEGORIES, formatCategory, pluralize } from '../utils/formatters.js';
import { addMinutesToTime, formatTime, formatWeekdayList, minutesBetween, weekdayShort } from '../utils/dates.js';
import { validateCategory, validateName } from '../utils/validators.js';
import { buildStudentPicker } from './aluno-picker.js';
import { expandEnrollmentDays, normalizeEnrollmentDays } from './matriculas.js';

const WEEKDAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
  value: day,
  label: weekdayShort(day),
}));

/** 'Segunda e Quarta · 17:00 – 18:00' */
export function scheduleSummary(schedules) {
  if (schedules.length === 0) return 'Sem horário definido';

  const days = formatWeekdayList(schedules.map((schedule) => schedule.day_of_week));
  const first = schedules[0];
  const sameTime = schedules.every((schedule) => schedule.start_time === first.start_time);

  if (sameTime) {
    const duration = minutesBetween(first.start_time, first.end_time);
    return `${days} · ${formatTime(first.start_time)} · ${duration} min`;
  }
  return days;
}

export function classCard(turma, { onEdit, onDelete }) {
  return el('article', { class: 'card' }, [
    el('div', { class: 'card__header' }, [
      el('div', {}, [
        el('a', { class: 'card__title', href: `/pages/turma.html?id=${turma.id}`, text: turma.name }),
        el('p', { class: 'card__meta', text: scheduleSummary(turma.class_schedules) }),
      ]),
      el('span', { class: 'badge badge--neutral', text: formatCategory(turma.category) }),
    ]),
    el('p', {
      class: 'card__meta',
      text: pluralize('aluno matriculado', 'alunos matriculados', turma.student_count),
    }),
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
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      await onSave({
        name,
        category,
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
