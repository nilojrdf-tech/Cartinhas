'use strict';
/* Contas, convites, senhas e sessoes do Cartinhas.
   Regras que vieram do plano mestre:
   - matricula dos Correios: exatamente oito algarismos, zeros iniciais preservados;
   - no maximo DEZ vagas, contando contas ativas mais convites ainda validos;
   - cada matricula ocupa no maximo uma vaga;
   - so o administrador convida;
   - o convite (WhatsApp) nao cria senha: ele so autoriza o envio da confirmacao ao e-mail
     informado por Nilo. A senha so pode ser definida pelo link que chega nesse e-mail;
   - cancelar, expirar ou renovar invalida os dois links e libera ou remaneja a vaga. */

const crypto = require('node:crypto');
const { emTransacao, anota } = require('./banco');

const VAGAS = 10;
const CONVITE_VALE = 48 * 60 * 60 * 1000;   // 48 horas
const SENHA_LINK_VALE = 20 * 60 * 1000;     // 20 minutos
const SESSAO_VALE = 30 * 24 * 60 * 60 * 1000;
const SENHA_MIN = 8;

class Recusa extends Error {
  constructor(codigo, recado, http) {
    super(recado);
    this.codigo = codigo;
    this.recado = recado;
    this.http = http || 400;
  }
}

/* ---------- utilidades ---------- */

const agora = () => Date.now();

function matriculaOk(m) {
  return typeof m === 'string' && /^[0-9]{8}$/.test(m);
}

function emailOk(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.length <= 160;
}

function geraToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(t) {
  return crypto.createHash('sha256').update(String(t)).digest('hex');
}

function iguais(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function guardaSenha(senha) {
  return new Promise((ok, erro) => {
    const sal = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(senha, sal, 64, { N: 16384, r: 8, p: 1 }, (e, dk) => {
      if (e) return erro(e);
      ok({ sal, hash: dk.toString('hex') });
    });
  });
}

function confereSenha(senha, sal, hash) {
  return new Promise((ok) => {
    if (!sal || !hash) return ok(false);
    crypto.scrypt(senha, sal, 64, { N: 16384, r: 8, p: 1 }, (e, dk) => {
      if (e) return ok(false);
      ok(iguais(dk.toString('hex'), hash));
    });
  });
}

/* ---------- vagas ---------- */

function contaVagas(db) {
  const ativas = db.prepare('SELECT COUNT(*) n FROM contas WHERE ativa = 1').get().n;
  const reservadas = db.prepare(
    `SELECT COUNT(*) n FROM convites WHERE estado IN ('pendente','confirmando') AND expira_em > ?`
  ).get(agora()).n;
  return { ativas, reservadas, usadas: ativas + reservadas, total: VAGAS, livres: VAGAS - ativas - reservadas };
}

/* Convites vencidos nao seguram vaga: marcar antes de contar deixa o numero honesto. */
function varreVencidos(db) {
  const n = db.prepare(
    `UPDATE convites SET estado = 'cancelado' WHERE estado IN ('pendente','confirmando') AND expira_em <= ?`
  ).run(agora()).changes;
  db.prepare('DELETE FROM sessoes WHERE expira_em <= ?').run(agora());
  db.prepare('DELETE FROM tentativas WHERE ate <= ?').run(agora());
  return n;
}

/* ---------- conta inicial (administrador) ---------- */

/* Habilita a conta de Nilo. Sem senha ainda: ele define a dele pelo mesmo caminho de
   recuperacao, pelo e-mail confirmado, para nao existir senha inicial em arquivo nenhum. */
function criaAdmin(db, matricula, email) {
  if (!matriculaOk(matricula)) throw new Recusa('matricula', 'A matricula precisa ter exatamente oito algarismos.');
  if (!emailOk(email)) throw new Recusa('email', 'E-mail invalido.');
  return emTransacao(db, () => {
    const ja = db.prepare('SELECT id FROM contas WHERE matricula = ?').get(matricula);
    if (ja) throw new Recusa('existe', 'Essa matricula ja tem conta.');
    const info = db.prepare(
      'INSERT INTO contas (matricula, email, admin, ativa, criada_em) VALUES (?,?,1,1,?)'
    ).run(matricula, email.trim(), agora());
    const id = Number(info.lastInsertRowid);
    anota(db, id, 'admin.criado', matricula);
    return { id, matricula, email: email.trim(), admin: true };
  });
}

/* ---------- convites ---------- */

function convida(db, quem, matricula, email) {
  if (!quem || !quem.admin) throw new Recusa('sem_permissao', 'Somente o administrador pode convidar.', 403);
  if (!matriculaOk(matricula)) throw new Recusa('matricula', 'A matricula precisa ter exatamente oito algarismos.');
  if (!emailOk(email)) throw new Recusa('email', 'Informe o e-mail individual de quem vai receber o convite.');

  return emTransacao(db, () => {
    varreVencidos(db);
    const conta = db.prepare('SELECT id, ativa FROM contas WHERE matricula = ?').get(matricula);
    if (conta && conta.ativa) throw new Recusa('ja_tem_conta', 'Essa matricula ja tem conta ativa.');
    const aberto = db.prepare(
      `SELECT id FROM convites WHERE matricula = ? AND estado IN ('pendente','confirmando') AND expira_em > ?`
    ).get(matricula, agora());
    if (aberto) throw new Recusa('ja_convidado', 'Ja existe um convite valido para essa matricula. Cancele ou renove o que esta pendente.');

    const v = contaVagas(db);
    if (v.livres <= 0) throw new Recusa('sem_vaga', `As ${VAGAS} vagas estao ocupadas entre contas ativas e convites validos.`);

    const token = geraToken();
    const t = agora();
    const info = db.prepare(
      `INSERT INTO convites (matricula, email, conv_hash, estado, criado_em, expira_em)
       VALUES (?,?,?,'pendente',?,?)`
    ).run(matricula, email.trim(), hashToken(token), t, t + CONVITE_VALE);
    anota(db, quem.id, 'convite.criado', matricula);
    return { id: Number(info.lastInsertRowid), matricula, email: email.trim(), token, expira_em: t + CONVITE_VALE };
  });
}

/* Renovar: invalida os links anteriores (inclusive o de confirmacao por e-mail)
   e mantem UMA unica reserva para a mesma matricula. */
function renova(db, quem, id) {
  if (!quem || !quem.admin) throw new Recusa('sem_permissao', 'Somente o administrador pode renovar convites.', 403);
  return emTransacao(db, () => {
    const c = db.prepare('SELECT * FROM convites WHERE id = ?').get(id);
    if (!c) throw new Recusa('nao_achei', 'Convite nao encontrado.', 404);
    if (c.estado === 'usado') throw new Recusa('usado', 'Esse convite ja foi usado.');
    const token = geraToken();
    const t = agora();
    db.prepare(
      `UPDATE convites SET conv_hash = ?, mail_hash = NULL, estado = 'pendente',
        criado_em = ?, expira_em = ?, confirmado_em = NULL WHERE id = ?`
    ).run(hashToken(token), t, t + CONVITE_VALE, id);
    anota(db, quem.id, 'convite.renovado', c.matricula);
    return { id, matricula: c.matricula, email: c.email, token, expira_em: t + CONVITE_VALE };
  });
}

function cancela(db, quem, id) {
  if (!quem || !quem.admin) throw new Recusa('sem_permissao', 'Somente o administrador pode cancelar convites.', 403);
  return emTransacao(db, () => {
    const c = db.prepare('SELECT * FROM convites WHERE id = ?').get(id);
    if (!c) throw new Recusa('nao_achei', 'Convite nao encontrado.', 404);
    if (c.estado === 'usado') throw new Recusa('usado', 'Esse convite ja foi usado.');
    db.prepare(`UPDATE convites SET estado = 'cancelado', conv_hash = ?, mail_hash = NULL WHERE id = ?`)
      .run('cancelado:' + id, id);
    anota(db, quem.id, 'convite.cancelado', c.matricula);
    return { id, matricula: c.matricula };
  });
}

function listaConvites(db, quem) {
  if (!quem || !quem.admin) throw new Recusa('sem_permissao', 'Somente o administrador ve os convites.', 403);
  varreVencidos(db);
  const linhas = db.prepare(
    `SELECT id, matricula, email, estado, criado_em, expira_em, confirmado_em FROM convites
      WHERE estado IN ('pendente','confirmando') ORDER BY criado_em DESC`
  ).all();
  return { convites: linhas, vagas: contaVagas(db) };
}

function achaConvite(db, token) {
  if (!token) return null;
  const c = db.prepare(`SELECT * FROM convites WHERE conv_hash = ?`).get(hashToken(token));
  if (!c) return null;
  if (c.estado !== 'pendente' && c.estado !== 'confirmando') return null;
  if (c.expira_em <= agora()) return null;
  return c;
}

/* Passo 2: quem recebeu o link informa a matricula. Batendo, o sistema manda a confirmacao
   para o e-mail que Nilo cadastrou. Quem encaminhou o WhatsApp para a conversa errada
   nao consegue passar daqui. */
function pedeConfirmacao(db, token, matricula) {
  return emTransacao(db, () => {
    const c = achaConvite(db, token);
    if (!c) throw new Recusa('convite_invalido', 'Esse convite nao vale mais. Peca um novo a quem convidou.', 410);
    if (!matriculaOk(matricula) || c.matricula !== matricula) {
      anota(db, null, 'convite.matricula_errada', c.matricula);
      throw new Recusa('matricula_nao_confere', 'A matricula nao confere com a do convite.');
    }
    const tokenMail = geraToken();
    db.prepare(
      `UPDATE convites SET mail_hash = ?, estado = 'confirmando', confirmado_em = ? WHERE id = ?`
    ).run(hashToken(tokenMail), agora(), c.id);
    anota(db, null, 'convite.confirmacao_enviada', c.matricula);
    return { id: c.id, matricula: c.matricula, email: c.email, tokenMail };
  });
}

function achaConfirmacao(db, tokenMail) {
  if (!tokenMail) return null;
  const c = db.prepare(`SELECT * FROM convites WHERE mail_hash = ?`).get(hashToken(tokenMail));
  if (!c || c.estado !== 'confirmando' || c.expira_em <= agora()) return null;
  return c;
}

/* Passo 3: o titular define a primeira senha pelo link do e-mail. Conferir de novo a
   validade, criar a conta e consumir os dois links numa operacao so. */
async function ativa(db, tokenMail, senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_MIN) {
    throw new Recusa('senha_curta', `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  }
  const previa = achaConfirmacao(db, tokenMail);
  if (!previa) throw new Recusa('link_invalido', 'Esse link de confirmacao nao vale mais.', 410);
  const { sal, hash } = await guardaSenha(senha);

  return emTransacao(db, () => {
    const c = achaConfirmacao(db, tokenMail);       // de novo, agora com o banco travado
    if (!c) throw new Recusa('link_invalido', 'Esse link de confirmacao nao vale mais.', 410);
    const t = agora();
    let conta = db.prepare('SELECT * FROM contas WHERE matricula = ?').get(c.matricula);
    if (conta && conta.ativa) throw new Recusa('ja_tem_conta', 'Essa matricula ja tem conta ativa.');
    if (!conta) {
      // Este convite ja segura uma das vagas desde que foi criado, entao ativar nao
      // precisa de vaga nova: a reserva vira conta. A conferencia abaixo e so para o
      // caso de o limite ter sido reduzido com contas ativas acima dele.
      if (contaVagas(db).ativas >= VAGAS) {
        throw new Recusa('sem_vaga', 'As vagas acabaram enquanto o convite estava aberto.');
      }
      const info = db.prepare(
        'INSERT INTO contas (matricula, email, senha_hash, senha_sal, admin, ativa, criada_em, senha_em) VALUES (?,?,?,?,?,1,?,?)'
      ).run(c.matricula, c.email, hash, sal, c.admin ? 1 : 0, t, t);
      conta = { id: Number(info.lastInsertRowid), matricula: c.matricula, email: c.email, admin: c.admin ? 1 : 0 };
    } else {
      db.prepare('UPDATE contas SET senha_hash = ?, senha_sal = ?, email = ?, ativa = 1, senha_em = ? WHERE id = ?')
        .run(hash, sal, c.email, t, conta.id);
    }
    db.prepare(
      `UPDATE convites SET estado = 'usado', usado_em = ?, conta_id = ?, conv_hash = ?, mail_hash = NULL WHERE id = ?`
    ).run(t, conta.id, 'usado:' + c.id, c.id);
    anota(db, conta.id, 'conta.ativada', c.matricula);
    return { id: conta.id, matricula: conta.matricula, admin: !!conta.admin };
  });
}

/* ---------- limite de tentativas ---------- */

function freia(db, chave, limite, janela) {
  const t = agora();
  const r = db.prepare('SELECT n, ate FROM tentativas WHERE chave = ?').get(chave);
  if (!r || r.ate <= t) {
    db.prepare('INSERT INTO tentativas (chave, n, ate) VALUES (?,1,?) ON CONFLICT(chave) DO UPDATE SET n = 1, ate = excluded.ate')
      .run(chave, t + janela);
    return;
  }
  if (r.n >= limite) {
    const faltam = Math.ceil((r.ate - t) / 1000);
    throw new Recusa('muitas_tentativas', `Tentativas demais. Tente de novo em ${faltam} segundos.`, 429);
  }
  db.prepare('UPDATE tentativas SET n = n + 1 WHERE chave = ?').run(chave);
}

function liberaFreio(db, chave) {
  db.prepare('DELETE FROM tentativas WHERE chave = ?').run(chave);
}

/* ---------- entrar e sair ---------- */

async function entra(db, matricula, senha, deOnde) {
  freia(db, 'login:' + (deOnde || '?'), 20, 10 * 60 * 1000);
  if (matriculaOk(matricula)) freia(db, 'login-m:' + matricula, 10, 10 * 60 * 1000);
  const generico = new Recusa('credenciais', 'Matricula ou senha incorreta.', 401);
  if (!matriculaOk(matricula) || typeof senha !== 'string' || !senha) throw generico;

  const c = db.prepare('SELECT * FROM contas WHERE matricula = ?').get(matricula);
  // mesmo sem conta, gastar o tempo do scrypt: a resposta nao revela quem existe
  const ok = await confereSenha(senha, c ? c.senha_sal : 'x'.repeat(32), c ? c.senha_hash : crypto.randomBytes(64).toString('hex'));
  if (!c || !c.ativa || !ok) throw generico;

  liberaFreio(db, 'login-m:' + matricula);
  const token = geraToken();
  const t = agora();
  db.prepare('INSERT INTO sessoes (conta_id, tok_hash, criada_em, expira_em, vista_em) VALUES (?,?,?,?,?)')
    .run(c.id, hashToken(token), t, t + SESSAO_VALE, t);
  anota(db, c.id, 'sessao.abriu', null);
  return { token, conta: { id: c.id, matricula: c.matricula, admin: !!c.admin, email: c.email } };
}

function deSessao(db, token) {
  if (!token) return null;
  const s = db.prepare('SELECT * FROM sessoes WHERE tok_hash = ?').get(hashToken(token));
  if (!s || s.expira_em <= agora()) return null;
  const c = db.prepare('SELECT * FROM contas WHERE id = ?').get(s.conta_id);
  if (!c || !c.ativa) return null;
  db.prepare('UPDATE sessoes SET vista_em = ? WHERE id = ?').run(agora(), s.id);
  return { id: c.id, matricula: c.matricula, admin: !!c.admin, email: c.email, sessao: s.id };
}

function sai(db, token) {
  if (!token) return false;
  const n = db.prepare('DELETE FROM sessoes WHERE tok_hash = ?').run(hashToken(token)).changes;
  return n > 0;
}

/* ---------- esqueci minha senha ---------- */

/* A resposta e sempre a mesma, exista a conta ou nao. */
function pedeNovaSenha(db, matricula, deOnde) {
  freia(db, 'recup:' + (deOnde || '?'), 10, 60 * 60 * 1000);
  if (!matriculaOk(matricula)) return null;
  const c = db.prepare('SELECT * FROM contas WHERE matricula = ? AND ativa = 1').get(matricula);
  if (!c) return null;
  freia(db, 'recup-m:' + matricula, 5, 60 * 60 * 1000);
  const token = geraToken();
  const t = agora();
  db.prepare('UPDATE senha_links SET usado_em = ? WHERE conta_id = ? AND usado_em IS NULL').run(t, c.id);
  db.prepare('INSERT INTO senha_links (conta_id, tok_hash, criado_em, expira_em) VALUES (?,?,?,?)')
    .run(c.id, hashToken(token), t, t + SENHA_LINK_VALE);
  anota(db, c.id, 'senha.link_pedido', null);
  return { conta: { id: c.id, matricula: c.matricula, email: c.email }, token, expira_em: t + SENHA_LINK_VALE };
}

function achaLinkSenha(db, token) {
  if (!token) return null;
  const l = db.prepare('SELECT * FROM senha_links WHERE tok_hash = ?').get(hashToken(token));
  if (!l || l.usado_em || l.expira_em <= agora()) return null;
  return l;
}

/* Trocar a senha derruba os links e as sessoes anteriores: um aparelho ja aberto
   em outro lugar passa a pedir login de novo. */
async function trocaSenha(db, token, senha) {
  if (typeof senha !== 'string' || senha.length < SENHA_MIN) {
    throw new Recusa('senha_curta', `A senha precisa ter pelo menos ${SENHA_MIN} caracteres.`);
  }
  if (!achaLinkSenha(db, token)) throw new Recusa('link_invalido', 'Esse link nao vale mais. Peca outro.', 410);
  const { sal, hash } = await guardaSenha(senha);
  return emTransacao(db, () => {
    const l = achaLinkSenha(db, token);
    if (!l) throw new Recusa('link_invalido', 'Esse link nao vale mais. Peca outro.', 410);
    const t = agora();
    db.prepare('UPDATE contas SET senha_hash = ?, senha_sal = ?, senha_em = ?, ativa = 1 WHERE id = ?')
      .run(hash, sal, t, l.conta_id);
    db.prepare('UPDATE senha_links SET usado_em = ? WHERE conta_id = ? AND usado_em IS NULL').run(t, l.conta_id);
    db.prepare('DELETE FROM sessoes WHERE conta_id = ?').run(l.conta_id);
    liberaFreio(db, 'login-m:' + (db.prepare('SELECT matricula FROM contas WHERE id = ?').get(l.conta_id) || {}).matricula);
    anota(db, l.conta_id, 'senha.trocada', null);
    const c = db.prepare('SELECT id, matricula, admin FROM contas WHERE id = ?').get(l.conta_id);
    return { id: c.id, matricula: c.matricula, admin: !!c.admin };
  });
}

function listaContas(db, quem) {
  if (!quem || !quem.admin) throw new Recusa('sem_permissao', 'Somente o administrador ve os usuarios.', 403);
  const contas = db.prepare(
    'SELECT id, matricula, email, admin, ativa, criada_em FROM contas ORDER BY criada_em'
  ).all();
  return { contas, vagas: contaVagas(db) };
}

module.exports = {
  VAGAS, CONVITE_VALE, SENHA_LINK_VALE, SESSAO_VALE, SENHA_MIN, Recusa,
  matriculaOk, emailOk, geraToken, hashToken, guardaSenha, confereSenha,
  contaVagas, varreVencidos, criaAdmin,
  convida, renova, cancela, listaConvites, achaConvite, pedeConfirmacao, achaConfirmacao, ativa,
  entra, deSessao, sai, pedeNovaSenha, achaLinkSenha, trocaSenha, listaContas,
  freia, liberaFreio,
};
