/* Acesso a dados: perfil do professor logado.
 *
 * A tabela `profiles` é preenchida pelo trigger `on_auth_user_created`
 * (0003_triggers.sql) no momento em que a conta nasce: nome vindo do cadastro
 * ou, na falta dele, a parte do e-mail antes do @.
 *
 * A chave aqui é `id`, e não `user_id` — o id do perfil É o id do usuário.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

/**
 * Os outros professores do sistema — id e nome, nada mais.
 *
 * Passa pela função `list_teachers()` (migration 0010) porque `profiles` é
 * fechado por RLS e continua assim: ninguém lê a linha de ninguém. A função
 * devolve o mínimo necessário para escolher com quem compartilhar um
 * planejamento, e nunca o e-mail.
 *
 * Sem cache local: é uma lista curta, pedida só quando o modal de
 * compartilhamento abre, e uma cópia velha aqui esconderia um colega novo.
 */
export async function listTeachers() {
  const { data, error } = await supabase.rpc('list_teachers');

  if (error) throw error;
  return data ?? [];
}

/**
 * Perfil do usuário logado, ou null se a linha ainda não existir.
 *
 * Devolve null em vez de lançar quando não encontra: o nome no cabeçalho é
 * enfeite comparado ao resto da tela, e uma falha aqui não pode impedir o
 * professor de trabalhar. Quem chama fica com o nome de reserva.
 */
export async function getProfile(userId) {
  try {
    return await cachedRead(cacheKey(userId, 'profile'), async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    });
  } catch (error) {
    // Inclui o caso "offline e sem cópia local": o cabeçalho fica com o nome de
    // reserva, e nada mais na tela depende disto.
    console.error('[profiles] não foi possível ler o perfil', error);
    return null;
  }
}
