/* Acesso a dados: planejamentos de aula.
 *
 * `class_id` é OPCIONAL (migration 0008): com turma, o plano é daquela turma;
 * sem turma, é um planejamento geral, aproveitável em qualquer uma. As duas
 * formas convivem na mesma tabela porque são a mesma coisa — o que muda é a
 * existência do vínculo, não a natureza do registro.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const COLUMNS = 'id, title, description, lesson_date, category, class_id, created_at';

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

/* ============================================================
   Compartilhamento com outro professor
   ============================================================
   A autorização é a LINHA da tabela lesson_plan_shares mais a sessão de quem
   lê (migration 0010) — não existe link público nem token. Estas funções só
   criam e apagam vínculos; quem decide o que cada um pode ver é o RLS.
   ============================================================ */

/**
 * Os planejamentos que OUTROS professores compartilharam comigo.
 *
 * A turma não vem embutida de propósito: ela pertence ao professor que
 * compartilhou, e o RLS de `classes` (com razão) não a entrega a mais ninguém.
 * O que atravessa é o planejamento — que é o que foi compartilhado.
 *
 * @returns {Promise<{id: string, owner_id: string, created_at: string, plan: object}[]>}
 */
export async function listSharedWithMe(userId) {
  return cachedRead(cacheKey(userId, 'lesson-plans-shared'), async () => {
    const { data, error } = await supabase
      .from('lesson_plan_shares')
      .select(`id, owner_id, created_at, lesson_plans (${COLUMNS})`)
      .eq('shared_with_id', userId);

    if (error) throw error;

    return (data ?? [])
      .filter((row) => row.lesson_plans)
      .map((row) => ({
        id: row.id,
        owner_id: row.owner_id,
        created_at: row.created_at,
        plan: row.lesson_plans,
      }));
  });
}

/** Com quem ESTE planejamento já está compartilhado. */
export async function listPlanShares(userId, planId) {
  const { data, error } = await supabase
    .from('lesson_plan_shares')
    .select('id, shared_with_id, created_at')
    .eq('owner_id', userId)
    .eq('lesson_plan_id', planId);

  if (error) throw error;
  return data ?? [];
}

/**
 * Compartilha o planejamento com um professor.
 *
 * `upsert` na chave (lesson_plan_id, shared_with_id): compartilhar de novo com
 * a mesma pessoa é a mesma coisa que uma vez só, e não vira erro na tela.
 */
export async function sharePlanWith(userId, planId, teacherId) {
  const { data, error } = await supabase
    .from('lesson_plan_shares')
    .upsert(
      { lesson_plan_id: planId, owner_id: userId, shared_with_id: teacherId },
      { onConflict: 'lesson_plan_id,shared_with_id' },
    )
    .select('id, shared_with_id, created_at')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Desfaz um compartilhamento. Apaga o VÍNCULO, nunca o planejamento.
 *
 * Serve aos dois lados, como a política de delete da migration 0010: o dono
 * tira o acesso que deu, e quem recebeu tira da própria tela o que não quer
 * mais ver.
 */
export async function removePlanShare(shareId) {
  const { error } = await supabase
    .from('lesson_plan_shares')
    .delete()
    .eq('id', shareId);

  if (error) throw error;
}
