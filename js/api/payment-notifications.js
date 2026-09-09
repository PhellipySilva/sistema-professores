/* Acesso a dados: avisos de mensalidade já enviados (a central do sininho).
 *
 * As linhas são criadas pela função agendada (supabase/functions/
 * notificar-mensalidades), nunca pela tela: aqui só se lê e se marca como lido.
 *
 * O texto vem gravado (`title`, `body`, `url`) e é exibido como está. Remontar
 * a frase na hora faria o aviso de ontem mudar de sentido depois que o
 * pagamento entrasse — o histórico deixaria de explicar por que ele existiu.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const COLUMNS =
  'id, student_id, kind, reference_month, due_date, days_overdue, notified_on, ' +
  'title, body, url, read_at, created_at';

/* A central mostra as últimas semanas. Guardar mais não ajuda ninguém: o aviso
   de dois meses atrás não muda nenhuma decisão, e o histórico financeiro de
   verdade está no perfil do aluno. */
const LIMIT = 40;

/** Avisos do professor, mais recentes primeiro. */
export async function listPaymentNotifications(userId) {
  return cachedRead(cacheKey(userId, 'payment-notifications'), async () => {
    const { data, error } = await supabase
      .from('payment_notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(LIMIT);

    if (error) throw error;
    return data;
  });
}

/** Marca UM aviso como lido. Já lido continua com a data original. */
export async function markPaymentNotificationRead(userId, notificationId) {
  const { error } = await supabase
    .from('payment_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', notificationId)
    .is('read_at', null);

  if (error) throw error;
}

/** Marca todos os não lidos de uma vez — o botão "marcar todas como lidas". */
export async function markAllPaymentNotificationsRead(userId) {
  const { error } = await supabase
    .from('payment_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
}
