import {
  addMinutesToTime, addMonths, datesOfMonthByWeekday, endOfMonth, formatDateBR,
  formatWeekdayList, getDayOfWeek, minutesBetween, monthLabel, parseISODate,
  startOfMonth, toISODate, todayISO,
} from '../js/utils/dates.js';
import { calendarWeeks, mergeOccurrences, nextOccurrences, plannedOccurrencesForMonth } from '../js/agenda/ocorrencias.js';
import { dueDateForMonth, paymentStatus, recentReferenceMonths, studentFinancialStatus } from '../js/financeiro/financeiro.js';
import { parseCurrencyToCents, formatCurrency, formatPhone } from '../js/utils/formatters.js';

const results = [];
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  results.push({ name, ok: a === e, actual: a, expected: e });
};

/* ---------- DATAS: as tres armadilhas de fuso ---------- */
eq('parseISODate nao desloca o dia', toISODate(parseISODate('2026-08-17')), '2026-08-17');
eq('parseISODate dia local correto', parseISODate('2026-08-17').getDate(), 17);
eq('formatDateBR', formatDateBR('2026-08-17'), '17/08/2026');
eq('getDayOfWeek 17/08/2026 = segunda(1)', getDayOfWeek('2026-08-17'), 1);
eq('startOfMonth', startOfMonth('2026-08-17'), '2026-08-01');
eq('endOfMonth agosto', endOfMonth('2026-08-17'), '2026-08-31');
eq('endOfMonth fevereiro bissexto', endOfMonth('2028-02-10'), '2028-02-29');
eq('endOfMonth fevereiro normal', endOfMonth('2026-02-10'), '2026-02-28');
eq('addMonths 31jan +1 = 28fev', addMonths('2026-01-31', 1), '2026-02-28');
eq('addMonths negativo', addMonths('2026-01-15', -1), '2025-12-15');
eq('monthLabel', monthLabel('2026-08-01'), 'Agosto/2026');
eq('minutesBetween', minutesBetween('17:00:00', '18:00:00'), 60);
eq('addMinutesToTime', addMinutesToTime('17:00', 90), '18:30:00');
eq('formatWeekdayList 2 dias', formatWeekdayList([1, 3]), 'Segunda e Quarta');
eq('formatWeekdayList 3 dias', formatWeekdayList([1, 3, 5]), 'Segunda, Quarta e Sexta');
eq('datesOfMonthByWeekday segundas de ago/2026',
  datesOfMonthByWeekday('2026-08-01', 1),
  ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31']);
eq('todayISO tem formato ISO', /^\d{4}-\d{2}-\d{2}$/.test(todayISO()), true);

/* ---------- CALENDARIO ---------- */
const weeks = calendarWeeks('2026-08-01');
eq('calendario: semanas de 7', weeks.every((w) => w.length === 7), true);
eq('calendario: 1o ago/2026 e sabado -> 6 nulos antes', weeks[0].slice(0, 6).every((d) => d === null), true);
eq('calendario: primeiro dia real', weeks[0][6], '2026-08-01');
eq('calendario: cobre o mes todo', weeks.flat().filter(Boolean).length, 31);

/* ---------- OCORRENCIAS ---------- */
const schedules = [
  { class_id: 'T1', day_of_week: 1, start_time: '17:00:00', end_time: '18:00:00', classes: { name: 'Kids', category: 'kids' } },
  { class_id: 'T1', day_of_week: 3, start_time: '17:00:00', end_time: '18:00:00', classes: { name: 'Kids', category: 'kids' } },
];
const planned = plannedOccurrencesForMonth(schedules, '2026-08-01');
eq('previstas: 5 segundas + 4 quartas = 9', planned.length, 9);
eq('previstas: ordenadas por data', planned.map((o) => o.date), [...planned.map((o) => o.date)].sort());
eq('previstas: nenhuma materializada', planned.every((o) => o.session === null), true);

const sessions = [
  { id: 'S1', class_id: 'T1', session_date: '2026-08-17', start_time: '17:00:00', end_time: '18:00:00', status: 'scheduled', classes: { name: 'Kids' } },
];
const merged = mergeOccurrences(planned, sessions);
eq('mescla: mesma quantidade', merged.length, 9);
eq('mescla: 17/08 virou real', merged.find((o) => o.date === '2026-08-17').session?.id, 'S1');
eq('mescla: as outras seguem previstas', merged.filter((o) => o.session).length, 1);

const orphan = [{ id: 'S9', class_id: 'T1', session_date: '2026-08-05', start_time: '19:00:00', end_time: '20:00:00', status: 'scheduled', classes: { name: 'Kids' } }];
eq('mescla: sessao de horario antigo nao some', mergeOccurrences(planned, orphan).length, 10);

const canceled = [{ id: 'S8', class_id: 'T1', session_date: '2026-08-03', start_time: '17:00:00', end_time: '18:00:00', status: 'canceled', classes: {} }];
eq('mescla: cancelada some', mergeOccurrences(planned, canceled).length, 8);

const next = nextOccurrences(schedules, '2026-08-17', 3);
eq('proximas 3 aulas', next.map((o) => o.date), ['2026-08-17', '2026-08-19', '2026-08-24']);
eq('proximas com grade vazia', nextOccurrences([], '2026-08-17', 3), []);

/* ---------- FINANCEIRO ---------- */
eq('dueDate dia 10', dueDateForMonth('2026-08-01', 10), '2026-08-10');
eq('dueDate dia 28 em fevereiro', dueDateForMonth('2026-02-01', 28), '2026-02-28');
eq('recentReferenceMonths', recentReferenceMonths('2026-08-17'), ['2026-06-01', '2026-07-01', '2026-08-01']);
eq('pagamento pago', paymentStatus({ paid_date: '2026-08-05', due_date: '2026-08-10' }, '2026-08-17'), 'paid');
eq('pagamento atrasado', paymentStatus({ paid_date: null, due_date: '2026-08-10' }, '2026-08-17'), 'overdue');
eq('pagamento a vencer', paymentStatus({ paid_date: null, due_date: '2026-08-25' }, '2026-08-17'), 'pending');

const aluno = { monthly_fee_cents: 15000, due_day: 10 };
eq('sem mensalidade -> none', studentFinancialStatus({ monthly_fee_cents: null, due_day: null }, [], '2026-08-17'), 'none');
eq('tudo pago -> ok', studentFinancialStatus(aluno, [
  { reference_month: '2026-06-01', paid_date: '2026-06-09' },
  { reference_month: '2026-07-01', paid_date: '2026-07-09' },
  { reference_month: '2026-08-01', paid_date: '2026-08-09' },
], '2026-08-17'), 'ok');
eq('mes atual vencido e nao pago -> overdue', studentFinancialStatus(aluno, [
  { reference_month: '2026-06-01', paid_date: '2026-06-09' },
  { reference_month: '2026-07-01', paid_date: '2026-07-09' },
], '2026-08-17'), 'overdue');
eq('mes atual ainda nao venceu -> ok', studentFinancialStatus(aluno, [
  { reference_month: '2026-06-01', paid_date: '2026-06-09' },
  { reference_month: '2026-07-01', paid_date: '2026-07-09' },
], '2026-08-05'), 'ok');
eq('mes antigo em aberto -> overdue', studentFinancialStatus(aluno, [
  { reference_month: '2026-08-01', paid_date: '2026-08-09' },
], '2026-08-17'), 'overdue');
eq('lancamento sem paid_date nao conta como pago', studentFinancialStatus(aluno, [
  { reference_month: '2026-06-01', paid_date: null },
  { reference_month: '2026-07-01', paid_date: '2026-07-09' },
  { reference_month: '2026-08-01', paid_date: '2026-08-09' },
], '2026-08-17'), 'overdue');

/* ---------- DINHEIRO ---------- */
eq('parse 150,00', parseCurrencyToCents('150,00'), 15000);
eq('parse R$ 150,00', parseCurrencyToCents('R$ 150,00'), 15000);
eq('parse 150', parseCurrencyToCents('150'), 15000);
eq('parse 1.250,50', parseCurrencyToCents('1.250,50'), 125050);
eq('parse 0,99', parseCurrencyToCents('0,99'), 99);
eq('parse vazio', parseCurrencyToCents(''), null);
eq('format 15000', formatCurrency(15000).replace(/ /g, ' '), 'R$ 150,00');
eq('telefone 11 digitos', formatPhone('82999998888'), '(82) 99999-8888');
eq('telefone 10 digitos', formatPhone('8232228888'), '(82) 3222-8888');

const failed = results.filter((r) => !r.ok);
document.title = `${results.length - failed.length}/${results.length} OK`;
document.body.textContent = failed.length === 0
  ? 'TODOS OS TESTES PASSARAM'
  : `FALHAS:: ${failed.map((f) => `${f.name} | esperado ${f.expected} | recebeu ${f.actual}`).join(' ;; ')}`;
