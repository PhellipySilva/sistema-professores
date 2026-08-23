/* Sincronização: subir o que ficou pendente quando a conexão volta.
 *
 * ESTRATÉGIA DE CONFLITO — não sobrescrever em silêncio
 *
 *   Cada pendência guardou o `updated_at` que a linha tinha no servidor quando
 *   a alteração foi feita offline. Antes de gravar, esta função lê a linha de
 *   novo e compara:
 *
 *     servidor igual ao que eu vi   → grava. É o caso normal.
 *     servidor mudou desde então    → NÃO grava. Vira um conflito, e a decisão
 *                                     é do professor (ver conflitos-ui.js).
 *     linha não existia e agora existe → também é conflito: alguém marcou
 *                                     aquela presença enquanto eu estava sem sinal.
 *
 *   É "last write wins" invertido: na dúvida, o servidor é preservado e a
 *   pergunta é feita. Numa chamada, sobrescrever calado significaria trocar a
 *   presença que outro aparelho marcou por uma falta — sem ninguém ver.
 */

import { supabase } from '../supabase.js';
import { patchCache, cacheKey } from './cache.js';
import {
  listOutbox,
  recordConflict,
  refreshPendingCount,
  removeFromOutbox,
} from './outbox.js';
import { goOffline, goSynced, goSyncing, isNetworkError, isOffline } from './status.js';
import { isConflict } from './conflitos.js';

let running = false;

/**
 * Envia tudo o que está na fila.
 *
 * Reentrante por bandeira: o evento `online` e o retorno de uma consulta podem
 * disparar a sincronização ao mesmo tempo, e enviar a mesma pendência duas
 * vezes criaria o conflito que ela mesma deveria evitar.
 *
 * @returns {Promise<{sent: number, conflicts: number}>}
 */
export async function syncOutbox(userId) {
  if (running || isOffline()) return { sent: 0, conflicts: 0 };

  const pending = await listOutbox(userId);
  if (pending.length === 0) return { sent: 0, conflicts: 0 };

  running = true;
  goSyncing();

  let sent = 0;
  let conflicts = 0;

  try {
    for (const item of pending) {
      const outcome = await sendOne(item);

      if (outcome === 'network') {
        // A conexão caiu no meio: o resto da fila continua guardado, sem perda.
        goOffline();
        break;
      }

      if (outcome === 'conflict') conflicts += 1;
      else sent += 1;

      await removeFromOutbox(item.key, userId);
    }
  } finally {
    running = false;
    await refreshPendingCount(userId);
  }

  if (sent > 0 || conflicts > 0) goSynced();
  return { sent, conflicts };
}

/**
 * @returns {Promise<'sent'|'conflict'|'network'|'dropped'>}
 */
async function sendOne(item) {
  if (item.table !== 'attendance') {
    console.warn('[offline] pendência de tabela desconhecida foi descartada', item);
    return 'dropped';
  }

  try {
    const current = await readAttendance(item);

    if (isConflict(item, current)) {
      await recordConflict({
        userId: item.userId,
        table: item.table,
        match: item.match,
        label: item.label,
        local: { op: item.op, status: item.payload?.status ?? null, at: item.updatedAt },
        remote: { status: current?.status ?? null, at: current?.updated_at ?? null },
      });
      return 'conflict';
    }

    await applyAttendance(item);
    return 'sent';
  } catch (error) {
    if (isNetworkError(error)) return 'network';

    // Erro de banco (RLS, migration faltando, linha apagada): reenviar não
    // resolve. Some da fila para não travar o resto — o console guarda o motivo.
    console.error('[offline] pendência descartada por erro do servidor', item, error);
    return 'dropped';
  }
}

async function readAttendance({ match, userId }) {
  const { data, error } = await supabase
    .from('attendance')
    .select('id, session_id, student_id, status, updated_at')
    .eq('user_id', userId)
    .eq('session_id', match.session_id)
    .eq('student_id', match.student_id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function applyAttendance(item) {
  if (item.op === 'delete') {
    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('user_id', item.userId)
      .eq('session_id', item.match.session_id)
      .eq('student_id', item.match.student_id);

    if (error) throw error;
    return;
  }

  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      {
        user_id: item.userId,
        session_id: item.match.session_id,
        student_id: item.match.student_id,
        status: item.payload.status,
      },
      { onConflict: 'session_id,student_id' },
    )
    .select('id, session_id, student_id, status, notes, updated_at')
    .single();

  if (error) throw error;

  // A cópia local passa a valer o que o servidor gravou — inclusive o
  // updated_at novo, que é a base de comparação da próxima alteração.
  await patchCache(cacheKey(item.userId, 'attendance', 'session', item.match.session_id), (rows) =>
    [...(rows ?? []).filter((row) => row.student_id !== item.match.student_id), data],
  );
}

/**
 * Reenvia uma alteração que o professor escolheu manter, mesmo com o servidor
 * tendo mudado. Aqui a sobrescrita é uma DECISÃO, não um efeito colateral.
 */
export async function forceAttendance({ userId, match, op, status }) {
  await applyAttendance({ userId, match, op, payload: { status } });
}

/* ============================================================
   Gatilhos
   ============================================================ */

/**
 * Liga a sincronização automática desta página.
 *
 * Dois gatilhos: a conexão voltar e a aba voltar a ficar visível. O segundo
 * cobre o caso em que o aparelho dormiu no bolso — o evento `online` já passou
 * quando o professor olha a tela de novo.
 */
export function startAutoSync(userId, onDone) {
  const run = async () => {
    const result = await syncOutbox(userId);
    if ((result.sent > 0 || result.conflicts > 0) && onDone) onDone(result);
  };

  window.addEventListener('matchphoint:online', run);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') run();
  });

  // E uma tentativa na abertura da página, para o que ficou de ontem.
  run();
}
