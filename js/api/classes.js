/* Acesso a dados: turmas, horários e matrículas. */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const CLASS_COLUMNS = 'id, name, category, capacity, created_at';
const SCHEDULE_COLUMNS = 'id, class_id, day_of_week, start_time, end_time';

/* ============================================================
   Turmas
   ============================================================ */

/** Turmas com seus horários e a contagem de alunos ativos, em uma query. */
export async function listClasses(userId) {
  return cachedRead(cacheKey(userId, 'classes'), async () => {
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
  });
}

export async function getClass(userId, classId) {
  return cachedRead(cacheKey(userId, 'class', classId), async () => {
    const { data, error } = await supabase
      .from('classes')
      .select(`${CLASS_COLUMNS}, class_schedules (${SCHEDULE_COLUMNS})`)
      .eq('user_id', userId)
      .eq('id', classId)
      .single();

    if (error) throw error;
    return { ...data, class_schedules: sortSchedules(data.class_schedules ?? []) };
  });
}

/**
 * @param {object[]} [input.enrollments]  [{ student_id, days_of_week }] — matrícula
 *                                        junto com a criação da turma
 */
export async function createClass(userId, { name, category, capacity, schedules, enrollments }) {
  const { data: created, error } = await supabase
    .from('classes')
    .insert({ name, category, capacity: capacity ?? null, user_id: userId })
    .select(CLASS_COLUMNS)
    .single();

  if (error) throw error;

  /* Criar turma são três escritas em tabelas diferentes, e o PostgREST não tem
     transação entre chamadas. Sem o desfazer abaixo, uma falha na grade ou na
     matrícula deixava a linha de `classes` gravada enquanto a tela dizia "não
     foi possível criar a turma" — e o professor voltava a criar a mesma turma,
     acumulando turmas fantasma sem grade e sem aluno.

     Apagar aqui é seguro: a turma nasceu segundos atrás, nada aponta para ela
     ainda, e o cascade leva junto a grade e as matrículas parciais. O erro
     original é relançado; a falha do desfazer não pode substituí-lo, senão a
     causa de verdade se perde. */
  try {
    if (schedules?.length > 0) {
      await replaceSchedules(userId, created.id, schedules);
    }
    if (enrollments) {
      await replaceEnrollments(userId, created.id, enrollments);
    }
  } catch (stepError) {
    try {
      await deleteClass(userId, created.id);
    } catch (rollbackError) {
      console.error('[classes] turma criada pela metade e não foi possível desfazer', rollbackError);
    }
    throw stepError;
  }

  return created;
}

export async function updateClass(userId, classId, { name, category, capacity, schedules, enrollments }) {
  const { error } = await supabase
    .from('classes')
    .update({ name, category, capacity: capacity ?? null })
    .eq('user_id', userId)
    .eq('id', classId);

  if (error) throw error;

  if (schedules) {
    await replaceSchedules(userId, classId, schedules);
  }

  if (enrollments) {
    await replaceEnrollments(userId, classId, enrollments);
  } else if (schedules) {
    // Sem lista de matrículas, ainda é preciso ajustar quem tinha restrição de
    // dia: tirar a quinta de uma turma deixaria quem só ia na quinta invisível
    // em toda chamada, sem nenhum aviso.
    await reconcileEnrollmentDays(userId, classId, schedules.map((item) => item.day_of_week));
  }
}

/**
 * Reajusta as restrições de dia depois que a grade da turma muda.
 *
 * Interseção entre o que o aluno frequentava e os dias que sobraram. Se a
 * interseção ficar vazia (o dia dele deixou de existir), volta para null —
 * frequenta todos os dias. Melhor devolver o aluno à turma do que sumir com ele.
 */
export async function reconcileEnrollmentDays(userId, classId, classDays) {
  const remaining = [...new Set(classDays)].sort((a, b) => a - b);

  const { data, error } = await supabase
    .from('class_students')
    .select('student_id, days_of_week')
    .eq('user_id', userId)
    .eq('class_id', classId)
    .eq('active', true)
    .not('days_of_week', 'is', null);

  if (error) throw error;
  if (!data || data.length === 0) return;

  const updates = [];

  for (const enrollment of data) {
    const kept = remaining.filter((day) => enrollment.days_of_week.includes(day));
    const next = kept.length === 0 || kept.length === remaining.length ? null : kept;

    if (JSON.stringify(next) !== JSON.stringify(enrollment.days_of_week)) {
      updates.push({ student_id: enrollment.student_id, days_of_week: next });
    }
  }

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('class_students')
      .update({ days_of_week: update.days_of_week })
      .eq('user_id', userId)
      .eq('class_id', classId)
      .eq('student_id', update.student_id);

    if (updateError) throw updateError;
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
  return cachedRead(cacheKey(userId, 'schedules'), async () => {
    const { data, error } = await supabase
      .from('class_schedules')
      .select(`${SCHEDULE_COLUMNS}, classes (id, name, category)`)
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  });
}

/* ============================================================
   Matrículas
   ============================================================ */

export async function listClassStudents(userId, classId) {
  return cachedRead(cacheKey(userId, 'class-students', classId), async () => {
    const { data, error } = await supabase
      .from('class_students')
      .select('id, active, student_id, days_of_week, students (id, name, category, phone, guardian_name)')
      .eq('user_id', userId)
      .eq('class_id', classId)
      .eq('active', true);

    if (error) throw error;

    return data
      .filter((link) => link.students)
      .map((link) => ({ linkId: link.id, days_of_week: link.days_of_week, ...link.students }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });
}

/** Turmas em que um aluno está matriculado (perfil do aluno). */
export async function listClassesOfStudent(userId, studentId) {
  return cachedRead(cacheKey(userId, 'student-classes', studentId), async () => {
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
  });
}

/**
 * @param {number[]|null} [daysOfWeek]  null = frequenta todos os dias da turma
 */
export async function addStudentToClass(userId, classId, studentId, daysOfWeek = null) {
  // upsert: se o aluno já esteve na turma e foi removido, reativa o vínculo
  // em vez de esbarrar na constraint unique (class_id, student_id).
  const { error } = await supabase
    .from('class_students')
    .upsert(
      {
        user_id: userId,
        class_id: classId,
        student_id: studentId,
        days_of_week: daysOfWeek,
        active: true,
      },
      { onConflict: 'class_id,student_id' },
    );

  if (error) throw error;
}

export async function updateEnrollmentDays(userId, classId, studentId, daysOfWeek) {
  const { error } = await supabase
    .from('class_students')
    .update({ days_of_week: daysOfWeek })
    .eq('user_id', userId)
    .eq('class_id', classId)
    .eq('student_id', studentId);

  if (error) throw error;
}

/**
 * Substitui a lista inteira de matriculados da turma.
 *
 * Desativa todo mundo e reativa quem está na lista nova. Duas queries em vez de
 * calcular o diff — a lista é pequena, e desativar (em vez de apagar) preserva
 * o histórico de frequência de quem sai.
 *
 * @param {{student_id: string, days_of_week: number[]|null}[]} enrollments
 */
export async function replaceEnrollments(userId, classId, enrollments) {
  const { error: deactivateError } = await supabase
    .from('class_students')
    .update({ active: false })
    .eq('user_id', userId)
    .eq('class_id', classId);

  if (deactivateError) throw deactivateError;
  if (enrollments.length === 0) return;

  const { error: upsertError } = await supabase.from('class_students').upsert(
    enrollments.map((enrollment) => ({
      user_id: userId,
      class_id: classId,
      student_id: enrollment.student_id,
      days_of_week: enrollment.days_of_week ?? null,
      active: true,
    })),
    { onConflict: 'class_id,student_id' },
  );

  if (upsertError) throw upsertError;
}

/**
 * Quantos alunos ativos a turma tem AGORA.
 *
 * `head: true` traz só o total, sem as linhas: é a pergunta que a checagem de
 * vaga faz depois de uma remoção, e ela não precisa de nome nenhum.
 */
export async function countActiveStudents(userId, classId) {
  const { count, error } = await supabase
    .from('class_students')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('class_id', classId)
    .eq('active', true);

  if (error) throw error;
  return count ?? 0;
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
