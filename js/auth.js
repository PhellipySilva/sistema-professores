/* Autenticação (spec, seção 6).
 *
 * Este e js/api/ são os únicos arquivos que falam com o Supabase.
 *
 * O supabase-js guarda a sessão no localStorage e renova o token sozinho — não
 * guardamos token na mão em lugar nenhum, e nenhuma senha passa pelo banco de
 * dados da aplicação.
 */

import { supabase } from './supabase.js';
import { clearOfflineData } from './offline/idb.js';
import { syncOutbox } from './offline/sync.js';

export const LOGIN_PAGE = '/login.html';
export const HOME_PAGE = '/pages/dashboard.html';

/**
 * Sessão atual, ou null.
 * Lê do localStorage — não faz requisição de rede.
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('[auth] falha ao ler a sessão', error);
    return null;
  }
  return data.session ?? null;
}

/**
 * Entra no sistema.
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[auth] falha no login', error);
    return { ok: false, message: friendlyAuthError(error) };
  }
  return { ok: true };
}

/**
 * Sai do sistema e volta para o login.
 *
 * Antes de sair, tenta subir o que ficou pendente e APAGA o banco local. O
 * aparelho pode ser compartilhado, e o cache offline guarda nome, telefone e
 * situação financeira dos alunos de quem estava logado — sair da conta tem que
 * levar esses dados junto.
 */
export async function signOut() {
  await flushAndClearOfflineData();

  const { error } = await supabase.auth.signOut();

  if (error) {
    // Mesmo com erro, vale limpar a tela: a sessão local já foi descartada.
    console.error('[auth] falha no logout', error);
  }
  window.location.replace(LOGIN_PAGE);
}

/** Última tentativa de sincronizar antes de o cache local ser apagado. */
async function flushAndClearOfflineData() {
  try {
    const session = await getSession();
    if (session?.user?.id) await syncOutbox(session.user.id);
  } catch (error) {
    // Falhar aqui não pode impedir o logout: a pendência que não subiu é menos
    // grave do que o professor não conseguir sair da conta.
    console.warn('[auth] não foi possível sincronizar antes de sair', error);
  }

  try {
    await clearOfflineData();
  } catch (error) {
    console.warn('[auth] não foi possível limpar o banco local', error);
  }
}

/**
 * Guarda das páginas protegidas.
 *
 * Sem sessão, manda para o login e NUNCA RESOLVE. Isso é proposital:
 * `location.replace` só troca de documento no fim do turno atual, então sem
 * esta promessa pendente o resto do controller continuaria rodando e tentaria
 * buscar dados que o usuário não pode ver.
 *
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session) {
    window.location.replace(LOGIN_PAGE);
    return new Promise(() => {});
  }
  return session;
}

/** Usado no login e na porta de entrada: quem já está logado não vê o formulário. */
export async function redirectIfAuthenticated() {
  const session = await getSession();

  if (session) {
    window.location.replace(HOME_PAGE);
    return new Promise(() => {});
  }
  return null;
}

/**
 * Reage à sessão morrer com a aba aberta — token expirado, logout em outra aba,
 * conta removida. Sem isso, a tela continuaria mostrando dados velhos e toda
 * requisição falharia em silêncio.
 */
export function watchSession() {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      window.location.replace(LOGIN_PAGE);
    }
  });
}

/**
 * Traduz o erro do Supabase para uma frase em português (spec, seção 30).
 * O objeto original já foi para o console em quem chamou.
 */
export function friendlyAuthError(error) {
  const message = error?.message ?? '';

  if (/invalid login credentials/i.test(message)) {
    return 'E-mail ou senha inválidos.';
  }
  if (/email not confirmed/i.test(message)) {
    return 'Este e-mail ainda não foi confirmado.';
  }
  if (/too many requests|rate limit/i.test(message)) {
    return 'Muitas tentativas. Aguarde um instante e tente de novo.';
  }
  if (/failed to fetch|network/i.test(message)) {
    return 'Sem conexão com o servidor. Verifique sua internet.';
  }
  return 'Não foi possível entrar. Tente novamente.';
}
