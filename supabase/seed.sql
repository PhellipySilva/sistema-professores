-- =============================================================================
-- seed.sql — Dados fictícios para testar o sistema (spec, seção 37)
-- =============================================================================
--
-- Cria 6 alunos, 3 turmas com horários, matrículas, algumas aulas com chamada,
-- pagamentos (alguns em atraso de propósito) e planejamentos.
--
-- COMO USAR
--   1. Faça login no sistema pelo menos uma vez (o usuário precisa existir).
--   2. Cole este arquivo no SQL Editor do Supabase e execute.
--   3. Ele usa o PRIMEIRO usuário cadastrado. Com mais de um, ajuste a linha
--      marcada abaixo.
--
-- COMO REMOVER
--   Execute supabase/seed-cleanup.sql. Todo dado criado aqui tem o prefixo
--   '[teste]' no nome, então a limpeza é precisa e não toca no que é seu.
-- =============================================================================

do $$
declare
  v_user_id uuid;
  v_today date := current_date;
  v_month date := date_trunc('month', current_date)::date;

  v_kids_id uuid;
  v_adulto_id uuid;
  v_avancado_id uuid;

  v_joao uuid; v_maria uuid; v_pedro uuid;
  v_ana uuid;  v_lucas uuid; v_bia uuid;

  v_session_1 uuid; v_session_2 uuid;
begin
  -- Ajuste aqui se houver mais de um usuário:
  --   select id, email from auth.users;
  select id into v_user_id from auth.users order by created_at limit 1;

  if v_user_id is null then
    raise exception 'Nenhum usuário encontrado. Faça login no sistema antes de rodar o seed.';
  end if;

  ---------------------------------------------------------------------------
  -- Alunos
  ---------------------------------------------------------------------------
  -- Sem `returning into` aqui: com várias linhas, o PL/pgSQL rejeita.
  -- Os ids são recuperados logo abaixo, um a um.
  insert into public.students (user_id, name, phone, category, guardian_name, monthly_fee_cents, due_day)
  values
    (v_user_id, '[teste] João Silva',    '82999990001', 'adulto', null,                15000, 10),
    (v_user_id, '[teste] Maria Souza',   '82999990002', 'kids',   'Ana Souza',         12000, 10),
    (v_user_id, '[teste] Pedro Almeida', '82999990003', 'adulto', null,                15000,  5),
    (v_user_id, '[teste] Ana Costa',     '82999990004', 'kids',   'Carlos Costa',      12000, 15),
    (v_user_id, '[teste] Lucas Rocha',   '82999990005', 'adulto', null,                18000, 20),
    (v_user_id, '[teste] Beatriz Lima',  '82999990006', 'adulto', null,                 null, null);

  select id into v_joao  from public.students where user_id = v_user_id and name = '[teste] João Silva';
  select id into v_maria from public.students where user_id = v_user_id and name = '[teste] Maria Souza';
  select id into v_pedro from public.students where user_id = v_user_id and name = '[teste] Pedro Almeida';
  select id into v_ana   from public.students where user_id = v_user_id and name = '[teste] Ana Costa';
  select id into v_lucas from public.students where user_id = v_user_id and name = '[teste] Lucas Rocha';
  select id into v_bia   from public.students where user_id = v_user_id and name = '[teste] Beatriz Lima';

  ---------------------------------------------------------------------------
  -- Turmas e horários
  ---------------------------------------------------------------------------
  insert into public.classes (user_id, name, category)
  values (v_user_id, '[teste] Kids Iniciante', 'kids')
  returning id into v_kids_id;

  insert into public.classes (user_id, name, category)
  values (v_user_id, '[teste] Adulto Manhã', 'adulto')
  returning id into v_adulto_id;

  insert into public.classes (user_id, name, category)
  values (v_user_id, '[teste] Adulto Avançado', 'adulto')
  returning id into v_avancado_id;

  -- Kids: segunda e quarta às 17h
  insert into public.class_schedules (user_id, class_id, day_of_week, start_time, end_time)
  values
    (v_user_id, v_kids_id, 1, '17:00', '18:00'),
    (v_user_id, v_kids_id, 3, '17:00', '18:00');

  -- Adulto Manhã: terça e quinta às 7h
  insert into public.class_schedules (user_id, class_id, day_of_week, start_time, end_time)
  values
    (v_user_id, v_adulto_id, 2, '07:00', '08:00'),
    (v_user_id, v_adulto_id, 4, '07:00', '08:00');

  -- Adulto Avançado: sábado às 9h, 90 minutos
  insert into public.class_schedules (user_id, class_id, day_of_week, start_time, end_time)
  values (v_user_id, v_avancado_id, 6, '09:00', '10:30');

  ---------------------------------------------------------------------------
  -- Matrículas
  ---------------------------------------------------------------------------
  insert into public.class_students (user_id, class_id, student_id) values
    (v_user_id, v_kids_id,     v_maria),
    (v_user_id, v_kids_id,     v_ana),
    (v_user_id, v_adulto_id,   v_joao),
    (v_user_id, v_adulto_id,   v_pedro),
    (v_user_id, v_adulto_id,   v_bia),
    (v_user_id, v_avancado_id, v_lucas),
    (v_user_id, v_avancado_id, v_joao);

  ---------------------------------------------------------------------------
  -- Aulas já realizadas, com chamada
  ---------------------------------------------------------------------------
  -- Duas aulas do Kids nas últimas semanas.
  insert into public.class_sessions (user_id, class_id, session_date, start_time, end_time, status)
  values (v_user_id, v_kids_id, v_today - 7, '17:00', '18:00', 'done')
  returning id into v_session_1;

  insert into public.class_sessions (user_id, class_id, session_date, start_time, end_time, status)
  values (v_user_id, v_kids_id, v_today - 14, '17:00', '18:00', 'done')
  returning id into v_session_2;

  insert into public.attendance (user_id, session_id, student_id, status) values
    (v_user_id, v_session_1, v_maria, 'present'),
    (v_user_id, v_session_1, v_ana,   'absent'),
    (v_user_id, v_session_2, v_maria, 'present'),
    (v_user_id, v_session_2, v_ana,   'present');

  -- Reposição da falta da Ana, ainda sem data marcada.
  insert into public.makeups
    (user_id, student_id, original_session_id, original_date, status, notes)
  values
    (v_user_id, v_ana, v_session_1, v_today - 7, 'pending', '[teste] Faltou por motivo de saúde');

  ---------------------------------------------------------------------------
  -- Pagamentos
  ---------------------------------------------------------------------------
  -- generate_series devolve timestamp; o cast para date é necessário porque
  -- `timestamp + 9` não existe, mas `date + 9` soma 9 dias.

  -- Em dia: João e Maria pagaram os últimos 3 meses.
  insert into public.payments (user_id, student_id, amount_cents, reference_month, due_date, paid_date)
  select v_user_id, v_joao, 15000, m::date, m::date + 9, m::date + 8
  from generate_series(v_month - interval '2 month', v_month, interval '1 month') as g(m);

  insert into public.payments (user_id, student_id, amount_cents, reference_month, due_date, paid_date)
  select v_user_id, v_maria, 12000, m::date, m::date + 9, m::date + 7
  from generate_series(v_month - interval '2 month', v_month, interval '1 month') as g(m);

  -- Atrasado: Pedro só pagou o mês mais antigo e parou.
  insert into public.payments (user_id, student_id, amount_cents, reference_month, due_date, paid_date)
  values (v_user_id, v_pedro, 15000,
          (v_month - interval '2 month')::date,
          (v_month - interval '2 month')::date + 4,
          (v_month - interval '2 month')::date + 3);

  -- Atrasado: Ana nunca teve pagamento registrado (nenhuma linha, de propósito).

  -- Lucas: em dia — o mês atual ainda não venceu (vence dia 20).
  insert into public.payments (user_id, student_id, amount_cents, reference_month, due_date, paid_date)
  select v_user_id, v_lucas, 18000, m::date, m::date + 19, m::date + 18
  from generate_series(v_month - interval '2 month', v_month - interval '1 month', interval '1 month') as g(m);

  ---------------------------------------------------------------------------
  -- Planejamentos
  ---------------------------------------------------------------------------
  insert into public.lesson_plans (user_id, title, description, lesson_date) values
    (v_user_id, '[teste] Trabalho de devolução',
     'Trabalhar devolução cruzada, deslocamento lateral e construção de ponto.',
     v_today),
    (v_user_id, '[teste] Saque e voleio',
     'Sequência de saque por baixo, subida à rede e finalização de voleio.',
     v_today + 2),
    (v_user_id, '[teste] Fundamentos Kids',
     'Coordenação, equilíbrio e contato com a bola. Jogos lúdicos.',
     v_today - 3);

  raise notice 'Seed concluído para o usuário %', v_user_id;
end $$;
