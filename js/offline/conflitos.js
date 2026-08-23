/* A regra do conflito de sincronização — sem Supabase e sem DOM.
 *
 * Mesma divisão de vagas.js / notificacoes.js: aqui mora a DECISÃO, e em
 * sync.js as perguntas ao banco. É a única parte da sincronização que precisa
 * estar certa em todos os casos, então ela fica onde pode ser testada sem rede.
 *
 * A PERGUNTA
 *
 *   "O servidor está como estava quando o professor fez esta alteração offline?"
 *
 *   Se sim, gravar é seguro — ninguém mais mexeu na linha. Se não, alguém mexeu,
 *   e gravar por cima apagaria em silêncio o trabalho de outra pessoa (ou do
 *   próprio professor, em outro aparelho). Nesse caso NADA é gravado: a decisão
 *   sobe para a tela.
 *
 * A COMPARAÇÃO É POR `updated_at`, E NÃO POR RELÓGIO
 *
 *   Não se pergunta "qual é mais recente?". O relógio do celular pode estar
 *   errado, e o do servidor é o único que vale. Pergunta-se apenas se a linha
 *   mudou desde que foi lida — que é uma comparação de igualdade, imune a fuso
 *   horário e a relógio atrasado.
 */

/**
 * @param {object}      item     pendência da fila: { op, baseUpdatedAt }
 *                               baseUpdatedAt = updated_at que a linha tinha
 *                               quando a alteração foi feita; null se a linha
 *                               não existia para quem alterou.
 * @param {object|null} current  linha como está no servidor agora, ou null
 * @returns {boolean} true = não grave; peça a decisão ao professor
 */
export function isConflict(item, current) {
  const base = item?.baseUpdatedAt ?? null;

  if (!current) {
    // A linha sumiu do servidor.
    //   Apagar o que já não existe é o resultado desejado — não é conflito.
    //   Gravar por cima do nada, quando eu vi a linha existir, é: alguém a
    //   apagou de propósito depois de eu ler.
    return item?.op !== 'delete' && base !== null;
  }

  // Para mim a linha não existia, mas existe no servidor: alguém marcou essa
  // presença enquanto eu estava sem sinal.
  if (base === null) return true;

  return current.updated_at !== base;
}
