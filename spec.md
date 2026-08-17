# SISTEMA DE GESTÃO DE AULAS DE BEACH TENNIS
## MVP — HTML + CSS + JavaScript + Supabase

Quero desenvolver um MVP funcional de uma plataforma web para gerenciamento das minhas aulas de Beach Tennis.

Este projeto também será utilizado como projeto de estudo. Portanto, quero uma arquitetura profissional, porém simples o suficiente para que eu consiga entender, estudar e modificar o código.

IMPORTANTE:

- Não utilizar React neste MVP.
- Não utilizar Vue.
- Não utilizar Angular.
- Não utilizar Tailwind CSS.
- Não utilizar frameworks de interface.
- Não transformar o projeto em uma aplicação complexa desnecessariamente.
- Utilizar HTML, CSS e JavaScript puro.
- Utilizar JavaScript moderno (ES6+), módulos ES6 e boas práticas.
- Utilizar Supabase como backend e banco de dados.
- O sistema deve ser funcional e persistir dados reais no Supabase.
- Não criar apenas um mockup ou protótipo visual.

O objetivo é construir uma base pequena, sólida e funcional que possa ser expandida futuramente.

==================================================
1. VISÃO DO MVP
==================================================

O sistema será utilizado inicialmente por mim, como professor de Beach Tennis.

Neste primeiro momento quero controlar apenas:

1. Login
2. Alunos
3. Mensalidades
4. Turmas
5. Calendário e frequência
6. Reposições
7. Planejamento de aulas
8. Dashboard básico

Não implementar funcionalidades que não estejam neste escopo.

A plataforma deve ser simples, rápida e especialmente fácil de utilizar pelo celular durante as aulas.

A pergunta principal para orientar a UX deve ser:

"Se eu estiver na quadra, com pouco tempo e usando o celular, consigo realizar essa tarefa rapidamente?"

Se a resposta for não, simplifique o fluxo.

==================================================
2. TECNOLOGIAS
==================================================

Utilizar:

Frontend:
- HTML5
- CSS3
- JavaScript ES6+

Backend:
- Supabase

Banco:
- PostgreSQL através do Supabase

Autenticação:
- Supabase Auth

Versionamento:
- Git
- GitHub

Deploy:
- Vercel

Bibliotecas permitidas:

- @supabase/supabase-js
- Lucide Icons, caso necessário
- date-fns somente se houver uma necessidade real para manipulação de datas

Não adicionar bibliotecas sem necessidade.

Evitar dependências excessivas.

Não utilizar React, Tailwind, Bootstrap ou outros frameworks de frontend.

==================================================
3. AMBIENTE DE DESENVOLVIMENTO
==================================================

Utilizar uma estrutura compatível com Vercel.

Pode utilizar Vite apenas como ferramenta de desenvolvimento e build, utilizando o template Vanilla JavaScript.

O código da aplicação deve continuar sendo HTML, CSS e JavaScript puro.

Utilizar:

- ES Modules
- import/export
- async/await
- fetch quando necessário
- módulos separados por responsabilidade

Não criar um único arquivo JavaScript gigante.

==================================================
4. OBJETIVO ARQUITETURAL
==================================================

Quero uma arquitetura simples e organizada.

Separar claramente:

- estrutura HTML;
- estilos CSS;
- lógica de negócio;
- acesso ao Supabase;
- manipulação da interface;
- autenticação;
- utilitários.

Evitar misturar SQL, regras de negócio e manipulação do DOM no mesmo arquivo.

O projeto deve ser fácil de entender para alguém que está estudando JavaScript.

==================================================
5. ESTRUTURA DE PASTAS
==================================================

Utilizar uma estrutura semelhante a:

/
├── index.html
├── login.html
│
├── pages/
│   ├── dashboard.html
│   ├── alunos.html
│   ├── aluno.html
│   ├── turmas.html
│   ├── turma.html
│   ├── agenda.html
│   └── planejamentos.html
│
├── css/
│   ├── reset.css
│   ├── variables.css
│   ├── base.css
│   ├── components.css
│   ├── layout.css
│   └── responsive.css
│
├── js/
│   ├── app.js
│   ├── auth.js
│   ├── supabase.js
│   │
│   ├── components/
│   │   ├── navbar.js
│   │   ├── sidebar.js
│   │   ├── modal.js
│   │   ├── toast.js
│   │   └── confirm-dialog.js
│   │
│   ├── dashboard/
│   │   └── dashboard.js
│   │
│   ├── alunos/
│   │   ├── alunos.js
│   │   ├── aluno.js
│   │   └── alunos-ui.js
│   │
│   ├── turmas/
│   │   ├── turmas.js
│   │   ├── turma.js
│   │   └── turmas-ui.js
│   │
│   ├── agenda/
│   │   ├── agenda.js
│   │   └── frequencia.js
│   │
│   ├── financeiro/
│   │   └── financeiro.js
│   │
│   ├── reposicoes/
│   │   └── reposicoes.js
│   │
│   ├── planejamentos/
│   │   └── planejamentos.js
│   │
│   └── utils/
│       ├── dates.js
│       ├── formatters.js
│       └── validators.js
│
├── assets/
│   ├── images/
│   └── icons/
│
├── supabase/
│   └── migrations/
│
├── .env.example
├── .gitignore
├── package.json
└── README.md

A estrutura pode ser ajustada caso exista uma solução melhor, mas qualquer alteração importante deve ser explicada.

==================================================
6. AUTENTICAÇÃO
==================================================

Implementar login utilizando Supabase Auth.

Inicialmente haverá apenas um professor utilizando o sistema, mas a arquitetura deve permitir múltiplos usuários futuramente.

Implementar:

- login;
- logout;
- persistência de sessão;
- proteção das páginas;
- redirecionamento para login quando não autenticado;
- redirecionamento para dashboard após login;
- tratamento de erros de autenticação.

Não criar sistema complexo de permissões neste MVP.

Utilizar Supabase Auth como fonte oficial de autenticação.

Não armazenar senha manualmente no banco.

==================================================
7. PERFIL DO USUÁRIO
==================================================

Criar uma tabela de perfil relacionada ao usuário autenticado.

Tabela:

profiles

Campos mínimos:

- id
- name
- email
- created_at
- updated_at

O id do profile deve estar relacionado ao usuário do Supabase Auth.

A arquitetura deve permitir que cada professor possua seus próprios alunos, turmas, pagamentos etc.

==================================================
8. MÓDULO DE ALUNOS
==================================================

Criar uma página de alunos.

Funcionalidades:

- listar alunos;
- pesquisar alunos;
- cadastrar aluno;
- editar aluno;
- excluir aluno;
- visualizar informações do aluno.

No MVP, o aluno terá somente:

- nome completo;
- telefone;
- categoria;
- responsável.

Categorias:

- Kids
- Adulto

Campos:

name
phone
category
guardian_name

Também utilizar:

- id
- user_id
- created_at
- updated_at

Não adicionar campos desnecessários neste momento.

Não adicionar:

- foto;
- data de nascimento;
- nível;
- observações;
- endereço;
- documentos;
- outros campos.

Esses campos poderão ser adicionados futuramente.

==================================================
9. LISTAGEM DE ALUNOS
==================================================

A página deve mostrar os alunos cadastrados em cards ou tabela adaptada para desktop e mobile.

Cada aluno deve mostrar:

- nome;
- categoria;
- telefone;
- responsável;
- situação da mensalidade.

Exemplo:

João Silva
Adulto
(82) 99999-9999
Mensalidade: Em dia

Maria Silva
Kids
Responsável: Ana Silva
Mensalidade: Atrasada

Permitir:

- visualizar;
- editar;
- excluir.

Ao excluir, solicitar confirmação.

Criar estado vazio quando não houver alunos.

Exemplo:

"Você ainda não possui alunos cadastrados."

Botão:

"+ Adicionar aluno"

==================================================
10. PERFIL DO ALUNO
==================================================

Ao clicar em um aluno, abrir sua página detalhada.

Mostrar:

- nome;
- categoria;
- telefone;
- responsável;
- situação da mensalidade;
- turma atual;
- histórico básico de frequência;
- histórico básico de reposições;
- histórico de pagamentos.

Não criar uma página excessivamente complexa.

A informação deve ser apresentada de forma clara e rápida.

==================================================
11. MENSALIDADES
==================================================

Cada aluno deve possuir informações básicas relacionadas à mensalidade.

Criar:

- valor da mensalidade;
- dia de vencimento.

Esses dados podem ficar relacionados ao próprio aluno ou em uma tabela financeira separada, desde que a arquitetura escolhida seja consistente e permita expansão futura.

Criar tabela:

payments

Cada pagamento deve possuir:

- id
- user_id
- student_id
- amount
- reference_date ou referência equivalente
- due_date
- paid_date
- status
- created_at

O modelo pode ser ajustado caso exista uma estrutura melhor.

==================================================
12. STATUS FINANCEIRO
==================================================

O sistema deve mostrar no aluno sua situação financeira.

Neste MVP existem apenas dois status principais:

🟢 Em dia

🔴 Atrasado

Em dia:

O pagamento referente ao período atual foi realizado.

Atrasado:

O vencimento passou e o pagamento correspondente não foi realizado.

A lógica deve ser calculada com base nos dados reais do banco.

Não utilizar status manual se for possível calcular corretamente a situação.

Não implementar:

- cobrança automática;
- Pix;
- boleto;
- cartão;
- integração bancária;
- API de pagamentos;
- cobrança recorrente;
- WhatsApp.

Tudo isso fica para versões futuras.

==================================================
13. REGISTRAR PAGAMENTO
==================================================

Criar uma ação:

"Registrar pagamento"

Permitir informar:

- valor;
- data de pagamento;
- referência/período;
- vencimento.

Após registrar:

- salvar no Supabase;
- atualizar a situação financeira;
- atualizar o histórico do aluno;
- refletir a alteração no Dashboard.

Exemplo:

Agosto/2026
R$150
Pago em 10/08

==================================================
14. MÓDULO DE TURMAS
==================================================

Criar uma página de turmas.

Cada turma deve possuir:

- nome;
- categoria;
- dia(s) da semana;
- horário;
- duração;
- alunos.

Categorias:

- Kids
- Adulto

Exemplo:

Kids Iniciante
Kids
Segunda e Quarta
17:00
60 minutos

Permitir:

- criar turma;
- editar turma;
- excluir turma;
- visualizar turma;
- adicionar aluno;
- remover aluno.

==================================================
15. RELACIONAMENTO ENTRE ALUNOS E TURMAS
==================================================

Não duplicar os dados do aluno dentro da tabela de turmas.

Criar relacionamento muitos-para-muitos através de uma tabela intermediária.

Exemplo:

class_students

Campos:

- id
- class_id
- student_id
- created_at
- active

Isso permitirá:

- um aluno mudar de turma;
- uma turma ter vários alunos;
- futuramente controlar histórico de matrícula.

==================================================
16. HORÁRIOS DAS TURMAS
==================================================

Uma turma deve possuir dia(s) da semana e horário.

Se tecnicamente for melhor, utilizar uma tabela separada:

class_schedules

Campos:

- id
- class_id
- day_of_week
- start_time
- end_time

Isso permitirá que uma mesma turma tenha mais de um dia da semana.

Exemplo:

Kids Iniciante

Segunda — 17:00
Quarta — 17:00

Não criar uma estrutura que limite desnecessariamente uma turma a apenas um dia.

==================================================
17. CALENDÁRIO / AGENDA
==================================================

Criar uma página de agenda.

Objetivo:

Visualizar as aulas programadas e registrar a frequência dos alunos.

A agenda deve permitir:

- visualizar por mês;
- selecionar uma data;
- visualizar as aulas daquela data;
- abrir uma aula;
- realizar chamada.

Priorizar simplicidade.

Não criar inicialmente uma agenda extremamente complexa.

==================================================
18. SESSÕES DE AULA
==================================================

Uma turma possui um horário recorrente.

Porém, cada aula realizada em uma data específica precisa ser representada individualmente.

Criar uma entidade semelhante a:

class_sessions

Campos:

- id
- user_id
- class_id
- session_date
- start_time
- end_time
- status
- created_at

Isso permitirá representar:

Turma:
Kids Iniciante

Aula:
17/08/2026 — 17:00

Aula:
19/08/2026 — 17:00

Aula:
24/08/2026 — 17:00

Não registrar frequência diretamente apenas na turma.

A frequência deve estar vinculada a uma sessão específica.

==================================================
19. FREQUÊNCIA
==================================================

Ao abrir uma sessão de aula, mostrar todos os alunos matriculados na turma.

Para cada aluno permitir:

- Presente
- Falta
- Reposição

Interface:

JOÃO SILVA

[ PRESENTE ]
[ FALTA ]
[ REPOSIÇÃO ]

Os botões devem ser grandes e fáceis de utilizar no celular.

Criar tabela:

attendance

Campos mínimos:

- id
- user_id
- session_id
- student_id
- status
- notes
- created_at
- updated_at

Status:

- present
- absent
- makeup

Salvar no Supabase.

Permitir alterar a presença posteriormente.

==================================================
20. HISTÓRICO DE FREQUÊNCIA
==================================================

No perfil do aluno, mostrar um histórico básico.

Exemplo:

Agosto/2026

12 aulas
10 presentes
2 faltas

83% de frequência

Não é necessário criar gráficos neste momento.

O cálculo deve ser baseado nos registros reais de attendance.

==================================================
21. REPOSIÇÕES
==================================================

Quando um aluno faltar, deve ser possível registrar uma reposição.

Uma reposição deve relacionar:

- aluno;
- aula original;
- data da falta;
- aula/data da reposição;
- status.

Criar tabela:

makeups

Campos mínimos:

- id
- user_id
- student_id
- original_session_id
- makeup_session_id
- original_date
- makeup_date
- status
- notes
- created_at
- updated_at

Status:

- pending
- scheduled
- completed

Fluxo:

1. João faltou em 17/08.
2. A falta fica registrada.
3. Professor cria uma reposição.
4. Escolhe a aula/data da reposição.
5. A reposição fica agendada.
6. Quando realizada, muda para "completed".

Não implementar neste MVP:

- regras complexas de validade;
- limite de reposições;
- expiração automática;
- cobrança;
- políticas personalizadas.

A arquitetura deve permitir adicionar essas regras futuramente.

==================================================
22. PLANEJAMENTO DE AULAS
==================================================

Criar uma área simples para planejamento de aulas.

Cada planejamento deve possuir:

- título;
- descrição;
- data.

Tabela:

lesson_plans

Campos:

- id
- user_id
- title
- description
- lesson_date
- created_at
- updated_at

Permitir:

- criar;
- editar;
- visualizar;
- excluir.

Exemplo:

Título:

"Trabalho de devolução"

Descrição:

"Trabalhar devolução cruzada, deslocamento lateral e construção de ponto."

Data:

18/08/2026

Não criar ainda:

- biblioteca de exercícios;
- categorias;
- editor de blocos;
- vídeos;
- imagens;
- avaliação;
- evolução;
- integração com exercícios.

Essas funcionalidades pertencem a versões futuras.

==================================================
23. DASHBOARD
==================================================

Criar um Dashboard simples.

Mostrar informações úteis:

- total de alunos ativos;
- total de turmas;
- aulas do dia;
- alunos com mensalidade atrasada;
- próximos vencimentos.

Criar atalhos:

- + Adicionar aluno
- + Adicionar turma
- Abrir agenda
- Registrar pagamento
- + Planejar aula

Não criar gráficos apenas para preencher espaço.

O Dashboard deve ser baseado nos dados reais do Supabase.

==================================================
24. NAVEGAÇÃO
==================================================

Criar navegação principal:

Dashboard
Alunos
Turmas
Agenda
Planejamentos

No desktop:

Utilizar sidebar.

No mobile:

Utilizar uma navegação adaptada e fácil de tocar.

Não criar dezenas de itens no menu.

==================================================
25. DESIGN
==================================================

Criar uma interface:

- moderna;
- limpa;
- esportiva;
- profissional;
- minimalista;
- responsiva.

A aparência deve transmitir:

- esporte;
- organização;
- performance;
- tecnologia;
- simplicidade.

Utilizar CSS puro.

Criar variáveis CSS para:

- cores;
- tipografia;
- espaçamentos;
- bordas;
- raios;
- sombras.

Exemplo:

:root {
    --color-primary: ...;
    --color-background: ...;
    --color-surface: ...;
    --color-text: ...;
    --color-muted: ...;
    --color-success: ...;
    --color-danger: ...;
    --radius-sm: ...;
    --radius-md: ...;
    --radius-lg: ...;
}

Não espalhar valores aleatórios pelo CSS.

==================================================
26. RESPONSIVIDADE
==================================================

A aplicação deve funcionar bem em:

- smartphone;
- tablet;
- notebook;
- desktop.

Prioridade:

Smartphone.

Principalmente:

- cadastro de aluno;
- consulta de aluno;
- abertura de turma;
- chamada;
- registro de reposição;
- consulta de agenda.

Os elementos de toque devem possuir tamanho adequado.

Evitar tabelas largas no celular.

Transformar tabelas em cards ou listas quando necessário.

==================================================
27. COMPONENTES DE INTERFACE
==================================================

Mesmo utilizando HTML/CSS/JS puro, criar componentes reutilizáveis através de funções JavaScript ou templates.

Criar componentes como:

- Modal
- Toast
- Button
- Input
- Select
- Card
- Badge
- EmptyState
- Loading
- ConfirmDialog
- Sidebar
- Header

Não duplicar o mesmo HTML em várias páginas quando puder criar uma função reutilizável.

==================================================
28. MODAIS
==================================================

Utilizar modais para ações rápidas quando fizer sentido.

Exemplos:

- adicionar aluno;
- editar aluno;
- adicionar turma;
- registrar pagamento;
- criar planejamento;
- registrar reposição.

Não criar navegação desnecessária para tarefas simples.

==================================================
29. ESTADOS DE LOADING
==================================================

Implementar estados de:

- carregando;
- sucesso;
- erro;
- vazio.

Exemplos:

"Carregando alunos..."

"Aluno cadastrado com sucesso."

"Não foi possível carregar os alunos."

"Você ainda não possui alunos cadastrados."

Utilizar skeletons quando fizer sentido, mas não exagerar.

==================================================
30. TRATAMENTO DE ERROS
==================================================

Todos os acessos ao Supabase devem possuir tratamento de erro.

Não deixar erros silenciosos.

Não mostrar mensagens técnicas para o usuário.

Exemplo:

Em vez de:

"PostgrestError: duplicate key value..."

mostrar:

"Não foi possível salvar o aluno. Tente novamente."

Os detalhes técnicos devem continuar disponíveis no console durante o desenvolvimento.

==================================================
31. CONFIRMAÇÕES
==================================================

Antes de excluir:

- aluno;
- turma;
- planejamento;
- pagamento, caso seja permitido excluir;

mostrar confirmação.

Exemplo:

"Tem certeza que deseja excluir este aluno?"

Não excluir dados importantes sem confirmação.

==================================================
32. SEGURANÇA
==================================================

Utilizar Supabase Auth.

Implementar Row Level Security (RLS) em todas as tabelas que contenham dados do usuário.

Cada professor deve acessar somente seus próprios:

- alunos;
- turmas;
- horários;
- aulas;
- frequências;
- reposições;
- pagamentos;
- planejamentos.

Nunca confiar apenas na interface para segurança.

A segurança deve ser aplicada no banco através de RLS.

Não colocar service role key ou qualquer chave secreta no frontend.

Utilizar variáveis de ambiente.

A chave pública/anônima do Supabase pode ser utilizada no frontend conforme o funcionamento oficial do Supabase, desde que o RLS esteja corretamente configurado.

==================================================
33. BANCO DE DADOS
==================================================

Criar migrations SQL organizadas.

Entidades principais:

profiles
students
classes
class_schedules
class_students
class_sessions
attendance
makeups
payments
lesson_plans

Todos os dados pertencentes a um professor devem possuir uma forma segura de relacionamento com o usuário autenticado.

Utilizar:

- primary keys;
- foreign keys;
- unique constraints quando necessário;
- check constraints quando fizer sentido;
- indexes quando necessários;
- created_at;
- updated_at.

Evitar duplicação.

==================================================
34. RELACIONAMENTOS
==================================================

Relacionamentos esperados:

User
│
├── Students
├── Classes
├── Payments
├── Class Sessions
└── Lesson Plans

Class
│
├── Class Schedules
├── Class Students
└── Class Sessions

Student
│
├── Class Students
├── Payments
├── Attendance
└── Makeups

Class Session
│
├── Attendance
└── Makeups

Não implementar relacionamentos artificiais.

==================================================
35. DATAS E HORÁRIOS
==================================================

Ter cuidado especial com datas.

A aplicação será utilizada no Brasil.

Evitar problemas de timezone.

Datas de aulas devem representar corretamente o dia local da aula.

Horários devem ser armazenados de maneira consistente.

Não converter datas desnecessariamente para UTC de maneira que altere o dia apresentado ao usuário.

Centralizar funções de:

- formatação de data;
- formatação de horário;
- comparação de datas;
- obtenção do dia da semana.

==================================================
36. FINANCEIRO
==================================================

Para valores monetários, evitar cálculos com números de ponto flutuante no frontend.

No banco, utilizar um tipo adequado para valores monetários, como numeric/decimal, ou armazenar valores em centavos de forma consistente.

Definir uma estratégia e utilizá-la em todo o projeto.

==================================================
37. DADOS DE TESTE
==================================================

Durante o desenvolvimento, criar alguns dados fictícios somente quando necessário para testar.

Exemplo:

- 5 a 10 alunos;
- 2 ou 3 turmas;
- algumas aulas;
- alguns pagamentos;
- algumas faltas;
- algumas reposições;
- alguns planejamentos.

Os dados de teste devem ser claramente identificados.

Criar uma forma simples de removê-los.

Não utilizar dados fictícios para fingir que uma funcionalidade está funcionando.

==================================================
38. FORA DO MVP
==================================================

NÃO implementar agora:

- WhatsApp;
- integração com WhatsApp API;
- biblioteca de exercícios;
- avaliações;
- evolução;
- anotações;
- notificações;
- busca global;
- relatórios avançados;
- gráficos complexos;
- integração de pagamentos;
- Pix;
- boleto;
- cobrança automática;
- múltiplos professores com permissões avançadas;
- painel administrativo;
- controle de estoque;
- controle financeiro empresarial;
- assinatura;
- planos;
- pagamentos online;
- funcionalidades de IA.

Essas funcionalidades podem fazer parte de versões futuras.

==================================================
39. CÓDIGO
==================================================

Quero código simples e legível.

Como este projeto também será utilizado para estudo:

- utilizar nomes de variáveis claros;
- utilizar funções pequenas;
- evitar funções gigantes;
- evitar código duplicado;
- evitar abstrações desnecessárias;
- utilizar comentários somente quando realmente ajudarem;
- utilizar async/await;
- utilizar try/catch;
- separar responsabilidades.

Não transformar tudo em uma arquitetura excessivamente abstrata.

Quero conseguir abrir um arquivo e entender o que está acontecendo.

==================================================
40. JAVASCRIPT
==================================================

Utilizar JavaScript moderno.

Preferir:

- const;
- let;
- arrow functions quando fizer sentido;
- destructuring;
- template literals;
- modules;
- import/export;
- async/await;
- optional chaining quando útil;
- funções reutilizáveis.

Evitar:

- var;
- callbacks aninhados desnecessariamente;
- funções gigantes;
- variáveis com nomes genéricos;
- manipulação excessiva do DOM espalhada pelo projeto.

==================================================
41. ACESSIBILIDADE
==================================================

Implementar o básico de acessibilidade:

- labels nos inputs;
- botões com textos claros;
- alt em imagens;
- foco visível;
- contraste adequado;
- navegação razoável pelo teclado;
- elementos interativos semanticamente corretos.

==================================================
42. PERFORMANCE
==================================================

Priorizar simplicidade e performance.

Não adicionar bibliotecas sem necessidade.

Evitar:

- requisições duplicadas;
- consultas desnecessárias ao Supabase;
- renderizações excessivas;
- arquivos enormes;
- imagens pesadas.

Buscar somente os dados necessários para cada tela.

==================================================
43. GIT
==================================================

Organizar o projeto com Git.

Criar commits pequenos e descritivos.

Exemplos:

feat: criar autenticação
feat: adicionar cadastro de alunos
feat: criar gerenciamento de turmas
feat: implementar frequência
feat: adicionar pagamentos

Não fazer um único commit gigantesco com todo o projeto.

==================================================
44. DOCUMENTAÇÃO
==================================================

Criar um README.md contendo:

- objetivo do projeto;
- tecnologias;
- como instalar;
- como configurar;
- variáveis de ambiente;
- como executar localmente;
- como configurar Supabase;
- como executar migrations;
- como fazer build;
- como fazer deploy na Vercel;
- estrutura de pastas;
- funcionalidades atuais;
- funcionalidades futuras.

Criar também:

.env.example

Nunca versionar o arquivo .env real.

==================================================
45. DESENVOLVIMENTO POR ETAPAS
==================================================

Não implementar tudo de uma vez.

Seguir exatamente esta ordem:

FASE 1 — Fundação

- criar projeto;
- configurar Vite Vanilla;
- configurar HTML;
- configurar CSS;
- configurar JavaScript;
- configurar Supabase;
- configurar variáveis de ambiente;
- criar estrutura de pastas;
- criar layout base;
- criar navegação;
- criar componentes básicos.

FASE 2 — Banco e autenticação

- criar migrations;
- criar tabelas;
- criar relacionamentos;
- criar RLS;
- configurar Supabase Auth;
- criar login;
- criar logout;
- proteger páginas.

FASE 3 — Alunos

- listagem;
- busca;
- cadastro;
- edição;
- exclusão;
- perfil;
- situação financeira.

FASE 4 — Turmas

- criação;
- edição;
- exclusão;
- horários;
- associação de alunos;
- remoção de alunos;
- visualização da turma.

FASE 5 — Agenda

- calendário;
- sessões de aula;
- geração/visualização das aulas;
- abertura da sessão.

FASE 6 — Frequência

- lista de alunos da aula;
- presente;
- falta;
- reposição;
- salvar;
- histórico.

FASE 7 — Reposições

- criar reposição;
- vincular falta original;
- escolher aula/data;
- status;
- histórico.

FASE 8 — Financeiro

- valor da mensalidade;
- vencimento;
- registro de pagamento;
- histórico;
- status em dia/atrasado.

FASE 9 — Planejamentos

- criar;
- editar;
- visualizar;
- excluir;
- título;
- descrição;
- data.

FASE 10 — Dashboard

- conectar indicadores aos dados reais;
- atalhos;
- aulas do dia;
- atrasados;
- próximos vencimentos.

FASE 11 — Refinamento

- responsividade;
- mobile;
- loading;
- erros;
- estados vazios;
- acessibilidade;
- performance;
- revisão de segurança;
- revisão de RLS;
- limpeza do código.

==================================================
46. REGRA DE IMPLEMENTAÇÃO
==================================================

Antes de cada fase:

1. Explique brevemente o que será construído.
2. Explique quais arquivos serão criados ou alterados.
3. Explique se houver alguma decisão arquitetural importante.
4. Implemente somente aquela fase.
5. Execute/verifique o projeto.
6. Corrija erros encontrados.
7. Verifique o build.
8. Informe o que foi concluído.

Não avançar automaticamente para a próxima fase sem minha autorização.

==================================================
47. PRIMEIRO PASSO
==================================================

Neste momento NÃO quero que você implemente o sistema.

Primeiro quero somente a análise arquitetural.

Leia também @SPEC.md como referência geral do produto.

Compare a visão completa da SPEC com o escopo reduzido deste MVP.

Não implemente funcionalidades que ficaram fora do MVP.

Apresente:

1. Arquitetura geral.
2. Estrutura de pastas.
3. Modelo do banco.
4. Relacionamentos.
5. Estratégia de RLS.
6. Fluxo de autenticação.
7. Fluxo de alunos.
8. Fluxo de turmas.
9. Fluxo de agenda e frequência.
10. Fluxo de reposições.
11. Fluxo financeiro.
12. Fluxo de planejamentos.
13. Estratégia para datas e horários.
14. Estratégia para status de mensalidade.
15. Estratégia de responsividade.
16. Ordem de implementação.
17. Possíveis problemas ou decisões que precisam ser tomadas.

Não comece a programar.

Aguarde minha autorização depois de apresentar a arquitetura.

==================================================
48. PRINCÍPIO FINAL
==================================================

Este é um MVP.

Não quero construir o sistema completo agora.

Quero construir primeiro uma aplicação pequena, funcional, organizada e realmente utilizável.

Prefira sempre:

Simplicidade
+
Código compreensível
+
Dados reais
+
Segurança
+
Boa UX

em vez de:

Complexidade
+
Abstrações desnecessárias
+
Bibliotecas excessivas
+
Funcionalidades que ainda não serão utilizadas.

O sistema deve ser simples para o usuário, mas possuir uma base técnica correta para crescer no futuro.

A experiência principal deve funcionar muito bem no celular durante uma aula de Beach Tennis.