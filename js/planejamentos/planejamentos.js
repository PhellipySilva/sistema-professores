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
 *
 * CATEGORIA, FILTRO E ORDEM
 *
 *   Todo plano novo declara a categoria a que se destina (E, D, C, B, A, PRO),
 *   e a barra de chips no topo filtra por ela. Dentro de cada mês, os planos
 *   saem em ordem de DATA e, na mesma data, do horário mais cedo para o mais
 *   tarde — a ordem em que as aulas daquele dia acontecem.
 *
 * COMPARTILHAR COM OUTRO PROFESSOR
 *
 *   O plano pode ser enviado a um colega ESCOLHIDO NUMA LISTA de professores do
 *   sistema. Não existe link público: quem recebe vê o plano porque existe uma
 *   linha em `lesson_plan_shares` com o id dele, e o RLS (migration 0010) só
 *   entrega a linha para o dono ou para o destinatário autenticado. O que chega
 *   é somente leitura — editar e excluir continuam sendo do dono.
 */

import { handleError, initPage } from '../app.js';
import {
  createLessonPlan,
  deleteLessonPlan,
  listLessonPlans,
  listPlanShares,
  listSharedWithMe,
  removePlanShare,
  sharePlanWith,
  updateLessonPlan,
} from '../api/lesson-plans.js';
import { listClasses } from '../api/classes.js';
import { listTeachers } from '../api/profiles.js';
import { confirmDialog } from '../components/confirm-dialog.js';
import { emptyState, errorState } from '../components/empty-state.js';
import { selectField, showFieldErrors, textField, textareaField } from '../components/form.js';
import { icon } from '../components/icons.js';
import { showSkeletons } from '../components/loading.js';
import { openFormModal, openModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { $, el, render } from '../utils/dom.js';
import { formatDateShortBR, monthKey, monthLabel, todayISO } from '../utils/dates.js';
import { LEVELS, LEVEL_OPTIONS, formatLevel, teacherLabel } from '../utils/formatters.js';
import { validateDate, validateLevel, validateTitle } from '../utils/validators.js';
import { earliestStartTime, scheduleShort, scheduleSummary } from '../turmas/turmas-ui.js';
import { categoryBadge, levelBadge } from '../components/badges.js';

const { user } = await initPage('planejamentos');

const content = $('#page-content');

/* As turmas alimentam o seletor de vínculo. Uma consulta por carregamento da
   página, e não uma por modal aberto. */
let classes = [];

/* Os planos do professor e os que outros compartilharam com ele. São duas
   listas, e não uma só com um sinalizador: o que se pode fazer com cada uma é
   diferente, e misturá-las obrigaria a perguntar "de quem é este?" em cada
   botão da tela. */
let plans = [];
let sharedPlans = [];

/* Nome do professor que compartilhou, por id. Vazio até a lista de colegas
   chegar — o card mostra "Outro professor" nesse intervalo, e nunca um id. */
let teacherNames = new Map();

/** null = todas as categorias. Só de exibição: nada volta ao servidor. */
let categoryFilter = null;

/** 'list' ou 'grid' (grade 2x2). Guardado no aparelho, ver readViewMode. */
let viewMode = readViewMode();

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
    /* O que foi compartilhado COMIGO é um extra da tela, não o assunto dela:
       falhar ao ler essa lista (o caso mais provável é a migration 0010 ainda
       não aplicada) não pode derrubar a página inteira. O erro vai para o
       console e os planos do professor aparecem do mesmo jeito. */
    const [planList, classList, sharedList] = await Promise.all([
      listLessonPlans(user.id),
      listClasses(user.id),
      listSharedWithMe(user.id).catch((error) => {
        handleError(error, 'Não foi possível carregar os planejamentos compartilhados.');
        return [];
      }),
    ]);

    classes = classList;
    plans = planList;
    sharedPlans = sharedList;

    renderPage();
    loadTeacherNames();
  } catch (error) {
    handleError(error, 'Não foi possível carregar os planejamentos.');
    render(
      content,
      errorState({ message: 'Não foi possível carregar os planejamentos.', onRetry: load }),
    );
  }
}

/**
 * Busca os nomes dos colegas para os cards do que foi compartilhado comigo.
 *
 * SEM `await` na tela, como o nome do professor no cabeçalho: a lista já está
 * desenhada, e um nome que chega depois não justifica segurar o carregamento.
 * Falhar aqui deixa "Outro professor" no lugar do nome e nada mais.
 */
function loadTeacherNames() {
  if (sharedPlans.length === 0) return;

  listTeachers()
    .then((teachers) => {
      teacherNames = new Map(teachers.map((teacher) => [teacher.id, teacher.name]));
      renderPage();
    })
    .catch((error) => handleError(error, 'Não foi possível ler o nome dos professores.'));
}

/* ============================================================
   Render
   ============================================================ */

function renderPage() {
  if (plans.length === 0 && sharedPlans.length === 0) {
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

  render(content, [
    toolbar(),
    el('div', { id: 'plans-results' }),
  ]);
  renderResults();
}

/** Filtro de categoria à esquerda, forma de ver à direita. */
function toolbar() {
  return el('div', { class: 'row-between row--wrap' }, [categoryFilterBar(), viewSwitch()]);
}

/**
 * Um chip por categoria, mais 'Todas'.
 *
 * As seis categorias aparecem sempre, mesmo sem plano nenhum nelas — ao
 * contrário do filtro de dia das turmas, esta é uma escala fixa (E → PRO), e
 * uma lista que muda de tamanho conforme o mês esconderia a escala. A contagem
 * ao lado já avisa o que está vazio.
 */
function categoryFilterBar() {
  const counts = new Map();
  for (const plan of allPlansForCounting()) {
    if (!plan.category) continue;
    counts.set(plan.category, (counts.get(plan.category) ?? 0) + 1);
  }

  const chip = ({ category, label, count, dot }) =>
    el('button', {
      type: 'button',
      class: 'filter-chip',
      'aria-pressed': categoryFilter === category ? 'true' : 'false',
      onclick: () => {
        // Clicar no chip já ativo volta para 'Todas' — mesmo gesto do filtro de
        // dia da tela de turmas.
        categoryFilter = categoryFilter === category ? null : category;
        renderPage();
      },
    }, [
      dot ? el('span', { class: `filter-chip__dot level-${dot}` }) : null,
      el('span', { text: label }),
      el('span', { class: 'filter-chip__count', text: String(count) }),
    ]);

  return el('div', {
    class: 'filter-bar',
    role: 'group',
    'aria-label': 'Filtrar planejamentos por categoria',
  }, [
    chip({ category: null, label: 'Todas', count: allPlansForCounting().length }),
    ...LEVELS.map((level) =>
      chip({
        category: level,
        label: level,
        count: counts.get(level) ?? 0,
        dot: level.toLowerCase(),
      }),
    ),
  ]);
}

/** Lista e Grade 2x2 — dois botões que se comportam como um par de opções. */
function viewSwitch() {
  const option = (mode, label, iconName) =>
    el('button', {
      type: 'button',
      class: 'filter-chip',
      'aria-pressed': viewMode === mode ? 'true' : 'false',
      'aria-label': `Ver em ${label.toLowerCase()}`,
      title: label,
      onclick: () => {
        viewMode = mode;
        saveViewMode(mode);
        renderPage();
      },
    }, [
      el('span', { class: 'icon', html: icon(iconName, 16) }),
      el('span', { text: label }),
    ]);

  return el('div', {
    class: 'filter-bar',
    role: 'group',
    'aria-label': 'Forma de visualizar',
  }, [
    option('list', 'Lista', 'menu'),
    option('grid', 'Grade', 'dashboard'),
  ]);
}

function renderResults() {
  const container = $('#plans-results');
  if (!container) return;

  const mine = sortPlans(plans.filter(matchesFilter));
  const received = sharedPlans.filter((share) => matchesFilter(share.plan));

  if (mine.length === 0 && received.length === 0) {
    render(
      container,
      emptyState({
        iconName: 'search',
        title: 'Nenhum planejamento nesta categoria',
        message: `Você ainda não tem planos da categoria ${formatLevel(categoryFilter)}.`,
        actionLabel: 'Ver todas as categorias',
        onAction: () => {
          categoryFilter = null;
          renderPage();
        },
      }),
    );
    return;
  }

  render(container, [
    ...monthSections(mine),
    sharedSection(received),
  ]);
}

/**
 * Os planos agrupados por mês, cada grupo na forma escolhida (lista ou grade).
 *
 * O agrupamento acontece ANTES de montar qualquer elemento: o título do mês e
 * os cards dele precisam ir para o mesmo contêiner, e em grade esse contêiner é
 * quem define as duas colunas.
 */
function monthSections(list) {
  const groups = [];

  for (const plan of list) {
    const month = monthKey(plan.lesson_date);
    const last = groups[groups.length - 1];

    if (last && last.month === month) last.plans.push(plan);
    else groups.push({ month, label: monthLabel(plan.lesson_date), plans: [plan] });
  }

  return groups.map((group) =>
    el('section', { class: 'stack-tight' }, [
      el('h2', { class: 'section__title section__title--sticky', text: group.label }),
      el('div', { class: listClass() }, group.plans.map(planCard)),
    ]),
  );
}

/**
 * O que outros professores compartilharam comigo.
 *
 * Vem depois dos meus planos, em seção própria: são planos que eu não posso
 * editar nem excluir, e misturá-los aos meus faria os botões da tela mudarem de
 * card para card sem explicação.
 */
function sharedSection(received) {
  if (received.length === 0) return null;

  return el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: `Compartilhados comigo · ${received.length}` }),
    el('div', { class: listClass() }, received.map(sharedCard)),
  ]);
}

/* A grade 2x2 é uma classe a mais no mesmo contêiner de cards — ver
   .grid-cards--2 em css/layout.css. */
function listClass() {
  return viewMode === 'grid' ? 'grid-cards grid-cards--2' : 'stack';
}

function matchesFilter(plan) {
  if (!categoryFilter) return true;
  return plan.category === categoryFilter;
}

/** Meus planos mais os recebidos — a contagem dos chips fala da tela inteira. */
function allPlansForCounting() {
  return [...plans, ...sharedPlans.map((share) => share.plan)];
}

/**
 * Data primeiro, horário depois — do mais cedo para o mais tarde dentro do dia.
 *
 * As datas continuam saindo da mais recente para a mais antiga, como sempre
 * foram; o que a ordenação por horário resolve é o EMPATE de data: três aulas
 * numa terça-feira agora saem na ordem em que acontecem, 08h antes das 18h.
 * Plano sem turma não tem horário e fica no fim do dia dele.
 */
function sortPlans(list) {
  return [...list].sort((a, b) => {
    if (a.lesson_date !== b.lesson_date) return a.lesson_date < b.lesson_date ? 1 : -1;

    const timeA = planTime(a);
    const timeB = planTime(b);

    if (timeA !== timeB) {
      if (timeA === null) return 1;
      if (timeB === null) return -1;
      return timeA < timeB ? -1 : 1;
    }

    return a.title.localeCompare(b.title, 'pt-BR');
  });
}

/** O horário da aula do plano: o mais cedo da turma vinculada. */
function planTime(plan) {
  return earliestStartTime(plan.classes?.class_schedules ?? []);
}

/* ============================================================
   Cards
   ============================================================ */

/**
 * A classe da cor do card, pela categoria.
 *
 * Muda SÓ fundo e borda (ver .plan-card--<letra> em components.css). Categoria
 * vazia — plano criado antes da migration 0009 — não recebe classe nenhuma e o
 * card continua branco, como sempre foi.
 */
function planCardVariant(category) {
  const level = formatLevel(category);
  return level ? ` plan-card--${level.toLowerCase()}` : '';
}

/**
 * Na GRADE o card é estreito e a descrição para em três linhas, então tocar
 * nele abre o planejamento por completo. Na lista o card já mostra tudo, e
 * clicar não faz nada — nada de abrir um modal para reler o que está na tela.
 */
function cardOpensInFull() {
  return viewMode === 'grid';
}

function openOnClick(plan, options) {
  if (!cardOpensInFull()) return {};

  return {
    onclick: (event) => {
      // Os botões do rodapé (e o link da turma) continuam com a ação deles.
      if (event.target.closest('button, a')) return;
      openPlanViewModal(plan, options);
    },
  };
}

function planCard(plan) {
  const children = [
    el('div', { class: 'card__header' }, [
      el('div', { class: 'stack-tight' }, [
        el('p', { class: 'card__title', text: plan.title }),
        el('p', { class: 'card__meta', text: formatDateShortBR(plan.lesson_date) }),
        classLine(plan),
      ]),
      el('div', { class: 'row row--wrap' }, [
        levelBadge(plan.category),
        plan.classes ? categoryBadge(plan.classes.category) : null,
      ]),
    ]),
  ];

  if (plan.description) {
    children.push(el('p', { class: 'card__text plan-card__text', text: plan.description }));
  }

  children.push(
    el('div', { class: 'card__footer' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--icon',
        'aria-label': `Compartilhar ${plan.title} com outro professor`,
        title: 'Compartilhar',
        html: icon('users', 18),
        onclick: () => openShareModal(plan),
      }),
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

  return el('article', {
    class: `card plan-card${planCardVariant(plan.category)}${cardOpensInFull() ? ' plan-card--clickable' : ''}`,
    ...openOnClick(plan),
  }, children);
}

/**
 * Card do plano que veio de outro professor.
 *
 * Sem editar e sem excluir: o plano é dele. O único botão é o de tirar da minha
 * tela — que apaga o vínculo, nunca o planejamento.
 */
function sharedCard(share) {
  const plan = share.plan;
  const author = authorName(share.owner_id);

  const children = [
    el('div', { class: 'card__header' }, [
      el('div', { class: 'stack-tight' }, [
        el('p', { class: 'card__title', text: plan.title }),
        el('p', { class: 'card__meta', text: formatDateShortBR(plan.lesson_date) }),
        el('div', { class: 'row row--wrap' }, [
          el('span', { class: 'badge badge--primary', text: `Compartilhado por ${author}` }),
        ]),
      ]),
      levelBadge(plan.category),
    ]),
  ];

  if (plan.description) {
    children.push(el('p', { class: 'card__text plan-card__text', text: plan.description }));
  }

  children.push(
    el('div', { class: 'card__footer' }, [
      el('button', {
        type: 'button',
        class: 'btn btn--ghost btn--sm',
        html: `${icon('close', 16)}<span>Remover da minha lista</span>`,
        onclick: () => confirmRemoveShared(share),
      }),
    ]),
  );

  return el('article', {
    class: `card plan-card${planCardVariant(plan.category)}${cardOpensInFull() ? ' plan-card--clickable' : ''}`,
    ...openOnClick(plan, { author }),
  }, children);
}

/**
 * Como o professor que compartilhou aparece no card: o nome que ele cadastrou.
 *
 * Nunca o e-mail — quem garante isso é `teacherLabel`. Aqui fica só o texto de
 * reserva de enquanto a lista de colegas não chegou do servidor.
 */
function authorName(ownerId) {
  const name = teacherNames.get(ownerId);
  return name ? teacherLabel(name) : 'Outro professor';
}

/**
 * O planejamento por completo, em leitura.
 *
 * É a saída para o card estreito da grade: em vez de espremer a descrição num
 * card de meia tela, ela para em três linhas e o toque abre tudo — título,
 * data, categoria, turma e o texto inteiro. Não edita nada; para isso continuam
 * os botões do rodapé do card.
 */
function openPlanViewModal(plan, { author } = {}) {
  const content = [
    el('div', { class: 'row row--wrap' }, [
      levelBadge(plan.category),
      plan.classes ? categoryBadge(plan.classes.category) : null,
      author ? el('span', { class: 'badge badge--primary', text: `Compartilhado por ${author}` }) : null,
    ]),
    el('p', { class: 'card__meta', text: formatDateShortBR(plan.lesson_date) }),
    // A turma só vem nos planos do próprio professor: no que foi compartilhado
    // ela pertence a quem enviou, e dizer "planejamento geral" ali seria inventar.
    author ? null : classLine(plan),
    plan.description
      ? el('p', { class: 'card__text', text: plan.description })
      : el('p', { class: 'text-muted text-sm', text: 'Este planejamento não tem descrição.' }),
  ];

  return openModal({ title: plan.title, content: el('div', { class: 'stack-tight' }, content) });
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

/* ============================================================
   Forma de visualizar, guardada no aparelho
   ============================================================ */

const VIEW_STORAGE_KEY = 'matchphoint:planejamentos:view';

/* Preferência de exibição é do APARELHO, não do cadastro: quem usa o celular
   costuma querer lista e o mesmo professor no computador costuma querer grade.
   Por isso localStorage, e não uma coluna no banco. Ler pode falhar (janela
   anônima, armazenamento bloqueado) — nesse caso vale o padrão. */
function readViewMode() {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

function saveViewMode(mode) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  } catch {
    // Sem armazenamento, a escolha vale só enquanto a página estiver aberta.
  }
}

/* ============================================================
   Criar / editar
   ============================================================ */

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
    // Obrigatória: o plano é escrito PARA um nível, e é por ele que a tela
    // filtra. O placeholder desabilitado obriga a escolha consciente.
    selectField({
      name: 'category',
      label: 'Categoria',
      placeholder: 'Selecione a categoria',
      options: LEVEL_OPTIONS,
      value: plan?.category ?? '',
      hint: 'Para qual categoria este planejamento foi pensado.',
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
      const category = form.elements.category.value;
      const description = (form.elements.description.value ?? '').trim() || null;

      // Vínculo pedido mas turma não escolhida é o único erro novo: salvar
      // assim gravaria um plano geral onde o professor pediu um plano de turma.
      const wantsClass = form.elements.has_class.value === 'sim';
      const classId = wantsClass ? form.elements.class_id.value : null;

      const errors = {
        title: validateTitle(title),
        lesson_date: validateDate(lessonDate, 'A data'),
        category: validateLevel(category),
        class_id: wantsClass && !classId ? 'Escolha a turma ou marque "planejamento geral".' : null,
      };

      if (showFieldErrors(form, errors)) throw new Error('validação');

      const payload = {
        title,
        lesson_date: lessonDate,
        category,
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

/* ============================================================
   Compartilhar
   ============================================================ */

/**
 * Escolhe o professor e mostra com quem o plano já está compartilhado.
 *
 * As duas consultas — colegas e compartilhamentos deste plano — são feitas ao
 * ABRIR o modal, e não no carregamento da página: é uma tela que o professor
 * abre de vez em quando, e nenhuma delas serve à listagem.
 */
async function openShareModal(plan) {
  let teachers = [];
  let current = [];

  try {
    [teachers, current] = await Promise.all([listTeachers(), listPlanShares(user.id, plan.id)]);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível carregar os professores. Tente novamente.'));
    return;
  }

  teacherNames = new Map(teachers.map((teacher) => [teacher.id, teacher.name]));

  const nameOf = (id) => teacherLabel(teacherNames.get(id));

  // Quem já recebeu sai da lista de escolha: repetir o mesmo professor não teria
  // efeito nenhum, e ele já aparece logo abaixo, com o botão de tirar o acesso.
  const alreadyShared = new Set(current.map((share) => share.shared_with_id));
  const available = teachers.filter((teacher) => !alreadyShared.has(teacher.id));

  const fields = [
    el('p', {
      class: 'text-sm text-muted',
      text: `"${plan.title}" · ${formatDateShortBR(plan.lesson_date)}`,
    }),
    selectField({
      name: 'teacher_id',
      label: 'Professor',
      placeholder: available.length > 0
        ? 'Selecione o professor'
        : 'Nenhum outro professor disponível',
      // O nome que o professor cadastrou — nunca o e-mail dele.
      options: available.map((teacher) => ({ value: teacher.id, label: teacherLabel(teacher.name) })),
      hint: 'O professor vê o planejamento na tela de planejamentos dele, somente para leitura. Nada é publicado na internet.',
    }),
  ];

  if (current.length > 0) {
    fields.push(
      el('p', { class: 'form__section-title', text: 'Já compartilhado com' }),
      el('div', { class: 'card card--flush' }, current.map((share) =>
        el('div', { class: 'list-item' }, [
          el('p', { class: 'list-item__title', text: nameOf(share.shared_with_id) }),
          el('button', {
            type: 'button',
            class: 'btn btn--ghost btn--sm',
            text: 'Tirar acesso',
            'aria-label': `Tirar o acesso de ${nameOf(share.shared_with_id)}`,
            onclick: async (event) => {
              const button = event.currentTarget;
              button.disabled = true;

              try {
                await removePlanShare(share.id);
              } catch (error) {
                button.disabled = false;
                toast.error(handleError(error, 'Não foi possível tirar o acesso. Tente novamente.'));
                return;
              }

              // A linha some do modal aberto; a tela de trás não muda, porque
              // compartilhar não altera nada na listagem de planos.
              button.closest('.list-item')?.remove();
              toast.success('Acesso removido.');
            },
          }),
        ]),
      )),
    );
  }

  openFormModal({
    title: 'Compartilhar planejamento',
    fields,
    submitLabel: 'Compartilhar',
    onSubmit: async (form) => {
      const teacherId = form.elements.teacher_id.value;

      if (showFieldErrors(form, { teacher_id: teacherId ? null : 'Selecione o professor.' })) {
        throw new Error('validação');
      }

      try {
        await sharePlanWith(user.id, plan.id, teacherId);
      } catch (error) {
        toast.error(handleError(error, 'Não foi possível compartilhar o planejamento. Tente novamente.'));
        throw error;
      }

      toast.success(`Planejamento compartilhado com ${nameOf(teacherId)}.`);
    },
  });
}

async function confirmRemoveShared(share) {
  const confirmed = await confirmDialog({
    title: 'Remover da minha lista',
    message:
      `"${share.plan.title}" sai da sua tela de planejamentos. O planejamento continua ` +
      'existindo para o professor que criou — só o compartilhamento é desfeito.',
    confirmLabel: 'Remover',
  });

  if (!confirmed) return;

  try {
    await removePlanShare(share.id);
  } catch (error) {
    toast.error(handleError(error, 'Não foi possível remover o compartilhamento. Tente novamente.'));
    return;
  }

  toast.success('Planejamento removido da sua lista.');
  await load();
}
