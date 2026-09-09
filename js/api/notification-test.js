/* Acesso a dados: disparo MANUAL de um aviso de mensalidade, só para teste.
 *
 * TEMPORÁRIO. Este arquivo existe para conferir, num aparelho de verdade, que o
 * push chega e que a frase aparece direito na tela bloqueada — coisa que nenhum
 * teste automatizado alcança. Apagá-lo, junto com js/notificacoes/teste.js e as
 * duas linhas que o chamam em central.js, remove o recurso inteiro sem tocar em
 * nada da notificação real.
 *
 * NENHUM SEGREDO PASSA POR AQUI
 *
 *   `functions.invoke` manda o token da SESSÃO do professor, que o supabase-js
 *   já tem em mãos. A service_role e a VAPID_PRIVATE_KEY continuam existindo só
 *   dentro da Edge Function — é ela que assina o push, e é ela que descobre de
 *   quem é a sessão para mandar o aviso apenas para os aparelhos de quem pediu.
 *
 * NADA É GRAVADO NO BANCO
 *
 *   O cenário é montado na memória da função e enviado. Não entra linha em
 *   `payment_notifications`, nenhum vencimento é inventado para aluno nenhum, e
 *   o sininho continua listando só os avisos de verdade.
 */

import { supabase } from '../supabase.js';

/** Os três cenários, com o nome que a Edge Function espera. */
export const TEST_SCENARIOS = {
  DUE_TOMORROW: 'vence_amanha',
  DUE_TODAY: 'vence_hoje',
  OVERDUE: 'atrasada',
};

/**
 * Pede à função agendada que envie UM aviso de teste para os aparelhos do
 * professor logado.
 *
 * A espera de ~7 segundos acontece no SERVIDOR, e não aqui: o objetivo do teste
 * é ver o aviso com o celular bloqueado, e um `setTimeout` no navegador morre
 * junto com a aba quando a tela apaga.
 *
 * @param {string} scenario   um dos TEST_SCENARIOS
 * @param {number} [daysLate] dias de atraso, só para o cenário 'atrasada'
 */
export async function sendTestNotification(scenario, daysLate = 3) {
  const body = { force: true, scenario };
  if (scenario === TEST_SCENARIOS.OVERDUE) body.daysLate = daysLate;

  const { data, error } = await supabase.functions.invoke('notificar-mensalidades', { body });

  if (error) throw error;
  return data;
}
