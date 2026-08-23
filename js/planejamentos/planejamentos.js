/* Planejamento de aulas (spec, seção 22). CRUD simples, agrupado por mês.
 *
 * VINCULAR A UMA TURMA É OPCIONAL
 *
 *   Um plano pode ser da turma ("Fundamentos de saque", Seg/Qua 18h) ou GERAL
 *   ("Treino de recepção"), reaproveitável em qualquer turma. O formulário
 *   pergunta primeiro se há vínculo e só então mostra a lista de turmas — assim
 *   quem só quer registrar a ideia da aula não passa por um campo que não usa.
 *
 *   O vínculo é editável depois, nos dois sentidos: um plano geral vira plano de
 *   turma e vice-versa. Tirar o vínculo NUNCA apaga o plano.
 */

import { handleError, initPage } from '../app.js';
import {
  createLessonPlan,
  deleteLessonPlan,
  listLessonPlans,
  updateLessonPlan,
} from '../api/lesson-plans.js';
import { listClasses } from '../api/classes.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { selectField, showFieldErrors, textField, textareaField } from '../components/form.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { openFormModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { $, el, render } from '../utils/dom.js';
import { formatDateShortBR, monthKey, monthLabel, todayISO } from '../utils/dates.js';
import { validateDate, validateTitle } from '../utils/validators.js';
import { scheduleShort, scheduleSummary } from '../turmas/turmas-ui.js';
import { categoryBadge } from '../components/badges.js';

const { user } = await initPage('planejamentos');

const content = $('#page-content');

/* As turmas alimentam o seletor de vínculo. Uma consulta por carregamento da
   página, e não uma por modal aberto. */
let classes = [];

$('#page-actions').append(
  el('button', {
    type: 'button',
    class: 'btn btn--primary',
    html: `${icon('plus', 18)}<span>Novo plano</span>`,
    onclick: () => openPlanModal(null),
  }),
);

await load();

async function load() {
  showSkeletons(content, 3);

  try {
    const [plans, classList] = await Promise.all([
      listLessonPlans(user.id),
      listClasses(user.id),
    ]);

    classes = classList;
    renderPlans(plans);
  } catch (error) {
    handleError(error, 'Não foi possível carregar os planejamentos.');
    render(
      content,
      errorState({ message: 'Não foi possível carregar os planejamentos.', onRetry: load }),
    );
  }
}

function renderPlans(plans) {
  if (plans.length === 0) {
    render(
      content,
      emptyState({
        iconName: 'clipboard',
        title: 'Nenhum planejamento criado.',
        message: 'Registre o que vai treinar em cada aula para não depender da memória.',
        actionLabel: 'Criar planejamento',
        onAction: () => openPlanModal(null),
      }),
    );
    return;
  }

  const sections = [];
  let lastMonth = null;

  for (const plan of plans) {
    const month = monthKey(plan.lesson_date);

    if (month !== lastMonth) {
      lastMonth = month;
      sections.push(
        el('h2', { class: 'section__title section__title--sticky', text: monthLabel(plan.lesson_date) }),
      );
    }
    sections.push(planCard(plan));
  }

  render(content, [el('div', { class: 'stack' }, sections)]);
}

function planCard(plan) {
  const children = [
    el('div', { class: 'card__header' }, [
      el('div', { class: 'stack-tight' }, [
        el('p', { class: 'card__title', text: plan.title }),
        el('p', { class: 'card__meta', text: formatDateShortBR(plan.lesson_date) }),
        classLine(plan),
      ]),
      plan.classes ? categoryBadge(plan.classes.category) : null,
    ]),
  ];

  if (plan.description) {
    children.push(el('p', { class: 'card__text', text: plan.description }));
  }

  children.push(
    el('div', { class: 'card__footer' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Editar ${plan.title}`,
        title: 'Editar',
        html: icon('edit', 18),
        onclick: () => openPlanModal(plan),
      }),
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Excluir ${plan.title}`,
        title: 'Excluir',
        html: icon('trash', 18),
        onclick: () => confirmDelete(plan),
      }),
    ]),
  );

  return el('article', { class: 'card' }, children);
}

/**
 * A linha do vínculo, sempre presente — inclusive quando não há turma.
 *
 * Um plano sem nenhuma menção a turma deixaria o professor em dúvida se esqueceu
 * de escolher uma. Dizer "Planejamento geral" com todas as letras responde isso
 * antes de a pergunta existir.
 */
function classLine(plan) {
  if (!plan.classes) {
    return el('p', { class: 'card__meta' }, [
      el('span', { class: 'badge badge--neutral', text: 'Planejamento geral' }),
    ]);
  }

  const short = scheduleShort(plan.classes.class_schedules ?? []);
  const day = plan.classes.class_schedules?.[0]?.day_of_week;

  return el('div', { class: 'row row--wrap' }, [
    el('span', {
      class: `badge badge--day ${day === undefined ? 'badge--neutral' : `day-${day}`}`,
      text: short || 'Sem horário',
    }),
    el('p', { class: 'card__meta', text: plan.classes.name }),
  ]);
}

function openPlanModal(plan) {
  const isEdit = Boolean(plan);

  const hasClass = Boolean(plan?.class_id);

  /* Duas perguntas encadeadas em vez de um select com opção vazia: "Vincular a
     uma turma?" é uma decisão, e o campo da turma só aparece depois de ela ser
     tomada. Um placeholder "Nenhuma" no meio da lista de turmas passaria
     despercebido justamente por quem não quer vincular. */
  const linkField = selectField({
    name: 'has_class',
    label: 'Vincular a uma turma?',
    options: [
      { value: 'nao', label: 'Não — planejamento geral' },
      { value: 'sim', label: 'Sim — planejamento desta turma' },
    ],
    value: hasClass ? 'sim' : 'nao',
    hint: 'O planejamento geral pode ser usado depois em qualquer turma.',
  });

  const classField = selectField({
    name: 'class_id',
    label: 'Turma',
    placeholder: classes.length > 0 ? 'Selecione a turma' : 'Nenhuma turma cadastrada',
    options: classes.map((turma) => ({
      value: turma.id,
      label: `${turma.name} · ${scheduleSummary(turma.class_schedules ?? [])}`,
    })),
    value: plan?.class_id ?? '',
  });

  const linkSelect = linkField.querySelector('select');
  const syncClassField = () => {
    classField.classList.toggle('hidden', linkSelect.value !== 'sim');
  };

  linkSelect.addEventListener('change', syncClassField);
  syncClassField();

  const fields = [
    textField({
      name: 'title',
      label: 'Título',
      value: plan?.title ?? '',
      placeholder: 'Ex.: Trabalho de devolução',
      required: true,
    }),
    textField({
      name: 'lesson_date',
      label: 'Data da aula',
      type: 'date',
      value: plan?.lesson_date ?? todayISO(),
      required: true,
    }),
    linkField,
    classField,
    textareaField({
      name: 'description',
      label: 'Descrição',
      value: plan?.description ?? '',
      placeholder: 'O que será trabalhado nesta aula...',
    }),
  ];

  openFormModal({
    title: isEdit ? 'Editar planejamento' : 'Novo planejamento',
    fields,
    submitLabel: isEdit ? 'Salvar alterações' : 'Criar planejamento',
    onSubmit: async (form) => {
      const title = (form.elements.title.value ?? '').trim();
      const lessonDate = form.elements.lesson_date.value;
      const description = (form.elements.description.value ?? '').trim() || null;

      // Vínculo pedido mas turma não escolhida é o único erro novo: salvar
      // assim gravaria um plano geral onde o professor pediu um plano de turma.
      const wantsClass = form.elements.has_class.value === 'sim';
      const classId = wantsClass ? form.elements.class_id.value : null;

      const errors = {
        title: validateTitle(title),
        lesson_date: validateDate(lessonDate, 'A data'),
        class_id: wantsClass && !classId ? 'Escolha a turma ou marque "planejamento geral".' : null,
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      const payload = {
        title,
        lesson_date: lessonDate,
        description,
        // null aqui é o que REMOVE o vínculo na edição — sem apagar o plano.
        class_id: classId || null,
      };

      try {
        if (isEdit) {
          await updateLessonPlan(user.id, plan.id, payload);
        } else {
          await createLessonPlan(user.id, payload);
        }
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível salvar o planejamento. Tente novamente.'));
        throw error;
      }

      toast.success(isEdit ? 'Planejamento atualizado.' : 'Planejamento criado.');
      await load();
    },
  });
}

async function confirmDelete(plan) {
  const confirmed = await confirmDialog({
    title: 'Excluir planejamento',
    message: `Tem certeza que deseja excluir "${plan.title}"?`,
    confirmLabel: 'Excluir',
  });

  if (!confirmed) return;

  try {
    await deleteLessonPlan(user.id, plan.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível excluir o planejamento. Tente novamente.'));
    return;
  }

  toast.success('Planejamento excluído.');
  await load();
}
