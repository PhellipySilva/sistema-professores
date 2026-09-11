/* Acesso a dados: avisos de início de aula (a outra metade da central do sino).
 *
 * Gêmeo de js/api/payment-notifications.js, de propósito: mesmas colunas de
 * exibição (title, body, url, read_at), mesmo limite, mesma ordenação. É o que
 * permite ao sininho juntar as duas listas sem saber de qual tabela cada item
 * veio.
 *
 * As linhas são criadas pela função agendada (supabase/functions/
 * notificar-aulas), nunca pela tela: aqui só se lê e se marca como lido.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const COLUMNS =
  'id, kind, lesson_date, start_time, title, body, url, read_at, created_at';

/* O mesmo limite dos avisos financeiros. As duas listas são fundidas e cortadas
   de novo na tela — pedir mais do que cabe seria tráfego jogado fora. */
const LIMIT = 40;

/** Avisos de aula do professor, mais recentes primeiro. */
export async function listLessonNotifications(userId) {
  return cachedRead(cacheKey(userId, 'lesson-notifications'), async () => {
    const { data, error } = await supabase
      .from('lesson_notifications')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(LIMIT);

    if (error) throw error;
    return data;
  });
}

/** Marca UM aviso como lido. Já lido continua com a data original. */
export async function markLessonNotificationRead(userId, notificationId) {
  const { error } = await supabase
    .from('lesson_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', notificationId)
    .is('read_at', null);

  if (error) throw error;
}

/** Marca todos os não lidos de uma vez. */
export async function markAllLessonNotificationsRead(userId) {
  const { error } = await supabase
    .from('lesson_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);

  if (error) throw error;
}
