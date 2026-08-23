/* Selos de categoria e de dia da semana.
 *
 * Moram em components/ porque três módulos precisam dos mesmos selos — turmas,
 * alunos e a lista de espera. Se ficassem em `turmas-ui.js`, o módulo de alunos
 * teria que importar do módulo de turmas para desenhar a categoria de um aluno,
 * e a dependência apontaria para o lado errado.
 *
 * As CORES vivem em css/variables.css. Aqui só se decide qual classe o elemento
 * recebe — nenhum valor hexadecimal aparece neste arquivo.
 */

import { el } from '../utils/dom.js';
import { formatCategory } from '../utils/formatters.js';
import { weekdayName, weekdayShort } from '../utils/dates.js';

/* ============================================================
   Categoria (Kids / Adulto)
   ============================================================ */

/* Uma categoria nova entra aqui e em duas variáveis do CSS (--color-<nome> e
   --color-<nome>-soft). Nada mais precisa mudar: todas as telas passam por
   estas funções. */
const CATEGORY_VARIANTS = { kids: 'kids', adulto: 'adulto' };

/** Classe do modificador. Categoria desconhecida cai no cinza neutro. */
export function categoryVariant(category) {
  return CATEGORY_VARIANTS[category] ?? 'neutral';
}

/**
 * Selo da categoria — o mesmo em turma, aluno e perfil.
 *
 * @param {string}  category
 * @param {object}  [options]
 * @param {string}  [options.prefix]  texto antes do nome, ex.: 'Nível'
 */
export function categoryBadge(category, { prefix } = {}) {
  const label = formatCategory(category);

  return el('span', {
    class: `badge badge--${categoryVariant(category)}`,
    text: prefix ? `${prefix}: ${label}` : label,
  });
}

/* ============================================================
   Dia da semana
   ============================================================ */

/**
 * Chip de um dia (0 = domingo).
 *
 * É deliberadamente pequeno: a cor serve para o professor bater o olho e achar
 * a turma de terça, não para pintar o card. Ver a nota em variables.css.
 */
export function weekdayBadge(dayOfWeek) {
  return el('span', {
    class: `badge badge--day day-${dayOfWeek}`,
    text: weekdayShort(dayOfWeek),
    title: weekdayName(dayOfWeek),
  });
}

/** Os dias de uma turma, em ordem e sem repetir. */
export function weekdayBadges(schedules) {
  const days = [...new Set(schedules.map((schedule) => schedule.day_of_week))].sort(
    (a, b) => a - b,
  );

  return el('div', { class: 'day-badges' }, days.map(weekdayBadge));
}
