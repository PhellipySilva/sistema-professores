/* Teste de fumaça da interface.
 *
 * Monta cada componente com dados falsos e confere que o HTML sai como
 * esperado. Pega erros que o build não vê: propriedade errada no el(),
 * campo inexistente, texto que não aparece.
 *
 * Não substitui abrir o sistema — mas se algo aqui quebra, está quebrado. */

import { studentCard, openStudentModal, studentSummaryCard, searchBar } from '../js/alunos/alunos-ui.js';
import { attendanceHistorySection, makeupHistorySection, summarizeAttendanceByMonth } from '../js/alunos/aluno-historico.js';
import { classCard, scheduleSummary } from '../js/turmas/turmas-ui.js';
import { attendanceRow, attendanceSummary, countStatuses } from '../js/agenda/frequencia.js';
import { paymentHistorySection, paymentBadge } from '../js/financeiro/financeiro-ui.js';
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

/* ---------- Resultado ---------- */
const failed = results.filter((r) => !r.ok);
document.title = `${results.length - failed.length}/${results.length} OK`;
document.body.textContent = failed.length === 0
  ? `TODOS OS ${results.length} TESTES DE RENDER PASSARAM`
  : `FALHAS:: ${failed.map((f) => `${f.name} >> ${f.detail}`).join(' ;; ')}`;
