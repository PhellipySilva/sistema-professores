/* Gera o par de chaves VAPID dos avisos de mensalidade.
 *
 * VAPID é o que impede qualquer um de mandar notificação em nome do
 * MatchPhoint: o serviço de push do navegador só aceita uma mensagem assinada
 * com a chave privada que corresponde à pública com que o aparelho se
 * inscreveu.
 *
 * São chaves ECDSA P-256, o único formato que a especificação admite — o mesmo
 * que a ferramenta do pacote `web-push` produz. Aqui elas saem do `node:crypto`,
 * que já vem instalado, para não entrar dependência no projeto por causa de um
 * comando que se roda UMA vez na vida.
 *
 *     node scripts/gerar-vapid.mjs
 *
 * A pública vai para .env (VITE_VAPID_PUBLIC_KEY) e para os segredos das Edge
 * Functions (VAPID_PUBLIC_KEY). A PRIVADA vai SÓ para os segredos das Edge
 * Functions (VAPID_PRIVATE_KEY) — no frontend, ela entregaria a assinatura.
 *
 * Trocar o par depois invalida as inscrições existentes: cada professor
 * precisaria ativar os avisos de novo. Gere uma vez e guarde.
 */

import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });

/* A chave pública do push é o PONTO NÃO COMPRIMIDO: o byte 0x04 seguido das
   coordenadas X e Y, 32 bytes cada. O JWK entrega X e Y já em base64url,
   separados — juntar é só desfazer essa separação. */
const publica = base64url(
  Buffer.concat([Buffer.from([0x04]), fromBase64url(pub.x), fromBase64url(pub.y)]),
);

// A privada é o escalar `d`, que o JWK já devolve no formato certo.
const privada = priv.d;

console.log('');
console.log('Chaves VAPID geradas. Guarde-as: trocá-las obriga todos a reativar os avisos.');
console.log('');
console.log('  .env  (e Vercel > Environment Variables)');
console.log(`    VITE_VAPID_PUBLIC_KEY=${publica}`);
console.log('');
console.log('  Supabase > Project Settings > Edge Functions > Secrets');
console.log(`    VAPID_PUBLIC_KEY=${publica}`);
console.log(`    VAPID_PRIVATE_KEY=${privada}`);
console.log('    VAPID_SUBJECT=mailto:voce@exemplo.com');
console.log('');

function base64url(buffer) {
  return buffer.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64url(value) {
  return Buffer.from(value.replaceAll('-', '+').replaceAll('_', '/'), 'base64');
}
