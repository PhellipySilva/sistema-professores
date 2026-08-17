/* Controller da página "turmas".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('turmas');

render(
  $('#page-content'),
  emptyState({
    iconName: 'users',
    title: 'Módulo de turmas',
    message: 'Criação, edição, horários e matrícula de alunos chegam na Fase 4.',
  }),
);
