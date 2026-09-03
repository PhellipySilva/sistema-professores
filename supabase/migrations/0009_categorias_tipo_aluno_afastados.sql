-- =============================================================================
-- 0009_categorias_tipo_aluno_afastados.sql — Nível, tipo de aluno e afastamento
-- =============================================================================
--
-- Três mudanças que andam juntas porque falam do mesmo cadastro:
--
-- 1. `students.category` DEIXA DE SER "Kids/Adulto" E PASSA A SER O NÍVEL
--
--    E, D, C, B, A e PRO — a escala que o professor usa para montar treino.
--    A coluna é a mesma de propósito: ela já era exibida como "Nível" no perfil
--    do aluno (ver studentSummaryCard), e criar uma segunda coluna deixaria as
--    duas disputando o mesmo significado.
--
-- 2. O QUE ERA "Kids/Adulto" VIRA `students.student_type`
--
--    Nada se perde: o passo abaixo copia o valor antigo para a coluna nova
--    ANTES de trocar o check de `category`. Um aluno que era 'kids' continua
--    Kids — só que agora em `student_type`, e com nível E até o professor
--    ajustar. Kids/Adulto continua mandando na cor do card e na exigência de
--    responsável, exatamente como antes.
--
--    `classes.category` NÃO muda: a turma continua sendo Kids ou Adulto.
--
-- 3. `students.on_leave` — ALUNO AFASTADO
--
--    Booleano, e não uma tabela de "afastamentos" com período: o professor
--    quer tirar o aluno da lista de hoje em um toque e trazê-lo de volta em
--    outro. Afastado não é excluído — o cadastro, o histórico e as matrículas
--    continuam inteiros, e é isso que separa "voltou em março" de "sumiu".
--
-- 4. `lesson_plans.category` — o nível a que o planejamento se destina
--
--    NULL é permitido para os planos que já existem: eles foram criados quando
--    a pergunta não era feita, e obrigar uma categoria aqui exigiria inventar
--    uma resposta para todos eles. O formulário passa a exigir a escolha nos
--    planos NOVOS, que é onde o pedido tem efeito.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipo do aluno (Kids / Adulto) — a coluna nova nasce com o dado antigo
-- -----------------------------------------------------------------------------

alter table public.students
  add column if not exists student_type text;

update public.students
   set student_type = category
 where student_type is null
   and category in ('kids', 'adulto');

-- Sobra só para bases onde a coluna já existia vazia. 'adulto' é o padrão do
-- cadastro desde sempre.
update public.students
   set student_type = 'adulto'
 where student_type is null;

alter table public.students
  alter column student_type set default 'adulto';

alter table public.students
  alter column student_type set not null;

alter table public.students
  drop constraint if exists students_student_type_check;

alter table public.students
  add constraint students_student_type_check
  check (student_type in ('kids', 'adulto'));

comment on column public.students.student_type is
  'Tipo do aluno: kids ou adulto. Era o antigo conteúdo de `category`. Manda na '
  'cor do card e na exigência de responsável.';

-- -----------------------------------------------------------------------------
-- 2. Categoria vira nível (E, D, C, B, A, PRO)
-- -----------------------------------------------------------------------------
-- A ordem importa: o valor antigo já foi copiado no passo 1, então aqui ele
-- pode ser substituído pelo nível inicial sem perder informação nenhuma.

alter table public.students
  drop constraint if exists students_category_check;

update public.students
   set category = 'E'
 where category in ('kids', 'adulto');

alter table public.students
  add constraint students_category_check
  check (category in ('E', 'D', 'C', 'B', 'A', 'PRO'));

alter table public.students
  alter column category set default 'E';

comment on column public.students.category is
  'Nível do aluno: E, D, C, B, A ou PRO. O tipo Kids/Adulto mora em student_type.';

-- -----------------------------------------------------------------------------
-- 3. Aluno afastado
-- -----------------------------------------------------------------------------

alter table public.students
  add column if not exists on_leave boolean not null default false;

-- A listagem sempre pergunta por um dos dois grupos; o índice atende as duas.
create index if not exists students_user_on_leave_idx
  on public.students (user_id, on_leave);

comment on column public.students.on_leave is
  'true = aluno temporariamente afastado das aulas, com intenção de voltar. '
  'Não é exclusão: matrículas, histórico e financeiro continuam intactos.';

-- -----------------------------------------------------------------------------
-- 4. Categoria do planejamento
-- -----------------------------------------------------------------------------

alter table public.lesson_plans
  add column if not exists category text;

alter table public.lesson_plans
  drop constraint if exists lesson_plans_category_check;

alter table public.lesson_plans
  add constraint lesson_plans_category_check
  check (category is null or category in ('E', 'D', 'C', 'B', 'A', 'PRO'));

-- Filtrar por categoria é a leitura nova da tela de planejamentos.
create index if not exists lesson_plans_user_category_idx
  on public.lesson_plans (user_id, category)
  where category is not null;

comment on column public.lesson_plans.category is
  'Nível a que o planejamento se destina: E, D, C, B, A ou PRO. NULL só nos '
  'planos criados antes desta migration.';
