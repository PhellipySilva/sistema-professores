/* Estado da conexão — a única fonte da verdade sobre "estamos online?".
 *
 * `navigator.onLine` não basta: ele diz que existe uma rede, não que o Supabase
 * responde. Wi-Fi de clube com portal de login, 4G que oscila na quadra e VPN
 * caída são todos `onLine === true` com requisição falhando. Por isso o estado
 * daqui é alimentado por DOIS sinais:
 *
 *   1. os eventos `online` / `offline` do navegador;
 *   2. o que realmente aconteceu na última requisição (ver cache.js).
 *
 * Arquivo sem dependência nenhuma de propósito: quem observa (o indicador da
 * topbar) e quem sincroniza (sync.js) dependem dele, e não o contrário.
 */

/** online · offline · syncing · synced (transitório, volta para online) */
const listeners = new Set();

const state = {
  status: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  pending: 0,
  lastSyncAt: null,
};

let syncedTimer = null;

export function connectionState() {
  return { ...state };
}

/**
 * O estado que a INTERFACE mostra e que decide se uma escrita vai para a fila.
 * Fica offline tanto quando o navegador avisa quanto quando uma requisição
 * falhou por rede.
 */
export function isOffline() {
  return state.status === 'offline';
}

/**
 * O navegador tem CERTEZA de que não há rede?
 *
 * Diferente de `isOffline()`, e a diferença importa: o estado da interface pode
 * estar em "offline" só porque uma requisição falhou. Se a leitura seguinte
 * também desistisse sem tentar, um tropeço de rede prenderia o sistema em modo
 * offline para sempre — `navigator.onLine` continua true, então o evento
 * `online` nunca chegaria para desfazer o engano.
 *
 * Por isso quem lê (cache.js) só pula a rede quando ESTA função diz que sim; nos
 * demais casos tenta de novo, e um sucesso devolve o sistema ao normal sozinho.
 */
export function browserIsOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * @param {Function} listener  recebe o estado a cada mudança
 * @returns {Function} cancela a inscrição
 */
export function subscribe(listener) {
  listeners.add(listener);
  listener(connectionState());
  return () => listeners.delete(listener);
}

function emit() {
  for (const listener of listeners) {
    try {
      listener(connectionState());
    } catch (error) {
      console.warn('[offline] observador do status falhou', error);
    }
  }
}

/** Quantas escritas ainda esperam para subir. Alimentado por outbox.js. */
export function setPending(count) {
  if (state.pending === count) return;
  state.pending = count;
  emit();
}

function setStatus(next) {
  if (state.status === next) return;

  clearTimeout(syncedTimer);
  state.status = next;
  emit();
}

export function goOffline() {
  setStatus('offline');
}

/** Voltou a responder. Avisa os interessados (sync.js escuta isto). */
export function goOnline() {
  if (state.status === 'online') return;
  setStatus('online');
  window.dispatchEvent(new CustomEvent('matchphoint:online'));
}

export function goSyncing() {
  setStatus('syncing');
}

/**
 * Sincronização concluída: mostra "✓ Sincronizado" por alguns segundos e depois
 * volta para "● Online". O selo é uma confirmação, não um estado permanente —
 * deixá-lo fixo faria o professor parar de reparar nele.
 */
export function goSynced() {
  state.lastSyncAt = new Date().toISOString();
  setStatus('synced');

  syncedTimer = setTimeout(() => {
    if (state.status === 'synced') setStatus('online');
  }, 4000);
}

/* ============================================================
   Sinais do navegador
   ============================================================ */

if (typeof window !== 'undefined') {
  window.addEventListener('offline', goOffline);
  window.addEventListener('online', goOnline);
}

/**
 * O erro que acabou de acontecer é falta de conexão, e não um erro do banco?
 *
 * Distinguir os dois é o que impede o sistema de dizer "modo offline" quando na
 * verdade faltou aplicar uma migration ou o RLS barrou a linha. O `fetch` só
 * rejeita por motivo de rede; erro de banco chega com código PostgREST.
 */
export function isNetworkError(error) {
  if (!error) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;

  const message = String(error.message ?? error).toLowerCase();

  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('fetch failed') ||
    message.includes('err_internet_disconnected')
  );
}
