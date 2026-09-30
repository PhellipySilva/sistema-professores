/* Troca de turma: tirar o aluno de uma turma e colocá-lo em outra num passo só.
 *
 * Antes, o professor fazia isso em duas telas — remover aqui, adicionar lá — e
 * no meio do caminho o aluno ficava sem turma. Aqui é a mesma operação, com as
 * mesmas regras, num único modal:
 *
 *   - turma cheia não recebe ninguém (a lotação é conferida de novo no servidor
 *     na hora de confirmar, porque a lista pode ter ficado velha);
 *   - quem já está na turma de destino não aparece como opção;
 *   - a saída da turma antiga dispara o aviso da lista de espera, igual a
 *     qualquer outra remoção (ver lista-espera/notificacoes.js).
 */

import { handleError } from '../app.js';
import { countActiveStudents, listClasses, transferStudent } from '../api/classes.js';
import { icon } from '../components/icons.js';
import { openFormModal, openModal } from '../components/modal.js';
import { showFieldErrors } from '../components/form.js';
import { toast } from '../components/toast.js';
import { el } from '../utils/dom.js';
import { formatFreeSlots, formatOccupancy, isFull } from '../lista-espera/vagas.js';
import { notifyVacancy } from '../lista-espera/notificacoes.js';
import { scheduleSummary, sortClassesByTime } from './turmas-ui.js';

/**
 * Menu que abre ao tocar no nome do aluno dentro de uma turma.
 *
 * @param {string}   options.userId
 * @param {object}   options.student   precisa de id e name
 * @param {object}   options.turma     turma atual (id, name, capacity)
 * @param {Function} options.onChanged chamado depois de uma troca concluída
 */
export function openStudentMenu({ userId, student, turma, onChanged }) {
  const option = ({ iconName, label, meta, onclick, href }) =>
    el(href ? 'a' : 'button', {
      ...(href ? { href } : { type: 'button', onclick }),
      class: href ? 'list-item' : 'list-item list-item--button',
    }, [
      el('div', { class: 'row' }, [
        el('span', { class: 'menu-option__icon', html: icon(iconName, 18) }),
        el('div', {}, [
          el('p', { class: 'list-item__title', text: label }),
          el('p', { class: 'list-item__meta', text: meta }),
        ]),
      ]),
      el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
    ]);

  const modal = openModal({
    title: student.name,
    content: el('div', { class: 'card card--flush' }, [
      option({
        iconName: 'users',
        label: 'Trocar de turma',
        meta: `Sai de ${turma.name} e entra em outra turma`,
        onclick: () => {
          modal.close();
          openTransferModal({ userId, student, fromClass: turma, onDone: onChanged });
        },
      }),
      option({
        iconName: 'user',
        label: 'Ver perfil do aluno',
        meta: 'Cadastro, turmas e histórico',
        href: `/pages/aluno.html?id=${student.id}`,
      }),
    ]),
  });

  return modal;
}

/**
 * Escolha da turma de destino e confirmação da troca.
 *
 * @param {object}   options.fromClass  turma atual (id, name, capacity)
 * @param {Function} [options.onDone]   chamado depois da troca, para a tela recarregar
 */
export async function openTransferModal({ userId, student, fromClass, onDone }) {
  let classes;

  try {
    // Busca na hora: a lotação que decide quem pode receber o aluno precisa ser
    // a de agora, não a da tela que foi carregada há dez minutos.
    classes = await listClasses(userId);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível carregar as turmas.'));
    return null;
  }

  const candidates = sortClassesByTime(classes.filter((turma) => turma.id !== fromClass.id));

  const rows = candidates.map((turma) => {
    const alreadyIn = (turma.students ?? []).some((enrolled) => enrolled.id === student.id);
    const full = isFull(turma.capacity, turma.student_count);
    const disabled = alreadyIn || full;

    const status = alreadyIn
      ? el('span', { class: 'badge badge--neutral', text: 'Já está nesta turma' })
      : el('span', {
          class: `badge badge--${full ? 'warning' : 'success'}`,
          text: formatFreeSlots(turma.capacity, turma.student_count),
        });

    const input = el('input', {
      type: 'radio',
      class: 'picker__checkbox',
      name: 'target_class',
      value: turma.id,
      disabled: disabled ? '' : null,
    });

    const row = el('label', {
      class: `picker__row${disabled ? ' picker__row--disabled' : ''}`,
    }, [
      el('span', { class: 'picker__main' }, [
        input,
        el('span', {}, [
          el('span', { class: 'picker__name', text: turma.name }),
          el('span', { class: 'picker__meta', text: scheduleSummary(turma.class_schedules ?? []) }),
          el('span', { class: 'picker__meta', text: formatOccupancy(turma.student_count, turma.capacity) }),
        ]),
      ]),
      status,
    ]);

    return row;
  });

  const list = el('div', { class: 'picker__list' }, rows);

  // Destaca a linha escolhida, como o seletor de alunos faz com as marcadas.
  list.addEventListener('change', () => {
    for (const row of list.querySelectorAll('.picker__row')) {
      row.classList.toggle('picker__row--on', Boolean(row.querySelector('input:checked')));
    }
  });

  const fields = [
    el('p', {
      class: 'text-sm text-muted',
      text: `${student.name} sai de ${fromClass.name} e entra na turma escolhida, em todos os dias dela.`,
    }),
    el('div', { class: 'field' }, [
      el('span', { class: 'field__label', text: 'Nova turma' }),
      rows.length > 0
        ? list
        : el('p', { class: 'field__hint', text: 'Você não tem outra turma para onde mover este aluno.' }),
      el('p', { class: 'field__error hidden', id: 'field-target_class-error', role: 'alert' }),
    ]),
  ];

  return openFormModal({
    title: 'Trocar de turma',
    fields,
    submitLabel: 'Confirmar troca',
    onSubmit: async (form) => {
      const targetId = form.querySelector('input[name="target_class"]:checked')?.value ?? '';
      const target = candidates.find((turma) => turma.id === targetId);

      if (showFieldErrors(form, { target_class: target ? null : 'Escolha a nova turma.' })) {
        throw new Error('validação');
      }

      try {
        // Segunda conferência, no servidor: outra aba pode ter ocupado a vaga
        // entre abrir o modal e confirmar.
        const activeNow = await countActiveStudents(userId, target.id);
        if (isFull(target.capacity, activeNow)) {
          toast.error(`A turma ${target.name} ficou sem vagas. Escolha outra.`);
          throw new Error('turma cheia');
        }

        await transferStudent(userId, student.id, fromClass.id, target.id);
      } catch (error) {
        if (error.message !== 'turma cheia') {
          toast.error(handleError(error, 'Não foi possível trocar o aluno de turma. Tente novamente.'));
        }
        throw error;
      }

      toast.success(`${student.name} agora está na turma ${target.name}.`);

      // A troca já deu certo. O aviso de vaga da turma antiga é consequência,
      // e a falha dele não pode parecer que a troca foi desfeita.
      try {
        const notification = await notifyVacancy(userId, { turma: fromClass, studentName: student.name });
        if (notification) toast.info(`Vaga aberta em ${fromClass.name}: há gente na lista de espera.`);
      } catch (error) {
        handleError(error, 'Não foi possível avisar a lista de espera.');
      }

      await onDone?.();
    },
  });
}
