-- =============================================================================
-- 0014_push_subscriptions_replace.sql — Inscrição nova substitui a órfã do
--                                       mesmo aparelho
-- =============================================================================
--
-- O QUE FOI VISTO EM PRODUÇÃO
--
--   Um único iPhone com QUATRO linhas em push_subscriptions, uma para cada vez
--   em que o navegador refez a inscrição do zero (limpeza de dados, reinstalação
--   do app na tela de início, o iOS renovando por conta própria). Os endpoints
--   antigos são órfãos: a Apple aceita o push (2xx) e descarta em silêncio, sem
--   nunca devolver o 410 que faria a função apagar a linha. Resultado: a função
--   reporta "enviados: 4" e o professor não vê nada — e ninguém consegue dizer,
--   olhando o banco, qual das quatro é a viva.
--
-- A REGRA
--
--   Quando o navegador cria uma inscrição NOVA (e não apenas reconfirma a que já
--   tinha), as outras linhas do mesmo professor com o MESMO user_agent saem.
--   Dois aparelhos idênticos (mesmo modelo, mesmo iOS, mesmo Safari) do mesmo
--   professor perderiam um registro até a próxima abertura do app — que o
--   recria em silêncio (ensurePushSubscription). É um custo pequeno e raro em
--   troca de nunca mais acumular endpoints mortos.
--
--   Só quando `p_replace_same_device` é true. A reconfirmação de toda abertura
--   de página continua sendo um upsert simples, sem apagar nada.
--
-- A assinatura antiga (4 parâmetros) é removida: o parâmetro novo tem default,
-- então a chamada antiga continua funcionando, mas duas funções com o mesmo
-- nome deixariam o PostgREST sem saber qual chamar.
-- =============================================================================

drop function if exists public.save_push_subscription(text, text, text, text);

create or replace function public.save_push_subscription(
  p_endpoint            text,
  p_p256dh              text,
  p_auth                text,
  p_user_agent          text    default null,
  p_replace_same_device boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessao';
  end if;

  -- O navegador mudou de dono (ou de conta): o registro antigo dele sai.
  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and user_id <> auth.uid();

  -- Inscrição refeita do zero neste aparelho: as anteriores dele são órfãs.
  if p_replace_same_device and p_user_agent is not null then
    delete from public.push_subscriptions
     where user_id = auth.uid()
       and user_agent = p_user_agent
       and endpoint <> p_endpoint;
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
     set p256dh     = excluded.p256dh,
         auth       = excluded.auth,
         user_agent = excluded.user_agent;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text, boolean) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text, boolean) to authenticated;

comment on function public.save_push_subscription(text, text, text, text, boolean) is
  'Registra o navegador atual para receber avisos. Sempre no nome de quem '
  'chama, tira o endpoint de qualquer outro dono e, quando a inscrição é nova, '
  'apaga as órfãs do mesmo aparelho (mesmo user_agent).';
