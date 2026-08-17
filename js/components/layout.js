/* Shell da aplicação: sidebar no desktop, bottom nav no celular.
 *
 * Em uma MPA, esta navegação teria que ser copiada em nove arquivos HTML.
 * A spec (seção 27) proíbe isso, então o shell é injetado por JavaScript em
 * <div id="app-shell"> e a lista de itens do menu existe uma vez só.
 */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';

/** Navegação principal (spec, seção 24). Cinco itens — nem um a mais. */
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Início', fullLabel: 'Dashboard', href: '/pages/dashboard.html', icon: 'dashboard' },
  { id: 'alunos', label: 'Alunos', fullLabel: 'Alunos', href: '/pages/alunos.html', icon: 'user' },
  { id: 'turmas', label: 'Turmas', fullLabel: 'Turmas', href: '/pages/turmas.html', icon: 'users' },
  { id: 'agenda', label: 'Agenda', fullLabel: 'Agenda', href: '/pages/agenda.html', icon: 'calendar' },
  { id: 'planejamentos', label: 'Planos', fullLabel: 'Planejamentos', href: '/pages/planejamentos.html', icon: 'clipboard' },
];

/* Páginas de detalhe herdam o destaque da seção a que pertencem. */
const SECTION_OF = {
  aluno: 'alunos',
  turma: 'turmas',
  aula: 'agenda',
};

function resolveSection(pageId) {
  return SECTION_OF[pageId] ?? pageId;
}

function buildSidebar(activeSection, user, onLogout) {
  const links = NAV_ITEMS.map((item) =>
    el('a', {
      class: 'sidebar__link',
      href: item.href,
      'aria-current': item.id === activeSection ? 'page' : null,
      html: `${icon(item.icon, 20)}<span>${item.fullLabel}</span>`,
    }),
  );

  const footer = el('div', { class: 'sidebar__footer' }, [
    user?.email
      ? el('p', { class: 'sidebar__user text-muted', text: user.email, title: user.email })
      : null,
    el('button', {
      type: 'button',
      class: 'sidebar__link',
      html: `${icon('logout', 20)}<span>Sair</span>`,
      onclick: onLogout,
    }),
  ]);

  return el('aside', { class: 'sidebar' }, [
    el('div', { class: 'sidebar__brand' }, [
      el('div', { class: 'sidebar__logo', text: 'BT' }),
      el('div', {}, [
        el('p', { class: 'sidebar__brand-name', text: 'Beach Tennis' }),
        el('p', { class: 'sidebar__brand-tagline', text: 'Gestão de aulas' }),
      ]),
    ]),
    el('nav', { class: 'sidebar__nav', 'aria-label': 'Navegação principal' }, links),
    footer,
  ]);
}

function buildBottomNav(activeSection) {
  const links = NAV_ITEMS.map((item) =>
    el('a', {
      class: 'bottom-nav__link',
      href: item.href,
      'aria-current': item.id === activeSection ? 'page' : null,
      html: `${icon(item.icon, 22)}<span>${item.label}</span>`,
    }),
  );

  return el('nav', { class: 'bottom-nav', 'aria-label': 'Navegação principal' }, links);
}

/**
 * Monta o shell na página atual.
 *
 * @param {object}   options
 * @param {string}   options.pageId    Identificador da página (ex.: 'alunos').
 * @param {object}   [options.user]    Usuário autenticado, para o rodapé da sidebar.
 * @param {Function} [options.onLogout]
 */
export function renderLayout({ pageId, user, onLogout }) {
  const shell = document.getElementById('app-shell');
  if (!shell) {
    console.warn('[layout] <div id="app-shell"> não encontrado nesta página.');
    return;
  }

  const activeSection = resolveSection(pageId);

  shell.replaceChildren(
    buildSidebar(activeSection, user, onLogout),
    buildBottomNav(activeSection),
  );
}
