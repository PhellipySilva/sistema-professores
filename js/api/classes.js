/* Acesso a dados: turmas, horários e matrículas. */

import { supabase } from '../supabase.js';

const CLASS_COLUMNS = 'id, name, category, created_at';
const SCHEDULE_COLUMNS = 'id, class_id, day_of_week, start_time, end_time';

/* ============================================================
   Turmas
   ============================================================ */

/** Turmas com seus horários e a contagem de alunos ativos, em uma query. */
export async function listClasses(userId) {
  const { data, error } = await supabase
    .from('classes')
    .select(`${CLASS_COLUMNS}, class_schedules (${SCHEDULE_COLUMNS}), class_students (id, active)`)
    .eq('user_id', userId)
    .order('name');

  if (error) throw error;

  return data.map((row) => ({
    ...row,
    class_schedules: sortSchedules(row.class_schedules ?? []),
    student_count: (row.class_students ?? []).filter((link) => link.active).length,
  }));
}

export async function getClass(userId, classId) {
  const { data, error } = await supabase
    .from('classes')
    .select(`${CLASS_COLUMNS}, class_schedules (${SCHEDULE_COLUMNS})`)
    .eq('user_id', userId)
    .eq('id', classId)
    .single();

  if (error) throw error;
  return { ...data, class_schedules: sortSchedules(data.class_schedules ?? []) };
}

export async function createClass(userId, { name, category, schedules }) {
  const { data: created, error } = await supabase
    .from('classes')
    .insert({ name, category, user_id: userId })
    .select(CLASS_COLUMNS)
    .single();

  if (error) throw error;

  if (schedules.length > 0) {
    await replaceSchedules(userId, created.id, schedules);
  }
  return created;
}

export async function updateClass(userId, classId, { name, category, schedules }) {
  const { error } = await supabase
    .from('classes')
    .update({ name, category })
    .eq('user_id', userId)
    .eq('id', classId);

  if (error) throw error;

  if (schedules) {
    await replaceSchedules(userId, classId, schedules);
  }
}

export async function deleteClass(userId, classId) {
  const { error } = await supabase
    .from('classes')
    .delete()
    .eq('user_id', userId)
    .eq('id', classId);

  if (error) throw error;
}

/* ============================================================
   Horários
   ============================================================ */

/**
 * Troca a grade inteira de horários da turma.
 * Apagar e reinserir é mais simples (e menos sujeito a erro) do que calcular o
 * diff, e a grade tem no máximo 7 linhas.
 *
 * @param {{day_of_week: number, start_time: string, end_time: string}[]} schedules
 */
export async function replaceSchedules(userId, classId, schedules) {
  const { error: deleteError } = await supabase
    .from('class_schedules')
    .delete()
    .eq('user_id', userId)
    .eq('class_id', classId);

  if (deleteError) throw deleteError;
  if (schedules.length === 0) return;

  const { error: insertError } = await supabase.from('class_schedules').insert(
    schedules.map((schedule) => ({ ...schedule, class_id: classId, user_id: userId })),
  );

  if (insertError) throw insertError;
}

/** Todos os horários do professor — a agenda usa isto para calcular o mês. */
export async function listAllSchedules(userId) {
  const { data, error } = await supabase
    .from('class_schedules')
    .select(`${SCHEDULE_COLUMNS}, classes (id, name, category)`)
    .eq('user_id', userId);

  if (error) throw error;
  return data;
}

/* ============================================================
   Matrículas
   ============================================================ */

export async function listClassStudents(userId, classId) {
  const { data, error } = await supabase
    .from('class_students')
    .select('id, active, student_id, students (id, name, category, phone, guardian_name)')
    .eq('user_id', userId)
    .eq('class_id', classId)
    .eq('active', true);

  if (error) throw error;

  return data
    .map((link) => ({ linkId: link.id, ...link.students }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Turmas em que um aluno está matriculado (perfil do aluno). */
export async function listClassesOfStudent(userId, studentId) {
  const { data, error } = await supabase
    .from('class_students')
    .select(`id, classes (${CLASS_COLUMNS}, class_schedules (${SCHEDULE_COLUMNS}))`)
    .eq('user_id', userId)
    .eq('student_id', studentId)
    .eq('active', true);

  if (error) throw error;

  return data
    .filter((link) => link.classes)
    .map((link) => ({
      ...link.classes,
      class_schedules: sortSchedules(link.classes.class_schedules ?? []),
    }));
}

export async function addStudentToClass(userId, classId, studentId) {
  // upsert: se o aluno já esteve na turma e foi removido, reativa o vínculo
  // em vez de esbarrar na constraint unique (class_id, student_id).
  const { error } = await supabase
    .from('class_students')
    .upsert(
      { user_id: userId, class_id: classId, student_id: studentId, active: true },
      { onConflict: 'class_id,student_id' },
    );

  if (error) throw error;
}

/** Remover é desativar: preserva o histórico de frequência daquela turma. */
export async function removeStudentFromClass(userId, classId, studentId) {
  const { error } = await supabase
    .from('class_students')
    .update({ active: false })
    .eq('user_id', userId)
    .eq('class_id', classId)
    .eq('student_id', studentId);

  if (error) throw error;
}

/* ============================================================
   Helpers
   ============================================================ */

function sortSchedules(schedules) {
  return [...schedules].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}
