# MatchPhoint

Plataforma web para o professor de Beach Tennis gerenciar alunos, turmas, frequência, reposições,
mensalidades e planejamentos de aula.

Construído em **HTML, CSS e JavaScript puro** com **Supabase** como backend. Sem React, sem
Tailwind, sem framework de interface — por decisão de projeto, para que o código continue legível
e estudável.

A experiência foi desenhada em torno de uma pergunta:

> *"Se eu estiver na quadra, com pouco tempo e usando o celular, consigo fazer isso rapidamente?"*

---

## Tecnologias

| Camada | Escolha |
|---|---|
| Frontend | HTML5, CSS3, JavaScript ES6+ (ES Modules) |
| Build | Vite (template Vanilla) — só ferramenta, não framework |
| Backend | Supabase |
| Banco | PostgreSQL (via Supabase) |
| Autenticação | Supabase Auth |
| Segurança | Row Level Security (RLS) no Postgres |
| Deploy | Vercel |

**Dependências de runtime:** apenas `@supabase/supabase-js`.
Os ícones são SVG do Lucide copiados inline (`js/components/icons.js`) — nenhum pacote instalado.

---

## Como instalar

Requer **Node.js 18+**.

```bash
git clone <url-do-repositorio>
cd sistema-professores
npm install
```

## Como configurar

### 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto.
2. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**

### 2. Variáveis de ambiente

```bash
cp .env.example .env
```

Preencha o `.env`:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima-publica
```

| Variável | Descrição |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Chave pública (anônima) do projeto |

> **Sobre a chave anônima:** ela fica visível no bundle publicado. Isso é o funcionamento oficial
> do Supabase e é seguro **enquanto o RLS estiver ativo em todas as tabelas**. A chave
> `service_role` ignora o RLS e **nunca** deve entrar no `.env` nem no frontend.

O arquivo `.env` está no `.gitignore` e não deve ser versionado.

### 3. Executar as migrations

No painel do Supabase, abra o **SQL Editor** e execute os arquivos de `supabase/migrations/`
**na ordem**, um de cada vez — cole o conteúdo inteiro de cada um e clique em *Run*:

| Ordem | Arquivo | O que faz |
|---|---|---|
| 1 | `0001_schema.sql` | Cria as 10 tabelas, constraints e índices |
| 2 | `0002_rls.sql` | Liga o Row Level Security e cria as políticas |
| 3 | `0003_triggers.sql` | `updated_at` automático e criação do perfil |
| 4 | `0004_due_day_31.sql` | Permite dia de vencimento de 1 a 31 |
| 5 | `0005_enrollment_days.sql` | Aluno matriculado em dias específicos da turma |
| 6 | `0006_patrocinados_lista_espera.sql` | Atleta patrocinado, vagas da turma, lista de espera e avisos |
| 7 | `0007_lista_espera_multiplas_turmas.sql` | Uma pessoa da fila passa a poder querer **várias** turmas |
| 8 | `0008_planejamento_turma.sql` | Planejamento com turma ou geral (`class_id` opcional) |
| 9 | `0009_categorias_tipo_aluno_afastados.sql` | Categoria vira o nível (E…PRO), tipo do aluno (Kids/Adulto), aluno afastado e categoria do planejamento |
| 10 | `0010_compartilhar_planejamento.sql` | Compartilhar um planejamento com outro professor (tabela `lesson_plan_shares` e função `list_teachers()`) |
| 11 | `0011_nome_do_professor.sql` | O seletor de compartilhamento mostra o nome do professor, nunca o apelido do e-mail |
| 12 | `0012_notificacoes_mensalidade.sql` | Avisos de mensalidade: inscrições de push e o registro dos avisos enviados (`push_subscriptions`, `payment_notifications`) |

Para conferir que deu certo, rode:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Devem aparecer **16 tabelas, todas com `rowsecurity = true`**. Se alguma vier `false`, o RLS não
foi aplicado e os dados estariam expostos — não siga adiante.

> **A migration 0009 troca o significado de `students.category`**: o que era Kids/Adulto passa a
> ser o NÍVEL (E, D, C, B, A, PRO), e Kids/Adulto vai para a coluna nova `students.student_type`.
> O valor antigo é copiado antes da troca — nada se perde —, e todo aluno já cadastrado começa no
> nível E até o professor ajustar. `classes.category` continua sendo Kids/Adulto.

> **A migration 0007 remove a coluna `waitlist_entries.class_id`** — depois de copiar o que havia
> nela para a tabela nova `waitlist_entry_classes`. Nenhum dado se perde, mas o site publicado
> precisa estar atualizado junto: a versão antiga do código grava naquela coluna. Rode o SQL e
> publique o build na mesma janela.

> **Rode cada arquivo uma única vez.** O SQL Editor executa tudo numa transação: se um comando
> falhar (por exemplo `relation "profiles" already exists`, sinal de que o script foi colado duas
> vezes), a transação inteira é desfeita e o banco volta ao que era antes.
>
> Se algo parar no meio, rode `supabase/reset.sql` — ele apaga as 16 tabelas e as funções, é
> seguro em qualquer estado, e depois dele os três arquivos rodam limpos. **É destrutivo:** apaga
> os dados junto (não mexe nos usuários).

### 4. Criar o usuário professor

Em **Authentication → Users → Add user**:

1. Preencha e-mail e senha.
2. Marque **Auto Confirm User** (sem isso o login recusa com "e-mail não confirmado").
3. Opcionalmente, em *User Metadata*, adicione `{ "name": "Seu Nome" }` — o trigger usa isso no
   perfil. Sem esse campo, o nome vira a parte do e-mail antes do `@`.

Também dá para criar a conta pela própria tela de login, no botão **Criar conta**: nome, e-mail e
senha. O nome digitado ali chega ao perfil pelo mesmo caminho (`raw_user_meta_data` → trigger
`handle_new_user`) e é o que aparece para os outros professores no compartilhamento de
planejamentos. Se o projeto exigir confirmação de e-mail, a conta é criada mas o login só funciona
depois de o professor confirmar — em **Authentication → Providers → Email** você decide.

Para quem já tinha conta antes desta tela, o nome no perfil pode ser a parte do e-mail antes do
`@`. Corrija direto no banco quando quiser:

```sql
update public.profiles set name = 'Erick Souza' where email = 'erick@exemplo.com';
```

Confira que o perfil foi criado pelo trigger:

```sql
select id, name, email from public.profiles;
```

### 5. Dados de teste (opcional)

Para ver o sistema com conteúdo antes de cadastrar os seus:

| Arquivo | O que faz |
|---|---|
| `supabase/seed.sql` | Cria 6 alunos, 3 turmas, aulas com chamada, pagamentos e planejamentos |
| `supabase/seed-cleanup.sql` | Remove tudo isso |

Todo dado fictício tem o prefixo `[teste]` no nome, então a limpeza é precisa e
não toca no que é seu. O seed inclui casos de propósito: aluno em dia, aluno
atrasado, aluno sem mensalidade e uma reposição pendente.

### 6. Avisos de mensalidade (opcional)

Sem esta configuração o sistema funciona igual: o sininho continua guardando e listando os avisos
dentro do sistema. O que ela liga é o **push** — o aviso que chega ao celular com o MatchPhoint
fechado.

**a) Gerar as chaves VAPID** (uma vez na vida — trocá-las obriga todo mundo a reativar os avisos):

```bash
node scripts/gerar-vapid.mjs
```

**b) Guardar cada chave no seu lugar:**

| Onde | Variável | Qual chave |
|---|---|---|
| `.env` e Vercel → Environment Variables | `VITE_VAPID_PUBLIC_KEY` | a **pública** |
| Supabase → Project Settings → Edge Functions → Secrets | `VAPID_PUBLIC_KEY` | a **pública** |
| Supabase → Project Settings → Edge Functions → Secrets | `VAPID_PRIVATE_KEY` | a **privada** |
| Supabase → Project Settings → Edge Functions → Secrets | `VAPID_SUBJECT` | `mailto:voce@exemplo.com` |

> A chave **privada** nunca entra no `.env` nem no frontend. No bundle, ela deixaria qualquer
> pessoa enviar notificação em nome do sistema — é o mesmo raciocínio da `service_role`.

> **`VAPID_SUBJECT` precisa do `mailto:`.** É uma URL, não um endereço: `voce@exemplo.com` sozinho
> faz a função recusar com *"Vapid subject is not a valid URL"* — e a recusa acontece **antes de
> qualquer envio**, então o agendamento inteiro para de funcionar, todo dia, com o erro visível só
> no log da função. A função completa o `mailto:` sozinha quando ele falta, mas cadastre certo.

**c) Publicar a função agendada:**

```bash
npx supabase login
npx supabase init          # só na primeira vez: cria supabase/config.toml
npx supabase link --project-ref SEU-PROJETO
npx supabase functions deploy notificar-mensalidades
```

> `supabase init` não sobrescreve nada do que já está em `supabase/` — ele só acrescenta o
> `config.toml`, sem o qual o `link` não sabe de que projeto se trata.

**d) Ligar as extensões e agendar os três horários.** Em **Database → Extensions**, ative
`pg_cron` e `pg_net`. Depois, no SQL Editor, rode o bloco comentado no fim de
`supabase/migrations/0012_notificacoes_mensalidade.sql`, substituindo a URL do projeto e a
`service_role` key. Ele cria três tarefas no `pg_cron` — 11h, 15h e 21h UTC, que são **08h, 12h e
18h em Brasília**.

> Use a `service_role` **legada** (o JWT que começa com `eyJ`, em *Project Settings → API Keys*).
> A função exige token válido, e a chave nova no formato `sb_secret_...` não é um JWT: a chamada
> volta `401` e o agendamento roda sem enviar nada.

**e) Ativar no aparelho.** No sistema, o professor abre o sininho e toca em *Ativar avisos neste
aparelho*. A permissão é pedida ali, e não na abertura da página: negada uma vez, o navegador
fecha o cadeado e só as configurações dele reabrem.

Para conferir sem esperar o horário:

```bash
curl -X POST 'https://SEU-PROJETO.supabase.co/functions/v1/notificar-mensalidades' \
  -H 'Authorization: Bearer SUA-SERVICE-ROLE-KEY' \
  -H 'Content-Type: application/json' -d '{"force":true}'
```

> **iPhone:** o Safari só entrega push para site **instalado na tela de início** (iOS 16.4+).
> No Android e no desktop funciona com o navegador comum.

---

## Como executar localmente

```bash
npm run dev       # servidor de desenvolvimento em http://localhost:5173
npm run build     # build de produção em dist/
npm run preview   # serve o dist/ localmente, para conferir o build
npm test          # abre a suíte de testes no navegador
```

### Testes

Sem framework e sem dependência: são duas páginas que rodam no navegador e
imprimem o resultado. Não entram no build de produção.

| Página | O que cobre |
|---|---|
| `/tests/` | Datas e fusos, ocorrências de aula, matrícula por dia, status financeiro, vagas, fila de espera, conflito de sincronização, dinheiro e avisos de mensalidade (236 casos) |
| `/tests/render.html` | Todos os componentes de interface montados com dados falsos (151 casos) |
| `/tests/preview.html` | Vitrine visual: sidebar, topbar, perfil, cards, campos, calendário e chamada, sem banco nem sessão |
| `/tests/preview-mobile.html` | A vitrine dentro de iframes de 390 e 320 px, medindo se sobra scroll horizontal |

Rode antes de mexer em `utils/dates.js`, `agenda/ocorrencias.js`,
`turmas/matriculas.js`, `financeiro/financeiro.js`, `lista-espera/vagas.js` ou
`offline/conflitos.js` — são as peças onde um erro passa despercebido e corrompe
dado de verdade.

> `npm run build` **falha de propósito** se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY`
> estiverem faltando. Sem elas, o Rollup consegue provar que o `createClient` nunca é alcançado,
> descarta o `supabase-js` do bundle e o build passaria publicando um site quebrado. Falhar cedo
> é melhor do que descobrir isso em produção.

---

## Deploy na Vercel

1. Suba o repositório no GitHub.
2. Na Vercel, **Add New → Project** e importe o repositório.
3. O framework é detectado automaticamente (Vite). Caso contrário:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Em **Settings → Environment Variables**, cadastre `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`.
5. Deploy.

---

## Estrutura de pastas

```
/
├── index.html               porta de entrada (decide login ou dashboard)
├── login.html
├── pages/                   uma tela = um documento HTML
│   ├── dashboard.html
│   ├── alunos.html · aluno.html
│   ├── turmas.html · turma.html
│   ├── lista-espera.html
│   ├── agenda.html · aula.html
│   └── planejamentos.html
│
├── css/
│   ├── variables.css        design tokens — nenhum valor solto fora daqui
│   ├── reset.css · base.css
│   ├── layout.css           sidebar/drawer, topbar, perfil, conteúdo
│   ├── components.css       botões, cards, modal, toast, badges, formulários
│   └── responsive.css       breakpoints e a virada tabela → card
│
├── js/
│   ├── supabase.js          cliente único
│   ├── auth.js              login, logout, sessão (Fase 2)
│   ├── app.js               bootstrap comum de toda página protegida
│   ├── api/                 TODA query Supabase mora aqui (Fase 2+)
│   ├── components/          layout, modal, toast, confirm, empty-state, loading, icons
│   ├── dashboard/ alunos/ turmas/ agenda/ financeiro/ reposicoes/ planejamentos/
│   ├── lista-espera/        fila por turma, regra da vaga e avisos
│   ├── notificacoes/        regras do aviso de mensalidade, push e central do sino
│   ├── offline/             cache local, fila de pendências e sincronização
│   └── utils/               dates, formatters, validators, dom
│
├── public/                  copiado tal e qual para a raiz do site
│   ├── sw.js                Service Worker (abrir sem internet + receber push)
│   ├── manifest.webmanifest instalável como aplicativo
│   └── icons/
│
├── tests/                   suítes e vitrine visual — fora do build
├── supabase/migrations/     SQL versionado
├── supabase/functions/      Edge Functions (o envio agendado dos avisos)
├── docs/ARQUITETURA.md      decisões de arquitetura e o porquê de cada uma
└── assets/
    ├── brand/               logo e monograma, gerados de img/logotipo-sistema.png
    └── fonts/               Inter (variável, subconjunto latino)
```

## Identidade visual

**MatchPhoint.** Azul `#0736C2` + preto + branco + neutros frios.

### Logo

O arquivo original é `img/logotipo-sistema.png` (1774x887, 755 kB). Ele **não** é usado direto:
`scripts/gerar-logo.mjs` apara a margem branca e reduz a resolução, produzindo o que a interface
carrega de verdade.

```
node scripts/gerar-logo.mjs
```

| Arquivo | Uso |
|---|---|
| `assets/brand/matchphoint.png` (440x214, 59 kB) | menu, topo, login, tela de carregamento |
| `assets/brand/matchphoint-mark.png` (256², 30 kB) | favicon |

Rode o script só quando a logo mudar — o resultado é versionado, e o build não depende dele. Ele
é Node puro (o `node:zlib` decodifica e recodifica o PNG), sem dependência e sem navegador.

**A logo é PNG sem canal alfa**: o fundo dela é branco de verdade. Sobre o topo branco e o cartão
de login isso passa despercebido; sobre a sidebar escura viraria um retângulo branco no meio do
menu. Por isso ela ganha lá a `.brand-plate` — uma plaquinha branca de cantos arredondados, que
transforma o retângulo em decisão de design em vez de acidente.

### Cor de categoria e de dia O azul é **cor de destaque**,
não cor de fundo: ele aparece na ação principal, no item de menu selecionado, no
campo em foco e no número que resume o mês. O resto da tela é branco sobre cinza
claríssimo, e o contraste vem do preto.

Kids é **verde** e Adulto é **azul** — e a cor identifica o **card inteiro do aluno**, não só um
selo: fundo tingido, borda na cor e o selo da categoria ao lado do nome. O selo da direita continua
sendo o da situação financeira, inclusive o roxo de "Patrocinado", que aparece em qualquer
categoria. Cada dia da semana também tem a sua cor.

Os dois tons são vizinhos de cores que já querem dizer outra coisa (o verde de "Em dia", o azul da
marca), então nenhum deles é o mesmo valor: o verde da categoria é mais claro que
`--color-success` e o azul é mais vivo que `--color-primary`. O que separa as três coisas é o tom
e o lugar — categoria pinta o card, estado fica no selo, ação continua sendo só do azul da marca.

A cor do dia identifica o **card inteiro da turma**: uma barra no topo com um segmento por dia, o
cabeçalho tingido e o ícone da ocupação. O tom usado no fundo é o suave do dia diluído em branco
(`--tint-strength`), então o preto do nome da turma continua sendo o que se lê primeiro — a cor
identifica, não disputa. Turma de vários dias fica com uma barra segmentada em vez de um card
bicolor, e os selos logo abaixo dizem quais dias são.

Na dashboard cada indicador tem cor de assunto (alunos azul, turmas verde, aulas de hoje roxo,
atraso vermelho), repetida no atalho que leva ao mesmo lugar. O vermelho é **exclusivo de alerta**:
o cartão de atrasados só ganha cor quando existe atraso.

Uma categoria nova entra em dois lugares e em nenhum outro: um par de variáveis
(`--color-<nome>` / `--color-<nome>-soft`) e uma linha em `js/components/badges.js`.

| Peça | Onde mexer |
|---|---|
| Paleta, tipografia, raios, sombras, espaçamento | `css/variables.css` — **nenhum valor de cor fora daqui** |
| Selos de categoria e de dia | `js/components/badges.js` |
| Fonte | `css/base.css` (`@font-face`) + `assets/fonts/` |
| Sidebar escura, drawer, topbar, perfil | `css/layout.css` + `js/components/layout.js` |
| Cards, botões, campos, badges, modal | `css/components.css` |
| Comportamento por tamanho de tela | `css/responsive.css` |

Trocar a cor da marca é editar **uma linha** (`--color-primary`) e as duas
variações dela logo abaixo. Tudo o mais — botão, foco, item de menu, ícone de
atalho, ponto do calendário — deriva daí.

**Navegação:** no desktop a sidebar fica fixa à vista; no celular o MESMO
elemento vira um drawer, aberto pelo botão ☰ do topo. Não existe uma segunda
navegação para telas pequenas: é o mesmo HTML com outro CSS.

**Fonte:** Inter, hospedada em `assets/fonts/` e importada por caminho relativo
em `css/base.css`. Nada de `<link>` para CDN — o sistema não pede a terceiro o
desenho da própria interface, e continua legível offline. É a versão variável
(um arquivo cobre 400–700) com `unicode-range`, então o navegador baixa 48 kB
para uma tela em português. A pilha do sistema fica como reserva.

### As cinco camadas

| Camada | Onde | Responsabilidade |
|---|---|---|
| Client | `js/supabase.js` | instanciar o cliente |
| API | `js/api/*.js` | toda chamada ao Supabase |
| Domínio | `js/<modulo>/<modulo>.js` | regras de negócio e orquestração |
| UI | `js/<modulo>/*-ui.js`, `js/components/` | gerar HTML e tratar eventos |
| Utils | `js/utils/*.js` | datas, moeda, validação |
| Offline | `js/offline/*.js` | cópia local, fila de pendências e sincronização |

A regra que mantém isso honesto, verificável com um `grep`:

> `supabase` só aparece em `js/api/` e `js/auth.js`.
> `document` nunca aparece em `js/api/`.

---

## Funcionalidades

### Nesta versão

- [x] **Fase 1** — Fundação: Vite, estrutura, design tokens, layout responsivo, navegação, componentes
- [x] **Fase 2** — Banco, RLS e autenticação: 10 tabelas, políticas, triggers, login/logout, proteção de páginas
- [x] **Fase 3** — Alunos: listagem, busca, cadastro, edição, exclusão, perfil, situação financeira
- [x] **Fase 4** — Turmas: CRUD, horários em vários dias, matrícula e remoção de alunos
- [x] **Fase 5** — Agenda: calendário mensal, aulas previstas e materialização sob demanda
- [x] **Fase 6** — Frequência: chamada com um toque, histórico mensal e percentual
- [x] **Fase 7** — Reposições: da falta ao agendamento e à conclusão
- [x] **Fase 8** — Financeiro: mensalidade, registro de pagamento, status calculado
- [x] **Fase 9** — Planejamentos: CRUD agrupado por mês
- [x] **Fase 10** — Dashboard: indicadores reais, aulas do dia, atrasados, vencimentos, atalhos
- [x] **Fase 11** — Refinamento: mobile, acessibilidade, estados de carga/erro/vazio, testes
- [x] **Fase 12** — Financeiro do mês (previsto / recebido / a receber), atleta patrocinado,
  lista de espera por turma e aviso de vaga
- [x] **Fase 13** — Nova identidade visual: azul `#0736C2`, sidebar escura, drawer no celular,
  perfil no topo com o nome do professor e tipografia Inter
- [x] **Fase 14** — Marca MatchPhoint (logo e nome em todo o sistema), cor por categoria e por dia
  da semana, nível no perfil do aluno e filtro de turmas por dia
- [x] **Fase 15** — Lista de espera com vários horários por pessoa, planejamento com ou sem turma,
  funcionamento offline (Service Worker + IndexedDB) e a identidade de cor por dia no card da turma
- [x] **Fase 16** — Categoria do aluno como nível (E…PRO) e tipo Adulto/Kids, filtro de alunos,
  alunos afastados, planejamentos com categoria, filtro e grade 2x2, compartilhamento de
  planejamento com outro professor, turmas e planos ordenados por horário e reposição em turma
  lotada mediante confirmação
- [x] **Fase 17** — Avisos de mensalidade: push no celular para vencimento de amanhã, de hoje e
  atraso, com revezamento de horário, agrupamento por situação e central de notificações no sino

## Avisos de mensalidade

O professor é avisado no celular quando uma mensalidade **vence amanhã**, **vence hoje** ou está
**atrasada** — mesmo com o MatchPhoint fechado.

| Situação | O que chega |
|---|---|
| 🔵 Vence amanhã | *A mensalidade de Pedro vence amanhã, 09/09.* |
| 🟡 Vence hoje | *A mensalidade de Pedro vence hoje, 09/09.* |
| 🔴 Está atrasada | *A mensalidade de Pedro está atrasada há 3 dias. Vencimento: 05/09.* |

**Nenhum valor em dinheiro aparece no aviso.** Ele é lido na tela bloqueada, por quem estiver por
perto — nome e data bastam para o professor saber o que fazer, e o quanto está dentro do sistema.

**As regras, e onde cada uma mora:**

- **No máximo um aviso por aluno por dia.** É o índice único
  `payment_notifications (user_id, student_id, notified_on)` — o registro é gravado *antes* do
  envio, então o que o banco recusa não vira notificação.
- **O horário reveza entre 08h, 12h e 18h** conforme os dias passam, para aumentar a chance de o
  professor estar com o celular na mão. O horário sai da própria data (`slotHourForDate`), sem
  estado guardado em lugar nenhum.
- **Continua todo dia enquanto estiver pendente, e para na hora da baixa.** Os pagamentos são
  relidos do banco a cada execução, momentos antes de compor as mensagens: dar baixa às 11h59 já
  impede o envio das 12h. Não existe fila decidida de véspera.
- **Patrocinado, afastado e mensalidade paga nunca são avisados** — pela mesma `isBillable` que já
  os tira da previsão do mês na dashboard.
- **Vários alunos na mesma situação viram uma notificação só.** Cinco avisos seguidos dizendo a
  mesma coisa é o caminho mais curto para o professor desligar tudo.
- **Clicar abre o destino certo:** o aluno, quando o aviso é de um só; a área financeira da
  dashboard, quando agrupou vários.

**A central do sino**, ao lado do perfil, guarda os avisos enviados com a mesma frase que apareceu
no celular, marca como lido no clique e traz o botão de ativar os avisos neste aparelho. Um aviso
dispensado sem querer continua ali.

Quem decide o que avisar é `supabase/functions/notificar-mensalidades`, chamada pelo `pg_cron` nos
três horários. Ela **não sabe nenhuma regra financeira**: importa `js/financeiro/financeiro.js` e
`js/notificacoes/mensalidades.js`, os mesmos arquivos que as telas usam — mudar o financeiro muda
o aviso junto, e é impossível os dois discordarem.

A configuração está em *Como configurar → 6. Avisos de mensalidade*.

## Funcionamento offline

O professor consegue **consultar** o sistema e **fazer a chamada** sem internet.

**O que fica disponível:** alunos, turmas, lista de espera, agenda, planejamentos, financeiro,
frequência e perfil — tudo o que já tiver sido carregado uma vez com conexão. Cada consulta guarda
uma cópia no IndexedDB, com a chave do professor; o logout apaga essa cópia (o aparelho pode ser
compartilhado).

**O que pode ser feito offline:** marcar presença, falta e reposição. Só isso, e por um motivo: a
frequência é um `upsert` por (aula, aluno) — não cria identificador, não depende de nada que ainda
não exista e pode ser reenviada sem duplicar. Cadastrar aluno, criar turma ou registrar pagamento
ficam de fora porque geram identificadores e disparam consequências que o servidor precisa validar
na hora; enfileirá-los criaria alunos duplicados e contas erradas.

**Quando a conexão volta:** a fila sobe sozinha e um aviso diz quantas alterações foram enviadas.
Se a mesma linha tiver mudado no servidor no meio do caminho, **nada é sobrescrito**: o sistema
mostra as duas versões e o professor escolhe qual vale.

**O indicador**, no topo, ao lado do perfil: `● Online` · `● Offline` · `↻ Sincronizando...` ·
`✓ Sincronizado`. No celular sobra só o ponto colorido.

> O Service Worker (`public/sw.js`) é o que faz a página **abrir** sem rede — sem ele o navegador
> nem executaria JavaScript, e o banco local ficaria inalcançável. Ele usa *rede primeiro, cache
> como reserva*: publicação nova nunca fica presa em cache.

### Fora deste MVP

Biblioteca de exercícios, avaliações, evolução, busca global, relatórios avançados, gráficos,
integração de pagamentos (Pix/boleto/cartão), cobrança automática, painel administrativo,
assinaturas e funcionalidades de IA.

O contato por WhatsApp existe como link `wa.me` na lista de espera — abrir a conversa, nada mais.
Não há envio automático de mensagem nem integração com a API do WhatsApp. As notificações são as
de vaga na lista de espera, gravadas no banco; não há push nem e-mail.

A arquitetura já deixa espaço para todas: `user_id` + RLS em todas as tabelas desde o início,
histórico de matrícula em `class_students.active`, e a camada `js/api/` isolando o backend.

---

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — modelo do banco, estratégia de RLS, fluxos por
  módulo, tratamento de datas e as decisões que ainda precisam ser tomadas.
