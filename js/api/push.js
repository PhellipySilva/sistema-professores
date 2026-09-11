/* Acesso a dados: inscrições de push (avisos de mensalidade).
 *
 * Uma linha por NAVEGADOR em que o professor aceitou receber os avisos — o
 * celular da quadra e o computador de casa são duas linhas, e o aviso vai para
 * as duas.
 *
 * Gravar passa por uma função do banco em vez de um upsert direto: o navegador
 * pode ter sido usado por outro professor antes, e só uma função security
 * definer consegue tirar aquele endpoint do dono anterior (ver
 * save_push_subscription nas migrations 0012 e 0014). Apagar é `delete` normal — a
 * política de RLS já limita cada um às próprias linhas.
 */

import { supabase } from '../supabase.js';

/**
 * Registra (ou atualiza) o navegador atual.
 *
 * @param {PushSubscription} subscription  o objeto devolvido por PushManager
 * @param {{ replaceSameDevice?: boolean }} [options]
 *   `replaceSameDevice: true` quando a inscrição acabou de ser CRIADA (e não
 *   apenas reconfirmada): as linhas anteriores deste mesmo aparelho são órfãs
 *   e saem do banco junto (ver migration 0014).
 */
export async function savePushSubscription(subscription, { replaceSameDevice = false } = {}) {
  const json = subscription.toJSON();

  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: json.keys?.p256dh,
    p_auth: json.keys?.auth,
    p_user_agent: navigator.userAgent ?? null,
    p_replace_same_device: replaceSameDevice,
  });

  if (error) throw error;
}

/** Tira este navegador da lista — o professor desligou os avisos. */
export async function deletePushSubscription(userId, endpoint) {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint);

  if (error) throw error;
}
