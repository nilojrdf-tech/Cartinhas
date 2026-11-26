'use strict';
/* Roda todas as suítes do Cartinhas, a do computador junto com as do aplicativo, e
   termina com erro se qualquer uma falhar.

   Rodar:  node testes/todos.js
*/

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const RAIZ = path.join(APP, '..');

const SUITES = [
  { nome: 'Cartinhas do computador (auditoria)', cwd: path.join(RAIZ, 'testes'), arquivo: 'auditoria.test.js', args: ['../index.html'] },
  { nome: 'Regras iguais nos dois', cwd: APP, arquivo: 'testes/regras.test.js' },
  { nome: 'Calculadora igual nos dois', cwd: APP, arquivo: 'testes/calculadora.test.js' },
  { nome: 'Fase 1 — contas, convites e gravação', cwd: APP, arquivo: 'testes/fase1.test.js' },
  { nome: 'Fase 2 — tela do celular', cwd: APP, arquivo: 'testes/fase2.test.js' },
  { nome: 'Fase 3 — migração dos meses', cwd: APP, arquivo: 'testes/fase3.test.js' },
  { nome: 'Fase 6 — backup e restauração', cwd: APP, arquivo: 'testes/fase6.test.js' },
];

let totais = 0, falhas = 0, suitesRuins = 0;
const linhas = [];

for (const s of SUITES) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [s.arquivo, ...(s.args || [])], {
    cwd: s.cwd, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024,
  });
  const saida = (r.stdout || '') + (r.stderr || '');
  const m = /Total:\s*(\d+)\s*·\s*passou\s*(\d+)\s*·\s*falhou\s*(\d+)/.exec(saida);
  const seg = ((Date.now() - t0) / 1000).toFixed(0);
  if (!m) {
    suitesRuins++;
    linhas.push(`FALHOU  ${s.nome} — não consegui ler o total (${seg}s)`);
    console.log(saida.split('\n').slice(-12).join('\n'));
    continue;
  }
  const [, n, ok, fal] = m.map(Number);
  totais += n;
  falhas += fal;
  if (fal || r.status !== 0) {
    suitesRuins++;
    for (const l of saida.split('\n').filter((l) => l.startsWith('FALHOU'))) console.log('   ' + l);
  }
  linhas.push(`${fal || r.status !== 0 ? 'FALHOU ' : 'PASSOU '} ${s.nome} — ${ok} de ${n} (${seg}s)`);
}

console.log('');
for (const l of linhas) console.log(l);
console.log('');
console.log(`TUDO: ${totais} verificações · falhou ${falhas} · suítes com problema ${suitesRuins}`);
if (falhas || suitesRuins) process.exitCode = 1;
