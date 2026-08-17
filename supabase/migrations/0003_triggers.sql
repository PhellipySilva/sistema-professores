-- =============================================================================
-- 0003_triggers.sql — Automatismos do banco
-- =============================================================================
--
-- Duas coisas que o banco resolve melhor do que o frontend:
--
--   1. updated_at — se ficasse a cargo do JavaScript, uma linha alterada pelo
--      SQL Editor ficaria com a data errada.
--   2. Criação do profile — precisa acontecer no mesmo instante do cadastro do
--      usuário, e o frontend não tem como garantir isso.
--
-- Execute depois de 0002_rls.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- updated_at automático
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger students_set_updated_at
  before update on public.students
  for each row execute function public.set_updated_at();

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function public.set_updated_at();

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

create trigger makeups_set_updated_at
  before update on public.makeups
  for each row execute function public.set_updated_at();

create trigger lesson_plans_set_updated_at
  before update on public.lesson_plans
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Criação automática do profile
-- -----------------------------------------------------------------------------
--
-- security definer: a função roda com os privilégios de quem a criou, para
-- conseguir gravar em public.profiles antes de existir sessão do novo usuário.
--
-- `set search_path = public` é obrigatório numa função security definer:
-- sem isso, alguém poderia criar um objeto com o mesmo nome em outro schema e
-- fazer a função apontar para o lugar errado.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    -- Se o usuário foi criado sem nome, usa a parte antes do @ do e-mail.
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    new.email
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
