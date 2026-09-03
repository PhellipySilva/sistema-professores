/* Lista de espera: a fila por turma e os avisos de vaga.
 *
 * As duas coisas moram na mesma tela de propósito. O aviso "abriu uma vaga na
 * turma X" só é útil ao lado de quem está esperando por ela — e a decisão de
 * chamar alguém é sempre do professor: nada aqui matricula ninguém sozinho.
 */

import { handleError, initPage } from '../app.js';
import { listClasses } from '../api/classes.js';
import {
  createWaitlistEntry,
  deleteWaitlistEntry,
  listNotifications,
  listWaitlist,
  markNotificationsSeen,
  updateNotificationStatus,
  updateWaitlistEntry,
} from '../api/waitlist.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { icon } from '../components/icons.js';
import { showLoading } from '../components/loading.js';
import { toast } from '../components/toast.js';
import { $, el, getQueryParam, render } from '../utils/dom.js';
import { formatDateShortBR, timestampToLocalISODate } from '../utils/dates.js';
import { formatPhone, whatsappLink } from '../utils/formatters.js';
import { groupWaitlistByClass, wantsClass } from './vagas.js';
import {
  interestBadges,
  notificationBadge,
  openWaitlistModal,
  vacancyCard,
  waitlistBadge,
  waitlistGroup,
} from './lista-espera-ui.js';
import { openStudentModal } from '../alunos/alunos-ui.js';
import { createStudentWithEnrollment } from '../alunos/cadastro.js';

const { user } = await initPage('lista-espera');

const content = $('#page-content');

/* ?class=<id> chega da página da turma: aquela fila sobe para o topo e já vem
   escolhida no formulário. */
const focusClassId = getQueryParam('class');

/* Estado da tela. A fila é pequena e cabe em memória, como em alunos e turmas. */
let entries = [];
let notifications = [];
let classes = [];

$('#page-actions').append(
  el('button', {
    type: 'button',
    class: 'btn btn--primary',
    html: `${icon('plus', 18)}<span>Adicionar pessoa</span>`,
    onclick: () => openCreate(),
  }),
);

await load();

/* ============================================================
   Carregamento
   ============================================================ */

async function load() {
  showLoading(content, 'Carregando lista de espera...');

  try {
    const [entryList, notificationList, classList] = await Promise.all([
      listWaitlist(user.id),
      listNotifications(user.id),
      listClasses(user.id),
    ]);

    entries = entryList;
    notifications = notificationList;
    classes = classList;

    renderPage();
    markNewAsSeen();
  } catch (error) {
    handleError(error, 'Não foi possível carregar a lista de espera.');
    render(content, errorState({ message: 'Não foi possível carregar a lista de espera.', onRetry: load }));
  }
}

/**
 * Marca as notificações novas como visualizadas — depois de desenhar a tela.
 *
 * A tela NÃO é redesenhada com o estado novo: nesta visita o aviso continua
 * marcado como "Nova", que é o que ele era quando o professor chegou. O selo
 * amarelo aparece na próxima vez que ele abrir a página. Falhar aqui não vira
 * erro visível: nada do que o professor pediu deixou de acontecer.
 */
function markNewAsSeen() {
  const ids = notifications.filter((item) => item.status === 'new').map((item) => item.id);
  if (ids.length === 0) return;

  markNotificationsSeen(user.id, ids).catch((error) => {
    handleError(error, 'Não foi possível marcar as notificações como visualizadas.');
  });
}

/* ============================================================
   Render
   ============================================================ */

function renderPage() {
  const open = notifications.filter((item) => item.status !== 'resolved');
  const resolved = notifications.filter((item) => item.status === 'resolved');

  // Quem já virou aluno ou saiu da fila não ocupa mais lugar nela — vai para o
  // histórico, para a numeração da fila continuar querendo dizer alguma coisa.
  const queue = entries.filter(
    (entry) => entry.status === 'waiting' || entry.status === 'contacted',
  );

  if (entries.length === 0 && open.length === 0) {
    render(content, [
      emptyState({
        iconName: 'bell',
        title: 'Ninguém na lista de espera.',
        message:
          'Cadastre quem quer entrar numa turma cheia. Quando um aluno sair dessa turma, o sistema avisa aqui.',
        actionLabel: 'Adicionar pessoa',
        onAction: () => openCreate(),
      }),
    ]);
    return;
  }

  render(content, [
    notificationsSection(open),
    peopleSection(queue),
    ...groupSections(queue),
    historySection(entries.filter((entry) => entry.status === 'enrolled' || entry.status === 'removed')),
    resolvedSection(resolved),
  ]);
}

/**
 * A lista por PESSOA, antes das filas por turma.
 *
 * As duas visões respondem a perguntas diferentes e por isso convivem: aqui o
 * professor vê "quem está esperando e por quais horários" — com os selos lado a
 * lado, uma linha por pessoa, sem ninguém repetido. Nas seções seguintes vê
 * "quem está na fila desta turma", que é a pergunta do momento em que abre uma
 * vaga, e ali a mesma pessoa aparece em cada fila de que participa.
 */
function peopleSection(queue) {
  if (queue.length === 0) return null;

  return el('section', { class: 'section section--waitlist' }, [
    el('h2', {
      class: 'section__title',
      text: `Pessoas na lista · ${queue.length}`,
    }),
    el('div', { class: 'card card--flush' }, queue.map((person) =>
      el('div', { class: 'list-item list-item--waitlist' }, [
        el('div', { class: 'stack-tight' }, [
          el('p', { class: 'list-item__title', text: person.name }),
          el('p', { class: 'list-item__meta', text: formatPhone(person.phone) }),
          interestBadges(person),
        ]),
        el('div', { class: 'row row--wrap list-item__actions' }, [
          waitlistBadge(person.status),
          el('a', {
            class: 'btn btn--ghost btn--icon',
            href: whatsappLink(person.phone),
            target: '_blank',
            rel: 'noopener',
            'aria-label': `Falar com ${person.name} no WhatsApp`,
            title: 'WhatsApp',
            html: icon('message', 18),
          }),
          el('button', {
            type: 'button',
            class: 'btn btn--ghost btn--icon',
            'aria-label': `Editar ${person.name}`,
            title: 'Editar horários de interesse',
            html: icon('edit', 18),
            onclick: () => openEdit(person),
          }),
        ]),
      ]),
    )),
  ]);
}

function notificationsSection(open) {
  if (open.length === 0) return null;

  const cards = open.map((notification) =>
    vacancyCard({
      notification,
      people: waitingFor(notification.class_id),
      onResolve: resolveNotification,
      onEnroll: (person) => openEnroll(person, notification.class_id),
    }),
  );

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: `Vagas disponíveis · ${open.length}` }),
    el('div', { class: 'grid-cards' }, cards),
  ]);
}

/**
 * A fila daquela turma, em ordem de chegada e só quem ainda espera.
 *
 * Com vários horários por pessoa, "estar na fila desta turma" deixou de ser uma
 * comparação de coluna e passou a ser uma pergunta sobre a lista de interesses
 * — quem marcou Seg/Qua E Sáb aparece nas duas filas.
 */
function waitingFor(classId) {
  return entries.filter((entry) => entry.status === 'waiting' && wantsClass(entry, classId));
}

function groupSections(queue) {
  const groups = groupWaitlistByClass(queue);

  // A turma de onde o professor veio aparece primeiro.
  groups.sort((a, b) => Number(b.classId === focusClassId) - Number(a.classId === focusClassId));

  if (groups.length === 0) {
    return [
      el('section', { class: 'section' }, [
        el('div', { class: 'card' }, [
          el('p', { class: 'text-muted text-sm', text: 'Ninguém aguardando vaga no momento.' }),
        ]),
      ]),
    ];
  }

  return groups.map((group) =>
    waitlistGroup(group, {
      onContact: markContacted,
      onEnroll: openEnroll,
      onEdit: openEdit,
      onRemove: confirmRemove,
    }),
  );
}

function historySection(past) {
  if (past.length === 0) return null;

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Histórico da lista' }),
    el('div', { class: 'card card--flush' }, past.slice(-10).reverse().map((entry) =>
      el('div', { class: 'list-item' }, [
        el('div', {}, [
          el('p', { class: 'list-item__title', text: entry.name }),
          el('p', {
            class: 'list-item__meta',
            text: `${entry.desired_slot} · ${formatPhone(entry.phone)}`,
          }),
        ]),
        el('span', {
          class: `badge badge--${entry.status === 'enrolled' ? 'success' : 'neutral'}`,
          text: entry.status === 'enrolled' ? 'Matriculada' : 'Saiu da fila',
        }),
      ]),
    )),
  ]);
}

function resolvedSection(resolved) {
  if (resolved.length === 0) return null;

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Avisos já resolvidos' }),
    el('div', { class: 'card card--flush' }, resolved.slice(0, 5).map((notification) =>
      el('div', { class: 'list-item' }, [
        el('div', {}, [
          el('p', { class: 'list-item__title', text: notification.classes?.name ?? 'Turma' }),
          el('p', {
            class: 'list-item__meta',
            text: `Vaga de ${formatDateShortBR(timestampToLocalISODate(notification.created_at))}`,
          }),
        ]),
        notificationBadge(notification.status),
      ]),
    )),
  ]);
}

/* ============================================================
   Ações da fila
   ============================================================ */

function openCreate() {
  openWaitlistModal({
    entry: null,
    classes,
    defaultClassId: focusClassId,
    onSave: async (payload) => {
      try {
        await createWaitlistEntry(user.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível adicionar à lista. Tente novamente.'));
        throw error;
      }
      toast.success('Pessoa adicionada à lista de espera.');
      await load();
    },
  });
}

function openEdit(person) {
  openWaitlistModal({
    entry: person,
    classes,
    onSave: async (payload) => {
      try {
        await updateWaitlistEntry(user.id, person.id, payload);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível salvar. Tente novamente.'));
        throw error;
      }
      toast.success('Dados atualizados.');
      await load();
    },
  });
}

async function markContacted(person) {
  try {
    await updateWaitlistEntry(user.id, person.id, { status: 'contacted' });
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível marcar como contatada.'));
    return;
  }
  toast.success(`${person.name} marcada como contatada.`);
  await load();
}

async function confirmRemove(person) {
  const confirmed = await confirmDialog({
    title: 'Remover da lista',
    message: `Remover ${person.name} da lista de espera? Esta ação não pode ser desfeita.`,
    confirmLabel: 'Remover',
  });

  if (!confirmed) return;

  try {
    await deleteWaitlistEntry(user.id, person.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível remover da lista. Tente novamente.'));
    return;
  }

  toast.success('Pessoa removida da lista de espera.');
  await load();
}

/* ============================================================
   Da fila para a turma
   ============================================================ */

/**
 * Transforma a pessoa da fila em aluno — sempre com o professor no comando.
 *
 * Reaproveita o MESMO formulário de cadastro de aluno, já preenchido com nome,
 * telefone e a turma desejada. Nada de um cadastro paralelo mais pobre: o aluno
 * que entra pela lista de espera nasce com categoria, mensalidade e vencimento
 * como qualquer outro.
 */
/**
 * @param {string} [classId]  turma pela qual a pessoa está sendo chamada — vem
 *                            do grupo da fila ou do aviso de vaga. Sem ela, a
 *                            primeira turma de interesse é a sugerida.
 */
function openEnroll(person, classId) {
  const targetClassId = resolveTargetClass(person, classId);

  openStudentModal({
    student: null,
    defaults: { name: person.name, phone: formatPhone(person.phone), classId: targetClassId },
    classes,
    onSave: async (payload, extras) => {
      let result;

      try {
        result = await createStudentWithEnrollment(user.id, payload, extras);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível cadastrar o aluno. Tente novamente.'));
        throw error;
      }

      for (const warning of result.warnings) {
        toast.error(handleError(warning.error, warning.message));
      }

      // A fila e o aviso são consequências do cadastro, não pré-requisitos: se
      // falharem, o aluno já existe e o professor ajusta na tela.
      try {
        await updateWaitlistEntry(user.id, person.id, {
          status: 'enrolled',
          student_id: result.student.id,
        });
        await resolveNotificationsOfClass(targetClassId);
      } catch (error) {
        handleError(error, 'Aluno cadastrado, mas a lista de espera não foi atualizada.');
      }

      toast.success(`${result.student.name} agora é aluno.`);
      await load();
    },
  });
}

/**
 * Qual turma está em jogo nesta matrícula.
 *
 * A tela sempre sabe o contexto (o grupo da fila ou o aviso de vaga), então o
 * primeiro parâmetro manda. Sem contexto, a primeira turma de interesse é o
 * palpite razoável — e o professor troca no formulário, que continua sendo o
 * mesmo cadastro de aluno de sempre.
 */
function resolveTargetClass(person, classId) {
  if (classId) return classId;
  return person.interests?.[0]?.class_id ?? null;
}

/* ============================================================
   Ações do aviso de vaga
   ============================================================ */

async function resolveNotification(notification) {
  try {
    await updateNotificationStatus(user.id, notification.id, 'resolved');
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível resolver o aviso. Tente novamente.'));
    return;
  }
  toast.success('Aviso resolvido.');
  await load();
}

/** A vaga foi preenchida: o aviso daquela turma não tem mais o que pedir. */
async function resolveNotificationsOfClass(classId) {
  if (!classId) return;

  const open = notifications.filter(
    (item) => item.class_id === classId && item.status !== 'resolved',
  );

  for (const notification of open) {
    await updateNotificationStatus(user.id, notification.id, 'resolved');
  }
}
