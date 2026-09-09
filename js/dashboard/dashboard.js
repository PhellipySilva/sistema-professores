/* Dashboard (spec, seção 23). Indicadores reais, sem gráfico para encher espaço.
 *
 * A COR AQUI É INFORMAÇÃO
 *
 *   Cada indicador tem um assunto e uma cor fixa: alunos é azul, turmas é verde,
 *   aulas de hoje é roxo, atraso é vermelho, e o mesmo vale no financeiro
 *   (previsto azul, recebido verde, a receber laranja). A cor se repete no
 *   atalho que leva àquele assunto, então o professor aprende a paleta uma vez e
 *   passa a achar o cartão certo sem ler os rótulos.
 *
 *   O vermelho é EXCLUSIVO de atraso. Um zero pintado de vermelho alarmaria
 *   justamente no dia em que está tudo em ordem — por isso o cartão de atrasados
 *   só ganha cor quando existe atraso de verdade.
 */

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
import { categoryBadge } from '../components/badges.js';
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

    /* O dashboard é a tela dos alunos ATIVOS: quem está afastado não conta em
       indicador nenhum, nem no dinheiro. Filtrar aqui, uma vez, mantém as três
       quantias do mês (previsto, recebido, a receber) falando do mesmo grupo —
       somar o recebido de quem saiu da conta do previsto daria um "a receber"
       que não fecha com nada. */
    const activeStudents = students.filter((student) => !student.on_leave);
    const activeIds = new Set(activeStudents.map((student) => student.id));
    const activePayments = payments.filter((payment) => activeIds.has(payment.student_id));

    renderDashboard({
      students: activeStudents,
      classes,
      schedules,
      sessions,
      payments: activePayments,
      makeups,
      vacancies,
    });
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

  scrollToHashSection();
}

/**
 * Rola até a seção pedida no endereço (#financeiro).
 *
 * O navegador tenta isso sozinho ao abrir a página — e não encontra nada, porque
 * a dashboard só existe depois que as consultas respondem. Por isso a tentativa
 * se repete aqui, uma vez, quando o conteúdo já está na tela.
 */
function scrollToHashSection() {
  const id = window.location.hash.slice(1);
  if (!id) return;

  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ============================================================
   Indicadores
   ============================================================ */

/**
 * Card de indicador: ícone colorido à esquerda, rótulo em cinza e o número em
 * destaque. O ícone é enfeite funcional — dá ao olho um ponto de ancoragem para
 * achar o cartão certo sem ler todos os rótulos.
 *
 * `variant` pinta o ícone E a faixa lateral do card; `highlight` estende a cor
 * ao número. Nos quatro indicadores do topo e nos três valores do mês a cor é
 * informação (cada um tem o seu assunto e a sua cor), então todos destacam o
 * número. Ver a nota de .stat em components.css.
 *
 * @param {object} card  { label, value, iconName, hint, variant, highlight, money }
 */
function statCard(card) {
  const classes = ['stat'];
  if (card.variant) classes.push(`stat--${card.variant}`);
  if (card.variant && card.highlight) classes.push('stat--highlight');

  return el('div', { class: classes.join(' ') }, [
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
    {
      label: 'Alunos ativos',
      value: students.length,
      iconName: 'users',
      variant: 'accent',
      highlight: true,
    },
    { label: 'Turmas', value: classes.length, iconName: 'layers', variant: 'success', highlight: true },
    {
      label: 'Aulas hoje',
      value: todayClasses.length,
      iconName: 'calendar',
      variant: 'sponsored',
      highlight: true,
    },
    {
      // Só fica vermelho quando existe atraso: um zero pintado de vermelho
      // alarmaria justamente no dia em que está tudo em ordem.
      label: 'Atrasados',
      value: overdue.length,
      iconName: 'alert',
      variant: overdue.length > 0 ? 'danger' : null,
      highlight: true,
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
      // Os três valores do mês têm a cor no número, porque nesta grade a cor é
      // informação: azul é o previsto, verde é o que entrou, laranja é o que
      // falta. As duas contagens ao lado ficam com o número em preto.
      variant: 'accent',
      highlight: true,
      money: true,
    },
    {
      label: 'Valor recebido',
      value: formatCurrency(summary.receivedCents),
      hint: 'Pagamentos com baixa registrada neste mês',
      iconName: 'trendUp',
      variant: 'success',
      highlight: true,
      money: true,
    },
    {
      label: 'Valor a receber',
      value: formatCurrency(summary.toReceiveCents),
      hint: 'Previsto menos recebido',
      iconName: 'clock',
      variant: summary.toReceiveCents > 0 ? 'warning' : null,
      highlight: true,
      money: true,
    },
    { label: 'Alunos pagantes', value: String(summary.payingCount), iconName: 'user', variant: 'sponsored' },
    {
      label: 'Patrocinados',
      value: String(summary.sponsoredCount),
      hint: 'Atletas sem mensalidade',
      iconName: 'award',
      // Rosa: patrocinado não é sucesso, erro nem alerta, e também não é o roxo
      // dos pagantes ao lado. Cor própria para uma categoria própria.
      variant: 'pink',
    },
  ];

  // O `id` é o destino do aviso de mensalidade agrupado: clicar na notificação
  // de "3 mensalidades atrasadas" abre a dashboard já rolada até aqui, que é a
  // área financeira do professor. Nada mais muda por causa dele.
  return el('section', { class: 'section', id: 'financeiro' }, [
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
        el('div', { class: 'list-item__lead' }, [
          el('span', { class: 'list-item__avatar list-item__avatar--sponsored', html: icon('bell', 18) }),
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
  // A cor de cada atalho é a do assunto para onde ele leva — a mesma que o
  // indicador correspondente usa logo acima, na grade de cards.
  const items = [
    { label: 'Adicionar aluno', iconName: 'plus', href: '/pages/alunos.html' },
    { label: 'Adicionar turma', iconName: 'plus', href: '/pages/turmas.html', variant: 'success' },
    { label: 'Abrir agenda', iconName: 'calendar', href: '/pages/agenda.html', variant: 'sponsored' },
    { label: 'Planejar aula', iconName: 'clipboard', href: '/pages/planejamentos.html', variant: 'warning' },
    { label: 'Lista de espera', iconName: 'bell', href: '/pages/lista-espera.html', variant: 'pink' },
  ];

  const buttons = items.map((item) =>
    el('a', {
      class: `shortcut${item.variant ? ` shortcut--${item.variant}` : ''}`,
      href: item.href,
    }, [
      el('span', { class: 'shortcut__icon', html: icon(item.iconName, 18) }),
      el('span', { text: item.label }),
    ]),
  );

  // Registrar pagamento precisa de um aluno escolhido, então abre um seletor.
  buttons.push(
    el('button', {
      type: 'button',
      class: 'shortcut shortcut--info',
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
    ? [
        el('div', { class: 'list-item__lead' }, [
          el('span', { class: 'list-item__avatar list-item__avatar--accent', html: icon('calendar', 18) }),
          el('p', { class: 'text-muted text-sm', text: 'Nenhuma aula programada para hoje.' }),
        ]),
      ]
    : occurrences.map((occurrence) =>
        el('a', { class: 'list-item', href: `/pages/agenda.html?date=${occurrence.date}` }, [
          el('div', { class: 'stack-tight' }, [
            el('p', { class: 'list-item__title', text: occurrence.class_name }),
            // Horário e categoria lado a lado: a cor da categoria é a mesma da
            // turma na tela de turmas, então a leitura já é familiar.
            el('div', { class: 'row row--wrap' }, [
              el('p', {
                class: 'list-item__meta',
                text: formatTimeRange(occurrence.start_time, occurrence.end_time),
              }),
              occurrence.class_category ? categoryBadge(occurrence.class_category) : null,
            ]),
          ]),
          occurrence.session
            ? el('span', { class: 'badge badge--success', text: 'Chamada iniciada' })
            : el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
        ]),
      );

  // O bloco do dia é o que o professor abre a dashboard para ver: fundo azul
  // claro e faixa lateral o separam das outras listas sem virar um botão.
  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Aulas de hoje' }),
    el('div', { class: 'card card--flush card--today' }, body),
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
        el('div', { class: 'list-item__lead' }, [
          el('span', { class: 'list-item__avatar list-item__avatar--danger', html: icon('user', 18) }),
          el('div', {}, [
            el('p', { class: 'list-item__title', text: student.name }),
            el('p', {
              class: 'list-item__meta',
              text: `${formatCurrency(student.monthly_fee_cents)} · vence dia ${student.due_day}`,
            }),
          ]),
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
        // Azul, e não vermelho: o que ainda vai vencer não é problema nenhum.
        el('div', { class: 'list-item__lead' }, [
          el('span', { class: 'list-item__avatar list-item__avatar--accent', html: icon('clock', 18) }),
          el('div', {}, [
            el('p', { class: 'list-item__title', text: student.name }),
            el('p', {
              class: 'list-item__meta',
              text: `${formatCurrency(student.monthly_fee_cents)} · vence em ${formatDateShortBR(dueDate)}`,
            }),
          ]),
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
        el('div', { class: 'list-item__lead' }, [
          el('span', { class: 'list-item__avatar list-item__avatar--warning', html: icon('clock', 18) }),
          el('div', {}, [
            el('p', { class: 'list-item__title', text: makeup.students?.name ?? 'Aluno' }),
            el('p', {
              class: 'list-item__meta',
              text: makeup.makeup_date
                ? `Repõe em ${formatDateShortBR(makeup.makeup_date)}`
                : `Faltou em ${formatDateShortBR(makeup.original_date)} · sem data`,
            }),
          ]),
        ]),
        el('span', {
          class: `badge badge--${makeup.status === 'scheduled' ? 'info' : 'warning'}`,
          text: makeup.status === 'scheduled' ? 'Agendada' : 'A agendar',
        }),
      ]),
    )),
  ]);
}
