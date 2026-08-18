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

renderLayout({
  pageId: 'dashboard',
  user: { email: 'phellipysilvadev@gmail.com' },
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

const statCard = (card) =>
  el('div', { class: `stat${card.variant ? ` stat--${card.variant}` : ''}` }, [
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

render(document.getElementById('page-content'), [
  el('div', { class: 'grid-stats' }, [
    { label: 'Alunos ativos', value: '24', iconName: 'users' },
    { label: 'Turmas', value: '6', iconName: 'layers' },
    { label: 'Aulas hoje', value: '3', iconName: 'calendar' },
    { label: 'Atrasados', value: '2', iconName: 'alert', variant: 'danger' },
  ].map(statCard)),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Financeiro de agosto/2026' }),
    el('div', { class: 'grid-stats grid-stats--5' }, [
      { label: 'Valor previsto', value: 'R$ 3.480,00', hint: 'Soma das mensalidades de quem é cobrado', iconName: 'wallet', variant: 'accent', money: true },
      { label: 'Valor recebido', value: 'R$ 2.150,00', hint: 'Pagamentos com baixa registrada neste mês', iconName: 'trendUp', variant: 'success', money: true },
      { label: 'Valor a receber', value: 'R$ 1.330,00', hint: 'Previsto menos recebido', iconName: 'clock', variant: 'warning', money: true },
      { label: 'Alunos pagantes', value: '22', iconName: 'user' },
      { label: 'Patrocinados', value: '2', hint: 'Atletas sem mensalidade', iconName: 'award', variant: 'sponsored' },
    ].map(statCard)),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Atalhos' }),
    el('div', { class: 'shortcut-grid' }, [
      ['Adicionar aluno', 'plus'],
      ['Adicionar turma', 'plus'],
      ['Abrir agenda', 'calendar'],
      ['Planejar aula', 'clipboard'],
      ['Lista de espera', 'bell'],
      ['Registrar pagamento', 'wallet'],
    ].map(([label, iconName]) =>
      el('button', { type: 'button', class: 'shortcut' }, [
        el('span', { class: 'shortcut__icon', html: icon(iconName, 18) }),
        el('span', { text: label }),
      ]),
    )),
  ]),

  el('section', { class: 'section' }, [
    el('h2', { class: 'section__title', text: 'Turmas' }),
    el('div', { class: 'grid-cards' }, [
      ['Kids Iniciante', 'Segunda e Quarta · 17:00 · 60 min', '7/8 alunos', 'success', 'Kids'],
      ['Adulto Noite', 'Terça e Quinta · 18:00 · 60 min', '8/8 alunos', 'warning', 'Turma cheia'],
      ['Avançado', 'Sábado · 09:00 · 90 min', '5 alunos matriculados', 'neutral', 'Adulto'],
    ].map(([name, meta, occupancy, variant, badge]) =>
      el('article', { class: 'card card--link' }, [
        el('div', { class: 'card__header' }, [
          el('div', {}, [
            el('h3', { class: 'card__title', text: name }),
            el('p', { class: 'card__meta', text: meta }),
          ]),
          el('span', { class: `badge badge--${variant}`, text: badge }),
        ]),
        el('p', { class: 'card__meta', text: occupancy }),
        el('div', { class: 'card__footer' }, [
          el('button', { type: 'button', class: 'btn btn--ghost btn--sm', text: 'Editar' }),
          el('button', { type: 'button', class: 'btn btn--secondary btn--sm', text: 'Ver turma' }),
        ]),
      ]),
    )),
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
