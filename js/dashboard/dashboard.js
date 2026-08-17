/* Controller da página "dashboard".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('dashboard');

render(
  $('#page-content'),
  emptyState({
    iconName: 'dashboard',
    title: 'Dashboard',
    message: 'Indicadores, aulas do dia e atalhos chegam na Fase 10.',
  }),
);
