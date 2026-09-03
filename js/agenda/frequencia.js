/* Interface da chamada: os botões grandes de presença (spec, seção 19). */

import { el } from '../utils/dom.js';
import { formatStudentType } from '../utils/formatters.js';

export const ATTENDANCE_OPTIONS = [
  { value: 'present', label: 'Presente', modifier: 'present' },
  { value: 'absent', label: 'Falta', modifier: 'absent' },
  { value: 'makeup', label: 'Reposição', modifier: 'makeup' },
];

/**
 * Bloco de um aluno na chamada.
 *
 * Não existe botão "salvar": um toque grava direto. A pintura é otimista —
 * o botão muda na hora e `onSelect` reverte se a gravação falhar. Na quadra,
 * ninguém lembra de salvar, e a rede pode estar ruim.
 *
 * A linha se atualiza sozinha: marcar falta revela o atalho de reposição sem
 * redesenhar a página. Redesenhar jogaria a rolagem de volta ao topo no meio
 * da chamada, que é exatamente quando isso mais atrapalha.
 *
 * @param {Function} onSelect      async (studentId, status) => boolean (sucesso?)
 * @param {Function} [onMakeup]    chamado ao tocar em "Repor"; sem isto o botão não existe
 */
export function attendanceRow({ student, status, isGuest = false, onSelect, onMakeup }) {
  const buttons = ATTENDANCE_OPTIONS.map((option) =>
    el('button', {
      type: 'button',
      class: `attendance-option attendance-option--${option.modifier}`,
      'aria-pressed': status === option.value ? 'true' : 'false',
      'data-status': option.value,
      text: option.label,
      onclick: () => handleSelect(option.value),
    }),
  );

  const group = el('div', {
    class: 'attendance-options',
    role: 'group',
    'aria-label': `Presença de ${student.name}`,
  }, buttons);

  const makeupButton = onMakeup
    ? el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        text: 'Repor',
        onclick: () => onMakeup(student),
      })
    : null;

  const header = el('div', { class: 'row-between' }, [
    el('div', {}, [
      el('p', { class: 'attendance-row__name', text: student.name }),
      el('p', {
        class: 'attendance-row__meta',
        text: isGuest ? 'Reposição · convidado' : formatStudentType(student.student_type),
      }),
    ]),
    makeupButton,
  ]);

  const row = el('div', { class: `attendance-row${isGuest ? ' attendance-row--guest' : ''}` }, [
    header,
    group,
  ]);

  syncMakeupButton(status);

  async function handleSelect(value) {
    const previous = currentPressed();
    paint(value);
    syncMakeupButton(value);

    const ok = await onSelect(student.id, value);
    if (!ok) {
      paint(previous); // reverte: a gravação falhou
      syncMakeupButton(previous);
    }
  }

  function currentPressed() {
    return buttons.find((button) => button.getAttribute('aria-pressed') === 'true')?.dataset.status
      ?? null;
  }

  function paint(value) {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', button.dataset.status === value ? 'true' : 'false');
    }
  }

  /** "Repor" só faz sentido para quem faltou. */
  function syncMakeupButton(value) {
    makeupButton?.classList.toggle('hidden', value !== 'absent');
  }

  return row;
}

/** Resumo do topo da chamada: 8 presentes · 2 faltas · 1 reposição */
export function attendanceSummary(counts) {
  const parts = [
    `${counts.present} presente${counts.present === 1 ? '' : 's'}`,
    `${counts.absent} falta${counts.absent === 1 ? '' : 's'}`,
  ];
  if (counts.makeup > 0) parts.push(`${counts.makeup} reposição`);
  if (counts.pending > 0) parts.push(`${counts.pending} sem marcar`);

  return el('p', { class: 'text-sm text-muted', text: parts.join(' · ') });
}

export function countStatuses(statusByStudent, totalStudents) {
  const counts = { present: 0, absent: 0, makeup: 0, pending: 0 };

  for (const status of statusByStudent.values()) {
    if (counts[status] !== undefined) counts[status] += 1;
  }
  counts.pending = Math.max(0, totalStudents - statusByStudent.size);
  return counts;
}
