/* Regras dos avisos de mensalidade — funções puras, sem DOM e sem rede.
 *
 * Este arquivo NÃO reimplementa nada do financeiro. Ele responde a uma pergunta
 * que o sistema ainda não fazia ("o que este aluno precisa ouvir HOJE?") usando
 * as peças que já existem em js/financeiro/financeiro.js:
 *
 *   isBillable            — patrocinado e afastado saem, e saem no mesmo lugar
 *                           em que já saíam da previsão do dashboard;
 *   recentReferenceMonths — a mesma janela de 3 meses do badge "Atrasado";
 *   dueDateForMonth       — o mesmo vencimento, com o mesmo tratamento de dia 31;
 *   billingStartDate      — quem não existia quando o mês venceu não deve nada.
 *
 * Mudar a regra financeira continua sendo mexer num arquivo só, e o aviso muda
 * junto. É por isso que a função agendada (supabase/functions) importa DAQUI em
 * vez de repetir as contas em SQL ou em TypeScript.
 *
 * NENHUM TEXTO DESTE ARQUIVO CONTÉM VALOR EM DINHEIRO. O aviso chega na tela
 * bloqueada do celular, onde qualquer pessoa lê por cima do ombro: nome e data
 * bastam para o professor saber o que fazer, e quanto é ele vê dentro do
 * sistema. É requisito, não estilo.
 */

import { addDays, startOfMonth, todayISO } from '../utils/dates.js';
import {
  billingStartDate,
  dueDateForMonth,
  isBillable,
  recentReferenceMonths,
} from '../financeiro/financeiro.js';

/* ============================================================
   Revezamento de horário
   ============================================================ */

/**
 * Os três horários do aviso, na ordem do revezamento.
 *
 * Um horário fixo é um horário que o professor aprende a ignorar: quem está
 * dando aula às 8h nunca vê o aviso das 8h. Alternando, o mesmo atraso é
 * apresentado de manhã, no almoço e à noite ao longo dos dias, e a chance de
 * cair numa hora em que ele está com o celular na mão sobe muito.
 */
export const SLOT_HOURS = [8, 12, 18];

/** Número do dia desde 1970 — em UTC de propósito, para não depender do fuso. */
function dayNumber(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Dias inteiros entre duas datas ISO. ('2026-09-05', '2026-09-08') → 3 */
export function daysBetween(fromIso, toIso) {
  return dayNumber(toIso) - dayNumber(fromIso);
}

/**
 * O horário de HOJE, no revezamento.
 *
 * Sai da data, e não de um contador guardado em algum lugar: o dia 1º de
 * setembro tem a mesma resposta em qualquer execução, em qualquer servidor,
 * mesmo depois de o sistema passar um mês sem ninguém devendo nada. Sem estado,
 * sem migração, sem "de onde paramos".
 */
export function slotHourForDate(iso = todayISO()) {
  return SLOT_HOURS[((dayNumber(iso) % SLOT_HOURS.length) + SLOT_HOURS.length) % SLOT_HOURS.length];
}

/* ============================================================
   Situação a avisar
   ============================================================ */

/** '2026-09-09' → '09/09'. O ano não entra: o aviso é sempre sobre agora. */
export function formatDayMonth(iso) {
  if (!iso) return '';
  const [, month, day] = iso.split('-');
  return `${day}/${month}`;
}

/**
 * O que precisa ser avisado sobre ESTE aluno hoje — ou null.
 *
 * A ordem das perguntas é a ordem da urgência: o atraso mais antigo primeiro,
 * depois o vencimento de hoje, depois o de amanhã. Um aluno gera no máximo UMA
 * situação por dia, então quem já está devendo junho não recebe também o aviso
 * de "vence amanhã" de setembro — o professor precisa ligar para ele por causa
 * de junho, e essa é a frase que tem que chegar.
 *
 * "Confirmar se a mensalidade ainda está pendente" acontece aqui, e acontece
 * sempre: `payments` é lido do banco imediatamente antes de cada envio, e um
 * mês com `paid_date` nunca chega a virar aviso. Dar baixa é o que interrompe a
 * sequência — não existe fila de avisos já decidida esperando para sair.
 *
 * @param {object}   student   precisa de sponsored, on_leave, monthly_fee_cents,
 *                             due_day e created_at
 * @param {object[]} payments  pagamentos do aluno (a função filtra o que importa)
 * @param {string}   [todayIso]
 * @returns {{kind: string, referenceMonth: string, dueDate: string, daysOverdue: number}|null}
 */
export function pendingPaymentSituation(student, payments, todayIso = todayISO()) {
  // Patrocinado, afastado e quem não tem mensalidade configurada saem aqui —
  // pela mesma função que já os tira da previsão do mês no dashboard.
  if (!isBillable(student)) return null;

  const paidMonths = new Set(
    payments.filter((payment) => payment.paid_date).map((payment) => payment.reference_month),
  );
  const startDate = billingStartDate(student, payments);

  const owes = (month, dueDate) => {
    // O aluno não existia quando este mês venceu: não há o que cobrar.
    if (startDate && startDate > dueDate) return false;
    return !paidMonths.has(month);
  };

  // 1. Atraso — o mês vencido MAIS ANTIGO ainda em aberto, dentro da mesma
  //    janela de 3 meses que pinta o badge "Atrasado" na listagem.
  for (const month of recentReferenceMonths(todayIso)) {
    const dueDate = dueDateForMonth(month, student.due_day);
    if (dueDate >= todayIso) continue;
    if (!owes(month, dueDate)) continue;

    return {
      kind: 'overdue',
      referenceMonth: month,
      dueDate,
      daysOverdue: daysBetween(dueDate, todayIso),
    };
  }

  // 2. Vence hoje ou amanhã. Os dois meses entram porque amanhã pode ser outro
  //    mês: quem vence dia 1º precisa ser avisado no dia 31 do mês anterior.
  const tomorrow = addDays(todayIso, 1);
  const months = [...new Set([startOfMonth(todayIso), startOfMonth(tomorrow)])];

  for (const month of months) {
    const dueDate = dueDateForMonth(month, student.due_day);
    if (!owes(month, dueDate)) continue;

    if (dueDate === todayIso) {
      return { kind: 'due_today', referenceMonth: month, dueDate, daysOverdue: 0 };
    }
    if (dueDate === tomorrow) {
      return { kind: 'due_tomorrow', referenceMonth: month, dueDate, daysOverdue: 0 };
    }
  }

  return null;
}

/* ============================================================
   O texto do aviso
   ============================================================ */

const TITLES = {
  due_tomorrow: 'Mensalidade vence amanhã',
  due_today: 'Mensalidade vence hoje',
  overdue: 'Mensalidade atrasada',
};

/** Título curto do aviso, o mesmo na central e na tela bloqueada. */
export function notificationTitle(kind) {
  return TITLES[kind] ?? 'Mensalidade';
}

/**
 * A frase de UM aluno. É ela que fica gravada na central, palavra por palavra.
 *
 *   🔵 A mensalidade de Pedro vence amanhã, 09/09.
 *   🟡 A mensalidade de Pedro vence hoje, 09/09.
 *   🔴 A mensalidade de Pedro está atrasada há 3 dias. Vencimento: 05/09.
 */
export function notificationBody(studentName, situation) {
  const name = String(studentName ?? '').trim() || 'Aluno';
  const quando = formatDayMonth(situation.dueDate);

  if (situation.kind === 'due_tomorrow') {
    return `A mensalidade de ${name} vence amanhã, ${quando}.`;
  }
  if (situation.kind === 'due_today') {
    return `A mensalidade de ${name} vence hoje, ${quando}.`;
  }

  const dias = situation.daysOverdue === 1 ? '1 dia' : `${situation.daysOverdue} dias`;
  return `A mensalidade de ${name} está atrasada há ${dias}. Vencimento: ${quando}.`;
}

/**
 * A linha que vai para `payment_notifications`.
 *
 * Já sai pronta para o insert: os nomes são os das colunas, e o texto é o que
 * será enviado. Gravar antes de enviar é o que faz o índice único diário valer
 * como trava de verdade.
 */
export function notificationRecord(student, situation, todayIso = todayISO()) {
  return {
    student_id: student.id,
    kind: situation.kind,
    reference_month: situation.referenceMonth,
    due_date: situation.dueDate,
    days_overdue: situation.daysOverdue,
    notified_on: todayIso,
    title: notificationTitle(situation.kind),
    body: notificationBody(student.name, situation),
    // Clicar no aviso de um aluno abre o aluno: o histórico de pagamentos e o
    // botão de dar baixa estão os dois lá.
    url: `/pages/aluno.html?id=${student.id}`,
  };
}

/* ============================================================
   Agrupamento
   ============================================================ */

/** ['Ana'] → 'Ana' · ['Ana', 'Bia'] → 'Ana e Bia' · três ou mais → 'Ana, Bia e mais 2' */
export function formatNameList(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} e ${names[2]}`;
  return `${names[0]}, ${names[1]} e mais ${names.length - 2}`;
}

const GROUP_TITLES = {
  due_tomorrow: (count) => `${count} mensalidades vencem amanhã`,
  due_today: (count) => `${count} mensalidades vencem hoje`,
  overdue: (count) => `${count} mensalidades atrasadas`,
};

/** A área financeira do professor — o destino de todo aviso agrupado. */
export const FINANCE_URL = '/pages/dashboard.html#financeiro';

/**
 * Junta os avisos do dia em MENSAGENS DE PUSH.
 *
 * Três alunos vencendo amanhã viram uma notificação só. Cinco notificações
 * seguidas dizendo a mesma coisa é o caminho mais curto para o professor
 * desligar os avisos — e aí ele deixa de receber também o que importa.
 *
 * O agrupamento é POR SITUAÇÃO, não por tudo: "vence hoje" e "está atrasada"
 * pedem reações diferentes e continuam separados. No máximo três notificações
 * por envio, portanto — uma por cor.
 *
 * Com um aluno só, a frase é a mesma da central, no singular. Com vários, o
 * clique leva à área financeira em vez de a um aluno específico.
 *
 * @param {Array<{student: object, situation: object}>} entries
 * @returns {Array<{kind, title, body, url, tag}>}
 */
export function buildPushMessages(entries) {
  const byKind = new Map();
  for (const entry of entries) {
    if (!byKind.has(entry.situation.kind)) byKind.set(entry.situation.kind, []);
    byKind.get(entry.situation.kind).push(entry);
  }

  // Do mais urgente para o menos: se o aparelho só mostrar a última, que seja
  // a que menos pode esperar.
  const order = ['due_tomorrow', 'due_today', 'overdue'];

  return order
    .filter((kind) => byKind.has(kind))
    .map((kind) => {
      const group = byKind.get(kind);

      if (group.length === 1) {
        const { student, situation } = group[0];
        return {
          kind,
          title: notificationTitle(kind),
          body: notificationBody(student.name, situation),
          url: `/pages/aluno.html?id=${student.id}`,
          tag: `mensalidade-${kind}`,
        };
      }

      const names = formatNameList(group.map(({ student }) => student.name));
      const quando = formatDayMonth(group[0].situation.dueDate);

      const body =
        kind === 'overdue'
          ? `${names} estão com a mensalidade atrasada.`
          : `${names} têm mensalidade vencendo ${kind === 'due_today' ? 'hoje' : 'amanhã'}, ${quando}.`;

      return {
        kind,
        title: GROUP_TITLES[kind](group.length),
        body,
        url: FINANCE_URL,
        // A mesma tag substitui o aviso anterior da mesma cor em vez de empilhar
        // outro card na tela bloqueada.
        tag: `mensalidade-${kind}`,
      };
    });
}
