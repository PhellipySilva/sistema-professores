/* Listagem de alunos (spec, seções 8 e 9). */

import { handleError, initPage } from '../app.js';
import { deleteStudent, listStudents, updateStudent } from '../api/students.js';
import { listPaymentsSince } from '../api/payments.js';
import { createClass, listClasses, listClassesOfStudent } from '../api/classes.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { toast } from '../components/toast.js';
import {
  groupPaymentsByStudent,
  recentReferenceMonths,
  studentFinancialStatus,
} from '../financeiro/financeiro.js';
import { createStudentWithEnrollment } from './cadastro.js';
import { notifyVacancy } from '../lista-espera/notificacoes.js';
import { $, el, render } from '../utils/dom.js';
import { openStudentModal, searchBar, studentCard } from './alunos-ui.js';

const { user } = await initPage('alunos');

const content = $('#page-content');
const actions = $('#page-actions');

/* Estado da tela. Lista pequena: a busca filtra em memória, sem ida ao servidor
   a cada tecla (spec, seção 42). */
let students = [];
let paymentsByStudent = new Map();
let classes = [];
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
    // Três queries em paralelo, não N+1: alunos, pagamentos e turmas são
    // cruzados em memória. As turmas alimentam o select do cadastro.
    const [studentList, payments, classList] = await Promise.all([
      listStudents(user.id),
      listPaymentsSince(user.id, recentReferenceMonths()[0]),
      listClasses(user.id),
    ]);

    students = studentList;
    paymentsByStudent = groupPaymentsByStudent(payments);
    classes = classList;
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
    classes,
    onCreateClass: async (payload) => {
      try {
        const created = await createClass(user.id, payload);
        classes = [...classes, { ...created, class_schedules: [], student_count: 0 }];
        toast.success('Turma criada.');
        return created;
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível criar a turma. Tente novamente.'));
        throw error;
      }
    },
    onSave: async (payload, extras) => {
      let result;

      try {
        result = await createStudentWithEnrollment(user.id, payload, extras);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível cadastrar o aluno. Tente novamente.'));
        throw error;
      }

      // Matrícula e pagamento inicial são passos extras: quando um deles falha,
      // o cadastro NÃO é desfeito — o aviso aparece e o professor completa pela
      // tela da turma ou do aluno.
      for (const warning of result.warnings) {
        toast.error(handleError(warning.error, warning.message));
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

  // As turmas dele precisam ser lidas ANTES da exclusão: depois, o vínculo já
  // foi embora em cascata e não há mais como saber onde a vaga abriu.
  let classesOfStudent = [];
  try {
    classesOfStudent = await listClassesOfStudent(user.id, student.id);
  } catch (error) {
    handleError(error, 'Não foi possível verificar a lista de espera das turmas do aluno.');
  }

  try {
    await deleteStudent(user.id, student.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível excluir o aluno. Tente novamente.'));
    return;
  }

  toast.success('Aluno excluído.');
  await announceVacancies(classesOfStudent, student.name);
  await loadStudents();
}

/**
 * Avisa a lista de espera das turmas que perderam um aluno.
 *
 * Falha aqui não vira erro na tela: a exclusão já deu certo, e o professor não
 * pode ficar com a impressão de que ela não aconteceu. O detalhe técnico fica
 * no console.
 */
async function announceVacancies(classesOfStudent, studentName) {
  for (const turma of classesOfStudent) {
    try {
      const notification = await notifyVacancy(user.id, { turma, studentName });
      if (notification) {
        toast.info(`Vaga aberta em ${turma.name}: há gente na lista de espera.`);
      }
    } catch (error) {
      handleError(error, 'Não foi possível avisar a lista de espera.');
    }
  }
}
