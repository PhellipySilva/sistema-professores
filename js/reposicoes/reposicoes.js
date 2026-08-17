/* Reposições (spec, seção 21).
 *
 * Fluxo: aluno marcado como falta na chamada → atalho "Repor" → escolher a aula
 * de reposição entre as próximas → status vira 'scheduled'. Quando o aluno
 * aparece na chamada daquela aula e é marcado como presente, vira 'completed'.
 *
 * Sem data escolhida, a reposição fica 'pending' — o professor registra que
 * existe uma falta a repor e resolve a data depois.
 */

import { listUpcomingSessions } from '../api/sessions.js';
import { upsertMakeup } from '../api/makeups.js';
import { openFormModal } from '../components/modal.js';
import { selectField, textareaField } from '../components/form.js';
import { toast } from '../components/toast.js';
import { handleError } from '../app.js';
import { el } from '../utils/dom.js';
import { formatDateShortBR, formatTime, todayISO } from '../utils/dates.js';

/**
 * @param {string}   options.userId
 * @param {object}   options.student          aluno que faltou
 * @param {object}   options.originalSession  a aula em que ele faltou
 * @param {Function} options.onSaved          chamado após gravar
 */
export async function openMakeupModal({ userId, student, originalSession, onSaved }) {
  let sessions = [];

  try {
    sessions = await listUpcomingSessions(userId, todayISO());
  } catch (error) {
    handleError(error, 'Não foi possível carregar as aulas disponíveis.');
  }

  // A própria aula da falta não pode ser a reposição dela.
  const options = sessions
    .filter((session) => session.id !== originalSession.id)
    .map((session) => ({
      value: session.id,
      label: `${formatDateShortBR(session.session_date)} · ${formatTime(session.start_time)} · ${session.classes?.name ?? 'Turma'}`,
    }));

  const fields = [
    el('p', {
      class: 'text-sm text-muted',
      text: `${student.name} faltou em ${formatDateShortBR(originalSession.session_date)}.`,
    }),
    selectField({
      name: 'makeup_session_id',
      label: 'Aula da reposição',
      placeholder: options.length > 0 ? 'Escolher depois' : 'Nenhuma aula futura disponível',
      options,
      hint: 'Só aparecem aulas já abertas na agenda. Deixe em branco para decidir depois.',
    }),
    textareaField({
      name: 'notes',
      label: 'Observações',
      rows: 3,
      placeholder: 'Opcional',
    }),
  ];

  return openFormModal({
    title: 'Agendar reposição',
    fields,
    submitLabel: 'Salvar reposição',
    onSubmit: async (form) => {
      const makeupSessionId = form.elements.makeup_session_id.value || null;
      const notes = (form.elements.notes.value ?? '').trim() || null;

      const chosen = sessions.find((session) => session.id === makeupSessionId);

      try {
        await upsertMakeup(userId, {
          student_id: student.id,
          original_session_id: originalSession.id,
          original_date: originalSession.session_date,
          makeup_session_id: makeupSessionId,
          makeup_date: chosen?.session_date ?? null,
          status: makeupSessionId ? 'scheduled' : 'pending',
          notes,
        });
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível salvar a reposição. Tente novamente.'));
        throw error;
      }

      toast.success(makeupSessionId ? 'Reposição agendada.' : 'Reposição registrada como pendente.');
      await onSaved?.();
    },
  });
}

/** Usado pelo dashboard: quantas reposições estão em aberto. */
export function countOpenMakeups(makeups) {
  return makeups.filter((makeup) => makeup.status !== 'completed').length;
}
