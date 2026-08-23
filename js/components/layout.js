/* Shell da aplicação: sidebar escura, topbar com o perfil e menu do celular.
 *
 * Em uma MPA, esta navegação teria que ser copiada em nove arquivos HTML.
 * A spec (seção 27) proíbe isso, então o shell é injetado por JavaScript em
 * <div id="app-shell"> e a lista de itens do menu existe uma vez só.
 *
 * A MESMA <aside class="sidebar"> serve às duas telas: no desktop ela fica fixa
 * à vista; no celular fica fora da tela e entra deslizando com a classe
 * `is-open`. Não existe uma segunda navegação para telas pequenas — só um CSS
 * diferente para o mesmo HTML (ver responsive.css).
 */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';
import { connectionIndicator } from './connection.js';
// Importar o arquivo (em vez de escrever o caminho numa string) faz o Vite
// versionar e copiar a imagem no build — é o mesmo motivo de a fonte entrar por
// url() relativa no CSS.
import logoMatchPhoint from '../../assets/brand/matchphoint.png';

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
  // A lista de espera é uma tela de turma: entra pelo botão da página de turmas
  // e mantém o destaque nesse item, sem virar um sexto item no menu.
  'lista-espera': 'turmas',
};

export const BRAND = { name: 'MatchPhoint', tagline: 'Gestão de aulas' };

/* A logo. Quem define o tamanho é o contêiner (`.brand-plate--md`, por
   exemplo); a imagem só ocupa a largura que recebe. `width`/`height` são os do
   arquivo e existem para o navegador reservar o espaço antes de baixá-la. */
function brandLogo() {
  return el('img', {
    class: 'brand-lockup',
    src: logoMatchPhoint,
    alt: BRAND.name,
    width: 440,
    height: 214,
    decoding: 'async',
  });
}

/* Referências vivas do shell montado, para o nome do professor poder ser
   atualizado depois que o perfil chega do banco (ver setUserName). */
const mounted = { nameNodes: [], initialsNodes: [] };

function resolveSection(pageId) {
  return SECTION_OF[pageId] ?? pageId;
}

/* ============================================================
   Identidade do usuário
   ============================================================ */

/**
 * Nome de exibição a partir do que já se tem em mãos.
 *
 * Ordem: nome do perfil → nome do cadastro no Auth → parte do e-mail antes do
 * @. Nunca devolve vazio, e nunca traz nome escrito no código: o último recurso
 * ainda é um dado do usuário logado.
 */
export function displayName(user, profile) {
  const fromProfile = profile?.name?.trim();
  if (fromProfile) return fromProfile;

  const fromMetadata = user?.user_metadata?.name?.trim();
  if (fromMetadata) return fromMetadata;

  const email = user?.email ?? '';
  return email.split('@')[0] || 'Professor';
}

/**
 * Iniciais para o avatar: primeira letra do primeiro e do último nome.
 *
 * Ignora conectivos ("de", "da", "dos") porque "Ana da Silva" deve virar AS, e
 * não AD. Nome único devolve uma letra só.
 */
export function initialsOf(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 2 || !/^(de|da|do|das|dos|e)$/i.test(part));

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Troca o nome exibido no cabeçalho e no avatar.
 *
 * Existe porque o shell é montado ANTES de o perfil chegar do banco: a tela
 * aparece na hora com o nome de reserva e se corrige sozinha quando a consulta
 * responde — sem prender o carregamento da página por causa de um rótulo.
 */
export function setUserName(name) {
  for (const node of mounted.nameNodes) node.textContent = name;
  for (const node of mounted.initialsNodes) node.textContent = initialsOf(name);
}

function avatar(name, { large = false } = {}) {
  const node = el('span', {
    class: `avatar${large ? ' avatar--lg' : ''}`,
    'aria-hidden': 'true',
    text: initialsOf(name),
  });

  mounted.initialsNodes.push(node);
  return node;
}

/* ============================================================
   Menu do perfil
   ============================================================ */

/**
 * Avatar + nome + seta, com um painel que abre no clique.
 *
 * O nome é truncado por CSS (`.user-chip__name`), então um nome longo encolhe
 * com reticências em vez de empurrar o layout.
 */
function buildUserMenu(user, profile, onLogout) {
  const name = displayName(user, profile);

  const nameNode = el('span', { class: 'user-chip__name', text: name });
  mounted.nameNodes.push(nameNode);

  const trigger = el('button', {
    type: 'button',
    class: 'user-chip',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-label': 'Abrir menu do perfil',
  }, [
    avatar(name),
    nameNode,
    el('span', { class: 'user-chip__caret', html: icon('chevronDown', 16) }),
  ]);

  const panelName = el('p', { class: 'user-menu__name truncate', text: name });
  mounted.nameNodes.push(panelName);

  const panel = el('div', { class: 'user-menu__panel hidden', role: 'menu' }, [
    el('div', { class: 'user-menu__header' }, [
      avatar(name, { large: true }),
      el('div', { class: 'truncate' }, [
        panelName,
        user?.email
          ? el('p', { class: 'user-menu__email truncate', text: user.email, title: user.email })
          : null,
      ]),
    ]),
    el('button', {
      type: 'button',
      class: 'user-menu__item user-menu__item--danger',
      role: 'menuitem',
      html: `${icon('logout', 18)}<span>Sair da conta</span>`,
      onclick: onLogout,
    }),
  ]);

  const menu = el('div', { class: 'user-menu' }, [trigger, panel]);

  const close = () => {
    panel.classList.add('hidden');
    trigger.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    panel.classList.remove('hidden');
    trigger.setAttribute('aria-expanded', 'true');
  };

  trigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (panel.classList.contains('hidden')) open();
    else close();
  });

  // Clique fora e Esc fecham. Sem isso o painel ficaria aberto pela tela toda
  // depois que o professor desistisse dele.
  document.addEventListener('click', (event) => {
    if (!menu.contains(event.target)) close();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  return menu;
}

/* ============================================================
   Sidebar / drawer
   ============================================================ */

function buildSidebar(activeSection, onClose, onLogout) {
  const links = NAV_ITEMS.map((item) =>
    el('a', {
      class: 'sidebar__link',
      href: item.href,
      'aria-current': item.id === activeSection ? 'page' : null,
      html: `${icon(item.icon, 20)}<span>${item.fullLabel}</span>`,
    }),
  );

  return el('aside', { class: 'sidebar', id: 'app-sidebar' }, [
    el('div', { class: 'sidebar__brand' }, [
      el('a', {
        class: 'brand-plate brand-plate--md',
        href: '/pages/dashboard.html',
        'aria-label': `${BRAND.name} — ir para o dashboard`,
      }, [brandLogo()]),
      el('button', {
        type: 'button',
        class: 'sidebar__close',
        'aria-label': 'Fechar menu',
        html: icon('close', 20),
        onclick: onClose,
      }),
    ]),
    el('nav', { class: 'sidebar__nav', 'aria-label': 'Navegação principal' }, links),
    el('div', { class: 'sidebar__footer' }, [
      el('button', {
        type: 'button',
        class: 'sidebar__link',
        html: `${icon('logout', 20)}<span>Sair</span>`,
        onclick: onLogout,
      }),
    ]),
  ]);
}

/* ============================================================
   Topbar
   ============================================================ */

function buildTopbar(onOpenMenu, userMenu) {
  return el('header', { class: 'topbar' }, [
    el('button', {
      type: 'button',
      class: 'topbar__menu',
      'aria-label': 'Abrir menu',
      'aria-controls': 'app-sidebar',
      html: icon('menu', 22),
      onclick: onOpenMenu,
    }),
    el('a', {
      class: 'topbar__brand',
      href: '/pages/dashboard.html',
      'aria-label': `${BRAND.name} — ir para o dashboard`,
    }, [brandLogo()]),
    el('div', { class: 'topbar__spacer' }),
    // O estado da conexão fica ao lado do perfil: é o canto onde o olho já vai
    // procurar informação sobre a sessão, e não disputa espaço com o conteúdo.
    connectionIndicator(),
    userMenu,
  ]);
}

/* ============================================================
   Montagem
   ============================================================ */

/**
 * Monta o shell na página atual.
 *
 * @param {object}   options
 * @param {string}   options.pageId    Identificador da página (ex.: 'alunos').
 * @param {object}   [options.user]    Usuário autenticado (sessão).
 * @param {object}   [options.profile] Linha de `profiles`, se já carregada.
 * @param {Function} [options.onLogout]
 */
export function renderLayout({ pageId, user, profile, onLogout }) {
  const shell = document.getElementById('app-shell');
  if (!shell) {
    console.warn('[layout] <div id="app-shell"> não encontrado nesta página.');
    return;
  }

  mounted.nameNodes = [];
  mounted.initialsNodes = [];

  const activeSection = resolveSection(pageId);
  const scrim = el('div', { class: 'scrim', onclick: () => closeMenu() });

  const closeMenu = () => {
    sidebar.classList.remove('is-open');
    scrim.classList.remove('is-open');
    document.body.classList.remove('is-locked');
  };

  const openMenu = () => {
    sidebar.classList.add('is-open');
    scrim.classList.add('is-open');
    // Trava a rolagem do fundo: sem isso, arrastar sobre o véu rola a página
    // que está atrás do menu.
    document.body.classList.add('is-locked');
    sidebar.querySelector('.sidebar__link')?.focus();
  };

  const sidebar = buildSidebar(activeSection, closeMenu, onLogout);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  const topbar = buildTopbar(openMenu, buildUserMenu(user, profile, onLogout));

  shell.replaceChildren(sidebar, scrim, topbar);
}
