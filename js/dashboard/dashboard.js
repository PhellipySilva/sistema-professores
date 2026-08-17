/* Dashboard (spec, seção 23). Indicadores reais, sem gráfico para encher espaço. */

import { handleError, initPage } from '../app.js';
import { listStudents } from '../api/students.js';
import { listAllSchedules, listClasses } from '../api/classes.js';
import { listSessionsBetween } from '../api/sessions.js';
import { listPaymentsSince, upsertPayment } from '../api/payments.js';
import { listOpenMakeups } from '../api/makeups.js';
import { errorState } from '../components/empty-state.js';
import { selectField, showFieldErrors } from '../components/form.js';
import { icon } from '../components/icons.js';
import { showLoading } from '../components/loading.js';
import { openFormModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { $, el, render } from '../utils/dom.js';
import {
  addDays,
  endOfMonth,
  formatDateShortBR,
  formatTimeRange,
  startOfMonth,
  todayISO,
} from '../utils/dates.js';
import { formatCurrency, pluralize } from '../utils/formatters.js';
import {
  dueDateForMonth,
  groupPaymentsByStudent,
  recentReferenceMonths,
  studentFinancialStatus,
} from '../financeiro/financeiro.js';
import { openPaymentModal } from '../financeiro/financeiro-ui.js';
import { mergeOccurrences, plannedOccurrencesForMonth } from '../agenda/ocorrencias.js';

const { user } = await initPage('dashboard');

const content = $('#page-content');
const today = todayISO();

await load();

async function load() {
  showLoading(content, 'Carregando dashboard...');

  try {
    const [students, classes, schedules, sessions, payments, makeups] = await Promise.all([
      listStudents(user.id),
      listClasses(user.id),
      listAllSchedules(user.id),
      listSessionsBetween(user.id, startOfMonth(today), endOfMonth(today)),
      listPaymentsSince(user.id, recentReferenceMonths()[0]),
      listOpenMakeups(user.id),
    ]);

    renderDashboard({ students, classes, schedules, sessions, payments, makeups });
  } catch (error) {
    handleError(error, 'Não foi possível carregar o dashboard.');
    render(content, errorState({ message: 'Não foi possível carregar o dashboard.', onRetry: load }));
  }
}

function renderDashboard({ students, classes, schedules, sessions, payments, makeups }) {
  const paymentsByStudent = groupPaymentsByStudent(payments);

  const overdue = students.filter(
    (student) => studentFinancialStatus(student, paymentsByStudent.get(student.id) ?? []) === 'overdue',
  );

  const todayClasses = occurrencesForToday(schedules, sessions);
  const upcomingDues = computeUpcomingDues(students, paymentsByStudent);

  render(content, [
    statsGrid({ students, classes, todayClasses, overdue }),
    shortcuts(students),
    todaySection(todayClasses),
    overdueSection(overdue, paymentsByStudent),
    upcomingDuesSection(upcomingDues),
    makeupsSection(makeups),
  ]);
}

/* ============================================================
   Indicadores
   ============================================================ */

function statsGrid({ students, classes, todayClasses, overdue }) {
  const stats = [
    { label: 'Alunos', value: students.length },
    { label: 'Turmas', value: classes.length },
    { label: 'Aulas hoje', value: todayClasses.length },
    { label: 'Atrasados', value: overdue.length, danger: overdue.length > 0 },
  ];

  return el('div', { class: 'grid-stats' }, stats.map((stat) =>
    el('div', { class: `stat${stat.danger ? ' stat--danger' : ''}` }, [
      el('p', { class: 'stat__label', text: stat.label }),
      el('p', { class: 'stat__value', text: String(stat.value) }),
    ]),
  ));
}

/* ============================================================
   Atalhos (spec, seção 23)
   ============================================================ */

function shortcuts(students) {
  const items = [
    { label: 'Adicionar aluno', iconName: 'plus', href: '/pages/alunos.html' },
    { label: 'Adicionar turma', iconName: 'plus', href: '/pages/turmas.html' },
    { label: 'Abrir agenda', iconName: 'calendar', href: '/pages/agenda.html' },
    { label: 'Planejar aula', iconName: 'clipboard', href: '/pages/planejamentos.html' },
  ];

  const buttons = items.map((item) =>
    el('a', { class: 'shortcut', href: item.href }, [
      el('span', { class: 'shortcut__icon', html: icon(item.iconName, 18) }),
      el('span', { text: item.label }),
    ]),
  );

  // Registrar pagamento precisa de um aluno escolhido, então abre um seletor.
  buttons.push(
    el('button', {
      type: 'button',
      class: 'shortcut',
      onclick: () => openPaymentPicker(students),
    }, [
      el('span', { class: 'shortcut__icon', html: icon('wallet', 18) }),
      el('span', { text: 'Registrar pagamento' }),
    ]),
  );

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Atalhos' }),
    el('div', { class: 'shortcut-grid' }, buttons),
  ]);
}

/** Escolhe o aluno e emenda direto no formulário de pagamento. */
function openPaymentPicker(students) {
  const withFee = students.filter((student) => student.monthly_fee_cents);

  if (withFee.length === 0) {
    toast.info('Nenhum aluno tem mensalidade configurada ainda.');
    return;
  }

  // Um passo a menos: com um aluno só, vai direto para o formulário.
  if (withFee.length === 1) {
    registerPaymentFor(withFee[0]);
    return;
  }

  openFormModal({
    title: 'Registrar pagamento',
    fields: [
      selectField({
        name: 'student_id',
        label: 'Aluno',
        placeholder: 'Selecione um aluno',
        options: withFee.map((student) => ({
          value: student.id,
          label: `${student.name} · ${formatCurrency(student.monthly_fee_cents)}`,
        })),
      }),
    ],
    submitLabel: 'Continuar',
    onSubmit: async (form) => {
      const studentId = form.elements.student_id.value;

      if (showFieldErrors(form, { student_id: studentId ? null : 'Selecione um aluno.' })) {
        throw new Error('validação');
      }

      const student = withFee.find((candidate) => candidate.id === studentId);
      // O modal atual fecha sozinho após o submit; o de pagamento abre em seguida.
      setTimeout(() => registerPaymentFor(student), 0);
    },
  });
}

function registerPaymentFor(student) {
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
      await load();
    },
  });
}

/* ============================================================
   Aulas de hoje
   ============================================================ */

function occurrencesForToday(schedules, sessions) {
  const planned = plannedOccurrencesForMonth(schedules, today);
  return mergeOccurrences(planned, sessions).filter((occurrence) => occurrence.date === today);
}

function todaySection(occurrences) {
  const body = occurrences.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Nenhuma aula programada para hoje.' })]
    : occurrences.map((occurrence) =>
        el('a', { class: 'list-item', href: `/pages/agenda.html?date=${occurrence.date}` }, [
          el('div', {}, [
            el('p', { class: 'list-item__title', text: occurrence.class_name }),
            el('p', {
              class: 'list-item__meta',
              text: formatTimeRange(occurrence.start_time, occurrence.end_time),
            }),
          ]),
          occurrence.session
            ? el('span', { class: 'badge badge--success', text: 'Chamada iniciada' })
            : el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
        ]),
      );

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Aulas de hoje' }),
    el('div', { class: 'card card--flush' }, body),
  ]);
}

/* ============================================================
   Financeiro
   ============================================================ */

function overdueSection(overdue, paymentsByStudent) {
  if (overdue.length === 0) return null;

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Mensalidades atrasadas' }),
    el('div', { class: 'card card--flush' }, overdue.map((student) =>
      el('a', { class: 'list-item', href: `/pages/aluno.html?id=${student.id}` }, [
        el('div', {}, [
          el('p', { class: 'list-item__title', text: student.name }),
          el('p', {
            class: 'list-item__meta',
            text: `${formatCurrency(student.monthly_fee_cents)} · vence dia ${student.due_day}`,
          }),
        ]),
        el('span', { class: 'badge badge--danger', text: 'Atrasado' }),
      ]),
    )),
  ]);
}

/** Vencimentos dos próximos 10 dias que ainda não foram pagos. */
function computeUpcomingDues(students, paymentsByStudent) {
  const limit = addDays(today, 10);
  const currentMonth = startOfMonth(today);

  return students
    .filter((student) => student.monthly_fee_cents && student.due_day)
    .map((student) => ({ student, dueDate: dueDateForMonth(currentMonth, student.due_day) }))
    .filter(({ student, dueDate }) => {
      if (dueDate < today || dueDate > limit) return false;

      const paid = (paymentsByStudent.get(student.id) ?? []).some(
        (payment) => payment.reference_month === currentMonth && payment.paid_date,
      );
      return !paid;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

function upcomingDuesSection(dues) {
  if (dues.length === 0) return null;

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Próximos vencimentos' }),
    el('div', { class: 'card card--flush' }, dues.map(({ student, dueDate }) =>
      el('a', { class: 'list-item', href: `/pages/aluno.html?id=${student.id}` }, [
        el('div', {}, [
          el('p', { class: 'list-item__title', text: student.name }),
          el('p', {
            class: 'list-item__meta',
            text: `${formatCurrency(student.monthly_fee_cents)} · vence em ${formatDateShortBR(dueDate)}`,
          }),
        ]),
        el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
      ]),
    )),
  ]);
}

/* ============================================================
   Reposições em aberto
   ============================================================ */

function makeupsSection(makeups) {
  if (makeups.length === 0) return null;

  return el('section', { class: 'section' }, [
    el('h2', {
      class: 'section__title',
      text: `Reposições em aberto · ${pluralize('aluno', 'alunos', makeups.length)}`,
    }),
    el('div', { class: 'card card--flush' }, makeups.slice(0, 6).map((makeup) =>
      el('a', { class: 'list-item', href: `/pages/aluno.html?id=${makeup.student_id}` }, [
        el('div', {}, [
          el('p', { class: 'list-item__title', text: makeup.students?.name ?? 'Aluno' }),
          el('p', {
            class: 'list-item__meta',
            text: makeup.makeup_date
              ? `Repõe em ${formatDateShortBR(makeup.makeup_date)}`
              : `Faltou em ${formatDateShortBR(makeup.original_date)} · sem data`,
          }),
        ]),
        el('span', {
          class: `badge badge--${makeup.status === 'scheduled' ? 'info' : 'warning'}`,
          text: makeup.status === 'scheduled' ? 'Agendada' : 'A agendar',
        }),
      ]),
    )),
  ]);
}
