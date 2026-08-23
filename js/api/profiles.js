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
