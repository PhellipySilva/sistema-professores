/* Leitura com cache local: o que faz o sistema abrir sem internet.
 *
 * COMO FUNCIONA
 *
 *   Online   → busca no Supabase, DEVOLVE o resultado e guarda uma cópia local.
 *   Offline  → devolve a última cópia guardada daquela mesma consulta.
 *   Sem cópia e sem rede → o erro sobe, e a tela mostra o estado de erro que
 *                          ela já sabia mostrar. Inventar lista vazia seria
 *                          pior: "nenhum aluno cadastrado" é uma mentira.
 *
 * O Supabase continua sendo o banco principal. Nada aqui decide conteúdo: o
 * cache é sempre uma FOTOGRAFIA da última resposta do servidor, gravada com a
 * mesma forma que a tela já esperava — por isso nenhuma tela precisou mudar
 * para funcionar offline.
 *
 * A CHAVE INCLUI O user_id
 *
 *   `cacheKey(userId, 'students')`. Dois professores no mesmo aparelho não
 *   enxergam o cache um do outro, e o logout apaga tudo (ver idb.clearOfflineData).
 */

import { idbGet, idbPut, STORE_CACHE } from './idb.js';
import { browserIsOffline, goOffline, goOnline, isNetworkError } from './status.js';

/** 'a1b2:students' · 'a1b2:sessions:2026-08-01:2026-08-31' */
export function cacheKey(userId, ...parts) {
  return [userId ?? 'anon', ...parts].join(':');
}

export async function readCache(key) {
  const row = await idbGet(STORE_CACHE, key);
  return row ?? null;
}

export async function writeCache(key, data) {
  await idbPut(STORE_CACHE, { key, data, savedAt: new Date().toISOString() });
}

/**
 * Executa a consulta com rede e cache, na ordem certa.
 *
 * @param {string}   key      chave da consulta (use cacheKey)
 * @param {Function} fetcher  async () => dados — a consulta ao Supabase
 * @returns {Promise<*>} os dados, do servidor ou da última cópia local
 */
export async function cachedRead(key, fetcher) {
  // Só desiste da rede quando o navegador tem certeza de que ela não existe.
  // Estar "em modo offline" por causa de uma falha anterior NÃO impede tentar:
  // é assim que o sistema volta sozinho quando o sinal reaparece.
  if (browserIsOffline()) {
    const cached = await readCache(key);
    if (cached) return cached.data;

    // Sem rede e sem cópia: não há o que mostrar. A mensagem explica o motivo em
    // vez de deixar a tela dizer "tente novamente" para sempre.
    throw offlineWithoutCacheError();
  }

  try {
    const data = await fetcher();
    // Sem `await`: gravar o cache não pode atrasar a tela que o professor pediu.
    writeCache(key, data).catch((error) => console.warn('[offline] falha ao gravar cache', error));
    goOnline();
    return data;
  } catch (error) {
    // Erro de banco (migration faltando, RLS, coluna inexistente) sobe inteiro:
    // chamar isso de "offline" esconderia o problema real de quem precisa vê-lo.
    if (!isNetworkError(error)) throw error;

    goOffline();

    const cached = await readCache(key);
    if (cached) return cached.data;
    throw offlineWithoutCacheError();
  }
}

function offlineWithoutCacheError() {
  const error = new Error(
    'Sem conexão e sem cópia local desta informação. Conecte-se à internet uma ' +
      'vez para que ela fique disponível offline.',
  );
  error.code = 'OFFLINE_NO_CACHE';
  return error;
}

/**
 * Altera a cópia local sem ir à rede.
 *
 * É o que mantém a tela coerente depois de uma escrita feita offline: a
 * frequência marcada na quadra precisa continuar marcada se o professor sair da
 * página e voltar, mesmo antes de subir para o Supabase.
 *
 * @param {Function} updater  (dadosAtuais) => novosDados
 */
export async function patchCache(key, updater) {
  const cached = await readCache(key);
  if (!cached) return;

  try {
    await writeCache(key, updater(cached.data));
  } catch (error) {
    console.warn('[offline] falha ao atualizar cache local', error);
  }
}
