-- =============================================================================
-- 0011_nome_do_professor.sql — O seletor de compartilhamento passa a mostrar o
--                              NOME do professor, e nunca o apelido do e-mail
-- =============================================================================
--
-- O PROBLEMA
--
--   `profiles.name` é preenchido pelo trigger `handle_new_user` (migration 0003)
--   NO MOMENTO em que o usuário é criado. Quando não havia nome, ele grava a
--   parte do e-mail antes do @ — "phellipysilvadev" para
--   phellipysilvadev@gmail.com.
--
--   Escrever o nome depois, no painel do Supabase (Authentication → Users →
--   User Metadata, ou o campo "Display name"), grava em `auth.users`, e o
--   trigger NÃO roda de novo: `profiles.name` continua com o apelido do e-mail,
--   que é o que a tela de compartilhamento estava mostrando.
--
-- O QUE ESTE ARQUIVO FAZ
--
--   1. COPIA para `profiles.name` o nome que já está no painel — só nas linhas
--      em que o nome atual é vazio ou é exatamente o apelido do e-mail. Quem já
--      tem nome de verdade no perfil não é tocado.
--
--   2. Reescreve `list_teachers()` para RESOLVER o nome na hora, na ordem
--      nome do perfil → metadata do painel (name, full_name, display_name).
--      Assim um nome escrito no painel amanhã aparece sem precisar de migration
--      nenhuma. E o apelido do e-mail nunca sai daqui: quando é só isso que
--      existe, a função devolve NULL e a tela escreve "Professor sem nome" —
--      que é o sinal de qual perfil ainda precisa de nome.
--
--   A função continua devolvendo APENAS id e nome. Nenhum e-mail atravessa.
--
-- COMO EXECUTAR
--   Apague TODO o conteúdo do SQL Editor, cole SÓ este arquivo e clique em Run.
--   Pode rodar mais de uma vez sem problema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. O nome que já está no painel desce para o perfil
-- -----------------------------------------------------------------------------
-- `coalesce` em três chaves porque o painel do Supabase mudou de nome de campo
-- com o tempo: o JSON de User Metadata costuma usar `name`, o campo
-- "Display name" da tela nova grava `display_name`, e `full_name` aparece em
-- contas vindas de provedores sociais.

update public.profiles p
   set name = btrim(meta.nome)
  from (
    select u.id,
           coalesce(
             nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'display_name'), '')
           ) as nome,
           split_part(u.email, '@', 1) as apelido_do_email
      from auth.users u
  ) as meta
 where p.id = meta.id
   and meta.nome is not null
   -- Só corrige o que o trigger inventou: perfil sem nome, ou com o apelido do
   -- e-mail. Um nome escrito à mão no perfil vale mais que o do painel.
   and (
     coalesce(btrim(p.name), '') = ''
     or lower(btrim(p.name)) = lower(meta.apelido_do_email)
   );

-- -----------------------------------------------------------------------------
-- 2. list_teachers() resolve o nome na hora
-- -----------------------------------------------------------------------------
-- Continua SECURITY DEFINER (profiles e auth.users seguem fechados por RLS),
-- continua sem devolver quem chamou, continua com `set search_path` — só a
-- escolha do texto do nome mudou.

create or replace function public.list_teachers()
returns table (id uuid, name text)
language sql
security definer
stable
set search_path = public
as $$
  with resolvido as (
    select p.id,
           coalesce(
             -- Nome do perfil, desde que não seja o apelido do e-mail.
             nullif(
               case
                 when lower(btrim(coalesce(p.name, ''))) = lower(split_part(u.email, '@', 1))
                   then ''
                 else btrim(coalesce(p.name, ''))
               end,
               ''
             ),
             -- Depois, o que estiver escrito no painel.
             nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
             nullif(btrim(u.raw_user_meta_data ->> 'display_name'), '')
           ) as nome
      from public.profiles p
      join auth.users u on u.id = p.id
     where auth.uid() is not null
       and p.id <> auth.uid()
  )
  select r.id, r.nome
    from resolvido r
   -- Sem nome, o rótulo vem da tela ("Professor sem nome"), e ele ordena por
   -- último em vez de sumir da lista: o professor precisa continuar podendo
   -- compartilhar com um colega cujo nome ninguém preencheu ainda.
   order by r.nome nulls last;
$$;

revoke all on function public.list_teachers() from public, anon;
grant execute on function public.list_teachers() to authenticated;

comment on function public.list_teachers() is
  'Professores do sistema, exceto quem chamou. Só id e nome — nome do perfil ou, '
  'na falta dele, o escrito no painel. Nunca o e-mail nem o apelido dele.';

-- -----------------------------------------------------------------------------
-- Conferência (opcional): quem ficou com nome, e de onde ele veio
-- -----------------------------------------------------------------------------
-- select p.id,
--        p.name                                   as nome_no_perfil,
--        u.raw_user_meta_data ->> 'name'          as nome_no_painel,
--        u.raw_user_meta_data ->> 'display_name'  as display_name_no_painel,
--        split_part(u.email, '@', 1)              as apelido_do_email
--   from public.profiles p
--   join auth.users u on u.id = p.id
--  order by p.name;
