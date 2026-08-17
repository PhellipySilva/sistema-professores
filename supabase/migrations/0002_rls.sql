-- =============================================================================
-- 0002_rls.sql — Row Level Security
-- =============================================================================
--
-- A segurança do sistema mora AQUI, não na interface (spec, seção 32).
-- O frontend usa a chave anônima, que é pública. O que impede um professor de
-- ver os dados de outro são estas políticas.
--
-- `for all` cobre select, insert, update e delete de uma vez:
--   using      → quais linhas a política deixa LER/alterar/apagar
--   with check → quais linhas a política deixa GRAVAR
--
-- Escrever `using` e `with check` com a mesma condição impede tanto ler o dado
-- alheio quanto criar dado no nome de outro.
--
-- `to authenticated` deixa explícito que o papel anônimo não recebe nada.
--
-- Execute depois de 0001_schema.sql.
-- =============================================================================

alter table public.profiles        enable row level security;
alter table public.students        enable row level security;
alter table public.classes         enable row level security;
alter table public.class_schedules enable row level security;
alter table public.class_students  enable row level security;
alter table public.class_sessions  enable row level security;
alter table public.attendance      enable row level security;
alter table public.makeups         enable row level security;
alter table public.payments        enable row level security;
alter table public.lesson_plans    enable row level security;

-- -----------------------------------------------------------------------------
-- profiles — a chave é `id`, não `user_id`, porque o id É o usuário.
-- Sem política de delete: o perfil morre junto com a conta, por cascata.
-- -----------------------------------------------------------------------------

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- Demais tabelas — todas com a mesma política.
-- -----------------------------------------------------------------------------

create policy "students_owner" on public.students
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "classes_owner" on public.classes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "class_schedules_owner" on public.class_schedules
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "class_students_owner" on public.class_students
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "class_sessions_owner" on public.class_sessions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "attendance_owner" on public.attendance
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "makeups_owner" on public.makeups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "payments_owner" on public.payments
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "lesson_plans_owner" on public.lesson_plans
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
