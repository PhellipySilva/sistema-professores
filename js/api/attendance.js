/* Acesso a dados: frequência.
 *
 * É a ÚNICA tabela que aceita escrita offline, e a decisão está explicada em
 * js/offline/outbox.js: a chamada é feita na quadra, onde o sinal cai, e o
 * upsert por (session_id, student_id) pode ser reenviado quantas vezes for
 * preciso sem duplicar nada.
 *
 * Para as telas, nada disso aparece: `setAttendance` continua sendo "grava a
 * presença". Sem rede, ela grava no aparelho e entra na fila; com rede, vai
 * direto para o Supabase. Foi assim que a chamada passou a funcionar offline
 * sem uma linha de mudança em js/agenda/aula.js.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey, patchCache, readCache } from '../offline/cache.js';
import { enqueue } from '../offline/outbox.js';
import { isOffline } from '../offline/status.js';

const COLUMNS = 'id, session_id, student_id, status, notes, updated_at';

/** A cópia local da chamada de uma sessão. */
function sessionCacheKey(userId, sessionId) {
  return cacheKey(userId, 'attendance', 'session', sessionId);
}

export async function listAttendanceForSession(userId, sessionId) {
  return cachedRead(sessionCacheKey(userId, sessionId), async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('session_id', sessionId);

    if (error) throw error;
    return data;
  });
}

/** Histórico de um aluno, com a data da aula — usado no perfil. */
export async function listAttendanceForStudent(userId, studentId) {
  return cachedRead(cacheKey(userId, 'attendance', 'student', studentId), async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select(`${COLUMNS}, class_sessions (session_date, start_time, classes (name))`)
      .eq('user_id', userId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  });
}

/**
 * Marca a presença. É um upsert pela constraint `attendance_unique`
 * (session_id, student_id): tocar de novo no botão sobrescreve em vez de
 * duplicar, e permite corrigir a chamada depois (spec, seção 19).
 *
 * Sem conexão, a marcação vai para a fila local e a tela continua igual — o
 * indicador da topbar passa a mostrar quantas alterações ainda vão subir.
 */
export async function setAttendance(userId, { session_id, student_id, status }, options = {}) {
  if (isOffline()) {
    return queueOffline(userId, { session_id, student_id, status, op: 'upsert' }, options);
  }

  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      { user_id: userId, session_id, student_id, status },
      { onConflict: 'session_id,student_id' },
    )
    .select(COLUMNS)
    .single();

  if (error) throw error;

  await patchCache(sessionCacheKey(userId, session_id), (rows) =>
    [...(rows ?? []).filter((row) => row.student_id !== student_id), data],
  );

  return data;
}

export async function clearAttendance(userId, sessionId, studentId, options = {}) {
  if (isOffline()) {
    await queueOffline(
      userId,
      { session_id: sessionId, student_id: studentId, status: null, op: 'delete' },
      options,
    );
    return;
  }

  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .eq('student_id', studentId);

  if (error) throw error;

  await patchCache(sessionCacheKey(userId, sessionId), (rows) =>
    (rows ?? []).filter((row) => row.student_id !== studentId),
  );
}

/* ============================================================
   Caminho offline
   ============================================================ */

/**
 * Guarda a alteração no aparelho e atualiza a cópia local da chamada.
 *
 * O `updated_at` que vai para a fila é o do SERVIDOR — o que estava na cópia
 * local antes deste toque. É contra ele que a sincronização vai comparar para
 * saber se alguém mexeu na mesma linha enquanto o professor estava sem sinal
 * (ver js/offline/sync.js). Por isso a linha otimista gravada aqui NÃO recebe
 * um updated_at novo: inventar um faria a comparação mentir.
 */
async function queueOffline(userId, { session_id, student_id, status, op }, { label } = {}) {
  const cached = await readCache(sessionCacheKey(userId, session_id));
  const known = (cached?.data ?? []).find((row) => row.student_id === student_id) ?? null;

  await enqueue({
    userId,
    table: 'attendance',
    op,
    match: { session_id, student_id },
    payload: { status },
    baseUpdatedAt: known?.updated_at ?? null,
    label: label ?? 'Frequência',
  });

  const optimistic = {
    ...(known ?? { id: null, session_id, student_id, notes: null, updated_at: null }),
    status,
    pending_offline: true,
  };

  await patchCache(sessionCacheKey(userId, session_id), (rows) => {
    const others = (rows ?? []).filter((row) => row.student_id !== student_id);
    return op === 'delete' ? others : [...others, optimistic];
  });

  return optimistic;
}
