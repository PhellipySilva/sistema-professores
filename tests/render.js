/* Teste de fumaça da interface.
 *
 * Monta cada componente com dados falsos e confere que o HTML sai como
 * esperado. Pega erros que o build não vê: propriedade errada no el(),
 * campo inexistente, texto que não aparece.
 *
 * Não substitui abrir o sistema — mas se algo aqui quebra, está quebrado. */

import { studentCard, openStudentModal, studentSummaryCard, searchBar } from '../js/alunos/alunos-ui.js';
import { attendanceHistorySection, makeupHistorySection, summarizeAttendanceByMonth } from '../js/alunos/aluno-historico.js';
import { classCard, openClassModal, scheduleSummary } from '../js/turmas/turmas-ui.js';
import { buildStudentPicker } from '../js/turmas/aluno-picker.js';
import { attendanceRow, attendanceSummary, countStatuses } from '../js/agenda/frequencia.js';
import { paymentHistorySection, paymentBadge } from '../js/financeiro/financeiro-ui.js';
import { openWaitlistModal, vacancyCard, waitlistGroup } from '../js/lista-espera/lista-espera-ui.js';
import { categoryBadge, categoryVariant, weekdayBadges } from '../js/components/badges.js';
import { scheduleTime, weekdayFilterBar } from '../js/turmas/turmas-ui.js';
import { groupWaitlistByClass } from '../js/lista-espera/vagas.js';
import { emptyState, errorState } from '../js/components/empty-state.js';
import { textField, selectField, checkboxChips, showFieldErrors } from '../js/components/form.js';
import { skeletonList, loadingBlock } from '../js/components/loading.js';
import { el } from '../js/utils/dom.js';

const results = [];
const check = (name, fn) => {
  try {
    const value = fn();
    results.push({ name, ok: value === true, detail: value === true ? '' : String(value) });
  } catch (error) {
    results.push({ name, ok: false, detail: `LANÇOU: ${error.message}` });
  }
};

/** Versão para o que precisa esperar o submit do formulário. */
const checkAsync = async (name, fn) => {
  try {
    const value = await fn();
    results.push({ name, ok: value === true, detail: value === true ? '' : String(value) });
  } catch (error) {
    results.push({ name, ok: false, detail: `LANÇOU: ${error.message}` });
  }
};

const has = (node, text) => (node.textContent.includes(text) ? true : `não achou "${text}" em: ${node.textContent.slice(0, 120)}`);

/* ---------- Dados falsos ---------- */
const aluno = {
  id: 'a1', name: 'João Silva', phone: '82999998888', category: 'adulto',
  guardian_name: null, monthly_fee_cents: 15000, due_day: 10,
};
const alunoKids = {
  id: 'a2', name: 'Maria Souza', phone: '82988887777', category: 'kids',
  guardian_name: 'Ana Souza', monthly_fee_cents: 12000, due_day: 10,
};
const turma = {
  id: 't1', name: 'Kids Iniciante', category: 'kids', student_count: 4,
  class_schedules: [
    { day_of_week: 1, start_time: '17:00:00', end_time: '18:00:00' },
    { day_of_week: 3, start_time: '17:00:00', end_time: '18:00:00' },
  ],
};
const noop = () => {};

/* ---------- Alunos ---------- */
check('studentCard mostra nome', () => has(studentCard(aluno, 'ok', { onEdit: noop, onDelete: noop }), 'João Silva'));
check('studentCard mostra telefone formatado', () => has(studentCard(aluno, 'ok', { onEdit: noop, onDelete: noop }), '(82) 99999-8888'));
check('studentCard mostra badge Em dia', () => has(studentCard(aluno, 'ok', { onEdit: noop, onDelete: noop }), 'Em dia'));
check('studentCard mostra badge Atrasado', () => has(studentCard(aluno, 'overdue', { onEdit: noop, onDelete: noop }), 'Atrasado'));
check('studentCard mostra responsavel de kids', () => has(studentCard(alunoKids, 'ok', { onEdit: noop, onDelete: noop }), 'Responsável: Ana Souza'));
check('studentCard linka para o perfil', () => studentCard(aluno, 'ok', { onEdit: noop, onDelete: noop }).querySelector('a').getAttribute('href') === '/pages/aluno.html?id=a1' || 'href errado');
check('studentSummaryCard mostra mensalidade', () => has(studentSummaryCard(aluno, 'ok'), 'R$'));
check('searchBar tem input', () => Boolean(searchBar({ onInput: noop }).querySelector('input')) || 'sem input');

/* ---------- Historico ---------- */
const frequencia = [
  { status: 'present', class_sessions: { session_date: '2026-08-03' } },
  { status: 'present', class_sessions: { session_date: '2026-08-05' } },
  { status: 'absent', class_sessions: { session_date: '2026-08-10' } },
  { status: 'makeup', class_sessions: { session_date: '2026-08-12' } },
  { status: 'present', class_sessions: { session_date: '2026-07-06' } },
];
const resumo = summarizeAttendanceByMonth(frequencia);
check('resumo agrupa 2 meses', () => resumo.length === 2 || `veio ${resumo.length}`);
check('resumo agosto tem 4 aulas', () => resumo[0].total === 4 || `veio ${resumo[0].total}`);
check('resumo conta reposicao como presenca (3/4 = 75%)', () => resumo[0].ratio === 0.75 || `veio ${resumo[0].ratio}`);
check('secao de frequencia mostra percentual', () => has(attendanceHistorySection(frequencia), '75%'));
check('secao de frequencia vazia tem mensagem', () => has(attendanceHistorySection([]), 'Nenhuma aula registrada'));
check('secao de reposicoes mostra status', () => has(makeupHistorySection([
  { id: 'm1', original_date: '2026-08-10', makeup_date: '2026-08-17', status: 'scheduled' },
]), 'Agendada'));
check('reposicao sem data avisa', () => has(makeupHistorySection([
  { id: 'm2', original_date: '2026-08-10', makeup_date: null, status: 'pending' },
]), 'ainda não definida'));

/* ---------- Turmas ---------- */
check('scheduleSummary junta dias e horario', () => scheduleSummary(turma.class_schedules) === 'Segunda e Quarta · 17:00 · 60 min' || `veio: ${scheduleSummary(turma.class_schedules)}`);
check('scheduleSummary sem horario', () => scheduleSummary([]) === 'Sem horário definido' || 'texto errado');
check('classCard mostra nome', () => has(classCard(turma, { onEdit: noop, onDelete: noop }), 'Kids Iniciante'));
check('classCard mostra contagem de alunos', () => has(classCard(turma, { onEdit: noop, onDelete: noop }), '4 alunos matriculados'));
check('classCard singular com 1 aluno', () => has(classCard({ ...turma, student_count: 1 }, { onEdit: noop, onDelete: noop }), '1 aluno matriculado'));

/* ---------- Chamada ---------- */
const linha = attendanceRow({ student: aluno, status: 'absent', onSelect: async () => true, onMakeup: noop });
check('chamada tem 3 botoes', () => linha.querySelectorAll('.attendance-option').length === 3 || 'contagem errada');
check('chamada marca o status atual', () => linha.querySelector('[data-status="absent"]').getAttribute('aria-pressed') === 'true' || 'aria-pressed errado');
check('chamada mostra Repor quando faltou', () => !linha.querySelector('.btn--sm').classList.contains('hidden') || 'botao Repor escondido');
const linhaPresente = attendanceRow({ student: aluno, status: 'present', onSelect: async () => true, onMakeup: noop });
check('chamada esconde Repor quando presente', () => linhaPresente.querySelector('.btn--sm').classList.contains('hidden') || 'botao Repor visivel');
check('chamada sem onMakeup nao cria botao', () => attendanceRow({ student: aluno, status: null, onSelect: async () => true }).querySelector('.btn--sm') === null || 'criou botao a toa');
check('convidado tem marcacao visual', () => attendanceRow({ student: aluno, status: null, isGuest: true, onSelect: async () => true }).classList.contains('attendance-row--guest') || 'sem classe de convidado');

const contagem = countStatuses(new Map([['a1', 'present'], ['a2', 'absent']]), 5);
check('contagem de presentes', () => contagem.present === 1 || `veio ${contagem.present}`);
check('contagem de nao marcados', () => contagem.pending === 3 || `veio ${contagem.pending}`);
check('resumo da chamada em texto', () => has(attendanceSummary(contagem), '1 presente · 1 falta · 3 sem marcar'));

/* ---------- Financeiro ---------- */
check('badge de pagamento pago', () => has(paymentBadge({ paid_date: '2026-08-05', due_date: '2026-08-10' }), 'Pago'));
check('historico de pagamento mostra valor', () => has(paymentHistorySection([
  { id: 'p1', reference_month: '2026-08-01', amount_cents: 15000, due_date: '2026-08-10', paid_date: '2026-08-09' },
], { onRegister: noop }), 'R$'));
check('historico vazio tem mensagem', () => has(paymentHistorySection([], { onRegister: noop }), 'Nenhum pagamento registrado'));
check('patrocinado nao ganha botao de registrar', () => !paymentHistorySection([], {}).querySelector('button') || 'botao apareceu');
check('patrocinado mantem o historico visivel', () => has(paymentHistorySection([{ id: 'p1', reference_month: '2026-07-01', amount_cents: 15000, due_date: '2026-07-10', paid_date: '2026-07-09' }], {}), 'Julho/2026'));

/* ---------- Componentes base ---------- */
check('emptyState mostra titulo', () => has(emptyState({ title: 'Nada aqui' }), 'Nada aqui'));
check('emptyState com acao cria botao', () => Boolean(emptyState({ title: 'x', actionLabel: 'Criar', onAction: noop }).querySelector('button')) || 'sem botao');
check('errorState tem tom certo', () => has(errorState({ message: 'Falhou' }), 'Algo deu errado'));
check('skeletonList cria N blocos', () => skeletonList(4).querySelectorAll('.skeleton').length === 4 || 'contagem errada');
check('loadingBlock e live region', () => loadingBlock('Carregando...').getAttribute('aria-live') === 'polite' || 'sem aria-live');

/* ---------- Formulario ---------- */
const campo = textField({ name: 'nome', label: 'Nome', value: 'João' });
check('textField liga label ao input', () => {
  const label = campo.querySelector('label');
  const input = campo.querySelector('input');
  return label.getAttribute('for') === input.id || 'for/id nao batem';
});
check('textField preenche valor', () => campo.querySelector('input').value === 'João' || 'valor errado');
check('selectField marca a opcao atual', () => {
  const sel = selectField({ name: 'cat', label: 'Cat', options: [{ value: 'kids', label: 'Kids' }, { value: 'adulto', label: 'Adulto' }], value: 'adulto' });
  return sel.querySelector('select').value === 'adulto' || `veio ${sel.querySelector('select').value}`;
});
check('checkboxChips marca os dias escolhidos', () => {
  const chips = checkboxChips({ name: 'days', label: 'Dias', options: [{ value: 1, label: 'seg' }, { value: 3, label: 'qua' }], values: [3] });
  const marcados = [...chips.querySelectorAll('input:checked')].map((i) => i.value);
  return JSON.stringify(marcados) === '["3"]' || `veio ${JSON.stringify(marcados)}`;
});
check('showFieldErrors exibe e limpa', () => {
  const form = el('form', {}, [textField({ name: 'nome', label: 'Nome' })]);
  document.body.append(form);
  showFieldErrors(form, { nome: 'Obrigatório' });
  const erro = form.querySelector('.field__error');
  const apareceu = !erro.classList.contains('hidden') && erro.textContent === 'Obrigatório';
  showFieldErrors(form, { nome: null });
  const sumiu = erro.classList.contains('hidden');
  form.remove();
  return (apareceu && sumiu) || `apareceu=${apareceu} sumiu=${sumiu}`;
});

/* ---------- Modal ---------- */
check('modal de aluno abre com campos preenchidos', () => {
  const modal = openStudentModal({ student: aluno, onSave: async () => {} });
  const nome = modal.element.querySelector('[name="nome"], [name="name"]');
  const ok = nome?.value === 'João Silva';
  modal.close();
  return ok || `veio ${nome?.value}`;
});
check('modal novo aluno vem vazio', () => {
  const modal = openStudentModal({ student: null, onSave: async () => {} });
  const nome = modal.element.querySelector('[name="name"]');
  const ok = nome?.value === '';
  modal.close();
  return ok || `veio "${nome?.value}"`;
});

/* ---------- Cadastro com turma e pagamento inicial ---------- */
const turmasDisponiveis = [
  { id: 't1', name: 'Kids Iniciante', category: 'kids' },
  { id: 't2', name: 'Adulto Manhã', category: 'adulto' },
];

check('cadastro novo tem campo de turma', () => {
  const modal = openStudentModal({ student: null, classes: turmasDisponiveis, onSave: async () => {} });
  const ok = Boolean(modal.element.querySelector('[name="class_id"]'));
  modal.close();
  return ok || 'sem select de turma';
});
check('cadastro novo lista as turmas existentes', () => {
  const modal = openStudentModal({ student: null, classes: turmasDisponiveis, onSave: async () => {} });
  const labels = [...modal.element.querySelectorAll('[name="class_id"] option')].map((o) => o.textContent);
  const ok = labels.some((l) => l.includes('Kids Iniciante')) && labels.some((l) => l.includes('Adulto Manhã'));
  modal.close();
  return ok || `veio ${JSON.stringify(labels)}`;
});
check('cadastro oferece criar turma quando ha callback', () => {
  const modal = openStudentModal({ student: null, classes: turmasDisponiveis, onCreateClass: async () => {}, onSave: async () => {} });
  const ok = [...modal.element.querySelectorAll('[name="class_id"] option')].some((o) => o.textContent.includes('Criar nova turma'));
  modal.close();
  return ok || 'sem opcao de criar turma';
});
check('cadastro sem callback nao oferece criar turma', () => {
  const modal = openStudentModal({ student: null, classes: turmasDisponiveis, onSave: async () => {} });
  const ok = ![...modal.element.querySelectorAll('[name="class_id"] option')].some((o) => o.textContent.includes('Criar nova turma'));
  modal.close();
  return ok || 'ofereceu criar turma sem callback';
});
check('cadastro novo tem campo de ultima mensalidade paga', () => {
  const modal = openStudentModal({ student: null, classes: [], onSave: async () => {} });
  const ok = Boolean(modal.element.querySelector('[name="last_paid_month"]'));
  modal.close();
  return ok || 'sem select de ultimo pagamento';
});
check('ultima mensalidade comeca sem selecao', () => {
  const modal = openStudentModal({ student: null, classes: [], onSave: async () => {} });
  const ok = modal.element.querySelector('[name="last_paid_month"]').value === '';
  modal.close();
  return ok || 'ja vem preenchido';
});
check('edicao NAO mostra turma nem pagamento', () => {
  const modal = openStudentModal({ student: aluno, classes: turmasDisponiveis, onCreateClass: async () => {}, onSave: async () => {} });
  const temTurma = Boolean(modal.element.querySelector('[name="class_id"]'));
  const temPagamento = Boolean(modal.element.querySelector('[name="last_paid_month"]'));
  modal.close();
  return (!temTurma && !temPagamento) || `turma=${temTurma} pagamento=${temPagamento}`;
});
/* Submete o formulário de verdade e confere o que chega em onSave. */
await checkAsync('cadastro entrega payload, turma e mes no onSave', async () => {
  let recebido = null;

  const modal = openStudentModal({
    student: null,
    classes: turmasDisponiveis,
    onSave: async (payload, extras) => {
      recebido = { payload, extras };
    },
  });

  const form = modal.element.querySelector('form');
  form.elements.name.value = 'Carlos Dias';
  form.elements.phone.value = '(82) 91234-5678';
  form.elements.category.value = 'adulto';
  form.elements.monthly_fee.value = '180,00';
  form.elements.due_day.value = '15';
  form.elements.class_id.value = 't2';
  form.elements.last_paid_month.value = form.elements.last_paid_month.options[1].value;

  form.requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 30));
  modal.close();

  if (!recebido) return 'onSave nao foi chamado';
  if (recebido.payload.name !== 'Carlos Dias') return `nome: ${recebido.payload.name}`;
  if (recebido.payload.phone !== '82912345678') return `telefone nao normalizado: ${recebido.payload.phone}`;
  if (recebido.payload.monthly_fee_cents !== 18000) return `centavos: ${recebido.payload.monthly_fee_cents}`;
  if (recebido.payload.due_day !== 15) return `due_day: ${recebido.payload.due_day}`;
  if (recebido.extras.classId !== 't2') return `classId: ${recebido.extras.classId}`;
  if (!/^\d{4}-\d{2}-01$/.test(recebido.extras.lastPaidMonth)) return `mes: ${recebido.extras.lastPaidMonth}`;
  return true;
});

await checkAsync('kids sem responsavel e recusado', async () => {
  let chamou = false;

  const modal = openStudentModal({
    student: null,
    classes: [],
    onSave: async () => { chamou = true; },
  });

  const form = modal.element.querySelector('form');
  form.elements.name.value = 'Bruno Kids';
  form.elements.category.value = 'kids';
  form.elements.guardian_name.value = '';

  form.requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const erroVisivel = [...form.querySelectorAll('.field__error')].some(
    (node) => !node.classList.contains('hidden') && node.textContent.includes('responsável'),
  );
  const aindaAberto = modal.element.open;
  modal.close();

  if (chamou) return 'salvou mesmo sem responsavel';
  if (!erroVisivel) return 'nao mostrou o erro do responsavel';
  if (!aindaAberto) return 'fechou o modal em vez de manter aberto';
  return true;
});

await checkAsync('ultimo pagamento sem mensalidade e recusado', async () => {
  let chamou = false;

  const modal = openStudentModal({
    student: null,
    classes: [],
    onSave: async () => { chamou = true; },
  });

  const form = modal.element.querySelector('form');
  form.elements.name.value = 'Sem Mensalidade';
  form.elements.category.value = 'adulto';
  form.elements.monthly_fee.value = '';
  form.elements.last_paid_month.value = form.elements.last_paid_month.options[1].value;

  form.requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 30));

  const erroVisivel = [...form.querySelectorAll('.field__error')].some(
    (node) => !node.classList.contains('hidden') && node.textContent.includes('mensalidade'),
  );
  modal.close();

  if (chamou) return 'salvou sem mensalidade';
  if (!erroVisivel) return 'nao explicou por que recusou';
  return true;
});

/* ---------- Seletor de alunos com dias (turma segunda + quinta) ---------- */
const alunosDaTurma = [
  { id: 'a1', name: 'João Silva', category: 'adulto' },
  { id: 'a2', name: 'Maria Souza', category: 'kids' },
  { id: 'a3', name: 'Pedro Almeida', category: 'adulto' },
];
const SEG_QUI = [1, 4];

const contar = (picker, seletor) => picker.element.querySelectorAll(seletor).length;

check('picker lista todos os alunos', () => {
  const p = buildStudentPicker({ students: alunosDaTurma, classDays: SEG_QUI, enrollments: [] });
  return contar(p, '.picker__row') === 3 || `veio ${contar(p, '.picker__row')}`;
});
check('picker comeca sem ninguem marcado', () => {
  const p = buildStudentPicker({ students: alunosDaTurma, classDays: SEG_QUI, enrollments: [] });
  return contar(p, '.picker__checkbox:checked') === 0 || 'veio marcado';
});
check('picker read vazio quando nada marcado', () => {
  const p = buildStudentPicker({ students: alunosDaTurma, classDays: SEG_QUI, enrollments: [] });
  return JSON.stringify(p.read()) === '[]' || JSON.stringify(p.read());
});
check('marcar aluno o coloca em todos os dias (null)', () => {
  const p = buildStudentPicker({ students: alunosDaTurma, classDays: SEG_QUI, enrollments: [] });
  const box = p.element.querySelectorAll('.picker__checkbox')[0];
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  const lido = p.read();
  return (lido.length === 1 && lido[0].student_id === 'a1' && lido[0].days_of_week === null)
    || JSON.stringify(lido);
});
check('chips de dia aparecem so para quem esta marcado', () => {
  const p = buildStudentPicker({ students: alunosDaTurma, classDays: SEG_QUI, enrollments: [] });
  const antes = contar(p, '.picker__day');
  const box = p.element.querySelectorAll('.picker__checkbox')[0];
  box.checked = true;
  box.dispatchEvent(new Event('change'));
  const depois = contar(p, '.picker__day');
  return (antes === 0 && depois === 2) || `antes=${antes} depois=${depois}`;
});
check('desmarcar um dia gera restricao', () => {
  const p = buildStudentPicker({
    students: alunosDaTurma, classDays: SEG_QUI,
    enrollments: [{ student_id: 'a1', days_of_week: null }],
  });
  // O segundo chip do primeiro aluno e a quinta.
  p.element.querySelectorAll('.picker__day')[1].click();
  const lido = p.read();
  return JSON.stringify(lido) === JSON.stringify([{ student_id: 'a1', days_of_week: [1] }])
    || JSON.stringify(lido);
});
check('tirar o ultimo dia desmarca o aluno', () => {
  const p = buildStudentPicker({
    students: alunosDaTurma, classDays: SEG_QUI,
    enrollments: [{ student_id: 'a1', days_of_week: [1] }],
  });
  p.element.querySelector('.picker__day--on').click();
  return JSON.stringify(p.read()) === '[]' || JSON.stringify(p.read());
});
check('picker carrega matriculas existentes', () => {
  const p = buildStudentPicker({
    students: alunosDaTurma, classDays: SEG_QUI,
    enrollments: [{ student_id: 'a1', days_of_week: null }, { student_id: 'a3', days_of_week: [4] }],
  });
  const lido = p.read().sort((x, y) => x.student_id.localeCompare(y.student_id));
  return JSON.stringify(lido) === JSON.stringify([
    { student_id: 'a1', days_of_week: null },
    { student_id: 'a3', days_of_week: [4] },
  ]) || JSON.stringify(lido);
});
check('setClassDays: dia novo entra marcado para todos', () => {
  const p = buildStudentPicker({
    students: alunosDaTurma, classDays: SEG_QUI,
    enrollments: [{ student_id: 'a1', days_of_week: [1] }],
  });
  p.setClassDays([1, 4, 5]);
  const lido = p.read();
  // a1 tinha so segunda; a sexta entra marcada -> [1, 5]
  return JSON.stringify(lido) === JSON.stringify([{ student_id: 'a1', days_of_week: [1, 5] }])
    || JSON.stringify(lido);
});
check('setClassDays: remover dia nao deixa aluno orfao', () => {
  const p = buildStudentPicker({
    students: alunosDaTurma, classDays: SEG_QUI,
    enrollments: [{ student_id: 'a3', days_of_week: [4] }],
  });
  p.setClassDays([1]); // a quinta deixou de existir
  const lido = p.read();
  return (lido.length === 1 && lido[0].student_id === 'a3' && lido[0].days_of_week === null)
    || JSON.stringify(lido);
});
check('turma de um dia so nao mostra chips', () => {
  const p = buildStudentPicker({
    students: alunosDaTurma, classDays: [1],
    enrollments: [{ student_id: 'a1', days_of_week: null }],
  });
  return contar(p, '.picker__day') === 0 || 'mostrou chips com um dia so';
});
check('picker conta os selecionados', () => {
  const p = buildStudentPicker({
    students: alunosDaTurma, classDays: SEG_QUI,
    enrollments: [{ student_id: 'a1', days_of_week: null }, { student_id: 'a2', days_of_week: null }],
  });
  return has(p.element, '2 alunos selecionados');
});
check('picker sem alunos cadastrados avisa', () => {
  const p = buildStudentPicker({ students: [], classDays: SEG_QUI, enrollments: [] });
  return has(p.element, 'ainda não tem alunos cadastrados');
});

/* ---------- Modal de turma com alunos ---------- */
check('modal de turma sem students nao mostra o seletor', () => {
  const modal = openClassModal({ turma: null, onSave: async () => {} });
  const ok = modal.element.querySelector('.picker') === null;
  modal.close();
  return ok || 'mostrou o seletor sem receber alunos';
});
check('modal de turma com students mostra o seletor', () => {
  const modal = openClassModal({ turma: null, students: alunosDaTurma, onSave: async () => {} });
  const ok = Boolean(modal.element.querySelector('.picker'));
  modal.close();
  return ok || 'nao mostrou o seletor';
});

await checkAsync('criar turma entrega horarios e matriculas juntos', async () => {
  let recebido = null;

  const modal = openClassModal({
    turma: null,
    students: alunosDaTurma,
    onSave: async (payload) => { recebido = payload; },
  });

  const form = modal.element.querySelector('form');
  form.elements.name.value = 'Adulto Noite';
  form.elements.category.value = 'adulto';
  form.elements.start_time.value = '19:00';
  form.elements.duration.value = '60';

  // Segunda e quinta
  for (const input of form.querySelectorAll('input[name="days"]')) {
    input.checked = ['1', '4'].includes(input.value);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // João em tudo, Pedro só na quinta
  const boxes = form.querySelectorAll('.picker__checkbox');
  boxes[0].checked = true; boxes[0].dispatchEvent(new Event('change'));
  boxes[2].checked = true; boxes[2].dispatchEvent(new Event('change'));

  const pedroRow = [...form.querySelectorAll('.picker__row')].find((row) => row.textContent.includes('Pedro'));
  pedroRow.querySelectorAll('.picker__day')[0].click(); // tira a segunda

  form.requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 40));
  modal.close();

  if (!recebido) return 'onSave nao foi chamado';
  if (recebido.schedules.length !== 2) return `horarios: ${recebido.schedules.length}`;
  if (recebido.schedules[0].end_time !== '20:00:00') return `fim: ${recebido.schedules[0].end_time}`;

  const matriculas = recebido.enrollments.sort((a, b) => a.student_id.localeCompare(b.student_id));
  const esperado = [
    { student_id: 'a1', days_of_week: null },
    { student_id: 'a3', days_of_week: [4] },
  ];
  if (JSON.stringify(matriculas) !== JSON.stringify(esperado)) return JSON.stringify(matriculas);
  return true;
});

/* ---------- Atleta patrocinado ---------- */
const patrocinado = { ...aluno, id: 'a9', name: 'Bia Patrocinada', sponsored: true };

check('studentCard mostra selo de patrocinado', () => has(studentCard(patrocinado, 'sponsored', { onEdit: noop, onDelete: noop }), 'Patrocinado'));
check('perfil do patrocinado nao cobra mensalidade', () => has(studentSummaryCard(patrocinado, 'sponsored'), 'sem cobrança'));
/* O Intl usa espaço fino entre o cifrão e o número, então a busca é pelo valor. */
check('perfil do pagante segue mostrando o valor', () => has(studentSummaryCard(aluno, 'ok'), '150,00 · vence dia 10'));

check('cadastro tem a opcao de patrocinado', () => {
  const modal = openStudentModal({ student: null, onSave: async () => {} });
  const ok = Boolean(modal.element.querySelector('[name="sponsored"]'));
  modal.close();
  return ok || 'sem checkbox de patrocinado';
});
check('patrocinado esconde os campos de cobranca', () => {
  const modal = openStudentModal({ student: patrocinado, onSave: async () => {} });
  const campo = modal.element.querySelector('[name="monthly_fee"]').closest('.field');
  const ok = campo.classList.contains('hidden');
  modal.close();
  return ok || 'mensalidade continua visivel';
});
check('desmarcar patrocinado traz os campos de volta', () => {
  const modal = openStudentModal({ student: patrocinado, onSave: async () => {} });
  const check1 = modal.element.querySelector('[name="sponsored"]');
  check1.checked = false;
  check1.dispatchEvent(new Event('change'));
  const campo = modal.element.querySelector('[name="monthly_fee"]').closest('.field');
  const ok = !campo.classList.contains('hidden');
  modal.close();
  return ok || 'mensalidade continua escondida';
});
check('patrocinado preserva o valor cadastrado', () => {
  const modal = openStudentModal({ student: patrocinado, onSave: async () => {} });
  const ok = modal.element.querySelector('[name="monthly_fee"]').value === '150,00';
  modal.close();
  return ok || 'valor perdido';
});
checkAsync('salvar patrocinado envia sponsored = true', async () => {
  let recebido = null;
  const modal = openStudentModal({ student: patrocinado, onSave: async (payload) => { recebido = payload; } });
  modal.element.querySelector('form').requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 30));
  modal.close();
  if (!recebido) return 'onSave nao foi chamado';
  if (recebido.sponsored !== true) return `sponsored: ${recebido.sponsored}`;
  // O histórico de cobrança vai junto, guardado para quando o patrocínio acabar.
  return recebido.monthly_fee_cents === 15000 || `mensalidade: ${recebido.monthly_fee_cents}`;
});

/* ---------- Ocupação da turma ---------- */
check('classCard mostra ocupacao quando ha vagas definidas', () => has(classCard({ ...turma, capacity: 8 }, { onEdit: noop, onDelete: noop }), '4/8 alunos'));
check('classCard avisa turma cheia', () => has(classCard({ ...turma, capacity: 4 }, { onEdit: noop, onDelete: noop }), 'Turma cheia'));
check('classCard sem capacidade nao inventa limite', () => !classCard(turma, { onEdit: noop, onDelete: noop }).textContent.includes('/') || 'apareceu barra sem capacidade');
check('modal de turma tem campo de vagas', () => {
  const modal = openClassModal({ turma: { ...turma, capacity: 8 }, onSave: async () => {} });
  const ok = modal.element.querySelector('[name="capacity"]').value === '8';
  modal.close();
  return ok || 'valor de vagas errado';
});

/* ---------- Lista de espera ---------- */
/* Interesses no formato que a API devolve: uma pessoa pode ter vários. */
const interesseNoite = {
  class_id: 't1',
  name: 'Adulto Noite',
  category: 'adulto',
  class_schedules: [
    { day_of_week: 2, start_time: '18:00:00', end_time: '19:00:00' },
    { day_of_week: 4, start_time: '18:00:00', end_time: '19:00:00' },
  ],
};
const interesseSabado = {
  class_id: 't9',
  name: 'Adulto Sábado',
  category: 'adulto',
  class_schedules: [{ day_of_week: 6, start_time: '09:00:00', end_time: '10:00:00' }],
};

const fila = [
  { id: 'w1', name: 'João Silva', phone: '82999998888', desired_slot: 'Terça e Quinta — 18h', notes: 'Assim que surgir vaga', status: 'waiting', created_at: '2026-08-10T10:00:00.000Z', interests: [interesseNoite, interesseSabado], class_ids: ['t1', 't9'] },
  { id: 'w2', name: 'Maria Santos', phone: '82988887777', desired_slot: 'Terça e Quinta — 18h', notes: null, status: 'contacted', created_at: '2026-08-12T10:00:00.000Z', interests: [interesseNoite], class_ids: ['t1'] },
];
const grupo = groupWaitlistByClass(fila)[0];
const grupoNode = waitlistGroup(grupo, { onContact: noop, onEnroll: noop, onEdit: noop, onRemove: noop });

check('fila mostra o horario desejado', () => has(grupoNode, 'Adulto Noite'));
check('fila numera a ordem de chegada', () => has(grupoNode, '1º · João Silva'));
check('fila mostra a segunda posicao', () => has(grupoNode, '2º · Maria Santos'));
check('fila mostra a observacao', () => has(grupoNode, 'Assim que surgir vaga'));
check('fila mostra o status de cada pessoa', () => has(grupoNode, 'Contatada'));
check('fila linka o WhatsApp', () => grupoNode.querySelector('a[href^="https://wa.me/"]')?.getAttribute('href') === 'https://wa.me/5582999998888' || 'link errado');
check('fila mostra os horarios de interesse como selos', () => has(grupoNode, 'Ter/Qui 18h'));
check('fila mostra tambem o outro horario da mesma pessoa', () => has(grupoNode, 'Sáb 9h'));
check('fila destaca o horario do grupo atual', () => grupoNode.querySelectorAll('.badge--current').length === 2 || 'destaque errado');

const aviso = { id: 'n1', class_id: 't1', student_name: 'Carlos', status: 'new', created_at: '2026-08-17T10:00:00.000Z', classes: { id: 't1', name: 'Adulto Noite' } };
const avisoNode = vacancyCard({ notification: aviso, people: grupo.people, onResolve: noop, onEnroll: noop });

check('aviso de vaga nomeia a turma', () => has(avisoNode, 'Vaga aberta · Adulto Noite'));
check('aviso diz quem saiu', () => has(avisoNode, 'Carlos saiu da turma'));
check('aviso mostra a primeira da fila', () => has(avisoNode, 'João Silva'));
check('aviso mostra o telefone dela', () => has(avisoNode, '(82) 99999-8888'));
check('aviso comeca como Nova', () => has(avisoNode, 'Nova'));
check('aviso visualizado muda de selo', () => has(vacancyCard({ notification: { ...aviso, status: 'seen' }, people: grupo.people, onResolve: noop, onEnroll: noop }), 'Visualizada'));
check('aviso oferece resolver', () => has(avisoNode, 'Marcar como resolvida'));
check('aviso oferece matricular', () => has(avisoNode, 'Matricular'));
check('aviso lista toda a fila, nao so a primeira', () => has(avisoNode, 'Maria Santos'));
check('aviso da um WhatsApp por pessoa', () => avisoNode.querySelectorAll('a[href^="https://wa.me/"]').length === 2 || 'contagem de links errada');
check('aviso sem fila nao promete ninguem', () => has(vacancyCard({ notification: aviso, people: [], onResolve: noop, onEnroll: noop }), 'Ninguém na fila'));

check('modal da lista pede nome e telefone', () => {
  const modal = openWaitlistModal({ entry: null, classes: [], onSave: async () => {} });
  const ok = Boolean(modal.element.querySelector('[name="name"]') && modal.element.querySelector('[name="phone"]'));
  modal.close();
  return ok || 'faltou campo';
});
check('modal da lista preenche o horario a partir das turmas marcadas', () => {
  const modal = openWaitlistModal({ entry: null, classes: [turma], onSave: async () => {} });
  const caixa = modal.element.querySelector('[name="class_ids"][value="t1"]');
  caixa.checked = true;
  caixa.dispatchEvent(new Event('change', { bubbles: true }));
  const ok = modal.element.querySelector('[name="desired_slot"]').value.includes('Kids Iniciante');
  modal.close();
  return ok || `veio "${modal.element.querySelector('[name="desired_slot"]')?.value}"`;
});
check('modal da lista aceita marcar mais de uma turma', () => {
  const outra = { ...turma, id: 't9', name: 'Adulto Sábado', class_schedules: [{ day_of_week: 6, start_time: '09:00:00', end_time: '10:00:00' }] };
  const modal = openWaitlistModal({ entry: null, classes: [turma, outra], onSave: async () => {} });
  const caixas = modal.element.querySelectorAll('[name="class_ids"]');
  const ok = caixas.length === 2;
  modal.close();
  return ok || `veio ${caixas.length} caixa(s)`;
});
check('modal da lista marca as turmas que a pessoa ja tinha', () => {
  const outra = { ...turma, id: 't9', name: 'Adulto Sábado', class_schedules: [{ day_of_week: 6, start_time: '09:00:00', end_time: '10:00:00' }] };
  const pessoa = { ...fila[0], class_ids: ['t1', 't9'] };
  const modal = openWaitlistModal({ entry: pessoa, classes: [turma, outra], onSave: async () => {} });
  const marcadas = [...modal.element.querySelectorAll('[name="class_ids"]:checked')].map((i) => i.value);
  modal.close();
  return (marcadas.length === 2 && marcadas.includes('t9')) || `marcadas: ${marcadas.join()}`;
});
checkAsync('lista de espera exige contato', async () => {
  let salvou = false;
  const modal = openWaitlistModal({ entry: null, classes: [turma], onSave: async () => { salvou = true; } });
  const form = modal.element.querySelector('form');
  form.elements.name.value = 'Sem Telefone';
  form.elements.desired_slot.value = 'Sábado 9h';
  form.requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const erro = has(modal.element, 'Informe um telefone');
  modal.close();
  return (!salvou && erro === true) || `salvou=${salvou} erro=${erro}`;
});
checkAsync('lista de espera salva o que foi digitado', async () => {
  let recebido = null;
  const modal = openWaitlistModal({ entry: null, classes: [turma], defaultClassId: 't1', onSave: async (payload) => { recebido = payload; } });
  const form = modal.element.querySelector('form');
  form.elements.name.value = 'João Silva';
  form.elements.phone.value = '(82) 99999-9999';
  form.elements.notes.value = 'Deseja começar assim que surgir uma vaga.';
  form.requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 30));
  modal.close();
  if (!recebido) return 'onSave nao foi chamado';
  if (recebido.phone !== '82999999999') return `telefone: ${recebido.phone}`;
  if (JSON.stringify(recebido.class_ids) !== JSON.stringify(['t1'])) return `turmas: ${recebido.class_ids}`;
  return Boolean(recebido.desired_slot) || 'horario desejado vazio';
});
checkAsync('lista de espera salva as varias turmas marcadas', async () => {
  const outra = { ...turma, id: 't9', name: 'Adulto Sábado', class_schedules: [{ day_of_week: 6, start_time: '09:00:00', end_time: '10:00:00' }] };
  let recebido = null;
  const modal = openWaitlistModal({ entry: null, classes: [turma, outra], onSave: async (payload) => { recebido = payload; } });
  const form = modal.element.querySelector('form');
  form.elements.name.value = 'João Silva';
  form.elements.phone.value = '(82) 99999-9999';
  for (const caixa of modal.element.querySelectorAll('[name="class_ids"]')) {
    caixa.checked = true;
    caixa.dispatchEvent(new Event('change', { bubbles: true }));
  }
  form.requestSubmit();
  await new Promise((resolve) => setTimeout(resolve, 30));
  modal.close();
  if (!recebido) return 'onSave nao foi chamado';
  return JSON.stringify(recebido.class_ids) === JSON.stringify(['t1', 't9']) || `turmas: ${recebido.class_ids}`;
});

/* ---------- Categoria com cor própria ---------- */
check('categoria kids tem variante propria', () => categoryVariant('kids') === 'kids' || 'veio ' + categoryVariant('kids'));
check('categoria adulto tem variante propria', () => categoryVariant('adulto') === 'adulto' || 'veio ' + categoryVariant('adulto'));
check('categoria kids e adulto nao dividem cor', () => categoryVariant('kids') !== categoryVariant('adulto') || 'mesma variante');
check('categoria desconhecida cai no neutro', () => categoryVariant('outra') === 'neutral' || 'veio ' + categoryVariant('outra'));
check('selo de kids usa a classe da cor', () => categoryBadge('kids').classList.contains('badge--kids') || 'classe errada');
check('selo de adulto usa a classe da cor', () => categoryBadge('adulto').classList.contains('badge--adulto') || 'classe errada');
check('selo mostra o rotulo legivel', () => has(categoryBadge('kids'), 'Kids'));
check('selo aceita prefixo para o perfil', () => has(categoryBadge('adulto', { prefix: 'Nível' }), 'Nível: Adulto'));

/* ---------- Dia da semana com cor própria ---------- */
const gradeTerQui = [
  { day_of_week: 2, start_time: '18:00', end_time: '19:00' },
  { day_of_week: 4, start_time: '18:00', end_time: '19:00' },
];

check('chips trazem um selo por dia', () => weekdayBadges(gradeTerQui).querySelectorAll('.badge--day').length === 2 || 'contagem errada');
check('cada dia tem a classe da sua cor', () => {
  const classes = [...weekdayBadges(gradeTerQui).querySelectorAll('.badge--day')].map((n) => n.className);
  return (classes[0].includes('day-2') && classes[1].includes('day-4')) || classes.join(' | ');
});
check('dia repetido na grade aparece uma vez so', () => {
  const grade = [
    { day_of_week: 1, start_time: '17:00', end_time: '18:00' },
    { day_of_week: 1, start_time: '19:00', end_time: '20:00' },
  ];
  return weekdayBadges(grade).querySelectorAll('.badge--day').length === 1 || 'duplicou';
});
check('chips saem em ordem de dia', () => {
  const grade = [{ day_of_week: 6, start_time: '09:00', end_time: '10:00' }, { day_of_week: 1, start_time: '09:00', end_time: '10:00' }];
  const classes = [...weekdayBadges(grade).querySelectorAll('.badge--day')].map((n) => n.className);
  return (classes[0].includes('day-1') && classes[1].includes('day-6')) || classes.join(' | ');
});

/* ---------- Horário separado dos dias ---------- */
check('horario da turma sem os dias', () => scheduleTime(gradeTerQui) === '18:00 · 60 min' || 'veio "' + scheduleTime(gradeTerQui) + '"');
check('horarios diferentes nao viram um so', () => {
  const misto = [
    { day_of_week: 1, start_time: '17:00', end_time: '18:00' },
    { day_of_week: 3, start_time: '19:00', end_time: '20:00' },
  ];
  return scheduleTime(misto) === '' || 'veio "' + scheduleTime(misto) + '"';
});
check('turma sem grade nao inventa horario', () => scheduleTime([]) === '' || 'veio algo');

/* ---------- Card da turma ---------- */
const turmaKids = {
  id: 't9', name: 'Kids Iniciante', category: 'kids', student_count: 7, capacity: 8,
  class_schedules: [
    { day_of_week: 1, start_time: '17:00', end_time: '18:00' },
    { day_of_week: 3, start_time: '17:00', end_time: '18:00' },
  ],
};

check('card da turma mostra a categoria colorida', () => Boolean(classCard(turmaKids, { onEdit: noop, onDelete: noop }).querySelector('.badge--kids')) || 'sem selo de categoria');
check('card da turma mostra os chips de dia', () => classCard(turmaKids, { onEdit: noop, onDelete: noop }).querySelectorAll('.badge--day').length === 2 || 'contagem errada');
check('card da turma mantem o horario', () => has(classCard(turmaKids, { onEdit: noop, onDelete: noop }), '17:00 · 60 min'));
check('card da turma mantem a ocupacao', () => has(classCard(turmaKids, { onEdit: noop, onDelete: noop }), '7/8 alunos'));
check('turma sem grade avisa em vez de sumir', () => has(classCard({ ...turmaKids, class_schedules: [] }, { onEdit: noop, onDelete: noop }), 'Sem horário definido'));

/* ---------- Identidade de cor do card da turma ---------- */
check('card da turma leva a cor do primeiro dia', () => classCard(turmaKids, { onEdit: noop, onDelete: noop }).classList.contains('day-1') || 'sem a classe do dia');
check('card da turma tem uma faixa por dia', () => classCard(turmaKids, { onEdit: noop, onDelete: noop }).querySelectorAll('.class-card__segment').length === 2 || 'contagem de faixas errada');
check('faixas usam a cor de cada dia', () => {
  const faixas = [...classCard(turmaKids, { onEdit: noop, onDelete: noop }).querySelectorAll('.class-card__segment')];
  return (faixas[0].classList.contains('day-1') && faixas[1].classList.contains('day-3')) || 'cores fora de ordem';
});
check('turma sem grade nao inventa cor de dia', () => {
  const card = classCard({ ...turmaKids, class_schedules: [] }, { onEdit: noop, onDelete: noop });
  return ![...card.classList].some((nome) => /^day-\d$/.test(nome)) || 'ganhou classe de dia sem ter dia';
});
check('turma de um dia so tem faixa unica', () => {
  const umDia = { ...turmaKids, class_schedules: [{ day_of_week: 6, start_time: '09:00:00', end_time: '10:00:00' }] };
  const card = classCard(umDia, { onEdit: noop, onDelete: noop });
  return (card.querySelectorAll('.class-card__segment').length === 1 && card.classList.contains('day-6')) || 'faixa ou cor erradas';
});

/* ---------- Filtro por dia ---------- */
const filtro = weekdayFilterBar({
  days: [1, 3, 6],
  counts: new Map([[1, 2], [3, 2], [6, 1]]),
  total: 4,
  selected: 3,
  onSelect: noop,
});

check('filtro tem um chip por dia mais o Todas', () => filtro.querySelectorAll('.filter-chip').length === 4 || 'contagem errada');
check('filtro comeca com Todas', () => has(filtro.querySelector('.filter-chip'), 'Todas'));
check('filtro marca o dia ativo', () => {
  const ativos = [...filtro.querySelectorAll('[aria-pressed="true"]')];
  return (ativos.length === 1 && ativos[0].textContent.includes('qua')) || ativos.map((n) => n.textContent).join('|');
});
check('filtro mostra a contagem por dia', () => has(filtro, 'qua'));
check('filtro nao oferece dia sem turma', () => !filtro.textContent.includes('ter') || 'ofereceu terça sem turma');
check('filtro leva a cor do dia no ponto', () => Boolean(filtro.querySelector('.filter-chip__dot.day-1')) || 'ponto sem cor');
checkAsync('filtro devolve o dia clicado', async () => {
  let recebido = 'nada';
  const barra = weekdayFilterBar({
    days: [1, 3], counts: new Map([[1, 1], [3, 1]]), total: 2, selected: null,
    onSelect: (dia) => { recebido = dia; },
  });
  barra.querySelectorAll('.filter-chip')[1].click();
  return recebido === 1 || 'veio ' + recebido;
});
checkAsync('clicar em Todas devolve null', async () => {
  let recebido = 'nada';
  const barra = weekdayFilterBar({
    days: [1], counts: new Map([[1, 1]]), total: 1, selected: 1,
    onSelect: (dia) => { recebido = dia; },
  });
  barra.querySelector('.filter-chip').click();
  return recebido === null || 'veio ' + recebido;
});

/* ---------- Nível no perfil do aluno ---------- */
check('perfil mostra o nivel do aluno', () => has(studentSummaryCard(aluno, 'ok'), 'Nível'));
check('nivel usa a cor da categoria', () => Boolean(studentSummaryCard({ ...aluno, category: 'kids' }, 'ok').querySelector('.badge--kids')) || 'sem cor');
check('listagem de alunos mostra a categoria colorida', () => Boolean(studentCard(aluno, 'ok', { onEdit: noop, onDelete: noop }).querySelector('.badge--adulto')) || 'sem selo');
check('listagem de alunos mantem o telefone', () => has(studentCard(aluno, 'ok', { onEdit: noop, onDelete: noop }), '(82) 99999-8888'));

/* ---------- Identidade de cor do card do aluno ---------- */
const cardDe = (student, status = 'ok') => studentCard(student, status, { onEdit: noop, onDelete: noop });

check('card de aluno kids leva a cor da categoria', () => cardDe(alunoKids).classList.contains('student-card--kids') || 'sem a classe de kids');
check('card de aluno adulto leva a cor da categoria', () => cardDe(aluno).classList.contains('student-card--adulto') || 'sem a classe de adulto');
check('kids e adulto nao compartilham a mesma cor', () => !cardDe(alunoKids).classList.contains('student-card--adulto') || 'card de kids marcado como adulto');
check('categoria desconhecida cai no neutro em vez de quebrar', () => cardDe({ ...aluno, category: 'outra' }).classList.contains('student-card--neutral') || 'sem a reserva neutra');
check('patrocinado mantem a cor da categoria dele', () => cardDe(patrocinado, 'sponsored').classList.contains('student-card--adulto') || 'perdeu a cor da categoria');
check('patrocinado mostra o selo roxo junto com o selo da categoria', () => {
  const card = cardDe(patrocinado, 'sponsored');
  return (Boolean(card.querySelector('.badge--sponsored')) && Boolean(card.querySelector('.badge--adulto')))
    || 'faltou um dos dois selos';
});
check('atraso continua vermelho num card colorido', () => {
  const card = cardDe(alunoKids, 'overdue');
  return (card.classList.contains('student-card--kids') && Boolean(card.querySelector('.badge--danger')))
    || 'a cor do card comeu o estado financeiro';
});
check('perfil do aluno usa a mesma cor da listagem', () => studentSummaryCard(alunoKids, 'ok').classList.contains('student-card--kids') || 'perfil sem a cor da categoria');
check('card do aluno continua sendo um card', () => cardDe(aluno).classList.contains('card') || 'perdeu a classe base');

/* ---------- Resultado ---------- */
const failed = results.filter((r) => !r.ok);
document.title = `${results.length - failed.length}/${results.length} OK`;
document.body.textContent = failed.length === 0
  ? `TODOS OS ${results.length} TESTES DE RENDER PASSARAM`
  : `FALHAS:: ${failed.map((f) => `${f.name} >> ${f.detail}`).join(' ;; ')}`;
