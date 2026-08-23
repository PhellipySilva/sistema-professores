/* A fila de escritas que ainda não subiram para o Supabase.
 *
 * O QUE PODE SER FEITO OFFLINE — E POR QUE SÓ ISSO
 *
 *   A pergunta certa não é "o que dá para gravar no navegador?" (tudo dá), e
 *   sim "o que pode ser reenviado depois sem inventar dado nem apagar o de
 *   ninguém?". Só uma operação passa nesse teste com folga:
 *
 *     FREQUÊNCIA (attendance) — é um upsert por (session_id, student_id). Não
 *     cria id novo, não depende de nada que ainda não exista, e repetir o envio
 *     dá o mesmo resultado. É também a única coisa que o professor precisa
 *     fazer com o celular na mão, na quadra, onde o sinal cai.
 *
 *   Cadastrar aluno, criar turma ou registrar pagamento ficam de fora de
 *   propósito: são inserts que geram identificadores e disparam consequências
 *   (mensalidade do mês, aviso de vaga, matrícula em turma) que o servidor
 *   precisa validar na hora. Enfileirá-los offline criaria alunos duplicados e
 *   contas erradas — um estrago maior do que a espera pelo sinal voltar.
 *
 *   Marcar a chamada de uma aula AINDA NÃO MATERIALIZADA também fica de fora:
 *   a sessão precisa existir no banco antes, e criá-la localmente exigiria
 *   inventar um id que pode colidir com o que outro aparelho criou.
 *
 * CONFLITO
 *
 *   Cada item guarda o `updated_at` que a linha tinha quando a alteração foi
 *   feita offline. Na hora de subir, sync.js compara com o que está no servidor.
 *   Se mudou no meio do caminho, NADA é sobrescrito: o choque vai para a lista
 *   de conflitos e quem decide é o professor.
 */

import { idbAll, idbDelete, idbPut, STORE_CONFLICTS, STORE_OUTBOX } from './idb.js';
import { setPending } from './status.js';

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Duas alterações da mesma linha são a mesma pendência. */
function signatureOf(item) {
  return `${item.table}:${JSON.stringify(item.match)}`;
}

/**
 * Põe uma escrita na fila.
 *
 * Tocar três vezes no mesmo aluno offline (presente → falta → presente) deixa
 * UM item, com o último valor — mas com o `baseUpdatedAt` do PRIMEIRO toque,
 * que é o estado do servidor que o professor realmente viu.
 *
 * @param {object} item  { table, op, match, payload, baseUpdatedAt, label, userId }
 * @returns {Promise<object>} o item gravado
 */
export async function enqueue(item) {
  const pending = await listOutbox(item.userId);
  const existing = pending.find((candidate) => signatureOf(candidate) === signatureOf(item));

  const record = {
    ...item,
    key: existing?.key ?? newId(),
    queuedAt: existing?.queuedAt ?? new Date().toISOString(),
    // O estado do servidor que vale é o do PRIMEIRO toque: é o que o professor
    // tinha à vista quando decidiu alterar. Os toques seguintes só trocam o valor.
    baseUpdatedAt: existing ? existing.baseUpdatedAt : (item.baseUpdatedAt ?? null),
    updatedAt: new Date().toISOString(),
  };

  await idbPut(STORE_OUTBOX, record);
  await refreshPendingCount(item.userId);
  return record;
}

/** Pendências do professor logado, na ordem em que foram feitas. */
export async function listOutbox(userId) {
  const rows = await idbAll(STORE_OUTBOX);

  return rows
    .filter((row) => !userId || row.userId === userId)
    .sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
}

export async function removeFromOutbox(key, userId) {
  await idbDelete(STORE_OUTBOX, key);
  await refreshPendingCount(userId);
}

export async function refreshPendingCount(userId) {
  const pending = await listOutbox(userId);
  setPending(pending.length);
  return pending.length;
}

/* ============================================================
   Conflitos
   ============================================================ */

/**
 * @param {object} conflict  { table, match, local, remote, label, userId }
 */
export async function recordConflict(conflict) {
  await idbPut(STORE_CONFLICTS, {
    key: newId(),
    detectedAt: new Date().toISOString(),
    ...conflict,
  });
}

export async function listConflicts(userId) {
  const rows = await idbAll(STORE_CONFLICTS);
  return rows.filter((row) => !userId || row.userId === userId);
}

export async function removeConflict(key) {
  await idbDelete(STORE_CONFLICTS, key);
}
