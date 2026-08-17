import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const page = (...segments) => resolve(root, ...segments);

/**
 * A chave do frontend PRECISA ser a anônima. A service_role ignora todo o RLS:
 * publicada no bundle, ela entrega leitura e escrita irrestritas do banco para
 * qualquer pessoa que abrir o site. É o erro mais caro possível nesta
 * arquitetura, e as duas chaves ficam lado a lado no painel do Supabase — então
 * o build confere em vez de confiar.
 *
 * Cobre os dois formatos: as chaves novas (`sb_secret_...`) e as antigas, que
 * são JWT com o papel no payload.
 */
function assertNotServiceRole(key) {
  if (key.startsWith('sb_secret_')) {
    return 'ela é uma chave secreta (sb_secret_...)';
  }

  const parts = key.split('.');
  if (parts.length !== 3) return null; // não é JWT: nada a conferir aqui

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role && payload.role !== 'anon') {
      return `o papel dentro dela é "${payload.role}", e não "anon"`;
    }
  } catch {
    return null; // payload ilegível: deixa o Supabase reclamar em runtime
  }
  return null;
}

// O projeto é uma MPA: cada tela é um documento HTML real com seu próprio módulo
// de entrada. Todo arquivo .html precisa ser declarado aqui para entrar no build.
export default defineConfig(({ command, mode }) => {
  // loadEnv lê os arquivos .env E as variáveis de ambiente com o prefixo VITE_,
  // então isto também funciona na Vercel, onde não existe arquivo .env.
  const env = loadEnv(mode, root, 'VITE_');

  // Sem as variáveis, js/supabase.js lança logo no topo do módulo. O Rollup
  // consegue provar isso em tempo de build, trata o createClient como código
  // morto e REMOVE o supabase-js inteiro do bundle — e o build passa mesmo
  // assim, publicando um site que só sabe mostrar erro. Melhor falhar aqui.
  if (command === 'build' && (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY)) {
    throw new Error(
      'Build interrompido: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não estão definidas.\n' +
        '  Local:  copie .env.example para .env e preencha.\n' +
        '  Vercel: cadastre as duas em Settings > Environment Variables.',
    );
  }

  const wrongKey = env.VITE_SUPABASE_ANON_KEY && assertNotServiceRole(env.VITE_SUPABASE_ANON_KEY);
  if (wrongKey) {
    throw new Error(
      `Build interrompido: VITE_SUPABASE_ANON_KEY não é a chave anônima — ${wrongKey}.\n` +
        '  Esta chave ignora o Row Level Security. Publicada no bundle, ela expõe\n' +
        '  o banco inteiro para qualquer visitante.\n' +
        '  Use a chave "anon / public / publishable" em Project Settings > API Keys.\n' +
        '  E revogue a chave secreta que chegou a ser usada.',
    );
  }

  return {
    appType: 'mpa',
    build: {
      rollupOptions: {
        input: {
          index: page('index.html'),
          login: page('login.html'),
          dashboard: page('pages/dashboard.html'),
          alunos: page('pages/alunos.html'),
          aluno: page('pages/aluno.html'),
          turmas: page('pages/turmas.html'),
          turma: page('pages/turma.html'),
          agenda: page('pages/agenda.html'),
          aula: page('pages/aula.html'),
          planejamentos: page('pages/planejamentos.html'),
        },
      },
    },
    server: {
      port: 5173,
      open: '/login.html',
    },
  };
});
