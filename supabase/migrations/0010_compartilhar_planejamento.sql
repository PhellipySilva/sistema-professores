-- =============================================================================
-- 0010_compartilhar_planejamento.sql — Compartilhar um planejamento com outro
--                                      professor do sistema
-- =============================================================================
--
-- O professor escolhe um COLEGA DENTRO DO SISTEMA e o planejamento passa a
-- aparecer, somente para leitura, na tela de planejamentos dele.
--
-- NÃO EXISTE LINK PÚBLICO
--
--   A autorização é a linha desta tabela mais a sessão de quem lê — nunca uma
--   URL secreta. Quem não estiver autenticado não passa do `to authenticated`
--   das políticas; quem estiver autenticado e não for o dono nem o destinatário
--   não encontra a linha. Um link copiado por engano não vale nada.
--
-- POR QUE UMA TABELA DE LIGAÇÃO
--
--   O mesmo plano pode ir para dois colegas, e o mesmo colega pode receber
--   vários planos: é N:N, como class_students. Uma coluna `shared_with` em
--   lesson_plans só serviria para um destinatário e transformaria "descompartilhar"
--   em perda de dado.
--
-- POR QUE O user_id NÃO ENTRA NO FK
--
--   Aqui a tabela é justamente o ponto em que DOIS professores se encontram, e
--   por isso ela foge da convenção de `user_id = auth.uid()` do resto do banco:
--   `owner_id` é quem compartilhou, `shared_with_id` é quem recebeu, e as
--   políticas citam os dois. É a única tabela do sistema com essa forma.
--
-- COMO ENCONTRAR O COLEGA
--
--   `profiles` continua fechado: cada professor só lê o próprio perfil. Para o
--   seletor de destinatário existe a função `list_teachers()`, SECURITY DEFINER,
--   que devolve APENAS id e nome dos outros professores — nunca e-mail, nunca
--   dado de aluno. É o mínimo para escolher uma pessoa numa lista.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

create table if not exists public.lesson_plan_shares (
  id             uuid primary key default gen_random_uuid(),
  lesson_plan_id uuid not null references public.lesson_plans (id) on delete cascade,
  owner_id       uuid not null references auth.users (id) on delete cascade,
  shared_with_id uuid not null references auth.users (id) on delete cascade,
  created_at     timestamptz not null default now(),

  -- Compartilhar duas vezes com a mesma pessoa é a mesma coisa que uma:
  -- é também a chave do upsert da tela.
  constraint lesson_plan_shares_unique unique (lesson_plan_id, shared_with_id),
  constraint lesson_plan_shares_not_self check (owner_id <> shared_with_id)
);

-- "O que compartilharam comigo?" é a pergunta que a tela de planejamentos faz a
-- cada carregamento.
create index if not exists lesson_plan_shares_shared_with_idx
  on public.lesson_plan_shares (shared_with_id);

create index if not exists lesson_plan_shares_plan_idx
  on public.lesson_plan_shares (lesson_plan_id);

alter table public.lesson_plan_shares enable row level security;

-- -----------------------------------------------------------------------------
-- Políticas
-- -----------------------------------------------------------------------------
-- `drop ... if exists` antes de cada create: é o que deixa o arquivo rodar duas
-- vezes sem erro, já que `create policy if not exists` não existe no Postgres.

drop policy if exists "lesson_plan_shares_read" on public.lesson_plan_shares;

create policy "lesson_plan_shares_read" on public.lesson_plan_shares
  for select to authenticated
  using (owner_id = auth.uid() or shared_with_id = auth.uid());

/* Só o DONO do planejamento compartilha, e só em nome próprio. A subconsulta em
   lesson_plans é lida sob o RLS de quem está inserindo: apontar para o plano de
   outro professor não encontra linha nenhuma e a inserção é recusada. */
drop policy if exists "lesson_plan_shares_insert" on public.lesson_plan_shares;

create policy "lesson_plan_shares_insert" on public.lesson_plan_shares
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.lesson_plans plan
       where plan.id = lesson_plan_id
         and plan.user_id = auth.uid()
    )
  );

/* Os dois lados podem desfazer: o dono tira o acesso que deu, e quem recebeu
   pode remover da própria tela um plano que não quer mais ver. Nenhum dos dois
   apaga o planejamento — só o vínculo. */
drop policy if exists "lesson_plan_shares_delete" on public.lesson_plan_shares;

create policy "lesson_plan_shares_delete" on public.lesson_plan_shares
  for delete to authenticated
  using (owner_id = auth.uid() or shared_with_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Leitura do planejamento compartilhado
-- -----------------------------------------------------------------------------
-- A política de dono (`lesson_plans_owner`, em 0002_rls.sql) continua intacta.
-- Políticas do mesmo comando se somam (OR), então esta APENAS acrescenta o
-- destinatário à leitura — e a nada mais: escrever continua sendo do dono.

drop policy if exists "lesson_plans_shared_read" on public.lesson_plans;

create policy "lesson_plans_shared_read" on public.lesson_plans
  for select to authenticated
  using (
    exists (
      select 1 from public.lesson_plan_shares share
       where share.lesson_plan_id = lesson_plans.id
         and share.shared_with_id = auth.uid()
    )
  );

-- -----------------------------------------------------------------------------
-- list_teachers() — os colegas que podem receber um compartilhamento
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER porque `profiles` é fechado por RLS e precisa continuar
-- assim. A função é a única fresta, e ela é estreita de propósito:
--   * devolve id e nome, nunca e-mail;
--   * nunca inclui quem chamou;
--   * `auth.uid() is null` (visitante anônimo) devolve lista vazia, além de o
--     grant abaixo já ser só para `authenticated`.
-- `set search_path` é obrigatório em função definer: sem isso, um schema
-- plantado no caminho de busca poderia trocar a tabela lida por outra.

create or replace function public.list_teachers()
returns table (id uuid, name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.name
    from public.profiles p
   where auth.uid() is not null
     and p.id <> auth.uid()
   order by p.name;
$$;

revoke all on function public.list_teachers() from public, anon;
grant execute on function public.list_teachers() to authenticated;

comment on function public.list_teachers() is
  'Professores do sistema, exceto quem chamou. Só id e nome — é o mínimo para '
  'escolher o destinatário de um planejamento compartilhado.';
