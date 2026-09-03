/* Acesso a dados: reposições. */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const COLUMNS =
  'id, student_id, original_session_id, makeup_session_id, original_date, makeup_date, status, notes';

export async function listMakeupsForStudent(userId, studentId) {
  return cachedRead(cacheKey(userId, 'makeups', 'student', studentId), async () => {
    const { data, error } = await supabase
      .from('makeups')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('student_id', studentId)
      .order('original_date', { ascending: false });

    if (error) throw error;
    return data;
  });
}

/** Reposições agendadas para uma sessão — os "convidados" da chamada. */
export async function listMakeupsForSession(userId, sessionId) {
  return cachedRead(cacheKey(userId, 'makeups', 'session', sessionId), async () => {
    const { data, error } = await supabase
      .from('makeups')
      .select(`${COLUMNS}, students (id, name, category, student_type)`)
      .eq('user_id', userId)
      .eq('makeup_session_id', sessionId)
      .in('status', ['scheduled', 'completed']);

    if (error) throw error;
    return data;
  });
}

/** Reposições pendentes ou agendadas de todos os alunos. */
export async function listOpenMakeups(userId) {
  return cachedRead(cacheKey(userId, 'makeups', 'open'), async () => {
    const { data, error } = await supabase
      .from('makeups')
      .select(`${COLUMNS}, students (id, name)`)
      .eq('user_id', userId)
      .in('status', ['pending', 'scheduled'])
      .order('original_date', { ascending: false });

    if (error) throw error;
    return data;
  });
}

/**
 * Cria (ou atualiza) a reposição de uma falta. `onConflict` usa a constraint
 * `makeups_unique` (student_id, original_session_id): reagendar a mesma falta
 * atualiza o registro em vez de criar um segundo.
 */
export async function upsertMakeup(userId, input) {
  const { data, error } = await supabase
    .from('makeups')
    .upsert({ ...input, user_id: userId }, { onConflict: 'student_id,original_session_id' })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateMakeupStatus(userId, makeupId, status) {
  const { error } = await supabase
    .from('makeups')
    .update({ status })
    .eq('user_id', userId)
    .eq('id', makeupId);

  if (error) throw error;
}

export async function deleteMakeup(userId, makeupId) {
  const { error } = await supabase
    .from('makeups')
    .delete()
    .eq('user_id', userId)
    .eq('id', makeupId);

  if (error) throw error;
}
