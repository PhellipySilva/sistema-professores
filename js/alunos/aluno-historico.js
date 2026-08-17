/* Históricos exibidos no perfil do aluno: frequência e reposições.
 * Só monta HTML — os dados chegam prontos de aluno.js. */

import { el } from '../utils/dom.js';
import { formatDateBR, monthKey, monthLabel } from '../utils/dates.js';
import { formatPercent, pluralize } from '../utils/formatters.js';

/* ============================================================
   Frequência (spec, seção 20)
   ============================================================ */

const ATTENDANCE_LABELS = {
  present: 'Presente',
  absent: 'Falta',
  makeup: 'Reposição',
};

const ATTENDANCE_VARIANTS = {
  present: 'success',
  absent: 'danger',
  makeup: 'info',
};

/**
 * Agrupa a frequência por mês e calcula o percentual.
 * A reposição conta como presença: o aluno assistiu à aula, em outra data.
 */
export function summarizeAttendanceByMonth(records) {
  const byMonth = new Map();

  for (const record of records) {
    const date = record.class_sessions?.session_date;
    if (!date) continue;

    const key = monthKey(date);
    if (!byMonth.has(key)) {
      byMonth.set(key, { month: key, total: 0, present: 0, absent: 0, makeup: 0 });
    }

    const bucket = byMonth.get(key);
    bucket.total += 1;
    bucket[record.status] += 1;
  }

  return [...byMonth.values()]
    .map((bucket) => ({
      ...bucket,
      ratio: bucket.total === 0 ? null : (bucket.present + bucket.makeup) / bucket.total,
    }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function attendanceHistorySection(records) {
  const months = summarizeAttendanceByMonth(records);

  const body = months.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Nenhuma aula registrada ainda.' })]
    : months.map((month) =>
        el('div', { class: 'list-item' }, [
          el('div', {}, [
            el('p', { class: 'list-item__title', text: monthLabel(`${month.month}-01`) }),
            el('p', {
              class: 'list-item__meta',
              text: [
                pluralize('aula', 'aulas', month.total),
                `${month.present} presente${month.present === 1 ? '' : 's'}`,
                `${month.absent} falta${month.absent === 1 ? '' : 's'}`,
                month.makeup > 0 ? `${month.makeup} reposição` : null,
              ]
                .filter(Boolean)
                .join(' · '),
            }),
          ]),
          el('span', {
            class: `badge badge--${month.ratio >= 0.75 ? 'success' : 'warning'}`,
            text: formatPercent(month.ratio),
          }),
        ]),
      );

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Frequência' }),
    el('div', { class: 'card card--flush' }, body),
  ]);
}

export function attendanceBadge(status) {
  return el('span', {
    class: `badge badge--${ATTENDANCE_VARIANTS[status] ?? 'neutral'}`,
    text: ATTENDANCE_LABELS[status] ?? status,
  });
}

/* ============================================================
   Reposições (spec, seção 21)
   ============================================================ */

const MAKEUP_LABELS = {
  pending: 'A agendar',
  scheduled: 'Agendada',
  completed: 'Concluída',
};

const MAKEUP_VARIANTS = {
  pending: 'warning',
  scheduled: 'info',
  completed: 'success',
};

export function makeupBadge(status) {
  return el('span', {
    class: `badge badge--${MAKEUP_VARIANTS[status] ?? 'neutral'}`,
    text: MAKEUP_LABELS[status] ?? status,
  });
}

export function makeupHistorySection(makeups) {
  const body = makeups.length === 0
    ? [el('p', { class: 'text-muted text-sm', text: 'Nenhuma reposição registrada.' })]
    : makeups.map((makeup) =>
        el('div', { class: 'list-item' }, [
          el('div', {}, [
            el('p', {
              class: 'list-item__title',
              text: `Falta em ${formatDateBR(makeup.original_date)}`,
            }),
            el('p', {
              class: 'list-item__meta',
              text: makeup.makeup_date
                ? `Repõe em ${formatDateBR(makeup.makeup_date)}`
                : 'Data da reposição ainda não definida',
            }),
          ]),
          makeupBadge(makeup.status),
        ]),
      );

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Reposições' }),
    el('div', { class: 'card card--flush' }, body),
  ]);
}
