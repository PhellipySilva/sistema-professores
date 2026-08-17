/* Controller da página "aula".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('aula');

render(
  $('#page-content'),
  emptyState({
    iconName: 'check',
    title: 'Chamada',
    message: 'A lista de presença da aula chega na Fase 6.',
  }),
);
