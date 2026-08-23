/* IndexedDB em quatro funções.
 *
 * Não é um "ORM offline": é o mínimo para guardar três coisas no navegador —
 * o que já foi lido do Supabase, o que ainda falta enviar e os conflitos que a
 * sincronização não pode resolver sozinha.
 *
 * POR QUE IndexedDB E NÃO localStorage
 *
 *   localStorage é síncrono (trava a thread da interface), guarda só texto e
 *   estoura por volta de 5 MB. A lista de alunos, turmas, agenda e frequência
 *   de um professor passa disso com facilidade, e serializar tudo a cada
 *   gravação travaria a rolagem no meio da chamada. IndexedDB é assíncrono e
 *   guarda objetos como eles são.
 *
 * TUDO AQUI FALHA EM SILÊNCIO, DE PROPÓSITO
 *
 *   Navegação anônima, armazenamento bloqueado pelo usuário, cota estourada:
 *   nesses casos o banco local simplesmente não existe. O sistema tem que
 *   continuar funcionando online exatamente como antes — perder o cache é
 *   perder uma comodidade, não uma funcionalidade. Por isso toda função devolve
 *   null/false em vez de lançar.
 */

const DB_NAME = 'matchphoint-offline';
const DB_VERSION = 1;

/** cache: leituras já feitas · outbox: escritas pendentes · conflicts: choques */
export const STORE_CACHE = 'cache';
export const STORE_OUTBOX = 'outbox';
export const STORE_CONFLICTS = 'conflicts';

const STORES = [STORE_CACHE, STORE_OUTBOX, STORE_CONFLICTS];

let dbPromise = null;

/** O navegador tem IndexedDB utilizável? */
export function isIdbAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb() {
  if (!isIdbAvailable()) return Promise.resolve(null);

  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let request;

      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        console.warn('[offline] IndexedDB indisponível', error);
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        for (const store of STORES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'key' });
          }
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('[offline] não foi possível abrir o banco local', request.error);
        resolve(null);
      };
      // Outra aba segurando uma versão antiga: seguir sem cache é melhor do que
      // deixar a página presa esperando por ela.
      request.onblocked = () => resolve(null);
    });
  }

  return dbPromise;
}

function run(storeName, mode, action) {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }

        let transaction;
        try {
          transaction = db.transaction(storeName, mode);
        } catch (error) {
          console.warn('[offline] transação recusada', error);
          resolve(null);
          return;
        }

        const request = action(transaction.objectStore(storeName));

        transaction.onerror = () => {
          console.warn('[offline] transação falhou', transaction.error);
          resolve(null);
        };
        transaction.onabort = () => resolve(null);

        if (request) {
          request.onsuccess = () => resolve(request.result ?? null);
        } else {
          transaction.oncomplete = () => resolve(null);
        }
      }),
  );
}

/** @returns {Promise<object|null>} o registro inteiro (com a chave), ou null */
export function idbGet(storeName, key) {
  return run(storeName, 'readonly', (store) => store.get(key));
}

/** O objeto PRECISA ter a propriedade `key`: ela é o keyPath de todos os stores. */
export function idbPut(storeName, value) {
  return run(storeName, 'readwrite', (store) => store.put(value));
}

export function idbDelete(storeName, key) {
  return run(storeName, 'readwrite', (store) => store.delete(key));
}

export function idbAll(storeName) {
  return run(storeName, 'readonly', (store) => store.getAll()).then((rows) => rows ?? []);
}

export function idbClear(storeName) {
  return run(storeName, 'readwrite', (store) => store.clear());
}

/**
 * Apaga TODO o banco local.
 *
 * Chamado no logout: o aparelho pode ser compartilhado, e o cache guarda nome,
 * telefone e situação financeira dos alunos de quem estava logado.
 */
export async function clearOfflineData() {
  for (const store of STORES) {
    await idbClear(store);
  }
}
