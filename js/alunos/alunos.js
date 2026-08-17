/* Controller da página "alunos".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('alunos');

render(
  $('#page-content'),
  emptyState({
    iconName: 'user',
    title: 'Módulo de alunos',
    message: 'Listagem, busca, cadastro, edição e exclusão chegam na Fase 3.',
  }),
);
