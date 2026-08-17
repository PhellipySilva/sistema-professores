/* Agenda: calendário mensal e aulas do dia (spec, seção 17). */

import { handleError, initPage } from '../app.js';
import { listAllSchedules } from '../api/classes.js';
import { ensureSession, listSessionsBetween } from '../api/sessions.js';
import { errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showLoading } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { $, el, getQueryParam, render } from '../utils/dom.js';
import {
  addMonths,
  endOfMonth,
  formatDateLongBR,
  formatTimeRange,
  isToday,
  monthLabel,
  startOfMonth,
  todayISO,
  weekdayShort,
} from '../utils/dates.js';
import { formatCategory } from '../utils/formatters.js';
import {
  calendarWeeks,
  datesWithClasses,
  groupByDate,
  mergeOccurrences,
  plannedOccurrencesForMonth,
} from './ocorrencias.js';

const { user } = await initPage('agenda');

const content = $('#page-content');

let selectedDate = getQueryParam('date') ?? todayISO();
let currentMonth = startOfMonth(selectedDate);
let schedules = [];
let occurrencesByDate = new Map();
let markedDates = new Set();

await loadMonth();

/* ============================================================
   Carregamento
   ============================================================ */

async function loadMonth() {
  showLoading(content, 'Carregando agenda...');

  try {
    // Os horários mudam pouco: busca uma vez e reaproveita ao trocar de mês.
    if (schedules.length === 0) {
      schedules = await listAllSchedules(user.id);
    }

    const sessions = await listSessionsBetween(
      user.id,
      startOfMonth(currentMonth),
      endOfMonth(currentMonth),
    );

    const planned = plannedOccurrencesForMonth(schedules, currentMonth);
    const merged = mergeOccurrences(planned, sessions);

    occurrencesByDate = groupByDate(merged);
    markedDates = datesWithClasses(merged);

    renderAgenda();
  } catch (error) {
    handleError(error, 'Não foi possível carregar a agenda.');
    render(content, errorState({ message: 'Não foi possível carregar a agenda.', onRetry: loadMonth }));
  }
}

/* ============================================================
   Render
   ============================================================ */

function renderAgenda() {
  render(content, [calendarCard(), dayCard()]);
}

function calendarCard() {
  const header = el('div', { class: 'calendar__header' }, [
    el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--icon',
      'aria-label': 'Mês anterior',
      html: icon('chevronLeft', 20),
      onclick: () => changeMonth(-1),
    }),
    el('p', { class: 'calendar__title', text: monthLabel(currentMonth) }),
    el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--icon',
      'aria-label': 'Próximo mês',
      html: icon('chevronRight', 20),
      onclick: () => changeMonth(1),
    }),
  ]);

  const weekdayRow = el(
    'div',
    { class: 'calendar__weekdays', 'aria-hidden': 'true' },
    [0, 1, 2, 3, 4, 5, 6].map((day) => el('span', { text: weekdayShort(day) })),
  );

  const cells = [];
  for (const week of calendarWeeks(currentMonth)) {
    for (const date of week) {
      if (!date) {
        cells.push(el('span', { class: 'calendar__cell calendar__cell--empty' }));
        continue;
      }

      const classes = ['calendar__cell'];
      if (date === selectedDate) classes.push('calendar__cell--selected');
      if (isToday(date)) classes.push('calendar__cell--today');
      if (markedDates.has(date)) classes.push('calendar__cell--has-class');

      cells.push(
        el('button', {
          type: 'button',
          class: classes.join(' '),
          'aria-label': formatDateLongBR(date),
          'aria-pressed': date === selectedDate ? 'true' : 'false',
          text: String(Number(date.slice(8, 10))),
          onclick: () => selectDate(date),
        }),
      );
    }
  }

  return el('section', { class: 'card calendar' }, [
    header,
    weekdayRow,
    el('div', { class: 'calendar__grid' }, cells),
  ]);
}

function dayCard() {
  const occurrences = occurrencesByDate.get(selectedDate) ?? [];

  const body = occurrences.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Nenhuma aula neste dia.' })]
    : occurrences.map(occurrenceRow);

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: formatDateLongBR(selectedDate) }),
    el('div', { class: 'card card--flush' }, body),
  ]);
}

function occurrenceRow(occurrence) {
  const isMaterialized = Boolean(occurrence.session);

  return el('button', {
    type: 'button',
    class: 'list-item list-item--button',
    onclick: () => openSession(occurrence),
  }, [
    el('div', {}, [
      el('p', { class: 'list-item__title', text: occurrence.class_name }),
      el('p', {
        class: 'list-item__meta',
        text: [
          formatTimeRange(occurrence.start_time, occurrence.end_time),
          occurrence.class_category ? formatCategory(occurrence.class_category) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }),
    ]),
    el('div', { class: 'row' }, [
      isMaterialized
        ? el('span', { class: 'badge badge--success', text: 'Chamada iniciada' })
        : el('span', { class: 'badge badge--neutral', text: 'Prevista' }),
      el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
    ]),
  ]);
}

/* ============================================================
   Ações
   ============================================================ */

function changeMonth(delta) {
  currentMonth = startOfMonth(addMonths(currentMonth, delta));

  // Voltando ao mês corrente, seleciona hoje — é o dia que o professor quer ver.
  // Nos outros meses, o dia 1, para a lista abaixo do calendário fazer sentido.
  selectedDate = currentMonth === startOfMonth(todayISO()) ? todayISO() : currentMonth;
  loadMonth();
}

function selectDate(date) {
  selectedDate = date;
  renderAgenda();
}

/**
 * Materialização preguiçosa: a aula só vira linha no banco quando o professor
 * a abre. `ensureSession` é um upsert, então tocar duas vezes devolve a mesma
 * sessão em vez de duplicar.
 */
async function openSession(occurrence) {
  if (occurrence.session) {
    window.location.href = `/pages/aula.html?id=${occurrence.session.id}`;
    return;
  }

  try {
    const session = await ensureSession(user.id, {
      class_id: occurrence.class_id,
      session_date: occurrence.date,
      start_time: occurrence.start_time,
      end_time: occurrence.end_time,
    });
    window.location.href = `/pages/aula.html?id=${session.id}`;
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível abrir a aula. Tente novamente.'));
  }
}
