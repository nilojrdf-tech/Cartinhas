'use strict';
/* Copia diaria do banco, com retencao de 30 dias.

   A copia e feita com VACUUM INTO, que escreve um banco inteiro e consistente mesmo com o
   aplicativo em uso — diferente de copiar o arquivo .sqlite na mao, que pode pegar o banco
   no meio de uma gravacao.

   Guarda em /backups (segundo volume) e apaga o que passou da retencao. Depois confere a
   copia recem-criada: abre, roda a verificacao do proprio SQLite e conta as contas e os
   dias. Uma copia que nao abre nao serve de nada, e e melhor descobrir isso hoje.

   Rodar na VPS (uma vez por dia):
     node backup.cjs
   Conferir uma copia:
     node backup.cjs --conferir /backups/cartinhas-2026-11-26.sqlite
   Restaurar: ver FASE-0.md, secao "Restaurar".
*/

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const banco = require('./lib/banco');

const DIAS = Number(process.env.CARTINHAS_BACKUP_DIAS || 30);

function confere(arquivo) {
  const db = new DatabaseSync(arquivo, { readOnly: true });
  try {
    const integridade = db.prepare('PRAGMA integrity_check').get();
    const ok = Object.values(integridade)[0] === 'ok';
    const contas = db.prepare('SELECT COUNT(*) n FROM contas').get().n;
    const dias = db.prepare('SELECT COUNT(*) n FROM dias').get().n;
    const meses = db.prepare('SELECT COUNT(DISTINCT substr(data,1,7)) n FROM dias').get().n;
    return { ok, contas, dias, meses, bytes: fs.statSync(arquivo).size };
  } finally {
    db.close();
  }
}

function roda(op = {}) {
  if (op.conferir) {
    /* Uma copia que nem abre tem de sair com recado, nao com pilha de erro: quem le isso
       e quem esta tentando restaurar, possivelmente as pressas. */
    let r;
    try { r = confere(op.conferir); }
    catch (e) {
      console.error(`${op.conferir}: NÃO ABRE — ${e.message}. Essa cópia não serve para restaurar; tente a do dia anterior.`);
      return { ok: false, codigo: 1, erro: e.message };
    }
    console.log(`${op.conferir}: ${r.ok ? 'íntegra' : 'COM PROBLEMA'} · ${r.contas} conta(s), ${r.dias} dia(s) em ${r.meses} mês(es), ${(r.bytes / 1024).toFixed(0)} KB`);
    return r.ok ? r : { ...r, codigo: 1 };
  }

  const origem = op.banco || process.env.CARTINHAS_BANCO ||
    path.join(process.env.CARTINHAS_DADOS || path.join(__dirname, 'dados'), 'cartinhas.sqlite');
  const pasta = op.pasta || process.env.CARTINHAS_BACKUPS || '/backups';
  if (!fs.existsSync(origem)) {
    console.error(`Não achei o banco em ${origem}.`);
    return { codigo: 1 };
  }
  fs.mkdirSync(pasta, { recursive: true });

  const hoje = new Date().toISOString().slice(0, 10);
  const destino = path.join(pasta, `cartinhas-${hoje}.sqlite`);

  const db = banco.abre(origem);
  try { banco.copiaPara(db, destino); } finally { db.close(); }

  const r = confere(destino);
  if (!r.ok) {
    console.error(`A cópia ${destino} não passou na verificação. Não apaguei nenhuma cópia antiga.`);
    return { codigo: 1, destino };
  }
  console.log(`Cópia de hoje: ${destino} · ${r.contas} conta(s), ${r.dias} dia(s) em ${r.meses} mês(es), ${(r.bytes / 1024).toFixed(0)} KB`);

  /* Retencao: so depois de a copia de hoje passar na verificacao. */
  const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000;
  const apagadas = [];
  for (const nome of fs.readdirSync(pasta)) {
    const m = /^cartinhas-(\d{4}-\d{2}-\d{2})\.sqlite$/.exec(nome);
    if (!m || m[1] === hoje) continue;
    const quando = Date.parse(m[1] + 'T12:00:00Z');
    if (Number.isFinite(quando) && quando < limite) {
      fs.rmSync(path.join(pasta, nome));
      apagadas.push(nome);
    }
  }
  const restam = fs.readdirSync(pasta).filter((n) => /^cartinhas-\d{4}-\d{2}-\d{2}\.sqlite$/.test(n)).length;
  console.log(`Retenção de ${DIAS} dias: ${apagadas.length} cópia(s) antiga(s) apagada(s), ${restam} guardada(s).`);
  return { destino, apagadas, restam, ...r };
}

if (require.main === module) {
  const op = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--')) op[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : true;
  }
  const r = roda(op);
  if (r && r.codigo) process.exitCode = r.codigo;
}

module.exports = { roda, confere };
