-- =============================================================================
-- seed-cleanup.sql — Remove os dados fictícios criados por seed.sql
-- =============================================================================
--
-- Apaga somente o que tem o prefixo '[teste]' no nome. Seus dados reais não são
-- tocados. As tabelas filhas (frequência, pagamentos, reposições, matrículas,
-- aulas) somem por cascata junto com alunos e turmas.
-- =============================================================================

do $$
declare
  v_removed_students int;
  v_removed_classes int;
  v_removed_plans int;
begin
  with deleted as (
    delete from public.students where name like '[teste]%' returning 1
  )
  select count(*) into v_removed_students from deleted;

  with deleted as (
    delete from public.classes where name like '[teste]%' returning 1
  )
  select count(*) into v_removed_classes from deleted;

  with deleted as (
    delete from public.lesson_plans where title like '[teste]%' returning 1
  )
  select count(*) into v_removed_plans from deleted;

  raise notice 'Removidos: % alunos, % turmas, % planejamentos.',
    v_removed_students, v_removed_classes, v_removed_plans;
end $$;
