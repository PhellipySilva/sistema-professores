/* Formatação de valores para exibição.
 *
 * Dinheiro é sempre INTEIRO EM CENTAVOS no sistema todo (spec, seção 36).
 * A divisão por 100 acontece só aqui, na borda da tela — em nenhum outro lugar.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/** 15000 → 'R$ 150,00' */
export function formatCurrency(cents) {
  if (cents === null || cents === undefined) return '—';
  return BRL.format(cents / 100);
}

/**
 * Texto digitado → centavos.
 * Aceita 'R$ 150,00', '150,00', '150.00' e '150'.
 * Devolve null quando não há número válido.
 */
export function parseCurrencyToCents(input) {
  if (input === null || input === undefined) return null;

  const normalized = String(input)
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}\b)/g, '') // separador de milhar
    .replace(',', '.');

  if (normalized === '' || normalized === '-') return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

/** 15000 → '150,00' (para preencher input de texto) */
export function centsToInputValue(cents) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

/** '82999998888' → '(82) 99999-8888' */
export function formatPhone(phone) {
  if (!phone) return '';

  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** Guarda só os dígitos no banco; a máscara é assunto de exibição. */
export function normalizePhone(phone) {
  return phone ? phone.replace(/\D/g, '') : null;
}

const CATEGORY_LABELS = {
  kids: 'Kids',
  adulto: 'Adulto',
};

export function formatCategory(category) {
  return CATEGORY_LABELS[category] ?? category ?? '';
}

export const CATEGORIES = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/** 0.8333 → '83%' */
export function formatPercent(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}

/** ('aula', 'aulas', 3) → '3 aulas' */
export function pluralize(singular, plural, count) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Primeira letra maiúscula, resto intacto. */
export function capitalize(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Link de conversa no WhatsApp a partir do telefone guardado (só dígitos).
 *
 * O 55 é acrescentado quando o número tem 10 ou 11 dígitos — DDD + número, o
 * formato que o cadastro valida. Número já com código de país passa intacto.
 * Sem telefone, devolve string vazia: quem chama decide se mostra o botão.
 */
export function whatsappLink(phone, message = '') {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '';

  const withCountry = digits.length <= 11 ? `55${digits}` : digits;
  const query = message ? `?text=${encodeURIComponent(message)}` : '';

  return `https://wa.me/${withCountry}${query}`;
}
