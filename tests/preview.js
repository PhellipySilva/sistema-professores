/* Pré-visualização da identidade visual, com dados falsos.
 *
 * Serve para olhar o desenho — sidebar, topbar, perfil, cards, botões, campos —
 * sem precisar de sessão nem de banco. Nenhum arquivo daqui entra no build do
 * sistema: esta página não está no vite.config.js.
 *
 *   npm run dev  →  http://localhost:5173/tests/preview.html
 */

import { renderLayout, setUserName } from '../js/components/layout.js';
import { icon } from '../js/components/icons.js';
import { el, render } from '../js/utils/dom.js';
import { checkboxField, selectField, textField } from '../js/components/form.js';
import { openFormModal } from '../js/components/modal.js';
import { classCard, weekdayFilterBar } from '../js/turmas/turmas-ui.js';
import { studentCard, studentSummaryCard } from '../js/alunos/alunos-ui.js';
import { interestBadges } from '../js/lista-espera/lista-espera-ui.js';

renderLayout({
  pageId: 'dashboard',
  // O `id` faz o sininho aparecer na topbar: sem professor logado não há avisos
  // de quem, e renderLayout omite o botão. Aqui ele é falso como o resto.
  user: { id: 'preview', email: 'phellipysilvadev@gmail.com' },
  onLogout: () => {},
});

setUserName('Phellipy Fernandes');

document.getElementById('page-actions').append(
  el('button', {
    type: 'button',
    class: 'btn btn--primary',
    html: `${icon('plus', 18)}<span>Adicionar aluno</span>`,
  }),
);

const statCard = (card) => {
  const classes = ['stat'];
  if (card.variant) classes.push(`stat--${card.variant}`);
  if (card.variant && card.highlight) classes.push('stat--highlight');
  return el('div', { class: classes.join(' ') }, [
    el('span', { class: 'stat__icon', html: icon(card.iconName, 18) }),
    el('div', { class: 'stat__body' }, [
      el('p', { class: 'stat__label', text: card.label }),
      el('p', {
        class: `stat__value${card.money ? ' stat__value--money' : ''}`,
        text: card.value,
      }),
      card.hint ? el('p', { class: 'stat__hint', text: card.hint }) : null,
    ]),
  ]);
};

render(document.getElementById('page-content'), [
  el('div', { class: 'grid-stats' }, [
    { label: 'Alunos ativos', value: '24', iconName: 'users', variant: 'accent', highlight: true },
    { label: 'Turmas', value: '6', iconName: 'layers', variant: 'success', highlight: true },
    { label: 'Aulas hoje', value: '3', iconName: 'calendar', variant: 'sponsored', highlight: true },
    { label: 'Atrasados', value: '2', iconName: 'alert', variant: 'danger', highlight: true },
  ].map(statCard)),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Financeiro de agosto/2026' }),
    el('div', { class: 'grid-stats grid-stats--5' }, [
      { label: 'Valor previsto', value: 'R$ 3.480,00', hint: 'Soma das mensalidades de quem é cobrado', iconName: 'wallet', variant: 'accent', highlight: true, money: true },
      { label: 'Valor recebido', value: 'R$ 2.150,00', hint: 'Pagamentos com baixa registrada neste mês', iconName: 'trendUp', variant: 'success', highlight: true, money: true },
      { label: 'Valor a receber', value: 'R$ 1.330,00', hint: 'Previsto menos recebido', iconName: 'clock', variant: 'warning', highlight: true, money: true },
      { label: 'Alunos pagantes', value: '22', iconName: 'user', variant: 'sponsored' },
      { label: 'Patrocinados', value: '2', hint: 'Atletas sem mensalidade', iconName: 'award', variant: 'pink' },
    ].map(statCard)),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Atalhos' }),
    el('div', { class: 'shortcut-grid' }, [
      ['Adicionar aluno', 'plus', ''],
      ['Adicionar turma', 'plus', 'success'],
      ['Abrir agenda', 'calendar', 'sponsored'],
      ['Planejar aula', 'clipboard', 'warning'],
      ['Lista de espera', 'bell', 'pink'],
      ['Registrar pagamento', 'wallet', 'info'],
    ].map(([label, iconName, variant]) =>
      el('button', { type: 'button', class: `shortcut${variant ? ` shortcut--${variant}` : ''}` }, [
        el('span', { class: 'shortcut__icon', html: icon(iconName, 18) }),
        el('span', { text: label }),
      ]),
    )),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Turmas · filtro e cards' }),
    weekdayFilterBar({
      days: [1, 2, 3, 4, 6],
      counts: new Map([[1, 2], [2, 3], [3, 2], [4, 3], [6, 1]]),
      total: 6,
      selected: 2,
      onSelect: () => {},
    }),
    el('div', { class: 'grid-cards' }, [
      { id: 'k', name: 'Kids Iniciante', category: 'kids', student_count: 7, capacity: 8,
        class_schedules: [
          { day_of_week: 1, start_time: '17:00', end_time: '18:00' },
          { day_of_week: 3, start_time: '17:00', end_time: '18:00' },
        ] },
      { id: 'a', name: 'Adulto Noite', category: 'adulto', student_count: 8, capacity: 8,
        class_schedules: [
          { day_of_week: 2, start_time: '18:00', end_time: '19:00' },
          { day_of_week: 4, start_time: '18:00', end_time: '19:00' },
        ] },
      { id: 'v', name: 'Avançado Sábado', category: 'adulto', student_count: 5, capacity: null,
        class_schedules: [{ day_of_week: 6, start_time: '09:00', end_time: '10:30' }] },
      { id: 'd', name: 'Kids Domingo', category: 'kids', student_count: 4, capacity: 10,
        class_schedules: [{ day_of_week: 0, start_time: '08:00', end_time: '09:00' }] },
      { id: 's', name: 'Sexta Livre', category: 'adulto', student_count: 6, capacity: 8,
        class_schedules: [{ day_of_week: 5, start_time: '19:00', end_time: '20:00' }] },
    ].map((turma) => classCard(turma, { onEdit: () => {}, onDelete: () => {} }))),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Conexão · os quatro estados' }),
    // Marcação escrita à mão de propósito: o componente de verdade mostra o
    // estado REAL da conexão, e aqui a intenção é ver os quatro lado a lado.
    el('div', { class: 'card row row--wrap' }, [
      ['online', '●', 'Online'],
      ['offline', '●', 'Offline · 2 pendentes'],
      ['syncing', '↻', 'Sincronizando...'],
      ['synced', '✓', 'Sincronizado'],
    ].map(([estado, marca, rotulo]) =>
      el('div', { class: `conn conn--${estado}` }, [
        el('span', { class: 'conn__mark', text: marca }),
        el('span', { class: 'conn__label', text: rotulo }),
      ]),
    )),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Lista de espera · vários horários por pessoa' }),
    el('div', { class: 'card card--flush' }, [
      {
        name: 'João Silva',
        interests: [
          { class_id: 't1', name: 'Adulto Noite', class_schedules: [
            { day_of_week: 1, start_time: '18:00', end_time: '19:00' },
            { day_of_week: 3, start_time: '18:00', end_time: '19:00' },
          ] },
          { class_id: 't2', name: 'Adulto Tarde', class_schedules: [
            { day_of_week: 2, start_time: '19:00', end_time: '20:00' },
            { day_of_week: 4, start_time: '19:00', end_time: '20:00' },
          ] },
          { class_id: 't3', name: 'Avançado Sábado', class_schedules: [
            { day_of_week: 6, start_time: '09:00', end_time: '10:00' },
          ] },
        ],
      },
      {
        name: 'Maria Santos',
        desired_slot: 'Sábado de manhã, qualquer horário',
        interests: [],
      },
    ].map((pessoa) =>
      el('div', { class: 'list-item' }, [
        el('div', { class: 'stack-tight' }, [
          el('p', { class: 'list-item__title', text: pessoa.name }),
          interestBadges(pessoa),
        ]),
        el('span', { class: 'badge badge--info', text: 'Aguardando' }),
      ]),
    )),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Alunos · nível e perfil' }),
    el('div', { class: 'grid-cards' }, [
      studentCard(
        { id: '1', name: 'João Silva', category: 'kids', phone: '82999998888', guardian_name: 'Maria Silva' },
        'ok', { onEdit: () => {}, onDelete: () => {} },
      ),
      studentCard(
        { id: '2', name: 'Ana Souza', category: 'adulto', phone: '82988887777' },
        'overdue', { onEdit: () => {}, onDelete: () => {} },
      ),
      studentSummaryCard(
        { id: '3', name: 'Carla Dias', category: 'kids', phone: '82977776666',
          guardian_name: 'Paulo Dias', monthly_fee_cents: 15000, due_day: 10 },
        'ok',
      ),
    ]),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Alunos com pagamento em atraso' }),
    el('div', { class: 'card card--flush' }, [
      ['Ana Souza', 'R$ 150,00 · vence dia 10', 'danger', 'Atrasado'],
      ['Bruno Lima', 'R$ 150,00 · vence dia 15', 'success', 'Em dia'],
      ['Carla Dias', 'Atleta patrocinado', 'sponsored', 'Patrocinado'],
    ].map(([name, meta, variant, badge]) =>
      el('a', { class: 'list-item', href: '#' }, [
        el('div', {}, [
          el('p', { class: 'list-item__title', text: name }),
          el('p', { class: 'list-item__meta', text: meta }),
        ]),
        el('div', { class: 'row' }, [
          el('span', { class: `badge badge--${variant}`, text: badge }),
          el('span', { class: 'list-item__chevron', html: icon('chevronRight', 18) }),
        ]),
      ]),
    )),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Agenda e chamada' }),
    el('div', { class: 'grid-cards' }, [
      el('div', { class: 'card' }, [
        el('div', { class: 'calendar__header' }, [
          el('button', { type: 'button', class: 'btn btn--ghost btn--icon', html: icon('chevronLeft', 18) }),
          el('p', { class: 'calendar__title', text: 'Agosto 2026' }),
          el('button', { type: 'button', class: 'btn btn--ghost btn--icon', html: icon('chevronRight', 18) }),
        ]),
        el('div', { class: 'calendar__weekdays' },
          ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d) => el('span', { text: d }))),
        el('div', { class: 'calendar__grid' },
          Array.from({ length: 31 }, (_, i) => {
            const dia = i + 1;
            const classes = ['calendar__cell'];
            if ([3, 5, 10, 12, 17, 19].includes(dia)) classes.push('calendar__cell--has-class');
            if (dia === 18) classes.push('calendar__cell--selected');
            if (dia === 20) classes.push('calendar__cell--today');
            return el('button', { type: 'button', class: classes.join(' '), text: String(dia) });
          })),
      ]),
      el('div', { class: 'attendance-row' }, [
        el('p', { class: 'attendance-row__name', text: 'Bruno Lima' }),
        el('p', { class: 'attendance-row__meta', text: 'Adulto · Terça e Quinta' }),
        el('div', { class: 'attendance-options' }, [
          el('button', { type: 'button', class: 'attendance-option attendance-option--present', 'aria-pressed': 'true', text: 'Presente' }),
          el('button', { type: 'button', class: 'attendance-option attendance-option--absent', 'aria-pressed': 'false', text: 'Falta' }),
          el('button', { type: 'button', class: 'attendance-option attendance-option--makeup', 'aria-pressed': 'false', text: 'Reposição' }),
        ]),
      ]),
      el('div', { class: 'empty-state' }, [
        el('span', { class: 'empty-state__icon', html: icon('bell', 24) }),
        el('p', { class: 'empty-state__title', text: 'Ninguém na lista de espera.' }),
        el('p', { class: 'empty-state__message', text: 'Cadastre quem quer entrar numa turma cheia. Quando um aluno sair, o sistema avisa aqui.' }),
        el('button', { type: 'button', class: 'btn btn--primary', text: 'Adicionar pessoa' }),
      ]),
    ]),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Campos e botões' }),
    el('div', { class: 'card' }, [
      el('div', { class: 'form' }, [
        textField({ name: 'nome', label: 'Nome completo', value: 'Phellipy Fernandes', required: true }),
        selectField({
          name: 'turma',
          label: 'Turma',
          options: [{ value: '1', label: 'Kids Iniciante · Kids' }],
          value: '1',
          hint: 'O aluno pode entrar em mais turmas depois.',
        }),
        el('div', { class: 'row', style: 'flex-wrap: wrap' }, [
          el('button', { type: 'button', class: 'btn btn--primary', text: 'Salvar' }),
          el('button', { type: 'button', class: 'btn btn--secondary', text: 'Cancelar' }),
          el('button', { type: 'button', class: 'btn btn--ghost', text: 'Ghost' }),
          el('button', { type: 'button', class: 'btn btn--danger', text: 'Excluir' }),
          el('button', { type: 'button', class: 'btn btn--primary', text: 'Desabilitado', disabled: true }),
        ]),
      ]),
    ]),
  ]),
]);

const params = new URLSearchParams(location.search);

/* ?menu=1 abre o drawer já na carga — é como a foto do celular é tirada. */
if (params.has('menu')) {
  document.getElementById('app-sidebar').classList.add('is-open');
  document.querySelector('.scrim').classList.add('is-open');
}

/* ?sino=1 abre a central de notificações com avisos falsos.
 *
 * É a única forma de olhar o painel sem banco: a central lê de
 * `payment_notifications`, e aqui não há sessão. Os itens são remontados com as
 * mesmas classes do componente — o mesmo arranjo que este arquivo já faz com os
 * cards de indicador acima.
 *
 * Serve para o que o desenho tem de mais arriscado no celular: a frase do aviso
 * é longa e quebra em duas ou três linhas. */
if (params.has('sino')) {
  document.querySelector('.notif-trigger').click();

  const aviso = ({ variant, iconName, texto, quando, lido }) =>
    el('a', { class: `notif-item${lido ? '' : ' notif-item--unread'}`, href: '#' }, [
      el('span', {
        class: `notif-item__icon notif-item__icon--${variant}`,
        html: icon(iconName, 16),
      }),
      el('div', { class: 'notif-item__body' }, [
        el('p', { class: 'notif-item__text', text: texto }),
        el('p', { class: 'notif-item__meta', text: quando }),
      ]),
      lido ? null : el('span', { class: 'notif-item__dot', 'aria-hidden': 'true' }),
    ]);

  const corpo = document.querySelector('.notif-body');

  const encher = () => render(corpo, [
    aviso({
      variant: 'danger',
      iconName: 'alert',
      texto: 'A mensalidade de Maria Fernanda Albuquerque está atrasada há 3 dias. Vencimento: 05/09.',
      quando: 'Hoje',
    }),
    aviso({
      variant: 'warning',
      iconName: 'wallet',
      texto: 'A mensalidade de Pedro vence hoje, 09/09.',
      quando: 'Hoje',
    }),
    aviso({
      variant: 'accent',
      iconName: 'clock',
      texto: 'Pedro, Ana e João têm mensalidade vencendo amanhã, 10/09.',
      quando: 'Ontem',
      lido: true,
    }),
  ]);

  /* A central de verdade consulta o banco ao montar e ao abrir. Aqui não há
     sessão: as duas consultas falham e ela repinta o estado vazio por cima dos
     avisos falsos, em um momento que depende da rede. Em vez de apostar num
     setTimeout, o observador repõe o conteúdo sempre que ela o esvazia. */
  new MutationObserver(() => {
    if (!corpo.querySelector('.notif-item')) encher();
  }).observe(corpo, { childList: true });

  encher();
}

/* ?modal=1 abre um formulário de exemplo, para conferir o desenho do modal. */
if (params.has('modal')) {
  openFormModal({
    title: 'Novo aluno',
    fields: [
      textField({ name: 'nome', label: 'Nome completo', value: 'Ana Souza', required: true }),
      textField({ name: 'telefone', label: 'Telefone', value: '(82) 99999-8888', type: 'tel' }),
      selectField({
        name: 'categoria',
        label: 'Categoria',
        options: [{ value: 'kids', label: 'Kids' }, { value: 'adulto', label: 'Adulto' }],
        value: 'adulto',
      }),
      checkboxField({ name: 'sponsored', label: 'Atleta patrocinado', hint: 'Não gera cobrança.' }),
    ],
    submitLabel: 'Salvar',
    onSubmit: async () => {},
  });
}
