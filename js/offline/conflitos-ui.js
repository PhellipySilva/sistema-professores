/* Tela dos conflitos de sincronização.
 *
 * Aparece só quando existe um: uma alteração feita offline encontrou a linha
 * mudada no servidor. Nada foi gravado ainda — esta é a hora de o professor
 * dizer qual das duas versões vale.
 *
 * Duas saídas, nenhuma delas automática:
 *   "Manter o do servidor" → descarta a alteração local.
 *   "Enviar a minha"       → grava a local por cima, agora como decisão tomada.
 */

import { el } from '../utils/dom.js';
import { openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { listConflicts, removeConflict } from './outbox.js';
import { forceAttendance } from './sync.js';

/* Um modal por vez: a revisão é disparada na abertura da página E ao fim de
   cada sincronização, e dois diálogos empilhados pediriam a mesma decisão duas
   vezes. */
let modalOpen = false;

const STATUS_LABELS = {
  present: 'Presente',
  absent: 'Falta',
  makeup: 'Reposição',
};

function describeStatus(status) {
  if (!status) return 'Sem marcação';
  return STATUS_LABELS[status] ?? status;
}

/** Abre o modal se houver conflitos pendentes. Silencioso quando não há. */
export async function reviewConflicts(userId) {
  if (modalOpen) return;

  const conflicts = await listConflicts(userId);
  if (conflicts.length === 0) return;

  modalOpen = true;
  openConflictModal(userId, conflicts);
}

function openConflictModal(userId, conflicts) {
  const list = el('div', { class: 'stack' });

  const modal = openModal({
    onClose: () => {
      modalOpen = false;
    },
    title: conflicts.length === 1 ? 'Uma alteração precisa da sua decisão' : `${conflicts.length} alterações precisam da sua decisão`,
    content: [
      el('p', { class: 'text-sm text-muted' }, [
        'Estas alterações foram feitas sem internet e, enquanto isso, a mesma ' +
          'informação mudou no servidor. Nada foi sobrescrito.',
      ]),
      list,
    ],
    actions: [
      el('button', {
        type: 'button',
        class: 'btn btn--secondary',
        text: 'Fechar',
        onclick: () => modal.close(),
      }),
    ],
  });

  const remaining = new Map(conflicts.map((conflict) => [conflict.key, conflict]));

  const renderList = () => {
    list.replaceChildren(
      ...[...remaining.values()].map((conflict) => conflictRow(conflict, async (choice) => {
        try {
          await resolve(userId, conflict, choice);
        } catch (error) {
          toast.error('Não foi possível aplicar a escolha. Tente de novo quando estiver online.');
          console.error('[offline] falha ao resolver conflito', error);
          return;
        }

        remaining.delete(conflict.key);
        toast.success(choice === 'local' ? 'Sua versão foi enviada.' : 'A versão do servidor foi mantida.');

        if (remaining.size === 0) modal.close();
        else renderList();
      })),
    );
  };

  renderList();
}

function conflictRow(conflict, onChoose) {
  return el('div', { class: 'card card--alert' }, [
    el('p', { class: 'card__title', text: conflict.label ?? 'Frequência' }),
    el('div', { class: 'info-list' }, [
      el('div', { class: 'info-row' }, [
        el('span', { class: 'info-row__label', text: 'No servidor' }),
        el('span', { class: 'info-row__value', text: describeStatus(conflict.remote?.status) }),
      ]),
      el('div', { class: 'info-row' }, [
        el('span', { class: 'info-row__label', text: 'No seu aparelho' }),
        el('span', {
          class: 'info-row__value',
          text: conflict.local?.op === 'delete'
            ? 'Marcação removida'
            : describeStatus(conflict.local?.status),
        }),
      ]),
    ]),
    el('div', { class: 'card__footer' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--secondary btn--sm',
        text: 'Manter o do servidor',
        onclick: () => onChoose('remote'),
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--primary btn--sm',
        text: 'Enviar a minha',
        onclick: () => onChoose('local'),
      }),
    ]),
  ]);
}

async function resolve(userId, conflict, choice) {
  if (choice === 'local') {
    await forceAttendance({
      userId,
      match: conflict.match,
      op: conflict.local?.op ?? 'upsert',
      status: conflict.local?.status,
    });
  }
  await removeConflict(conflict.key);
}
