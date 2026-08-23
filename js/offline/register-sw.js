/* Registro do Service Worker.
 *
 * O arquivo vive em public/sw.js — fora do bundle de propósito. Ele precisa ser
 * servido da RAIZ do site para controlar todas as páginas (um Service Worker só
 * enxerga o diretório em que está), e precisa de um nome estável: se o build
 * pusesse hash no nome, cada publicação registraria um worker novo em vez de
 * atualizar o que já existe.
 */

let registered = false;

export function registerServiceWorker() {
  if (registered) return;
  registered = true;

  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // `load` porque registrar disputa banda com o carregamento da página — e a
  // tela que o professor pediu vem primeiro.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      // Falha aqui custa só o funcionamento offline; o sistema segue normal.
      console.warn('[offline] Service Worker não registrado', error);
    });
  });
}
