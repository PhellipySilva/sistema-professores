/* Listagem de alunos (spec, seções 8 e 9). */

import { handleError, initPage } from '../app.js';
import { createStudent, deleteStudent, listStudents, updateStudent } from '../api/students.js';
import { listPaymentsSince } from '../api/payments.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { groupPaymentsByStudent, recentReferenceMonths, studentFinancialStatus } from '../financeiro/financeiro.js';
import { $, el, render } from '../utils/dom.js';
import { openStudentModal, searchBar, studentCard } from './alunos-ui.js';

const { user } = await initPage('alunos');

const content = $('#page-content');
const actions = $('#page-actions');

/* Estado da tela. Lista pequena: a busca filtra em memória, sem ida ao servidor
   a cada tecla (spec, seção 42). */
let students = [];
let paymentsByStudent = new Map();
let searchTerm = '';

actions.append(
  el('button', {
    type: 'button',
    class: 'btn btn--primary',
    html: `${icon('plus', 18)}<span>Novo aluno</span>`,
    onclick: () => openCreateModal(),
  }),
);

await loadStudents();

/* ============================================================
   Carregamento
   ============================================================ */

async function loadStudents() {
  showSkeletons(content, 4);

  try {
    // Duas queries, não N+1: alunos e pagamentos são cruzados em memória.
    const [studentList, payments] = await Promise.all([
      listStudents(user.id),
      listPaymentsSince(user.id, recentReferenceMonths()[0]),
    ]);

    students = studentList;
    paymentsByStudent = groupPaymentsByStudent(payments);
    renderList();
  } catch (error) {
    handleError(error, 'Não foi possível carregar os alunos.');
    render(
      content,
      errorState({
        message: 'Não foi possível carregar os alunos.',
        onRetry: loadStudents,
      }),
    );
  }
}

/* ============================================================
   Render
   ============================================================ */

function renderList() {
  if (students.length === 0) {
    render(content, [
      emptyState({
        iconName: 'user',
        title: 'Você ainda não possui alunos cadastrados.',
        message: 'Cadastre o primeiro aluno para começar a montar suas turmas.',
        actionLabel: 'Adicionar aluno',
        onAction: () => openCreateModal(),
      }),
    ]);
    return;
  }

  const filtered = filterStudents();

  const children = [
    searchBar({
      value: searchTerm,
      onInput: (value) => {
        searchTerm = value;
        renderResults();
      },
    }),
    el('div', { id: 'students-results' }),
  ];

  render(content, children);
  renderResults(filtered);
}

function renderResults(list = filterStudents()) {
  const container = $('#students-results');
  if (!container) return;

  if (list.length === 0) {
    render(
      container,
      emptyState({
        iconName: 'search',
        title: 'Nenhum aluno encontrado',
        message: `Nada corresponde a "${searchTerm}".`,
      }),
    );
    return;
  }

  const cards = list.map((student) =>
    studentCard(student, statusOf(student), {
      onEdit: openEditModal,
      onDelete: confirmDelete,
    }),
  );

  render(container, [
    el('p', { class: 'section__title', text: `${list.length} aluno${list.length > 1 ? 's' : ''}` }),
    el('div', { class: 'grid-cards' }, cards),
  ]);
}

function filterStudents() {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return students;

  const digits = term.replace(/\D/g, '');

  return students.filter((student) => {
    if (student.name.toLowerCase().includes(term)) return true;
    if (digits && student.phone?.includes(digits)) return true;
    if (student.guardian_name?.toLowerCase().includes(term)) return true;
    return false;
  });
}

function statusOf(student) {
  return studentFinancialStatus(student, paymentsByStudent.get(student.id) ?? []);
}

/* ============================================================
   Ações
   ============================================================ */

function openCreateModal() {
  openStudentModal({
    student: null,
    onSave: async (payload) => {
      try {
        await createStudent(user.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível cadastrar o aluno. Tente novamente.'));
        throw error;
      }
      toast.success('Aluno cadastrado com sucesso.');
      await loadStudents();
    },
  });
}

function openEditModal(student) {
  openStudentModal({
    student,
    onSave: async (payload) => {
      try {
        await updateStudent(user.id, student.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível salvar o aluno. Tente novamente.'));
        throw error;
      }
      toast.success('Aluno atualizado.');
      await loadStudents();
    },
  });
}

async function confirmDelete(student) {
  const confirmed = await confirmDialog({
    title: 'Excluir aluno',
    message:
      `Tem certeza que deseja excluir ${student.name}? ` +
      'Todo o histórico de frequência, reposições e pagamentos deste aluno será apagado junto. ' +
      'Esta ação não pode ser desfeita.',
    confirmLabel: 'Excluir aluno',
  });

  if (!confirmed) return;

  try {
    await deleteStudent(user.id, student.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível excluir o aluno. Tente novamente.'));
    return;
  }

  toast.success('Aluno excluído.');
  await loadStudents();
}
