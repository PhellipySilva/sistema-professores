/* Planejamento de aulas (spec, seção 22). CRUD simples, agrupado por mês. */

import { handleError, initPage } from '../app.js';
import {
  createLessonPlan,
  deleteLessonPlan,
  listLessonPlans,
  updateLessonPlan,
} from '../api/lesson-plans.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { showFieldErrors, textField, textareaField } from '../components/form.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { openFormModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { $, el, render } from '../utils/dom.js';
import { formatDateShortBR, monthKey, monthLabel, todayISO } from '../utils/dates.js';
import { validateDate, validateTitle } from '../utils/validators.js';

const { user } = await initPage('planejamentos');

const content = $('#page-content');

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
    const plans = await listLessonPlans(user.id);
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
      el('div', {}, [
        el('p', { class: 'card__title', text: plan.title }),
        el('p', { class: 'card__meta', text: formatDateShortBR(plan.lesson_date) }),
      ]),
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

function openPlanModal(plan) {
  const isEdit = Boolean(plan);

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

      const errors = {
        title: validateTitle(title),
        lesson_date: validateDate(lessonDate, 'A data'),
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      const payload = { title, lesson_date: lessonDate, description };

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
