/* Acesso a dados: lista de espera e notificações de vaga.
 *
 * Mesma regra das demais tabelas: o RLS já garante o isolamento por professor,
 * e o `.eq('user_id', userId)` daqui deixa a intenção explícita e aproveita os
 * índices (user_id, class_id) e (user_id, status, created_at).
 *
 * UMA PESSOA, VÁRIAS TURMAS
 *
 *   Os horários que interessam a alguém vivem em `waitlist_entry_classes`
 *   (migration 0007). Este arquivo esconde a tabela de ligação das telas: toda
 *   entrada da fila chega aqui já com `interests` — a lista de turmas, cada uma
 *   com nome, categoria e grade — e com `class_ids`, que é o que o formulário
 *   precisa para marcar as caixas certas.
 */

import { supabase } from '../supabase.js';
import { cachedRead, cacheKey } from '../offline/cache.js';

const ENTRY_COLUMNS = 'id, name, phone, desired_slot, notes, status, student_id, created_at';

const NOTIFICATION_COLUMNS = 'id, class_id, student_name, status, created_at';

/* A turma de cada interesse vem com a grade junto: é ela que vira os selos
   "Seg/Qua 18h" na tela, e sem isso a lista precisaria de uma consulta por
   pessoa para desenhar os horários. */
const INTEREST_EMBED =
  'waitlist_entry_classes (class_id, classes (id, name, category, class_schedules (day_of_week, start_time, end_time)))';

/* ============================================================
   Lista de espera
   ============================================================ */

/**
 * Fila inteira do professor, na ORDEM DE CHEGADA — é ela que define quem é a
 * primeira opção quando surge uma vaga.
 *
 * Turma excluída simplesmente não aparece mais em `interests` (o vínculo cai em
 * cascata); `desired_slot`, que é texto, continua descrevendo o que a pessoa
 * procurava.
 */
export async function listWaitlist(userId) {
  return cachedRead(cacheKey(userId, 'waitlist'), async () => {
    const { data, error } = await supabase
      .from('waitlist_entries')
      .select(`${ENTRY_COLUMNS}, ${INTEREST_EMBED}`)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data.map(normalizeEntry);
  });
}

/**
 * Só quem ainda espera por UMA turma — usado para decidir se há vaga a avisar.
 *
 * O filtro vai na tabela de ligação com `!inner`: o PostgREST transforma isso
 * num INNER JOIN e devolve apenas as pessoas que marcaram aquela turma, sem
 * trazer a fila inteira para filtrar no navegador.
 */
export async function listWaitingForClass(userId, classId) {
  return cachedRead(cacheKey(userId, 'waitlist', 'class', classId), async () => {
    const { data, error } = await supabase
      .from('waitlist_entries')
      .select(`${ENTRY_COLUMNS}, waitlist_entry_classes!inner (class_id)`)
      .eq('user_id', userId)
      .eq('waitlist_entry_classes.class_id', classId)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data.map(normalizeEntry);
  });
}

/**
 * @param {object}   input            { name, phone, desired_slot, notes }
 * @param {string[]} [input.class_ids] turmas de interesse; pode ser vazio
 */
export async function createWaitlistEntry(userId, input) {
  const { class_ids: classIds = [], ...entry } = input;

  const { data, error } = await supabase
    .from('waitlist_entries')
    .insert({ ...entry, user_id: userId })
    .select(ENTRY_COLUMNS)
    .single();

  if (error) throw error;

  /* São duas escritas em tabelas diferentes e o PostgREST não tem transação
     entre chamadas. Se a segunda falhar, a primeira é desfeita: uma pessoa na
     fila sem nenhum horário marcado seria pior do que não ter sido cadastrada —
     ela nunca receberia aviso de vaga, e ninguém entenderia o porquê.
     É o mesmo desfazer de createClass (js/api/classes.js). */
  try {
    await replaceEntryClasses(userId, data.id, classIds);
  } catch (stepError) {
    try {
      await deleteWaitlistEntry(userId, data.id);
    } catch (rollbackError) {
      console.error('[waitlist] cadastro pela metade e não foi possível desfazer', rollbackError);
    }
    throw stepError;
  }

  return data;
}

/**
 * @param {object}   input            campos da pessoa
 * @param {string[]} [input.class_ids] quando presente, SUBSTITUI os interesses
 */
export async function updateWaitlistEntry(userId, entryId, input) {
  const { class_ids: classIds, ...fields } = input;

  if (Object.keys(fields).length > 0) {
    const { error } = await supabase
      .from('waitlist_entries')
      .update(fields)
      .eq('user_id', userId)
      .eq('id', entryId);

    if (error) throw error;
  }

  if (classIds) {
    await replaceEntryClasses(userId, entryId, classIds);
  }

  const { data, error } = await supabase
    .from('waitlist_entries')
    .select(`${ENTRY_COLUMNS}, ${INTEREST_EMBED}`)
    .eq('user_id', userId)
    .eq('id', entryId)
    .single();

  if (error) throw error;
  return normalizeEntry(data);
}

export async function deleteWaitlistEntry(userId, entryId) {
  const { error } = await supabase
    .from('waitlist_entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', entryId);

  if (error) throw error;
}

/**
 * Troca os horários de interesse de uma pessoa.
 *
 * Apaga e reinsere, como `replaceSchedules` faz com a grade da turma: a lista
 * tem no máximo uma dúzia de linhas, e comparar o antes e o depois para
 * economizar duas escritas custaria mais código do que vale.
 *
 * Duplicata não passa: `waitlist_entry_classes_unique` barra no banco, e o
 * `[...new Set()]` abaixo evita a viagem à toa.
 */
export async function replaceEntryClasses(userId, entryId, classIds) {
  const unique = [...new Set((classIds ?? []).filter(Boolean))];

  const { error: deleteError } = await supabase
    .from('waitlist_entry_classes')
    .delete()
    .eq('user_id', userId)
    .eq('entry_id', entryId);

  if (deleteError) throw deleteError;

  if (unique.length === 0) return;

  const { error: insertError } = await supabase
    .from('waitlist_entry_classes')
    .insert(unique.map((classId) => ({ user_id: userId, entry_id: entryId, class_id: classId })));

  if (insertError) throw insertError;
}

/* ============================================================
   Notificações de vaga
   ============================================================ */

/** Todas as notificações, mais recentes primeiro, com o nome da turma. */
export async function listNotifications(userId) {
  return cachedRead(cacheKey(userId, 'waitlist-notifications'), async () => {
    const { data, error } = await supabase
      .from('waitlist_notifications')
      .select(`${NOTIFICATION_COLUMNS}, classes (id, name, category)`)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  });
}

/** Só as que ainda pedem atenção — a dashboard usa isto. */
export async function listOpenNotifications(userId) {
  return cachedRead(cacheKey(userId, 'waitlist-notifications', 'open'), async () => {
    const { data, error } = await supabase
      .from('waitlist_notifications')
      .select(`${NOTIFICATION_COLUMNS}, classes (id, name, category)`)
      .eq('user_id', userId)
      .neq('status', 'resolved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  });
}

/**
 * Cria o aviso de vaga.
 *
 * Duplicata é impossível: o índice único parcial
 * `waitlist_notifications_open_unique` só admite UMA notificação não resolvida
 * por turma. Quando a segunda saída acontece antes de o professor tratar a
 * primeira, o insert viola a constraint (código 23505) e a função devolve null
 * em vez de propagar o erro — não há nada de errado acontecendo, o aviso já
 * está na tela.
 *
 * @returns {Promise<object|null>} a notificação criada, ou null se já existia
 */
export async function createNotification(userId, { class_id, student_name }) {
  const { data, error } = await supabase
    .from('waitlist_notifications')
    .insert({ user_id: userId, class_id, student_name })
    .select(NOTIFICATION_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') return null;
    throw error;
  }
  return data;
}

export async function updateNotificationStatus(userId, notificationId, status) {
  const { error } = await supabase
    .from('waitlist_notifications')
    .update({ status })
    .eq('user_id', userId)
    .eq('id', notificationId);

  if (error) throw error;
}

/**
 * Marca como vistas as notificações que o professor acabou de abrir.
 * Uma query só para a lista inteira — nunca uma por linha.
 */
export async function markNotificationsSeen(userId, notificationIds) {
  if (notificationIds.length === 0) return;

  const { error } = await supabase
    .from('waitlist_notifications')
    .update({ status: 'seen' })
    .eq('user_id', userId)
    .eq('status', 'new')
    .in('id', notificationIds);

  if (error) throw error;
}

/* ============================================================
   Helpers
   ============================================================ */

/**
 * Achata a tabela de ligação numa lista de interesses pronta para exibir.
 *
 * A ordem é a da grade — quem tem segunda aparece antes de quem tem sábado —,
 * para os selos de uma pessoa saírem sempre na mesma sequência, e não na ordem
 * em que as linhas voltaram do banco.
 */
function normalizeEntry(row) {
  const { waitlist_entry_classes: links, ...entry } = row;

  const interests = (links ?? [])
    .filter((link) => link.classes)
    .map((link) => ({
      class_id: link.class_id,
      name: link.classes.name,
      category: link.classes.category,
      class_schedules: sortSchedules(link.classes.class_schedules ?? []),
    }))
    .sort(byFirstSchedule);

  return {
    ...entry,
    interests,
    class_ids: interests.map((interest) => interest.class_id),
  };
}

function sortSchedules(schedules) {
  return [...schedules].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}

function byFirstSchedule(a, b) {
  const first = (interest) => interest.class_schedules[0];
  const dayA = first(a)?.day_of_week ?? 9;
  const dayB = first(b)?.day_of_week ?? 9;

  if (dayA !== dayB) return dayA - dayB;

  const timeA = first(a)?.start_time ?? '';
  const timeB = first(b)?.start_time ?? '';

  return timeA.localeCompare(timeB) || a.name.localeCompare(b.name, 'pt-BR');
}
