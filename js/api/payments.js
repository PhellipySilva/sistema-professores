/* Acesso a dados: pagamentos de mensalidade. */

import { supabase } from '../supabase.js';

const COLUMNS = 'id, student_id, amount_cents, reference_month, due_date, paid_date, created_at';

/** Histórico completo de um aluno, mais recente primeiro (perfil do aluno). */
export async function listPaymentsForStudent(userId, studentId) {
  const { data, error } = await supabase
    .from('payments')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('student_id', studentId)
    .order('reference_month', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Pagamentos de TODOS os alunos do professor a partir de um mês — usado para
 * calcular o badge de situação financeira na listagem, numa query só
 * (spec, seção 42: evitar consulta por linha).
 *
 * @param {string} sinceMonthIso  'YYYY-MM-01'
 */
export async function listPaymentsSince(userId, sinceMonthIso) {
  const { data, error } = await supabase
    .from('payments')
    // amount_cents entra aqui porque a dashboard soma o RECEBIDO do mês a partir
    // do que foi efetivamente lançado, e não da mensalidade cadastrada.
    .select('student_id, amount_cents, reference_month, due_date, paid_date')
    .eq('user_id', userId)
    .gte('reference_month', sinceMonthIso);

  if (error) throw error;
  return data;
}

/**
 * Registra (ou corrige) o pagamento de um mês. `onConflict` usa a mesma
 * chave da constraint `payments_unique`: registrar de novo o mesmo mês
 * atualiza o lançamento em vez de duplicar.
 *
 * @param {object} input  { student_id, amount_cents, reference_month, due_date, paid_date }
 */
export async function upsertPayment(userId, input) {
  const { data, error } = await supabase
    .from('payments')
    .upsert({ ...input, user_id: userId }, { onConflict: 'student_id,reference_month' })
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}
