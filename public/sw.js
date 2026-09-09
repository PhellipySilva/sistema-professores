/* Service Worker — o que faz o sistema ABRIR sem internet.
 *
 * O cache de dados (alunos, turmas, agenda) é assunto do IndexedDB, em
 * js/offline/. Aqui trata-se só do outro lado do problema: sem Service Worker,
 * o navegador nem chega a executar JavaScript quando está offline — ele mostra
 * a tela de dinossauro, e o banco local mais completo do mundo fica inalcançável.
 *
 * ESTRATÉGIA: REDE PRIMEIRO, CACHE COMO REDE DE SEGURANÇA
 *
 *   Toda requisição GET do próprio site tenta a rede. Deu certo: a resposta vai
 *   para o cache e segue para a página. Falhou: entra a última cópia guardada.
 *
 *   A alternativa comum ("cache primeiro") é mais rápida, e errada aqui: ela
 *   serviria a versão antiga do sistema depois de cada publicação, e o professor
 *   veria correções que não chegaram. Velocidade não é o problema que este
 *   arquivo resolve — o problema é a quadra sem sinal.
 *
 * NOMES DE ARQUIVO COM HASH
 *
 *   O build gera /assets/dashboard-BcgryFFq.js. Um arquivo novo tem nome novo,
 *   então nunca existe conflito de versão dentro do cache: o antigo simplesmente
 *   deixa de ser pedido. A limpeza é feita pela troca de CACHE_NAME abaixo.
 */

const CACHE_NAME = 'matchphoint-v1';

/* As telas do sistema. São os únicos caminhos estáveis (o resto tem hash), e
   guardá-los na instalação garante que abrir o app offline funcione mesmo que a
   página em questão nunca tenha sido visitada. */
const APP_SHELL = [
  '/',
  '/index.html',
  '/login.html',
  '/pages/dashboard.html',
  '/pages/alunos.html',
  '/pages/aluno.html',
  '/pages/turmas.html',
  '/pages/turma.html',
  '/pages/lista-espera.html',
  '/pages/agenda.html',
  '/pages/aula.html',
  '/pages/planejamentos.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // `addAll` é tudo-ou-nada: um 404 numa página derrubaria a instalação
      // inteira. Uma a uma, o que falhar apenas não entra.
      await Promise.all(
        APP_SHELL.map((path) => cache.add(path).catch(() => {})),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // POST/PATCH/DELETE nunca entram em cache: repetir uma escrita a partir do
  // cache seria gravar duas vezes. O que é feito offline passa pela fila do
  // IndexedDB (js/offline/outbox.js), que sabe reenviar com segurança.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Só o próprio site. As chamadas ao Supabase seguem direto para a rede — a
  // resposta delas é gravada no IndexedDB pela aplicação, com a chave certa.
  if (url.origin !== self.location.origin) return;

  // Internos do servidor de desenvolvimento (HMR, cliente do Vite).
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/node_modules/.vite')) return;

  event.respondWith(networkFirst(request));
});

/* ============================================================
   Avisos de mensalidade (Web Push)
   ============================================================
   Nada aqui interfere no cache acima: são outros dois eventos, e o Service
   Worker precisava existir de qualquer forma para o push funcionar — é ele que
   o navegador acorda quando o sistema está fechado.

   O QUE CHEGA É SÓ TEXTO PRONTO

     A mensagem vem montada de supabase/functions/notificar-mensalidades:
     { title, body, url, tag }. Este arquivo não sabe o que é mensalidade, não
     consulta banco nenhum e não decide nada — e é por isso que ele nunca terá
     um valor em reais para vazar na tela bloqueada.

   `tag` FAZ O AVISO NOVO SUBSTITUIR O ANTERIOR

     Todos os atrasos usam a mesma tag. Três dias sem dar baixa geram um card na
     tela bloqueada, não três — e ele estará sempre com a contagem de hoje. */

self.addEventListener('push', (event) => {
  const payload = readPushData(event);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      // O ícone do próprio app: o professor reconhece de quem é o aviso antes
      // de ler a primeira palavra.
      icon: '/icons/icon-256.png',
      badge: '/icons/icon-256.png',
      tag: payload.tag,
      // Substitui o card anterior E avisa de novo. Sem `renotify`, o aviso de
      // hoje entraria mudo por cima do de ontem que ninguém dispensou — que é
      // justamente o professor que mais precisa ser alcançado.
      renotify: true,
      data: { url: payload.url },
    }),
  );
});

/* Clicar abre a página do aviso: o aluno, quando é de um só, ou a área
   financeira da dashboard, quando o aviso agrupou vários.

   Antes de abrir uma aba nova, procura uma já aberta do sistema e a reaproveita
   — o professor costuma estar com o MatchPhoint aberto, e acumular abas é a
   forma mais rápida de tornar a notificação um estorvo. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = event.notification.data?.url || '/pages/dashboard.html';

  event.waitUntil(
    (async () => {
      const url = new URL(target, self.location.origin).href;
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) await client.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

/* Push sem corpo legível não pode virar notificação vazia: o navegador exige
   que TODO push autorizado mostre algo (userVisibleOnly), e um card em branco
   seria pior do que uma frase genérica. */
function readPushData(event) {
  const fallback = {
    title: 'MatchPhoint',
    body: 'Você tem um aviso de mensalidade.',
    url: '/pages/dashboard.html',
    tag: 'mensalidade',
  };

  if (!event.data) return fallback;

  try {
    return { ...fallback, ...event.data.json() };
  } catch {
    return fallback;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);

    // Resposta parcial (206) ou opaca não pode ser guardada de forma útil.
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    // Navegação sem cópia daquela página: a porta de entrada abre e o sistema
    // decide para onde ir. Melhor que a tela de erro do navegador.
    if (request.mode === 'navigate') {
      const fallback = (await cache.match('/index.html')) ?? (await cache.match('/'));
      if (fallback) return fallback;
    }

    throw error;
  }
}
