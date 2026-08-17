-- =============================================================================
-- 0001_schema.sql — Tabelas, constraints e índices
-- =============================================================================
--
-- Convenções do projeto:
--
--   * Toda tabela de dados carrega `user_id`. É redundante de propósito: torna
--     toda política de RLS a mesma linha (`user_id = auth.uid()`), em vez de
--     subconsultas encadeadas. Ver 0002_rls.sql.
--
--   * Para que essa redundância não vire brecha, as tabelas filhas usam CHAVE
--     ESTRANGEIRA COMPOSTA `(pai_id, user_id) -> pai(id, user_id)`. Sem isso, um
--     professor poderia inserir uma linha com o próprio user_id apontando para a
--     turma de outro (a validação de FK não passa por RLS). É por isso que as
--     tabelas pai têm `unique (id, user_id)` — um índice único é obrigatório
--     para ser alvo de FK.
--
--   * Dinheiro: INTEIRO EM CENTAVOS. Nunca float, nunca numeric.
--
--   * Datas de calendário: `date`. Horários: `time`. Nada de timestamptz para
--     dado que o usuário lê como "o dia da aula" — timestamptz só em
--     created_at / updated_at.
--
--   * Enums como text + check: mais fácil de evoluir do que create type, e o
--     valor legível aparece direto no SQL Editor.
--
-- Execute este arquivo INTEIRO no SQL Editor do Supabase, antes dos demais.
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- profiles — perfil do professor, 1:1 com auth.users
-- =============================================================================

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  email      text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Perfil do professor. Criado automaticamente pelo trigger on_auth_user_created.';

-- =============================================================================
-- students — alunos
-- =============================================================================

create table public.students (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null check (length(btrim(name)) > 0),
  phone             text,
  category          text not null check (category in ('kids', 'adulto')),
  guardian_name     text,

  -- Mensalidade fica no próprio aluno (spec, seção 11): menos tabelas, menos joins.
  monthly_fee_cents integer check (monthly_fee_cents > 0),
  -- Limitado a 28 aqui; 0004_due_day_31.sql amplia para 31. O caso do
  -- "dia 31 de fevereiro" é tratado no cálculo, não com uma restrição.
  due_day           smallint check (due_day between 1 and 28),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint students_id_user_key unique (id, user_id)
);

create index students_user_id_name_idx on public.students (user_id, name);

comment on column public.students.monthly_fee_cents is
  'Valor da mensalidade EM CENTAVOS. 15000 = R$ 150,00.';

-- =============================================================================
-- classes — turmas
-- =============================================================================
-- A duração NÃO é coluna: sai de (end_time - start_time) em class_schedules.
-- Guardar as duas coisas seria dado duplicado que pode divergir.

create table public.classes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  category   text not null check (category in ('kids', 'adulto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint classes_id_user_key unique (id, user_id)
);

create index classes_user_id_name_idx on public.classes (user_id, name);

-- =============================================================================
-- class_schedules — horário recorrente da turma
-- =============================================================================
-- Uma turma pode ter vários dias (spec, seção 16): "Segunda 17:00" + "Quarta 17:00".
-- day_of_week: 0 = domingo ... 6 = sábado — mesma convenção do Date.getDay() do
-- JavaScript e do extract(dow) do Postgres.

create table public.class_schedules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  class_id     uuid not null,
  day_of_week  smallint not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  created_at   timestamptz not null default now(),

  constraint class_schedules_time_order check (end_time > start_time),
  constraint class_schedules_class_fk
    foreign key (class_id, user_id)
    references public.classes (id, user_id) on delete cascade,
  constraint class_schedules_unique unique (class_id, day_of_week, start_time)
);

create index class_schedules_class_id_idx on public.class_schedules (class_id);
create index class_schedules_user_id_idx on public.class_schedules (user_id);

-- =============================================================================
-- class_students — matrícula (relação N:N entre aluno e turma)
-- =============================================================================
-- Remover aluno da turma marca active = false em vez de apagar, para o
-- histórico de frequência dele naquela turma continuar explicável.

create table public.class_students (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  class_id   uuid not null,
  student_id uuid not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),

  constraint class_students_class_fk
    foreign key (class_id, user_id)
    references public.classes (id, user_id) on delete cascade,
  constraint class_students_student_fk
    foreign key (student_id, user_id)
    references public.students (id, user_id) on delete cascade,
  constraint class_students_unique unique (class_id, student_id)
);

create index class_students_student_id_idx on public.class_students (student_id);
create index class_students_class_id_active_idx
  on public.class_students (class_id, active);
create index class_students_user_id_idx on public.class_students (user_id);

-- =============================================================================
-- class_sessions — a aula de UMA data específica
-- =============================================================================
-- class_schedules é uma regra recorrente ("toda segunda às 17h").
-- class_sessions é a aula concreta ("17/08/2026 às 17h").
-- A frequência se prende à sessão, nunca à turma (spec, seção 18).
--
-- Estas linhas são criadas sob demanda: a agenda calcula as ocorrências do mês
-- a partir dos horários e só grava quando o professor abre a aula. start_time é
-- copiado do horário no momento da criação, então mudar o horário da turma
-- depois não altera o passado.

create table public.class_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  class_id     uuid not null,
  session_date date not null,
  start_time   time not null,
  end_time     time not null,
  status       text not null default 'scheduled'
                 check (status in ('scheduled', 'done', 'canceled')),
  created_at   timestamptz not null default now(),

  constraint class_sessions_time_order check (end_time > start_time),
  constraint class_sessions_class_fk
    foreign key (class_id, user_id)
    references public.classes (id, user_id) on delete cascade,
  -- Impede materializar a mesma aula duas vezes; é a chave do upsert da agenda.
  constraint class_sessions_unique unique (class_id, session_date, start_time),
  constraint class_sessions_id_user_key unique (id, user_id)
);

create index class_sessions_user_date_idx
  on public.class_sessions (user_id, session_date);
create index class_sessions_class_id_idx on public.class_sessions (class_id);

-- =============================================================================
-- attendance — frequência
-- =============================================================================
-- status:
--   present — veio na aula dele
--   absent  — faltou na aula dele
--   makeup  — está aqui REPONDO uma falta de outra data

create table public.attendance (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status     text not null check (status in ('present', 'absent', 'makeup')),
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint attendance_session_fk
    foreign key (session_id, user_id)
    references public.class_sessions (id, user_id) on delete cascade,
  constraint attendance_student_fk
    foreign key (student_id, user_id)
    references public.students (id, user_id) on delete cascade,
  -- Essencial: permite que a chamada seja um upsert idempotente. Tocar de novo
  -- no botão sobrescreve em vez de duplicar (spec, seção 19).
  constraint attendance_unique unique (session_id, student_id)
);

create index attendance_student_id_idx on public.attendance (student_id);
create index attendance_session_id_idx on public.attendance (session_id);
create index attendance_user_id_idx on public.attendance (user_id);

-- =============================================================================
-- makeups — reposições
-- =============================================================================
-- Guarda o id da sessão E a data (spec, seção 21). É redundância proposital:
-- se a sessão for apagada, a data da falta continua no histórico do aluno.
--
-- Por que os FKs de sessão aqui são SIMPLES e não compostos:
-- `on delete set null` anula TODAS as colunas do FK — inclusive user_id, que é
-- not null. Então essas duas colunas usam FK simples. Não abre brecha: mesmo
-- que um id de outro professor fosse gravado, o RLS impede lê-lo.

create table public.makeups (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  student_id          uuid not null,
  original_session_id uuid references public.class_sessions (id) on delete set null,
  makeup_session_id   uuid references public.class_sessions (id) on delete set null,
  original_date       date not null,
  makeup_date         date,
  status              text not null default 'pending'
                        check (status in ('pending', 'scheduled', 'completed')),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint makeups_student_fk
    foreign key (student_id, user_id)
    references public.students (id, user_id) on delete cascade,
  -- Uma reposição por falta.
  constraint makeups_unique unique (student_id, original_session_id)
);

create index makeups_student_status_idx on public.makeups (student_id, status);
create index makeups_makeup_session_idx on public.makeups (makeup_session_id);
create index makeups_user_id_idx on public.makeups (user_id);

-- =============================================================================
-- payments — pagamentos de mensalidade
-- =============================================================================
-- NÃO existe coluna `status`: a spec (seção 12) manda calcular. O status sai de
-- paid_date + due_date + hoje, no frontend, no fuso do professor.
--
-- reference_month é sempre o DIA 1 do mês de referência (2026-08-01), garantido
-- pelo check abaixo. Como `date` (e não texto "AGO/2026"), ordena e compara sem
-- precisar de parsing.

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  student_id      uuid not null,
  amount_cents    integer not null check (amount_cents > 0),
  reference_month date not null check (extract(day from reference_month) = 1),
  due_date        date not null,
  paid_date       date,
  created_at      timestamptz not null default now(),

  constraint payments_student_fk
    foreign key (student_id, user_id)
    references public.students (id, user_id) on delete cascade,
  -- Um lançamento por aluno por mês. É também a chave do upsert de "registrar
  -- pagamento", que impede lançar agosto duas vezes.
  constraint payments_unique unique (student_id, reference_month)
);

create index payments_student_reference_idx
  on public.payments (student_id, reference_month desc);
create index payments_user_id_idx on public.payments (user_id);

comment on column public.payments.amount_cents is
  'Valor EM CENTAVOS. 15000 = R$ 150,00.';
comment on column public.payments.paid_date is
  'NULL = ainda não pago. O status "em dia / atrasado" é derivado desta coluna.';

-- =============================================================================
-- lesson_plans — planejamento de aulas
-- =============================================================================

create table public.lesson_plans (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0),
  description text,
  lesson_date date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index lesson_plans_user_date_idx
  on public.lesson_plans (user_id, lesson_date desc);
