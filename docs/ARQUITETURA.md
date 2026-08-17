# Análise Arquitetural — Sistema de Gestão de Aulas de Beach Tennis (MVP)

> Documento de referência produzido antes da implementação, conforme seção 47 da `spec.md`.
> Toda decisão que se afasta da spec está marcada com **⚠️ Desvio** e justificada.

---

## 0. Nota sobre a SPEC completa

A seção 47 pede para ler `@SPEC.md` como "referência geral do produto" e comparar a visão
completa com o escopo reduzido do MVP. No Windows o sistema de arquivos é *case-insensitive*,
portanto `SPEC.md` e `spec.md` são o **mesmo arquivo** — e é o único documento existente no
repositório.

**Consequência:** não existe uma "visão completa do produto" separada para comparar. Esta análise
foi feita apenas sobre `spec.md`. A comparação possível é entre o **escopo do MVP** (seções 1–37)
e a **lista explícita de fora-do-MVP** (seção 38), que está tratada no item 17.

Se a spec completa existir em outro lugar, ela pode ser adicionada depois sem invalidar nada
deste documento.

---

## 1. Arquitetura geral

### Estilo: MPA (Multi-Page Application) estática

Cada tela é um arquivo `.html` real, com seu próprio módulo JS de entrada. Não há roteador,
não há estado global, não há hidratação.

```
Navegador
   │
   ├─ pages/alunos.html          ← documento
   │     └─ js/alunos/alunos.js  ← controller da página (entry point ES module)
   │           ├─ js/app.js            → guarda de sessão + layout (sidebar/nav/header)
   │           ├─ js/api/students.js   → TODA query Supabase deste domínio
   │           ├─ js/alunos/alunos-ui.js → render/DOM puro
   │           ├─ js/components/*      → modal, toast, confirm, empty-state, loading
   │           └─ js/utils/*           → datas, formatação, validação
   │
   └─ Supabase (PostgREST + Auth) ← RLS decide o que cada professor enxerga
```

**Por que MPA e não SPA:**

- A spec (seção 5) já descreve páginas HTML separadas.
- Um roteador cliente é a primeira abstração desnecessária a aparecer em projeto vanilla —
  a spec proíbe isso explicitamente (seções 39 e 48).
- Cada página carrega **somente** o JS que precisa → atende a seção 42 (performance) de graça.
- Para estudo é imbatível: abrir `alunos.html` e `alunos.js` mostra a tela inteira.

**Custo aceito:** recarregamento completo ao trocar de página. Em rede móvel com bundle pequeno
(~60–80 KB gzip, quase tudo `supabase-js`) isso é imperceptível, e o Supabase mantém a sessão em
`localStorage`.

### As 5 camadas

| Camada | Onde vive | Responsabilidade | O que **não** pode fazer |
|---|---|---|---|
| **Client** | `js/supabase.js` | Instanciar o cliente Supabase (singleton) | conter query |
| **API / dados** | `js/api/*.js` | Toda chamada `.from().select()`, `.insert()`, etc. | tocar no DOM |
| **Domínio** | `js/<modulo>/<modulo>.js` | Regras de negócio, orquestração, estado da página | escrever SQL |
| **UI** | `js/<modulo>/<modulo>-ui.js`, `js/components/*` | Gerar HTML, ler formulários, eventos | chamar Supabase |
| **Utils** | `js/utils/*.js` | Datas, moeda, validação, formatação | conhecer o domínio |

Regra prática, verificável com um `grep`:

> **`supabase` só aparece em `js/api/` e `js/auth.js`. `document` nunca aparece em `js/api/`.**

Isso resolve literalmente a exigência da seção 4: *"Evitar misturar SQL, regras de negócio e
manipulação do DOM no mesmo arquivo."*

---

## 2. Estrutura de pastas

```
/
├── index.html                  # redireciona p/ dashboard ou login
├── login.html
│
├── pages/
│   ├── dashboard.html
│   ├── alunos.html
│   ├── aluno.html              # ?id=<uuid>
│   ├── turmas.html
│   ├── turma.html              # ?id=<uuid>
│   ├── agenda.html
│   ├── aula.html               # ⚠️ NOVO — ?id=<session_id> — tela de chamada
│   └── planejamentos.html
│
├── css/
│   ├── reset.css
│   ├── variables.css           # design tokens (seção 25)
│   ├── base.css
│   ├── layout.css              # shell: sidebar / header / bottom-nav / container
│   ├── components.css          # botões, cards, badges, modal, toast, inputs
│   └── responsive.css          # breakpoints e viradas tabela→card
│
├── js/
│   ├── app.js                  # bootstrap comum de toda página protegida
│   ├── auth.js                 # login, logout, sessão, guarda
│   ├── supabase.js             # client singleton
│   │
│   ├── api/                    # ⚠️ NOVO — camada de acesso a dados
│   │   ├── students.js
│   │   ├── classes.js          # classes + class_schedules + class_students
│   │   ├── sessions.js         # class_sessions
│   │   ├── attendance.js
│   │   ├── makeups.js
│   │   ├── payments.js
│   │   ├── lesson-plans.js
│   │   └── dashboard.js        # consultas agregadas da home
│   │
│   ├── components/
│   │   ├── layout.js           # ⚠️ NOVO — injeta sidebar+header+bottom-nav
│   │   ├── modal.js
│   │   ├── toast.js
│   │   ├── confirm-dialog.js
│   │   ├── empty-state.js
│   │   └── loading.js
│   │
│   ├── dashboard/dashboard.js
│   ├── alunos/{alunos.js, aluno.js, alunos-ui.js}
│   ├── turmas/{turmas.js, turma.js, turmas-ui.js}
│   ├── agenda/{agenda.js, aula.js, frequencia.js}
│   ├── financeiro/financeiro.js      # regra de status + registrar pagamento
│   ├── reposicoes/reposicoes.js
│   ├── planejamentos/planejamentos.js
│   │
│   └── utils/
│       ├── dates.js
│       ├── formatters.js       # moeda, telefone, categoria
│       ├── validators.js
│       └── dom.js              # ⚠️ NOVO — $, $$, el(), on() — 30 linhas
│
├── assets/{images,icons}
├── supabase/
│   ├── migrations/
│   │   ├── 0001_schema.sql
│   │   ├── 0002_rls.sql
│   │   └── 0003_triggers.sql
│   └── seed/{seed.sql, cleanup.sql}   # dados de teste (seção 37)
│
├── docs/ARQUITETURA.md         # este arquivo
├── .env.example
├── .gitignore
├── vite.config.js
├── vercel.json
├── package.json
└── README.md
```

### ⚠️ Desvios da estrutura da spec (seção 5 permite, exigindo explicação)

1. **`js/api/` (novo).** A spec pede separação entre "acesso ao Supabase" e "lógica de negócio"
   (seção 4), mas a árvore proposta não tinha onde pôr isso — o acesso acabaria dentro de
   `alunos.js`. Uma pasta `api/` por domínio resolve, e é o ponto único a mudar se um dia o
   backend deixar de ser Supabase.
2. **`pages/aula.html` (novo).** A chamada é a tela mais usada do sistema ("na quadra, com pouco
   tempo"). Embutir isso em `agenda.html` criaria um arquivo com duas telas dentro. Tela própria,
   endereço próprio, dá para favoritar no celular.
3. **`components/layout.js` (novo).** Em MPA, sidebar e navegação teriam que ser copiadas nos 9
   HTMLs. A seção 27 proíbe isso ("Não duplicar o mesmo HTML em várias páginas"). O layout é
   injetado por JS em um `<div id="app-shell">`.
4. **`utils/dom.js` (novo).** ~30 linhas de helpers (`$`, `$$`, `el`, `on`) que evitam
   `document.querySelector` repetido centenas de vezes. Não é framework, é atalho.
5. **`navbar.js` + `sidebar.js` → `layout.js`.** Os dois são a mesma navegação em breakpoints
   diferentes; separá-los duplicaria a lista de itens do menu.
6. **`supabase/seed/`.** A seção 37 pede dados de teste identificáveis e "uma forma simples de
   removê-los" → `seed.sql` marca tudo com um prefixo, `cleanup.sql` remove por esse prefixo.

---

## 3. Modelo do banco

Convenções gerais:

- PK `uuid` com `gen_random_uuid()` (exceto `profiles.id`, que é o id do `auth.users`).
- Toda tabela de dados carrega `user_id uuid NOT NULL` — **denormalizado de propósito** (ver item 5).
- Dinheiro em **centavos**, `integer`. Nunca `float`, nunca `numeric` no front (seção 36).
- Datas de calendário em `date`, horários em `time`. **Nenhum `timestamptz` para dados de aula**
  (ver item 13). `timestamptz` só em `created_at` / `updated_at`.
- Enums como `text` + `CHECK` — mais fácil de evoluir do que `CREATE TYPE`, e legível para estudo.

### profiles
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | `REFERENCES auth.users(id) ON DELETE CASCADE` |
| name | text NOT NULL | |
| email | text NOT NULL | |
| created_at / updated_at | timestamptz | |

Criado automaticamente por trigger em `auth.users` (item 6).

### students
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| name | text NOT NULL | |
| phone | text | |
| category | text NOT NULL | `CHECK (category IN ('kids','adulto'))` |
| guardian_name | text | obrigatório na UI quando `category='kids'` |
| monthly_fee_cents | integer | `CHECK (> 0)`, nullable |
| due_day | smallint | `CHECK (BETWEEN 1 AND 28)` |
| created_at / updated_at | timestamptz | |
| | | `UNIQUE (id, user_id)` ← alvo das FKs compostas |

`monthly_fee_cents` e `due_day` no próprio aluno: a seção 11 permite explicitamente
("podem ficar relacionados ao próprio aluno"). É a opção com menos tabelas e menos joins.

**⚠️ Não incluído: `active`.** O dashboard fala em "alunos ativos", mas o MVP não tem fluxo de
inativação (só exclusão, seção 9). No MVP, *aluno ativo = aluno cadastrado*. Ver decisão 17.4.

### classes
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| name | text NOT NULL | |
| category | text NOT NULL | `CHECK IN ('kids','adulto')` |
| created_at / updated_at | timestamptz | |
| | | `UNIQUE (id, user_id)` |

**⚠️ Sem coluna `duration_minutes`.** A duração é derivada de `end_time - start_time` em
`class_schedules`. Guardar os dois seria dado duplicado que pode divergir (seção 33: "Evitar
duplicação"). O formulário continua perguntando "duração" e calcula `end_time` na hora de salvar.

### class_schedules
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| class_id | uuid NOT NULL | FK composta → `classes(id, user_id)` ON DELETE CASCADE |
| day_of_week | smallint NOT NULL | `CHECK (0..6)`, **0 = domingo** (igual a `Date.getDay()` e a `EXTRACT(DOW)`) |
| start_time | time NOT NULL | |
| end_time | time NOT NULL | `CHECK (end_time > start_time)` |
| | | `UNIQUE (class_id, day_of_week, start_time)` |

Atende à seção 16: uma turma pode ter N dias.

### class_students
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| class_id | uuid NOT NULL | FK composta → `classes(id, user_id)` CASCADE |
| student_id | uuid NOT NULL | FK composta → `students(id, user_id)` CASCADE |
| active | boolean NOT NULL DEFAULT true | |
| created_at | timestamptz | |
| | | `UNIQUE (class_id, student_id)` |

### class_sessions
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| class_id | uuid NOT NULL | FK composta CASCADE |
| session_date | **date** NOT NULL | dia local da aula, sem fuso |
| start_time / end_time | time NOT NULL | copiados do schedule no momento da criação |
| status | text NOT NULL DEFAULT 'scheduled' | `CHECK IN ('scheduled','done','canceled')` |
| created_at | timestamptz | |
| | | `UNIQUE (class_id, session_date, start_time)` ← evita aula duplicada |
| | | `UNIQUE (id, user_id)` |

### attendance
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| session_id | uuid NOT NULL | FK composta → `class_sessions(id, user_id)` CASCADE |
| student_id | uuid NOT NULL | FK composta → `students(id, user_id)` CASCADE |
| status | text NOT NULL | `CHECK IN ('present','absent','makeup')` |
| notes | text | |
| created_at / updated_at | timestamptz | |
| | | **`UNIQUE (session_id, student_id)`** ← chave do `upsert` da chamada |

Essa `UNIQUE` é o que permite a chamada ser um `upsert` idempotente: tocar no botão de novo
sobrescreve em vez de duplicar (seção 19: "Permitir alterar a presença posteriormente").

### makeups
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| student_id | uuid NOT NULL | FK composta CASCADE |
| original_session_id | uuid | FK → `class_sessions(id)` **ON DELETE SET NULL** |
| makeup_session_id | uuid | FK → `class_sessions(id)` **ON DELETE SET NULL** |
| original_date | date NOT NULL | |
| makeup_date | date | |
| status | text NOT NULL DEFAULT 'pending' | `CHECK IN ('pending','scheduled','completed')` |
| notes | text | |
| created_at / updated_at | timestamptz | |

Guardar id **e** data é redundância proposital pedida pela spec (seção 21): se uma sessão for
apagada, a data da falta continua no histórico do aluno.

### payments
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| student_id | uuid NOT NULL | FK composta CASCADE |
| amount_cents | integer NOT NULL | `CHECK (> 0)` |
| reference_month | **date** NOT NULL | sempre normalizado para o **dia 1** do mês (`2026-08-01`) |
| due_date | date NOT NULL | |
| paid_date | date | `NULL` = ainda não pago |
| created_at | timestamptz | |
| | | `UNIQUE (student_id, reference_month)` ← um lançamento por mês |

**⚠️ Sem coluna `status`.** A seção 12 manda calcular ("Não utilizar status manual se for possível
calcular corretamente"). O status sai de `paid_date` + `due_date` + hoje. Ver item 14.

`reference_month` como `date` (e não `text 'AGO/2026'`) permite ordenar, filtrar por intervalo e
comparar sem parsing.

### lesson_plans
| coluna | tipo | notas |
|---|---|---|
| id | uuid PK | |
| user_id | uuid NOT NULL | |
| title | text NOT NULL | |
| description | text | |
| lesson_date | date NOT NULL | |
| created_at / updated_at | timestamptz | |

### Índices
`(user_id)` em todas; `students(user_id, name)`; `class_sessions(user_id, session_date)`;
`attendance(session_id)`, `attendance(student_id)`; `payments(student_id, reference_month desc)`;
`class_students(student_id)`; `makeups(student_id, status)`.

---

## 4. Relacionamentos

```
auth.users (1) ──(1) profiles
     │
     ├──(N) students ──┬──(N) class_students ──(N) classes
     │                 ├──(N) attendance                │
     │                 ├──(N) makeups                   ├──(N) class_schedules
     │                 └──(N) payments                  └──(N) class_sessions
     │                                                        │
     ├──(N) classes                                           ├──(N) attendance
     ├──(N) class_sessions                                    └──(N) makeups
     └──(N) lesson_plans                                        (original / makeup)
```

- **Aluno ↔ Turma:** N:N via `class_students` (seção 15). Nenhum dado de aluno é copiado.
- **Turma → Sessão:** 1:N. A turma tem horário *recorrente*; a sessão é a aula de **uma data**.
- **Sessão → Frequência:** 1:N, e a frequência **nunca** aponta para a turma (seção 18).
- **Reposição:** liga um aluno a duas sessões (a que faltou e a que vai repor).
- `lesson_plans` fica solto por data, sem FK para turma — a seção 22 pede só título/descrição/data.

---

## 5. Estratégia de RLS

### Princípio
Segurança inteira no banco. O frontend usa a **chave anônima** (que é pública por design), e
qualquer requisição só enxerga linhas cujo `user_id = auth.uid()`.

### Política padrão (idêntica em 9 tabelas)

```sql
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "students_select" ON students FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "students_insert" ON students FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "students_update" ON students FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "students_delete" ON students FOR DELETE
  USING (user_id = auth.uid());
```

`profiles` usa `id = auth.uid()` e **não** tem policy de DELETE (o perfil morre junto com a conta).

### Por que denormalizar `user_id` em vez de subconsulta

A alternativa seria, em `attendance`, escrever
`USING (EXISTS (SELECT 1 FROM class_sessions s WHERE s.id = session_id AND s.user_id = auth.uid()))`.
Isso encadeia 2–3 níveis em algumas tabelas, fica lento e — o que mais importa aqui — fica difícil
de ler para quem está estudando. Com `user_id` em toda tabela, **todas as políticas do sistema são
a mesma linha**.

### O furo que a denormalização abre — e como ele é fechado

`user_id = auth.uid()` no `WITH CHECK` impede inserir linha *no nome de outro*. Mas não impede o
professor A inserir uma `class_schedules` com `user_id = A` apontando para uma `class_id` do
professor B (a validação de FK não passa por RLS). A linha ficaria visível para A e grudada na
turma de B.

**Solução declarativa, sem trigger:**

```sql
ALTER TABLE classes ADD CONSTRAINT classes_id_user_key UNIQUE (id, user_id);

ALTER TABLE class_schedules
  ADD CONSTRAINT class_schedules_class_fk
  FOREIGN KEY (class_id, user_id) REFERENCES classes (id, user_id) ON DELETE CASCADE;
```

Agora o par `(class_id, user_id)` precisa existir junto na tabela pai. Cross-tenant vira erro de
integridade referencial. Aplicado em `class_schedules`, `class_students`, `class_sessions`,
`attendance`, `makeups` e `payments`.

### Triggers de apoio
- `handle_new_user()` — `AFTER INSERT ON auth.users` → cria o `profiles` (`SECURITY DEFINER`).
- `set_updated_at()` — `BEFORE UPDATE` em todas as tabelas com `updated_at`.

### Chaves
- `.env` local + variáveis de ambiente na Vercel; `.env` no `.gitignore`.
- Só `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no frontend. **A `service_role` nunca sai do
  painel do Supabase** — ela ignora RLS.

---

## 6. Fluxo de autenticação

```
index.html
  └─ getSession() ──► tem sessão? ──sim──► pages/dashboard.html
                              └───não──► login.html

login.html
  └─ signInWithPassword(email, senha)
        ├─ erro  → toast "E-mail ou senha inválidos." (mensagem genérica, seção 30)
        └─ ok    → location.replace('pages/dashboard.html')

qualquer página protegida
  └─ app.js: initPage()
        ├─ const session = await requireAuth()      // redireciona se não houver
        ├─ renderLayout(session, paginaAtual)       // sidebar + header + bottom-nav
        └─ devolve o controle ao controller da página
```

Detalhes:

- **Sem flash de conteúdo:** o `<body>` nasce com `class="app-booting"` (conteúdo invisível); a
  classe só sai depois que a sessão é confirmada. Sem isso o usuário deslogado vê a tela por meio
  segundo antes do redirect.
- **Persistência:** por conta do `supabase-js` (`localStorage` + refresh automático do token). Não
  vamos guardar token na mão.
- **Logout:** `signOut()` → `location.replace('/login.html')`.
- **Reação a expiração:** `onAuthStateChange` — em `SIGNED_OUT` ou `TOKEN_REFRESH_FAILED`,
  redireciona para o login. Isso cobre o caso de a sessão morrer com a aba aberta.
- **Erros:** mensagem amigável na tela, `console.error` com o objeto original (seção 30).

**⚠️ Sem tela de cadastro.** A seção 6 lista apenas login/logout, e o sistema tem um único
professor. O usuário é criado uma vez no painel do Supabase. Ver decisão 17.3.

---

## 7. Fluxo de alunos

```
alunos.html
  ├─ carrega alunos (nome, categoria, telefone, responsável, mensalidade)
  ├─ carrega pagamentos dos últimos N meses de todos os alunos (1 query)
  ├─ calcula situação financeira em memória → badge verde/vermelho
  ├─ busca: filtro por nome/telefone no cliente (lista pequena; sem ida ao servidor a cada tecla)
  ├─ [+ Adicionar aluno] → modal → insert → toast → recarrega lista
  ├─ [editar] → mesmo modal, pré-preenchido → update
  └─ [excluir] → ConfirmDialog → delete → toast

aluno.html?id=<uuid>
  ├─ dados cadastrais + situação financeira
  ├─ turma(s) atuais           (class_students → classes)
  ├─ histórico de frequência   (attendance agrupado por mês + % de presença)
  ├─ histórico de reposições   (makeups)
  └─ histórico de pagamentos   (payments desc) + [Registrar pagamento]
```

**Duas queries, não N+1.** A lista busca alunos e pagamentos em duas chamadas e cruza em memória —
a seção 42 proíbe consulta por linha.

**Validação (`utils/validators.js`):** nome obrigatório; categoria em `kids|adulto`;
`guardian_name` obrigatório quando `kids`; telefone opcional mas normalizado; mensalidade > 0;
`due_day` entre 1 e 28 (evita o problema de dia 29–31 em fevereiro).

---

## 8. Fluxo de turmas

```
turmas.html
  └─ lista de turmas: nome, categoria, dias+horários, nº de alunos
        └─ [+ Nova turma] → modal
              ├─ nome, categoria
              ├─ dias da semana (checkboxes Dom..Sáb)
              ├─ horário de início + duração (min)
              └─ salva: 1 insert em classes + N inserts em class_schedules

turma.html?id=<uuid>
  ├─ cabeçalho: nome, categoria, grade de horários (editável)
  ├─ alunos matriculados  [remover]
  ├─ [+ Adicionar aluno] → modal com alunos ainda não matriculados
  └─ próximas aulas (calculadas a partir dos horários)
```

**Remover aluno da turma** faz `active = false` em `class_students`, não `DELETE` — assim o
histórico de frequência dele naquela turma continua explicável. É exatamente o que a seção 15
antecipa ("futuramente controlar histórico de matrícula").

---

## 9. Fluxo de agenda e frequência

Esta é a decisão arquitetural mais importante do MVP.

### O problema
`class_schedules` diz "toda segunda às 17h". Isso é uma regra infinita. `class_sessions` precisa
de linhas concretas. **Quem cria essas linhas, e quando?**

### Opções avaliadas

| | Como | Problema |
|---|---|---|
| A | Job/cron gera N semanas à frente | Supabase Free não tem cron confortável; enche o banco de aulas que nunca acontecem |
| B | Botão "gerar aulas do mês" | Passo manual que o professor vai esquecer; a spec não pede |
| **C** | **Ocorrências virtuais + materialização preguiçosa** | Requer cuidado ao mesclar virtual + real |

### Escolhido: C — "virtual até tocar"

```
Agenda abre o mês
  ├─ lê class_schedules (regras) → calcula em JS todas as ocorrências do mês
  ├─ lê class_sessions do mês    (as que já existem de verdade)
  └─ mescla por (class_id, date, start_time):
        existe no banco → usa a real (tem id, status, chamada)
        não existe      → mostra como "prevista" (ainda não é linha)

Professor toca numa aula prevista
  └─ INSERT em class_sessions (upsert pela UNIQUE) → agora é real → abre aula.html?id=...
```

**Por que é a certa aqui:** o banco só guarda aula que existiu de verdade; nada de gerar 200 linhas
de dezembro que talvez não aconteçam; feriado é simplesmente uma aula que ninguém abriu; e mudar o
horário da turma não corrompe o passado, porque sessões já materializadas guardam o próprio
`start_time`.

**Cuidado necessário:** a mesclagem precisa de chave estável — `(class_id, session_date, start_time)`,
que é justamente a `UNIQUE` da tabela. O `upsert` com `onConflict` nessa chave torna o duplo-toque
inofensivo.

### Chamada (`aula.html?id=<session_id>`)

```
┌───────────────────────────────┐
│ Kids Iniciante                │
│ seg, 17/08/2026 · 17:00       │
├───────────────────────────────┤
│ JOÃO SILVA                    │
│ [ PRESENTE ][ FALTA ][ REPO ] │  ← 3 botões, altura 56px, largura total/3
├───────────────────────────────┤
│ MARIA SILVA                   │
│ [ PRESENTE ][ FALTA ][ REPO ] │
└───────────────────────────────┘
```

- Um toque = um `upsert` em `attendance` (otimista: pinta na hora, reverte e avisa se falhar).
- Sem botão "salvar" — na quadra, ninguém lembra de salvar.
- Alunos vêm de `class_students WHERE active`.
- Alunos vindos de reposição agendada para esta sessão aparecem numa seção separada,
  marcados como convidados.

---

## 10. Fluxo de reposições

```
Chamada → aluno marcado como FALTA
   └─ aparece atalho [Agendar reposição]
         └─ modal: escolher data/aula futura (lista de sessões previstas+reais)
               ├─ sem data escolhida → makeups(status='pending')
               └─ com data          → makeups(status='scheduled', makeup_session_id, makeup_date)

Aula de reposição acontece
   └─ na chamada dessa sessão o aluno aparece como convidado
         └─ marcar PRESENTE → makeups.status = 'completed'
```

Significado dos status de `attendance` (para não confundir com `makeups`):

- `present` — veio na aula dele.
- `absent` — faltou na aula dele.
- `makeup` — **está aqui repondo** uma falta de outra data.

`makeups.status`: `pending` (tem falta, sem data) → `scheduled` (data marcada) → `completed`.

Não entram no MVP (seção 21): validade, limite de reposições, expiração, cobrança. O modelo
suporta todos depois, porque a falta original fica registrada com data.

---

## 11. Fluxo financeiro

```
aluno.html → [Registrar pagamento]
   └─ modal: valor (pré-preenchido com monthly_fee_cents)
             mês de referência (default: mês atual)
             vencimento (default: due_day do mês de referência)
             data do pagamento (default: hoje)
   └─ upsert em payments  ON CONFLICT (student_id, reference_month)
   └─ recalcula badge do aluno + reflete no dashboard
```

- Tudo em centavos. `R$ 150,00` → `15000`. Parse: remove tudo que não é dígito.
- Exibição: `Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })` sobre `cents / 100`
  — a **única** divisão do sistema, e ela acontece na borda da tela.
- `UNIQUE (student_id, reference_month)` impede lançar agosto duas vezes.

Fora do MVP (seção 12): Pix, boleto, cartão, cobrança automática, WhatsApp.

---

## 12. Fluxo de planejamentos

CRUD direto sobre `lesson_plans`, agrupado por mês, mais recente primeiro.
Criar/editar em modal (título, descrição, data). Excluir com confirmação.
Sem biblioteca de exercícios, sem categorias, sem editor rico (seção 22).

---

## 13. Estratégia para datas e horários

Este é o ponto onde projetos brasileiros com JS quebram. Regras do projeto:

### No banco
- Dia de aula, vencimento, referência, pagamento → **`date`**.
- Horário de aula → **`time`**.
- **Nunca `timestamptz`** para nada que o usuário lê como "dia da aula". `timestamptz` só em
  `created_at`/`updated_at`, que ninguém compara com calendário.

Isso elimina o problema na origem: `date` não tem fuso, então não existe conversão que empurre a
aula do dia 17 para o dia 16.

### No JavaScript
Formato canônico interno: **string `'YYYY-MM-DD'`**. É o que o Postgres devolve, é o que o
`<input type="date">` usa, e é comparável e ordenável como texto.

Três proibições, todas em `utils/dates.js`:

| ❌ Nunca | ✅ Sempre | Por quê |
|---|---|---|
| `new Date('2026-08-17')` | `parseISODate('2026-08-17')` → `new Date(2026, 7, 17)` | a forma com hífen é interpretada como **UTC** → vira 16/08 21:00 no Brasil |
| `date.toISOString().slice(0,10)` | `toISODate(date)` montado com `getFullYear/Month/Date` | `toISOString` converte para UTC → volta um dia |
| `new Date()` para "hoje" | `todayISO()` | idem |

API de `utils/dates.js`:
`todayISO()`, `parseISODate(iso)`, `toISODate(date)`, `formatDateBR(iso)` → `17/08/2026`,
`formatDateLongBR(iso)` → `seg, 17 de agosto`, `formatTime(hhmmss)` → `17:00`,
`getDayOfWeek(iso)` → `0..6`, `addDays`, `startOfMonth`, `endOfMonth`, `monthLabel(iso)` →
`Agosto/2026`, `monthKey(iso)` → `2026-08`, `isBefore/isAfter/isSameDay`.

Formatação de saída com `Intl.DateTimeFormat('pt-BR')`. **`date-fns` não é necessário** — as
operações são triviais e a seção 2 pede para não adicionar biblioteca sem necessidade real.

---

## 14. Estratégia para status de mensalidade

### Modelo: `payments` registra pagamentos que aconteceram
Não há geração prévia de cobranças (a spec só descreve a ação "Registrar pagamento", seção 13).
A ausência de linha para um mês **é** a informação de não-pagamento.

### Status de um pagamento (derivado, nunca armazenado)

```js
// js/financeiro/financeiro.js
export function paymentStatus(payment, todayIso = todayISO()) {
  if (payment.paid_date) return 'paid';               // 🟢 pago
  if (payment.due_date < todayIso) return 'overdue';  // 🔴 atrasado
  return 'pending';                                   // ⚪ a vencer
}
```

### Status do aluno (o badge da listagem)

```
para cada mês entre o cadastro do aluno e o mês atual:
    vencimento = data(ano, mês, min(due_day, último dia do mês))
    se não existe payment pago para esse mês E hoje > vencimento
        → 🔴 ATRASADO
senão → 🟢 EM DIA
```

Consequências assumidas:

- Aluno sem `monthly_fee_cents`/`due_day` → **sem badge** (não dá para cobrar quem não tem valor).
- Mês atual antes do vencimento → **Em dia** (ainda não venceu; a spec só tem dois estados).
- O cálculo roda em JS sobre os pagamentos já carregados — **zero query extra** por aluno.
- Só os dois estados da seção 12 aparecem na UI. `pending` existe internamente para o dashboard
  poder listar "próximos vencimentos".

Ver decisão 17.5 sobre a janela de meses considerada.

---

## 15. Estratégia de responsividade

**Mobile-first de verdade**: o CSS base é o do celular; as media queries só *adicionam* para telas
maiores.

```
≤ 640px   celular   bottom nav (5 ícones) · cards · 1 coluna · modal ocupa a tela inteira
641–1023  tablet    bottom nav · grid de 2 colunas
≥ 1024px  desktop   sidebar fixa 240px · tabelas de verdade · modal centralizado
```

Decisões:

- **Bottom nav no celular, sidebar no desktop.** Menu hambúrguer exige dois toques e fica no topo,
  longe do polegar. A barra inferior tem 5 itens (Dashboard, Alunos, Turmas, Agenda, Planos), que é
  exatamente a navegação da seção 24. Responde direto ao teste "estou na quadra com o celular".
- **Tabela vira card abaixo de 640px** (seção 26). Uma classe `.data-table` com regra
  `@media (max-width: 640px)` que muda `display` e usa `data-label` nos `<td>` — sem duplicar HTML.
- **Alvos de toque ≥ 44px**; os botões da chamada em 56px.
- `padding-bottom: env(safe-area-inset-bottom)` na bottom nav (iPhone).
- `font-size: 16px` nos inputs — abaixo disso o iOS dá zoom automático ao focar.
- Tokens em `variables.css` (seção 25): cores, tipografia, espaçamento, raios, sombras. Nenhum
  valor solto no CSS.

---

## 16. Ordem de implementação

Exatamente as 11 fases da seção 45, uma por vez, com build verificado e commit próprio ao fim de
cada uma:

| Fase | Entrega | Verificável por |
|---|---|---|
| 1 | Fundação: Vite, pastas, CSS tokens, layout, navegação, componentes | `npm run build` + navegar entre páginas vazias |
| 2 | Migrations, RLS, triggers, login/logout, proteção de páginas | logar e ser barrado sem sessão |
| 3 | Alunos: CRUD, busca, perfil, situação financeira | cadastrar aluno e vê-lo persistido |
| 4 | Turmas: CRUD, horários, matrícula | criar turma com 2 dias |
| 5 | Agenda: calendário, sessões, materialização | abrir aula do dia |
| 6 | Frequência: chamada, histórico | marcar presença e recarregar |
| 7 | Reposições | falta → agendar → concluir |
| 8 | Financeiro: mensalidade, pagamento, status | registrar pagamento e ver badge virar |
| 9 | Planejamentos | CRUD |
| 10 | Dashboard com dados reais | indicadores batendo com o banco |
| 11 | Refinamento: mobile, loading, erros, vazios, a11y, RLS review | revisão final |

Conforme seção 46, ao fim de cada fase: o que foi feito, quais arquivos, decisões relevantes,
build verificado — e **parada** até autorização.

---

## 17. Possíveis problemas e decisões que precisam ser tomadas

### 17.1 — Criação das sessões de aula ⚠️ **decisão central**
Resolvido no item 9 pela materialização preguiçosa. É a decisão mais estruturante do MVP; se você
preferir o modelo "gerar as aulas do mês com um botão", mude aqui **antes** da Fase 5.

### 17.2 — Mudar o horário de uma turma
Sessões já materializadas guardam o próprio `start_time` e **não** mudam retroativamente — o
histórico fica correto. As futuras ainda-virtuais passam a usar o horário novo. Comportamento
desejado, mas vale confirmar.

### 17.3 — Como o usuário é criado
Sem tela de cadastro; o professor é criado no painel do Supabase. **Alternativa:** uma página de
signup de 20 linhas. Custo baixo, mas expõe cadastro público — precisaria de confirmação por e-mail.
*Recomendação: sem signup no MVP.*

### 17.4 — "Alunos ativos" no dashboard
Sem coluna `active` em `students`; o indicador conta todos os alunos cadastrados. Se você quiser
arquivar aluno sem apagar o histórico, é uma coluna `active boolean` — mas é escopo novo.
*Recomendação: deixar para depois.*

### 17.5 — Janela do cálculo de atraso
O cálculo do item 14 varre do mês de cadastro até hoje. Isso significa que, se você cadastrar um
aluno hoje e não registrar o pagamento deste mês, ele fica 🔴 depois do vencimento — correto.
Mas se você importar alunos antigos, eles nascem com meses "em aberto".
**Alternativa mais branda:** considerar apenas os últimos 3 meses.
*Decisão necessária antes da Fase 8.*

### 17.6 — Excluir aluno apaga o histórico
`ON DELETE CASCADE` remove frequência, pagamentos e reposições junto. É o comportamento que a
seção 9 descreve (excluir com confirmação), mas é irreversível.
**Alternativa:** bloquear a exclusão quando houver histórico e oferecer arquivamento (depende de 17.4).
*Decisão necessária antes da Fase 3.* No mínimo, a confirmação deve dizer o que será perdido.

### 17.7 — Aluno em mais de uma turma
O modelo N:N permite. A UI do MVP mostra "turma atual" no singular. Se um aluno estiver em duas
turmas, a tela mostra as duas — só o texto da spec presume uma. Sem impacto no banco.

### 17.8 — `due_day` limitado a 28
Evita o buraco de "dia 31 em fevereiro". Se você precisar de dia 30/31, a regra passa a ser
`min(due_day, último dia do mês)` — já está prevista no pseudocódigo do item 14, mas o `CHECK`
precisaria afrouxar para 31.

### 17.9 — Chave anônima visível no bundle
É o funcionamento oficial do Supabase e a seção 32 já autoriza. Depende **inteiramente** de o RLS
estar certo — por isso a Fase 11 tem uma revisão de RLS dedicada, e vale testar com dois usuários.

### 17.10 — Sem testes automatizados
A spec não pede. As regras que mais merecem teste são `dates.js` e o cálculo de status financeiro.
*Sugestão para depois do MVP: Vitest, só nessas duas.*

### 17.11 — Offline na quadra
Se o sinal cair no meio da chamada, o toque falha e o botão reverte com aviso. Não há fila offline
(seria PWA + IndexedDB, fora do escopo). Vale saber que esse é o cenário de falha mais provável no
uso real.

### 17.12 — Fuso do servidor vs. do professor
"Hoje" é sempre calculado **no navegador** (fuso do professor), nunca com `now()` do Postgres, que
roda em UTC. Todas as comparações de vencimento e de "aulas do dia" seguem essa regra.

---

## Comparação com a seção 38 (fora do MVP)

Nada do que está na lista de exclusão foi incluído: sem WhatsApp, sem gráficos, sem integração de
pagamento, sem notificações, sem busca global, sem IA, sem permissões avançadas, sem biblioteca de
exercícios, sem avaliações.

O que a arquitetura **deixa preparado** sem custo hoje:

| Funcionalidade futura | O que já existe para ela |
|---|---|
| Múltiplos professores | `user_id` + RLS em tudo desde o primeiro dia |
| Histórico de matrícula | `class_students.active` |
| Regras de validade de reposição | falta original com data e status |
| Cobrança recorrente / geração de boletos | `payments.paid_date` nullable já modela "em aberto" |
| Relatórios e gráficos | `attendance` e `payments` são fatos com data |
| Trocar Supabase por outro backend | camada `js/api/` isolada |
