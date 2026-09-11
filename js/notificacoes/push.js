/* Web Push no navegador: pedir permissão, registrar e desligar.
 *
 * A parte do sistema que roda no aparelho do professor. Ela não decide NADA
 * sobre mensalidade — só entrega ao servidor um endereço para onde mandar o
 * aviso quando ninguém estiver com o sistema aberto (o que envia é
 * supabase/functions/notificar-mensalidades).
 *
 * A PERMISSÃO NUNCA É PEDIDA SOZINHA
 *
 *   Nenhuma tela abre perguntando "quer receber notificações?". O navegador
 *   trata a recusa como definitiva — negou uma vez, o cadeado fecha e só as
 *   configurações do navegador reabrem. Então o pedido acontece só quando o
 *   professor toca em "Ativar avisos" dentro do sininho, sabendo o que vai
 *   receber. O que roda sozinho é o RE-registro de quem já disse sim.
 *
 * O Service Worker é o mesmo de sempre (public/sw.js), que já estava registrado
 * para o funcionamento offline. Nenhum worker novo entra no sistema.
 */

import { savePushSubscription, deletePushSubscription } from '../api/push.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/** O navegador sabe fazer push? (iPhone só a partir do iOS 16.4, e só instalado.) */
export function pushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** O projeto está configurado para push? Sem a chave VAPID, não há o que ligar. */
export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY);
}

/**
 * Em que pé está a permissão.
 *
 * @returns {'unsupported'|'unconfigured'|'default'|'granted'|'denied'}
 */
export function pushStatus() {
  if (!pushSupported()) return 'unsupported';
  if (!pushConfigured()) return 'unconfigured';
  return Notification.permission;
}

/**
 * Liga os avisos. Só pode ser chamada a partir de um toque do professor —
 * é exigência dos navegadores, e é o que torna o pedido compreensível.
 *
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'|'unconfigured'>}
 */
export async function enablePush(userId) {
  const status = pushStatus();
  if (status === 'unsupported' || status === 'unconfigured') return status;

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();

  if (permission !== 'granted') return permission;

  await subscribeAndSave(userId);
  return 'granted';
}

/**
 * Garante que o registro deste navegador está no banco — sem perguntar nada.
 *
 * Roda a cada abertura de página para quem JÁ autorizou. É o que conserta os
 * dois casos em que a inscrição some sem ninguém mexer em nada: o navegador
 * renova o endpoint por conta própria (acontece), e o professor entra em outra
 * conta no mesmo aparelho. Quem nunca autorizou não é incomodado: a função sai
 * na primeira linha.
 */
export async function ensurePushSubscription(userId) {
  if (pushStatus() !== 'granted') return false;

  try {
    await subscribeAndSave(userId);
    return true;
  } catch (error) {
    // Falhar aqui custa o aviso, não a tela. O sistema segue inteiro.
    console.warn('[push] não foi possível registrar este navegador', error);
    return false;
  }
}

/** Desliga os avisos NESTE navegador. Os outros aparelhos continuam recebendo. */
export async function disablePush(userId) {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;

  // A ordem importa: primeiro o banco. Cancelar antes e falhar no banco
  // deixaria uma linha viva apontando para um endereço morto, e a função
  // agendada gastaria um envio por dia até receber o 410.
  await deletePushSubscription(userId, endpoint);
  await subscription.unsubscribe();
}

/* ============================================================
   Bastidores
   ============================================================ */

/**
 * Pega (ou cria) a inscrição deste navegador e a grava no banco.
 *
 * `getSubscription` antes de `subscribe` porque a inscrição sobrevive ao
 * fechamento do navegador: recriar do zero a cada abertura geraria um endpoint
 * novo e uma linha nova no banco toda vez.
 */
async function subscribeAndSave(userId) {
  const registration = await navigator.serviceWorker.ready;

  const existente = await registration.pushManager.getSubscription();

  const subscription =
    existente ??
    (await registration.pushManager.subscribe({
      // Sem isto o navegador aceitaria push de qualquer servidor que
      // descobrisse o endpoint. Com a chave, só quem tem a privada consegue
      // enviar — e ela nunca sai das Edge Functions.
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  // Inscrição criada agora: a anterior deste aparelho (se havia) morreu sem
  // avisar — o serviço de push aceitaria envios para ela e os descartaria.
  // O banco troca uma pela outra em vez de acumular endpoints mortos.
  await savePushSubscription(subscription, { replaceSameDevice: !existente });
  return subscription;
}

/**
 * A chave VAPID vem em base64url (é o formato que todo gerador produz) e o
 * `subscribe` exige bytes crus. São as duas trocas de alfabeto do base64url
 * mais o preenchimento que ele omite.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/');

  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index++) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}
