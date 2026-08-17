/* Cliente Supabase — instância única do projeto (spec, seções 2 e 32).
 *
 * Este é o ÚNICO arquivo que chama createClient. Todo acesso a dados passa por
 * js/api/*.js, que importa o `supabase` daqui.
 *
 * As duas variáveis abaixo ficam visíveis no bundle publicado. Isso é o
 * funcionamento oficial do Supabase e é seguro enquanto o Row Level Security
 * estiver ativo em todas as tabelas — o que é feito na Fase 2. A chave
 * service_role, que ignora RLS, nunca chega ao frontend.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase não configurado. Copie .env.example para .env e preencha ' +
      'VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // O supabase-js guarda a sessão no localStorage e renova o token sozinho.
    // Não guardamos token na mão em lugar nenhum.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
