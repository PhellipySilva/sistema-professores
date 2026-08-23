-- =============================================================================
-- 0008_planejamento_turma.sql — Planejamento com ou sem turma
-- =============================================================================
--
-- Um planejamento passa a poder existir de duas formas:
--
--   class_id preenchido → é o plano DAQUELA turma ("Fundamentos de saque",
--                         Segunda e Quarta 18h)
--   class_id null       → planejamento GERAL, reaproveitável em qualquer turma
--
-- A coluna é OPCIONAL de propósito: o comportamento de hoje (nenhum plano tem
-- turma) continua válido sem nenhuma linha migrada, e o professor nunca é
-- obrigado a escolher uma turma para registrar o que vai treinar.
--
-- POR QUE O FK É SIMPLES, E NÃO COMPOSTO COM user_id
--
--   Pelo mesmo motivo de makeups (0001_schema.sql) e do antigo
--   waitlist_entries.class_id: `on delete set null` anula TODAS as colunas do
--   FK, e user_id é not null. Com FK simples, excluir a turma transforma o plano
--   num planejamento geral — que é exatamente o pedido "não excluir o
--   planejamento ao remover o vínculo". Não abre brecha: o RLS impede ler linha
--   de outro professor de qualquer forma.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

alter table public.lesson_plans
  add column if not exists class_id uuid;

alter table public.lesson_plans
  drop constraint if exists lesson_plans_class_fk;

alter table public.lesson_plans
  add constraint lesson_plans_class_fk
  foreign key (class_id) references public.classes (id) on delete set null;

-- Filtrar os planos de uma turma é a leitura que justifica o índice; os planos
-- gerais (class_id null) continuam saindo pelo índice de data já existente.
create index if not exists lesson_plans_user_class_idx
  on public.lesson_plans (user_id, class_id)
  where class_id is not null;

comment on column public.lesson_plans.class_id is
  'Turma a que o planejamento pertence. NULL = planejamento geral, aproveitável '
  'em qualquer turma. Excluir a turma NÃO exclui o plano: ele volta a ser geral.';
