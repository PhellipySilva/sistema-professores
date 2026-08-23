/* Campos de formulário reutilizáveis.
 *
 * Todo formulário do sistema é montado com estas funções, para que rótulo,
 * `for`/`id`, mensagem de erro e acessibilidade fiquem certos em um lugar só
 * (spec, seções 27 e 41) — em vez de repetidos em seis modais.
 */

import { el } from '../utils/dom.js';

let fieldCounter = 0;

function buildField({ label, hint, control, id }) {
  const children = [
    el('label', { class: 'field__label', for: id, text: label }),
    control,
  ];

  if (hint) children.push(el('p', { class: 'field__hint', text: hint }));
  children.push(el('p', { class: 'field__error hidden', id: `${id}-error`, role: 'alert' }));

  return el('div', { class: 'field' }, children);
}

/**
 * @param {object} options
 * @param {string} options.name      Nome no FormData.
 * @param {string} options.label
 * @param {string} [options.type]    text, tel, email, number, date, password...
 * @param {string} [options.value]
 * @param {string} [options.hint]
 * @param {string} [options.placeholder]
 * @param {boolean}[options.required]
 * @param {string} [options.inputmode]
 * @param {string} [options.autocomplete]
 */
export function textField({
  name,
  label,
  type = 'text',
  value = '',
  hint,
  placeholder,
  required = false,
  inputmode,
  autocomplete,
  min,
  max,
}) {
  const id = `field-${name}-${++fieldCounter}`;

  const control = el('input', {
    class: 'input',
    id,
    name,
    type,
    value: value ?? '',
    placeholder,
    inputmode,
    autocomplete,
    min,
    max,
    'aria-describedby': `${id}-error`,
    required: required || null,
  });

  return buildField({ label, hint, control, id });
}

export function textareaField({ name, label, value = '', hint, placeholder, rows = 5 }) {
  const id = `field-${name}-${++fieldCounter}`;

  const control = el('textarea', {
    class: 'textarea',
    id,
    name,
    rows,
    placeholder,
    'aria-describedby': `${id}-error`,
  });
  control.value = value ?? '';

  return buildField({ label, hint, control, id });
}

/**
 * @param {{value: string, label: string}[]} options.options
 */
export function selectField({ name, label, options, value = '', hint, placeholder }) {
  const id = `field-${name}-${++fieldCounter}`;

  const optionNodes = [];
  if (placeholder) {
    optionNodes.push(el('option', { value: '', text: placeholder, disabled: true, selected: !value }));
  }
  for (const option of options) {
    optionNodes.push(
      el('option', {
        value: option.value,
        text: option.label,
        selected: String(option.value) === String(value) ? '' : null,
      }),
    );
  }

  const control = el(
    'select',
    { class: 'select', id, name, 'aria-describedby': `${id}-error` },
    optionNodes,
  );

  return buildField({ label, hint, control, id });
}

/**
 * Checkbox único: uma pergunta de sim/não do cadastro (ex.: atleta patrocinado).
 *
 * Diferente de `checkboxChips`, que é um GRUPO e devolve vários valores: aqui a
 * resposta é um booleano, lido com `form.elements[name].checked`.
 */
export function checkboxField({ name, label, checked = false, hint }) {
  const id = `field-${name}-${++fieldCounter}`;

  const control = el('input', {
    type: 'checkbox',
    id,
    name,
    checked: checked ? '' : null,
    'aria-describedby': `${id}-error`,
  });

  const children = [
    el('label', { class: 'checkbox-field', for: id }, [control, el('span', { text: label })]),
  ];

  if (hint) children.push(el('p', { class: 'field__hint', text: hint }));
  children.push(el('p', { class: 'field__error hidden', id: `${id}-error`, role: 'alert' }));

  return el('div', { class: 'field' }, children);
}

/** Grupo de checkboxes em formato de chip — usado para os dias da semana. */
export function checkboxChips({ name, label, options, values = [] }) {
  const selected = new Set(values.map(String));

  const chips = options.map((option) =>
    el('label', { class: 'checkbox-chip' }, [
      el('input', {
        type: 'checkbox',
        name,
        value: option.value,
        checked: selected.has(String(option.value)) ? '' : null,
      }),
      el('span', { text: option.label }),
    ]),
  );

  return el('div', { class: 'field' }, [
    el('span', { class: 'field__label', text: label }),
    el('div', { class: 'checkbox-group' }, chips),
    el('p', { class: 'field__error hidden', id: `field-${name}-error`, role: 'alert' }),
  ]);
}

/**
 * Mostra os erros de validação nos campos e devolve true se havia algum.
 *
 * @param {HTMLFormElement} form
 * @param {Record<string, string|null>} errors  { nomeDoCampo: 'mensagem' | null }
 * @returns {boolean} true se algum erro foi exibido
 */
export function showFieldErrors(form, errors) {
  let firstInvalid = null;

  for (const [name, message] of Object.entries(errors)) {
    const control = form.elements[name];
    const target = control instanceof RadioNodeList ? control[0] : control;
    if (!target) continue;

    const errorNode = form.querySelector(`#${CSS.escape(target.id)}-error`)
      ?? form.querySelector(`#field-${CSS.escape(name)}-error`);

    if (message) {
      target.setAttribute('aria-invalid', 'true');
      if (errorNode) {
        errorNode.textContent = message;
        errorNode.classList.remove('hidden');
      }
      if (!firstInvalid) firstInvalid = target;
    } else {
      target.removeAttribute('aria-invalid');
      if (errorNode) {
        errorNode.textContent = '';
        errorNode.classList.add('hidden');
      }
    }
  }

  firstInvalid?.focus();
  return Boolean(firstInvalid);
}

/**
 * Lista de caixas de seleção com rótulo e uma linha de apoio — para escolher
 * VÁRIOS itens de um cadastro (as turmas de interesse da lista de espera).
 *
 * Não é `checkboxChips`: chip serve para rótulo curto ("Seg", "Qua") e quebra
 * feio com "Adulto Noite · Terça e Quinta · 19:00". Aqui cada opção ocupa uma
 * linha, com nome em cima e horário embaixo, e a lista rola dentro da própria
 * caixa quando o professor tem muitas turmas.
 *
 * Reaproveita as classes `.picker__*` do seletor de alunos: é o mesmo desenho
 * resolvendo o mesmo problema, então não ganha CSS novo.
 *
 * @param {object}   options
 * @param {string}   options.name
 * @param {string}   options.label
 * @param {{value: string, label: string, meta?: string, extra?: Node}[]} options.options
 * @param {string[]} [options.values]        já marcados
 * @param {string}   [options.emptyMessage]  texto quando não há nenhuma opção
 */
export function checkboxList({ name, label, options, values = [], hint, emptyMessage }) {
  const selected = new Set(values.map(String));

  const rows = options.map((option) => {
    const checked = selected.has(String(option.value));

    const input = el('input', {
      type: 'checkbox',
      class: 'picker__checkbox',
      name,
      value: option.value,
      checked: checked ? '' : null,
    });

    const row = el('label', { class: `picker__row${checked ? ' picker__row--on' : ''}` }, [
      el('span', { class: 'picker__main' }, [
        input,
        el('span', {}, [
          el('span', { class: 'picker__name', text: option.label }),
          option.meta ? el('span', { class: 'picker__meta', text: option.meta }) : null,
        ]),
      ]),
      option.extra ?? null,
    ]);

    // O fundo azul acompanha a caixa marcada — sem ele, numa lista de oito
    // turmas o professor perde de vista o que já escolheu.
    input.addEventListener('change', () => {
      row.classList.toggle('picker__row--on', input.checked);
    });

    return row;
  });

  const body = rows.length > 0
    ? el('div', { class: 'picker__list' }, rows)
    : el('p', { class: 'field__hint', text: emptyMessage ?? 'Nenhuma opção disponível.' });

  const children = [el('span', { class: 'field__label', text: label }), body];

  if (hint) children.push(el('p', { class: 'field__hint', text: hint }));
  children.push(el('p', { class: 'field__error hidden', id: `field-${name}-error`, role: 'alert' }));

  return el('div', { class: 'field' }, children);
}

/** Valores marcados de um grupo de caixas, dentro de qualquer elemento. */
export function readCheckedValues(scope, name) {
  return [...scope.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
}
