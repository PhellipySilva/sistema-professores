/* Tela de login e de criação de conta.
 *
 * São DOIS formulários no mesmo cartão, e só um visível de cada vez — nada de
 * uma segunda página com a mesma marca, o mesmo cartão e os mesmos campos. O
 * cadastro usa o Auth do Supabase e o trigger que já existe: o nome digitado
 * aqui é o que aparece para os outros professores no compartilhamento de
 * planejamentos (ver signUp em auth.js). */

import { redirectIfAuthenticated, signIn, signUp, HOME_PAGE } from './auth.js';
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

/* ============================================================
   Criar conta
   ============================================================ */

const signupForm = $('#signup-form');
const nameInput = $('#signup-name');
const signupEmail = $('#signup-email');
const signupPassword = $('#signup-password');
const signupButton = $('#signup-submit');
const signupError = $('#signup-error');
const signupNotice = $('#signup-notice');
const authTitle = $('#auth-title');
const authSubtitle = $('#auth-subtitle');

$('#show-signup').addEventListener('click', () => showForm('signup'));
$('#show-login').addEventListener('click', () => showForm('login'));

/**
 * Troca qual dos dois formulários está no cartão.
 *
 * O título e o subtítulo acompanham: o cabeçalho é do CARTÃO, não do formulário
 * de entrar, e deixá-lo dizendo "Entrar" sobre três campos de cadastro seria
 * mentir para quem está lendo.
 */
function showForm(which) {
  const signingUp = which === 'signup';

  form.classList.toggle('hidden', signingUp);
  signupForm.classList.toggle('hidden', !signingUp);

  authTitle.textContent = signingUp ? 'Criar conta' : 'Entrar';
  authSubtitle.textContent = signingUp
    ? 'Preencha seus dados para começar a usar o sistema.'
    : 'Acesse com seu e-mail e senha.';

  hideError();
  hideSignupMessages();

  (signingUp ? nameInput : emailInput).focus();
}

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideSignupMessages();

  const name = nameInput.value.trim();
  const email = signupEmail.value.trim();
  const password = signupPassword.value;

  if (!name || !email || !password) {
    showSignupError('Preencha o nome, o e-mail e a senha.');
    return;
  }

  // O mesmo mínimo que o Supabase exige. Conferir aqui evita uma ida ao
  // servidor para receber a resposta que já se sabe.
  if (password.length < 6) {
    showSignupError('A senha precisa ter ao menos 6 caracteres.');
    signupPassword.select();
    return;
  }

  setSignupLoading(true);
  const result = await signUp({ name, email, password });

  if (!result.ok) {
    setSignupLoading(false);
    showSignupError(result.message);
    return;
  }

  /* Sem sessão: o projeto exige confirmação de e-mail. A conta JÁ existe, então
     mandar para o dashboard só levaria a um redirecionamento de volta — o que
     falta é o professor abrir o e-mail. */
  if (!result.session) {
    setSignupLoading(false);
    signupForm.reset();
    showSignupNotice('Conta criada. Confirme o e-mail que enviamos e depois entre com sua senha.');
    return;
  }

  window.location.replace(HOME_PAGE);
});

function setSignupLoading(loading) {
  signupButton.disabled = loading;
  signupButton.textContent = loading ? 'Criando conta...' : 'Criar conta';
  nameInput.disabled = loading;
  signupEmail.disabled = loading;
  signupPassword.disabled = loading;
}

function showSignupError(message) {
  signupError.textContent = message;
  signupError.classList.remove('hidden');
}

function showSignupNotice(message) {
  signupNotice.textContent = message;
  signupNotice.classList.remove('hidden');
}

function hideSignupMessages() {
  signupError.textContent = '';
  signupError.classList.add('hidden');
  signupNotice.textContent = '';
  signupNotice.classList.add('hidden');
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

function hideError() {
  errorMessage.textContent = '';
  errorMessage.classList.add('hidden');
}
