/* Orquestração do aviso de vaga: a pergunta ao banco que vagas.js não faz.
 *
 * Três telas removem aluno de turma — a página da turma, a edição em massa da
 * turma e a exclusão do aluno. As três chamam esta função, para a regra existir
 * uma vez só e nenhum caminho de remoção deixar a lista de espera sem resposta.
 */

import { countActiveStudents } from '../api/classes.js';
import { createNotification, listWaitingForClass } from '../api/waitlist.js';
import { hasVacancy } from './vagas.js';

/**
 * Verifica a vaga e, se ela existir para alguém, registra o aviso.
 *
 * A ORDEM das duas perguntas é de propósito: a fila primeiro. Sem ninguém
 * esperando não há aviso a dar, e a contagem de matriculados nem chega a ser
 * pedida — o caso comum (turma sem fila) custa uma consulta, não duas.
 *
 * Lança em caso de erro de rede/banco. Quem chama já está num fluxo com
 * tratamento próprio e decide se o professor precisa saber: nesse ponto a
 * remoção já terminou com sucesso, e ela é que importa.
 *
 * @param {string} userId
 * @param {object} options.turma         precisa de id e capacity
 * @param {string} [options.studentName] quem saiu, só para o texto do aviso
 * @returns {Promise<object|null>} a notificação criada, ou null se não havia o
 *                                 que avisar (fila vazia, turma ainda cheia, ou
 *                                 aviso em aberto já existente para a turma)
 */
export async function notifyVacancy(userId, { turma, studentName }) {
  const waiting = await listWaitingForClass(userId, turma.id);
  if (waiting.length === 0) return null;

  const activeCount = await countActiveStudents(userId, turma.id);
  if (!hasVacancy(turma.capacity, activeCount)) return null;

  // Duplicata é barrada pelo índice único parcial do banco: enquanto houver um
  // aviso não resolvido para esta turma, createNotification devolve null em vez
  // de criar um segundo card dizendo a mesma coisa.
  return createNotification(userId, { class_id: turma.id, student_name: studentName ?? null });
}
