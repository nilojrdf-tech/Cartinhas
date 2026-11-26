'use strict';
/* Servidor do Cartinhas: Node.js puro, SQLite embutido, nenhuma dependencia de npm.
   Roda igual no computador (para testar) e no contentor do EasyPanel.

   Para subir aqui:   node servidor.js
   Para os testes:    cria({ arquivo: ':memory:', porta: 0 }) */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const banco = require('./lib/banco');
const contas = require('./lib/contas');
const ponto = require('./lib/ponto');
const correio = require('./lib/correio');

const { Recusa } = contas;
const WEB = path.join(__dirname, 'web');

const TIPOS_ARQUIVO = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------- ajudantes de requisicao ---------- */

function biscoitos(req) {
  const linha = req.headers.cookie || '';
  const fora = {};
  for (const p of linha.split(';')) {
    const i = p.indexOf('=');
    if (i < 0) continue;
    fora[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return fora;
}

function corpoJson(req, limite = 1024 * 1024) {
  return new Promise((ok, erro) => {
    let n = 0;
    const partes = [];
    req.on('data', (p) => {
      n += p.length;
      if (n > limite) { erro(new Recusa('grande', 'Envio grande demais.', 413)); req.destroy(); return; }
      partes.push(p);
    });
    req.on('end', () => {
      if (!partes.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); }
      catch (_) { erro(new Recusa('json', 'Corpo da requisicao invalido.', 400)); }
    });
    req.on('error', erro);
  });
}

function deOnde(req) {
  // Atras do Traefik o endereco real vem no cabecalho; sem ele, usa o soquete.
  const f = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return f || (req.socket && req.socket.remoteAddress) || '?';
}

/* ---------- servidor ---------- */

function cria(op = {}) {
  const cfg = {
    porta: op.porta != null ? op.porta : Number(process.env.CARTINHAS_PORTA || 8080),
    dados: op.dados || process.env.CARTINHAS_DADOS || path.join(__dirname, 'dados'),
    arquivo: op.arquivo || null,
    endereco: (op.endereco || process.env.CARTINHAS_ENDERECO || '').replace(/\/+$/, ''),
    adminMatricula: op.adminMatricula || process.env.CARTINHAS_ADMIN_MATRICULA || '',
    adminEmail: op.adminEmail || process.env.CARTINHAS_ADMIN_EMAIL || '',
  };
  const arquivo = cfg.arquivo || path.join(cfg.dados, 'cartinhas.sqlite');
  const db = banco.abre(arquivo);

  const correioCfg = op.correio || {
    modo: process.env.CARTINHAS_EMAIL_MODO || 'arquivo',
    host: process.env.CARTINHAS_SMTP_HOST || '',
    porta: process.env.CARTINHAS_SMTP_PORTA || 587,
    usuario: process.env.CARTINHAS_SMTP_USUARIO || '',
    senha: process.env.CARTINHAS_SMTP_SENHA || '',
    remetente: process.env.CARTINHAS_REMETENTE || 'cartinhas@localhost',
    de: process.env.CARTINHAS_REMETENTE_NOME || `Cartinhas <${process.env.CARTINHAS_REMETENTE || 'cartinhas@localhost'}>`,
    ehlo: process.env.CARTINHAS_SMTP_EHLO || 'cartinhas',
    pasta: path.join(cfg.dados, 'mensagens'),
  };
  const postal = op.postal || correio.criaCorreio(correioCfg);

  // Conta inicial do administrador, se as variaveis disserem qual e.
  if (cfg.adminMatricula && cfg.adminEmail) {
    const ja = db.prepare('SELECT id FROM contas WHERE matricula = ?').get(cfg.adminMatricula);
    if (!ja) {
      try { contas.criaAdmin(db, cfg.adminMatricula, cfg.adminEmail); }
      catch (e) { console.error('Nao consegui criar a conta do administrador:', e.message); }
    }
  }

  const base = () => cfg.endereco || `http://localhost:${servidor.address() ? servidor.address().port : cfg.porta}`;
  const seguro = () => /^https:/i.test(cfg.endereco);

  function responde(res, codigo, dado, cab) {
    const corpo = Buffer.from(JSON.stringify(dado), 'utf8');
    res.writeHead(codigo, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': corpo.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      ...(cab || {}),
    });
    res.end(corpo);
  }

  function poeSessao(res, token) {
    const p = ['cs=' + encodeURIComponent(token), 'Path=/', 'HttpOnly', 'SameSite=Lax',
      'Max-Age=' + Math.floor(contas.SESSAO_VALE / 1000)];
    if (seguro()) p.push('Secure');
    res.setHeader('set-cookie', p.join('; '));
  }

  function tiraSessao(res) {
    const p = ['cs=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
    if (seguro()) p.push('Secure');
    res.setHeader('set-cookie', p.join('; '));
  }

  function quem(req) {
    return contas.deSessao(db, biscoitos(req).cs);
  }

  function exigeConta(req) {
    const c = quem(req);
    if (!c) throw new Recusa('sem_sessao', 'Entre com sua matricula e senha.', 401);
    return c;
  }

  /* Um cabecalho proprio em toda escrita: um formulario de outro site nao consegue
     mandar cabecalho, entao nao consegue agir pela sessao de quem estiver logado. */
  function exigeCabecalho(req) {
    if (req.headers['x-cartinhas'] !== '1') {
      throw new Recusa('sem_cabecalho', 'Requisicao recusada.', 400);
    }
  }

  async function estatico(req, res, caminho) {
    let rel = caminho === '/' ? 'index.html' : caminho.replace(/^\/+/, '');
    // telas do aplicativo: todas abrem a mesma pagina
    if (['entrar', 'senha-nova', 'convite', 'usuarios', 'mes'].includes(rel.split('/')[0])) rel = 'index.html';
    const alvo = path.join(WEB, rel);
    if (!alvo.startsWith(WEB + path.sep) && alvo !== path.join(WEB, 'index.html')) {
      return responde(res, 403, { erro: 'caminho' });
    }
    let dado;
    try { dado = await fs.promises.readFile(alvo); }
    catch (_) {
      if (rel.startsWith('api/')) return responde(res, 404, { erro: 'nao_achei' });
      try { dado = await fs.promises.readFile(path.join(WEB, 'index.html')); rel = 'index.html'; }
      catch (__) { return responde(res, 404, { erro: 'nao_achei' }); }
    }
    const ext = path.extname(rel).toLowerCase();
    const cab = {
      'content-type': TIPOS_ARQUIVO[ext] || 'application/octet-stream',
      'content-length': dado.length,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow',
    };
    if (ext === '.html') {
      cab['cache-control'] = 'no-cache';
      cab['content-security-policy'] =
        "default-src 'self'; script-src 'self' 'unsafe-inline' blob:; worker-src 'self' blob:; " +
        "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; " +
        "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    } else {
      cab['cache-control'] = 'public, max-age=300';
    }
    res.writeHead(200, cab);
    res.end(req.method === 'HEAD' ? undefined : dado);
  }

  async function roteia(req, res, url) {
    const p = url.pathname;
    const m = req.method;
    const GET = m === 'GET' || m === 'HEAD';

    if (p === '/api/saude') {
      const v = contas.contaVagas(db);
      return responde(res, 200, { ok: true, vagas: v, versao: 1 });
    }

    if (p === '/api/eu') {
      const c = quem(req);
      if (!c) return responde(res, 200, { entrou: false });
      const nome = db.prepare('SELECT nome FROM contas WHERE id = ?').get(c.id).nome;
      return responde(res, 200, {
        entrou: true,
        conta: { matricula: c.matricula, admin: c.admin, email: c.email, nome },
      });
    }

    if (p === '/api/entrar' && m === 'POST') {
      exigeCabecalho(req);
      const b = await corpoJson(req);
      const r = await contas.entra(db, b.matricula, b.senha, deOnde(req));
      poeSessao(res, r.token);
      return responde(res, 200, { entrou: true, conta: { matricula: r.conta.matricula, admin: r.conta.admin } });
    }

    if (p === '/api/sair' && m === 'POST') {
      exigeCabecalho(req);
      contas.sai(db, biscoitos(req).cs);
      tiraSessao(res);
      return responde(res, 200, { entrou: false });
    }

    /* ----- convite ----- */

    if (p === '/api/convite/abrir' && m === 'POST') {
      exigeCabecalho(req);
      const b = await corpoJson(req);
      contas.freia(db, 'convite:' + deOnde(req), 20, 60 * 60 * 1000);
      const r = contas.pedeConfirmacao(db, b.token, b.matricula);
      const t = correio.textos.confirmacao(base(), r.tokenMail);
      await postal.envia({ para: r.email, assunto: t.assunto, corpo: t.corpo });
      // o e-mail nao volta inteiro para a tela: so o bastante para a pessoa se achar
      return responde(res, 200, { enviado: true, dica: disfarca(r.email) });
    }

    if (p.startsWith('/api/convite/') && GET) {
      const t = decodeURIComponent(p.slice('/api/convite/'.length));
      const c = contas.achaConvite(db, t);
      return responde(res, c ? 200 : 410, c ? { vale: true } : { vale: false, erro: 'convite_invalido' });
    }

    /* ----- senha ----- */

    if (p === '/api/recuperar' && m === 'POST') {
      exigeCabecalho(req);
      const b = await corpoJson(req);
      const r = contas.pedeNovaSenha(db, b.matricula, deOnde(req));
      if (r) {
        const t = correio.textos.recuperacao(base(), r.token, Math.round(contas.SENHA_LINK_VALE / 60000));
        try { await postal.envia({ para: r.conta.email, assunto: t.assunto, corpo: t.corpo }); }
        catch (e) { console.error('Falha ao enviar recuperacao:', e.message); }
      }
      // a resposta e igual exista a conta ou nao
      return responde(res, 200, { pedido: true });
    }

    if (p.startsWith('/api/link/') && GET) {
      const t = decodeURIComponent(p.slice('/api/link/'.length));
      const conv = contas.achaConfirmacao(db, t);
      if (conv) return responde(res, 200, { vale: true, tipo: 'convite', matricula: conv.matricula });
      const lnk = contas.achaLinkSenha(db, t);
      if (lnk) {
        const c = db.prepare('SELECT matricula FROM contas WHERE id = ?').get(lnk.conta_id);
        return responde(res, 200, { vale: true, tipo: 'recuperacao', matricula: c.matricula });
      }
      return responde(res, 410, { vale: false, erro: 'link_invalido' });
    }

    if (p === '/api/senha-nova' && m === 'POST') {
      exigeCabecalho(req);
      const b = await corpoJson(req);
      let conta = null;
      if (contas.achaConfirmacao(db, b.token)) conta = await contas.ativa(db, b.token, b.senha);
      else if (contas.achaLinkSenha(db, b.token)) conta = await contas.trocaSenha(db, b.token, b.senha);
      else throw new Recusa('link_invalido', 'Esse link nao vale mais. Peca outro.', 410);
      return responde(res, 200, { pronto: true, matricula: conta.matricula });
    }

    /* ----- administracao ----- */

    if (p === '/api/usuarios' && GET) {
      return responde(res, 200, contas.listaContas(db, exigeConta(req)));
    }

    if (p === '/api/convites' && GET) {
      return responde(res, 200, contas.listaConvites(db, exigeConta(req)));
    }

    if (p === '/api/convites' && m === 'POST') {
      exigeCabecalho(req);
      const eu = exigeConta(req);
      const b = await corpoJson(req);
      const c = contas.convida(db, eu, b.matricula, b.email);
      return responde(res, 201, {
        id: c.id, matricula: c.matricula, email: c.email, expiraEm: c.expira_em,
        link: `${base()}/convite#${c.token}`,
        whatsapp: linkWhatsapp(base(), c.token),
      });
    }

    let mm = /^\/api\/convites\/(\d+)\/(renovar|cancelar)$/.exec(p);
    if (mm && m === 'POST') {
      exigeCabecalho(req);
      const eu = exigeConta(req);
      const id = Number(mm[1]);
      if (mm[2] === 'cancelar') return responde(res, 200, contas.cancela(db, eu, id));
      const c = contas.renova(db, eu, id);
      return responde(res, 200, {
        id: c.id, matricula: c.matricula, expiraEm: c.expira_em,
        link: `${base()}/convite#${c.token}`,
        whatsapp: linkWhatsapp(base(), c.token),
      });
    }

    if (p === '/api/teste-email' && m === 'POST') {
      exigeCabecalho(req);
      const eu = exigeConta(req);
      if (!eu.admin) throw new Recusa('sem_permissao', 'Somente o administrador manda o teste.', 403);
      const b = await corpoJson(req);
      const t = correio.textos.teste(base());
      const r = await postal.envia({ para: b.para || eu.email, assunto: t.assunto, corpo: t.corpo });
      return responde(res, 200, { enviado: true, modo: r.modo, para: r.para });
    }

    /* ----- ponto ----- */

    if (p === '/api/meses' && GET) {
      const eu = exigeConta(req);
      return responde(res, 200, { meses: ponto.meses(db, eu.id) });
    }

    mm = /^\/api\/mes\/(\d{4}-\d{2})$/.exec(p);
    if (mm && GET) {
      const eu = exigeConta(req);
      return responde(res, 200, ponto.mes(db, eu.id, mm[1]));
    }

    if (p === '/api/dias' && m === 'POST') {
      exigeCabecalho(req);
      const eu = exigeConta(req);
      const b = await corpoJson(req, 4 * 1024 * 1024);
      const r = ponto.grava(db, eu, b);
      return responde(res, r.conflitos.length ? 409 : 200, r);
    }

    mm = /^\/api\/dia\/(\d{4}-\d{2}-\d{2})$/.exec(p);
    if (mm && m === 'DELETE') {
      exigeCabecalho(req);
      const eu = exigeConta(req);
      return responde(res, 200, ponto.apaga(db, eu, mm[1]));
    }

    if (p === '/api/feriados' && GET) {
      return responde(res, 200, { feriados: ponto.feriados(db) });
    }

    if (p === '/api/feriados' && m === 'POST') {
      exigeCabecalho(req);
      const eu = exigeConta(req);
      const b = await corpoJson(req);
      return responde(res, 200, ponto.poeFeriado(db, eu, b.data, b.nome, b.tipo));
    }

    if (p.startsWith('/api/')) return responde(res, 404, { erro: 'nao_achei' });

    if (p === '/robots.txt') {
      const txt = 'User-agent: *\nDisallow: /\n';
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'content-length': txt.length });
      return res.end(txt);
    }

    if (!GET) return responde(res, 405, { erro: 'metodo' });
    return estatico(req, res, p);
  }

  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    roteia(req, res, url).catch((e) => {
      if (e instanceof Recusa) {
        return responde(res, e.http, { erro: e.codigo, recado: e.recado, ...(e.extra || {}) });
      }
      console.error('Erro em', req.method, url.pathname, '-', e && e.message);
      try { responde(res, 500, { erro: 'interno', recado: 'Deu problema aqui no servidor.' }); } catch (_) {}
    });
  });

  servidor.headersTimeout = 20000;
  servidor.requestTimeout = 60000;

  const limpeza = setInterval(() => { try { contas.varreVencidos(db); } catch (_) {} }, 10 * 60 * 1000);
  limpeza.unref();

  return {
    servidor, db, cfg, postal,
    endereco: base,
    escuta: () => new Promise((ok) => servidor.listen(cfg.porta, () => ok(servidor.address().port))),
    fecha: () => new Promise((ok) => { clearInterval(limpeza); servidor.close(() => { try { db.close(); } catch (_) {} ok(); }); }),
  };
}

function disfarca(email) {
  const [a, b] = String(email).split('@');
  if (!b) return '***';
  const ini = a.slice(0, 1);
  return `${ini}${'*'.repeat(Math.max(2, a.length - 1))}@${b}`;
}

function linkWhatsapp(base, token) {
  const texto =
    'Oi! Fiz um convite para voce usar o Cartinhas, que mostra o seu banco de horas a partir do ' +
    'Relatorio Espelho de Ponto do SRP.\n\n' +
    `Abra este link e informe a sua matricula: ${base}/convite#${token}\n\n` +
    'Depois chega um e-mail para voce criar a sua senha. O convite vale 48 horas.';
  return 'https://wa.me/?text=' + encodeURIComponent(texto);
}

module.exports = { cria, disfarca, linkWhatsapp };

if (require.main === module) {
  const app = cria();
  app.escuta().then((porta) => {
    console.log(`Cartinhas no ar na porta ${porta} · banco em ${app.cfg.arquivo || path.join(app.cfg.dados, 'cartinhas.sqlite')} · e-mail em modo ${app.postal.modo}`);
    if (!app.cfg.endereco) console.log('Aviso: CARTINHAS_ENDERECO nao definido; os links dos e-mails vao sair com localhost.');
  });
  for (const sinal of ['SIGINT', 'SIGTERM']) {
    process.on(sinal, () => { app.fecha().then(() => process.exit(0)); });
  }
}
