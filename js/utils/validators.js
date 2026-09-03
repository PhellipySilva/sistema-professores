/* Validação de formulários.
 *
 * Cada função devolve uma STRING com o erro, ou null quando está tudo certo.
 * Isso deixa o chamador escrever:
 *
 *   const error = validateName(value);
 *   if (error) { ...mostra o error... }
 */

import { LEVELS, parseCurrencyToCents } from './formatters.js';

export function validateRequired(value, fieldLabel) {
  if (!value || value.trim() === '') return `${fieldLabel} é obrigatório.`;
  return null;
}

export function validateName(name) {
  if (!name || name.trim().length === 0) return 'O nome é obrigatório.';
  if (name.trim().length < 2) return 'O nome está muito curto.';
  return null;
}

/** Categoria da TURMA: Kids ou Adulto. O aluno usa validateLevel + validateStudentType. */
export function validateCategory(category) {
  if (!['kids', 'adulto'].includes(category)) return 'Selecione uma categoria.';
  return null;
}

/** Categoria do aluno e do planejamento: o nível E, D, C, B, A ou PRO. */
export function validateLevel(level) {
  if (!LEVELS.includes(level)) return 'Selecione uma categoria.';
  return null;
}

/** Tipo do aluno: Adulto ou Kids — o que a categoria queria dizer antes. */
export function validateStudentType(type) {
  if (!['kids', 'adulto'].includes(type)) return 'Selecione o tipo de aluno.';
  return null;
}

/**
 * O responsável só é obrigatório para alunos do tipo Kids.
 *
 * A regra é a mesma de sempre; o que mudou foi de onde vem a resposta: era a
 * categoria do aluno, agora é o tipo dele (ver migration 0009).
 */
export function validateGuardianName(guardianName, studentType) {
  if (studentType === 'kids' && (!guardianName || guardianName.trim() === '')) {
    return 'Informe o nome do responsável.';
  }
  return null;
}

export function validatePhone(phone) {
  if (!phone) return null; // telefone é opcional

  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) {
    return 'Telefone inválido. Use DDD + número.';
  }
  return null;
}

/** @param {string} input  Texto digitado, ex.: "150,00" */
export function validateMonthlyFee(input) {
  if (!input || input.trim() === '') return null; // mensalidade é opcional

  const cents = parseCurrencyToCents(input);
  if (cents === null || cents <= 0) return 'Informe um valor válido.';
  return null;
}

/**
 * Dia do mês em que a mensalidade vence.
 * Aceita 1 a 31: meses mais curtos são resolvidos no cálculo do vencimento
 * (`dueDateForMonth`), que puxa para o último dia do mês.
 *
 * @param {string} input  Ex.: "10"
 */
export function validateDueDay(input) {
  if (!input || input.trim() === '') return null; // opcional

  const day = Number(input);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return 'O dia de vencimento deve ser entre 1 e 31.';
  }
  return null;
}

export function validateDate(value, fieldLabel) {
  if (!value) return `${fieldLabel} é obrigatório.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${fieldLabel} inválido.`;
  return null;
}

export function validateTitle(title) {
  if (!title || title.trim().length === 0) return 'O título é obrigatório.';
  return null;
}

/**
 * Telefone de quem entra na lista de espera.
 *
 * Aqui o contato é OBRIGATÓRIO, ao contrário do cadastro de aluno: a lista de
 * espera existe justamente para o professor conseguir chamar a pessoa quando a
 * vaga aparecer. Sem telefone, a linha não serve para nada.
 */
export function validateContactPhone(phone) {
  if (!phone || phone.trim() === '') return 'Informe um telefone para contato.';
  return validatePhone(phone);
}
