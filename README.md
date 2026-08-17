# Sistema de Gestão de Aulas de Beach Tennis

MVP de uma plataforma web para gerenciar alunos, turmas, frequência, reposições, mensalidades e
planejamentos de aulas de Beach Tennis.

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

*(Disponível a partir da Fase 2.)* Os arquivos ficam em `supabase/migrations/`, numerados na ordem
de execução. Rode-os no **SQL Editor** do painel do Supabase, um de cada vez e em ordem.

### 4. Criar o usuário professor

*(A partir da Fase 2.)* Em **Authentication → Users → Add user**, crie o usuário com e-mail e
senha. O MVP não tem tela de cadastro público.

---

## Como executar localmente

```bash
npm run dev       # servidor de desenvolvimento em http://localhost:5173
npm run build     # build de produção em dist/
npm run preview   # serve o dist/ localmente, para conferir o build
```

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
│   ├── agenda.html · aula.html
│   └── planejamentos.html
│
├── css/
│   ├── variables.css        design tokens — nenhum valor solto fora daqui
│   ├── reset.css · base.css
│   ├── layout.css           sidebar, bottom nav, header, conteúdo
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
│   └── utils/               dates, formatters, validators, dom
│
├── supabase/migrations/     SQL versionado
├── docs/ARQUITETURA.md      decisões de arquitetura e o porquê de cada uma
└── assets/
```

### As cinco camadas

| Camada | Onde | Responsabilidade |
|---|---|---|
| Client | `js/supabase.js` | instanciar o cliente |
| API | `js/api/*.js` | toda chamada ao Supabase |
| Domínio | `js/<modulo>/<modulo>.js` | regras de negócio e orquestração |
| UI | `js/<modulo>/*-ui.js`, `js/components/` | gerar HTML e tratar eventos |
| Utils | `js/utils/*.js` | datas, moeda, validação |

A regra que mantém isso honesto, verificável com um `grep`:

> `supabase` só aparece em `js/api/` e `js/auth.js`.
> `document` nunca aparece em `js/api/`.

---

## Funcionalidades

### Nesta versão

- [x] **Fase 1** — Fundação: Vite, estrutura, design tokens, layout responsivo, navegação, componentes
- [ ] **Fase 2** — Banco, RLS e autenticação
- [ ] **Fase 3** — Alunos: CRUD, busca, perfil, situação financeira
- [ ] **Fase 4** — Turmas: CRUD, horários, matrícula
- [ ] **Fase 5** — Agenda: calendário e sessões de aula
- [ ] **Fase 6** — Frequência: chamada e histórico
- [ ] **Fase 7** — Reposições
- [ ] **Fase 8** — Financeiro: mensalidade, pagamentos, status
- [ ] **Fase 9** — Planejamentos
- [ ] **Fase 10** — Dashboard com dados reais
- [ ] **Fase 11** — Refinamento: mobile, acessibilidade, performance, revisão de RLS

### Fora deste MVP

WhatsApp, biblioteca de exercícios, avaliações, evolução, notificações, busca global, relatórios
avançados, gráficos, integração de pagamentos (Pix/boleto/cartão), cobrança automática, painel
administrativo, assinaturas e funcionalidades de IA.

A arquitetura já deixa espaço para todas: `user_id` + RLS em todas as tabelas desde o início,
histórico de matrícula em `class_students.active`, e a camada `js/api/` isolando o backend.

---

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — modelo do banco, estratégia de RLS, fluxos por
  módulo, tratamento de datas e as decisões que ainda precisam ser tomadas.
