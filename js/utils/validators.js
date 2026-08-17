/* Validação de formulários.
 *
 * Cada função devolve uma STRING com o erro, ou null quando está tudo certo.
 * Isso deixa o chamador escrever:
 *
 *   const error = validateName(value);
 *   if (error) { ...mostra o error... }
 */

import { parseCurrencyToCents } from './formatters.js';

export function validateRequired(value, fieldLabel) {
  if (!value || value.trim() === '') return `${fieldLabel} é obrigatório.`;
  return null;
}

export function validateName(name) {
  if (!name || name.trim().length === 0) return 'O nome é obrigatório.';
  if (name.trim().length < 2) return 'O nome está muito curto.';
  return null;
}

export function validateCategory(category) {
  if (!['kids', 'adulto'].includes(category)) return 'Selecione uma categoria.';
  return null;
}

/** O responsável só é obrigatório para alunos da categoria Kids. */
export function validateGuardianName(guardianName, category) {
  if (category === 'kids' && (!guardianName || guardianName.trim() === '')) {
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
