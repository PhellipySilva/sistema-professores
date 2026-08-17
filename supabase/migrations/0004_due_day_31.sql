-- =============================================================================
-- 0004_due_day_31.sql — Permitir dia de vencimento de 1 a 31
-- =============================================================================
--
-- O schema original limitava `students.due_day` a 28, para não existir um
-- "dia 31 de fevereiro". A restrição resolvia o problema no lugar errado:
-- impedia o professor de registrar a realidade (mensalidade que vence dia 30)
-- para evitar um caso que o cálculo já sabe tratar.
--
-- Quem resolve isso é `dueDateForMonth` em js/financeiro/financeiro.js:
--
--     const day = Math.min(dueDay, daysInMonth(year, month));
--
-- Vencimento 31 em fevereiro vira 28 (ou 29 em ano bissexto); em abril, 30.
--
-- Execute depois de 0003_triggers.sql.
-- =============================================================================

do $$
declare
  v_constraint_name text;
begin
  -- O check foi criado junto da coluna, então o nome é gerado pelo Postgres
  -- (normalmente students_due_day_check). Procurar em vez de chutar o nome
  -- deixa a migration segura mesmo se ele tiver saído diferente.
  select con.conname
  into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'students'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%due_day%'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.students drop constraint %I', v_constraint_name);
    raise notice 'Restrição antiga removida: %', v_constraint_name;
  end if;

  alter table public.students
    add constraint students_due_day_check check (due_day between 1 and 31);

  raise notice 'due_day agora aceita de 1 a 31.';
end $$;
