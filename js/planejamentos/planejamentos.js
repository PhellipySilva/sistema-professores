/* Controller da página "planejamentos".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('planejamentos');

render(
  $('#page-content'),
  emptyState({
    iconName: 'clipboard',
    title: 'Planejamento de aulas',
    message: 'Criar, editar, visualizar e excluir planejamentos chega na Fase 9.',
  }),
);
