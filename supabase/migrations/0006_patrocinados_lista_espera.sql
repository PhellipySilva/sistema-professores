-- =============================================================================
-- 0006_patrocinados_lista_espera.sql — Atleta patrocinado, capacidade da turma,
-- lista de espera e notificação de vaga
-- =============================================================================
--
-- Três assuntos novos, nenhum deles destrutivo:
--
--   1. students.sponsored — o atleta que o projeto banca. Não paga mensalidade,
--      logo não é inadimplente e não entra no valor previsto do mês.
--
--      Por que uma COLUNA BOOLEANA e não um novo valor num campo de status:
--      status financeiro neste sistema é CALCULADO (0001_schema.sql, tabela
--      payments), nunca gravado. "Patrocinado" é um fato do cadastro do aluno,
--      não um resultado de conta — então é o cadastro que carrega o fato.
--
--      As colunas monthly_fee_cents e due_day NÃO são apagadas ao marcar alguém
--      como patrocinado: enquanto o aluno estiver nesse estado elas ficam
--      ignoradas pelo cálculo, e voltam a valer se o patrocínio terminar.
--      Junto com a tabela payments intacta, isso preserva o histórico
--      financeiro inteiro — que é o pedido explícito da funcionalidade.
--
--   2. classes.capacity — quantas vagas a turma tem. Opcional: turma sem
--      capacidade definida continua funcionando exatamente como hoje.
--
--   3. waitlist_entries + waitlist_notifications — a lista de espera e o aviso
--      de vaga. Ver os comentários de cada tabela abaixo.
--
-- Dinheiro continua em CENTAVOS; datas de calendário continuam `date`; enums
-- continuam text + check — as mesmas convenções de 0001_schema.sql.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema: tudo aqui é `if not exists` ou
--   `drop ... if exists` antes de criar.
-- =============================================================================

-- =============================================================================
-- 1. Atleta patrocinado
-- =============================================================================

alter table public.students
  add column if not exists sponsored boolean not null default false;

comment on column public.students.sponsored is
  'true = atleta patrocinado: não paga mensalidade, não é cobrado e não entra no '
  'valor previsto do mês. monthly_fee_cents e due_day são preservados (ignorados '
  'enquanto sponsored = true) para o histórico financeiro não se perder.';

-- Índice parcial: a dashboard e a listagem contam patrocinados o tempo todo, e
-- eles são poucos. O índice só indexa as linhas que interessam.
create index if not exists students_user_sponsored_idx
  on public.students (user_id)
  where sponsored;

-- =============================================================================
-- 2. Capacidade da turma
-- =============================================================================
-- NULL = turma sem limite declarado. É o padrão, e é o comportamento atual.
-- Com um número, a turma passa a exibir "7/8" e a saída de um aluno vira vaga.

alter table public.classes
  add column if not exists capacity smallint;

alter table public.classes
  drop constraint if exists classes_capacity_check;

alter table public.classes
  add constraint classes_capacity_check
  check (capacity is null or (capacity > 0 and capacity <= 100));

comment on column public.classes.capacity is
  'Número de vagas da turma. NULL = sem limite definido.';

-- =============================================================================
-- 3. waitlist_entries — pessoas na fila por uma vaga
-- =============================================================================
--
-- Gente que AINDA NÃO é aluno. Por isso tabela própria, e não uma flag em
-- students: interessado não tem categoria, não tem mensalidade, não entra em
-- chamada e não pode aparecer nas contas do mês. Misturar os dois cadastros
-- contaminaria todas as consultas que hoje são simples.
--
-- ORDEM DA FILA: é `created_at`, e só. Uma coluna `position` teria que ser
-- renumerada a cada remoção — trabalho extra para reproduzir uma informação que
-- a data de entrada já dá de graça, e que não pode ficar errada.
--
-- desired_slot é NOT NULL de propósito, mesmo com class_id preenchido: é o
-- horário desejado em texto ("Terça e Quinta — 18h"). A interface preenche
-- sozinha a partir da turma escolhida. Isso mantém a informação legível se a
-- turma for excluída depois — e é o que permite o class_id ser `on delete set
-- null` sem deixar a linha sem sentido.
--
-- Por que os FKs de class_id e student_id são SIMPLES, e não compostos com
-- user_id: `on delete set null` anula TODAS as colunas do FK, inclusive user_id,
-- que é not null (mesma razão explicada em makeups, 0001_schema.sql). Não abre
-- brecha: o RLS impede ler linha de outro professor de qualquer forma.

create table if not exists public.waitlist_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null check (length(btrim(name)) > 0),
  phone        text not null check (length(btrim(phone)) > 0),
  class_id     uuid references public.classes (id) on delete set null,
  desired_slot text not null check (length(btrim(desired_slot)) > 0),
  notes        text,
  status       text not null default 'waiting'
                 check (status in ('waiting', 'contacted', 'enrolled', 'removed')),
  student_id   uuid references public.students (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- A fila de uma turma é sempre lida na ordem de chegada.
create index if not exists waitlist_entries_user_class_idx
  on public.waitlist_entries (user_id, class_id, created_at);

create index if not exists waitlist_entries_user_status_idx
  on public.waitlist_entries (user_id, status, created_at);

comment on table public.waitlist_entries is
  'Fila de interessados por uma vaga. Independente de students: quem está aqui '
  'ainda não é aluno. A ordem da fila é created_at.';

comment on column public.waitlist_entries.desired_slot is
  'Horário desejado em texto legível. Preenchido a partir da turma escolhida, '
  'e sobrevive à exclusão dela.';

comment on column public.waitlist_entries.status is
  'waiting = na fila · contacted = professor já falou com a pessoa · '
  'enrolled = virou aluno · removed = desistiu / saiu da fila.';

-- =============================================================================
-- 4. waitlist_notifications — aviso de que surgiu uma vaga
-- =============================================================================
--
-- Criada quando um aluno sai de uma turma que TEM gente esperando por ela.
-- Nunca matricula ninguém: a decisão é do professor (é o requisito 4.2).
--
-- ANTIDUPLICAÇÃO — o índice único parcial abaixo é a regra inteira:
-- só pode existir UMA notificação não resolvida por turma. Enquanto o professor
-- não resolver o aviso daquela turma, nenhuma outra saída cria um segundo card
-- dizendo a mesma coisa. O banco garante isso mesmo se duas abas tentarem ao
-- mesmo tempo — não depende de o frontend conferir antes.
--
-- Quem está esperando NÃO é congelado aqui: a tela cruza a notificação com
-- waitlist_entries na hora de exibir. Assim, alguém que entrou na fila depois
-- do aviso aparece nele, e quem foi matriculado sai — sem precisar atualizar
-- linha nenhuma.
--
-- Aqui o FK é COMPOSTO (id, user_id) com `on delete cascade`: turma excluída
-- não deixa aviso órfão de vaga em turma que não existe mais.

create table if not exists public.waitlist_notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  class_id     uuid not null,
  student_name text,
  status       text not null default 'new' check (status in ('new', 'seen', 'resolved')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint waitlist_notifications_class_fk
    foreign key (class_id, user_id)
    references public.classes (id, user_id) on delete cascade
);

create unique index if not exists waitlist_notifications_open_unique
  on public.waitlist_notifications (class_id)
  where status <> 'resolved';

create index if not exists waitlist_notifications_user_status_idx
  on public.waitlist_notifications (user_id, status, created_at desc);

comment on table public.waitlist_notifications is
  'Aviso de vaga aberta numa turma com fila de espera. Uma por turma enquanto '
  'não for resolvida (índice waitlist_notifications_open_unique).';

comment on column public.waitlist_notifications.student_name is
  'Nome de quem saiu da turma, em texto — só para o professor lembrar do porquê '
  'do aviso. Sem FK: o aluno pode ser excluído e o aviso continua fazendo sentido.';

comment on column public.waitlist_notifications.status is
  'new = ainda não vista · seen = o professor abriu a tela · resolved = tratada.';

-- =============================================================================
-- 5. updated_at automático (mesmo padrão de 0003_triggers.sql)
-- =============================================================================

drop trigger if exists waitlist_entries_set_updated_at on public.waitlist_entries;
create trigger waitlist_entries_set_updated_at
  before update on public.waitlist_entries
  for each row execute function public.set_updated_at();

drop trigger if exists waitlist_notifications_set_updated_at on public.waitlist_notifications;
create trigger waitlist_notifications_set_updated_at
  before update on public.waitlist_notifications
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 6. Row Level Security (mesma política de 0002_rls.sql)
-- =============================================================================
-- Sem isto, as duas tabelas novas ficariam legíveis para qualquer professor —
-- é a parte deste arquivo que NÃO pode ser esquecida.

alter table public.waitlist_entries        enable row level security;
alter table public.waitlist_notifications  enable row level security;

drop policy if exists "waitlist_entries_owner" on public.waitlist_entries;
create policy "waitlist_entries_owner" on public.waitlist_entries
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "waitlist_notifications_owner" on public.waitlist_notifications;
create policy "waitlist_notifications_owner" on public.waitlist_notifications
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
