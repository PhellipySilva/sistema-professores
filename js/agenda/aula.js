/* Chamada de uma aula (spec, seções 18 e 19). */

import { handleError, initPage } from '../app.js';
import { getSession } from '../api/sessions.js';
import { listClassStudents } from '../api/classes.js';
import { listAttendanceForSession, setAttendance } from '../api/attendance.js';
import { listMakeupsForSession, updateMakeupStatus } from '../api/makeups.js';
import { errorState } from '../components/empty-state.js';
import { showLoading } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { $, el, getQueryParam, render } from '../utils/dom.js';
import { formatDateLongBR, formatTimeRange, getDayOfWeek } from '../utils/dates.js';
import { studentsForDay } from '../turmas/matriculas.js';
import { attendanceRow, attendanceSummary, countStatuses } from './frequencia.js';
import { openMakeupModal } from '../reposicoes/reposicoes.js';

const { user } = await initPage('aula');

const sessionId = getQueryParam('id');
const content = $('#page-content');
const titleNode = $('#page-title');
const subtitleNode = $('#page-subtitle');

let session = null;
let students = [];
let guests = [];
let statusByStudent = new Map();
let hiddenByDay = 0;

if (!sessionId) {
  render(content, errorState({ message: 'Aula não informada.' }));
} else {
  await load();
}

async function load() {
  showLoading(content, 'Carregando chamada...');

  try {
    session = await getSession(user.id, sessionId);

    const [enrolled, records, makeups] = await Promise.all([
      listClassStudents(user.id, session.class_id),
      listAttendanceForSession(user.id, sessionId),
      listMakeupsForSession(user.id, sessionId),
    ]);

    // A turma pode ter alunos que só vão em alguns dias. A chamada mostra
    // apenas quem frequenta o dia desta aula.
    const dayOfWeek = getDayOfWeek(session.session_date);
    students = studentsForDay(enrolled, dayOfWeek);
    hiddenByDay = enrolled.length - students.length;
    guests = makeups.filter((makeup) => makeup.students).map((makeup) => ({
      ...makeup.students,
      makeupId: makeup.id,
    }));

    statusByStudent = new Map(records.map((record) => [record.student_id, record.status]));

    renderCall();
  } catch (error) {
    handleError(error, 'Não foi possível carregar a chamada.');
    render(content, errorState({ message: 'Não foi possível carregar a chamada.', onRetry: load }));
  }
}

function renderCall() {
  const className = session.classes?.name ?? 'Aula';
  document.title = `${className} · Chamada`;
  titleNode.textContent = className;

  subtitleNode.textContent = `${formatDateLongBR(session.session_date)} · ${formatTimeRange(session.start_time, session.end_time)}`;
  subtitleNode.classList.remove('hidden');

  const blocks = [summaryBlock()];

  if (students.length === 0) {
    blocks.push(
      el('p', {
        class: 'text-muted text-sm',
        text: hiddenByDay > 0
          ? 'Nenhum aluno desta turma frequenta neste dia da semana.'
          : 'Nenhum aluno matriculado nesta turma. Adicione alunos na página da turma.',
      }),
    );
  } else {
    blocks.push(
      el('div', { class: 'attendance-list' }, students.map((student) =>
        attendanceRow({
          student,
          status: statusByStudent.get(student.id) ?? null,
          onSelect: saveStatus,
          onMakeup: openMakeup,
        }),
      )),
    );
  }

  if (guests.length > 0) {
    blocks.push(
      el('section', { class: 'section' }, [
        el('h2', { class: 'section__title', text: 'Alunos em reposição' }),
        el('div', { class: 'attendance-list' }, guests.map((guest) =>
          attendanceRow({
            student: guest,
            status: statusByStudent.get(guest.id) ?? null,
            isGuest: true,
            onSelect: (studentId, status) => saveGuestStatus(guest, studentId, status),
          }),
        )),
      ]),
    );
  }

  render(content, blocks);
}

function summaryBlock() {
  const counts = countStatuses(statusByStudent, students.length);

  return el('div', { class: 'card row-between' }, [
    el('div', {}, [
      el('p', { class: 'card__title', text: 'Chamada' }),
      el('div', { id: 'attendance-summary' }, attendanceSummary(counts)),
      hiddenByDay > 0
        ? el('p', {
            class: 'text-xs text-muted',
            text: `${hiddenByDay} aluno${hiddenByDay === 1 ? '' : 's'} da turma não frequenta${hiddenByDay === 1 ? '' : 'm'} neste dia.`,
          })
        : null,
    ]),
    el('a', {
      class: 'btn btn--ghost btn--sm',
      href: `/pages/turma.html?id=${session.class_id}`,
      text: 'Ver turma',
    }),
  ]);
}

function openMakeup(student) {
  openMakeupModal({
    userId: user.id,
    student,
    originalSession: session,
    onSaved: load,
  });
}

/* ============================================================
   Gravação
   ============================================================ */

/**
 * Um toque = um upsert. Devolve true/false para o componente saber se mantém
 * a pintura otimista ou reverte. Não redesenha a página: a linha se atualiza
 * sozinha, e só o resumo do topo é trocado.
 */
async function saveStatus(studentId, status) {
  try {
    await setAttendance(user.id, { session_id: sessionId, student_id: studentId, status });
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível salvar a presença. Tente de novo.'));
    return false;
  }

  statusByStudent.set(studentId, status);
  refreshSummary();
  return true;
}

/** Marcar presença de um convidado conclui a reposição dele. */
async function saveGuestStatus(guest, studentId, status) {
  const ok = await saveStatus(studentId, status);
  if (!ok) return false;

  if (status === 'present' || status === 'makeup') {
    try {
      await updateMakeupStatus(user.id, guest.makeupId, 'completed');
    } catch (error) {
      handleError(error, 'A presença foi salva, mas a reposição não foi marcada como concluída.');
    }
  }
  return true;
}

function refreshSummary() {
  const counts = countStatuses(statusByStudent, students.length);
  const target = $('#attendance-summary');
  if (target) render(target, attendanceSummary(counts));
}
