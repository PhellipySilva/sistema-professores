/* Datas do projeto (spec, seção 35).
 *
 * O formato canônico interno é a STRING 'YYYY-MM-DD'. É o que o Postgres devolve
 * numa coluna `date`, é o que o <input type="date"> usa, e strings nesse formato
 * são comparáveis e ordenáveis diretamente ('2026-08-17' < '2026-08-18').
 *
 * Três coisas NUNCA devem ser feitas fora deste arquivo:
 *
 *   new Date('2026-08-17')          → a forma com hífen é lida como UTC.
 *                                     No Brasil vira 16/08 às 21h. Use parseISODate().
 *   date.toISOString().slice(0,10)  → converte para UTC e pode voltar um dia.
 *                                     Use toISODate().
 *   comparar com now() do Postgres  → o servidor roda em UTC. "Hoje" é sempre
 *                                     calculado no navegador, no fuso do professor.
 */

const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const WEEKDAYS_LONG = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
const MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/* ============================================================
   Conversão
   ============================================================ */

/** Date local → 'YYYY-MM-DD'. Nunca usa toISOString. */
export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' → Date à meia-noite LOCAL (sem passar por UTC). */
export function parseISODate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Data de hoje no fuso do usuário, como 'YYYY-MM-DD'. */
export function todayISO() {
  return toISODate(new Date());
}

/* ============================================================
   Aritmética
   ============================================================ */

export function addDays(iso, amount) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + amount);
  return toISODate(date);
}

export function addMonths(iso, amount) {
  const date = parseISODate(iso);
  const targetDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  // Se o dia não existe no mês destino (31 de janeiro + 1 mês), fica no último dia.
  date.setDate(Math.min(targetDay, daysInMonth(date.getFullYear(), date.getMonth() + 1)));
  return toISODate(date);
}

export function daysInMonth(year, month) {
  // Dia 0 do mês seguinte é o último dia deste mês.
  return new Date(year, month, 0).getDate();
}

export function startOfMonth(iso) {
  const [year, month] = iso.split('-');
  return `${year}-${month}-01`;
}

export function endOfMonth(iso) {
  const [year, month] = iso.split('-').map(Number);
  return `${iso.slice(0, 7)}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
}

/** Dia da semana: 0 = domingo ... 6 = sábado (mesma convenção do banco). */
export function getDayOfWeek(iso) {
  return parseISODate(iso).getDay();
}

/** Todas as datas de um mês que caem no dia da semana informado. */
export function datesOfMonthByWeekday(monthIso, dayOfWeek) {
  const first = startOfMonth(monthIso);
  const last = endOfMonth(monthIso);
  const dates = [];

  let current = first;
  // Anda até o primeiro dia da semana desejado.
  while (getDayOfWeek(current) !== dayOfWeek) {
    current = addDays(current, 1);
  }
  while (current <= last) {
    dates.push(current);
    current = addDays(current, 7);
  }
  return dates;
}

/* ============================================================
   Comparação (strings ISO comparam direto, mas nomear ajuda a ler)
   ============================================================ */

export const isBefore = (a, b) => a < b;
export const isAfter = (a, b) => a > b;
export const isSameDay = (a, b) => a === b;

export function isToday(iso) {
  return iso === todayISO();
}

export function isPast(iso) {
  return iso < todayISO();
}

/* ============================================================
   Formatação para exibição
   ============================================================ */

/** '2026-08-17' → '17/08/2026' */
export function formatDateBR(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** '2026-08-17' → 'seg, 17/08' */
export function formatDateShortBR(iso) {
  if (!iso) return '';
  const [, month, day] = iso.split('-');
  return `${WEEKDAYS_SHORT[getDayOfWeek(iso)]}, ${day}/${month}`;
}

/** '2026-08-17' → '17 de agosto de 2026' */
export function formatDateLongBR(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} de ${MONTHS[month - 1].toLowerCase()} de ${year}`;
}

/** '17:00:00' → '17:00' */
export function formatTime(time) {
  if (!time) return '';
  return time.slice(0, 5);
}

/** ('17:00:00', '18:00:00') → '17:00 – 18:00' */
export function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** '2026-08-17' ou '2026-08' → 'Agosto/2026' */
export function monthLabel(iso) {
  const [year, month] = iso.split('-').map(Number);
  return `${MONTHS[month - 1]}/${year}`;
}

/** '2026-08-17' → '2026-08' (chave para agrupar por mês) */
export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function weekdayName(dayOfWeek) {
  return WEEKDAYS_LONG[dayOfWeek];
}

export function weekdayShort(dayOfWeek) {
  return WEEKDAYS_SHORT[dayOfWeek];
}

/** ([1, 3]) → 'Segunda e Quarta'  ·  ([1, 3, 5]) → 'Segunda, Quarta e Sexta' */
export function formatWeekdayList(daysOfWeek) {
  const names = [...daysOfWeek].sort((a, b) => a - b).map((day) => WEEKDAYS_LONG[day].split('-')[0]);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

/** Diferença em minutos entre dois horários 'HH:MM[:SS]'. */
export function minutesBetween(startTime, endTime) {
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(endTime) - toMinutes(startTime);
}

/** ('17:00', 60) → '18:00:00' */
export function addMinutesToTime(time, minutes) {
  const [hours, mins] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  const endHours = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const endMinutes = String(total % 60).padStart(2, '0');
  return `${endHours}:${endMinutes}:00`;
}
