/* Regra da vaga: quando a saída de um aluno vira aviso para a lista de espera.
 *
 * A pergunta que este arquivo responde é sempre a mesma, venha de onde vier a
 * remoção (tela da turma, edição em massa da turma ou exclusão do aluno):
 *
 *     "sobrou lugar nesta turma, e tem alguém esperando por ele?"
 *
 * As duas condições precisam valer JUNTAS. Sem fila, um lugar vago não é
 * notícia; com fila mas sem lugar (a turma continua cheia), também não.
 *
 * Arquivo de funções puras: não conhece Supabase nem DOM. Quem faz as perguntas
 * ao banco e grava o aviso é notificacoes.js, ao lado.
 */

/**
 * A turma tem lugar livre?
 *
 * Sem capacidade declarada (`capacity` null) a resposta é sim: o professor não
 * disse qual é o limite, então quem saiu abriu um lugar. Foi para não obrigar
 * ninguém a cadastrar capacidade só para usar a lista de espera.
 *
 * @param {number|null|undefined} capacity     vagas da turma
 * @param {number}                activeCount  matriculados ativos AGORA
 */
export function hasVacancy(capacity, activeCount) {
  if (capacity === null || capacity === undefined) return true;
  return activeCount < capacity;
}

/** Quantos lugares sobraram. Sem capacidade declarada, não há número a dar. */
export function freeSlots(capacity, activeCount) {
  if (capacity === null || capacity === undefined) return null;
  return Math.max(0, capacity - activeCount);
}

/** '7/8 alunos' quando há capacidade; '7 alunos matriculados' quando não há. */
export function formatOccupancy(activeCount, capacity) {
  if (capacity === null || capacity === undefined) {
    return `${activeCount} aluno${activeCount === 1 ? '' : 's'} matriculado${activeCount === 1 ? '' : 's'}`;
  }
  return `${activeCount}/${capacity} alunos`;
}

/** A turma bateu o limite? Usado para avisar antes de matricular mais um. */
export function isFull(capacity, activeCount) {
  return !hasVacancy(capacity, activeCount);
}

/**
 * Agrupa a fila por turma desejada, preservando a ordem de chegada dentro de
 * cada grupo e numerando as posições a partir de 1.
 *
 * A posição não é coluna do banco: ela é derivada de `created_at` na hora de
 * exibir. Assim ninguém precisa renumerar a fila quando alguém sai dela.
 *
 * @param {object[]} entries  já ordenados por created_at crescente
 * @returns {{key: string, classId: string|null, label: string, people: object[]}[]}
 */
export function groupWaitlistByClass(entries) {
  const groups = new Map();

  for (const entry of entries) {
    const key = entry.class_id ?? `slot:${entry.desired_slot}`;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        classId: entry.class_id ?? null,
        label: entry.classes?.name ?? entry.desired_slot,
        slot: entry.desired_slot,
        people: [],
      });
    }

    const group = groups.get(key);
    group.people.push({ ...entry, position: group.people.length + 1 });
  }

  return [...groups.values()];
}
