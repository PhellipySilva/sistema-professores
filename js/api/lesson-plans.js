/* Acesso a dados: planejamentos de aula.
 *
 * `class_id` é OPCIONAL (migration 0008): com turma, o plano é daquela turma;
 * sem turma, é um planejamento geral, aproveitável em qualquer uma. As duas
 * formas convivem na mesma tabela porque são a mesma coisa — o que muda é a
 * existência do vínculo, não a natureza do registro.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const COLUMNS = 'id, title, description, lesson_date, class_id, created_at';

/* A turma vem embutida para a listagem mostrar 'Seg/Qua 18h' sem uma consulta
   por plano. Vem null quando o plano é geral — e também quando a turma foi
   excluída depois, caso em que o plano continua existindo, agora como geral. */
const CLASS_EMBED = 'classes (id, name, category, class_schedules (day_of_week, start_time, end_time))';

export async function listLessonPlans(userId) {
  return cachedRead(cacheKey(userId, 'lesson-plans'), async () => {
    const { data, error } = await supabase
      .from('lesson_plans')
      .select(`${COLUMNS}, ${CLASS_EMBED}`)
      .eq('user_id', userId)
      .order('lesson_date', { ascending: false });

    if (error) throw error;
    return data;
  });
}

/** @param {object} input  { title, description, lesson_date, class_id }  class_id pode ser null */
export async function createLessonPlan(userId, input) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .insert({ ...input, user_id: userId })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Atualiza o plano. `class_id: null` no input REMOVE o vínculo — o plano vira
 * geral e continua existindo, que é a regra pedida: desvincular não é excluir.
 */
export async function updateLessonPlan(userId, planId, input) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .update(input)
    .eq('user_id', userId)
    .eq('id', planId)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteLessonPlan(userId, planId) {
  const { error } = await supabase
    .from('lesson_plans')
    .delete()
    .eq('user_id', userId)
    .eq('id', planId);

  if (error) throw error;
}
