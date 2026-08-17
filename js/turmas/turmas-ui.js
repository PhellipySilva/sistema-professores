/* Interface do módulo de turmas. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { checkboxChips, selectField, showFieldErrors, textField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { CATEGORIES, formatCategory, pluralize } from '../utils/formatters.js';
import { addMinutesToTime, formatTime, formatWeekdayList, minutesBetween, weekdayShort } from '../utils/dates.js';
import { validateCategory, validateName } from '../utils/validators.js';

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
export function openClassModal({ turma, onSave }) {
  const isEdit = Boolean(turma);
  const schedules = turma?.class_schedules ?? [];
  const first = schedules[0];

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
    checkboxChips({
      name: 'days',
      label: 'Dias da semana',
      options: WEEKDAY_OPTIONS,
      values: schedules.map((schedule) => schedule.day_of_week),
    }),
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

  return openFormModal({
    title: isEdit ? 'Editar turma' : 'Nova turma',
    fields,
    submitLabel: isEdit ? 'Salvar alterações' : 'Criar turma',
    onSubmit: async (form) => {
      const name = (form.elements.name.value ?? '').trim();
      const category = form.elements.category.value;
      const startTime = form.elements.start_time.value;
      const duration = Number(form.elements.duration.value);

      const days = [...form.querySelectorAll('input[name="days"]:checked')].map((input) =>
        Number(input.value),
      );

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
      });
    },
  });
}

/* ============================================================
   Modal de adicionar aluno à turma
   ============================================================ */

export function openAddStudentModal({ availableStudents, onSave }) {
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

  return openFormModal({
    title: 'Adicionar aluno à turma',
    fields,
    submitLabel: 'Adicionar',
    onSubmit: async (form) => {
      const studentId = form.elements.student_id.value;

      if (showFieldErrors(form, { student_id: studentId ? null : 'Selecione um aluno.' })) {
        throw new Error('validação');
      }
      await onSave(studentId);
    },
  });
}
