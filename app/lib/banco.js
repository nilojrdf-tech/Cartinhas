'use strict';
/* Banco de dados do Cartinhas: SQLite pelo modulo embutido do Node (sem dependencia externa).
   Uma tabela de dias por conta, com revisao por dia, que e o que permite dois aparelhos
   gravarem dias diferentes e acusarem conflito quando mexem no mesmo dia. */

const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS contas (
  id           INTEGER PRIMARY KEY,
  matricula    TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  nome         TEXT,                    -- titular, como vem no relatorio do SRP
  senha_hash   TEXT,
  senha_sal    TEXT,
  admin        INTEGER NOT NULL DEFAULT 0,
  ativa        INTEGER NOT NULL DEFAULT 0,
  criada_em    INTEGER NOT NULL,
  senha_em     INTEGER
);

CREATE TABLE IF NOT EXISTS convites (
  id            INTEGER PRIMARY KEY,
  matricula     TEXT NOT NULL,
  email         TEXT NOT NULL,
  conv_hash     TEXT NOT NULL UNIQUE,   -- link que vai pelo WhatsApp
  mail_hash     TEXT UNIQUE,            -- link que vai pelo e-mail, criado na confirmacao
  estado        TEXT NOT NULL,          -- pendente | confirmando | usado | cancelado
  admin         INTEGER NOT NULL DEFAULT 0,
  criado_em     INTEGER NOT NULL,
  expira_em     INTEGER NOT NULL,
  confirmado_em INTEGER,
  usado_em      INTEGER,
  conta_id      INTEGER
);
CREATE INDEX IF NOT EXISTS ix_convites_matricula ON convites(matricula, estado);

CREATE TABLE IF NOT EXISTS senha_links (
  id        INTEGER PRIMARY KEY,
  conta_id  INTEGER NOT NULL,
  tok_hash  TEXT NOT NULL UNIQUE,
  criado_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  usado_em  INTEGER
);

CREATE TABLE IF NOT EXISTS sessoes (
  id        INTEGER PRIMARY KEY,
  conta_id  INTEGER NOT NULL,
  tok_hash  TEXT NOT NULL UNIQUE,
  criada_em INTEGER NOT NULL,
  expira_em INTEGER NOT NULL,
  vista_em  INTEGER
);
CREATE INDEX IF NOT EXISTS ix_sessoes_conta ON sessoes(conta_id);

CREATE TABLE IF NOT EXISTS dias (
  conta_id    INTEGER NOT NULL,
  data        TEXT NOT NULL,            -- AAAA-MM-DD
  rev         INTEGER NOT NULL DEFAULT 1,
  marcas      TEXT NOT NULL DEFAULT '',
  srp_marcas  TEXT NOT NULL DEFAULT '',
  tipo        TEXT NOT NULL DEFAULT 'util',
  tipo_manual INTEGER NOT NULL DEFAULT 0,
  abono       TEXT,
  obs         TEXT NOT NULL DEFAULT '',
  carga       INTEGER,
  srp         TEXT,                     -- JSON com os totais do proprio relatorio
  futuro      INTEGER NOT NULL DEFAULT 0, -- dia que o aplicativo preencheu sozinho: ainda nao veio em relatorio nenhum
  salvo_em    INTEGER NOT NULL,
  PRIMARY KEY (conta_id, data)
);

CREATE TABLE IF NOT EXISTS meses (
  conta_id   INTEGER NOT NULL,
  ym         TEXT NOT NULL,             -- AAAA-MM
  meta       TEXT,                      -- JSON com nome do titular e totais do SRP
  salvo_em   INTEGER NOT NULL,
  PRIMARY KEY (conta_id, ym)
);

CREATE TABLE IF NOT EXISTS feriados (
  data  TEXT PRIMARY KEY,
  nome  TEXT NOT NULL,
  tipo  TEXT NOT NULL DEFAULT 'feriado'
);

CREATE TABLE IF NOT EXISTS tentativas (
  chave  TEXT PRIMARY KEY,
  n      INTEGER NOT NULL,
  ate    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS registro (
  id     INTEGER PRIMARY KEY,
  quando INTEGER NOT NULL,
  quem   INTEGER,
  o_que  TEXT NOT NULL,
  detalhe TEXT
);
`;

function abre(arquivo) {
  if (arquivo !== ':memory:') {
    const dir = path.dirname(arquivo);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const db = new DatabaseSync(arquivo);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = FULL');
  db.exec(ESQUEMA);
  return db;
}

/* Transacao exclusiva desde o inicio: duas requisicoes que disputam a ultima vaga
   nao conseguem ler o mesmo total e reservar as duas. */
function emTransacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    throw e;
  }
}

function anota(db, quem, oQue, detalhe) {
  db.prepare('INSERT INTO registro (quando, quem, o_que, detalhe) VALUES (?,?,?,?)')
    .run(Date.now(), quem ?? null, oQue, detalhe == null ? null : String(detalhe));
}

/* Copia consistente do banco, usada pelo backup diario. */
function copiaPara(db, destino) {
  const dir = path.dirname(destino);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(destino)) fs.rmSync(destino);
  db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
  return destino;
}

module.exports = { abre, emTransacao, anota, copiaPara, ESQUEMA };
