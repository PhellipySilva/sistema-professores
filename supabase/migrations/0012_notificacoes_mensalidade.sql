-- =============================================================================
-- 0012_notificacoes_mensalidade.sql — Avisos de mensalidade (Web Push + central)
-- =============================================================================
--
-- NADA do que já existe é alterado aqui. São duas tabelas novas e uma função,
-- somadas ao que o sistema já faz — o cálculo de "quem está atrasado" continua
-- morando em js/financeiro/financeiro.js, derivado de `payments` na hora, e
-- nenhuma coluna de status entra no banco.
--
-- 1. push_subscriptions    — o aparelho/navegador em que o professor aceitou
--                            receber os avisos. É o endereço para onde o push
--                            é enviado, e some quando ele desativa.
--
-- 2. payment_notifications — O REGISTRO de cada aviso já enviado, uma linha por
--                            aluno por dia. Serve a duas coisas ao mesmo tempo:
--                              * é a central do sininho (lista + marcar lido);
--                              * É A TRAVA de "no máximo 1 aviso por aluno por
--                                dia" — o índice único abaixo, e não o código.
--                                Duas execuções simultâneas da função agendada
--                                não conseguem gerar dois avisos do mesmo aluno.
--
-- POR QUE O AVISO É GRAVADO EM TEXTO (title/body/url)
--
--   A mensalidade é paga no dia seguinte e o aviso continua no histórico. Se a
--   frase fosse remontada na hora de exibir, o aviso de ontem passaria a dizer
--   "em dia" — apagando o motivo pelo qual ele existiu. O texto é uma
--   FOTOGRAFIA do que foi enviado, como o `desired_slot` da lista de espera.
--
--   E ele nunca contém VALOR: a notificação aparece na tela bloqueada do
--   celular, onde qualquer pessoa lê. Nome e data bastam para o professor saber
--   o que fazer; quanto é, ele vê dentro do sistema.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

-- =============================================================================
-- 1. push_subscriptions — para onde o aviso é enviado
-- =============================================================================
--
-- Os três campos (endpoint, p256dh, auth) são exatamente o que o navegador
-- devolve em PushManager.subscribe(). Não são segredo do professor: sem a chave
-- VAPID privada, que só existe no servidor, ninguém consegue usá-los.
--
-- `endpoint` é ÚNICO NO SISTEMA INTEIRO, e não por professor: ele identifica um
-- navegador, e um navegador tem um dono por vez. Sem essa unicidade global, um
-- aparelho emprestado continuaria recebendo os avisos do professor anterior —
-- com o nome dos alunos dele. Quem cuida da troca é save_push_subscription().

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Navegadores em que o professor aceitou receber avisos de mensalidade. Uma '
  'linha por navegador; o endpoint e unico no sistema.';

comment on column public.push_subscriptions.endpoint is
  'URL do servico de push do navegador. Identifica o aparelho, nao a pessoa.';

-- =============================================================================
-- 2. payment_notifications — o aviso enviado
-- =============================================================================
--
-- O FK é COMPOSTO (student_id, user_id) com cascata, como nas demais tabelas
-- filhas: aluno excluído não deixa aviso órfão na central.
--
-- `notified_on` é a DATA do aviso no fuso do professor, e não um recorte de
-- created_at: o envio das 18h grava 08/09 mesmo tendo acontecido às 21h em UTC.
-- É essa coluna que faz o índice único significar "um por dia" de verdade.

create table if not exists public.payment_notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  student_id      uuid not null,

  kind            text not null
                    check (kind in ('due_tomorrow', 'due_today', 'overdue')),
  reference_month date not null check (extract(day from reference_month) = 1),
  due_date        date not null,
  days_overdue    smallint not null default 0 check (days_overdue >= 0),

  notified_on     date not null,
  title           text not null,
  body            text not null,
  url             text not null,

  read_at         timestamptz,
  created_at      timestamptz not null default now(),

  constraint payment_notifications_student_fk
    foreign key (student_id, user_id)
    references public.students (id, user_id) on delete cascade
);

-- A REGRA "no máximo 1 notificação por aluno por dia", escrita onde ela não
-- pode ser contornada. A função agendada insere ANTES de enviar: o que o banco
-- recusar aqui não vira push nenhum.
create unique index if not exists payment_notifications_daily_unique
  on public.payment_notifications (user_id, student_id, notified_on);

-- A central abre listando os mais recentes.
create index if not exists payment_notifications_user_created_idx
  on public.payment_notifications (user_id, created_at desc);

-- O contador do sininho pergunta só pelos não lidos.
create index if not exists payment_notifications_user_unread_idx
  on public.payment_notifications (user_id, created_at desc)
  where read_at is null;

comment on table public.payment_notifications is
  'Avisos de mensalidade ja enviados ao professor. Uma linha por aluno por dia '
  '(indice payment_notifications_daily_unique) — e essa trava que impede '
  'repetir o mesmo aviso no mesmo dia.';

comment on column public.payment_notifications.kind is
  'due_tomorrow = vence amanha · due_today = vence hoje · overdue = atrasada.';

comment on column public.payment_notifications.notified_on is
  'Dia do aviso no fuso do professor. Chave da trava diaria.';

comment on column public.payment_notifications.body is
  'Texto exato que foi enviado. NUNCA contem valor em dinheiro: o aviso aparece '
  'na tela bloqueada do celular.';

comment on column public.payment_notifications.read_at is
  'NULL = ainda nao lido. E daqui que sai o numero no sininho.';

-- =============================================================================
-- 3. updated_at automático (mesmo padrão de 0003_triggers.sql)
-- =============================================================================

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. Row Level Security (mesma política de 0002_rls.sql)
-- =============================================================================

alter table public.push_subscriptions    enable row level security;
alter table public.payment_notifications enable row level security;

drop policy if exists "push_subscriptions_owner" on public.push_subscriptions;
create policy "push_subscriptions_owner" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "payment_notifications_owner" on public.payment_notifications;
create policy "payment_notifications_owner" on public.payment_notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- 5. save_push_subscription() — registrar o navegador atual
-- =============================================================================
--
-- Existe porque o RLS, sozinho, não dá conta do aparelho que troca de dono: se
-- o endpoint já estiver gravado no nome de OUTRO professor, a política impede
-- tanto o update quanto o delete daquela linha, e o upsert falharia — deixando
-- o aparelho recebendo os avisos de quem usou o navegador antes.
--
-- security definer para poder apagar essa linha alheia, e SÓ isso: a linha nova
-- é sempre gravada com auth.uid(). Não existe parâmetro de usuário, então não
-- há como chamar esta função em nome de outra pessoa.

create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessao';
  end if;

  -- O navegador mudou de dono (ou de conta): o registro antigo dele sai.
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and user_id <> auth.uid();

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
     set p256dh     = excluded.p256dh,
         auth       = excluded.auth,
         user_agent = excluded.user_agent;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

comment on function public.save_push_subscription(text, text, text, text) is
  'Registra o navegador atual para receber avisos de mensalidade. Sempre no '
  'nome de quem chama, e tira o endpoint de qualquer outro dono.';

-- =============================================================================
-- 6. O AGENDAMENTO — 08:00, 12:00 e 18:00 (horário de Brasília)
-- =============================================================================
--
-- Os três horários existem porque o professor pode não ver o aviso da manhã. A
-- função `notificar-mensalidades` recebe as três chamadas todos os dias, mas SÓ
-- ENVIA na que for o horário do dia (a rotação está em
-- js/notificacoes/mensalidades.js, slotHourForDate) — nas outras duas ela sai
-- sem fazer nada. Assim o revezamento é uma regra testável em JavaScript, e não
-- três agendamentos que precisariam ser reescritos para mudar.
--
-- O cron do Postgres roda em UTC: 08:00/12:00/18:00 em Brasília (UTC-3) são
-- 11:00/15:00/21:00 aqui.
--
-- NÃO DÁ PARA COLAR ESTE BLOCO COMO ESTÁ: ele precisa da URL do seu projeto e
-- da service_role key. Descomente, substitua os dois marcadores e rode UMA VEZ,
-- depois de publicar a função (veja o README, "Avisos de mensalidade").
--
-- A chave tem que ser a `service_role` LEGADA (o JWT que começa com `eyJ`, em
-- Project Settings → API Keys). A função exige token válido, e a chave nova no
-- formato `sb_secret_...` não é um JWT: com ela a chamada volta 401 e o
-- agendamento fica rodando sem enviar nada.
--
-- ANTES: ligue as duas extensões em Database → Extensions, no painel — é o
-- caminho oficial do Supabase, e cada uma cria o próprio schema (`cron` e
-- `net`), que é de onde vêm os nomes usados abaixo.
--
--   pg_cron  agenda a chamada
--   pg_net   faz a chamada HTTP de dentro do banco
--
-- Pelo SQL Editor também vale, sem indicar schema (elas escolhem o seu):
--
-- -----------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.unschedule(jobname)
--   from cron.job
--  where jobname in ('notificar-mensalidades-08',
--                    'notificar-mensalidades-12',
--                    'notificar-mensalidades-18');
--
-- select cron.schedule('notificar-mensalidades-08', '0 11 * * *', $cron$
--   select net.http_post(
--     url     := 'https://SEU-PROJETO.supabase.co/functions/v1/notificar-mensalidades',
--     headers := jsonb_build_object(
--                  'Content-Type',  'application/json',
--                  'Authorization', 'Bearer SUA-SERVICE-ROLE-KEY'),
--     body    := '{}'::jsonb
--   );
-- $cron$);
--
-- select cron.schedule('notificar-mensalidades-12', '0 15 * * *', $cron$
--   select net.http_post(
--     url     := 'https://SEU-PROJETO.supabase.co/functions/v1/notificar-mensalidades',
--     headers := jsonb_build_object(
--                  'Content-Type',  'application/json',
--                  'Authorization', 'Bearer SUA-SERVICE-ROLE-KEY'),
--     body    := '{}'::jsonb
--   );
-- $cron$);
--
-- select cron.schedule('notificar-mensalidades-18', '0 21 * * *', $cron$
--   select net.http_post(
--     url     := 'https://SEU-PROJETO.supabase.co/functions/v1/notificar-mensalidades',
--     headers := jsonb_build_object(
--                  'Content-Type',  'application/json',
--                  'Authorization', 'Bearer SUA-SERVICE-ROLE-KEY'),
--     body    := '{}'::jsonb
--   );
-- $cron$);
--
-- Conferência:  select jobname, schedule, active from cron.job;
-- -----------------------------------------------------------------------------
