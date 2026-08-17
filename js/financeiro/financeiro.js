/* Regras de situação financeira (spec, seções 12 e 14 da análise arquitetural).
 *
 * Não existe status gravado no banco — tudo aqui é calculado a partir de
 * `monthly_fee_cents`, `due_day` e dos pagamentos já registrados.
 *
 * Janela considerada: os últimos 3 meses (mês atual + 2 anteriores). Isso
 * evita duas coisas ruins: (a) alunos cadastrados há muito tempo nascerem
 * artificialmente "atrasados" por meses que nunca foram cobrados, e (b) ter
 * que carregar o histórico financeiro inteiro só para pintar um badge.
 * Um mês fora da janela que ficou sem pagamento não vira alerta — só o
 * histórico de pagamentos (no perfil do aluno) mostra o passado completo.
 */

import { addMonths, daysInMonth, startOfMonth, toISODate, todayISO } from '../utils/dates.js';

export const STATUS_WINDOW_MONTHS = 3;

/**
 * Os últimos `count` meses de referência, do mais antigo ao mais recente.
 * @returns {string[]} ex.: ['2026-06-01', '2026-07-01', '2026-08-01']
 */
export function recentReferenceMonths(todayIso = todayISO(), count = STATUS_WINDOW_MONTHS) {
  const currentMonth = startOfMonth(todayIso);
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    months.push(startOfMonth(addMonths(currentMonth, -i)));
  }
  return months;
}

/**
 * Data de vencimento de um mês de referência, respeitando due_day.
 *
 * due_day vai de 1 a 31. Quando o dia não existe no mês, o vencimento cai no
 * último dia dele: vencimento 31 vira 28 em fevereiro (29 em ano bissexto) e
 * 30 em abril. É por isso que o banco não precisa proibir 29, 30 e 31 — o
 * problema é de cálculo, não de cadastro.
 */
export function dueDateForMonth(referenceMonthIso, dueDay) {
  const [year, month] = referenceMonthIso.split('-').map(Number);
  const day = Math.min(dueDay, daysInMonth(year, month));
  return toISODate(new Date(year, month - 1, day));
}

/** Status de UM pagamento: 'paid' | 'overdue' | 'pending'. */
export function paymentStatus(payment, todayIso = todayISO()) {
  if (payment.paid_date) return 'paid';
  if (payment.due_date < todayIso) return 'overdue';
  return 'pending';
}

/**
 * Situação financeira de um aluno, considerando só os últimos meses.
 * @param {object}   student   precisa de monthly_fee_cents e due_day
 * @param {object[]} payments  pagamentos do aluno (qualquer período; a função filtra)
 * @returns {'ok' | 'overdue' | 'none'}  'none' = aluno sem mensalidade configurada
 */
export function studentFinancialStatus(student, payments, todayIso = todayISO()) {
  if (!student.monthly_fee_cents || !student.due_day) return 'none';

  const paidMonths = new Set(
    payments.filter((payment) => payment.paid_date).map((payment) => payment.reference_month),
  );

  for (const month of recentReferenceMonths(todayIso)) {
    if (paidMonths.has(month)) continue;

    const due = dueDateForMonth(month, student.due_day);
    if (todayIso > due) return 'overdue';
  }

  return 'ok';
}

export function financialStatusLabel(status) {
  return { ok: 'Em dia', overdue: 'Atrasado', none: 'Sem mensalidade' }[status] ?? '';
}

/** Agrupa uma lista de pagamentos por student_id → array de pagamentos. */
export function groupPaymentsByStudent(payments) {
  const byStudent = new Map();
  for (const payment of payments) {
    if (!byStudent.has(payment.student_id)) byStudent.set(payment.student_id, []);
    byStudent.get(payment.student_id).push(payment);
  }
  return byStudent;
}

/** Mês de referência (dia 1) a partir de qualquer data ISO do mês. */
export function referenceMonthFromDate(iso) {
  return startOfMonth(iso);
}

/** Última data possível para o mesmo dia de vencimento no mês seguinte, útil para o formulário. */
export function suggestedDueDate(referenceMonthIso, dueDay) {
  if (!dueDay) return referenceMonthIso;
  return dueDateForMonth(referenceMonthIso, dueDay);
}

export function isValidDueDay(dueDay) {
  return Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31;
}
