/* Regras das aulas avulsas. Funções puras: sem banco e sem tela.
 *
 * O dinheiro de uma aula avulsa não é gravado em lugar nenhum além do próprio
 * participante (valor + pago). Total, recebido e a receber são SEMPRE somados
 * aqui, na hora — da mesma forma que o financeiro das mensalidades. É por isso
 * que marcar pago, mudar um valor ou excluir a aula nunca duplica nada: não
 * existe cópia para ficar desatualizada.
 */

import { addMinutesToTime, monthKey } from '../utils/dates.js';

/** Participantes de uma aula, sempre como array. */
export function participantsOf(lesson) {
  return lesson?.drop_in_participants ?? [];
}

/**
 * Total, recebido e a receber de uma lista de participantes.
 *
 *   total     — soma de todos os valores
 *   recebido  — soma dos marcados como pagos
 *   a receber — soma dos que ainda não pagaram
 */
export function participantsTotals(participants) {
  let totalCents = 0;
  let receivedCents = 0;

  for (const participant of participants) {
    const amount = participant.amount_cents ?? 0;
    totalCents += amount;
    if (participant.paid) receivedCents += amount;
  }

  return { totalCents, receivedCents, toReceiveCents: totalCents - receivedCents };
}

export function lessonTotals(lesson) {
  return participantsTotals(participantsOf(lesson));
}

/** Soma de várias aulas. */
export function lessonsTotals(lessons) {
  return participantsTotals(lessons.flatMap(participantsOf));
}

/**
 * As aulas de um mês — o mês da DATA DA AULA, não o de quando foi cadastrada
 * nem o de quando foi paga.
 *
 * @param {string} monthIso  qualquer data do mês ('2026-09-01' ou '2026-09-28')
 */
export function lessonsOfMonth(lessons, monthIso) {
  const key = monthKey(monthIso);
  return lessons.filter((lesson) => monthKey(lesson.lesson_date) === key);
}

/** O que as aulas avulsas de um mês somam ao financeiro. */
export function dropInTotalsForMonth(lessons, monthIso) {
  return lessonsTotals(lessonsOfMonth(lessons, monthIso));
}

/**
 * Situação de pagamento da aula inteira.
 *
 * 'paid' quando não resta nada a receber — inclusive a aula cortesia, de valor
 * zero: não há o que cobrar de ninguém ali.
 *
 * @returns {'paid' | 'pending'}
 */
export function lessonPaymentStatus(lesson) {
  return lessonTotals(lesson).toReceiveCents > 0 ? 'pending' : 'paid';
}

/**
 * Filtro da tela.
 *
 * @param {object} filters
 * @param {string|null} filters.month   'YYYY-MM' ou null (todos os meses)
 * @param {string|null} filters.status  'paid' | 'pending' | null (todas)
 */
export function filterLessons(lessons, { month = null, status = null } = {}) {
  return lessons.filter((lesson) => {
    if (month && monthKey(lesson.lesson_date) !== month) return false;
    if (status && lessonPaymentStatus(lesson) !== status) return false;
    return true;
  });
}

/** Mais recente primeiro; no mesmo dia, do horário mais cedo para o mais tarde. */
export function sortLessons(lessons) {
  return [...lessons].sort((a, b) => {
    if (a.lesson_date !== b.lesson_date) return a.lesson_date < b.lesson_date ? 1 : -1;
    return a.start_time < b.start_time ? -1 : a.start_time > b.start_time ? 1 : 0;
  });
}

/** Horário de término, a partir do início e da duração. */
export function lessonEndTime(lesson) {
  return addMinutesToTime(lesson.start_time.slice(0, 5), lesson.duration_minutes);
}

/** 60 → '1h' · 90 → '1h30' · 45 → '45 min' */
export function formatDuration(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`;
}

/**
 * Valida os participantes digitados no formulário.
 *
 * @param {{name: string, amount_cents: number|null}[]} participants
 * @returns {string|null} mensagem de erro ou null
 */
export function validateParticipants(participants) {
  if (participants.length === 0) return 'Adicione pelo menos um participante.';

  for (const participant of participants) {
    if (!participant.name || participant.name.trim().length === 0) {
      return 'Informe o nome de todos os participantes.';
    }
    if (participant.amount_cents === null || participant.amount_cents < 0) {
      return `Informe um valor válido para ${participant.name.trim()}.`;
    }
  }

  return null;
}
