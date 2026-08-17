/* Tela de login. */

import { redirectIfAuthenticated, signIn, HOME_PAGE } from './auth.js';
import { revealPage } from './app.js';
import { $ } from './utils/dom.js';

// Quem já está logado não vê o formulário. Só depois disso o corpo aparece.
await redirectIfAuthenticated();
revealPage();

const form = $('#login-form');
const emailInput = $('#email');
const passwordInput = $('#password');
const submitButton = $('#login-submit');
const errorMessage = $('#login-error');

emailInput.focus();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError('Preencha o e-mail e a senha.');
    return;
  }

  setLoading(true);
  const result = await signIn(email, password);

  if (!result.ok) {
    setLoading(false);
    showError(result.message);
    passwordInput.select();
    return;
  }

  // replace (e não href): o login não deve ficar no histórico do navegador,
  // senão o botão "voltar" traz o usuário logado de volta para cá.
  window.location.replace(HOME_PAGE);
});

function setLoading(loading) {
  submitButton.disabled = loading;
  submitButton.textContent = loading ? 'Entrando...' : 'Entrar';
  emailInput.disabled = loading;
  passwordInput.disabled = loading;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  errorMessage.textContent = '';
  errorMessage.classList.add('hidden');
}
