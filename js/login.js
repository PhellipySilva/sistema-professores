/* Tela de login.
 *
 * FASE 1: a tela existe e é navegável, mas ainda não autentica.
 * FASE 2: este arquivo passa a chamar signIn() de js/auth.js.
 */

import { $ } from './utils/dom.js';

const form = $('#login-form');
const errorMessage = $('#login-error');

form.addEventListener('submit', (event) => {
  event.preventDefault();

  errorMessage.textContent = 'Autenticação chega na Fase 2.';
  errorMessage.classList.remove('hidden');
});
