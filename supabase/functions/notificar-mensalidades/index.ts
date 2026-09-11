/* Função agendada: envia os avisos de mensalidade do dia.
 *
 * É a única peça do sistema que roda sem ninguém com o navegador aberto — e é
 * por isso que ela existe: o professor precisa ser avisado do atraso mesmo (e
 * principalmente) quando não está olhando para o MatchPhoint.
 *
 * COMO ELA É CHAMADA
 *
 *   Três vezes por dia, pelo pg_cron, às 11h/15h/21h UTC — que são 08h/12h/18h
 *   em Brasília. O SQL do agendamento está no fim de
 *   supabase/migrations/0012_notificacoes_mensalidade.sql.
 *
 *   Nas três chamadas ela roda inteira, mas SÓ ENVIA na que for o horário do
 *   dia (slotHourForDate). O revezamento fica assim escrito uma vez só, em
 *   JavaScript testável, em vez de espalhado por três agendamentos.
 *
 * ELA NÃO SABE NENHUMA REGRA FINANCEIRA
 *
 *   Todo o "quem deve o quê" vem importado de js/, os MESMOS arquivos que a
 *   tela usa. Não há cópia da regra aqui, nem em SQL: mudar o financeiro no
 *   frontend muda o aviso junto, e é impossível os dois discordarem.
 *
 * A CONFIRMAÇÃO ANTES DO ENVIO
 *
 *   Os pagamentos são lidos do banco a cada execução, momentos antes de compor
 *   as mensagens. Não existe fila de avisos decidida de véspera: dar baixa hoje
 *   às 11h59 já impede o envio das 12h. É o que faz "parar imediatamente após a
 *   baixa" ser verdade sem nenhum passo extra para o professor.
 *
 * O ENCANAMENTO É O MESMO DE notificar-aulas
 *
 *   Cliente, VAPID, envio, paginação, retry e fuso vêm de _shared/push.ts. Um
 *   lugar só para o "como enviar"; aqui fica só o "o que enviar".
 *
 * SEGREDOS (Project Settings → Edge Functions → Secrets)
 *
 *   VAPID_PUBLIC_KEY    a mesma que o frontend recebe em VITE_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY   NUNCA no frontend
 *   VAPID_SUBJECT       'mailto:voce@exemplo.com'
 *   NOTIFICATION_TIMEZONE  opcional; o padrão é America/Sao_Paulo
 *
 *   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm preenchidas pela própria
 *   plataforma. A service_role só é usada AQUI, no servidor: ela precisa
 *   enxergar os alunos de todos os professores para poder avisar cada um.
 *
 * PUBLICAR
 *   supabase functions deploy notificar-mensalidades
 *
 * TESTAR NA HORA (ignora o revezamento, mas cobra a situação real):
 *   curl -X POST '.../functions/v1/notificar-mensalidades' \
 *     -H 'Authorization: Bearer SUA-SERVICE-ROLE-KEY' \
 *     -H 'Content-Type: application/json' -d '{"force":true}'
 */

import {
  configureWebPush,
  createServiceClient,
  DEFAULT_TIMEZONE,
  errorResponse,
  groupBy,
  json,
  nowInTimeZone,
  readJson,
  runQuery,
  selectAll,
  sendToSubscriptions,
} from '../_shared/push.ts';

/* Os arquivos de regra do próprio sistema, importados como estão. O caminho
   sobe até a raiz do projeto de propósito: uma cópia local aqui dentro seria
   uma segunda verdade sobre mensalidade, e as duas divergiriam no primeiro
   ajuste. */
import { recentReferenceMonths } from '../../../js/financeiro/financeiro.js';
import {
  buildPushMessages,
  notificationRecord,
  pendingPaymentSituation,
  slotHourForDate,
} from '../../../js/notificacoes/mensalidades.js';

/* Colunas mínimas. `created_at` entra porque billingStartDate precisa saber
   quando o aluno passou a existir. Nenhum telefone, nenhum responsável: a
   função não tem o que fazer com eles. */
const STUDENT_COLUMNS =
  'id, user_id, name, monthly_fee_cents, due_day, sponsored, on_leave, created_at';

Deno.serve(async (request) => {
  try {
    const body = await readJson(request);
    const timeZone = Deno.env.get('NOTIFICATION_TIMEZONE') ?? DEFAULT_TIMEZONE;
    const { date: today, hour } = nowInTimeZone(timeZone);

    const slot = slotHourForDate(today);
    if (hour !== slot && body.force !== true) {
      // O caso comum: duas das três chamadas diárias terminam aqui, sem tocar
      // no banco. `ok` e não erro — não aconteceu nada de errado.
      return json({ ok: true, skipped: true, today, hour, slot });
    }

    const supabase = createServiceClient();
    configureWebPush();

    const result = await notifyEveryone(supabase, today);
    return json({ ok: true, today, hour, slot, ...result });
  } catch (error: any) {
    return errorResponse('notificar-mensalidades', error);
  }
});

/* ============================================================
   O trabalho
   ============================================================ */

async function notifyEveryone(supabase: any, today: string) {
  // Só quem pode receber. Sem nenhum navegador registrado não há a quem avisar,
  // e nem vale ler os alunos daquele professor.
  const subscriptions = await selectAll('push_subscriptions', () =>
    supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth'),
  );

  if (subscriptions.length === 0) {
    return { professores: 0, avisos: 0, enviados: 0, falhas: 0, detalhes: [] };
  }

  const subsByUser = groupBy(subscriptions, (row) => row.user_id);
  const userIds = [...subsByUser.keys()];

  /* Os dois filtros do banco são os mesmos do `isBillable`, adiantados para não
     trazer aluno que já se sabe que não gera cobrança. Quem decide de verdade
     continua sendo a função de regra, logo abaixo. */
  const students = await selectAll('students', () =>
    supabase
      .from('students')
      .select(STUDENT_COLUMNS)
      .in('user_id', userIds)
      .eq('sponsored', false)
      .eq('on_leave', false)
      .not('monthly_fee_cents', 'is', null)
      .not('due_day', 'is', null),
  );

  if (students.length === 0) {
    return { professores: userIds.length, avisos: 0, enviados: 0, falhas: 0, detalhes: [] };
  }

  // A MESMA janela de 3 meses que a dashboard carrega — e portanto o mesmo
  // resultado do badge "Atrasado" que o professor vê na tela.
  const windowStart = recentReferenceMonths(today)[0];
  const payments = await selectAll('payments', () =>
    supabase
      .from('payments')
      .select('student_id, reference_month, due_date, paid_date')
      .in('user_id', userIds)
      .gte('reference_month', windowStart),
  );

  const paymentsByStudent = groupBy(payments, (row) => row.student_id);
  const studentsByUser = groupBy(students, (row) => row.user_id);

  let avisos = 0;
  let enviados = 0;
  let falhas = 0;
  const detalhes: any[] = [];

  for (const userId of userIds) {
    const entries: any[] = [];

    for (const student of studentsByUser.get(userId) ?? []) {
      const situation = pendingPaymentSituation(
        student,
        paymentsByStudent.get(student.id) ?? [],
        today,
      );
      if (situation) entries.push({ student, situation });
    }

    if (entries.length === 0) continue;

    const novos = await registerNotifications(supabase, userId, entries, today);
    if (novos.length === 0) continue; // todos já avisados hoje

    avisos += novos.length;

    const messages = buildPushMessages(novos);
    const resultado = await sendToSubscriptions(
      supabase,
      subsByUser.get(userId) ?? [],
      messages,
      // 6 horas: passou disso, o próximo horário do revezamento já está
      // chegando e um aviso de manhã entregue à noite só confunde.
      6 * 60 * 60,
    );

    enviados += resultado.enviados;
    falhas += resultado.falhas;
    detalhes.push(...resultado.detalhes);
  }

  return { professores: userIds.length, avisos, enviados, falhas, detalhes };
}

/**
 * Grava os avisos ANTES de enviar, e devolve só os que eram novos.
 *
 * Esta ordem é a trava de "1 por aluno por dia". `ignoreDuplicates` faz o banco
 * recusar em silêncio o aluno que já tem linha para hoje — o índice
 * payment_notifications_daily_unique — e o `select()` devolve exatamente as
 * linhas que entraram. Quem não entrou não vira push.
 *
 * Vale também contra a execução repetida: uma segunda chamada no mesmo dia
 * (retry do cron, teste manual, duas instâncias ao mesmo tempo, ou o retry
 * deste próprio upsert depois de um 504) não consegue avisar de novo, porque a
 * decisão é do índice e não de uma consulta prévia.
 */
async function registerNotifications(supabase: any, userId: string, entries: any[], today: string) {
  const rows = entries.map(({ student, situation }) => ({
    user_id: userId,
    ...notificationRecord(student, situation, today),
  }));

  const data = await runQuery('payment_notifications', () =>
    supabase
      .from('payment_notifications')
      .upsert(rows, { onConflict: 'user_id,student_id,notified_on', ignoreDuplicates: true })
      .select('student_id'),
  );

  const inseridos = new Set(data.map((row: any) => row.student_id));
  return entries.filter(({ student }) => inseridos.has(student.id));
}
