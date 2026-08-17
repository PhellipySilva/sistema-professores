/* Acesso a dados: alunos.
 *
 * Único lugar do projeto (além de auth.js) que chama o Supabase para esta
 * tabela. Nenhuma função aqui toca no DOM.
 *
 * O RLS já garante que cada professor só vê os próprios alunos — o filtro
 * `.eq('user_id', userId)` abaixo é redundante com a política, mas deixa a
 * intenção explícita e aproveita o índice (user_id, name).
 */

import { supabase } from '../supabase.js';

const COLUMNS = 'id, name, phone, category, guardian_name, monthly_fee_cents, due_day, created_at';

export async function listStudents(userId) {
  const { data, error } = await supabase
    .from('students')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('name');

  if (error) throw error;
  return data;
}

export async function getStudent(userId, studentId) {
  const { data, error } = await supabase
    .from('students')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('id', studentId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * @param {object} input  { name, phone, category, guardian_name, monthly_fee_cents, due_day }
 */
export async function createStudent(userId, input) {
  const { data, error } = await supabase
    .from('students')
    .insert({ ...input, user_id: userId })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateStudent(userId, studentId, input) {
  const { data, error } = await supabase
    .from('students')
    .update(input)
    .eq('user_id', userId)
    .eq('id', studentId)
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

/** Apaga o aluno e, em cascata, sua frequência, reposições e pagamentos. */
export async function deleteStudent(userId, studentId) {
  const { error } = await supabase
    .from('students')
    .delete()
    .eq('user_id', userId)
    .eq('id', studentId);

  if (error) throw error;
}
