/* Regras dos avisos de início de aula — funções puras, sem DOM e sem rede.
 *
 * Como em js/notificacoes/mensalidades.js, nada aqui é uma regra nova sobre
 * agenda. Quem sabe que aulas existem num dia é js/agenda/ocorrencias.js — o
 * mesmo arquivo que desenha o calendário e a lista "Aulas de hoje" da
 * dashboard. Este módulo só faz uma pergunta que ninguém fazia ainda: qual é a
 * PRIMEIRA aula do professor hoje, e já está na hora de avisar?
 *
 * Reaproveitar `mergeOccurrences` não é economia de linhas: é o que garante que
 * uma aula CANCELADA não vire aviso. Essa exclusão já estava escrita lá, e
 * refazer a conta aqui criaria uma segunda resposta para "o que acontece hoje".
 */

import { mergeOccurrences, plannedOccurrencesForMonth } from '../agenda/ocorrencias.js';

export const LESSON_KINDS = {
  ONE_HOUR_BEFORE: 'one_hour_before',
  STARTING_NOW: 'starting_now',
};

/* Quanto antes o primeiro aviso sai. */
const AVISO_ANTES_MIN = 60;

/**
 * Por quanto tempo depois do horário o "Hora de começar!" ainda vale.
 *
 * O agendamento acorda de 5 em 5 minutos, mas pode atrasar — e um aviso que
 * exigisse o minuto exato simplesmente não sairia naquele dia. Meia hora de
 * tolerância cobre o atraso sem chegar a ponto de mentir: depois disso a aula
 * já começou faz tempo, e "hora de começar" viraria piada.
 */
const JANELA_INICIO_MIN = 30;

/* ============================================================
   Qual é a primeira aula do dia
   ============================================================ */

/**
 * A primeira aula do professor naquele dia, ou null.
 *
 * @param {object[]} schedules  linhas de class_schedules, com `classes` embutido
 * @param {object[]} sessions   linhas de class_sessions (para excluir canceladas)
 * @param {string}   dateIso    'YYYY-MM-DD'
 * @returns {object|null} a ocorrência, no mesmo formato que a agenda usa
 */
export function firstLessonOfDay(schedules, sessions, dateIso) {
  // As previstas do dia saem do cálculo do mês inteiro e são filtradas: é a
  // mesma sequência de `occurrencesForToday`, na dashboard.
  const planned = plannedOccurrencesForMonth(schedules, dateIso).filter(
    (occurrence) => occurrence.date === dateIso,
  );

  // Só as sessões DESTE dia entram na mesclagem. Sem esse filtro, uma aula de
  // outra data viria junto pelo caminho das sessões sem horário correspondente.
  const sessionsOfDay = sessions.filter((session) => session.session_date === dateIso);

  // `mergeOccurrences` ordena por horário e descarta as canceladas — então a
  // primeira posição já é a resposta.
  return mergeOccurrences(planned, sessionsOfDay)[0] ?? null;
}

/* ============================================================
   Já está na hora de avisar?
   ============================================================ */

/** '17:00:00' ou '17:00' → 1020 */
export function minutesOfTime(time) {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Qual aviso cabe AGORA — ou null.
 *
 * A ordem das duas perguntas importa: às 16:00 em ponto o professor precisa
 * ouvir "hora de começar", e não "começa em uma hora". Por isso o início é
 * testado primeiro.
 *
 * As duas janelas nunca se sobrepõem, e a trava diária do banco faz o resto: de
 * 5 em 5 minutos esta função responde a mesma coisa dezenas de vezes dentro da
 * janela, e só o primeiro insert passa.
 *
 * @param {string} startTime  horário da primeira aula, 'HH:MM[:SS]'
 * @param {string} nowTime    hora atual no fuso do professor, 'HH:MM'
 * @returns {string|null} um de LESSON_KINDS
 */
export function dueLessonNotification(startTime, nowTime) {
  const inicio = minutesOfTime(startTime);
  const agora = minutesOfTime(nowTime);

  if (agora >= inicio && agora < inicio + JANELA_INICIO_MIN) {
    return LESSON_KINDS.STARTING_NOW;
  }

  const aviso = inicio - AVISO_ANTES_MIN;

  // Aula antes das 01:00 não tem "uma hora antes" no mesmo dia. Avisar na
  // véspera seria outra regra (e outro dia na trava diária), então este caso
  // simplesmente não gera o primeiro aviso.
  if (aviso < 0) return null;

  if (agora >= aviso && agora < inicio) return LESSON_KINDS.ONE_HOUR_BEFORE;

  return null;
}

/* ============================================================
   O texto do aviso
   ============================================================ */

/**
 * Primeiro nome do professor, para a saudação.
 *
 * Saudação usa primeiro nome — "Professor Phellipy" soa como alguém falando com
 * ele; o nome completo soa como cadastro. O nome inteiro continua no perfil.
 *
 * Devolve '' quando `profiles.name` é só o apelido do e-mail, que é o que o
 * trigger `handle_new_user` grava para quem se cadastrou sem nome (ver migration
 * 0011). "Professor phellipysilvadev" seria pior do que não usar nome nenhum —
 * e a frase abaixo funciona sem ele.
 */
export function professorFirstName(profile) {
  const nome = String(profile?.name ?? '').trim();
  if (!nome) return '';

  const apelidoDoEmail = String(profile?.email ?? '').split('@')[0];
  if (apelidoDoEmail && nome.toLowerCase() === apelidoDoEmail.toLowerCase()) return '';

  return nome.split(/\s+/)[0];
}

/**
 * Título e corpo do aviso.
 *
 * @param {string} kind   um de LESSON_KINDS
 * @param {string} [name] primeiro nome do professor; vazio é tratado
 */
export function lessonNotificationTexts(kind, name = '') {
  if (kind === LESSON_KINDS.ONE_HOUR_BEFORE) {
    return {
      title: '🎾 Sua primeira aula começa em 1 hora!',
      body: 'Prepare-se para mais um dia de quadra. Bom trabalho!',
    };
  }

  const tratamento = name ? `Professor ${name}` : 'Professor';

  return {
    title: '🚀 Hora de começar!',
    body: `Tenha uma ótima jornada de trabalho, ${tratamento}! Que seja um excelente dia de aulas. 🎾`,
  };
}

/**
 * A linha que vai para `lesson_notifications`, pronta para o insert.
 *
 * O toque abre a AGENDA do dia — é a tela que responde "e depois desta, o que
 * eu tenho?", que é a pergunta seguinte de quem acabou de ser avisado. O
 * endereço é o mesmo que a dashboard já usa nas aulas de hoje.
 */
export function lessonNotificationRecord(kind, lesson, name, dateIso) {
  const { title, body } = lessonNotificationTexts(kind, name);

  return {
    kind,
    lesson_date: dateIso,
    start_time: lesson.start_time,
    title,
    body,
    url: `/pages/agenda.html?date=${dateIso}`,
  };
}

/**
 * A mensagem de push, no mesmo formato que os avisos de mensalidade produzem.
 *
 * Etiqueta própria por tipo, pelo motivo de sempre: o aviso das 15h e o das 16h
 * dizem coisas diferentes e não podem substituir um ao outro na tela bloqueada.
 */
export function lessonPushMessage(record) {
  return {
    title: record.title,
    body: record.body,
    url: record.url,
    tag: `aula-${record.kind}`,
  };
}
