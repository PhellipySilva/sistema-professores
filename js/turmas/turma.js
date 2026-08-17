/* Controller da página "turma".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('turma');

render(
  $('#page-content'),
  emptyState({
    iconName: 'users',
    title: 'Detalhe da turma',
    message: 'Horários, alunos matriculados e próximas aulas chegam na Fase 4.',
  }),
);
