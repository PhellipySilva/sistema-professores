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

import {
  addMonths,
  daysInMonth,
  startOfMonth,
  timestampToLocalISODate,
  toISODate,
  todayISO,
} from '../utils/dates.js';

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

/** Dia em que o aluno foi cadastrado, no fuso do professor. */
export function enrollmentDate(student) {
  return timestampToLocalISODate(student.created_at);
}

/** Mês em que o aluno foi cadastrado. */
export function enrollmentMonth(student) {
  const date = enrollmentDate(student);
  return date ? startOfMonth(date) : null;
}

/**
 * A partir de qual DATA faz sentido cobrar este aluno.
 *
 * É a menor entre a data da matrícula e o primeiro mês com pagamento
 * registrado. O pagamento entra na conta porque registrar "pagou junho"
 * significa que o aluno existia em junho — é assim que o professor cadastra
 * alguém que já treinava e vê o atraso real aparecer.
 *
 * Precisa ser data, e não mês: quem se matricula dia 17 com vencimento dia 10
 * não está atrasado no mês em que entrou — o vencimento passou antes de ele
 * existir. Ancorar no mês marcaria esse aluno como devedor no primeiro dia.
 */
export function billingStartDate(student, payments) {
  const candidates = [];

  const enrolled = enrollmentDate(student);
  if (enrolled) candidates.push(enrolled);

  for (const payment of payments) {
    if (payment.reference_month) candidates.push(payment.reference_month);
  }

  if (candidates.length === 0) return null;
  return candidates.reduce((oldest, date) => (date < oldest ? date : oldest));
}

/**
 * Situação financeira de um aluno.
 *
 * Um mês só conta como atraso quando as quatro coisas valem ao mesmo tempo:
 *   1. está dentro da janela de STATUS_WINDOW_MONTHS;
 *   2. o aluno já existia quando aquele mês venceu;
 *   3. não há pagamento registrado para ele;
 *   4. o vencimento já passou.
 *
 * @param {object}   student   precisa de monthly_fee_cents, due_day e created_at
 * @param {object[]} payments  pagamentos do aluno (qualquer período; a função filtra)
 * @returns {'ok' | 'overdue' | 'none'}  'none' = aluno sem mensalidade configurada
 */
export function studentFinancialStatus(student, payments, todayIso = todayISO()) {
  if (!student.monthly_fee_cents || !student.due_day) return 'none';

  const paidMonths = new Set(
    payments.filter((payment) => payment.paid_date).map((payment) => payment.reference_month),
  );

  const startDate = billingStartDate(student, payments);

  for (const month of recentReferenceMonths(todayIso)) {
    const due = dueDateForMonth(month, student.due_day);

    // O aluno não existia quando este mês venceu: não há o que cobrar.
    if (startDate && startDate > due) continue;
    if (paidMonths.has(month)) continue;
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

/**
 * Meses oferecidos no campo "última mensalidade paga" do cadastro,
 * do mais recente para o mais antigo.
 */
export function selectableReferenceMonths(todayIso = todayISO(), count = 6) {
  const currentMonth = startOfMonth(todayIso);
  return Array.from({ length: count }, (_, index) =>
    startOfMonth(addMonths(currentMonth, -index)),
  );
}

/**
 * Monta o registro do último pagamento informado no cadastro do aluno.
 *
 * A data do pagamento é derivada, não perguntada: usa o vencimento daquele mês,
 * ou hoje se o vencimento ainda não chegou. É uma aproximação assumida para não
 * pedir mais um campo no cadastro — o professor corrige no perfil do aluno se
 * precisar da data exata.
 *
 * @returns {object|null} pronto para upsertPayment, ou null se faltar dado
 */
export function buildInitialPayment({ referenceMonth, monthlyFeeCents, dueDay }, todayIso = todayISO()) {
  if (!referenceMonth || !monthlyFeeCents || !dueDay) return null;

  const dueDate = dueDateForMonth(referenceMonth, dueDay);

  return {
    reference_month: referenceMonth,
    amount_cents: monthlyFeeCents,
    due_date: dueDate,
    paid_date: dueDate <= todayIso ? dueDate : todayIso,
  };
}
