/* Regras de matrícula por dia da semana.
 *
 * Uma turma de segunda e quinta pode ter alunos que só vão na segunda.
 * A convenção do projeto inteiro:
 *
 *     days_of_week = null   → vai em TODOS os dias da turma
 *     days_of_week = [1, 4] → só segunda e quinta
 *
 * `null` não é "nenhum dia": é a ausência de restrição. Guardar null no caso
 * comum mantém a matrícula correta mesmo quando a turma ganha um dia novo —
 * quem não tem restrição passa a frequentar o dia novo automaticamente.
 *
 * Arquivo de funções puras: não conhece Supabase nem DOM.
 */

import { formatWeekdayList } from '../utils/dates.js';

/** O aluno frequenta esta turma no dia informado? */
export function attendsDay(enrollment, dayOfWeek) {
  const days = enrollment?.days_of_week;
  if (!days || days.length === 0) return true; // sem restrição
  return days.includes(dayOfWeek);
}

/** Filtra a lista de matriculados pelos que vão no dia informado. */
export function studentsForDay(enrollments, dayOfWeek) {
  return enrollments.filter((enrollment) => attendsDay(enrollment, dayOfWeek));
}

/**
 * Converte a escolha da interface no valor que vai para o banco.
 *
 * Se o aluno foi marcado em todos os dias da turma, grava null: assim ele
 * continua incluído se a turma ganhar mais um dia depois.
 *
 * @param {number[]} selectedDays  dias marcados para este aluno
 * @param {number[]} classDays     dias que a turma tem
 * @returns {number[]|null}
 */
export function normalizeEnrollmentDays(selectedDays, classDays) {
  const classDaySet = new Set(classDays);
  const valid = [...new Set(selectedDays)].filter((day) => classDaySet.has(day)).sort((a, b) => a - b);

  if (valid.length === 0) return null;
  if (valid.length === classDays.length) return null; // vai em tudo

  return valid;
}

/**
 * Os dias que a interface deve mostrar marcados para um aluno.
 * O inverso de normalizeEnrollmentDays.
 */
export function expandEnrollmentDays(daysOfWeek, classDays) {
  if (!daysOfWeek || daysOfWeek.length === 0) return [...classDays];

  const chosen = new Set(daysOfWeek);
  return classDays.filter((day) => chosen.has(day));
}

/**
 * Ajusta a escolha de um aluno quando os dias da turma mudam.
 *
 * Dia que já existia mantém a decisão anterior. Dia novo entra marcado, porque
 * o caso comum é o aluno frequentar tudo — o professor desmarca as exceções.
 */
export function reconcileDays(previousSelection, previousClassDays, nextClassDays) {
  const previous = new Set(previousSelection);
  const known = new Set(previousClassDays);

  return nextClassDays.filter((day) => (known.has(day) ? previous.has(day) : true));
}

/** 'Todos os dias' · 'Segunda e Quinta' — para exibir na lista de matriculados. */
export function formatEnrollmentDays(daysOfWeek, classDays = []) {
  if (!daysOfWeek || daysOfWeek.length === 0) return 'Todos os dias';
  if (classDays.length > 0 && daysOfWeek.length === classDays.length) return 'Todos os dias';

  return `Só ${formatWeekdayList(daysOfWeek)}`;
}

/** Dias distintos da grade da turma, ordenados. */
export function classDaysOf(turma) {
  const days = (turma?.class_schedules ?? []).map((schedule) => schedule.day_of_week);
  return [...new Set(days)].sort((a, b) => a - b);
}
