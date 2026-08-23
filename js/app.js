/* Bootstrap comum de toda página protegida.
 *
 * Cada controller de página começa com:
 *
 *   const { user } = await initPage('alunos');
 *
 * Aqui ficam as três coisas que TODA página precisa fazer, na ordem certa:
 *   1. garantir que existe sessão;
 *   2. montar o shell (sidebar / bottom nav);
 *   3. revelar o corpo, que nasce invisível.
 */

import { requireAuth, signOut, watchSession } from './auth.js';
import { getProfile } from './api/profiles.js';
import { displayName, renderLayout, setUserName } from './components/layout.js';
import { toast } from './components/toast.js';
import { registerServiceWorker } from './offline/register-sw.js';
import { refreshPendingCount } from './offline/outbox.js';
import { startAutoSync } from './offline/sync.js';
import { reviewConflicts } from './offline/conflitos-ui.js';

/**
 * Prepara a página e devolve o contexto para o controller.
 *
 * @param {string} pageId  Identificador da página (ex.: 'alunos', 'agenda').
 * @returns {Promise<{ session: object, user: object }>}
 */
export async function initPage(pageId) {
  // Sem sessão, esta chamada redireciona e nunca resolve — nada abaixo roda.
  const session = await requireAuth();

  watchSession();
  renderLayout({ pageId, user: session.user, onLogout: signOut });
  revealPage();
  loadUserName(session.user);
  startOfflineSupport(session.user);

  return { session, user: session.user };
}

/**
 * Liga o funcionamento offline da página: Service Worker, contagem de
 * pendências, sincronização automática e revisão de conflitos.
 *
 * SEM `await`, como o nome do professor: nada disto pode atrasar a tela. O
 * sistema abre com o que tiver — cache local ou servidor — e a fila sobe por
 * baixo quando houver conexão.
 */
function startOfflineSupport(user) {
  registerServiceWorker();

  refreshPendingCount(user.id).catch((error) =>
    console.warn('[offline] não foi possível contar as pendências', error),
  );

  startAutoSync(user.id, ({ sent, conflicts }) => {
    if (sent > 0) {
      toast.success(
        sent === 1
          ? 'Sincronizado: 1 alteração feita offline foi enviada.'
          : `Sincronizado: ${sent} alterações feitas offline foram enviadas.`,
      );
    }
    if (conflicts > 0) reviewConflicts(user.id);
  });

  // Conflitos que ficaram de uma sessão anterior continuam esperando decisão.
  reviewConflicts(user.id).catch((error) =>
    console.warn('[offline] não foi possível ler os conflitos', error),
  );
}

/**
 * Busca o nome do professor em `profiles` e corrige o cabeçalho quando chega.
 *
 * SEM `await` de propósito: o shell já foi montado com o nome de reserva (a
 * parte do e-mail antes do @), e uma consulta a mais não pode atrasar a tela que
 * o professor veio ver. Se falhar, o nome de reserva fica — e falhar aqui não
 * gera erro visível, porque nada do trabalho dele depende disto.
 */
function loadUserName(user) {
  getProfile(user.id).then((profile) => {
    if (profile) setUserName(displayName(user, profile));
  });
}

/** Tira a classe que mantém o <body> invisível durante o boot. */
export function revealPage() {
  document.body.classList.remove('app-booting');
}

/**
 * Trata um erro vindo do Supabase (spec, seção 30).
 * Detalhe técnico vai para o console; o usuário recebe uma frase em português.
 *
 * @param {unknown} error
 * @param {string}  userMessage  O que mostrar na tela.
 * @returns {string} a própria userMessage, para encadear.
 */
export function handleError(error, userMessage) {
  console.error(`[erro] ${userMessage}`, error);
  return schemaErrorMessage(error) ?? userMessage;
}

/* Códigos que o PostgREST usa quando o banco não tem o que o código pede.
     PGRST204  coluna ausente num insert/update
     PGRST205  tabela ausente
     42703     coluna ausente num select (erro cru do Postgres) */
const SCHEMA_ERROR_CODES = new Set(['PGRST204', 'PGRST205', '42703']);

/**
 * Traduz "o banco está atrás do código" — sempre uma migration não aplicada.
 *
 * Existe porque a mensagem padrão dessas telas é "Tente novamente", e aqui
 * tentar de novo não resolve nunca: a coluna vai continuar faltando. Dizer o
 * que realmente aconteceu é o oposto de esconder o erro — o objeto original
 * continua indo inteiro para o console.
 */
function schemaErrorMessage(error) {
  if (!SCHEMA_ERROR_CODES.has(error?.code)) return null;

  return (
    'O banco de dados está desatualizado: falta aplicar uma migration de ' +
    'supabase/migrations no SQL Editor do Supabase. Abra o console (F12) para ' +
    'ver qual coluna ou tabela está faltando.'
  );
}
