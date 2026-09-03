/* Interface da lista de espera: fila por turma, avisos de vaga e o formulário
 * de cadastro. Só monta HTML e lê formulário — nenhuma chamada ao Supabase. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { checkboxList, readCheckedValues, showFieldErrors, textField, textareaField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { formatCategory, formatPhone, normalizePhone, pluralize, whatsappLink } from '../utils/formatters.js';
import { formatDateShortBR, timestampToLocalISODate } from '../utils/dates.js';
import { validateName, validateContactPhone, validateRequired } from '../utils/validators.js';
import { scheduleShort, scheduleSummary } from '../turmas/turmas-ui.js';

/* ============================================================
   Selos
   ============================================================ */

const ENTRY_LABELS = {
  waiting: 'Aguardando',
  contacted: 'Contatada',
  enrolled: 'Matriculada',
  removed: 'Saiu da fila',
};

const ENTRY_VARIANTS = {
  waiting: 'info',
  contacted: 'warning',
  enrolled: 'success',
  removed: 'neutral',
};

export function waitlistBadge(status) {
  return el('span', {
    class: `badge badge--${ENTRY_VARIANTS[status] ?? 'neutral'}`,
    text: ENTRY_LABELS[status] ?? status,
  });
}

/* Os três estados pedidos pela funcionalidade: 🔴 Nova, 🟡 Visualizada,
   🟢 Resolvida. Aqui viram cor de badge, que é como o resto do sistema fala. */
const NOTIFICATION_LABELS = { new: 'Nova', seen: 'Visualizada', resolved: 'Resolvida' };
const NOTIFICATION_VARIANTS = { new: 'danger', seen: 'warning', resolved: 'success' };

export function notificationBadge(status) {
  return el('span', {
    class: `badge badge--${NOTIFICATION_VARIANTS[status] ?? 'neutral'}`,
    text: NOTIFICATION_LABELS[status] ?? status,
  });
}

/* ============================================================
   Horários de interesse
   ============================================================ */

/**
 * Os horários que interessam a uma pessoa, como selos: `Seg/Qua 18h`
 * `Ter/Qui 19h` `Sáb 09h`.
 *
 * Cada selo leva a cor do PRIMEIRO dia daquela turma — a mesma paleta dos chips
 * de dia do card da turma. É o que faz a linha "João Silva" contar, sem texto
 * nenhum, que ele aceita três horários diferentes.
 *
 * @param {object}  entry
 * @param {string}  [options.highlightClassId]  a turma do grupo em que a linha
 *                                              está sendo exibida
 */
export function interestBadges(entry, { highlightClassId } = {}) {
  const interests = entry.interests ?? [];

  if (interests.length === 0) {
    // Sem turma marcada, o que existe é o texto livre — e ele é a informação.
    return el('div', { class: 'day-badges' }, [
      el('span', { class: 'badge badge--neutral', text: entry.desired_slot }),
    ]);
  }

  return el('div', { class: 'day-badges' }, interests.map((interest) => {
    const day = interest.class_schedules?.[0]?.day_of_week;
    const label = scheduleShort(interest.class_schedules) || interest.name;
    const isCurrent = highlightClassId && interest.class_id === highlightClassId;

    return el('span', {
      class: [
        'badge badge--day',
        day === undefined ? 'badge--neutral' : `day-${day}`,
        isCurrent ? 'badge--current' : '',
      ].filter(Boolean).join(' '),
      text: label,
      title: `${interest.name} · ${scheduleSummary(interest.class_schedules ?? [])}`,
    });
  }));
}

/* ============================================================
   Aviso de vaga
   ============================================================ */

/**
 * Card de uma vaga aberta.
 *
 * As pessoas NÃO vêm gravadas na notificação: chegam aqui como parâmetro, lidas
 * da fila no momento de exibir. Assim quem entrou na lista depois do aviso
 * aparece nele, e quem já foi matriculado some — sem nada para sincronizar.
 *
 * O card não matricula ninguém sozinho. Ele mostra a fila daquela turma em
 * ordem de chegada, com o telefone e o WhatsApp de cada um à mão, e oferece os
 * caminhos: falar, matricular ou marcar o aviso como resolvido.
 *
 * @param {object}   options.notification  com `classes` embutido
 * @param {object[]} options.people        fila atual daquela turma, em ordem
 */
export function vacancyCard({ notification, people, onResolve, onEnroll }) {
  const className = notification.classes?.name ?? 'Turma';

  const header = el('div', { class: 'card__header' }, [
    el('div', { class: 'stack-tight' }, [
      el('h3', { class: 'card__title', text: `Vaga aberta · ${className}` }),
      el('p', {
        class: 'card__meta',
        text: [
          notification.student_name ? `${notification.student_name} saiu da turma` : 'Vaga aberta',
          `aviso de ${formatDateShortBR(timestampToLocalISODate(notification.created_at))}`,
        ].join(' · '),
      }),
    ]),
    notificationBadge(notification.status),
  ]);

  const body = people.length === 0
    ? el('p', {
        class: 'text-muted text-sm',
        text: 'Ninguém na fila desta turma agora — a vaga pode ser oferecida a qualquer aluno.',
      })
    : el('div', { class: 'vacancy-people' }, people.slice(0, 5).map((person, index) =>
        // list-item--waitlist é o gancho do celular: a linha vira duas, dados em
        // cima e ações embaixo (ver css/responsive.css). No computador nada muda.
        el('div', { class: 'list-item list-item--waitlist' }, [
          el('div', { class: 'stack-tight' }, [
            el('p', { class: 'list-item__title', text: `${index + 1}º · ${person.name}` }),
            el('p', { class: 'list-item__meta', text: formatPhone(person.phone) }),
            // Quem espera por mais de um horário aparece com todos eles: ajuda a
            // decidir a quem oferecer a vaga primeiro.
            (person.interests ?? []).length > 1
              ? interestBadges(person, { highlightClassId: notification.class_id })
              : null,
          ]),
          el('div', { class: 'row row--wrap list-item__actions' }, [
            el('a', {
              class: 'btn btn--secondary btn--sm',
              href: whatsappLink(person.phone),
              target: '_blank',
              rel: 'noopener',
              html: `${icon('message', 16)}<span class="btn__label">WhatsApp</span>`,
              'aria-label': `Falar com ${person.name} no WhatsApp`,
            }),
            el('button', {
              type: 'button',
              class: 'btn btn--primary btn--sm',
              text: 'Matricular',
              onclick: () => onEnroll(person, notification),
            }),
          ]),
        ]),
      ));

  const footer = [];

  if (people.length > 5) {
    footer.push(
      el('p', {
        class: 'card__meta',
        text: `Mais ${pluralize('pessoa aguardando', 'pessoas aguardando', people.length - 5)} nesta turma.`,
      }),
    );
  }

  footer.push(
    el('button', {
      type: 'button',
      class: 'btn btn--ghost btn--sm',
      html: `${icon('check', 16)}<span>Marcar como resolvida</span>`,
      onclick: () => onResolve(notification),
    }),
  );

  return el('article', { class: 'card card--alert' }, [
    header,
    body,
    el('div', { class: 'card__footer' }, footer),
  ]);
}

/* ============================================================
   Fila por turma
   ============================================================ */

/**
 * Um grupo da fila: o horário desejado no cabeçalho e as pessoas numeradas
 * pela ordem de chegada.
 *
 * @param {object} group  { label, slot, classId, schedules, people } — de groupWaitlistByClass
 */
export function waitlistGroup(group, { onContact, onEnroll, onEdit, onRemove }) {
  const waitingCount = group.people.filter((person) => person.status === 'waiting').length;
  const subtitle = group.classId ? scheduleSummary(group.schedules ?? []) : group.slot;

  const header = el('div', { class: 'row-between section__header' }, [
    el('div', {}, [
      el('h2', { class: 'section__title', text: `Lista de espera — ${group.label}` }),
      el('p', {
        class: 'text-muted text-sm',
        text: `${subtitle} · ${pluralize('pessoa aguardando', 'pessoas aguardando', waitingCount)}`,
      }),
    ]),
    group.classId
      ? el('a', {
          class: 'btn btn--ghost btn--sm',
          href: `/pages/turma.html?id=${group.classId}`,
          text: 'Ver turma',
        })
      : null,
  ]);

  const rows = group.people.map((person) => {
    const meta = [
      formatPhone(person.phone),
      `entrou em ${formatDateShortBR(timestampToLocalISODate(person.created_at))}`,
    ];

    const actions = [
      el('a', {
        class: 'btn btn--ghost btn--icon',
        href: whatsappLink(person.phone),
        target: '_blank',
        rel: 'noopener',
        'aria-label': `Falar com ${person.name} no WhatsApp`,
        title: 'WhatsApp',
        html: icon('message', 18),
      }),
    ];

    // Já matriculada ou fora da fila não recebe mais ações de fila: o que
    // sobra é o registro do que aconteceu.
    if (person.status === 'waiting' || person.status === 'contacted') {
      if (person.status === 'waiting') {
        actions.push(
          el('button', {
            type: 'button',
            class: 'btn btn--ghost btn--icon',
            'aria-label': `Marcar ${person.name} como contatada`,
            title: 'Marcar como contatada',
            html: icon('check', 18),
            onclick: () => onContact(person),
          }),
        );
      }

      actions.push(
        el('button', {
          type: 'button',
          class: 'btn btn--ghost btn--sm',
          text: 'Matricular',
          onclick: () => onEnroll(person, group.classId),
        }),
      );
    }

    actions.push(
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Editar ${person.name}`,
        title: 'Editar',
        html: icon('edit', 18),
        onclick: () => onEdit(person),
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Remover ${person.name} da lista`,
        title: 'Remover da lista',
        html: icon('trash', 18),
        onclick: () => onRemove(person),
      }),
    );

    return el('div', { class: 'list-item list-item--waitlist' }, [
      el('div', { class: 'stack-tight' }, [
        el('p', { class: 'list-item__title', text: `${person.position}º · ${person.name}` }),
        el('p', { class: 'list-item__meta', text: meta.join(' · ') }),
        // O selo do horário deste grupo vem destacado; os outros mostram que a
        // pessoa também aceita outras turmas.
        interestBadges(person, { highlightClassId: group.classId }),
        person.notes ? el('p', { class: 'list-item__meta', text: person.notes }) : null,
      ]),
      el('div', { class: 'row row--wrap list-item__actions' }, [
        waitlistBadge(person.status),
        el('div', { class: 'row row--wrap' }, actions),
      ]),
    ]);
  });

  return el('section', { class: 'section section--waitlist' }, [
    header,
    el('div', { class: 'card card--flush' }, rows),
  ]);
}

/* ============================================================
   Modal de cadastro / edição
   ============================================================ */

/**
 * @param {object|null} options.entry    null = nova pessoa
 * @param {object[]}    options.classes  turmas, para as caixas de horário
 * @param {string}      [options.defaultClassId]
 * @param {Function}    options.onSave   async ({ name, phone, class_ids, desired_slot, notes })
 *
 * VÁRIAS TURMAS, NÃO UMA
 *
 *   O campo é uma lista de caixas de seleção: a mesma pessoa marca quantos
 *   horários aceitar, e continua podendo marcar um só — ou nenhum, descrevendo
 *   o que quer no campo de texto abaixo. Duplicar a mesma turma é impossível:
 *   uma caixa marcada duas vezes não existe, e o banco tem a constraint
 *   `waitlist_entry_classes_unique` como garantia final.
 */
export function openWaitlistModal({ entry, classes, defaultClassId, onSave }) {
  const isEdit = Boolean(entry);

  const initialIds = entry
    ? entry.class_ids ?? []
    : (defaultClassId ? [defaultClassId] : []);

  const classField = checkboxList({
    name: 'class_ids',
    label: 'Turmas / horários de interesse',
    options: classes.map((turma) => ({
      value: turma.id,
      label: turma.name,
      meta: `${formatCategory(turma.category)} · ${scheduleSummary(turma.class_schedules ?? [])}`,
    })),
    values: initialIds,
    hint: 'Marque todos os horários que servem. É o que permite avisar esta pessoa quando abrir vaga em qualquer um deles.',
    emptyMessage: 'Nenhuma turma cadastrada ainda. Descreva o horário desejado no campo abaixo.',
  });

  const slotField = textField({
    name: 'desired_slot',
    label: 'Horário desejado (texto)',
    value: entry?.desired_slot ?? describeClasses(classes, initialIds),
    placeholder: 'Ex.: Terça e Quinta — 18h',
    required: true,
    hint: 'Preenchido a partir das turmas marcadas. Continua legível mesmo se uma turma for excluída depois.',
  });

  /* O texto acompanha as turmas marcadas — mas só enquanto o professor não
     escrever o dele. Uma vez editado à mão, o campo é dele. */
  const slotInput = slotField.querySelector('input');
  let slotTouched = isEdit;

  slotInput.addEventListener('input', () => {
    slotTouched = true;
  });

  classField.addEventListener('change', () => {
    if (slotTouched && slotInput.value.trim() !== '') return;
    slotInput.value = describeClasses(classes, readCheckedValues(classField, 'class_ids'));
  });

  const fields = [
    textField({
      name: 'name',
      label: 'Nome completo',
      value: entry?.name ?? '',
      placeholder: 'Ex.: João Silva',
      autocomplete: 'name',
      required: true,
    }),
    textField({
      name: 'phone',
      label: 'Telefone / WhatsApp',
      type: 'tel',
      value: entry?.phone ? formatPhone(entry.phone) : '',
      placeholder: '(82) 99999-9999',
      inputmode: 'tel',
      autocomplete: 'tel',
      required: true,
    }),
    classField,
    slotField,
    textareaField({
      name: 'notes',
      label: 'Observação',
      value: entry?.notes ?? '',
      placeholder: 'Ex.: deseja começar assim que surgir uma vaga.',
      rows: 3,
    }),
  ];

  return openFormModal({
    title: isEdit ? 'Editar pessoa da lista' : 'Adicionar à lista de espera',
    fields,
    submitLabel: isEdit ? 'Salvar alterações' : 'Adicionar',
    onSubmit: async (form) => {
      const get = (name) => (form.elements[name]?.value ?? '').trim();

      const name = get('name');
      const phone = get('phone');
      const classIds = readCheckedValues(form, 'class_ids');
      const desiredSlot = get('desired_slot');
      const notes = get('notes');

      const errors = {
        name: validateName(name),
        phone: validateContactPhone(phone),
        desired_slot: validateRequired(desiredSlot, 'O horário desejado'),
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      await onSave({
        name,
        phone: normalizePhone(phone),
        class_ids: classIds,
        desired_slot: desiredSlot,
        notes: notes || null,
      });
    },
  });
}

/** 'Kids Iniciante (Seg/Qua 17h) · Adulto Noite (Ter/Qui 19h)' */
function describeClasses(classes, classIds) {
  const chosen = (classIds ?? [])
    .map((id) => classes.find((candidate) => candidate.id === id))
    .filter(Boolean);

  if (chosen.length === 0) return '';

  return chosen
    .map((turma) => {
      const short = scheduleShort(turma.class_schedules ?? []);
      return short ? `${turma.name} (${short})` : turma.name;
    })
    .join(' · ');
}
