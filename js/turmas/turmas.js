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
import { classCard, openClassModal } from './turmas-ui.js';
import { notifyVacancy } from '../lista-espera/notificacoes.js';

const { user } = await initPage('turmas');

const content = $('#page-content');

/* A lista de alunos alimenta o seletor de matrícula do modal de turma. */
let allStudents = [];

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

  render(content, [
    el('div', { class: 'grid-cards' }, classes.map((turma) =>
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
