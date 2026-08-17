/* Atalhos de DOM usados no projeto inteiro.
   Não é framework: são quatro funções que evitam repetir document.querySelector
   e createElement centenas de vezes. */

/** Primeiro elemento que casa com o seletor. */
export function $(selector, scope = document) {
  return scope.querySelector(selector);
}

/** Todos os elementos que casam com o seletor, já como array. */
export function $$(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

/**
 * Cria um elemento.
 *
 *   el('button', { class: 'btn btn--primary', onclick: salvar }, 'Salvar')
 *   el('div', { class: 'card' }, [titulo, corpo])
 *
 * Propriedades que começam com "on" viram listeners; "dataset" vira data-*;
 * "html" injeta HTML confiável; o resto vira atributo.
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') {
      node.className = value;
    } else if (key === 'html') {
      node.innerHTML = value;
    } else if (key === 'text') {
      node.textContent = value;
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else {
      node.setAttribute(key, value === true ? '' : value);
    }
  }

  appendChildren(node, children);
  return node;
}

/** Aceita string, Node, ou array (com nulos, que são ignorados). */
export function appendChildren(parent, children) {
  const list = Array.isArray(children) ? children : [children];

  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Substitui todo o conteúdo de um elemento. */
export function render(parent, children) {
  parent.replaceChildren();
  appendChildren(parent, children);
  return parent;
}

/**
 * Escapa texto vindo do usuário antes de entrar em template literal de HTML.
 * Sempre que houver innerHTML com dado do banco, o dado passa por aqui.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Lê um <form> como objeto simples, com os valores já sem espaços nas pontas. */
export function readForm(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    data[key] = typeof value === 'string' ? value.trim() : value;
  }
  return data;
}

/** Lê o parâmetro ?nome=... da URL atual. */
export function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
