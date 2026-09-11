-- =============================================================================
-- 0013_notificacoes_aulas.sql — Avisos de início de aula
-- =============================================================================
--
-- Uma tabela nova, e mais nada. `payment_notifications` não é tocada, e os
-- avisos de mensalidade continuam exatamente como estão.
--
-- POR QUE UMA TABELA SEPARADA, E NÃO A MESMA DOS AVISOS FINANCEIROS
--
--   `payment_notifications` é sobre um ALUNO: student_id, reference_month e
--   due_date são `not null` lá, porque um aviso de mensalidade sem aluno não
--   significa nada. O aviso de aula não tem aluno nenhum — ele é sobre o DIA do
--   professor. Encaixá-lo naquela tabela exigiria afrouxar três colunas que hoje
--   garantem que todo aviso financeiro está completo.
--
--   As duas viram uma lista só na hora de exibir, no sininho. É lá que elas se
--   encontram, e é só lá que precisam se parecer.
--
-- A TRAVA DE "UMA VEZ POR DIA"
--
--   Mesmo desenho de payment_notifications: o índice único
--   (user_id, kind, lesson_date) é a regra, e a linha é gravada ANTES do envio.
--   O agendamento roda de 5 em 5 minutos e, dentro da janela, calcula o mesmo
--   aviso muitas vezes — o que impede o segundo push é o banco, não o código.
--
-- SEM CHAVE ESTRANGEIRA PARA A TURMA
--
--   De propósito. O aviso fala do dia ("sua primeira aula começa em 1 hora"), e
--   não daquela turma; `start_time` é guardado como texto do horário só para o
--   histórico explicar a que hora era. Turma excluída depois não apaga o aviso
--   que já foi dado, pelo mesmo motivo de `makeups.original_date` existir.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

create table if not exists public.lesson_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,

  kind        text not null
                check (kind in ('one_hour_before', 'starting_now')),
  lesson_date date not null,
  start_time  time not null,

  title       text not null,
  body        text not null,
  url         text not null,

  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- A REGRA "não repetir o mesmo aviso no mesmo dia", escrita onde ela não pode
-- ser contornada.
create unique index if not exists lesson_notifications_daily_unique
  on public.lesson_notifications (user_id, kind, lesson_date);

-- A central abre listando os mais recentes.
create index if not exists lesson_notifications_user_created_idx
  on public.lesson_notifications (user_id, created_at desc);

-- O contador do sininho pergunta só pelos não lidos.
create index if not exists lesson_notifications_user_unread_idx
  on public.lesson_notifications (user_id, created_at desc)
  where read_at is null;

comment on table public.lesson_notifications is
  'Avisos de inicio de aula ja enviados ao professor. Um por tipo por dia '
  '(indice lesson_notifications_daily_unique).';

comment on column public.lesson_notifications.kind is
  'one_hour_before = uma hora antes da primeira aula do dia · '
  'starting_now = na hora dela.';

comment on column public.lesson_notifications.start_time is
  'Horario da primeira aula daquele dia. Guardado para o historico continuar '
  'explicavel se a grade da turma mudar depois.';

-- =============================================================================
-- Row Level Security (mesma política de 0002_rls.sql)
-- =============================================================================

alter table public.lesson_notifications enable row level security;

drop policy if exists "lesson_notifications_owner" on public.lesson_notifications;
create policy "lesson_notifications_owner" on public.lesson_notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- O AGENDAMENTO — de 5 em 5 minutos
-- =============================================================================
--
-- Aqui NÃO dá para usar horários fixos como nos avisos de mensalidade: a
-- primeira aula de cada professor cai numa hora diferente a cada dia da semana,
-- e o aviso tem que sair uma hora antes DELA. Quem descobre esse horário é a
-- função, lendo a grade das turmas; o cron só a acorda com frequência
-- suficiente para ela nunca perder a janela.
--
-- Cinco minutos é o equilíbrio: "Hora de começar!" chega no máximo 4 minutos
-- atrasado, e são 288 execuções por dia — quase todas terminando em duas
-- consultas baratas e nenhum envio. Para economizar mais, troque por `*/10` ou
-- `*/15`; o custo é o aviso chegar mais tarde.
--
-- O `timeout_milliseconds` é explícito porque o padrão do pg_net é 5 segundos,
-- apertado para uma função que ainda consulta o banco e assina os envios.
--
-- NÃO DÁ PARA COLAR COMO ESTÁ: precisa da URL do projeto e da service_role
-- LEGADA (o JWT que começa com `eyJ`). Rode UMA VEZ, depois de publicar a
-- função `notificar-aulas`.
--
-- -----------------------------------------------------------------------------
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.unschedule(jobname) from cron.job where jobname = 'notificar-aulas';
--
-- select cron.schedule('notificar-aulas', '*/5 * * * *', $cron$
--   select net.http_post(
--     url     := 'https://SEU-PROJETO.supabase.co/functions/v1/notificar-aulas',
--     headers := jsonb_build_object(
--                  'Content-Type',  'application/json',
--                  'Authorization', 'Bearer SUA-SERVICE-ROLE-KEY'),
--     body    := '{}'::jsonb,
--     timeout_milliseconds := 30000
--   );
-- $cron$);
--
-- Conferência:  select jobname, schedule, active from cron.job;
-- -----------------------------------------------------------------------------
