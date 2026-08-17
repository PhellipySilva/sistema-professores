/* Listagem de turmas (spec, seção 14). */

import { handleError, initPage } from '../app.js';
import { createClass, deleteClass, listClasses, updateClass } from '../api/classes.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { $, el, render } from '../utils/dom.js';
import { classCard, openClassModal } from './turmas-ui.js';

const { user } = await initPage('turmas');

const content = $('#page-content');

$('#page-actions').append(
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
    const classes = await listClasses(user.id);
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
    onSave: async (payload) => {
      try {
        await createClass(user.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível criar a turma. Tente novamente.'));
        throw error;
      }
      toast.success('Turma criada com sucesso.');
      await load();
    },
  });
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
