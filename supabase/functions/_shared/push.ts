/* Encanamento comum das funções que enviam push.
 *
 * Nada de regra de negócio aqui: cliente do Supabase, VAPID, envio, limpeza de
 * inscrição morta, paginação e fuso. O que cada função DECIDE enviar mora nela.
 *
 * NOTA DE DÍVIDA, honesta: `notificar-mensalidades` ainda tem a própria cópia
 * destas funções. Ela está em produção e o agendamento dela ainda não foi
 * confirmado ponta a ponta — mexer nela agora misturaria duas investigações.
 * Quando os avisos financeiros estiverem comprovadamente rodando, trocar aquelas
 * cópias por estes imports é uma mudança de cinco linhas, e aí passa a existir
 * um lugar só para o envio.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta o segredo ${name} nas Edge Functions.`);
  return value;
}

/**
 * Cliente com a service_role.
 *
 * Ela só existe no servidor: a função precisa enxergar a grade de todos os
 * professores para poder avisar cada um, e o RLS impediria isso.
 */
export function createServiceClient() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

/**
 * O "quem está enviando" do cabeçalho VAPID.
 *
 * O `web-push` exige uma URL — `mailto:` ou `https:` — e recusa um e-mail cru
 * com "Vapid subject is not a valid URL". O engano é fácil (o campo pede um
 * contato, a pessoa escreve o e-mail) e caro: a exceção acontece ANTES de
 * qualquer envio, então tudo para de funcionar e o erro só aparece no log.
 * Por isso o `mailto:` é completado aqui, com aviso em vez de queda.
 */
export function vapidSubject() {
  const configurado = (Deno.env.get('VAPID_SUBJECT') ?? '').trim();
  if (!configurado) return 'mailto:contato@matchphoint.app';

  if (/^(mailto:|https?:\/\/)/i.test(configurado)) return configurado;

  console.warn(
    `[push] VAPID_SUBJECT sem esquema ("${configurado}"); assumindo mailto:. ` +
      `Corrija o segredo para mailto:${configurado}`,
  );
  return `mailto:${configurado}`;
}

export function configureWebPush() {
  webpush.setVapidDetails(
    vapidSubject(),
    requiredEnv('VAPID_PUBLIC_KEY'),
    requiredEnv('VAPID_PRIVATE_KEY'),
  );
}

/**
 * Envia cada mensagem para cada navegador.
 *
 * 404 e 410 são o navegador dizendo "esta inscrição não existe mais" —
 * desinstalou o app, limpou os dados, revogou a permissão. A linha sai do
 * banco: insistir nela só geraria erro todo dia, para sempre.
 */
export async function sendToSubscriptions(
  supabase: any,
  subscriptions: any[],
  messages: any[],
  ttlSeconds = 6 * 60 * 60,
) {
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
          { TTL: ttlSeconds },
        );
        enviados += 1;
      } catch (error: any) {
        falhas += 1;

        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', subscription.id);
          break; // esta inscrição morreu; as outras mensagens dela não vão
        }
        console.warn('[push] envio falhou', subscription.id, error?.statusCode);
      }
    }
  }

  return { enviados, falhas };
}

/**
 * Lê a consulta inteira em páginas.
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição, e a consulta é
 * RECONSTRUÍDA a cada página: um construtor já executado não pode ser
 * reaproveitado com outro `range`.
 */
export async function selectAll(buildQuery: () => any, pageSize = 1000) {
  const rows: any[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;

    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export function groupBy(rows: any[], keyOf: (row: any) => string) {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

/**
 * Data e hora AGORA no fuso do professor.
 *
 * O servidor roda em UTC, e às 21h de lá já é outro dia. Perguntar "que horas
 * são" sem dizer o fuso mandaria o aviso de aula na hora errada e gravaria a
 * trava diária na data errada.
 */
export function nowInTimeZone(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

export function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function readJson(request: Request): Promise<any> {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {}; // o cron manda '{}', mas uma chamada sem corpo não é erro
  }
}
