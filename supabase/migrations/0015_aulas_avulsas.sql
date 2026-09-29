-- =============================================================================
-- 0015_aulas_avulsas.sql — Aulas avulsas
-- =============================================================================
--
-- Duas tabelas novas e uma função. NENHUMA tabela existente é tocada: turmas,
-- alunos, matrículas, frequência e `payments` continuam exatamente como estão.
--
-- POR QUE TABELAS PRÓPRIAS, E NÃO `class_sessions` + `payments`
--
--   O participante da aula avulsa NÃO é aluno cadastrado — é só um nome e um
--   valor. `payments` exige student_id (e é única por aluno por mês), e
--   `class_sessions` exige turma. Encaixar a aula avulsa ali obrigaria a criar
--   alunos e turmas fantasmas, que apareceriam nas listagens, na chamada e nos
--   avisos de mensalidade. Separado, nada disso acontece.
--
-- COMO ENTRA NO FINANCEIRO
--
--   Não existe lançamento financeiro gravado para a aula avulsa. O financeiro da
--   dashboard LÊ estas tabelas e soma, pelo mês de `lesson_date`:
--     previsto  += soma de todos os participantes
--     recebido  += soma dos que estão `paid`
--     a receber += soma dos que não estão
--   Como nada é copiado, não há o que duplicar: marcar pago, mudar o valor, a
--   data ou excluir a aula muda o número no próximo carregamento.
--
-- MESMAS CONVENÇÕES DE 0001_schema.sql
--
--   user_id em toda linha, FK composta (pai_id, user_id) na tabela filha,
--   dinheiro em centavos inteiros, data como `date` e horário como `time`.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

-- =============================================================================
-- drop_in_lessons — a aula avulsa
-- =============================================================================

create table if not exists public.drop_in_lessons (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  lesson_date      date not null,
  start_time       time not null,
  duration_minutes smallint not null check (duration_minutes between 15 and 600),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint drop_in_lessons_id_user_key unique (id, user_id)
);

-- O financeiro e a tela pedem "as aulas do professor num intervalo de datas".
create index if not exists drop_in_lessons_user_date_idx
  on public.drop_in_lessons (user_id, lesson_date desc);

comment on table public.drop_in_lessons is
  'Aula avulsa: fora das turmas, com participantes que nao precisam ser alunos. '
  'Os valores entram no financeiro pelo mes de lesson_date.';

-- =============================================================================
-- drop_in_participants — quem participou, quanto paga e se já pagou
-- =============================================================================

create table if not exists public.drop_in_participants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  lesson_id    uuid not null,
  name         text not null check (length(btrim(name)) > 0),
  amount_cents integer not null check (amount_cents >= 0),
  paid         boolean not null default false,
  position     smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint drop_in_participants_lesson_fk
    foreign key (lesson_id, user_id)
    references public.drop_in_lessons (id, user_id) on delete cascade
);

create index if not exists drop_in_participants_lesson_idx
  on public.drop_in_participants (lesson_id, position);
create index if not exists drop_in_participants_user_idx
  on public.drop_in_participants (user_id);

comment on column public.drop_in_participants.amount_cents is
  'Valor EM CENTAVOS. 4000 = R$ 40,00. Zero e permitido (aula cortesia).';
comment on column public.drop_in_participants.paid is
  'true = entra como recebido no financeiro; false = entra como a receber.';

-- =============================================================================
-- updated_at automático (mesma função de 0003_triggers.sql)
-- =============================================================================

drop trigger if exists drop_in_lessons_set_updated_at on public.drop_in_lessons;
create trigger drop_in_lessons_set_updated_at
  before update on public.drop_in_lessons
  for each row execute function public.set_updated_at();

drop trigger if exists drop_in_participants_set_updated_at on public.drop_in_participants;
create trigger drop_in_participants_set_updated_at
  before update on public.drop_in_participants
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Row Level Security (mesma política de 0002_rls.sql)
-- =============================================================================

alter table public.drop_in_lessons      enable row level security;
alter table public.drop_in_participants enable row level security;

drop policy if exists "drop_in_lessons_owner" on public.drop_in_lessons;
create policy "drop_in_lessons_owner" on public.drop_in_lessons
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "drop_in_participants_owner" on public.drop_in_participants;
create policy "drop_in_participants_owner" on public.drop_in_participants
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- save_drop_in_lesson — cria ou edita a aula E os participantes, de uma vez
-- =============================================================================
--
-- Uma função, e não três chamadas do navegador, porque salvar a aula é
-- "tudo ou nada": se a conexão cair entre gravar a aula e gravar os
-- participantes, o financeiro mostraria uma aula pela metade. Dentro da função
-- tudo roda numa transação só.
--
-- Na edição, os participantes antigos saem e a lista enviada entra no lugar.
-- A lista do formulário é a verdade inteira da aula — remover alguém é
-- simplesmente não enviá-lo.
--
-- SECURITY INVOKER: roda com as permissões de quem chama, então o RLS acima
-- continua valendo. Não há como gravar na aula de outro professor por aqui.
--
-- p_participants: [{ "name": "João", "amount_cents": 4000, "paid": true }, ...]

create or replace function public.save_drop_in_lesson(
  p_lesson_id        uuid,
  p_lesson_date      date,
  p_start_time       time,
  p_duration_minutes integer,
  p_participants     jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_lesson_id uuid;
begin
  if v_user_id is null then
    raise exception 'sem sessao';
  end if;

  if p_participants is null
     or jsonb_typeof(p_participants) <> 'array'
     or jsonb_array_length(p_participants) = 0 then
    raise exception 'a aula precisa de pelo menos um participante';
  end if;

  if p_lesson_id is null then
    insert into public.drop_in_lessons (user_id, lesson_date, start_time, duration_minutes)
    values (v_user_id, p_lesson_date, p_start_time, p_duration_minutes)
    returning id into v_lesson_id;
  else
    update public.drop_in_lessons
       set lesson_date      = p_lesson_date,
           start_time       = p_start_time,
           duration_minutes = p_duration_minutes
     where id = p_lesson_id
       and user_id = v_user_id
    returning id into v_lesson_id;

    if v_lesson_id is null then
      raise exception 'aula avulsa nao encontrada';
    end if;

    delete from public.drop_in_participants
     where lesson_id = v_lesson_id
       and user_id = v_user_id;
  end if;

  insert into public.drop_in_participants (user_id, lesson_id, name, amount_cents, paid, position)
  select v_user_id,
         v_lesson_id,
         btrim(item ->> 'name'),
         (item ->> 'amount_cents')::integer,
         coalesce((item ->> 'paid')::boolean, false),
         (ordinality - 1)::smallint
    from jsonb_array_elements(p_participants) with ordinality as t(item, ordinality);

  return v_lesson_id;
end;
$$;

revoke all on function public.save_drop_in_lesson(uuid, date, time, integer, jsonb) from public, anon;
grant execute on function public.save_drop_in_lesson(uuid, date, time, integer, jsonb) to authenticated;

comment on function public.save_drop_in_lesson(uuid, date, time, integer, jsonb) is
  'Cria (p_lesson_id null) ou edita uma aula avulsa junto com a lista completa '
  'de participantes, numa transacao so. Respeita o RLS de quem chama.';
