/* Perfil do aluno (spec, seção 10). */

import { handleError, initPage } from '../app.js';
import { getStudent, updateStudent } from '../api/students.js';
import { listPaymentsForStudent, upsertPayment } from '../api/payments.js';
import { listClassesOfStudent } from '../api/classes.js';
import { listAttendanceForStudent } from '../api/attendance.js';
import { listMakeupsForStudent } from '../api/makeups.js';
import { errorState } from '../components/empty-state.js';
import { showLoading } from '../components/loading.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { openStudentModal, studentSummaryCard } from './alunos-ui.js';
import { openPaymentModal, paymentHistorySection } from '../financeiro/financeiro-ui.js';
import { studentFinancialStatus } from '../financeiro/financeiro.js';
import { attendanceHistorySection, makeupHistorySection } from './aluno-historico.js';
import { $, el, getQueryParam, render } from '../utils/dom.js';
import { formatTimeRange, formatWeekdayList } from '../utils/dates.js';
import { formatCategory } from '../utils/formatters.js';

const { user } = await initPage('aluno');

const studentId = getQueryParam('id');
const content = $('#page-content');
const actions = $('#page-actions');
const titleNode = $('#page-title');

if (!studentId) {
  render(content, errorState({ message: 'Aluno não informado.' }));
} else {
  await loadProfile();
}

async function loadProfile() {
  showLoading(content, 'Carregando aluno...');

  try {
    const student = await getStudent(user.id, studentId);
    const [classes, payments, attendance, makeups] = await Promise.all([
      listClassesOfStudent(user.id, studentId),
      listPaymentsForStudent(user.id, studentId),
      listAttendanceForStudent(user.id, studentId),
      listMakeupsForStudent(user.id, studentId),
    ]);

    renderProfile({ student, classes, payments, attendance, makeups });
  } catch (error) {
    handleError(error, 'Não foi possível carregar o aluno.');
    render(content, errorState({ message: 'Não foi possível carregar o aluno.', onRetry: loadProfile }));
  }
}

function renderProfile({ student, classes, payments, attendance, makeups }) {
  document.title = `${student.name} · Beach Tennis`;
  titleNode.textContent = student.name;

  renderActions(student);

  const status = studentFinancialStatus(student, payments);

  render(content, [
    studentSummaryCard(student, status),
    classesSection(classes),
    attendanceHistorySection(attendance),
    makeupHistorySection(makeups),
    paymentHistorySection(payments, {
      onRegister: () => openRegisterPayment(student),
    }),
  ]);
}

function renderActions(student) {
  render(actions, [
    el('button', {
      type: 'button',
      class: 'btn btn--secondary',
      html: `${icon('wallet', 18)}<span class="btn__label">Pagamento</span>`,
      onclick: () => openRegisterPayment(student),
    }),
    el('button', {
      type: 'button',
      class: 'btn btn--secondary btn--icon',
      'aria-label': 'Editar aluno',
      title: 'Editar aluno',
      html: icon('edit', 18),
      onclick: () => openEdit(student),
    }),
  ]);
}

function classesSection(classes) {
  const body = classes.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Este aluno ainda não está em nenhuma turma.' })]
    : classes.map((turma) => {
        const days = formatWeekdayList(turma.class_schedules.map((s) => s.day_of_week));
        const times = turma.class_schedules[0]
          ? formatTimeRange(turma.class_schedules[0].start_time, turma.class_schedules[0].end_time)
          : '';

        return el('a', { class: 'list-item', href: `/pages/turma.html?id=${turma.id}` }, [
          el('div', {}, [
            el('p', { class: 'list-item__title', text: turma.name }),
            el('p', {
              class: 'list-item__meta',
              text: [formatCategory(turma.category), days, times].filter(Boolean).join(' · '),
            }),
          ]),
          el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
        ]);
      });

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Turmas' }),
    el('div', { class: 'card card--flush' }, body),
  ]);
}

function openEdit(student) {
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
      await loadProfile();
    },
  });
}

function openRegisterPayment(student) {
  openPaymentModal({
    student,
    onSave: async (payload) => {
      try {
        await upsertPayment(user.id, { ...payload, student_id: student.id });
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível registrar o pagamento. Tente novamente.'));
        throw error;
      }
      toast.success('Pagamento registrado.');
      await loadProfile();
    },
  });
}
