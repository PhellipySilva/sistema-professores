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

  return { session, user: session.user };
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
  return userMessage;
}
