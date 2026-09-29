/* Aulas avulsas — aula fora das turmas, com participantes que não precisam ser
 * alunos cadastrados.
 *
 * ISOLADA DE PROPÓSITO
 *
 *   Nada daqui cria aluno, matrícula, sessão de turma ou pagamento de
 *   mensalidade. As tabelas são próprias (migration 0015), e o único ponto de
 *   contato com o resto do sistema é o financeiro da dashboard, que LÊ estas
 *   aulas e soma os valores pelo mês da data da aula (addDropInToSummary).
 *
 * FILTROS
 *
 *   Mês e situação de pagamento. Os dois são só de exibição: a lista inteira
 *   já está em memória, e refiltrar não volta ao servidor. O resumo do topo
 *   (Total, Recebido, A receber) acompanha o filtro.
 */

import { handleError, initPage } from '../app.js';
import {
  deleteDropInLesson,
  listDropInLessons,
  saveDropInLesson,
  setParticipantPaid,
} from '../api/drop-in-lessons.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { $, el, render } from '../utils/dom.js';
import { formatDateShortBR, monthKey, monthLabel, todayISO } from '../utils/dates.js';
import { formatCurrency } from '../utils/formatters.js';
import { filterLessons, lessonPaymentStatus, lessonsTotals, sortLessons } from './avulsas.js';
import { lessonCard, openLessonModal } from './avulsas-ui.js';

const { user } = await initPage('aulas-avulsas');

const content = $('#page-content');

let lessons = [];

/** 'YYYY-MM' ou null (todos os meses). Começa no mês corrente. */
let monthFilter = monthKey(todayISO());

/** 'paid' | 'pending' | null (todas). */
let statusFilter = null;

$('#page-actions').append(
  el('button', {
    type: 'button',
    class: 'btn btn--primary',
    html: `${icon('plus', 18)}<span>Nova aula</span>`,
    onclick: () => openCreate(),
  }),
);

await load();

async function load() {
  showSkeletons(content, 3);

  try {
    lessons = await listDropInLessons(user.id);
    renderPage();
  } catch (error) {
    const message = handleError(error, 'Não foi possível carregar as aulas avulsas.');
    render(content, errorState({ message, onRetry: load }));
  }
}

/* ============================================================
   Render
   ============================================================ */

function renderPage() {
  if (lessons.length === 0) {
    render(
      content,
      emptyState({
        iconName: 'calendar',
        title: 'Nenhuma aula avulsa registrada.',
        message:
          'Registre aulas fora das turmas — com quem participou, quanto cada um paga e quem já pagou.',
        actionLabel: 'Criar aula avulsa',
        onAction: () => openCreate(),
      }),
    );
    return;
  }

  const inMonth = filterLessons(lessons, { month: monthFilter });
  const visible = sortLessons(filterLessons(inMonth, { status: statusFilter }));

  render(content, [
    el('div', { class: 'row-between row--wrap dropin-toolbar' }, [
      monthSelect(),
      statusFilterBar(inMonth),
    ]),
    summaryGrid(lessonsTotals(visible)),
    resultsSection(visible),
  ]);
}

/**
 * Mês no <select>: os meses que têm aula, mais o corrente, do mais recente
 * para o mais antigo. Um select em vez de <input type="month"> pelo mesmo
 * motivo do modal de pagamento: o Firefox não implementa esse tipo.
 */
function monthSelect() {
  const months = new Set(lessons.map((lesson) => monthKey(lesson.lesson_date)));
  months.add(monthKey(todayISO()));
  if (monthFilter) months.add(monthFilter);

  const options = [
    el('option', { value: '', text: 'Todos os meses', selected: monthFilter === null ? '' : null }),
    ...[...months].sort().reverse().map((month) =>
      el('option', { value: month, text: monthLabel(month), selected: month === monthFilter ? '' : null }),
    ),
  ];

  const select = el('select', {
    class: 'select dropin-toolbar__month',
    'aria-label': 'Filtrar aulas por mês',
    onchange: (event) => {
      monthFilter = event.currentTarget.value || null;
      renderPage();
    },
  }, options);

  return select;
}

function statusFilterBar(inMonth) {
  const paid = inMonth.filter((lesson) => lessonPaymentStatus(lesson) === 'paid').length;

  const chip = (status, label, count) =>
    el('button', {
      type: 'button',
      class: 'filter-chip',
      'aria-pressed': statusFilter === status ? 'true' : 'false',
      onclick: () => {
        // Clicar no chip ativo volta para 'Todas' — mesmo gesto dos outros filtros.
        statusFilter = statusFilter === status ? null : status;
        renderPage();
      },
    }, [
      el('span', { text: label }),
      el('span', { class: 'filter-chip__count', text: String(count) }),
    ]);

  return el('div', {
    class: 'filter-bar',
    role: 'group',
    'aria-label': 'Filtrar aulas por situação de pagamento',
  }, [
    chip(null, 'Todas', inMonth.length),
    chip('pending', 'Com pendência', inMonth.length - paid),
    chip('paid', 'Quitadas', paid),
  ]);
}

/** Mesma linguagem dos cards do financeiro da dashboard: azul, verde, laranja. */
function summaryGrid(totals) {
  const card = ({ label, value, iconName, variant }) =>
    el('div', { class: `stat${variant ? ` stat--${variant} stat--highlight` : ''}` }, [
      el('span', { class: 'stat__icon', html: icon(iconName, 18) }),
      el('div', { class: 'stat__body' }, [
        el('p', { class: 'stat__label', text: label }),
        el('p', { class: 'stat__value stat__value--money', text: formatCurrency(value) }),
      ]),
    ]);

  return el('div', { class: 'grid-stats dropin-stats' }, [
    card({ label: 'Total', value: totals.totalCents, iconName: 'wallet', variant: 'accent' }),
    card({ label: 'Recebido', value: totals.receivedCents, iconName: 'trendUp', variant: 'success' }),
    card({
      label: 'A receber',
      value: totals.toReceiveCents,
      iconName: 'clock',
      variant: totals.toReceiveCents > 0 ? 'warning' : null,
    }),
  ]);
}

function resultsSection(visible) {
  if (visible.length === 0) {
    return el('section', { class: 'section' }, [
      emptyState({
        iconName: 'search',
        title: 'Nenhuma aula neste filtro',
        message: monthFilter
          ? `Nenhuma aula avulsa em ${monthLabel(monthFilter)} com esta situação.`
          : 'Nenhuma aula avulsa com esta situação.',
        actionLabel: 'Criar aula avulsa',
        onAction: () => openCreate(),
      }),
    ]);
  }

  return el('section', { class: 'section' }, [
    el('h2', {
      class: 'section__title',
      text: `${visible.length} aula${visible.length > 1 ? 's' : ''}`,
    }),
    el('div', { class: 'grid-cards' }, visible.map((lesson) =>
      lessonCard(lesson, { onEdit: openEdit, onDelete: confirmDelete, onTogglePaid: togglePaid }),
    )),
  ]);
}

/* ============================================================
   Ações
   ============================================================ */

function openCreate() {
  openLessonModal({
    lesson: null,
    onSave: async (payload) => {
      try {
        await saveDropInLesson(null, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível criar a aula. Tente novamente.'));
        throw error;
      }
      toast.success('Aula avulsa criada.');
      // A aula recém-criada precisa aparecer: o filtro vai para o mês dela.
      monthFilter = monthKey(payload.lesson_date);
      await load();
    },
  });
}

function openEdit(lesson) {
  openLessonModal({
    lesson,
    onSave: async (payload) => {
      try {
        await saveDropInLesson(lesson.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível salvar a aula. Tente novamente.'));
        throw error;
      }
      toast.success('Aula atualizada.');
      if (monthFilter) monthFilter = monthKey(payload.lesson_date);
      await load();
    },
  });
}

async function confirmDelete(lesson) {
  const confirmed = await confirmDialog({
    title: 'Excluir aula avulsa',
    message:
      `Tem certeza que deseja excluir a aula de ${formatDateShortBR(lesson.lesson_date)}? ` +
      'Os participantes e os valores dela deixam de contar no financeiro.',
    confirmLabel: 'Excluir aula',
  });

  if (!confirmed) return;

  try {
    await deleteDropInLesson(user.id, lesson.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível excluir a aula. Tente novamente.'));
    return;
  }

  toast.success('Aula excluída.');
  await load();
}

/**
 * Pago ↔ não pago de um participante.
 *
 * Atualiza a linha no banco e, dando certo, a cópia em memória — sem recarregar
 * a lista inteira: o toque precisa responder na hora, e a tela não pode piscar
 * skeletons a cada Pix recebido.
 */
async function togglePaid(lesson, participant, button) {
  const next = !participant.paid;
  button.disabled = true;

  try {
    await setParticipantPaid(user.id, participant.id, next);
  } catch (error) {
    button.disabled = false;
    toast.error(handleError(error, 'Não foi possível alterar o pagamento. Tente novamente.'));
    return;
  }

  participant.paid = next;
  toast.success(next ? `${participant.name}: pago.` : `${participant.name}: não pago.`);
  renderPage();
}
