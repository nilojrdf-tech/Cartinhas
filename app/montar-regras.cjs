'use strict';
/* Monta web/regras.mjs a partir do index.html.

   As regras de calculo e a leitura do relatorio NAO sao reescritas para o aplicativo:
   sao extraidas do proprio Cartinhas do computador, que e a versao auditada. Assim o
   celular e a tabela nao podem divergir por um ajuste feito em um so dos dois.

   Se o index.html mudar de forma que a extracao nao reconheca mais uma declaracao, este
   script para com erro em vez de gerar um arquivo meio certo. O teste regras.test.js
   ainda confere, caso a caso, se o resultado bate com o da pagina.

   Rodar:  node montar-regras.cjs
*/

const fs = require('node:fs');
const path = require('node:path');

const ORIGEM = path.join(__dirname, '..', 'index.html');
const DESTINO = path.join(__dirname, 'web', 'regras.mjs');

/* Na ordem em que aparecem no index.html. */
const QUERO = [
  'WD', 'esc', 'toM', 'dur', 'marcInvalida', 'parseList', 'normM', 'fmt', 'hm', 'clock',
  'iso', 'br', 'wd', 'FER', 'pascoa', 'sextaSanta', 'ehFeriado', 'mk', 'cap', 'nomeMes',
  'seguidas', 'calcDay', 'totals', 'parseMeta', 'parseReport', 'uneDias',
];

/* Conta chaves, parenteses e colchetes do trecho. Nas declaracoes que interessam, as
   chaves que aparecem dentro de expressao regular sao quantificadores ({1,2}, {3}), que
   vem sempre em par, entao a contagem simples fecha. Qualquer engano aqui gera um arquivo
   que nao compila, e o node --check no fim do script acusa. */
function equilibrado(txt) {
  let c = 0;
  for (const ch of txt) {
    if (ch === '{' || ch === '(' || ch === '[') c++;
    else if (ch === '}' || ch === ')' || ch === ']') c--;
  }
  return c === 0;
}

function pega(linhas, nome) {
  const re = new RegExp(`^(?:const|let|var|function)\\s+${nome}\\b`);
  const i = linhas.findIndex((l) => re.test(l));
  if (i < 0) throw new Error(`nao achei a declaracao de "${nome}" no index.html`);
  let trecho = linhas[i];
  let j = i;
  while (!(equilibrado(trecho) && /[;}]\s*(?:\/\*.*\*\/\s*)?$/.test(trecho.trimEnd()))) {
    j++;
    if (j >= linhas.length || j > i + 60) throw new Error(`a declaracao de "${nome}" nao terminou onde eu esperava`);
    trecho += '\n' + linhas[j];
  }
  // comentario logo acima, quando houver: a explicacao da regra vem junto
  const antes = [];
  for (let k = i - 1; k >= 0 && /^\s*\/\*/.test(linhas[k]) && /\*\/\s*$/.test(linhas[k]); k--) {
    antes.unshift(linhas[k]);
    if (antes.length > 3) break;
  }
  return { nome, texto: (antes.length ? antes.join('\n') + '\n' : '') + trecho, linha: i + 1 };
}

function monta() {
  const pagina = fs.readFileSync(ORIGEM, 'utf8');
  const versao = (/<script type="module" data-pdfjs-versao="([^"]+)"/.exec(pagina) || [])[1] || '?';
  const linhas = pagina.split(/\r?\n/);
  const pedacos = QUERO.map((n) => pega(linhas, n));

  const cabeca =
`/* GERADO por app/montar-regras.cjs a partir de index.html. Nao editar a mao:
   a proxima montagem apaga qualquer mudanca feita aqui. Para mudar uma regra de
   calculo, mude no index.html e rode "node montar-regras.cjs" de novo.

   Origem: index.html (leitor de PDF ${versao}) · montado em ${new Date().toISOString().slice(0, 10)} */

/* O dia de hoje e a lista do mes vivem fora destas funcoes no Cartinhas do computador.
   Aqui elas entram pelos dois ajustes abaixo, que o aplicativo chama ao abrir e na virada. */
let todayISO = '';
let days = [];
const DISP = {};
export function defineHoje(d) { todayISO = d; return todayISO; }
export function hoje() { return todayISO; }
export function defineDias(a) { days = a || []; return days; }
export function defineDispensas(o) {
  for (const k of Object.keys(DISP)) delete DISP[k];
  Object.assign(DISP, o || {});
  return DISP;
}
export const TIPOS = ['util', 'folga', 'feriado', 'ferias'];
`;

  const corpo = pedacos.map((p) => `/* index.html:${p.linha} */\n${p.texto}`).join('\n\n');
  const pe = `\nexport { ${QUERO.join(', ')} };\n`;
  const saida = cabeca + '\n' + corpo + '\n' + pe;

  fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
  fs.writeFileSync(DESTINO, saida, 'utf8');
  return { arquivo: DESTINO, nomes: QUERO.length, bytes: saida.length, versao };
}

if (require.main === module) {
  const r = monta();
  console.log(`regras.mjs montado: ${r.nomes} declaracoes, ${r.bytes} bytes, de index.html (pdf.js ${r.versao})`);
}

module.exports = { monta, pega, QUERO };
