import {
  addMinutesToTime, addMonths, datesOfMonthByWeekday, endOfMonth, formatDateBR,
  formatWeekdayList, getDayOfWeek, minutesBetween, monthLabel, parseISODate,
  startOfMonth, toISODate, todayISO,
} from '../js/utils/dates.js';
import { calendarWeeks, mergeOccurrences, nextOccurrences, plannedOccurrencesForMonth } from '../js/agenda/ocorrencias.js';
import {
  attendsDay, classDaysOf, expandEnrollmentDays, formatEnrollmentDays,
  normalizeEnrollmentDays, reconcileDays, studentsForDay,
} from '../js/turmas/matriculas.js';
import {
  billingStartDate, buildInitialPayment, dueDateForMonth, enrollmentMonth, isBillable,
  isValidDueDay, monthlySummary, paymentStatus, recentReferenceMonths,
  selectableReferenceMonths, studentFinancialStatus,
} from '../js/financeiro/financeiro.js';
import {
  formatOccupancy, freeSlots, groupWaitlistByClass, hasVacancy, isFull, wantsClass,
} from '../js/lista-espera/vagas.js';
import { scheduleShort } from '../js/turmas/turmas-ui.js';
import { isConflict } from '../js/offline/conflitos.js';
import { timestampToLocalISODate } from '../js/utils/dates.js';
import { parseCurrencyToCents, formatCurrency, formatPhone, whatsappLink } from '../js/utils/formatters.js';
import { validateDueDay } from '../js/utils/validators.js';

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

/* ---------- MATRICULA POR DIA ---------- */
// Convencao: days_of_week null = frequenta TODOS os dias da turma
eq('sem restricao frequenta qualquer dia', attendsDay({ days_of_week: null }, 1), true);
eq('array vazio tambem e sem restricao', attendsDay({ days_of_week: [] }, 4), true);
eq('restrito a segunda vai na segunda', attendsDay({ days_of_week: [1] }, 1), true);
eq('restrito a segunda nao vai na quinta', attendsDay({ days_of_week: [1] }, 4), false);

const matriculados = [
  { id: 'a1', name: 'Todos', days_of_week: null },
  { id: 'a2', name: 'So segunda', days_of_week: [1] },
  { id: 'a3', name: 'So quinta', days_of_week: [4] },
  { id: 'a4', name: 'Ambos explicito', days_of_week: [1, 4] },
];
eq('chamada de segunda', studentsForDay(matriculados, 1).map((s) => s.id), ['a1', 'a2', 'a4']);
eq('chamada de quinta', studentsForDay(matriculados, 4).map((s) => s.id), ['a1', 'a3', 'a4']);
eq('chamada de um dia sem ninguem restrito', studentsForDay(matriculados, 3).map((s) => s.id), ['a1']);

// normalize: marcou todos os dias -> null, para o aluno acompanhar dias novos
eq('todos os dias marcados viram null', normalizeEnrollmentDays([1, 4], [1, 4]), null);
eq('subconjunto e preservado', normalizeEnrollmentDays([4], [1, 4]), [4]);
eq('ordem e normalizada', normalizeEnrollmentDays([4, 1], [1, 4, 5]), [1, 4]);
eq('dia fora da turma e descartado', normalizeEnrollmentDays([1, 6], [1, 4]), [1]);
eq('nenhum dia vira null', normalizeEnrollmentDays([], [1, 4]), null);
eq('turma de um dia so sempre vira null', normalizeEnrollmentDays([1], [1]), null);

// expand: o inverso, para preencher a interface
eq('null expande para todos os dias da turma', expandEnrollmentDays(null, [1, 4]), [1, 4]);
eq('array expande para ele mesmo', expandEnrollmentDays([4], [1, 4]), [4]);
eq('expand ignora dia que a turma nao tem', expandEnrollmentDays([1, 6], [1, 4]), [1]);

// reconcile: turma muda de dias, escolhas antigas sao preservadas
eq('dia novo entra marcado', reconcileDays([1], [1, 4], [1, 4, 5]), [1, 5]);
eq('dia removido some da escolha', reconcileDays([1, 4], [1, 4], [1]), [1]);
eq('escolha anterior e mantida', reconcileDays([4], [1, 4], [1, 4]), [4]);
eq('troca completa de dias marca tudo', reconcileDays([1], [1, 4], [2, 3]), [2, 3]);

eq('formata todos os dias', formatEnrollmentDays(null, [1, 4]), 'Todos os dias');
eq('formata restricao', formatEnrollmentDays([1], [1, 4]), 'Só Segunda');
eq('formata restricao dupla', formatEnrollmentDays([1, 3], [1, 3, 5]), 'Só Segunda e Quarta');
eq('array completo tambem e todos os dias', formatEnrollmentDays([1, 4], [1, 4]), 'Todos os dias');

eq('classDaysOf tira duplicados e ordena', classDaysOf({
  class_schedules: [
    { day_of_week: 4, start_time: '07:00:00' },
    { day_of_week: 1, start_time: '07:00:00' },
    { day_of_week: 4, start_time: '19:00:00' },
  ],
}), [1, 4]);
eq('classDaysOf de turma sem horario', classDaysOf({ class_schedules: [] }), []);

/* ---------- FINANCEIRO ---------- */
eq('dueDate dia 10', dueDateForMonth('2026-08-01', 10), '2026-08-10');
eq('dueDate dia 28 em fevereiro', dueDateForMonth('2026-02-01', 28), '2026-02-28');
// due_day de 1 a 31: meses curtos puxam para o ultimo dia
eq('dueDate dia 31 em agosto (31 dias)', dueDateForMonth('2026-08-01', 31), '2026-08-31');
eq('dueDate dia 31 em abril (30 dias)', dueDateForMonth('2026-04-01', 31), '2026-04-30');
eq('dueDate dia 31 em fevereiro comum', dueDateForMonth('2026-02-01', 31), '2026-02-28');
eq('dueDate dia 31 em fevereiro bissexto', dueDateForMonth('2028-02-01', 31), '2028-02-29');
eq('dueDate dia 30 em fevereiro', dueDateForMonth('2026-02-01', 30), '2026-02-28');
eq('dueDate dia 29 em fevereiro bissexto', dueDateForMonth('2028-02-01', 29), '2028-02-29');
eq('dueDate dia 1', dueDateForMonth('2026-08-01', 1), '2026-08-01');
eq('validateDueDay aceita 31', validateDueDay('31'), null);
eq('validateDueDay aceita 1', validateDueDay('1'), null);
eq('validateDueDay recusa 32', validateDueDay('32'), 'O dia de vencimento deve ser entre 1 e 31.');
eq('validateDueDay recusa 0', validateDueDay('0'), 'O dia de vencimento deve ser entre 1 e 31.');
eq('validateDueDay aceita vazio (opcional)', validateDueDay(''), null);
eq('isValidDueDay 31', isValidDueDay(31), true);
eq('isValidDueDay 32', isValidDueDay(32), false);
eq('recentReferenceMonths', recentReferenceMonths('2026-08-17'), ['2026-06-01', '2026-07-01', '2026-08-01']);
eq('pagamento pago', paymentStatus({ paid_date: '2026-08-05', due_date: '2026-08-10' }, '2026-08-17'), 'paid');
eq('pagamento atrasado', paymentStatus({ paid_date: null, due_date: '2026-08-10' }, '2026-08-17'), 'overdue');
eq('pagamento a vencer', paymentStatus({ paid_date: null, due_date: '2026-08-25' }, '2026-08-17'), 'pending');

/* A cobranca comeca no mes da matricula (ou do pagamento mais antigo).
   Sem isso, todo aluno recem-cadastrado nascia "Atrasado". */
const matriculadoHoje = { monthly_fee_cents: 15000, due_day: 10, created_at: '2026-08-17T14:00:00.000Z' };
const matriculadoAntes = { monthly_fee_cents: 15000, due_day: 10, created_at: '2026-05-02T14:00:00.000Z' };

eq('BUG: aluno cadastrado hoje sem pagamento -> ok', studentFinancialStatus(matriculadoHoje, [], '2026-08-17'), 'ok');
eq('BUG: aluno cadastrado hoje, vencimento ja passou -> ok', studentFinancialStatus(matriculadoHoje, [], '2026-08-31'), 'ok');
eq('aluno antigo sem pagamento nenhum -> overdue', studentFinancialStatus(matriculadoAntes, [], '2026-08-17'), 'overdue');
eq('cadastrado hoje com ultimo pagamento em junho -> overdue', studentFinancialStatus(matriculadoHoje, [
  { reference_month: '2026-06-01', paid_date: '2026-06-10' },
], '2026-08-17'), 'overdue');
eq('cadastrado hoje com pagamento do mes atual -> ok', studentFinancialStatus(matriculadoHoje, [
  { reference_month: '2026-08-01', paid_date: '2026-08-17' },
], '2026-08-17'), 'ok');
eq('matricula no mes passado, pagou o mes passado, atual nao venceu -> ok', studentFinancialStatus(
  { monthly_fee_cents: 15000, due_day: 20, created_at: '2026-07-05T14:00:00.000Z' },
  [{ reference_month: '2026-07-01', paid_date: '2026-07-19' }], '2026-08-17'), 'ok');
eq('matricula no mes passado, nao pagou o mes passado -> overdue', studentFinancialStatus(
  { monthly_fee_cents: 15000, due_day: 10, created_at: '2026-07-05T14:00:00.000Z' },
  [], '2026-08-17'), 'overdue');
eq('billingStartDate usa o pagamento mais antigo', billingStartDate(matriculadoHoje, [
  { reference_month: '2026-06-01', paid_date: '2026-06-10' },
]), '2026-06-01');
eq('billingStartDate usa a data da matricula quando nao ha pagamento', billingStartDate(matriculadoHoje, []), '2026-08-17');
eq('enrollmentMonth converte timestamp para mes local', enrollmentMonth(matriculadoAntes), '2026-05-01');
eq('timestamp noturno nao pula o dia', timestampToLocalISODate('2026-08-17T14:00:00.000Z').slice(0, 7), '2026-08');

/* Pagamento inicial montado no cadastro */
eq('buildInitialPayment mes passado usa o vencimento como data', buildInitialPayment(
  { referenceMonth: '2026-07-01', monthlyFeeCents: 15000, dueDay: 10 }, '2026-08-17'),
  { reference_month: '2026-07-01', amount_cents: 15000, due_date: '2026-07-10', paid_date: '2026-07-10' });
eq('buildInitialPayment vencimento futuro usa hoje', buildInitialPayment(
  { referenceMonth: '2026-08-01', monthlyFeeCents: 15000, dueDay: 25 }, '2026-08-17'),
  { reference_month: '2026-08-01', amount_cents: 15000, due_date: '2026-08-25', paid_date: '2026-08-17' });
eq('buildInitialPayment sem mensalidade -> null', buildInitialPayment(
  { referenceMonth: '2026-08-01', monthlyFeeCents: null, dueDay: 10 }), null);
eq('buildInitialPayment sem mes -> null', buildInitialPayment(
  { referenceMonth: null, monthlyFeeCents: 15000, dueDay: 10 }), null);
eq('selectableReferenceMonths mais recente primeiro', selectableReferenceMonths('2026-08-17', 3),
  ['2026-08-01', '2026-07-01', '2026-06-01']);

const aluno = { monthly_fee_cents: 15000, due_day: 10, created_at: '2026-01-10T12:00:00.000Z' };
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

/* ---------- ATLETA PATROCINADO ---------- */
/* O patrocinado sai antes de qualquer conta: nem em dia, nem atrasado. */
const patrocinado = { sponsored: true, monthly_fee_cents: 15000, due_day: 10, created_at: '2026-01-10T12:00:00.000Z' };
const pagante = { sponsored: false, monthly_fee_cents: 15000, due_day: 10, created_at: '2026-01-10T12:00:00.000Z' };

eq('patrocinado tem status proprio', studentFinancialStatus(patrocinado, [], '2026-08-17'), 'sponsored');
eq('patrocinado nunca fica atrasado, nem meses depois', studentFinancialStatus(patrocinado, [], '2026-12-31'), 'sponsored');
eq('mesmo aluno sem patrocinio fica atrasado', studentFinancialStatus(pagante, [], '2026-08-17'), 'overdue');
eq('patrocinado nao e cobravel', isBillable(patrocinado), false);
eq('pagante com mensalidade e vencimento e cobravel', isBillable(pagante), true);
eq('sem dia de vencimento nao e cobravel', isBillable({ monthly_fee_cents: 15000 }), false);

/* ---------- RESUMO FINANCEIRO DO MES ---------- */
const elenco = [
  { id: 'A', sponsored: false, monthly_fee_cents: 15000, due_day: 10, created_at: '2026-01-01T12:00:00.000Z' },
  { id: 'B', sponsored: false, monthly_fee_cents: 15000, due_day: 10, created_at: '2026-01-01T12:00:00.000Z' },
  { id: 'C', sponsored: false, monthly_fee_cents: 13000, due_day: 10, created_at: '2026-01-01T12:00:00.000Z' },
  { id: 'D', sponsored: false, monthly_fee_cents: 15000, due_day: 10, created_at: '2026-01-01T12:00:00.000Z' },
  { id: 'E', sponsored: true, monthly_fee_cents: 15000, due_day: 10, created_at: '2026-01-01T12:00:00.000Z' },
];
const lancamentos = [
  { student_id: 'A', amount_cents: 15000, reference_month: '2026-08-01', paid_date: '2026-08-09' },
  { student_id: 'B', amount_cents: 15000, reference_month: '2026-08-01', paid_date: '2026-08-10' },
  { student_id: 'C', amount_cents: 13000, reference_month: '2026-08-01', paid_date: null },
  { student_id: 'D', amount_cents: 15000, reference_month: '2026-07-01', paid_date: '2026-07-10' },
];
const resumoMes = monthlySummary(elenco, lancamentos, '2026-08-17');

eq('previsto soma so quem paga (150+150+130+150)', resumoMes.expectedCents, 58000);
eq('recebido conta so a baixa do mes', resumoMes.receivedCents, 30000);
eq('a receber = previsto - recebido', resumoMes.toReceiveCents, 28000);
eq('alunos pagantes', resumoMes.payingCount, 4);
eq('patrocinados contados a parte', resumoMes.sponsoredCount, 1);
eq('total de alunos', resumoMes.studentCount, 5);

/* Mensalidade cadastrada NAO vira recebimento sozinha. */
eq('sem baixa, nada recebido', monthlySummary(elenco, [], '2026-08-17').receivedCents, 0);
eq('sem baixa, tudo a receber', monthlySummary(elenco, [], '2026-08-17').toReceiveCents, 58000);

/* Recebido maior que previsto (quitou mes atrasado junto) nao vira negativo. */
const extra = [{ student_id: 'A', amount_cents: 99000, reference_month: '2026-08-01', paid_date: '2026-08-09' }];
eq('a receber nunca fica negativo', monthlySummary(elenco, extra, '2026-08-17').toReceiveCents, 0);

/* Turma inteira de patrocinados: previsto zero, e ninguem some da contagem. */
const sopatrocinados = [{ id: 'X', sponsored: true, monthly_fee_cents: 15000, due_day: 5, created_at: '2026-01-01T12:00:00.000Z' }];
eq('so patrocinados: previsto zero', monthlySummary(sopatrocinados, [], '2026-08-17').expectedCents, 0);
eq('so patrocinados: continuam contados', monthlySummary(sopatrocinados, [], '2026-08-17').studentCount, 1);

/* ---------- VAGA NA TURMA ---------- */
eq('sem capacidade definida, sempre ha vaga', hasVacancy(null, 12), true);
eq('7 de 8 tem vaga', hasVacancy(8, 7), true);
eq('8 de 8 nao tem vaga', hasVacancy(8, 8), false);
eq('turma cheia', isFull(8, 8), true);
eq('vagas livres', freeSlots(8, 6), 2);
eq('vagas livres nunca negativas', freeSlots(8, 10), 0);
eq('vagas livres sem capacidade', freeSlots(null, 10), null);
eq('ocupacao com capacidade', formatOccupancy(7, 8), '7/8 alunos');
eq('ocupacao sem capacidade', formatOccupancy(4, null), '4 alunos matriculados');
eq('ocupacao singular', formatOccupancy(1, null), '1 aluno matriculado');

/* ---------- ORDEM DA LISTA DE ESPERA ---------- */
const noite = {
  class_id: 'T1', name: 'Adulto Noite',
  class_schedules: [
    { day_of_week: 2, start_time: '18:00:00', end_time: '19:00:00' },
    { day_of_week: 4, start_time: '18:00:00', end_time: '19:00:00' },
  ],
};
const sabado = {
  class_id: 'T2', name: 'Adulto Sabado',
  class_schedules: [{ day_of_week: 6, start_time: '09:00:00', end_time: '10:00:00' }],
};

const fila = [
  { id: 'w1', name: 'João', desired_slot: 'Ter e Qui 18h', created_at: '2026-08-10T10:00:00.000Z', interests: [noite] },
  { id: 'w2', name: 'Maria', desired_slot: 'Ter e Qui 18h', created_at: '2026-08-12T10:00:00.000Z', interests: [noite] },
  { id: 'w3', name: 'Pedro', desired_slot: 'Ter e Qui 18h', created_at: '2026-08-15T10:00:00.000Z', interests: [noite] },
  { id: 'w4', name: 'Ana', desired_slot: 'Sabado de manha', created_at: '2026-08-11T10:00:00.000Z', interests: [] },
];
const grupos = groupWaitlistByClass(fila);
eq('fila agrupada por turma desejada', grupos.length, 2);
eq('grupo da turma usa o nome dela', grupos[0].label, 'Adulto Noite');
eq('grupo sem turma usa o horario escrito', grupos[1].label, 'Sabado de manha');
eq('ordem de chegada preservada', grupos[0].people.map((p) => p.name), ['João', 'Maria', 'Pedro']);
eq('posicoes numeradas a partir de 1', grupos[0].people.map((p) => p.position), [1, 2, 3]);
eq('primeiro da fila e a primeira opcao', grupos[0].people[0].name, 'João');

/* ---------- VARIOS HORARIOS PARA A MESMA PESSOA ---------- */
const filaMulti = [
  { id: 'm1', name: 'Joao', desired_slot: 'Noite ou sabado', created_at: '2026-08-10T10:00:00.000Z', interests: [noite, sabado] },
  { id: 'm2', name: 'Bia', desired_slot: 'So sabado', created_at: '2026-08-11T10:00:00.000Z', interests: [sabado] },
];
const gruposMulti = groupWaitlistByClass(filaMulti);
eq('pessoa com dois interesses entra nas duas filas', gruposMulti.length, 2);
eq('fila da noite tem so quem a quer', gruposMulti[0].people.map((p) => p.name), ['Joao']);
eq('fila de sabado respeita a ordem de chegada', gruposMulti[1].people.map((p) => p.name), ['Joao', 'Bia']);
eq('posicao e propria de cada fila', gruposMulti[1].people.map((p) => p.position), [1, 2]);
eq('a mesma turma nao vira dois grupos', new Set(gruposMulti.map((g) => g.classId)).size, 2);
eq('grupo carrega a grade da turma para exibir', gruposMulti[1].schedules.length, 1);

eq('interessado na turma e reconhecido', wantsClass(filaMulti[0], 'T2'), true);
eq('nao interessado nao entra na conta', wantsClass(filaMulti[1], 'T1'), false);
eq('sem interesse nenhum nao quebra', wantsClass({ name: 'X' }, 'T1'), false);

/* ---------- HORARIO CURTO (selo da lista de espera) ---------- */
eq('horario curto junta os dias', scheduleShort(noite.class_schedules), 'Ter/Qui 18h');
eq('horario curto de um dia so', scheduleShort(sabado.class_schedules), 'Sáb 9h');
eq('horario curto com minutos', scheduleShort([{ day_of_week: 1, start_time: '18:30:00', end_time: '19:30:00' }]), 'Seg 18h30');
eq('horarios diferentes mostram so os dias', scheduleShort([
  { day_of_week: 1, start_time: '17:00:00', end_time: '18:00:00' },
  { day_of_week: 3, start_time: '19:00:00', end_time: '20:00:00' },
]), 'Seg/Qua');
eq('sem grade nao inventa horario', scheduleShort([]), '');

/* ---------- CONFLITO DE SINCRONIZACAO (offline) ---------- */
const marcacao = (base, op = 'upsert') => ({ op, baseUpdatedAt: base });
const linha = (updatedAt) => ({ status: 'present', updated_at: updatedAt });

eq('servidor intacto: pode gravar',
  isConflict(marcacao('2026-08-20T10:00:00Z'), linha('2026-08-20T10:00:00Z')), false);
eq('servidor mudou: nao sobrescreve',
  isConflict(marcacao('2026-08-20T10:00:00Z'), linha('2026-08-20T11:30:00Z')), true);
eq('linha nova offline, servidor vazio: pode gravar',
  isConflict(marcacao(null), null), false);
eq('linha nova offline, mas alguem marcou antes: conflito',
  isConflict(marcacao(null), linha('2026-08-20T11:00:00Z')), true);
eq('apagar o que ja sumiu nao e conflito',
  isConflict(marcacao('2026-08-20T10:00:00Z', 'delete'), null), false);
eq('gravar sobre linha apagada por outro: conflito',
  isConflict(marcacao('2026-08-20T10:00:00Z'), null), true);
eq('sem pendencia nenhuma nao quebra', isConflict(undefined, null), false);

/* ---------- CONTATO ---------- */
eq('whatsapp com DDD ganha o 55', whatsappLink('82999998888'), 'https://wa.me/5582999998888');
eq('whatsapp com fixo de 10 digitos', whatsappLink('8232228888'), 'https://wa.me/558232228888');
eq('whatsapp sem telefone', whatsappLink(''), '');
eq('whatsapp com mensagem', whatsappLink('82999998888', 'Oi!'), 'https://wa.me/5582999998888?text=Oi!');

const failed = results.filter((r) => !r.ok);
document.title = `${results.length - failed.length}/${results.length} OK`;
document.body.textContent = failed.length === 0
  ? 'TODOS OS TESTES PASSARAM'
  : `FALHAS:: ${failed.map((f) => `${f.name} | esperado ${f.expected} | recebeu ${f.actual}`).join(' ;; ')}`;
