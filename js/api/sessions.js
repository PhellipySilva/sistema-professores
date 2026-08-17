/* Acesso a dados: sessões de aula (as aulas de datas concretas).
 *
 * Estas linhas são criadas sob demanda — ver js/agenda/agenda.js. A agenda
 * calcula as ocorrências previstas a partir dos horários e só grava quando o
 * professor abre a aula.
 */

import { supabase } from '../supabase.js';

const COLUMNS = 'id, class_id, session_date, start_time, end_time, status';

/** Sessões já materializadas em um intervalo de datas. */
export async function listSessionsBetween(userId, startIso, endIso) {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(`${COLUMNS}, classes (id, name, category)`)
    .eq('user_id', userId)
    .gte('session_date', startIso)
    .lte('session_date', endIso)
    .order('session_date')
    .order('start_time');

  if (error) throw error;
  return data;
}

export async function getSession(userId, sessionId) {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(`${COLUMNS}, classes (id, name, category)`)
    .eq('user_id', userId)
    .eq('id', sessionId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Materializa uma aula prevista. `onConflict` usa a mesma chave da constraint
 * `class_sessions_unique`, então tocar duas vezes no mesmo card devolve a
 * sessão existente em vez de duplicar.
 *
 * @param {object} input  { class_id, session_date, start_time, end_time }
 */
export async function ensureSession(userId, input) {
  const { data, error } = await supabase
    .from('class_sessions')
    .upsert({ ...input, user_id: userId }, { onConflict: 'class_id,session_date,start_time' })
    .select(`${COLUMNS}, classes (id, name, category)`)
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionStatus(userId, sessionId, status) {
  const { error } = await supabase
    .from('class_sessions')
    .update({ status })
    .eq('user_id', userId)
    .eq('id', sessionId);

  if (error) throw error;
}

/** Sessões futuras — usado para escolher a aula de uma reposição. */
export async function listUpcomingSessions(userId, fromIso, limit = 40) {
  const { data, error } = await supabase
    .from('class_sessions')
    .select(`${COLUMNS}, classes (id, name)`)
    .eq('user_id', userId)
    .gte('session_date', fromIso)
    .neq('status', 'canceled')
    .order('session_date')
    .order('start_time')
    .limit(limit);

  if (error) throw error;
  return data;
}
