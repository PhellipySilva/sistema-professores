/* Função agendada: avisa o professor da primeira aula do dia.
 *
 * Dois avisos, e só isso:
 *
 *   uma hora antes  🎾 Sua primeira aula começa em 1 hora!
 *   na hora         🚀 Hora de começar!
 *
 * NÃO TEM HORÁRIO FIXO — E É ESSE O PONTO
 *
 *   Os avisos de mensalidade sabem a que horas saem (08h, 12h ou 18h). Aqui não
 *   dá: a primeira aula de cada professor cai numa hora diferente a cada dia da
 *   semana, e o aviso tem que sair uma hora antes DELA. Então o cron chama esta
 *   função de 5 em 5 minutos, ela lê a grade, descobre o horário e decide.
 *
 *   Quase toda execução termina sem enviar nada, depois de duas consultas
 *   baratas. É o desenho esperado, não desperdício: é o preço de o aviso
 *   acompanhar a agenda de cada um em vez de um horário escrito no código.
 *
 * ELA NÃO SABE NENHUMA REGRA DE AGENDA
 *
 *   "Que aulas existem hoje" é pergunta de js/agenda/ocorrencias.js, o mesmo
 *   arquivo que desenha o calendário e a lista de aulas de hoje na dashboard —
 *   importado daqui como está. Aula CANCELADA não vira aviso porque aquele
 *   arquivo já a descartava; não há uma segunda resposta escrita aqui.
 *
 * NÃO ENCOSTA NOS AVISOS DE MENSALIDADE
 *
 *   Outra função, outro agendamento, outra tabela. `notificar-mensalidades`
 *   continua igual, e uma falha aqui não a afeta.
 *
 * SEGREDOS — os mesmos que a outra função já usa
 *   VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT ('mailto:...')
 *   NOTIFICATION_TIMEZONE  opcional; o padrão é America/Sao_Paulo
 *
 * PUBLICAR
 *   supabase functions deploy notificar-aulas
 *
 * AGENDAR
 *   O SQL está no fim de supabase/migrations/0013_notificacoes_aulas.sql.
 */

import {
  configureWebPush,
  createServiceClient,
  DEFAULT_TIMEZONE,
  groupBy,
  json,
  nowInTimeZone,
  readJson,
  selectAll,
  sendToSubscriptions,
} from '../_shared/push.ts';

import { getDayOfWeek } from '../../../js/utils/dates.js';
import {
  dueLessonNotification,
  firstLessonOfDay,
  lessonNotificationRecord,
  lessonPushMessage,
  professorFirstName,
} from '../../../js/notificacoes/aulas.js';

/* A grade recorrente. `classes` vem junto porque `ocorrencias.js` lê o nome e a
   categoria da turma ao montar a ocorrência. */
const SCHEDULE_COLUMNS =
  'user_id, class_id, day_of_week, start_time, end_time, classes (id, name, category)';

Deno.serve(async (request) => {
  try {
    await readJson(request); // o corpo não é usado; ler evita conexão pendurada

    const timeZone = Deno.env.get('NOTIFICATION_TIMEZONE') ?? DEFAULT_TIMEZONE;
    const { date: today, time: now } = nowInTimeZone(timeZone);

    const supabase = createServiceClient();
    configureWebPush();

    const result = await notifyEveryone(supabase, today, now);
    return json({ ok: true, today, now, ...result });
  } catch (error: any) {
    console.error('[notificar-aulas] falhou', error);
    return json({ ok: false, error: String(error?.message ?? error) }, 500);
  }
});

async function notifyEveryone(supabase: any, today: string, now: string) {
  // Sem nenhum navegador registrado não há a quem avisar, e nem vale ler a
  // grade de ninguém. É a saída barata da maioria das execuções.
  const subscriptions = await selectAll(() =>
    supabase.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth'),
  );

  if (subscriptions.length === 0) {
    return { professores: 0, avisos: 0, enviados: 0, falhas: 0 };
  }

  const subsByUser = groupBy(subscriptions, (row) => row.user_id);
  const userIds = [...subsByUser.keys()];

  /* Só a grade do DIA DA SEMANA de hoje. É o filtro que faz a execução das
     03:05 da manhã custar quase nada: quem não tem aula hoje não volta do
     banco. `getDayOfWeek` é o mesmo do resto do projeto, e usa a convenção da
     tabela (0 = domingo), como diz o comentário da migration 0001. */
  const dayOfWeek = getDayOfWeek(today);

  const schedules = await selectAll(() =>
    supabase
      .from('class_schedules')
      .select(SCHEDULE_COLUMNS)
      .in('user_id', userIds)
      .eq('day_of_week', dayOfWeek),
  );

  if (schedules.length === 0) {
    // Ninguém dá aula hoje. "Não enviar em dias sem aula" começa aqui.
    return { professores: userIds.length, avisos: 0, enviados: 0, falhas: 0 };
  }

  const schedulesByUser = groupBy(schedules, (row) => row.user_id);
  const comAulaHoje = [...schedulesByUser.keys()];

  /* As aulas já materializadas de hoje — é o que permite excluir as CANCELADAS.
     Só as de hoje, e só de quem tem aula hoje. */
  const sessions = await selectAll(() =>
    supabase
      .from('class_sessions')
      .select('user_id, class_id, session_date, start_time, end_time, status')
      .in('user_id', comAulaHoje)
      .eq('session_date', today),
  );

  const sessionsByUser = groupBy(sessions, (row) => row.user_id);

  // O nome vai na saudação do segundo aviso. Uma consulta para todos.
  const profiles = await selectAll(() =>
    supabase.from('profiles').select('id, name, email').in('id', comAulaHoje),
  );

  const profileById = new Map(profiles.map((row: any) => [row.id, row]));

  let avisos = 0;
  let enviados = 0;
  let falhas = 0;

  for (const userId of comAulaHoje) {
    const daGrade = schedulesByUser.get(userId) ?? [];
    const primeira = firstLessonOfDay(daGrade, sessionsByUser.get(userId) ?? [], today);
    // Todas as aulas de hoje canceladas: o dia deixou de ter primeira aula.
    if (!primeira) continue;

    const kind = dueLessonNotification(primeira.start_time, now);
    if (!kind) continue; // fora das duas janelas — o caso comum

    const nome = professorFirstName(profileById.get(userId));
    const record = lessonNotificationRecord(kind, primeira, nome, today);

    const novo = await registerNotification(supabase, userId, record);
    if (!novo) continue; // já avisado hoje: a trava do banco barrou

    avisos += 1;

    const resultado = await sendToSubscriptions(
      supabase,
      subsByUser.get(userId) ?? [],
      [lessonPushMessage(record)],
      // Duas horas: passou disso, a aula já começou faz tempo e o aviso perdeu
      // o sentido — melhor não chegar do que chegar errado.
      2 * 60 * 60,
    );

    enviados += resultado.enviados;
    falhas += resultado.falhas;
  }

  return { professores: comAulaHoje.length, avisos, enviados, falhas };
}

/**
 * Grava o aviso ANTES de enviar. Devolve false se ele já existia hoje.
 *
 * Esta ordem é a trava de "não repetir no mesmo dia", e ela é indispensável
 * aqui: dentro da janela de uma hora, esta função calcula o MESMO aviso umas
 * doze vezes. O que impede os outros onze pushes é o índice
 * lesson_notifications_daily_unique, não uma consulta prévia — duas execuções
 * simultâneas passariam por uma consulta, mas não pelo índice.
 */
async function registerNotification(supabase: any, userId: string, record: any) {
  const { data, error } = await supabase
    .from('lesson_notifications')
    .upsert({ user_id: userId, ...record }, {
      onConflict: 'user_id,kind,lesson_date',
      ignoreDuplicates: true,
    })
    .select('id');

  if (error) throw error;
  return (data ?? []).length > 0;
}
