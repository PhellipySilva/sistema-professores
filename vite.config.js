import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const page = (...segments) => resolve(root, ...segments);

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
