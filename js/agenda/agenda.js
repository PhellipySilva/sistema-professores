/* Controller da página "agenda".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('agenda');

render(
  $('#page-content'),
  emptyState({
    iconName: 'calendar',
    title: 'Agenda',
    message: 'Calendário mensal e sessões de aula chegam na Fase 5.',
  }),
);
