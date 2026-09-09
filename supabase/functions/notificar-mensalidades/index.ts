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

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

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

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

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

    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );

    webpush.setVapidDetails(
      vapidSubject(),
      requiredEnv('VAPID_PUBLIC_KEY'),
      requiredEnv('VAPID_PRIVATE_KEY'),
    );

    const result = await notifyEveryone(supabase, today);
    return json({ ok: true, today, hour, slot, ...result });
  } catch (error: any) {
    console.error('[notificar-mensalidades] falhou', error);
    return json({ ok: false, error: String(error?.message ?? error) }, 500);
  }
});

/* ============================================================
   O trabalho
   ============================================================ */

async function notifyEveryone(supabase: any, today: string) {
  // Só quem pode receber. Sem nenhum navegador registrado não há a quem avisar,
  // e nem vale ler os alunos daquele professor.
  const subscriptions = await selectAll(() =>
    supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth'),
  );

  if (subscriptions.length === 0) {
    return { professores: 0, avisos: 0, enviados: 0, falhas: 0 };
  }

  const subsByUser = groupBy(subscriptions, (row) => row.user_id);
  const userIds = [...subsByUser.keys()];

  /* Os dois filtros do banco são os mesmos do `isBillable`, adiantados para não
     trazer aluno que já se sabe que não gera cobrança. Quem decide de verdade
     continua sendo a função de regra, logo abaixo. */
  const students = await selectAll(() =>
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
    return { professores: userIds.length, avisos: 0, enviados: 0, falhas: 0 };
  }

  // A MESMA janela de 3 meses que a dashboard carrega — e portanto o mesmo
  // resultado do badge "Atrasado" que o professor vê na tela.
  const windowStart = recentReferenceMonths(today)[0];
  const payments = await selectAll(() =>
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
    const enviados_ = await sendAll(supabase, subsByUser.get(userId) ?? [], messages);

    enviados += enviados_.enviados;
    falhas += enviados_.falhas;
  }

  return { professores: userIds.length, avisos, enviados, falhas };
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
 * (retry do cron, teste manual, duas instâncias ao mesmo tempo) não consegue
 * avisar de novo, porque a decisão é do índice e não de uma consulta prévia.
 */
async function registerNotifications(supabase: any, userId: string, entries: any[], today: string) {
  const rows = entries.map(({ student, situation }) => ({
    user_id: userId,
    ...notificationRecord(student, situation, today),
  }));

  const { data, error } = await supabase
    .from('payment_notifications')
    .upsert(rows, { onConflict: 'user_id,student_id,notified_on', ignoreDuplicates: true })
    .select('student_id');

  if (error) throw error;

  const inseridos = new Set((data ?? []).map((row) => row.student_id));
  return entries.filter(({ student }) => inseridos.has(student.id));
}

/**
 * Envia cada mensagem para cada navegador do professor.
 *
 * 404 e 410 são o navegador dizendo "esta inscrição não existe mais" —
 * desinstalou o app, limpou os dados, revogou a permissão. A linha sai do
 * banco: insistir nela só geraria erro todo dia, para sempre.
 */
async function sendAll(supabase: any, subscriptions: any[], messages: any[]) {
  let enviados = 0;
  let falhas = 0;

  for (const subscription of subscriptions) {
    const target = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };

    for (const message of messages) {
      try {
        await webpush.sendNotification(
          target,
          JSON.stringify({
            title: message.title,
            body: message.body,
            url: message.url,
            tag: message.tag,
          }),
          // 6 horas: passou disso, o próximo horário do revezamento já está
          // chegando e um aviso de manhã entregue à noite só confunde.
          { TTL: 6 * 60 * 60 },
        );
        enviados += 1;
      } catch (error: any) {
        falhas += 1;

        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', subscription.id);
          break; // esta inscrição morreu; as outras mensagens dela não vão
        }
        console.warn('[notificar-mensalidades] envio falhou', subscription.id, error?.statusCode);
      }
    }
  }

  return { enviados, falhas };
}

/* ============================================================
   Utilidades
   ============================================================ */

/**
 * Data e hora AGORA no fuso do professor.
 *
 * O servidor roda em UTC, e às 21h de lá já é outro dia. Perguntar "que dia é
 * hoje" sem dizer o fuso faria o aviso das 18h ser gravado com a data de
 * amanhã — e a trava diária deixaria de travar.
 */
function nowInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
  };
}

/**
 * Lê a tabela inteira em páginas.
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição. Um professor com
 * 1200 alunos receberia avisos de 1000 deles e silêncio sobre os outros 200 —
 * o tipo de falha que ninguém percebe até alguém reclamar.
 */
async function selectAll(buildQuery: () => any, pageSize = 1000) {
  const rows: any[] = [];

  // A consulta é RECONSTRUÍDA a cada página: um construtor do PostgREST que já
  // foi executado não pode ser reaproveitado com outro `range`.
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

function groupBy(rows: any[], keyOf: (row: any) => string) {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

async function readJson(request: Request): Promise<any> {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {}; // o cron manda '{}', mas uma chamada sem corpo não é erro
  }
}

/**
 * O "quem está enviando" que vai no cabeçalho VAPID.
 *
 * O `web-push` exige uma URL — `mailto:` ou `https:` —, e recusa um e-mail cru
 * com "Vapid subject is not a valid URL". O engano é fácil de cometer (o campo
 * pede um contato, e a pessoa escreve o e-mail) e caro de descobrir: a exceção
 * acontece ANTES de qualquer envio, então o agendamento passa a falhar inteiro,
 * todo dia, e o erro só aparece no log da função — ninguém percebe que parou.
 *
 * Por isso o `mailto:` é completado aqui, com aviso no log em vez de queda.
 * Continua valendo cadastrar o segredo já no formato certo.
 */
function vapidSubject() {
  const configurado = (Deno.env.get('VAPID_SUBJECT') ?? '').trim();
  if (!configurado) return 'mailto:contato@matchphoint.app';

  if (/^(mailto:|https?:\/\/)/i.test(configurado)) return configurado;

  console.warn(
    `[notificar-mensalidades] VAPID_SUBJECT sem esquema ("${configurado}"); ` +
      'assumindo mailto:. Corrija o segredo para mailto:' + configurado,
  );
  return `mailto:${configurado}`;
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta o segredo ${name} nas Edge Functions.`);
  return value;
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
