/* Controller da página "aluno".
 *
 * FASE 1: a página existe, carrega o shell e mostra seu estado vazio.
 * O conteúdo real chega na fase indicada na mensagem abaixo.
 */

import { initPage } from '../app.js';
import { emptyState } from '../components/empty-state.js';
import { $, render } from '../utils/dom.js';

await initPage('aluno');

render(
  $('#page-content'),
  emptyState({
    iconName: 'user',
    title: 'Perfil do aluno',
    message: 'Dados, frequência, reposições e pagamentos chegam na Fase 3.',
  }),
);
