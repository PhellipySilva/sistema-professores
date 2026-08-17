/* Acesso a dados: planejamentos de aula. */

import { supabase } from '../supabase.js';

const COLUMNS = 'id, title, description, lesson_date, created_at';

export async function listLessonPlans(userId) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('lesson_date', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createLessonPlan(userId, input) {
  const { data, error } = await supabase
    .from('lesson_plans')
    .insert({ ...input, user_id: userId })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

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
