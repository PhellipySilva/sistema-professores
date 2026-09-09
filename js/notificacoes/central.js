/* Central de notificações — o sininho da topbar.
 *
 * É a contraparte do push DENTRO do sistema: o aviso que chegou às 8h da manhã
 * e foi dispensado sem querer continua aqui, com a mesma frase que apareceu na
 * tela bloqueada. Sem isto, um aviso perdido é um aviso que nunca existiu.
 *
 * Ela NÃO recalcula nada. Lê `payment_notifications`, que é o registro do que
 * foi enviado — quem decide o que avisar é a função agendada, e quem sabe se o
 * aluno está em dia continua sendo o financeiro nas telas dele.
 *
 * O painel segue o mesmo desenho do menu do perfil ao lado (abre no clique,
 * fecha no clique fora e no Esc), porque são dois botões vizinhos na mesma
 * barra e não faz sentido se comportarem de jeitos diferentes.
 */

import { el } from '../utils/dom.js';
import { icon } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { formatDateShortBR, todayISO, addDays } from '../utils/dates.js';
import {
  listPaymentNotifications,
  markAllPaymentNotificationsRead,
  markPaymentNotificationRead,
} from '../api/payment-notifications.js';
import { enablePush, ensurePushSubscription, pushStatus } from './push.js';
// TEMPORÁRIO: some junto com VITE_ENABLE_TEST_NOTIFICATION (ver teste.js).
import { TEST_NOTIFICATIONS_ENABLED, testNotificationsBlock } from './teste.js';

/* A cor de cada situação é a mesma da tela: azul para o que ainda vai vencer,
   laranja para o que vence hoje, vermelho para o atraso. O professor já
   aprendeu essa paleta na dashboard. */
const KIND_VARIANT = {
  due_tomorrow: 'accent',
  due_today: 'warning',
  overdue: 'danger',
};

const KIND_ICON = {
  due_tomorrow: 'clock',
  due_today: 'wallet',
  overdue: 'alert',
};

/**
 * Monta o sininho da topbar.
 *
 * @param {string} userId
 * @returns {HTMLElement}
 */
export function notificationBell(userId) {
  const count = el('span', { class: 'notif-badge hidden', 'aria-hidden': 'true' });

  const trigger = el('button', {
    type: 'button',
    class: 'notif-trigger',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    'aria-label': 'Abrir notificações',
    html: icon('bell', 20),
  });
  trigger.append(count);

  const body = el('div', { class: 'notif-body' }, [
    el('p', { class: 'notif-empty', text: 'Carregando...' }),
  ]);

  const markAll = el('button', {
    type: 'button',
    class: 'notif-action hidden',
    text: 'Marcar todas como lidas',
  });

  const panel = el('div', {
    class: 'notif-panel hidden',
    role: 'dialog',
    'aria-label': 'Notificações',
  }, [
    el('div', { class: 'notif-header' }, [
      el('p', { class: 'notif-title', text: 'Notificações' }),
      markAll,
    ]),
    body,
    permissionRow(userId),
    /* TEMPORÁRIO. A constante é o que permite ao empacotador provar que este
       ramo não existe em produção e deixar o bloco de teste inteiro fora do
       arquivo publicado — por isso ela vem antes da chamada, e não dentro. */
    TEST_NOTIFICATIONS_ENABLED ? testNotificationsBlock() : null,
  ]);

  const root = el('div', { class: 'notif' }, [trigger, panel]);

  const state = { items: [] };

  const paint = () => {
    const unread = state.items.filter((item) => !item.read_at).length;

    count.textContent = unread > 9 ? '9+' : String(unread);
    count.classList.toggle('hidden', unread === 0);
    markAll.classList.toggle('hidden', unread === 0);

    trigger.setAttribute(
      'aria-label',
      unread === 0 ? 'Abrir notificações' : `Abrir notificações — ${unread} não lidas`,
    );

    body.replaceChildren(
      ...(state.items.length === 0
        ? [el('p', { class: 'notif-empty', text: 'Nenhum aviso por aqui. Tudo em dia.' })]
        : state.items.map((item) => notificationItem(userId, item, paint))),
    );
  };

  const load = async () => {
    try {
      state.items = await listPaymentNotifications(userId);
    } catch (error) {
      console.warn('[notificações] não foi possível carregar a central', error);
      state.items = [];
    }
    paint();
  };

  markAll.addEventListener('click', async () => {
    // A tela responde na hora; o banco confirma em seguida. Marcar como lido é
    // reversível na prática (o aviso continua na lista), então não vale prender
    // o professor esperando a rede.
    const antes = state.items;
    const agora = new Date().toISOString();
    state.items = state.items.map((item) => ({ ...item, read_at: item.read_at ?? agora }));
    paint();

    try {
      await markAllPaymentNotificationsRead(userId);
    } catch (error) {
      state.items = antes;
      paint();
      toast.error('Não foi possível marcar as notificações como lidas.');
      console.error('[notificações] falha ao marcar todas como lidas', error);
    }
  });

  const close = () => {
    panel.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();

    if (!panel.classList.contains('hidden')) {
      close();
      return;
    }
    panel.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
    // Reler ao abrir: a função agendada pode ter enviado um aviso com a aba
    // aberta desde a manhã.
    load();
  });

  document.addEventListener('click', (event) => {
    if (!root.contains(event.target)) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  // Sem `await`: o contador aparece quando a consulta responder, e nada da
  // página espera por ele — é a mesma regra do nome do professor em app.js.
  load();

  // Quem já autorizou os avisos tem o registro deste navegador conferido em
  // silêncio. Quem não autorizou não é perguntado aqui (ver push.js).
  ensurePushSubscription(userId);

  return root;
}

/* ============================================================
   Uma notificação
   ============================================================ */

function notificationItem(userId, item, repaint) {
  const variant = KIND_VARIANT[item.kind] ?? 'accent';

  const node = el('a', {
    class: `notif-item${item.read_at ? '' : ' notif-item--unread'}`,
    href: item.url,
  }, [
    el('span', {
      class: `notif-item__icon notif-item__icon--${variant}`,
      html: icon(KIND_ICON[item.kind] ?? 'bell', 16),
    }),
    el('div', { class: 'notif-item__body' }, [
      el('p', { class: 'notif-item__text', text: item.body }),
      el('p', { class: 'notif-item__meta', text: whenLabel(item.notified_on) }),
    ]),
    item.read_at ? null : el('span', { class: 'notif-item__dot', 'aria-hidden': 'true' }),
  ]);

  node.addEventListener('click', async (event) => {
    if (item.read_at) return; // já lido: segue direto para o aluno

    // Segurar a navegação por um instante: sair da página cancelaria a
    // requisição, e o aviso voltaria a aparecer como não lido na próxima vez.
    event.preventDefault();
    item.read_at = new Date().toISOString();
    repaint();

    try {
      await markPaymentNotificationRead(userId, item.id);
    } catch (error) {
      console.warn('[notificações] não foi possível marcar como lida', error);
    }
    window.location.href = item.url;
  });

  return node;
}

/** 'Hoje' · 'Ontem' · 'seg, 05/09' — o suficiente para situar o aviso. */
function whenLabel(iso) {
  const today = todayISO();
  if (iso === today) return 'Hoje';
  if (iso === addDays(today, -1)) return 'Ontem';
  return formatDateShortBR(iso);
}

/* ============================================================
   Rodapé: a permissão do navegador
   ============================================================ */

/**
 * A linha que explica por que os avisos não estão chegando — e o botão que
 * resolve, quando há o que resolver.
 *
 * Fica escondida no caso normal (permissão concedida): o rodapé só aparece
 * quando ele tem algo a dizer.
 */
function permissionRow(userId) {
  const status = pushStatus();

  if (status === 'granted' || status === 'unconfigured') {
    return el('div', { class: 'hidden' });
  }

  if (status === 'unsupported') {
    return el('div', { class: 'notif-footer' }, [
      el('p', {
        class: 'notif-footer__hint',
        text: 'Este navegador não recebe avisos. No iPhone, instale o app na tela de início.',
      }),
    ]);
  }

  if (status === 'denied') {
    return el('div', { class: 'notif-footer' }, [
      el('p', {
        class: 'notif-footer__hint',
        text: 'Os avisos estão bloqueados nas configurações deste navegador.',
      }),
    ]);
  }

  const button = el('button', {
    type: 'button',
    class: 'btn btn--primary btn--sm notif-footer__btn',
    text: 'Ativar avisos neste aparelho',
  });

  const footer = el('div', { class: 'notif-footer' }, [
    el('p', {
      class: 'notif-footer__hint',
      text: 'Receba o aviso de mensalidade mesmo com o sistema fechado.',
    }),
    button,
  ]);

  button.addEventListener('click', async () => {
    button.disabled = true;

    try {
      const result = await enablePush(userId);

      if (result === 'granted') {
        toast.success('Avisos ativados neste aparelho.');
        footer.replaceChildren();
        footer.className = 'hidden';
        return;
      }
      if (result === 'denied') {
        toast.info('Os avisos ficaram bloqueados. Libere nas configurações do navegador.');
      }
    } catch (error) {
      toast.error('Não foi possível ativar os avisos. Tente novamente.');
      console.error('[push] falha ao ativar', error);
    }
    button.disabled = false;
  });

  return footer;
}
