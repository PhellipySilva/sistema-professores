/* Detalhe da turma: horários, alunos matriculados e próximas aulas. */

import { handleError, initPage } from '../app.js';
import {
  addStudentToClass,
  getClass,
  listClassStudents,
  removeStudentFromClass,
  updateClass,
} from '../api/classes.js';
import { listStudents } from '../api/students.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showLoading } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { $, el, getQueryParam, render } from '../utils/dom.js';
import { formatCategory, formatPhone, pluralize } from '../utils/formatters.js';
import { formatDateShortBR, formatTime, formatTimeRange, todayISO, weekdayName } from '../utils/dates.js';
import { openAddStudentModal, openClassModal, scheduleSummary } from './turmas-ui.js';
import { nextOccurrences } from '../agenda/ocorrencias.js';

const { user } = await initPage('turma');

const classId = getQueryParam('id');
const content = $('#page-content');
const titleNode = $('#page-title');

if (!classId) {
  render(content, errorState({ message: 'Turma não informada.' }));
} else {
  await load();
}

async function load() {
  showLoading(content, 'Carregando turma...');

  try {
    const [turma, enrolled, allStudents] = await Promise.all([
      getClass(user.id, classId),
      listClassStudents(user.id, classId),
      listStudents(user.id),
    ]);

    renderClass(turma, enrolled, allStudents);
  } catch (error) {
    handleError(error, 'Não foi possível carregar a turma.');
    render(content, errorState({ message: 'Não foi possível carregar a turma.', onRetry: load }));
  }
}

function renderClass(turma, enrolled, allStudents) {
  document.title = `${turma.name} · Beach Tennis`;
  titleNode.textContent = turma.name;

  render($('#page-actions'), [
    el('button', {
      type: 'button',
      class: 'btn btn--secondary btn--icon',
      'aria-label': 'Editar turma',
      title: 'Editar turma',
      html: icon('edit', 18),
      onclick: () => openEdit(turma),
    }),
  ]);

  render(content, [
    summaryCard(turma),
    studentsSection(turma, enrolled, allStudents),
    upcomingSection(turma),
  ]);
}

function summaryCard(turma) {
  const scheduleRows = turma.class_schedules.map((schedule) =>
    el('div', { class: 'info-row' }, [
      el('span', { class: 'info-row__label', text: weekdayName(schedule.day_of_week) }),
      el('span', {
        class: 'info-row__value',
        text: formatTimeRange(schedule.start_time, schedule.end_time),
      }),
    ]),
  );

  return el('section', { class: 'card' }, [
    el('div', { class: 'card__header' }, [
      el('div', {}, [
        el('h2', { class: 'card__title', text: 'Horários' }),
        el('p', { class: 'card__meta', text: scheduleSummary(turma.class_schedules) }),
      ]),
      el('span', { class: 'badge badge--neutral', text: formatCategory(turma.category) }),
    ]),
    el('div', { class: 'info-list' }, scheduleRows.length > 0
      ? scheduleRows
      : [el('p', { class: 'text-muted text-sm', text: 'Sem horário definido.' })]),
  ]);
}

function studentsSection(turma, enrolled, allStudents) {
  const enrolledIds = new Set(enrolled.map((student) => student.id));
  const available = allStudents.filter((student) => !enrolledIds.has(student.id));

  const header = el('div', { class: 'row-between section__header' }, [
    el('h2', {
      class: 'section__title',
      text: `Alunos · ${pluralize('matriculado', 'matriculados', enrolled.length)}`,
    }),
    el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm',
      html: `${icon('plus', 16)}<span>Adicionar</span>`,
      onclick: () => openAddStudent(turma, available),
    }),
  ]);

  const body = enrolled.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Nenhum aluno matriculado nesta turma.' })]
    : enrolled.map((student) =>
        el('div', { class: 'list-item' }, [
          el('div', {}, [
            el('a', {
              class: 'list-item__title',
              href: `/pages/aluno.html?id=${student.id}`,
              text: student.name,
            }),
            el('p', {
              class: 'list-item__meta',
              text: [formatCategory(student.category), student.phone ? formatPhone(student.phone) : null]
                .filter(Boolean)
                .join(' · '),
            }),
          ]),
          el('button', {
            type: 'button',
            class: 'btn btn--ghost btn--icon',
            'aria-label': `Remover ${student.name} da turma`,
            title: 'Remover da turma',
            html: icon('close', 18),
            onclick: () => confirmRemove(turma, student),
          }),
        ]),
      );

  return el('section', { class: 'section' }, [header, el('div', { class: 'card card--flush' }, body)]);
}

/** Próximas aulas calculadas a partir dos horários — nada é gravado aqui. */
function upcomingSection(turma) {
  const occurrences = nextOccurrences(turma.class_schedules, todayISO(), 5);

  const body = occurrences.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Defina um horário para ver as próximas aulas.' })]
    : occurrences.map((occurrence) =>
        el('a', { class: 'list-item', href: `/pages/agenda.html?date=${occurrence.date}` }, [
          el('div', {}, [
            el('p', { class: 'list-item__title', text: formatDateShortBR(occurrence.date) }),
            el('p', { class: 'list-item__meta', text: formatTime(occurrence.start_time) }),
          ]),
          el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
        ]),
      );

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Próximas aulas' }),
    el('div', { class: 'card card--flush' }, body),
  ]);
}

function openEdit(turma) {
  openClassModal({
    turma,
    onSave: async (payload) => {
      try {
        await updateClass(user.id, turma.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível salvar a turma. Tente novamente.'));
        throw error;
      }
      toast.success('Turma atualizada.');
      await load();
    },
  });
}

function openAddStudent(turma, available) {
  openAddStudentModal({
    availableStudents: available,
    onSave: async (studentId) => {
      try {
        await addStudentToClass(user.id, turma.id, studentId);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível adicionar o aluno. Tente novamente.'));
        throw error;
      }
      toast.success('Aluno adicionado à turma.');
      await load();
    },
  });
}

async function confirmRemove(turma, student) {
  const confirmed = await confirmDialog({
    title: 'Remover da turma',
    message:
      `Remover ${student.name} da turma ${turma.name}? ` +
      'O histórico de frequência dele nesta turma é preservado.',
    confirmLabel: 'Remover',
  });

  if (!confirmed) return;

  try {
    await removeStudentFromClass(user.id, turma.id, student.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível remover o aluno. Tente novamente.'));
    return;
  }

  toast.success('Aluno removido da turma.');
  await load();
}
