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
import { cachedRead, cacheKey } from '../offline/cache.js';

/* `category` é o NÍVEL (E..PRO) e `student_type` é Kids/Adulto — os dois trocaram
   de papel na migration 0009. `on_leave` separa "Geral" de "Alunos afastados". */
const COLUMNS =
  'id, name, phone, category, student_type, guardian_name, monthly_fee_cents, due_day, ' +
  'sponsored, on_leave, created_at';

export async function listStudents(userId) {
  return cachedRead(cacheKey(userId, 'students'), async () => {
    const { data, error } = await supabase
      .from('students')
      .select(COLUMNS)
      .eq('user_id', userId)
      .order('name');

    if (error) throw error;
    return data;
  });
}

export async function getStudent(userId, studentId) {
  return cachedRead(cacheKey(userId, 'student', studentId), async () => {
    const { data, error } = await supabase
      .from('students')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('id', studentId)
      .single();

    if (error) throw error;
    return data;
  });
}

/**
 * @param {object} input  { name, phone, category, student_type, guardian_name,
 *                          monthly_fee_cents, due_day, sponsored }
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

/**
 * Afasta o aluno das aulas, ou o traz de volta.
 *
 * É um update de uma coluna só, e existe com nome próprio porque o gesto na
 * tela é um só: um toque no card move o aluno entre "Geral" e "Alunos
 * afastados". Nada mais do cadastro é tocado — voltar é o mesmo toque ao
 * contrário.
 */
export async function setStudentOnLeave(userId, studentId, onLeave) {
  return updateStudent(userId, studentId, { on_leave: onLeave });
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
