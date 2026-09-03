/* Listagem de turmas (spec, seção 14). */

import { handleError, initPage } from '../app.js';
import { createClass, deleteClass, listClassStudents, listClasses, updateClass } from '../api/classes.js';
import { listStudents } from '../api/students.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { $, el, render } from '../utils/dom.js';
import { classCard, openClassModal, sortClassesByTime, weekdayFilterBar } from './turmas-ui.js';
import { notifyVacancy } from '../lista-espera/notificacoes.js';
import { weekdayName } from '../utils/dates.js';

const { user } = await initPage('turmas');

const content = $('#page-content');

/* A lista de alunos alimenta o seletor de matrícula do modal de turma. */
let allStudents = [];

/* Turmas em memória e o dia escolhido no filtro (null = todas).
   O filtro é só de exibição: nada volta ao servidor quando o professor troca de
   dia — a lista inteira já está aqui, e refiltrar é instantâneo. */
let allClasses = [];
let dayFilter = null;

$('#page-actions').append(
  // A lista de espera é assunto de turma, então a porta de entrada dela fica
  // aqui — a navegação principal continua com os mesmos cinco itens.
  el('a', {
    class: 'btn btn--secondary',
    href: '/pages/lista-espera.html',
    html: `${icon('bell', 18)}<span class="btn__label">Lista de espera</span>`,
  }),
  el('button', {
    type: 'button',
    class: 'btn btn--primary',
    html: `${icon('plus', 18)}<span>Nova turma</span>`,
    onclick: () => openCreate(),
  }),
);

await load();

async function load() {
  showSkeletons(content, 3);

  try {
    const [classes, students] = await Promise.all([listClasses(user.id), listStudents(user.id)]);

    allStudents = students;
    renderClasses(classes);
  } catch (error) {
    handleError(error, 'Não foi possível carregar as turmas.');
    render(content, errorState({ message: 'Não foi possível carregar as turmas.', onRetry: load }));
  }
}

function renderClasses(classes) {
  allClasses = classes;

  if (classes.length === 0) {
    render(
      content,
      emptyState({
        iconName: 'users',
        title: 'Você ainda não possui turmas.',
        message: 'Crie uma turma, defina os dias e horários e matricule seus alunos.',
        actionLabel: 'Criar turma',
        onAction: () => openCreate(),
      }),
    );
    return;
  }

  // Um dia que deixou de existir (a última turma dele foi excluída ou mudou de
  // horário) não pode continuar filtrando: a tela ficaria vazia sem explicação.
  if (dayFilter !== null && !daysInUse().includes(dayFilter)) {
    dayFilter = null;
  }

  // A barra de filtros é montada uma vez; só a lista é redesenhada a cada
  // clique — é o mesmo desenho usado na busca de alunos.
  render(content, [
    filterBar(),
    el('div', { id: 'classes-results' }),
  ]);
  renderResults();
}

/** Dias que têm pelo menos uma turma, em ordem. */
function daysInUse() {
  const days = new Set();
  for (const turma of allClasses) {
    for (const schedule of turma.class_schedules ?? []) days.add(schedule.day_of_week);
  }
  return [...days].sort((a, b) => a - b);
}

function filterBar() {
  const counts = new Map();
  for (const turma of allClasses) {
    for (const day of new Set((turma.class_schedules ?? []).map((s) => s.day_of_week))) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }

  return weekdayFilterBar({
    days: daysInUse(),
    counts,
    total: allClasses.length,
    selected: dayFilter,
    onSelect: (day) => {
      // Clicar no dia já ativo volta para 'Todas' — evita o beco sem saída de
      // ter que procurar o botão certo para desfazer o filtro.
      dayFilter = day === dayFilter ? null : day;
      render(content, [filterBar(), el('div', { id: 'classes-results' })]);
      renderResults();
    },
  });
}

/* A listagem sai SEMPRE em ordem de horário, do mais cedo para o mais tarde —
   com ou sem filtro de dia. É a ordem em que o dia do professor acontece, e a
   única que deixa "o que vem antes" ser lido sem procurar. A consulta continua
   vindo por nome do servidor; ordenar aqui não custa uma ida a mais. */
function filteredClasses() {
  if (dayFilter === null) return sortClassesByTime(allClasses);

  return sortClassesByTime(
    allClasses.filter((turma) =>
      (turma.class_schedules ?? []).some((schedule) => schedule.day_of_week === dayFilter),
    ),
  );
}

function renderResults() {
  const container = $('#classes-results');
  if (!container) return;

  const list = filteredClasses();

  if (list.length === 0) {
    render(
      container,
      emptyState({
        iconName: 'calendar',
        title: 'Nenhuma turma neste dia',
        message: `Você não tem turmas em ${weekdayName(dayFilter).toLowerCase()}.`,
        actionLabel: 'Ver todas as turmas',
        onAction: () => {
          dayFilter = null;
          renderClasses(allClasses);
        },
      }),
    );
    return;
  }

  render(container, [
    el('p', {
      class: 'section__title',
      text: `${list.length} turma${list.length > 1 ? 's' : ''}`,
    }),
    el('div', { class: 'grid-cards' }, list.map((turma) =>
      classCard(turma, { onEdit: openEdit, onDelete: confirmDelete }),
    )),
  ]);
}

function openCreate() {
  openClassModal({
    turma: null,
    students: allStudents,
    onSave: async (payload) => {
      try {
        await createClass(user.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível criar a turma. Tente novamente.'));
        throw error;
      }
      toast.success(
        payload.enrollments?.length > 0
          ? `Turma criada com ${payload.enrollments.length} aluno${payload.enrollments.length === 1 ? '' : 's'}.`
          : 'Turma criada com sucesso.',
      );
      await load();
    },
  });
}

async function openEdit(turma) {
  // As matrículas atuais não vêm na listagem: busca só ao abrir a edição.
  let enrollments = [];

  try {
    const enrolled = await listClassStudents(user.id, turma.id);
    enrollments = enrolled.map((student) => ({
      student_id: student.id,
      days_of_week: student.days_of_week,
    }));
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível carregar os alunos da turma.'));
    return;
  }

  openClassModal({
    turma,
    students: allStudents,
    enrollments,
    onSave: async (payload) => {
      try {
        await updateClass(user.id, turma.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível salvar a turma. Tente novamente.'));
        throw error;
      }
      toast.success('Turma atualizada.');

      // Desmarcar alunos aqui é uma remoção como outra qualquer: se sobrou lugar
      // e tem fila, o aviso precisa sair — senão a vaga só apareceria para quem
      // usasse a tela da turma.
      if (removedSomeone(enrollments, payload.enrollments)) {
        try {
          await notifyVacancy(user.id, { turma });
        } catch (error) {
          handleError(error, 'Não foi possível avisar a lista de espera.');
        }
      }

      await load();
    },
  });
}

/** Alguém que estava matriculado não está mais na lista salva? */
function removedSomeone(before, after) {
  if (!after) return false;

  const kept = new Set(after.map((enrollment) => enrollment.student_id));
  return before.some((enrollment) => !kept.has(enrollment.student_id));
}

async function confirmDelete(turma) {
  const confirmed = await confirmDialog({
    title: 'Excluir turma',
    message:
      `Tem certeza que deseja excluir a turma ${turma.name}? ` +
      'As aulas já realizadas e a frequência registrada nelas serão apagadas. ' +
      'Os alunos continuam cadastrados.',
    confirmLabel: 'Excluir turma',
  });

  if (!confirmed) return;

  try {
    await deleteClass(user.id, turma.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível excluir a turma. Tente novamente.'));
    return;
  }

  toast.success('Turma excluída.');
  await load();
}
