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
