/* Indicador de conexão da topbar.
 *
 * Quatro estados, um ponto e uma palavra:
 *
 *   ● Online            tudo normal — é o estado silencioso
 *   ● Offline           sem rede; a tela está mostrando a cópia local
 *   ↻ Sincronizando...  subindo o que ficou pendente
 *   ✓ Sincronizado      confirmação, some sozinha em alguns segundos
 *
 * DISCRETO É REQUISITO, NÃO ESTILO: o professor não abriu o sistema para
 * acompanhar a rede. O selo ocupa o canto, não empurra nada e, no celular,
 * encolhe até virar só o ponto colorido (ver responsive.css) — a cor continua
 * dizendo o que importa quando não há espaço para a palavra.
 */

import { el } from '../utils/dom.js';
import { subscribe } from '../offline/status.js';

const LABELS = {
  online: 'Online',
  offline: 'Offline',
  syncing: 'Sincronizando...',
  synced: 'Sincronizado',
};

const MARKS = {
  online: '●',
  offline: '●',
  syncing: '↻',
  synced: '✓',
};

export function connectionIndicator() {
  const mark = el('span', { class: 'conn__mark', 'aria-hidden': 'true' });
  const label = el('span', { class: 'conn__label' });

  const node = el('div', {
    class: 'conn',
    role: 'status',
    'aria-live': 'polite',
  }, [mark, label]);

  subscribe((state) => paint(node, mark, label, state));
  return node;
}

function paint(node, mark, label, state) {
  node.className = `conn conn--${state.status}`;
  mark.textContent = MARKS[state.status] ?? '●';

  const text = LABELS[state.status] ?? 'Online';

  // Pendências só entram no rótulo quando existem e ainda não subiram: é a
  // informação que responde "posso fechar o sistema agora?".
  const pending =
    state.pending > 0 && state.status !== 'syncing'
      ? ` · ${state.pending} pendente${state.pending === 1 ? '' : 's'}`
      : '';

  label.textContent = `${text}${pending}`;
  node.title = titleFor(state);
}

function titleFor(state) {
  if (state.status === 'offline') {
    return state.pending > 0
      ? `Sem conexão. ${state.pending} alteração(ões) serão enviadas quando a internet voltar.`
      : 'Sem conexão. Você está vendo as informações já sincronizadas neste aparelho.';
  }
  if (state.status === 'syncing') return 'Enviando as alterações feitas offline...';
  if (state.status === 'synced') return 'Tudo sincronizado com o servidor.';
  return 'Conectado ao servidor.';
}
