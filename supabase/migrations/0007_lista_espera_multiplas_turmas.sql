-- =============================================================================
-- 0007_lista_espera_multiplas_turmas.sql — Uma pessoa, vários horários
-- =============================================================================
--
-- Até aqui, `waitlist_entries.class_id` amarrava cada pessoa da fila a UMA
-- turma. Na prática quem procura vaga quase nunca quer só um horário: "serve
-- segunda e quarta às 18h, ou terça e quinta às 19h, ou sábado de manhã".
-- Com uma coluna só, o professor era obrigado a cadastrar a mesma pessoa três
-- vezes — três telefones iguais, três posições na fila, e a matrícula em uma
-- delas deixando as outras duas para trás.
--
-- POR QUE UMA TABELA DE LIGAÇÃO, E NÃO UM ARRAY DE class_id
--
--   Um `uuid[]` em waitlist_entries pareceria mais barato, mas perderia as duas
--   coisas que fazem esta lista funcionar:
--
--     * INTEGRIDADE — a turma excluída sumiria do array sem que o banco soubesse.
--       Aqui o FK composto (class_id, user_id) resolve isso sozinho.
--     * A PERGUNTA QUE MAIS IMPORTA — "quem está esperando por ESTA turma?" é
--       feita toda vez que um aluno sai. Com tabela de ligação é um índice;
--       com array seria varredura.
--
--   É a mesma decisão já tomada em class_students: relação N:N vira tabela.
--
-- O QUE ACONTECE COM `desired_slot`
--
--   Continua em waitlist_entries, continua NOT NULL e continua sendo o texto
--   legível do horário desejado. Ele agora tem dois papéis: descreve o interesse
--   de quem não escolheu turma nenhuma ("sábado de manhã, qualquer horário") e
--   sobrevive à exclusão de todas as turmas escolhidas. A interface preenche
--   sozinha a partir das turmas marcadas.
--
-- A COLUNA class_id É REMOVIDA
--
--   Depois de copiada para a tabela nova. Manter as duas seria manter duas
--   verdades sobre a mesma coisa — e a que ninguém atualiza é sempre a que
--   alguém lê. Os dados não se perdem: o passo 3 copia tudo antes.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

-- =============================================================================
-- 1. waitlist_entries precisa ser alvo de FK composta
-- =============================================================================
-- Mesma razão de classes e students (ver 0001_schema.sql): sem `unique
-- (id, user_id)` não existe FK (entry_id, user_id), e sem ela um professor
-- poderia pendurar um interesse seu na linha de fila de outro.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'waitlist_entries_id_user_key'
      and conrelid = 'public.waitlist_entries'::regclass
  ) then
    alter table public.waitlist_entries
      add constraint waitlist_entries_id_user_key unique (id, user_id);
  end if;
end $$;

-- =============================================================================
-- 2. waitlist_entry_classes — os horários que interessam a uma pessoa
-- =============================================================================
--
-- `unique (entry_id, class_id)` é a regra de "não duplicar a mesma turma para a
-- mesma pessoa", garantida pelo banco e não pela tela: duas abas abertas não
-- conseguem gravar o mesmo interesse duas vezes.
--
-- O FK de class_id é COMPOSTO com `on delete cascade`: turma excluída leva junto
-- o interesse por ela, que deixou de existir. A pessoa continua na fila, com o
-- `desired_slot` em texto explicando o que ela procurava.

create table if not exists public.waitlist_entry_classes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  entry_id   uuid not null,
  class_id   uuid not null,
  created_at timestamptz not null default now(),

  constraint waitlist_entry_classes_entry_fk
    foreign key (entry_id, user_id)
    references public.waitlist_entries (id, user_id) on delete cascade,
  constraint waitlist_entry_classes_class_fk
    foreign key (class_id, user_id)
    references public.classes (id, user_id) on delete cascade,
  constraint waitlist_entry_classes_unique unique (entry_id, class_id)
);

-- "Quem está esperando por esta turma?" — a pergunta feita a cada saída de aluno.
create index if not exists waitlist_entry_classes_user_class_idx
  on public.waitlist_entry_classes (user_id, class_id);

create index if not exists waitlist_entry_classes_entry_idx
  on public.waitlist_entry_classes (entry_id);

comment on table public.waitlist_entry_classes is
  'Turmas/horários que interessam a uma pessoa da lista de espera. N:N entre '
  'waitlist_entries e classes. Sem linha aqui = interesse só descrito em texto '
  'no desired_slot da entrada.';

-- =============================================================================
-- 3. Copiar o vínculo antigo (uma turma por pessoa) para a tabela nova
-- =============================================================================
-- Roda só enquanto a coluna existir. Depois do passo 4 este bloco vira no-op,
-- o que é o que permite executar o arquivo inteiro de novo sem estragar nada.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'waitlist_entries'
      and column_name = 'class_id'
  ) then
    insert into public.waitlist_entry_classes (user_id, entry_id, class_id)
    select e.user_id, e.id, e.class_id
    from public.waitlist_entries e
    -- A turma pode ter sido excluída depois (class_id era `on delete set null`,
    -- mas um id órfão de outro caminho quebraria o FK novo). O join garante que
    -- só entra vínculo para turma que existe.
    join public.classes c on c.id = e.class_id and c.user_id = e.user_id
    where e.class_id is not null
    on conflict (entry_id, class_id) do nothing;

    raise notice 'Vínculos antigos copiados para waitlist_entry_classes.';
  end if;
end $$;

-- =============================================================================
-- 4. Remover a coluna antiga
-- =============================================================================

alter table public.waitlist_entries drop column if exists class_id;

-- =============================================================================
-- 5. Row Level Security (mesma política de 0002_rls.sql)
-- =============================================================================

alter table public.waitlist_entry_classes enable row level security;

drop policy if exists "waitlist_entry_classes_owner" on public.waitlist_entry_classes;
create policy "waitlist_entry_classes_owner" on public.waitlist_entry_classes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
