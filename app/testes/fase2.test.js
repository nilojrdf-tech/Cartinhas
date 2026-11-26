'use strict';
/* Testes de aceite da fase 2: a tela do celular.

   O que da para exercitar sem navegador fica aqui, contra o servidor de verdade:
   a fila de edicoes por conta (o criterio "troca de conta com edicao offline" do plano),
   a PWA (manifesto, service worker, casca) e o que a pagina carrega.

   Rodar:  node testes/fase2.test.js
*/

const fs = require('node:fs');
const path = require('node:path');
const { cria } = require('../servidor');
/* fila.mjs e modulo do navegador: entra por import, ja que este teste roda no Node. */
let criaFila, CHAVE;

const ADMIN = { matricula: '12345678', email: 'nilo@exemplo.test' };
const WEB = path.join(__dirname, '..', 'web');

const R = [];
const CASOS = [];
/* Os casos sao guardados e so comecam depois do import do fila.mjs. */
function caso(grupo, nome, fn) { CASOS.push({ id: CASOS.length + 1, grupo, nome, fn }); }

/* ---------- um aparelho ---------- */

/* localStorage de mentira: um so por "aparelho", como no celular de verdade. */
function memoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    chaves: () => [...m.keys()],
  };
}

/* Um navegador: guarda o biscoito da sessao e troca de conta como a pessoa trocaria. */
function navegador(base) {
  let pote = new Map();
  let rede = true;
  async function api(metodo, caminho, corpo) {
    if (!rede) throw new Error('sem rede');
    const cab = { 'x-cartinhas': '1' };
    if (pote.size) cab.cookie = [...pote].map(([k, v]) => `${k}=${v}`).join('; ');
    if (corpo !== undefined) cab['content-type'] = 'application/json';
    const res = await fetch(base + caminho, {
      method: metodo, headers: cab,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    for (const sc of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
      const [par] = sc.split(';');
      const i = par.indexOf('=');
      const k = par.slice(0, i).trim(), v = par.slice(i + 1).trim();
      if (!v || /Max-Age=0/i.test(sc)) pote.delete(k); else pote.set(k, v);
    }
    let dado = null;
    try { dado = await res.json(); } catch (_) {}
    return { status: res.status, ok: res.ok, dado: dado || {} };
  }
  return {
    api,
    semRede() { rede = false; },
    comRede() { rede = true; },
    async entra(matricula, senha) { return api('POST', '/api/entrar', { matricula, senha }); },
    async sai() { return api('POST', '/api/sair'); },
  };
}

async function sobe() {
  const enviadas = [];
  const postal = { modo: 'teste', enviadas, async envia(m) { enviadas.push(m); return { modo: 'teste', para: m.para }; } };
  const app = cria({
    arquivo: ':memory:', porta: 0, endereco: '',
    adminMatricula: ADMIN.matricula, adminEmail: ADMIN.email, postal,
  });
  const porta = await app.escuta();
  return {
    app, enviadas, base: `http://127.0.0.1:${porta}`,
    fecha: () => app.fecha(),
    link(para) {
      for (let i = enviadas.length - 1; i >= 0; i--) {
        if (enviadas[i].para === para) return (/senha-nova#([A-Za-z0-9_-]+)/.exec(enviadas[i].corpo) || [])[1];
      }
      return null;
    },
  };
}

/* Prepara administrador com senha e, se pedido, um segundo titular. */
async function prepara(c, nav, outros = []) {
  await nav.api('POST', '/api/recuperar', { matricula: ADMIN.matricula });
  await nav.api('POST', '/api/senha-nova', { token: c.link(ADMIN.email), senha: 'senha-do-nilo-1' });
  await nav.entra(ADMIN.matricula, 'senha-do-nilo-1');
  const feitos = [];
  for (const o of outros) {
    const conv = await nav.api('POST', '/api/convites', { matricula: o.matricula, email: o.email });
    const token = /convite#([A-Za-z0-9_-]+)/.exec(conv.dado.link)[1];
    const visita = navegador(c.base);
    await visita.api('POST', '/api/convite/abrir', { token, matricula: o.matricula });
    await visita.api('POST', '/api/senha-nova', { token: c.link(o.email), senha: o.senha });
    feitos.push(o);
  }
  await nav.sai();
  return feitos;
}

const dia = (d, marcas, extra = {}) => ({
  d, rev: 0, marcas, srpMarcas: marcas, tipo: 'util', tipoManual: false,
  abono: null, obs: '', carga: null, srp: null, ...extra,
});

/* ---------- fila por conta ---------- */

caso('Fila', 'Edição sem sinal fica guardada e só sai depois que o servidor confirma', async () => {
  const c = await sobe();
  try {
    const nav = navegador(c.base);
    await prepara(c, nav, [{ matricula: '00000123', email: 'a@exemplo.test', senha: 'senha-da-conta-a1' }]);
    await nav.entra('00000123', 'senha-da-conta-a1');
    const loja = memoria();
    const f = criaFila({ storage: loja, api: nav.api });
    f.entra('00000123');

    nav.semRede();
    f.poe(dia('2026-11-03', '08:00 12:00 13:00 17:00'));
    const semRede = await f.envia();
    const guardouSemRede = f.conta();

    nav.comRede();
    const comRede = await f.envia();
    const m = await nav.api('GET', '/api/mes/2026-11');
    return {
      ok: guardouSemRede === 1 && semRede.erro && semRede.erro.tipo === 'rede' &&
          comRede.enviados.length === 1 && f.conta() === 0 && m.dado.dias.length === 1,
      obs: `sem rede: ficou ${guardouSemRede} na fila (${semRede.erro.tipo}) · com rede: ${comRede.enviados.length} enviado, fila em ${f.conta()}, servidor com ${m.dado.dias.length} dia`,
    };
  } finally { await c.fecha(); }
});

caso('Fila', 'Outra pessoa no mesmo aparelho não vê nem envia a pendência de quem estava antes', async () => {
  const c = await sobe();
  try {
    const nav = navegador(c.base);
    await prepara(c, nav, [
      { matricula: '00000123', email: 'a@exemplo.test', senha: 'senha-da-conta-a1' },
      { matricula: '00000456', email: 'b@exemplo.test', senha: 'senha-da-conta-b1' },
    ]);
    const loja = memoria();
    const f = criaFila({ storage: loja, api: nav.api });

    // A edita sem sinal
    await nav.entra('00000123', 'senha-da-conta-a1');
    f.entra('00000123');
    nav.semRede();
    f.poe(dia('2026-11-03', '08:00 12:00 13:00 17:00', { obs: 'edição de A' }));
    const naFilaDeA = f.conta();

    // A sai e B entra no mesmo aparelho
    nav.comRede();
    await nav.sai();
    f.sai();
    await nav.entra('00000456', 'senha-da-conta-b1');
    f.entra('00000456');
    const vistoPorB = f.conta();
    const envioDeB = await f.envia();
    const mesDeB = await nav.api('GET', '/api/mes/2026-11');

    // A volta
    await nav.sai();
    f.sai();
    await nav.entra('00000123', 'senha-da-conta-a1');
    f.entra('00000123');
    const voltou = f.conta();
    const envioDeA = await f.envia();
    const mesDeA = await nav.api('GET', '/api/mes/2026-11');
    const dA = mesDeA.dado.dias.find((x) => x.d === '2026-11-03');

    return {
      ok: naFilaDeA === 1 && vistoPorB === 0 && envioDeB.enviados.length === 0 &&
          mesDeB.dado.dias.length === 0 && voltou === 1 && envioDeA.enviados.length === 1 &&
          dA && dA.obs === 'edição de A' &&
          loja.chaves().includes(CHAVE + '00000123'),
      obs: `A deixou ${naFilaDeA} pendente · B viu ${vistoPorB} e gravou ${mesDeB.dado.dias.length} dia · A voltou e achou ${voltou}, que virou "${dA && dA.obs}" na conta dela`,
    };
  } finally { await c.fecha(); }
});

caso('Fila', 'Editar o mesmo dia várias vezes sem sinal mantém a revisão da primeira', async () => {
  const c = await sobe();
  try {
    const nav = navegador(c.base);
    await prepara(c, nav, [{ matricula: '00000123', email: 'a@exemplo.test', senha: 'senha-da-conta-a1' }]);
    await nav.entra('00000123', 'senha-da-conta-a1');
    const f = criaFila({ storage: memoria(), api: nav.api });
    f.entra('00000123');
    // o dia ja existe no servidor, na revisao 1
    await nav.api('POST', '/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '08:00 12:00 13:00 17:00')] });
    nav.semRede();
    f.poe(dia('2026-11-03', '08:00 12:00 13:00 17:30', { rev: 1, obs: 'primeira' }));
    f.poe(dia('2026-11-03', '08:00 12:00 13:00 18:00', { rev: 99, obs: 'segunda' }));
    const guardado = f.itens()[0];
    nav.comRede();
    const r = await f.envia();
    const m = await nav.api('GET', '/api/mes/2026-11');
    const d = m.dado.dias.find((x) => x.d === '2026-11-03');
    return {
      ok: f.itens().length === 0 && guardado.rev === 1 && guardado.obs === 'segunda' &&
          r.enviados.length === 1 && d.marcas === '08:00 12:00 13:00 18:00' && d.rev === 2,
      obs: `a fila guardou a última edição ("${guardado.obs}") sobre a revisão ${guardado.rev}, e o servidor aceitou: dia na revisão ${d.rev} com ${d.marcas}`,
    };
  } finally { await c.fecha(); }
});

caso('Fila', 'Conflito sai da fila e volta com as duas versões', async () => {
  const c = await sobe();
  try {
    const nav = navegador(c.base);
    await prepara(c, nav, [{ matricula: '00000123', email: 'a@exemplo.test', senha: 'senha-da-conta-a1' }]);
    await nav.entra('00000123', 'senha-da-conta-a1');
    const f = criaFila({ storage: memoria(), api: nav.api });
    f.entra('00000123');

    // esta tela viu o dia novo (revisao 0) e edita sem sinal
    nav.semRede();
    f.poe(dia('2026-11-03', '08:00 12:00 13:00 17:00', { obs: 'do celular' }));
    f.poe(dia('2026-11-04', '08:00 12:00 13:00 17:00', { obs: 'outro dia' }));

    // enquanto isso, o computador gravou o mesmo 03/11
    const pc = navegador(c.base);
    await pc.entra('00000123', 'senha-da-conta-a1');
    await pc.api('POST', '/api/dias', { ym: '2026-11', dias: [dia('2026-11-03', '09:00 12:00 13:00 18:00', { obs: 'do computador' })] });

    nav.comRede();
    const r = await f.envia();
    const conf = r.conflitos[0];
    const m = await nav.api('GET', '/api/mes/2026-11');
    const d3 = m.dado.dias.find((x) => x.d === '2026-11-03');
    return {
      ok: r.enviados.length === 1 && r.enviados[0].d === '2026-11-04' &&
          r.conflitos.length === 1 && conf.d === '2026-11-03' &&
          conf.meu.obs === 'do celular' && conf.dele.obs === 'do computador' &&
          f.conta() === 0 && d3.obs === 'do computador',
      obs: `04/11 foi enviado e 03/11 voltou como conflito, com "${conf.meu.obs}" de um lado e "${conf.dele.obs}" do outro · a fila ficou em ${f.conta()}`,
    };
  } finally { await c.fecha(); }
});

caso('Fila', 'Sessão encerrada no meio não perde a pendência', async () => {
  const c = await sobe();
  try {
    const nav = navegador(c.base);
    await prepara(c, nav, [{ matricula: '00000123', email: 'a@exemplo.test', senha: 'senha-da-conta-a1' }]);
    await nav.entra('00000123', 'senha-da-conta-a1');
    const loja = memoria();
    const f = criaFila({ storage: loja, api: nav.api });
    f.entra('00000123');
    f.poe(dia('2026-11-03', '08:00 12:00 13:00 17:00'));
    await nav.sai();                                  // a sessao acaba antes do envio
    const r = await f.envia();
    const aindaLa = f.conta();
    await nav.entra('00000123', 'senha-da-conta-a1');  // entra de novo
    const r2 = await f.envia();
    return {
      ok: r.erro && r.erro.tipo === 'sessao' && aindaLa === 1 && r2.enviados.length === 1 && f.conta() === 0,
      obs: `sem sessão: ${r.erro.tipo}, ${aindaLa} dia continuou na fila · depois de entrar de novo, enviou e a fila zerou`,
    };
  } finally { await c.fecha(); }
});

/* ---------- PWA ---------- */

caso('PWA', 'O manifesto instala o aplicativo na tela inicial', async () => {
  const c = await sobe();
  try {
    const r = await fetch(c.base + '/manifest.webmanifest');
    const m = await r.json();
    return {
      ok: r.headers.get('content-type').includes('manifest') && m.display === 'standalone' &&
          m.start_url === '/' && m.icons.length >= 2 && m.lang === 'pt-BR',
      obs: `"${m.short_name}" em ${m.display}, começando em ${m.start_url}, com ${m.icons.length} ícones`,
    };
  } finally { await c.fecha(); }
});

caso('PWA', 'O service worker nunca guarda dado de ponto', () => {
  const sw = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
  const temGuarda = /pathname\.startsWith\('\/api\/'\)\s*\)\s*return/.test(sw);
  const naCasca = /const ARQUIVOS = \[([\s\S]*?)\]/.exec(sw)[1];
  const temApi = /\/api\//.test(naCasca);
  return {
    ok: temGuarda && !temApi,
    obs: temGuarda && !temApi
      ? 'toda chamada a /api/ passa direto para a rede e nenhuma entra na lista da casca'
      : `guarda contra /api/: ${temGuarda} · /api/ dentro da casca: ${temApi}`,
  };
});

caso('PWA', 'A casca listada no service worker existe toda', async () => {
  const c = await sobe();
  try {
    const sw = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
    const lista = /const ARQUIVOS = \[([\s\S]*?)\]/.exec(sw)[1]
      .split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    const faltando = [];
    for (const p of lista) {
      const r = await fetch(c.base + p, { method: 'GET' });
      if (!r.ok) faltando.push(`${p} -> ${r.status}`);
    }
    return {
      ok: faltando.length === 0 && lista.length >= 8,
      obs: faltando.length ? 'faltam: ' + faltando.join(', ') : `os ${lista.length} arquivos da casca respondem`,
    };
  } finally { await c.fecha(); }
});

caso('PWA', 'A página não busca nada fora do próprio endereço', () => {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(WEB, 'app.mjs'), 'utf8');
  const fora = [...(html + app).matchAll(/(?:src|href)=["']([a-z]+:)?\/\/[^"']+/g)].map((m) => m[0]);
  const linksExternos = [...app.matchAll(/https?:\/\/[^'"`\s)]+/g)].map((m) => m[0])
    .filter((u) => !/wa\.me/.test(u));
  return {
    ok: fora.length === 0 && linksExternos.length === 0,
    obs: fora.length || linksExternos.length
      ? 'de fora: ' + [...fora, ...linksExternos].join(', ')
      : 'nenhum script, estilo ou imagem vem de outro servidor (o link do WhatsApp é o próprio WhatsApp, aberto pela pessoa)',
  };
});

caso('PWA', 'O leitor de PDF vem junto do aplicativo, na versão do index.html', async () => {
  const c = await sobe();
  try {
    const versao = require('../montar-pdfjs.cjs').versao();
    const r = await fetch(c.base + '/vendor/pdf.min.mjs');
    const txt = fs.readFileSync(path.join(WEB, 'vendor', 'VERSAO.txt'), 'utf8');
    const app = fs.readFileSync(path.join(WEB, 'app.mjs'), 'utf8');
    return {
      ok: r.ok && txt.includes(versao) && /isEvalSupported: false/.test(app) && /vendor\/pdf\.worker\.min\.mjs/.test(app),
      obs: `pdf.js ${versao} servido pelo próprio aplicativo, com isEvalSupported:false (a falha CVE-2024-4367 não volta pela porta do celular)`,
    };
  } finally { await c.fecha(); }
});

caso('PWA', 'O formulário de entrada deixa o navegador guardar a senha', () => {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  return {
    ok: /autocomplete="username"/.test(html) && /autocomplete="current-password"/.test(html) &&
        /autocomplete="new-password"/.test(html),
    obs: 'matrícula como username, senha como current-password e a nova como new-password',
  };
});

/* ---------- saida ---------- */

(async () => {
  const url = require('node:url').pathToFileURL(path.join(__dirname, '..', 'web', 'fila.mjs')).href;
  ({ criaFila, CHAVE } = await import(url));
  await Promise.all(CASOS.map(async (c) => {
    let r;
    try { r = (await c.fn()) || { ok: true, obs: '' }; }
    catch (e) { r = { ok: false, obs: 'ERRO: ' + e.message }; }
    R.push({ id: c.id, grupo: c.grupo, nome: c.nome, ...r });
  }));
  R.sort((a, b) => a.id - b.id);
  const fal = R.filter((r) => !r.ok);
  for (const r of R) console.log(`${r.ok ? 'PASSOU ' : 'FALHOU '} #${String(r.id).padStart(2, '0')} [${r.grupo}] ${r.nome} — ${r.obs}`);
  console.log(`\nTotal: ${R.length} · passou ${R.length - fal.length} · falhou ${fal.length}`);
  fs.writeFileSync(path.join(__dirname, 'resultado-fase2.json'), JSON.stringify(R, null, 1));
  if (fal.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
