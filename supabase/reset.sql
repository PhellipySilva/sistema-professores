-- =============================================================================
-- reset.sql — APAGA TUDO e devolve o banco ao estado zero
-- =============================================================================
--
-- ⚠️  DESTRUTIVO. Apaga as 12 tabelas do sistema e todos os dados dentro delas.
--     NÃO apaga usuários (auth.users) nem nada fora do schema public.
--
-- Use quando:
--   * uma migration parou no meio e o banco ficou pela metade;
--   * você quer recomeçar do zero durante o desenvolvimento.
--
-- É seguro rodar em qualquer estado: todos os comandos usam `if exists`.
--
-- Depois deste arquivo, rode em ordem:
--   0001_schema.sql → 0002_rls.sql → 0003_triggers.sql → 0004 → 0005 → 0006
-- =============================================================================

-- O trigger vive em auth.users, então some antes das tabelas.
drop trigger if exists on_auth_user_created on auth.users;

-- Ordem inversa das dependências. `cascade` leva junto políticas de RLS,
-- índices, constraints e triggers de cada tabela.
drop table if exists public.waitlist_notifications cascade;
drop table if exists public.waitlist_entries       cascade;
drop table if exists public.attendance      cascade;
drop table if exists public.makeups         cascade;
drop table if exists public.payments        cascade;
drop table if exists public.class_sessions  cascade;
drop table if exists public.class_students  cascade;
drop table if exists public.class_schedules cascade;
drop table if exists public.classes         cascade;
drop table if exists public.students        cascade;
drop table if exists public.lesson_plans    cascade;
drop table if exists public.profiles        cascade;

drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
