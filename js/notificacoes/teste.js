/* Os três botões de teste de push — TEMPORÁRIOS.
 *
 * Só aparecem com VITE_ENABLE_TEST_NOTIFICATION=true. Sem a variável, ou com
 * ela em qualquer outro valor, `testNotificationsBlock()` devolve null e o
 * painel do sino fica exatamente como era. A variável NÃO controla mais nada:
 * os avisos reais continuam sendo enviados pelo cron, do mesmo jeito, com ela
 * ligada ou desligada.
 *
 * PARA QUE SERVEM
 *
 *   Conferir, num celular de verdade, o que nenhum teste automatizado alcança:
 *   se o push chega, se o ícone é o certo, se a frase cabe na tela bloqueada e
 *   se o toque abre a tela esperada. Os três cenários existem porque as três
 *   situações têm texto e cor diferentes.
 *
 * O QUE ELES NÃO FAZEM
 *
 *   Não inventam vencimento, não mexem em aluno, não gravam em
 *   `payment_notifications` e não dependem do horário do cron. O cenário é
 *   montado na memória da Edge Function, enviado, e esquecido.
 *
 * PARA REMOVER
 *
 *   Apague este arquivo e js/api/notification-test.js, e tire as duas linhas
 *   que o chamam em central.js. Mais nada precisa mudar.
 */

import { el } from '../utils/dom.js';
import { toast } from '../components/toast.js';
import { sendTestNotification, TEST_SCENARIOS } from '../api/notification-test.js';
import { pushStatus } from './push.js';

/* Só a string 'true' liga. Comparar assim evita que um 'false' escrito no .env
   vire verdadeiro — toda variável do Vite chega como texto.
 *
 * É `const`, e não função, de propósito: o Vite troca `import.meta.env.X` por
 * um literal no build, então isto vira `false` constante e o empacotador
 * consegue PROVAR que o bloco de teste é inalcançável — ele não entra no
 * arquivo publicado. Uma função esconderia isso do empacotador, e os botões
 * viajariam (mortos, mas presentes) para produção. */
export const TEST_NOTIFICATIONS_ENABLED =
  import.meta.env.VITE_ENABLE_TEST_NOTIFICATION === 'true';

const BOTOES = [
  { scenario: TEST_SCENARIOS.DUE_TOMORROW, label: '🧪 Testar: vence amanhã' },
  { scenario: TEST_SCENARIOS.DUE_TODAY, label: '🧪 Testar: vence hoje' },
  { scenario: TEST_SCENARIOS.OVERDUE, label: '🧪 Testar: atrasada' },
];

/**
 * O bloco de teste do rodapé do sininho, ou null quando desligado.
 *
 * @returns {HTMLElement|null}
 */
export function testNotificationsBlock() {
  if (!TEST_NOTIFICATIONS_ENABLED) return null;

  const botoes = BOTOES.map(({ scenario, label }) => {
    const botao = el('button', {
      type: 'button',
      class: 'btn btn--secondary btn--sm btn--block',
      text: label,
    });

    botao.addEventListener('click', () => disparar(botao, scenario));
    return botao;
  });

  return el('div', { class: 'notif-test' }, [
    el('p', { class: 'notif-test__title', text: 'Teste de notificação' }),
    el('p', {
      class: 'notif-test__hint',
      // A instrução é a parte útil: o teste só prova o que promete se o
      // professor bloquear a tela antes de o aviso sair.
      text: 'Toque e bloqueie a tela: o aviso chega em ~7 segundos. Nada é gravado.',
    }),
    ...botoes,
  ]);
}

/**
 * Um envio.
 *
 * Os três botões são desligados durante a chamada — a função espera 7 segundos
 * antes de responder, e sem isso um toque impaciente viraria três avisos.
 */
async function disparar(botao, scenario) {
  const estado = pushStatus();

  if (estado !== 'granted') {
    toast.info(
      estado === 'denied'
        ? 'Os avisos estão bloqueados nas configurações deste navegador.'
        : 'Ative os avisos neste aparelho antes de testar.',
    );
    return;
  }

  const irmaos = [...botao.parentElement.querySelectorAll('button')];
  for (const outro of irmaos) outro.disabled = true;

  const rotulo = botao.textContent;
  botao.textContent = 'Enviando em ~7s...';

  try {
    await sendTestNotification(scenario);
    toast.success('Aviso de teste enviado.');
  } catch (error) {
    console.error('[teste] falha ao enviar o aviso', error);
    toast.error('Não foi possível enviar o aviso de teste.');
  }

  botao.textContent = rotulo;
  for (const outro of irmaos) outro.disabled = false;
}
