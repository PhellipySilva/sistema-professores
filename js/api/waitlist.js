/* Acesso a dados: lista de espera e notificações de vaga.
 *
 * Mesma regra das demais tabelas: o RLS já garante o isolamento por professor,
 * e o `.eq('user_id', userId)` daqui deixa a intenção explícita e aproveita os
 * índices (user_id, class_id, created_at) e (user_id, status, created_at).
 */

import { supabase } from '../supabase.js';

const ENTRY_COLUMNS =
  'id, name, phone, class_id, desired_slot, notes, status, student_id, created_at';

const NOTIFICATION_COLUMNS = 'id, class_id, student_name, status, created_at';

/* ============================================================
   Lista de espera
   ============================================================ */

/**
 * Fila inteira do professor, na ORDEM DE CHEGADA — é ela que define quem é a
 * primeira opção quando surge uma vaga.
 *
 * Traz o nome da turma junto para a tela não precisar de uma consulta por
 * pessoa. `classes` vem null quando a turma desejada foi excluída; nesse caso
 * `desired_slot` (texto) continua descrevendo o horário.
 */
export async function listWaitlist(userId) {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select(`${ENTRY_COLUMNS}, classes (id, name, category)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

/** Só quem ainda espera por UMA turma — usado para decidir se há vaga a avisar. */
export async function listWaitingForClass(userId, classId) {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .select(ENTRY_COLUMNS)
    .eq('user_id', userId)
    .eq('class_id', classId)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * @param {object} input  { name, phone, class_id, desired_slot, notes }
 */
export async function createWaitlistEntry(userId, input) {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .insert({ ...input, user_id: userId })
    .select(ENTRY_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateWaitlistEntry(userId, entryId, input) {
  const { data, error } = await supabase
    .from('waitlist_entries')
    .update(input)
    .eq('user_id', userId)
    .eq('id', entryId)
    .select(ENTRY_COLUMNS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteWaitlistEntry(userId, entryId) {
  const { error } = await supabase
    .from('waitlist_entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', entryId);

  if (error) throw error;
}

/* ============================================================
   Notificações de vaga
   ============================================================ */

/** Todas as notificações, mais recentes primeiro, com o nome da turma. */
export async function listNotifications(userId) {
  const { data, error } = await supabase
    .from('waitlist_notifications')
    .select(`${NOTIFICATION_COLUMNS}, classes (id, name, category)`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/** Só as que ainda pedem atenção — a dashboard usa isto. */
export async function listOpenNotifications(userId) {
  const { data, error } = await supabase
    .from('waitlist_notifications')
    .select(`${NOTIFICATION_COLUMNS}, classes (id, name, category)`)
    .eq('user_id', userId)
    .neq('status', 'resolved')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
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
