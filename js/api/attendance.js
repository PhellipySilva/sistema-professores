/* Acesso a dados: frequência. */

import { supabase } from '../supabase.js';

const COLUMNS = 'id, session_id, student_id, status, notes, updated_at';

export async function listAttendanceForSession(userId, sessionId) {
  const { data, error } = await supabase
    .from('attendance')
    .select(COLUMNS)
    .eq('user_id', userId)
    .eq('session_id', sessionId);

  if (error) throw error;
  return data;
}

/** Histórico de um aluno, com a data da aula — usado no perfil. */
export async function listAttendanceForStudent(userId, studentId) {
  const { data, error } = await supabase
    .from('attendance')
    .select(`${COLUMNS}, class_sessions (session_date, start_time, classes (name))`)
    .eq('user_id', userId)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Marca a presença. É um upsert pela constraint `attendance_unique`
 * (session_id, student_id): tocar de novo no botão sobrescreve em vez de
 * duplicar, e permite corrigir a chamada depois (spec, seção 19).
 */
export async function setAttendance(userId, { session_id, student_id, status }) {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      { user_id: userId, session_id, student_id, status },
      { onConflict: 'session_id,student_id' },
    )
    .select(COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function clearAttendance(userId, sessionId, studentId) {
  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .eq('student_id', studentId);

  if (error) throw error;
}
