/* Ocorrências de aula: o coração da agenda.
 *
 * `class_schedules` é uma regra infinita ("toda segunda às 17h").
 * `class_sessions` são linhas concretas no banco.
 *
 * Estratégia (ver docs/ARQUITETURA.md, item 9): as ocorrências do mês são
 * CALCULADAS aqui a partir dos horários, e só viram linha no banco quando o
 * professor abre a aula. Assim o banco guarda apenas aula que existiu de
 * verdade, feriado é simplesmente uma aula que ninguém abriu, e mudar o horário
 * da turma não reescreve o passado.
 *
 * Este arquivo é função pura: não conhece Supabase nem DOM.
 */

import { addDays, datesOfMonthByWeekday, endOfMonth, getDayOfWeek, startOfMonth } from '../utils/dates.js';

/**
 * Chave que identifica uma aula. É a mesma da constraint
 * `class_sessions_unique (class_id, session_date, start_time)` — é ela que
 * permite mesclar previsto com real, e faz o upsert ser idempotente.
 */
export function occurrenceKey(classId, date, startTime) {
  return `${classId}|${date}|${startTime.slice(0, 5)}`;
}

/**
 * Todas as ocorrências previstas de um mês, a partir dos horários das turmas.
 *
 * @param {object[]} schedules  linhas de class_schedules, com `classes` embutido
 * @param {string}   monthIso   qualquer data do mês, 'YYYY-MM-DD'
 * @returns {object[]} ordenadas por data e horário
 */
export function plannedOccurrencesForMonth(schedules, monthIso) {
  const occurrences = [];

  for (const schedule of schedules) {
    for (const date of datesOfMonthByWeekday(monthIso, schedule.day_of_week)) {
      occurrences.push({
        key: occurrenceKey(schedule.class_id, date, schedule.start_time),
        class_id: schedule.class_id,
        class_name: schedule.classes?.name ?? 'Turma',
        class_category: schedule.classes?.category ?? null,
        date,
        start_time: schedule.start_time,
        end_time: schedule.end_time,
        session: null, // preenchido pela mesclagem quando já existe no banco
      });
    }
  }

  return sortOccurrences(occurrences);
}

/**
 * Junta o que está previsto com o que já existe no banco.
 *
 * Sessões que não correspondem a nenhum horário atual (porque o horário da
 * turma mudou depois) continuam aparecendo: elas aconteceram de verdade e
 * podem ter chamada registrada.
 */
export function mergeOccurrences(planned, sessions) {
  const byKey = new Map(planned.map((occurrence) => [occurrence.key, { ...occurrence }]));

  for (const session of sessions) {
    const key = occurrenceKey(session.class_id, session.session_date, session.start_time);
    const existing = byKey.get(key);

    if (existing) {
      existing.session = session;
    } else {
      byKey.set(key, {
        key,
        class_id: session.class_id,
        class_name: session.classes?.name ?? 'Turma',
        class_category: session.classes?.category ?? null,
        date: session.session_date,
        start_time: session.start_time,
        end_time: session.end_time,
        session,
      });
    }
  }

  return sortOccurrences([...byKey.values()]).filter(
    (occurrence) => occurrence.session?.status !== 'canceled',
  );
}

/** Agrupa por data: { '2026-08-17': [ocorrência, ...] } */
export function groupByDate(occurrences) {
  const byDate = new Map();

  for (const occurrence of occurrences) {
    if (!byDate.has(occurrence.date)) byDate.set(occurrence.date, []);
    byDate.get(occurrence.date).push(occurrence);
  }
  return byDate;
}

/**
 * As próximas N ocorrências de uma turma a partir de uma data.
 * Usado no detalhe da turma, sem tocar no banco.
 */
export function nextOccurrences(schedules, fromIso, count = 5) {
  if (schedules.length === 0) return [];

  const occurrences = [];
  let date = fromIso;
  let guard = 0;

  // Avança dia a dia. O limite evita laço infinito se algo vier inconsistente.
  while (occurrences.length < count && guard < 400) {
    const dayOfWeek = getDayOfWeek(date);

    for (const schedule of schedules) {
      if (schedule.day_of_week === dayOfWeek) {
        occurrences.push({
          date,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
        });
      }
    }

    date = addDays(date, 1);
    guard += 1;
  }

  return sortOccurrences(occurrences).slice(0, count);
}

/** Dias do mês que têm pelo menos uma aula — usado para marcar o calendário. */
export function datesWithClasses(occurrences) {
  return new Set(occurrences.map((occurrence) => occurrence.date));
}

/** Matriz do calendário: semanas de 7 posições, começando no domingo. */
export function calendarWeeks(monthIso) {
  const first = startOfMonth(monthIso);
  const last = endOfMonth(monthIso);

  const weeks = [];
  let week = new Array(getDayOfWeek(first)).fill(null);
  let date = first;

  while (date <= last) {
    week.push(date);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
    date = addDays(date, 1);
  }

  if (week.length > 0) {
    weeks.push([...week, ...new Array(7 - week.length).fill(null)]);
  }
  return weeks;
}

function sortOccurrences(occurrences) {
  return occurrences.sort(
    (a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time),
  );
}
