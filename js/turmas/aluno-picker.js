/* Seletor de alunos da turma, com escolha de dias por aluno.
 *
 * Comportamento pensado para o caso comum: marcar o aluno já o coloca em TODOS
 * os dias da turma. Os chips de dia aparecem ao lado só para o professor
 * desmarcar as exceções — que é como a coisa funciona na quadra ("no geral são
 * os mesmos alunos, em algumas turmas muda").
 *
 * Componente controlado: quem usa chama `setClassDays()` quando os dias da
 * turma mudam, e `read()` na hora de salvar.
 */

import { el, render } from '../utils/dom.js';
import { weekdayShort } from '../utils/dates.js';
import { formatStudentType } from '../utils/formatters.js';
import { expandEnrollmentDays, normalizeEnrollmentDays, reconcileDays } from './matriculas.js';

const SEARCH_THRESHOLD = 8;

/**
 * @param {object[]} options.students     todos os alunos do professor
 * @param {number[]} options.classDays    dias que a turma tem
 * @param {object[]} options.enrollments  [{ student_id, days_of_week }] já matriculados
 * @returns {{ element: HTMLElement, setClassDays: Function, read: Function }}
 */
export function buildStudentPicker({ students, classDays = [], enrollments = [] }) {
  let currentClassDays = [...classDays];
  let searchTerm = '';

  // studentId -> { checked: boolean, days: number[] }
  const state = new Map();

  for (const student of students) {
    const enrollment = enrollments.find((item) => item.student_id === student.id);
    state.set(student.id, {
      checked: Boolean(enrollment),
      days: enrollment
        ? expandEnrollmentDays(enrollment.days_of_week, currentClassDays)
        : [...currentClassDays],
    });
  }

  const list = el('div', { class: 'picker__list' });
  const counter = el('p', { class: 'picker__counter' });

  const search = el('input', {
    class: 'input picker__search',
    type: 'search',
    placeholder: 'Buscar aluno...',
    'aria-label': 'Buscar aluno',
    oninput: (event) => {
      searchTerm = event.target.value;
      renderList();
    },
  });

  const element = el('div', { class: 'field picker' }, [
    el('span', { class: 'field__label', text: 'Alunos da turma' }),
    students.length > SEARCH_THRESHOLD ? search : null,
    counter,
    list,
  ]);

  renderList();

  /* ==========================================================
     Render
     ========================================================== */

  function renderList() {
    const term = searchTerm.trim().toLowerCase();
    const visible = term
      ? students.filter((student) => student.name.toLowerCase().includes(term))
      : students;

    if (students.length === 0) {
      render(list, el('p', { class: 'text-muted text-sm', text: 'Você ainda não tem alunos cadastrados.' }));
      counter.textContent = '';
      return;
    }

    if (visible.length === 0) {
      render(list, el('p', { class: 'text-muted text-sm', text: `Nenhum aluno para "${searchTerm}".` }));
      updateCounter();
      return;
    }

    render(list, visible.map(studentRow));
    updateCounter();
  }

  function studentRow(student) {
    const entry = state.get(student.id);

    const checkbox = el('input', {
      type: 'checkbox',
      class: 'picker__checkbox',
      checked: entry.checked ? '' : null,
      'aria-label': `Matricular ${student.name}`,
      onchange: (event) => {
        entry.checked = event.target.checked;
        // Remarcar um aluno devolve todos os dias: o padrão é frequentar tudo.
        if (entry.checked && entry.days.length === 0) entry.days = [...currentClassDays];
        renderList();
      },
    });

    const label = el('label', { class: 'picker__main' }, [
      checkbox,
      el('span', {}, [
        el('span', { class: 'picker__name', text: student.name }),
        el('span', { class: 'picker__meta', text: formatStudentType(student.student_type) }),
      ]),
    ]);

    const children = [label];

    // Os chips de dia só fazem sentido com o aluno marcado e a turma com 2+ dias.
    if (entry.checked && currentClassDays.length > 1) {
      children.push(dayChips(student, entry));
    }

    return el('div', { class: `picker__row${entry.checked ? ' picker__row--on' : ''}` }, children);
  }

  function dayChips(student, entry) {
    const chips = currentClassDays.map((day) => {
      const active = entry.days.includes(day);

      return el('button', {
        type: 'button',
        class: `picker__day${active ? ' picker__day--on' : ''}`,
        'aria-pressed': active ? 'true' : 'false',
        'aria-label': `${student.name} — ${weekdayShort(day)}`,
        text: weekdayShort(day),
        onclick: () => toggleDay(entry, day),
      });
    });

    return el('div', { class: 'picker__days', role: 'group' }, chips);
  }

  function toggleDay(entry, day) {
    entry.days = entry.days.includes(day)
      ? entry.days.filter((value) => value !== day)
      : [...entry.days, day].sort((a, b) => a - b);

    // Sem nenhum dia, o aluno não está na turma — desmarcar é o que isso significa.
    if (entry.days.length === 0) entry.checked = false;

    renderList();
  }

  function updateCounter() {
    const total = [...state.values()].filter((entry) => entry.checked).length;
    counter.textContent = total === 0
      ? 'Nenhum aluno selecionado'
      : `${total} aluno${total === 1 ? '' : 's'} selecionado${total === 1 ? '' : 's'}`;
  }

  /* ==========================================================
     API do componente
     ========================================================== */

  /** Chamado quando os dias da turma mudam no formulário. */
  function setClassDays(nextDays) {
    const sorted = [...new Set(nextDays)].sort((a, b) => a - b);

    for (const entry of state.values()) {
      entry.days = reconcileDays(entry.days, currentClassDays, sorted);
      if (entry.checked && entry.days.length === 0) entry.days = [...sorted];
    }

    currentClassDays = sorted;
    renderList();
  }

  /** @returns {{student_id: string, days_of_week: number[]|null}[]} */
  function read() {
    const result = [];

    for (const [studentId, entry] of state.entries()) {
      if (!entry.checked) continue;
      result.push({
        student_id: studentId,
        days_of_week: normalizeEnrollmentDays(entry.days, currentClassDays),
      });
    }
    return result;
  }

  return { element, setClassDays, read };
}
