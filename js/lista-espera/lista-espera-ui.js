/* Interface da lista de espera: fila por turma, avisos de vaga e o formulário
 * de cadastro. Só monta HTML e lê formulário — nenhuma chamada ao Supabase. */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { selectField, showFieldErrors, textField, textareaField } from '../components/form.js';
import { openFormModal } from '../components/modal.js';
import { formatCategory, formatPhone, normalizePhone, pluralize, whatsappLink } from '../utils/formatters.js';
import { formatDateShortBR, timestampToLocalISODate } from '../utils/dates.js';
import { validateName, validateContactPhone, validateRequired } from '../utils/validators.js';
import { scheduleSummary } from '../turmas/turmas-ui.js';

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
   Aviso de vaga
   ============================================================ */

/**
 * Card de uma vaga aberta.
 *
 * As pessoas NÃO vêm gravadas na notificação: chegam aqui como parâmetro, lidas
 * da fila no momento de exibir. Assim quem entrou na lista depois do aviso
 * aparece nele, e quem já foi matriculado some — sem nada para sincronizar.
 *
 * O card não matricula ninguém sozinho. Ele mostra quem é a primeira opção e
 * oferece os caminhos: falar no WhatsApp, marcar como resolvida, ou abrir o
 * cadastro do aluno já preenchido.
 *
 * @param {object}   options.notification  com `classes` embutido
 * @param {object[]} options.people        fila atual daquela turma, em ordem
 */
export function vacancyCard({ notification, people, onResolve, onEnroll }) {
  const className = notification.classes?.name ?? 'Turma';
  const first = people[0];

  const header = el('div', { class: 'card__header' }, [
    el('div', {}, [
      el('h3', { class: 'card__title', text: `Nova vaga · ${className}` }),
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

  const body = first
    ? el('div', { class: 'info-list' }, [
        el('div', { class: 'info-row' }, [
          el('span', { class: 'info-row__label', text: 'Primeira da fila' }),
          el('span', { class: 'info-row__value', text: first.name }),
        ]),
        el('div', { class: 'info-row' }, [
          el('span', { class: 'info-row__label', text: 'Telefone' }),
          el('span', { class: 'info-row__value', text: formatPhone(first.phone) }),
        ]),
        people.length > 1
          ? el('p', {
              class: 'card__meta',
              text: `Mais ${pluralize('pessoa aguardando', 'pessoas aguardando', people.length - 1)} nesta turma.`,
            })
          : null,
      ])
    : el('p', {
        class: 'text-muted text-sm',
        text: 'Ninguém na fila desta turma agora — a vaga pode ser oferecida a qualquer aluno.',
      });

  const actions = [];

  if (first) {
    actions.push(
      el('a', {
        class: 'btn btn--secondary btn--sm',
        href: whatsappLink(first.phone),
        target: '_blank',
        rel: 'noopener',
        html: `${icon('message', 16)}<span>WhatsApp</span>`,
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--primary btn--sm',
        text: 'Adicionar à turma',
        onclick: () => onEnroll(first, notification),
      }),
    );
  }

  actions.push(
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
    el('div', { class: 'card__footer' }, actions),
  ]);
}

/* ============================================================
   Fila por turma
   ============================================================ */

/**
 * Um grupo da fila: o horário desejado no cabeçalho e as pessoas numeradas
 * pela ordem de chegada.
 *
 * @param {object} group  { label, slot, classId, people } — de groupWaitlistByClass
 */
export function waitlistGroup(group, { onContact, onEnroll, onEdit, onRemove }) {
  const waitingCount = group.people.filter((person) => person.status === 'waiting').length;

  const header = el('div', { class: 'row-between section__header' }, [
    el('div', {}, [
      el('h2', { class: 'section__title', text: `Lista de espera — ${group.label}` }),
      el('p', { class: 'text-muted text-sm', text: `${group.slot} · ${pluralize('pessoa aguardando', 'pessoas aguardando', waitingCount)}` }),
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
          onclick: () => onEnroll(person),
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

    return el('div', { class: 'list-item' }, [
      el('div', {}, [
        el('p', { class: 'list-item__title', text: `${person.position}º · ${person.name}` }),
        el('p', { class: 'list-item__meta', text: meta.join(' · ') }),
        person.notes ? el('p', { class: 'list-item__meta', text: person.notes }) : null,
      ]),
      el('div', { class: 'row' }, [waitlistBadge(person.status), el('div', { class: 'row' }, actions)]),
    ]);
  });

  return el('section', { class: 'section' }, [
    header,
    el('div', { class: 'card card--flush' }, rows),
  ]);
}

/* ============================================================
   Modal de cadastro / edição
   ============================================================ */

/**
 * @param {object|null} options.entry    null = nova pessoa
 * @param {object[]}    options.classes  turmas, para o select de horário desejado
 * @param {string}      [options.defaultClassId]
 * @param {Function}    options.onSave   async ({ name, phone, class_id, desired_slot, notes })
 */
export function openWaitlistModal({ entry, classes, defaultClassId, onSave }) {
  const isEdit = Boolean(entry);
  const initialClassId = entry?.class_id ?? defaultClassId ?? '';

  const classField = selectField({
    name: 'class_id',
    label: 'Turma desejada',
    placeholder: 'Outro horário',
    options: classes.map((turma) => ({
      value: turma.id,
      label: `${turma.name} · ${formatCategory(turma.category)}`,
    })),
    value: initialClassId,
    hint: 'Vincular à turma é o que permite avisar esta pessoa quando abrir uma vaga nela.',
  });

  const slotField = textField({
    name: 'desired_slot',
    label: 'Horário desejado',
    value: entry?.desired_slot ?? describeClass(classes, initialClassId),
    placeholder: 'Ex.: Terça e Quinta — 18h',
    required: true,
    hint: 'Preenchido a partir da turma escolhida. Continua legível mesmo se a turma mudar depois.',
  });

  /* O texto do horário acompanha a turma escolhida — mas só enquanto o
     professor não escrever o dele. Uma vez editado à mão, o campo é dele. */
  const classSelect = classField.querySelector('select');
  const slotInput = slotField.querySelector('input');
  let slotTouched = isEdit;

  slotInput.addEventListener('input', () => {
    slotTouched = true;
  });

  classSelect.addEventListener('change', () => {
    if (slotTouched && slotInput.value.trim() !== '') return;
    slotInput.value = describeClass(classes, classSelect.value);
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
      const classId = get('class_id');
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
        class_id: classId || null,
        desired_slot: desiredSlot,
        notes: notes || null,
      });
    },
  });
}

/** 'Kids Iniciante · Segunda e Quarta · 17:00 · 60 min' */
function describeClass(classes, classId) {
  const turma = classes.find((candidate) => candidate.id === classId);
  if (!turma) return '';

  return `${turma.name} · ${scheduleSummary(turma.class_schedules ?? [])}`;
}
