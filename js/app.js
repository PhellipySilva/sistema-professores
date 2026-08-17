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

import { renderLayout } from './components/layout.js';

/**
 * Prepara a página e devolve o contexto para o controller.
 *
 * @param {string} pageId  Identificador da página (ex.: 'alunos', 'agenda').
 * @returns {Promise<{ user: object|null }>}
 */
export async function initPage(pageId) {
  // FASE 2: aqui entra a guarda de sessão.
  //   const session = await requireAuth();   // redireciona para /login.html se não houver
  //   const user = session.user;
  const user = null;
  const onLogout = null;

  renderLayout({ pageId, user, onLogout });
  revealPage();

  return { user };
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
