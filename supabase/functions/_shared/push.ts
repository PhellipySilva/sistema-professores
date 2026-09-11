/* Encanamento comum das funções que enviam push.
 *
 * Nada de regra de negócio aqui: cliente do Supabase, VAPID, envio, limpeza de
 * inscrição morta, paginação, retry e fuso. O que cada função DECIDE enviar
 * mora nela.
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

/* ============================================================
   Retry — o PostgREST às vezes responde 504 na primeira chamada
   ============================================================
   Em produção, metade das execuções do cron caía com "Gateway Timeout" na
   PRIMEIRA consulta (a função fica ociosa 5 minutos e acorda fria). A consulta
   seguinte, um segundo depois, passa. Sem retry, o aviso daquela janela se
   perdia — e a resposta do cron não dizia nem em qual etapa. */

const TRANSIENT_PATTERN =
  /gateway timeout|timed? ?out|temporarily unavailable|bad gateway|fetch failed|connection (reset|closed|refused)|network|socket/i;

/** Erro que vale tentar de novo: 502/503/504, timeout ou falha de rede. */
export function isTransientError(error: any) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  if (status === 502 || status === 503 || status === 504) return true;

  const text = `${error?.message ?? ''} ${error?.details ?? ''} ${error?.code ?? ''}`;
  return TRANSIENT_PATTERN.test(text);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executa `fn` até `attempts` vezes, com espera crescente entre elas.
 *
 * `etapa` vai grudada no erro final (`error.etapa`), para a resposta da função
 * dizer ONDE falhou — é o que permite ler o motivo em `net._http_response`
 * sem abrir o log da Edge Function.
 */
export async function withRetry<T>(
  etapa: string,
  fn: () => Promise<T>,
  { attempts = 3, backoffMs = 500 } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt >= attempts || !isTransientError(error)) {
        throw tagStep(error, etapa);
      }
      const delay = backoffMs * attempt;
      console.warn(
        `[push] ${etapa}: tentativa ${attempt}/${attempts} falhou (${describe(error)}); ` +
          `nova tentativa em ${delay}ms`,
      );
      await sleep(delay);
    }
  }
}

function tagStep(error: any, etapa: string) {
  if (error && typeof error === 'object') {
    if (!error.etapa) error.etapa = etapa;
    return error;
  }
  const wrapped = new Error(String(error));
  (wrapped as any).etapa = etapa;
  return wrapped;
}

function describe(error: any) {
  const status = error?.status ?? error?.statusCode;
  return `${status ? status + ' ' : ''}${error?.message ?? error}`;
}

/**
 * Roda um construtor do supabase-js com retry e devolve só `data`.
 *
 * O supabase-js não lança: ele devolve `{ data, error }`. Aqui o erro vira
 * exceção (para o retry enxergá-lo) e sai etiquetado com a etapa.
 */
export async function runQuery(etapa: string, buildQuery: () => any) {
  return withRetry(etapa, async () => {
    const { data, error } = await buildQuery();
    if (error) throw error;
    return data ?? [];
  });
}

/**
 * Lê a consulta inteira em páginas.
 *
 * O PostgREST devolve no máximo 1000 linhas por requisição, e a consulta é
 * RECONSTRUÍDA a cada página: um construtor já executado não pode ser
 * reaproveitado com outro `range`.
 */
export async function selectAll(etapa: string, buildQuery: () => any, pageSize = 1000) {
  const rows: any[] = [];

  for (let from = 0; ; from += pageSize) {
    const data = await runQuery(etapa, () => buildQuery().range(from, from + pageSize - 1));

    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

/* ============================================================
   Envio
   ============================================================ */

/**
 * Envia cada mensagem para cada navegador.
 *
 * 404 e 410 são o navegador dizendo "esta inscrição não existe mais" —
 * desinstalou o app, limpou os dados, revogou a permissão. A linha sai do
 * banco: insistir nela só geraria erro todo dia, para sempre.
 *
 * `detalhes` guarda o que o serviço de push (Apple, Google, Mozilla) respondeu
 * a CADA inscrição. "enviados: 4" sozinho não diz se as quatro eram o mesmo
 * celular reinstalado três vezes; com o id e o status dá para cruzar com
 * `push_subscriptions` e saber qual endpoint realmente está vivo.
 */
export async function sendToSubscriptions(
  supabase: any,
  subscriptions: any[],
  messages: any[],
  ttlSeconds = 6 * 60 * 60,
) {
  let enviados = 0;
  let falhas = 0;
  const detalhes: any[] = [];

  for (const subscription of subscriptions) {
    const target = {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    };

    for (const message of messages) {
      try {
        const resposta = await webpush.sendNotification(
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
        detalhes.push({ id: subscription.id, status: resposta?.statusCode ?? 'ok' });
        console.info('[push] enviado', subscription.id, resposta?.statusCode);
      } catch (error: any) {
        falhas += 1;
        const status = error?.statusCode ?? 'erro';

        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', subscription.id);
          detalhes.push({ id: subscription.id, status, removida: true });
          console.warn('[push] inscrição morta removida', subscription.id, status);
          break; // esta inscrição morreu; as outras mensagens dela não vão
        }

        const motivo = String(error?.body ?? error?.message ?? error).slice(0, 200);
        detalhes.push({ id: subscription.id, status, erro: motivo });
        console.warn('[push] envio falhou', subscription.id, status, motivo);
      }
    }
  }

  return { enviados, falhas, detalhes };
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

/**
 * A resposta de erro das funções: sempre com a `etapa` em que parou.
 *
 * É o que `net._http_response.content` mostra depois de cada execução do cron.
 * "Gateway Timeout" sozinho obrigava a abrir o log da função para saber se a
 * queda foi ao ler as inscrições ou ao gravar a trava diária.
 */
export function errorResponse(prefix: string, error: any) {
  console.error(`[${prefix}] falhou`, error?.etapa ?? '', error);
  return json(
    {
      ok: false,
      etapa: error?.etapa ?? null,
      error: String(error?.message ?? error),
    },
    500,
  );
}

export async function readJson(request: Request): Promise<any> {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {}; // o cron manda '{}', mas uma chamada sem corpo não é erro
  }
}
