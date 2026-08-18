/* Dashboard (spec, seção 23). Indicadores reais, sem gráfico para encher espaço. */

import { handleError, initPage } from '../app.js';
import { listStudents } from '../api/students.js';
import { listAllSchedules, listClasses } from '../api/classes.js';
import { listSessionsBetween } from '../api/sessions.js';
import { listPaymentsSince, upsertPayment } from '../api/payments.js';
import { listOpenMakeups } from '../api/makeups.js';
import { listOpenNotifications } from '../api/waitlist.js';
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
  monthLabel,
  startOfMonth,
  todayISO,
} from '../utils/dates.js';
import { formatCurrency, pluralize } from '../utils/formatters.js';
import {
  dueDateForMonth,
  groupPaymentsByStudent,
  isBillable,
  monthlySummary,
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
    const [students, classes, schedules, sessions, payments, makeups, vacancies] =
      await Promise.all([
        listStudents(user.id),
        listClasses(user.id),
        listAllSchedules(user.id),
        listSessionsBetween(user.id, startOfMonth(today), endOfMonth(today)),
        listPaymentsSince(user.id, recentReferenceMonths()[0]),
        listOpenMakeups(user.id),
        listOpenNotifications(user.id),
      ]);

    renderDashboard({ students, classes, schedules, sessions, payments, makeups, vacancies });
  } catch (error) {
    handleError(error, 'Não foi possível carregar o dashboard.');
    render(content, errorState({ message: 'Não foi possível carregar o dashboard.', onRetry: load }));
  }
}

function renderDashboard({ students, classes, schedules, sessions, payments, makeups, vacancies }) {
  const paymentsByStudent = groupPaymentsByStudent(payments);

  const overdue = students.filter(
    (student) => studentFinancialStatus(student, paymentsByStudent.get(student.id) ?? []) === 'overdue',
  );

  const todayClasses = occurrencesForToday(schedules, sessions);
  const upcomingDues = computeUpcomingDues(students, paymentsByStudent);

  render(content, [
    statsGrid({ students, classes, todayClasses, overdue }),
    financeSection(monthlySummary(students, payments)),
    shortcuts(students),
    vacanciesSection(vacancies),
    todaySection(todayClasses),
    overdueSection(overdue, paymentsByStudent),
    upcomingDuesSection(upcomingDues),
    makeupsSection(makeups),
  ]);
}

/* ============================================================
   Indicadores
   ============================================================ */

/**
 * Card de indicador: ícone discreto à esquerda, rótulo em cinza e o número em
 * destaque. O ícone é enfeite funcional — dá ao olho um ponto de ancoragem para
 * achar o cartão certo sem ler todos os rótulos.
 *
 * @param {object} card  { label, value, iconName, hint, variant, money }
 */
function statCard(card) {
  return el('div', { class: `stat${card.variant ? ` stat--${card.variant}` : ''}` }, [
    el('span', { class: 'stat__icon', html: icon(card.iconName, 18) }),
    el('div', { class: 'stat__body' }, [
      el('p', { class: 'stat__label', text: card.label }),
      el('p', {
        class: `stat__value${card.money ? ' stat__value--money' : ''}`,
        text: String(card.value),
      }),
      card.hint ? el('p', { class: 'stat__hint', text: card.hint }) : null,
    ]),
  ]);
}

function statsGrid({ students, classes, todayClasses, overdue }) {
  const stats = [
    { label: 'Alunos ativos', value: students.length, iconName: 'users' },
    { label: 'Turmas', value: classes.length, iconName: 'layers' },
    { label: 'Aulas hoje', value: todayClasses.length, iconName: 'calendar' },
    {
      label: 'Atrasados',
      value: overdue.length,
      iconName: 'alert',
      variant: overdue.length > 0 ? 'danger' : null,
    },
  ];

  return el('div', { class: 'grid-stats' }, stats.map(statCard));
}

/* ============================================================
   Financeiro do mês
   ============================================================ */

/**
 * Previsto, recebido, a receber e as duas contagens de alunos.
 *
 * Tudo vem de `monthlySummary`, que lê os dados reais — cadastro dos alunos e
 * pagamentos registrados. Não existe número digitado nesta tela: alterar uma
 * mensalidade, dar baixa num pagamento ou marcar alguém como patrocinado muda
 * estes cartões no próximo carregamento, sem nenhum passo extra.
 */
function financeSection(summary) {
  const cards = [
    {
      label: 'Valor previsto',
      value: formatCurrency(summary.expectedCents),
      hint: 'Soma das mensalidades de quem é cobrado',
      iconName: 'wallet',
      // O azul da marca fica no número que resume o mês — e em nenhum outro
      // valor desta grade, senão deixa de destacar coisa alguma.
      variant: 'accent',
      money: true,
    },
    {
      label: 'Valor recebido',
      value: formatCurrency(summary.receivedCents),
      hint: 'Pagamentos com baixa registrada neste mês',
      iconName: 'trendUp',
      variant: 'success',
      money: true,
    },
    {
      label: 'Valor a receber',
      value: formatCurrency(summary.toReceiveCents),
      hint: 'Previsto menos recebido',
      iconName: 'clock',
      variant: summary.toReceiveCents > 0 ? 'warning' : null,
      money: true,
    },
    { label: 'Alunos pagantes', value: String(summary.payingCount), iconName: 'user' },
    {
      label: 'Patrocinados',
      value: String(summary.sponsoredCount),
      hint: 'Atletas sem mensalidade',
      iconName: 'award',
      variant: 'sponsored',
    },
  ];

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: `Financeiro de ${monthLabel(summary.month)}` }),
    el('div', { class: 'grid-stats grid-stats--5' }, cards.map(statCard)),
  ]);
}

/* ============================================================
   Vagas com gente esperando
   ============================================================ */

/** Resumo dos avisos em aberto. O detalhe (e as ações) fica na lista de espera. */
function vacanciesSection(vacancies) {
  if (!vacancies || vacancies.length === 0) return null;

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: `Vagas disponíveis · ${vacancies.length}` }),
    el('div', { class: 'card card--flush' }, vacancies.map((notification) =>
      el('a', {
        class: 'list-item',
        href: `/pages/lista-espera.html?class=${notification.class_id}`,
      }, [
        el('div', {}, [
          el('p', {
            class: 'list-item__title',
            text: notification.classes?.name ?? 'Turma',
          }),
          el('p', {
            class: 'list-item__meta',
            text: notification.student_name
              ? `${notification.student_name} saiu — há gente na lista de espera`
              : 'Há gente na lista de espera para este horário',
          }),
        ]),
        el('span', {
          class: `badge badge--${notification.status === 'new' ? 'danger' : 'warning'}`,
          text: notification.status === 'new' ? 'Nova' : 'Visualizada',
        }),
      ]),
    )),
  ]);
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
    { label: 'Lista de espera', iconName: 'bell', href: '/pages/lista-espera.html' },
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
  // Patrocinado não entra: ele não tem mensalidade a receber baixa.
  const withFee = students.filter(isBillable);

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
    .filter(isBillable)
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
