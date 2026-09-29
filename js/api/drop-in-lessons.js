/* Acesso a dados: aulas avulsas (migration 0015).
 *
 * Tabelas próprias — `drop_in_lessons` e `drop_in_participants` —, sem ligação
 * com turmas, alunos ou `payments`. O participante é só um nome e um valor.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const COLUMNS = 'id, lesson_date, start_time, duration_minutes, created_at';
const PARTICIPANTS_EMBED = 'drop_in_participants (id, name, amount_cents, paid, position)';

/* Os participantes chegam na ordem em que foram digitados. Ordenar aqui, e não
   na consulta, mantém a query simples e dá à tela sempre a mesma forma. */
function normalize(rows) {
  return (rows ?? []).map((lesson) => ({
    ...lesson,
    drop_in_participants: [...(lesson.drop_in_participants ?? [])].sort(
      (a, b) => a.position - b.position,
    ),
  }));
}

/** Todas as aulas avulsas do professor, da mais recente para a mais antiga. */
export async function listDropInLessons(userId) {
  return cachedRead(cacheKey(userId, 'drop-in-lessons'), async () => {
    const { data, error } = await supabase
      .from('drop_in_lessons')
      .select(`${COLUMNS}, ${PARTICIPANTS_EMBED}`)
      .eq('user_id', userId)
      .order('lesson_date', { ascending: false })
      .order('start_time', { ascending: false });

    if (error) throw error;
    return normalize(data);
  });
}

/**
 * Aulas avulsas num intervalo de datas — o que o financeiro do mês precisa.
 *
 * @param {string} fromIso  'YYYY-MM-DD' (inclusive)
 * @param {string} toIso    'YYYY-MM-DD' (inclusive)
 */
export async function listDropInLessonsBetween(userId, fromIso, toIso) {
  return cachedRead(cacheKey(userId, 'drop-in-lessons', fromIso, toIso), async () => {
    const { data, error } = await supabase
      .from('drop_in_lessons')
      .select(`${COLUMNS}, ${PARTICIPANTS_EMBED}`)
      .eq('user_id', userId)
      .gte('lesson_date', fromIso)
      .lte('lesson_date', toIso);

    if (error) throw error;
    return normalize(data);
  });
}

/**
 * Cria (lessonId null) ou edita a aula junto com a lista COMPLETA de
 * participantes. Uma chamada só, numa transação só (save_drop_in_lesson).
 *
 * @param {object} input  { lesson_date, start_time, duration_minutes,
 *                          participants: [{ name, amount_cents, paid }] }
 * @returns {Promise<string>} id da aula
 */
export async function saveDropInLesson(lessonId, input) {
  const { data, error } = await supabase.rpc('save_drop_in_lesson', {
    p_lesson_id: lessonId ?? null,
    p_lesson_date: input.lesson_date,
    p_start_time: input.start_time,
    p_duration_minutes: input.duration_minutes,
    p_participants: input.participants,
  });

  if (error) throw error;
  return data;
}

/** Os participantes saem junto, por cascata. */
export async function deleteDropInLesson(userId, lessonId) {
  const { error } = await supabase
    .from('drop_in_lessons')
    .delete()
    .eq('user_id', userId)
    .eq('id', lessonId);

  if (error) throw error;
}

/** Pago ↔ não pago de UM participante. É um update, nunca um lançamento novo. */
export async function setParticipantPaid(userId, participantId, paid) {
  const { error } = await supabase
    .from('drop_in_participants')
    .update({ paid })
    .eq('user_id', userId)
    .eq('id', participantId);

  if (error) throw error;
}
