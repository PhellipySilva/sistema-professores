/* Cadastro de aluno com os dois passos opcionais que vêm junto no formulário:
 * matrícula numa turma e registro do último pagamento.
 *
 * Mora fora da página porque duas telas fazem exatamente isto: a listagem de
 * alunos e a lista de espera (quando o professor decide chamar alguém da fila).
 * Orquestração, não interface — daqui não sai HTML nem toast.
 */

import { createStudent } from '../api/students.js';
import { addStudentToClass } from '../api/classes.js';
import { upsertPayment } from '../api/payments.js';
import { buildInitialPayment } from '../financeiro/financeiro.js';

/**
 * Cria o aluno e aplica os extras informados.
 *
 * A ORDEM importa: o aluno é criado primeiro e sozinho. Se um passo extra
 * falhar, o cadastro NÃO é desfeito — a falha volta em `warnings` e o professor
 * completa pela tela da turma ou do aluno. Perder o cadastro inteiro por causa
 * de uma matrícula seria o pior dos dois resultados.
 *
 * Só a criação do aluno lança: é a parte sem a qual nada mais faz sentido.
 *
 * @param {object} payload  dados do aluno, prontos para o banco
 * @param {object} [extras] { classId, lastPaidMonth }
 * @returns {Promise<{student: object, warnings: {error: unknown, message: string}[]}>}
 */
export async function createStudentWithEnrollment(userId, payload, { classId, lastPaidMonth } = {}) {
  const student = await createStudent(userId, payload);
  const warnings = [];

  if (classId) {
    try {
      await addStudentToClass(userId, classId, student.id);
    } catch (error) {
      warnings.push({
        error,
        message: 'Aluno cadastrado, mas não foi possível matriculá-lo na turma.',
      });
    }
  }

  // Um patrocinado não tem mensalidade a lançar; buildInitialPayment já devolve
  // null sem valor ou sem vencimento, então o passo simplesmente não acontece.
  if (lastPaidMonth) {
    const payment = buildInitialPayment({
      referenceMonth: lastPaidMonth,
      monthlyFeeCents: student.monthly_fee_cents,
      dueDay: student.due_day,
    });

    if (payment) {
      try {
        await upsertPayment(userId, { ...payment, student_id: student.id });
      } catch (error) {
        warnings.push({
          error,
          message: 'Aluno cadastrado, mas não foi possível registrar o pagamento.',
        });
      }
    }
  }

  return { student, warnings };
}
