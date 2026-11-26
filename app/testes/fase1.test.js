'use strict';
/* Testes de aceite da fase 1 do aplicativo: contas, convites e gravacao.
   Cada caso aqui sai de um criterio escrito no plano mestre.

   As operacoes passam pela API de verdade: sobe um servidor numa porta livre, com banco
   em memoria e o e-mail em modo de teste, e conversa com ele por HTTP, com biscoito de
   sessao por "aparelho". Nada de espiar o codigo-fonte atras de texto.

   Rodar:  node testes/fase1.test.js
*/

const assert = require('node:assert');
const { cria } = require('../servidor');

const ADMIN = { matricula: '12345678', email: 'nilo@exemplo.test' };
const SENHA_ADMIN = 'senha-do-nilo-1';

/* ---------- harness ---------- */

const R = [];
let id = 0;
const PEND = [];

function caso(grupo, nome, fn) {
  id++;
  const meu = id;
  PEND.push((async () => {
    let r;
    try { r = (await fn()) || { ok: true, obs: '' }; }
    catch (e) { r = { ok: false, obs: 'ERRO: ' + e.message }; }
    R.push({ id: meu, grupo, nome, ...r });
  })());
}

/* Um "aparelho": guarda os biscoitos da sessao, como um navegador faria. */
function aparelho(base, etiqueta) {
  const pote = new Map();
  async function vai(metodo, caminho, corpo) {
    const cab = { 'x-cartinhas': '1' };
    if (pote.size) cab.cookie = [...pote].map(([k, v]) => `${k}=${v}`).join('; ');
    if (corpo !== undefined) cab['content-type'] = 'application/json';
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: cab,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    for (const sc of res.headers.getSetCookie ? res.headers.getSetCookie() : []) {
      const [par] = sc.split(';');
      const i = par.indexOf('=');
      const k = par.slice(0, i).trim();
      const v = par.slice(i + 1).trim();
      if (!v || /Max-Age=0/i.test(sc)) pote.delete(k); else pote.set(k, v);
    }
    const txt = await res.text();
    let dado = null;
    try { dado = txt ? JSON.parse(txt) : null; } catch (_) { dado = { bruto: txt.slice(0, 200) }; }
    return { status: res.status, dado };
  }
  return {
    etiqueta,
    get: (c) => vai('GET', c),
    post: (c, b) => vai('POST', c, b === undefined ? {} : b),
    del: (c) => vai('DELETE', c),
    /* um pedido sem o cabecalho proprio, como faria um formulario de outro site */
    async cru(metodo, caminho, corpo) {
      const cab = {};
      if (pote.size) cab.cookie = [...pote].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await fetch(base + caminho, {
        method: metodo, headers: cab,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      return { status: res.status, dado: await res.json().catch(() => null) };
    },
  };
}

/* Um servidor novo, isolado, por caso. */
async function sobe(op = {}) {
  const enviadas = [];
  const postal = {
    modo: 'teste',
    enviadas,
    async envia(msg) { enviadas.push(msg); return { modo: 'teste', para: msg.para }; },
  };
  const app = cria({
    arquivo: ':memory:',
    porta: 0,
    endereco: '',
    adminMatricula: op.semAdmin ? '' : ADMIN.matricula,
    adminEmail: op.semAdmin ? '' : ADMIN.email,
    postal,
  });
  const porta = await app.escuta();
  const base = `http://127.0.0.1:${porta}`;
  const cenario = {
    app, base, enviadas,
    aparelho: (etq) => aparelho(base, etq),
    fecha: () => app.fecha(),
    /* link que chegou por e-mail, da ultima mensagem para aquele endereco */
    linkDoEmail(para) {
      for (let i = enviadas.length - 1; i >= 0; i--) {
        if (enviadas[i].para === para) {
          const m = /senha-nova#([A-Za-z0-9_-]+)/.exec(enviadas[i].corpo);
          return m ? m[1] : null;
        }
      }
      return null;
    },
  };
  return cenario;
}

/* Dá senha ao administrador pelo mesmo caminho de recuperacao que ele usaria de verdade. */
async function admEntra(c, senha = SENHA_ADMIN) {
  const p = c.aparelho('admin');
  await p.post('/api/recuperar', { matricula: ADMIN.matricula });
  const tok = c.linkDoEmail(ADMIN.email);
  assert.ok(tok, 'o link de senha do administrador nao chegou');
  const r = await p.post('/api/senha-nova', { token: tok, senha });
  assert.equal(r.status, 200, 'nao consegui definir a senha do administrador');
  const e = await p.post('/api/entrar', { matricula: ADMIN.matricula, senha });
  assert.equal(e.status, 200, 'o administrador nao conseguiu entrar');
  return p;
}

/* Convida alguem e leva o convite ate a conta ativa, devolvendo o aparelho logado. */
async function entraNovo(c, adm, matricula, email, senha) {
  const conv = await adm.post('/api/convites', { matricula, email });
  assert.equal(conv.status, 201, 'o convite nao foi criado: ' + JSON.stringify(conv.dado));
  const token = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
  const p = c.aparelho(matricula);
  const ab = await p.post('/api/convite/abrir', { token, matricula });
  assert.equal(ab.status, 200, 'a confirmacao nao foi enviada: ' + JSON.stringify(ab.dado));
  const tokMail = c.linkDoEmail(email);
  assert.ok(tokMail, 'o e-mail de confirmacao nao chegou');
  const at = await p.post('/api/senha-nova', { token: tokMail, senha });
  assert.equal(at.status, 200, 'a conta nao foi ativada: ' + JSON.stringify(at.dado));
  const en = await p.post('/api/entrar', { matricula, senha });
  assert.equal(en.status, 200, 'a conta nova nao entrou');
  return { aparelho: p, convite: conv.dado, token, tokMail };
}

const dia = (d, marcas, extra = {}) => ({ d, rev: 0, marcas, srpMarcas: marcas, tipo: 'util', ...extra });

/* ---------- acesso ---------- */

caso('Acesso', 'A conta do administrador nasce habilitada e ocupa uma vaga', async () => {
  const c = await sobe();
  try {
    const s = await c.aparelho().get('/api/saude');
    return {
      ok: s.dado.vagas.ativas === 1 && s.dado.vagas.total === 10 && s.dado.vagas.livres === 9,
      obs: `ativas ${s.dado.vagas.ativas} de ${s.dado.vagas.total}, livres ${s.dado.vagas.livres}`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'O administrador define a propria senha pelo e-mail e entra', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const eu = await adm.get('/api/eu');
    return { ok: eu.dado.entrou && eu.dado.conta.admin === true, obs: `entrou como ${eu.dado.conta.matricula}, admin ${eu.dado.conta.admin}` };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Usuario comum nao consegue convidar', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: marcos } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const r = await marcos.post('/api/convites', { matricula: '99999999', email: 'x@exemplo.test' });
    const v = await marcos.get('/api/usuarios');
    return { ok: r.status === 403 && v.status === 403, obs: `convidar devolveu ${r.status}, lista de usuarios ${v.status}` };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Matricula com zero inicial e preservada', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'zero@exemplo.test', 'senha-com-zero-1');
    const eu = await p.get('/api/eu');
    return { ok: eu.dado.conta.matricula === '00000123', obs: `a conta ficou com a matricula "${eu.dado.conta.matricula}"` };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Matricula fora do formato e recusada', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const ruins = ['1234567', '123456789', '1234567a', '', '1234 678', null];
    const fora = [];
    for (const m of ruins) {
      const r = await adm.post('/api/convites', { matricula: m, email: 'x@exemplo.test' });
      if (r.status !== 400) fora.push(`${JSON.stringify(m)} -> ${r.status}`);
    }
    return { ok: fora.length === 0, obs: fora.length ? 'aceitou ' + fora.join('; ') : `recusou as ${ruins.length} matriculas invalidas` };
  } finally { await c.fecha(); }
});

caso('Convite', 'Abrir o link com a matricula errada nao manda e-mail nenhum', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const conv = await adm.post('/api/convites', { matricula: '00000123', email: 'marcos@exemplo.test' });
    const token = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
    const antes = c.enviadas.length;
    const curioso = c.aparelho('curioso');
    const r = await curioso.post('/api/convite/abrir', { token, matricula: '87654321' });
    return {
      ok: r.status === 400 && r.dado.erro === 'matricula_nao_confere' && c.enviadas.length === antes,
      obs: `resposta ${r.status} (${r.dado.erro}) e nenhum e-mail novo: ${c.enviadas.length === antes}`,
    };
  } finally { await c.fecha(); }
});

caso('Convite', 'A confirmacao vai para o e-mail do convite, nao para quem abriu o link', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const conv = await adm.post('/api/convites', { matricula: '00000123', email: 'marcos@exemplo.test' });
    const token = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
    const p = c.aparelho('quem-recebeu');
    const r = await p.post('/api/convite/abrir', { token, matricula: '00000123' });
    const ultima = c.enviadas[c.enviadas.length - 1];
    return {
      ok: r.status === 200 && ultima.para === 'marcos@exemplo.test' && /senha-nova#/.test(ultima.corpo) && !/marcos@exemplo\.test/.test(JSON.stringify(r.dado)),
      obs: `enviado para ${ultima.para} · a tela so mostrou "${r.dado.dica}"`,
    };
  } finally { await c.fecha(); }
});

caso('Convite', 'O link do WhatsApp sozinho nao cria senha', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const conv = await adm.post('/api/convites', { matricula: '00000123', email: 'marcos@exemplo.test' });
    const token = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
    const p = c.aparelho('encaminhado');
    const direto = await p.post('/api/senha-nova', { token, senha: 'tentando-furar-1' });
    await p.post('/api/convite/abrir', { token, matricula: '00000123' });
    const depois = await p.post('/api/senha-nova', { token, senha: 'tentando-furar-1' });
    const entrou = await p.post('/api/entrar', { matricula: '00000123', senha: 'tentando-furar-1' });
    return {
      ok: direto.status === 410 && depois.status === 410 && entrou.status === 401,
      obs: `com o link do WhatsApp: ${direto.status} antes e ${depois.status} depois de informar a matricula · login ${entrou.status}`,
    };
  } finally { await c.fecha(); }
});

caso('Convite', 'So o link que chegou no e-mail define a primeira senha', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const eu = await p.get('/api/eu');
    return { ok: eu.dado.entrou && eu.dado.conta.matricula === '00000123', obs: 'conta ativada e aberta pelo link do e-mail' };
  } finally { await c.fecha(); }
});

caso('Convite', 'Convite usado nao ativa de novo', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { tokMail, token } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const outro = c.aparelho('outro');
    const r = await outro.post('/api/senha-nova', { token: tokMail, senha: 'outra-senha-9' });
    const conv = await outro.get('/api/convite/' + token);
    const velha = await outro.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    return {
      ok: r.status === 410 && conv.status === 410 && velha.status === 200,
      obs: `reusar o link do e-mail: ${r.status} · link do WhatsApp: ${conv.status} · a senha definida continua valendo: ${velha.status}`,
    };
  } finally { await c.fecha(); }
});

caso('Convite', 'Cancelar invalida os dois links e devolve a vaga', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const conv = await adm.post('/api/convites', { matricula: '00000123', email: 'marcos@exemplo.test' });
    const token = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
    const p = c.aparelho('convidado');
    await p.post('/api/convite/abrir', { token, matricula: '00000123' });
    const tokMail = c.linkDoEmail('marcos@exemplo.test');
    const antes = (await adm.get('/api/convites')).dado.vagas;
    await adm.post(`/api/convites/${conv.dado.id}/cancelar`);
    const depois = (await adm.get('/api/convites')).dado.vagas;
    const comLink = await p.get('/api/convite/' + token);
    const comMail = await p.post('/api/senha-nova', { token: tokMail, senha: 'nao-vai-dar-1' });
    return {
      ok: comLink.status === 410 && comMail.status === 410 && depois.livres === antes.livres + 1,
      obs: `link do WhatsApp ${comLink.status}, link do e-mail ${comMail.status} · vagas livres ${antes.livres} -> ${depois.livres}`,
    };
  } finally { await c.fecha(); }
});

caso('Convite', 'Renovar invalida o anterior e mantem uma reserva so', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const conv = await adm.post('/api/convites', { matricula: '00000123', email: 'marcos@exemplo.test' });
    const tok1 = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
    const p = c.aparelho('convidado');
    await p.post('/api/convite/abrir', { token: tok1, matricula: '00000123' });
    const mail1 = c.linkDoEmail('marcos@exemplo.test');
    const ren = await adm.post(`/api/convites/${conv.dado.id}/renovar`);
    const tok2 = /convite#([A-Za-z0-9_-]+)/.exec(ren.dado.link)[1];
    const lista = (await adm.get('/api/convites')).dado;
    const velho = await p.get('/api/convite/' + tok1);
    const velhoMail = await p.post('/api/senha-nova', { token: mail1, senha: 'link-velho-1' });
    const novo = await p.get('/api/convite/' + tok2);
    return {
      ok: velho.status === 410 && velhoMail.status === 410 && novo.status === 200 &&
          lista.convites.length === 1 && lista.vagas.reservadas === 1,
      obs: `link antigo ${velho.status}, e-mail antigo ${velhoMail.status}, link novo ${novo.status} · convites abertos ${lista.convites.length}, reservas ${lista.vagas.reservadas}`,
    };
  } finally { await c.fecha(); }
});

caso('Convite', 'Convite vencido nao ativa e libera a vaga', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const conv = await adm.post('/api/convites', { matricula: '00000123', email: 'marcos@exemplo.test' });
    const token = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
    const p = c.aparelho('convidado');
    await p.post('/api/convite/abrir', { token, matricula: '00000123' });
    const tokMail = c.linkDoEmail('marcos@exemplo.test');
    // o prazo de 48 h vence: o relogio do convite esta no banco
    c.app.db.prepare('UPDATE convites SET expira_em = ? WHERE id = ?').run(Date.now() - 1000, conv.dado.id);
    const comMail = await p.post('/api/senha-nova', { token: tokMail, senha: 'tarde-demais-1' });
    const vagas = (await adm.get('/api/convites')).dado.vagas;
    return {
      ok: comMail.status === 410 && vagas.reservadas === 0 && vagas.livres === 9,
      obs: `link do e-mail depois do prazo: ${comMail.status} · reservas ${vagas.reservadas}, livres ${vagas.livres}`,
    };
  } finally { await c.fecha(); }
});

caso('Convite', 'Nao convida duas vezes a mesma matricula nem quem ja tem conta', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    await adm.post('/api/convites', { matricula: '00000123', email: 'marcos@exemplo.test' });
    const repetido = await adm.post('/api/convites', { matricula: '00000123', email: 'outro@exemplo.test' });
    const doAdmin = await adm.post('/api/convites', { matricula: ADMIN.matricula, email: 'nilo2@exemplo.test' });
    return {
      ok: repetido.status === 400 && repetido.dado.erro === 'ja_convidado' &&
          doAdmin.status === 400 && doAdmin.dado.erro === 'ja_tem_conta',
      obs: `segundo convite para a mesma matricula: ${repetido.dado.erro} · convite para quem ja tem conta: ${doAdmin.dado.erro}`,
    };
  } finally { await c.fecha(); }
});

caso('Vagas', 'A decima primeira vaga e recusada', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const feitos = [];
    for (let i = 1; i <= 9; i++) {
      const m = String(10000000 + i);
      const r = await adm.post('/api/convites', { matricula: m, email: `p${i}@exemplo.test` });
      feitos.push(r.status);
    }
    const onze = await adm.post('/api/convites', { matricula: '19999999', email: 'onze@exemplo.test' });
    const vagas = (await adm.get('/api/convites')).dado.vagas;
    return {
      ok: feitos.every((s) => s === 201) && onze.status === 400 && onze.dado.erro === 'sem_vaga' && vagas.usadas === 10,
      obs: `1 conta + 9 convites = ${vagas.usadas} vagas · o 11o pedido devolveu ${onze.status} (${onze.dado.erro})`,
    };
  } finally { await c.fecha(); }
});

caso('Vagas', 'Com uma vaga livre, dois pedidos ao mesmo tempo geram uma reserva so', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    for (let i = 1; i <= 8; i++) {
      await adm.post('/api/convites', { matricula: String(10000000 + i), email: `p${i}@exemplo.test` });
    }
    const [a, b] = await Promise.all([
      adm.post('/api/convites', { matricula: '17777777', email: 'a@exemplo.test' }),
      adm.post('/api/convites', { matricula: '18888888', email: 'b@exemplo.test' }),
    ]);
    const vagas = (await adm.get('/api/convites')).dado.vagas;
    const criados = [a, b].filter((r) => r.status === 201).length;
    const recusados = [a, b].filter((r) => r.dado && r.dado.erro === 'sem_vaga').length;
    return {
      ok: criados === 1 && recusados === 1 && vagas.usadas === 10,
      obs: `dos dois pedidos simultaneos: ${criados} criado, ${recusados} recusado por falta de vaga · vagas usadas ${vagas.usadas}`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Senha errada e matricula inexistente dao a mesma resposta', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const p = c.aparelho('tentativas');
    const errada = await p.post('/api/entrar', { matricula: '00000123', senha: 'chute-errado-1' });
    const inexistente = await p.post('/api/entrar', { matricula: '55555555', senha: 'chute-errado-1' });
    return {
      ok: errada.status === 401 && inexistente.status === 401 &&
          JSON.stringify(errada.dado) === JSON.stringify(inexistente.dado),
      obs: `as duas responderam ${errada.status} com "${errada.dado.recado}"`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Tentativa atras de tentativa e travada', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const p = c.aparelho('forca-bruta');
    let travou = 0;
    for (let i = 0; i < 25; i++) {
      const r = await p.post('/api/entrar', { matricula: '00000123', senha: 'chute-' + i });
      if (r.status === 429) { travou = i + 1; break; }
    }
    const certa = await p.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    return {
      ok: travou > 0 && travou <= 21 && certa.status === 429,
      obs: `travou na tentativa ${travou || '—'} e, travado, nem a senha certa entra (${certa.status})`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Sair encerra a sessao daquele aparelho', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const antes = await p.get('/api/eu');
    await p.post('/api/sair');
    const depois = await p.get('/api/eu');
    const dados = await p.get('/api/meses');
    const aindaAdm = await adm.get('/api/eu');
    return {
      ok: antes.dado.entrou && !depois.dado.entrou && dados.status === 401 && aindaAdm.dado.entrou,
      obs: `antes entrou, depois ${depois.dado.entrou} e os dados devolvem ${dados.status} · o outro aparelho segue aberto`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Recuperacao: link unico, com prazo, para o e-mail certo', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const p = c.aparelho('recupera');
    const pedido = await p.post('/api/recuperar', { matricula: '00000123' });
    const msg = c.enviadas[c.enviadas.length - 1];
    const tok = c.linkDoEmail('marcos@exemplo.test');
    const olha = await p.get('/api/link/' + tok);
    const troca = await p.post('/api/senha-nova', { token: tok, senha: 'senha-nova-do-marcos-2' });
    const dedenovo = await p.post('/api/senha-nova', { token: tok, senha: 'terceira-senha-3' });
    return {
      ok: pedido.status === 200 && msg.para === 'marcos@exemplo.test' && olha.dado.tipo === 'recuperacao' &&
          troca.status === 200 && dedenovo.status === 410,
      obs: `e-mail para ${msg.para} · o link se diz "${olha.dado.tipo}" · trocar ${troca.status}, reusar ${dedenovo.status}`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Link de recuperacao vencido nao troca a senha', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const p = c.aparelho('atrasado');
    await p.post('/api/recuperar', { matricula: '00000123' });
    const tok = c.linkDoEmail('marcos@exemplo.test');
    c.app.db.prepare('UPDATE senha_links SET expira_em = ? WHERE usado_em IS NULL').run(Date.now() - 1000);
    const r = await p.post('/api/senha-nova', { token: tok, senha: 'fora-do-prazo-1' });
    const velha = await p.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    return {
      ok: r.status === 410 && velha.status === 200,
      obs: `fora do prazo: ${r.status} · a senha anterior continua valendo: ${velha.status}`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Trocar a senha derruba a sessao aberta em outro aparelho', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: celular } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const pc = c.aparelho('computador');
    await pc.post('/api/recuperar', { matricula: '00000123' });
    const tok = c.linkDoEmail('marcos@exemplo.test');
    await pc.post('/api/senha-nova', { token: tok, senha: 'senha-nova-do-marcos-2' });
    const celularDepois = await celular.get('/api/meses');
    const antiga = await pc.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    const nova = await pc.post('/api/entrar', { matricula: '00000123', senha: 'senha-nova-do-marcos-2' });
    return {
      ok: celularDepois.status === 401 && antiga.status === 401 && nova.status === 200,
      obs: `o celular passou a pedir login (${celularDepois.status}) · senha antiga ${antiga.status}, nova ${nova.status}`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Pedir recuperacao de matricula que nao existe responde igual', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const p = c.aparelho('sondando');
    const existe = await p.post('/api/recuperar', { matricula: '00000123' });
    const antes = c.enviadas.length;
    const nao = await p.post('/api/recuperar', { matricula: '55555555' });
    return {
      ok: existe.status === nao.status && JSON.stringify(existe.dado) === JSON.stringify(nao.dado) && c.enviadas.length === antes,
      obs: `as duas responderam ${nao.status} com ${JSON.stringify(nao.dado)} e nenhum e-mail foi gerado para a inexistente`,
    };
  } finally { await c.fecha(); }
});

caso('Acesso', 'Pedido sem o cabecalho do aplicativo e recusado', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    await p.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00')] });
    const cru = await p.cru('POST', '/api/dias', { ym: '2026-11', dias: [dia('2026-11-04', '08:00 12:00 13:00 17:00')] });
    const mes = await p.get('/api/mes/2026-11');
    const datas = mes.dado.dias.map((x) => x.d);
    return {
      ok: cru.status === 400 && !datas.includes('2026-11-04') && datas.includes('2026-11-03'),
      obs: `sem o cabecalho: ${cru.status} (${cru.dado && cru.dado.erro}) · no banco ficaram ${datas.join(', ')}`,
    };
  } finally { await c.fecha(); }
});

/* ---------- dados ---------- */

caso('Dados', 'Cada conta so le e altera os proprios dias', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: a } = await entraNovo(c, adm, '00000123', 'a@exemplo.test', 'senha-da-conta-a1');
    const { aparelho: b } = await entraNovo(c, adm, '00000456', 'b@exemplo.test', 'senha-da-conta-b1');
    await a.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00', { obs: 'so de A' })] });
    await b.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '09:00 12:00 13:00 18:00', { obs: 'so de B' })] });
    const mA = await a.get('/api/mes/2026-11');
    const mB = await b.get('/api/mes/2026-11');
    const dA = mA.dado.dias.find((x) => x.d === '2026-11-03');
    const dB = mB.dado.dias.find((x) => x.d === '2026-11-03');
    await b.del('/api/dia/2026-11-03');
    const mADepois = await a.get('/api/mes/2026-11');
    return {
      ok: dA.obs === 'so de A' && dB.obs === 'so de B' && mA.dado.dias.length === 1 &&
          mADepois.dado.dias.length === 1 && mADepois.dado.dias[0].obs === 'so de A',
      obs: `A ve "${dA.obs}" e B ve "${dB.obs}" no mesmo dia · apagar em B nao mexeu em A (${mADepois.dado.dias.length} dia)`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Dois aparelhos gravam dias diferentes e nada se perde', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: celular } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const pc = c.aparelho('computador');
    await pc.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    const [r1, r2] = await Promise.all([
      celular.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 18:00')] }),
      pc.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-04', '08:00 12:00 13:00 18:00')] }),
    ]);
    const mes = await celular.get('/api/mes/2026-11');
    const datas = mes.dado.dias.map((x) => x.d);
    return {
      ok: r1.status === 200 && r2.status === 200 && datas.includes('2026-11-03') && datas.includes('2026-11-04'),
      obs: `os dois envios responderam ${r1.status}/${r2.status} e no banco estao ${datas.join(', ')}`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Mesmo dia com revisao atrasada vira conflito, sem gravar por cima', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: celular } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const pc = c.aparelho('computador');
    await pc.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    // os dois leem a mesma revisao (o dia ainda nao existe: rev 0)
    const r1 = await celular.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 18:00', { obs: 'do celular' })] });
    const r2 = await pc.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00', { obs: 'do computador' })] });
    const mes = await pc.get('/api/mes/2026-11');
    const d = mes.dado.dias.find((x) => x.d === '2026-11-03');
    const conf = r2.dado.conflitos && r2.dado.conflitos[0];
    return {
      ok: r1.status === 200 && r2.status === 409 && r2.dado.salvos.length === 0 &&
          conf && conf.d === '2026-11-03' && conf.dele.obs === 'do celular' && conf.dele.rev === 1 &&
          d.obs === 'do celular',
      obs: `o segundo envio recebeu ${r2.status} com a versao do servidor ("${conf && conf.dele.obs}", rev ${conf && conf.dele.rev}) e o banco manteve "${d.obs}"`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Depois do conflito, reenviar com a revisao certa grava', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: celular } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const pc = c.aparelho('computador');
    await pc.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    await celular.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 18:00', { obs: 'do celular' })] });
    const briga = await pc.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00', { obs: 'do computador' })] });
    const rev = briga.dado.conflitos[0].dele.rev;
    const denovo = await pc.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00', { obs: 'do computador', rev })] });
    const mes = await pc.get('/api/mes/2026-11');
    const d = mes.dado.dias.find((x) => x.d === '2026-11-03');
    return {
      ok: denovo.status === 200 && denovo.dado.salvos[0].rev === rev + 1 && d.obs === 'do computador' && d.marcas === '08:00 12:00 13:00 17:00',
      obs: `reenvio sobre a revisao ${rev} gravou e o dia foi para a revisao ${d.rev} com "${d.obs}"`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Num envio com varios dias, o conflito de um nao segura os outros', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: celular } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const pc = c.aparelho('computador');
    await pc.post('/api/entrar', { matricula: '00000123', senha: 'senha-do-marcos-1' });
    await celular.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 18:00', { obs: 'do celular' })] });
    const r = await pc.post('/api/dias', { ym: '2026-11', dias: [
      dia('2026-11-03', '08:00 12:00 13:00 17:00', { obs: 'do computador' }),
      dia('2026-11-04', '08:00 12:00 13:00 17:00'),
      dia('2026-11-05', '08:00 12:00 13:00 17:00'),
    ] });
    const mes = await pc.get('/api/mes/2026-11');
    const d3 = mes.dado.dias.find((x) => x.d === '2026-11-03');
    return {
      ok: r.status === 409 && r.dado.salvos.length === 2 && r.dado.conflitos.length === 1 &&
          r.dado.conflitos[0].d === '2026-11-03' && d3.obs === 'do celular' && mes.dado.dias.length === 3,
      obs: `${r.dado.salvos.length} dias gravados e ${r.dado.conflitos.length} em conflito (${r.dado.conflitos[0].d}), que seguiu com "${d3.obs}"`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Relatorio parcial atualiza so as datas que vieram', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    await p.post('/api/dias', { ym: '2026-11', meta: { nome: 'MARCOS' }, dias: [
      dia('2026-11-03', '08:00 12:00 13:00 17:00'),
      dia('2026-11-04', '08:00 12:00 13:00 17:00', { obs: 'consulta', abono: '2:00' }),
      dia('2026-11-05', '08:00 12:00 13:00 17:00'),
    ] });
    const antes = (await p.get('/api/mes/2026-11')).dado;
    const rev5 = antes.dias.find((x) => x.d === '2026-11-05').rev;
    // o relatorio seguinte traz so o dia 5, corrigido
    const r = await p.post('/api/dias', { ym: '2026-11', meta: { nome: 'MARCOS' }, dias: [
      dia('2026-11-05', '08:00 12:00 13:00 18:00', { rev: rev5 }),
    ] });
    const depois = (await p.get('/api/mes/2026-11')).dado;
    const d4 = depois.dias.find((x) => x.d === '2026-11-04');
    const d5 = depois.dias.find((x) => x.d === '2026-11-05');
    return {
      ok: r.status === 200 && depois.dias.length === 3 && d4.abono === '2:00' && d4.obs === 'consulta' &&
          d5.marcas === '08:00 12:00 13:00 18:00',
      obs: `o mes continua com ${depois.dias.length} dias · o dia 4 manteve abono ${d4.abono} e "${d4.obs}" · o dia 5 virou ${d5.marcas}`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Relatorio de outro titular e recusado antes de gravar', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: a } = await entraNovo(c, adm, '00000123', 'a@exemplo.test', 'senha-da-conta-a1');
    const { aparelho: b } = await entraNovo(c, adm, '00000456', 'b@exemplo.test', 'senha-da-conta-b1');
    await a.post('/api/dias', { ym: '2026-11', meta: { nome: 'FULANO DE TAL' }, dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00')] });
    await b.post('/api/dias', { ym: '2026-11', meta: { nome: 'BELTRANO' }, dias: [dia('2026-11-10', '08:00 12:00 13:00 17:00')] });
    // na conta de A, tentar importar o relatorio de B
    const r = await a.post('/api/dias', { ym: '2026-11', meta: { nome: 'BELTRANO' }, dias: [
      dia('2026-11-04', '08:00 12:00 13:00 17:00'),
      dia('2026-11-05', '08:00 12:00 13:00 17:00'),
    ] });
    const mA = (await a.get('/api/mes/2026-11')).dado;
    const mB = (await b.get('/api/mes/2026-11')).dado;
    return {
      ok: r.status === 409 && r.dado.erro === 'titular_diferente' &&
          r.dado.daConta === 'FULANO DE TAL' && r.dado.doArquivo === 'BELTRANO' &&
          mA.dias.length === 1 && mB.dias.length === 1,
      obs: `${r.status} (${r.dado.erro}): conta de ${r.dado.daConta}, relatorio de ${r.dado.doArquivo} · A ficou com ${mA.dias.length} dia e B com ${mB.dias.length}`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Com a confirmacao do titular, a importacao segue', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: a } = await entraNovo(c, adm, '00000123', 'a@exemplo.test', 'senha-da-conta-a1');
    await a.post('/api/dias', { ym: '2026-11', meta: { nome: 'FULANO DE TAL' }, dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00')] });
    const r = await a.post('/api/dias', {
      ym: '2026-11', meta: { nome: 'BELTRANO' }, confirmaTitular: true,
      dias: [dia('2026-11-04', '08:00 12:00 13:00 17:00')],
    });
    const m = (await a.get('/api/mes/2026-11')).dado;
    const eu = (await a.get('/api/eu')).dado;
    return {
      ok: r.status === 200 && m.dias.length === 2 && eu.conta.nome === 'FULANO DE TAL',
      obs: `gravou os ${m.dias.length} dias e a conta seguiu em nome de ${eu.conta.nome}`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Arquivo de outro programa e recusado inteiro', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    await p.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00')] });
    const antes = (await p.get('/api/mes/2026-11')).dado.dias.length;
    const tentativas = [
      { outroApp: 'ROTA', registros: [{ id: 1 }] },
      { ym: '2026-11', dias: [{ d: '03/11/2026', marcas: '08:00' }] },
      { ym: '2026-11', dias: [{ d: '2026-11-04', tipo: 'qualquer' }] },
      { ym: '2026-11', dias: [{ d: '2026-11-04', abono: 'duas horas' }] },
      { ym: '2026-11', dias: [{ d: '2026-11-04', carga: 9999 }] },
      { ym: '2026-11', dias: [{ d: '2026-13-04', marcas: '' }] },
      { ym: '2026-11', dias: 'nao sou lista' },
    ];
    const respostas = [];
    for (const t of tentativas) respostas.push((await p.post('/api/dias', t)).status);
    const depois = (await p.get('/api/mes/2026-11')).dado.dias.length;
    return {
      ok: respostas.every((s) => s === 400) && depois === antes,
      obs: `as ${respostas.length} tentativas devolveram ${[...new Set(respostas)].join('/')} e o mes seguiu com ${depois} dia`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Um dia invalido no meio do lote impede o lote inteiro', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const r = await p.post('/api/dias', { ym: '2026-11', dias: [
      dia('2026-11-03', '08:00 12:00 13:00 17:00'),
      { d: '2026-11-04', tipo: 'inventado' },
      dia('2026-11-05', '08:00 12:00 13:00 17:00'),
    ] });
    const m = (await p.get('/api/mes/2026-11')).dado;
    return {
      ok: r.status === 400 && m.dias.length === 0,
      obs: `o envio devolveu ${r.status} e nenhum dia ficou gravado (${m.dias.length})`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'Dias fora do mes informado nao entram', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const r = await p.post('/api/dias', { ym: '2026-11', dias: [
      dia('2026-11-03', '08:00 12:00 13:00 17:00'),
      dia('2026-10-30', '08:00 12:00 13:00 17:00'),
    ] });
    const nov = (await p.get('/api/mes/2026-11')).dado.dias.length;
    const out = (await p.get('/api/mes/2026-10')).dado.dias.length;
    return {
      ok: r.status === 400 && nov === 0 && out === 0,
      obs: `${r.status}: novembro com ${nov} dias e outubro com ${out}`,
    };
  } finally { await c.fecha(); }
});

caso('Dados', 'O mesmo dia duas vezes no mesmo envio e recusado', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const r = await p.post('/api/dias', { ym: '2026-11', dias: [
      dia('2026-11-03', '08:00 12:00 13:00 17:00'),
      dia('2026-11-03', '09:00 12:00 13:00 18:00'),
    ] });
    const m = (await p.get('/api/mes/2026-11')).dado;
    return { ok: r.status === 400 && m.dias.length === 0, obs: `${r.status} (${r.dado.erro}) e nada gravado` };
  } finally { await c.fecha(); }
});

caso('Dados', 'Sem sessao, ninguem le nem grava ponto', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    await p.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00')] });
    const anonimo = c.aparelho('de-fora');
    const le = await anonimo.get('/api/mes/2026-11');
    const grava = await anonimo.post('/api/dias', { ym: '2026-11', dias: [dia('2026-11-06', '08:00 12:00 13:00 17:00')] });
    const meses = await anonimo.get('/api/meses');
    const m = (await p.get('/api/mes/2026-11')).dado;
    return {
      ok: le.status === 401 && grava.status === 401 && meses.status === 401 && m.dias.length === 1,
      obs: `ler ${le.status}, gravar ${grava.status}, listar ${meses.status} · o mes do titular seguiu com ${m.dias.length} dia`,
    };
  } finally { await c.fecha(); }
});

caso('Fase 0', 'O teste de e-mail so roda para o administrador', async () => {
  const c = await sobe();
  try {
    const adm = await admEntra(c);
    const { aparelho: p } = await entraNovo(c, adm, '00000123', 'marcos@exemplo.test', 'senha-do-marcos-1');
    const dele = await p.post('/api/teste-email', { para: 'marcos@exemplo.test' });
    const meu = await adm.post('/api/teste-email', { para: ADMIN.email });
    const ultima = c.enviadas[c.enviadas.length - 1];
    return {
      ok: dele.status === 403 && meu.status === 200 && ultima.para === ADMIN.email && /teste/i.test(ultima.assunto),
      obs: `usuario comum ${dele.status}, administrador ${meu.status} · a mensagem foi para ${ultima.para}`,
    };
  } finally { await c.fecha(); }
});

caso('Fase 0', 'A pagina do aplicativo pede para ficar fora dos buscadores', async () => {
  const c = await sobe();
  try {
    const robots = await fetch(c.base + '/robots.txt');
    const txt = await robots.text();
    const pagina = await fetch(c.base + '/');
    return {
      ok: /Disallow: \//.test(txt) && /noindex/.test(pagina.headers.get('x-robots-tag') || ''),
      obs: `robots.txt diz "${txt.trim().replace(/\n/g, ' ')}" e a pagina responde ${pagina.status} com x-robots-tag "${pagina.headers.get('x-robots-tag')}"`,
    };
  } finally { await c.fecha(); }
});

/* ---------- saida ---------- */

Promise.all(PEND).then(() => {
  R.sort((a, b) => a.id - b.id);
  const fal = R.filter((r) => !r.ok);
  for (const r of R) {
    console.log(`${r.ok ? 'PASSOU ' : 'FALHOU '} #${String(r.id).padStart(2, '0')} [${r.grupo}] ${r.nome} — ${r.obs}`);
  }
  console.log(`\nTotal: ${R.length} · passou ${R.length - fal.length} · falhou ${fal.length}`);
  require('node:fs').writeFileSync(
    require('node:path').join(__dirname, 'resultado-fase1.json'),
    JSON.stringify(R, null, 1)
  );
  if (fal.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
});
