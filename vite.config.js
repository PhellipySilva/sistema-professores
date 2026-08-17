import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const page = (...segments) => resolve(root, ...segments);

// O projeto é uma MPA: cada tela é um documento HTML real com seu próprio módulo
// de entrada. Todo arquivo .html precisa ser declarado aqui para entrar no build.
export default defineConfig({
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
});
