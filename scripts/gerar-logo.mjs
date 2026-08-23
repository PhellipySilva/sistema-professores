/* Gera os arquivos da marca a partir de img/logotipo-sistema.png.
 *
 * O original tem 1774x887 e 755 kB — peso demais para carregar em toda página
 * de um sistema usado no celular, à beira da quadra. Este script apara a margem
 * branca e reduz a resolução, produzindo:
 *
 *   assets/brand/matchphoint.png       lockup inteiro (menu, login, carregando)
 *   assets/brand/matchphoint-mark.png  só o monograma, quadrado (favicon)
 *
 * NÃO desenha nada novo: recorta e redimensiona o arquivo que já existe.
 *
 * Sem dependência e sem navegador — PNG é zlib mais um cabeçalho, e o `node:zlib`
 * já vem instalado. Rode só quando a logo mudar; o resultado é versionado, então
 * o build normal não depende disto.
 *
 *   node scripts/gerar-logo.mjs
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const ENTRADA = 'img/logotipo-sistema.png';
const BRANCO = 244; // acima disto, o pixel conta como fundo
const LARGURA_LOCKUP = 440;
const LADO_MARCA = 256;

/* ============================================================
   PNG: ler
   ============================================================ */

/** @returns {{largura: number, altura: number, canais: number, pixels: Buffer}} */
function lerPng(caminho) {
  const arquivo = readFileSync(caminho);

  if (arquivo.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`${caminho} não é um PNG.`);
  }

  let largura = 0;
  let altura = 0;
  let canais = 0;
  const pedacos = [];

  // Percorre os chunks: 4 bytes de tamanho, 4 de tipo, o dado, 4 de CRC.
  for (let pos = 8; pos < arquivo.length; ) {
    const tamanho = arquivo.readUInt32BE(pos);
    const tipo = arquivo.toString('ascii', pos + 4, pos + 8);
    const dado = arquivo.subarray(pos + 8, pos + 8 + tamanho);

    if (tipo === 'IHDR') {
      largura = dado.readUInt32BE(0);
      altura = dado.readUInt32BE(4);
      const profundidade = dado[8];
      const tipoCor = dado[9];
      const entrelacado = dado[12];

      if (profundidade !== 8 || entrelacado !== 0 || (tipoCor !== 2 && tipoCor !== 6)) {
        throw new Error(
          `PNG em formato não suportado (profundidade ${profundidade}, cor ${tipoCor}, ` +
            `entrelaçado ${entrelacado}). Salve como RGB ou RGBA de 8 bits, sem entrelaçamento.`,
        );
      }
      canais = tipoCor === 6 ? 4 : 3;
    } else if (tipo === 'IDAT') {
      pedacos.push(dado);
    } else if (tipo === 'IEND') {
      break;
    }

    pos += 12 + tamanho;
  }

  const bruto = inflateSync(Buffer.concat(pedacos));
  return { largura, altura, canais, pixels: desfiltrar(bruto, largura, altura, canais) };
}

/**
 * Desfaz os filtros de linha do PNG.
 *
 * Cada linha começa com um byte dizendo como ela foi codificada em relação à
 * linha de cima e ao pixel da esquerda. É a etapa que transforma o fluxo
 * inflado em pixels de verdade.
 */
function desfiltrar(bruto, largura, altura, canais) {
  const passo = largura * canais;
  const saida = Buffer.alloc(passo * altura);

  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (passo + 1)];
    const linha = bruto.subarray(y * (passo + 1) + 1, (y + 1) * (passo + 1));
    const destino = y * passo;
    const acima = destino - passo;

    for (let x = 0; x < passo; x++) {
      const esquerda = x >= canais ? saida[destino + x - canais] : 0;
      const cima = y > 0 ? saida[acima + x] : 0;
      const diagonal = y > 0 && x >= canais ? saida[acima + x - canais] : 0;
      let valor = linha[x];

      if (filtro === 1) valor += esquerda;
      else if (filtro === 2) valor += cima;
      else if (filtro === 3) valor += (esquerda + cima) >> 1;
      else if (filtro === 4) valor += paeth(esquerda, cima, diagonal);

      saida[destino + x] = valor & 0xff;
    }
  }

  return saida;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/* ============================================================
   PNG: escrever
   ============================================================ */

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return tabela;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABELA_CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dado) {
  const cabecalho = Buffer.alloc(8);
  cabecalho.writeUInt32BE(dado.length, 0);
  cabecalho.write(tipo, 4, 'ascii');

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(tipo, 'ascii'), dado])), 0);

  return Buffer.concat([cabecalho, dado, crc]);
}

/** Escreve RGB de 8 bits, sem filtro de linha (filtro 0). */
function escreverPng(caminho, largura, altura, pixels) {
  const passo = largura * 3;
  const comFiltro = Buffer.alloc((passo + 1) * altura);

  for (let y = 0; y < altura; y++) {
    comFiltro[y * (passo + 1)] = 0;
    pixels.copy(comFiltro, y * (passo + 1) + 1, y * passo, (y + 1) * passo);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 2; // RGB

  const arquivo = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(comFiltro, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  writeFileSync(caminho, arquivo);
  return arquivo.length;
}

/* ============================================================
   Recorte e redução
   ============================================================ */

/**
 * Média de área (box filter): cada pixel de saída é a média do retângulo de
 * origem que ele cobre. Para reduzir uma arte chapada como esta logo, é o que
 * dá borda limpa — pegar "o pixel mais próximo" serrilharia as curvas.
 */
function recortarEReduzir(origem, recorte, destinoW, destinoH, moldura = null) {
  const { largura, canais, pixels } = origem;

  // Sem moldura, o recorte preenche a saída inteira. Com moldura, ele é
  // desenhado dentro dela e o resto fica branco — é assim que o monograma, que
  // é mais largo do que alto, cabe num quadrado sem ser esticado nem cortado.
  const area = moldura ?? { x: 0, y: 0, largura: destinoW, altura: destinoH };
  const saida = Buffer.alloc(destinoW * destinoH * 3, 0xff);

  const escalaX = recorte.largura / area.largura;
  const escalaY = recorte.altura / area.altura;

  for (let y = 0; y < area.altura; y++) {
    const y0 = recorte.y + y * escalaY;
    const y1 = y0 + escalaY;

    for (let x = 0; x < area.largura; x++) {
      const x0 = recorte.x + x * escalaX;
      const x1 = x0 + escalaX;

      let somaR = 0;
      let somaG = 0;
      let somaB = 0;
      let total = 0;

      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          // Fora da imagem = branco, que é o fundo da própria logo.
          if (sx < 0 || sy < 0 || sx >= largura || sy >= origem.altura) {
            somaR += 255;
            somaG += 255;
            somaB += 255;
          } else {
            const i = (sy * largura + sx) * canais;
            somaR += pixels[i];
            somaG += pixels[i + 1];
            somaB += pixels[i + 2];
          }
          total += 1;
        }
      }

      const destino = ((y + area.y) * destinoW + (x + area.x)) * 3;
      saida[destino] = Math.round(somaR / total);
      saida[destino + 1] = Math.round(somaG / total);
      saida[destino + 2] = Math.round(somaB / total);
    }
  }

  return saida;
}

/* ============================================================
   Execução
   ============================================================ */

const origem = lerPng(ENTRADA);
const { largura, altura, canais, pixels } = origem;

const temTinta = (x, y) => {
  const i = (y * largura + x) * canais;
  return pixels[i] < BRANCO || pixels[i + 1] < BRANCO || pixels[i + 2] < BRANCO;
};

const linhaCheia = [];
for (let y = 0; y < altura; y++) {
  let achou = false;
  for (let x = 0; x < largura && !achou; x++) achou = temTinta(x, y);
  linhaCheia.push(achou);
}

const colunaCheia = [];
for (let x = 0; x < largura; x++) {
  let achou = false;
  for (let y = 0; y < altura && !achou; y++) achou = temTinta(x, y);
  colunaCheia.push(achou);
}

const topo = linhaCheia.indexOf(true);
const base = linhaCheia.lastIndexOf(true);
const esquerda = colunaCheia.indexOf(true);
const direita = colunaCheia.lastIndexOf(true);

if (topo < 0) throw new Error('A logo parece estar em branco.');

/* A logo é um lockup empilhado: monograma em cima, palavra embaixo. O maior
   intervalo de linhas vazias entre os dois é a divisa. */
let maiorVao = { inicio: base, tamanho: 0 };
let vaoAtual = -1;
for (let y = topo; y <= base; y++) {
  if (!linhaCheia[y]) {
    if (vaoAtual < 0) vaoAtual = y;
  } else if (vaoAtual >= 0) {
    if (y - vaoAtual > maiorVao.tamanho) maiorVao = { inicio: vaoAtual, tamanho: y - vaoAtual };
    vaoAtual = -1;
  }
}

const fimDoMonograma = maiorVao.inicio;

/* Colunas com conteúdo APENAS na faixa do monograma. */
let marcaEsq = largura;
let marcaDir = 0;
for (let x = esquerda; x <= direita; x++) {
  for (let y = topo; y < fimDoMonograma; y++) {
    if (temTinta(x, y)) {
      if (x < marcaEsq) marcaEsq = x;
      if (x > marcaDir) marcaDir = x;
      break;
    }
  }
}

mkdirSync('assets/brand', { recursive: true });

/* ---------- lockup ---------- */
const folga = Math.round((base - topo) * 0.05);
const recorteLockup = {
  x: esquerda - folga,
  y: topo - folga,
  largura: direita - esquerda + 1 + folga * 2,
  altura: base - topo + 1 + folga * 2,
};
const alturaLockup = Math.round((recorteLockup.altura / recorteLockup.largura) * LARGURA_LOCKUP);
const bytesLockup = escreverPng(
  'assets/brand/matchphoint.png',
  LARGURA_LOCKUP,
  alturaLockup,
  recortarEReduzir(origem, recorteLockup, LARGURA_LOCKUP, alturaLockup),
);

/* ---------- monograma, encaixado num quadrado ----------
   O monograma é mais largo do que alto. Amostrar um QUADRADO do original em
   volta dele puxaria a palavra "MATCHPHOINT" para dentro do recorte; por isso
   aqui se recorta exatamente o monograma e ele é encaixado, proporcional e
   centralizado, numa tela quadrada branca. */
const recorteMarca = {
  x: marcaEsq,
  y: topo,
  largura: marcaDir - marcaEsq + 1,
  altura: fimDoMonograma - topo + 1,
};

const util = Math.round(LADO_MARCA * 0.88); // 6% de respiro de cada lado
const escala = Math.min(util / recorteMarca.largura, util / recorteMarca.altura);
const molduraW = Math.round(recorteMarca.largura * escala);
const molduraH = Math.round(recorteMarca.altura * escala);

const bytesMarca = escreverPng(
  'assets/brand/matchphoint-mark.png',
  LADO_MARCA,
  LADO_MARCA,
  recortarEReduzir(origem, recorteMarca, LADO_MARCA, LADO_MARCA, {
    x: Math.round((LADO_MARCA - molduraW) / 2),
    y: Math.round((LADO_MARCA - molduraH) / 2),
    largura: molduraW,
    altura: molduraH,
  }),
);

console.log(`original                            ${largura}x${altura}  ${(readFileSync(ENTRADA).length / 1024).toFixed(0)} kB`);
console.log(`  conteúdo                          x ${esquerda}..${direita} · y ${topo}..${base}`);
console.log(`  divisa monograma/palavra          y ${fimDoMonograma}`);
console.log(`assets/brand/matchphoint.png        ${LARGURA_LOCKUP}x${alturaLockup}  ${(bytesLockup / 1024).toFixed(0)} kB`);
console.log(`assets/brand/matchphoint-mark.png   ${LADO_MARCA}x${LADO_MARCA}  ${(bytesMarca / 1024).toFixed(0)} kB`);
