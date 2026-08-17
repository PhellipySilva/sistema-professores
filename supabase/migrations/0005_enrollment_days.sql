-- =============================================================================
-- 0005_enrollment_days.sql — Aluno matriculado em dias específicos da turma
-- =============================================================================
--
-- Uma turma de segunda e quinta pode ter alunos que só vão na segunda. No geral
-- são os mesmos alunos nos dois dias, então a exceção precisa ser barata de
-- registrar e o caso comum precisa continuar sem esforço.
--
--   days_of_week = NULL          → vai em TODOS os dias da turma (padrão)
--   days_of_week = '{1,4}'       → só segunda e quinta
--
-- POR QUE UM ARRAY DE DIAS, E NÃO UM VÍNCULO COM class_schedules
--
--   O caminho óbvio seria ligar a matrícula à linha do horário. Mas
--   `replaceSchedules` (js/api/classes.js) apaga e reinsere a grade inteira a
--   cada edição da turma — os ids de class_schedules não são estáveis. Um
--   vínculo por id perderia a divisão por dia toda vez que o professor
--   ajustasse o horário, sem aviso nenhum.
--
--   O dia da semana, esse sim, sobrevive: "segunda" continua sendo segunda
--   mesmo que o horário mude de 17h para 18h.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

alter table public.class_students
  add column if not exists days_of_week smallint[];

comment on column public.class_students.days_of_week is
  'Dias da semana em que o aluno frequenta esta turma (0=domingo). NULL = todos os dias da turma.';

alter table public.class_students
  drop constraint if exists class_students_days_of_week_check;

alter table public.class_students
  add constraint class_students_days_of_week_check
  check (
    days_of_week is null
    or (
      array_length(days_of_week, 1) between 1 and 7
      and days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
    )
  );
