'use strict';
/* Prova que as regras usadas pelo aplicativo sao as MESMAS do Cartinhas do computador.

   Roda os dois lado a lado: a pagina real num navegador simulado (jsdom) e o modulo
   web/regras.mjs extraido dela, e compara campo por campo. Se alguem mudar uma regra so
   de um lado, ou se a extracao pegar um trecho errado, este teste acusa.

   Rodar:  node testes/regras.test.js
*/

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(path.join(__dirname, '..', '..', 'testes', 'node_modules', 'jsdom'));

const PAGINA = path.join(__dirname, '..', '..', 'index.html');
const HOJE = '2026-11-26';

const R = [];
let id = 0;
function caso(nome, fn) {
  id++;
  let r;
  try { r = fn() || { ok: true, obs: '' }; }
  catch (e) { r = { ok: false, obs: 'ERRO: ' + e.message }; }
  R.push({ id, nome, ...r });
}

/* ---------- a pagina ---------- */

const DECL = /(?:const|let) todayISO=iso\(new Date\(\)\);(?:\/\*[^*]*\*\/)?/;
const BASE = (() => {
  const t = fs.readFileSync(PAGINA, 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
  if (!DECL.test(t)) throw new Error('nao achei a declaracao de todayISO no index.html');
  return t.replace(DECL, `let todayISO='${HOJE}';`);
})();

function abrePagina() {
  const dom = new JSDOM(BASE, {
    runScripts: 'dangerously', url: 'https://teste.local/', pretendToBeVisual: true,
    beforeParse(win) { win.localStorage.clear(); },
  });
  return dom.window;
}

/* ---------- casos de dia ---------- */

/* Situacoes que a auditoria ja cobriu na tabela, mais as bordas: turno noturno, marcacao
   impar, tolerancia nos dois sentidos, credito acima de 2 h, abono, HE autorizada,
   jornada de 6 h, dia futuro, folga e feriado trabalhados. */
const DIAS = [
  { nome: 'dia cheio certinho', x: { d: '2026-11-03', tipo: 'util', marcas: '07:02 11:01 12:01 18:05' } },
  { nome: 'dia com debito de 34 min', x: { d: '2026-11-24', tipo: 'util', marcas: '09:05 12:05 13:05 17:31' } },
  { nome: 'tolerancia a favor (+8 min)', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 17:08' } },
  { nome: 'tolerancia contra (-9 min)', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 16:51' } },
  { nome: 'no limite da tolerancia (10 min)', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 17:10' } },
  { nome: 'um minuto alem da tolerancia', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 17:11' } },
  { nome: 'credito acima de 2 h (irregular)', x: { d: '2026-11-05', tipo: 'util', marcas: '06:00 12:00 13:00 19:00' } },
  { nome: 'intervalo curto alem da jornada', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 12:20 19:00' } },
  { nome: 'duas marcacoes apenas', x: { d: '2026-11-25', tipo: 'util', marcas: '13:07 17:38' } },
  { nome: 'marcacao impar', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00' } },
  { nome: 'turno que passa da meia-noite', x: { d: '2026-11-05', tipo: 'util', marcas: '22:00 02:00 03:00 06:00' } },
  { nome: 'jornada de 6 h cumprida', x: { d: '2026-11-25', tipo: 'util', marcas: '08:00 14:00', carga: 360 } },
  { nome: 'jornada de 7h15', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 16:15', carga: 435 } },
  { nome: 'abono digitado cobre o debito', x: { d: '2026-11-25', tipo: 'util', marcas: '13:07 17:38', abono: '4:00' } },
  { nome: 'abono digitado maior que o debito', x: { d: '2026-11-25', tipo: 'util', marcas: '13:07 17:38', abono: '8:00' } },
  { nome: 'abono do proprio relatorio', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00', srp: { abono: 240, extra: 0 } } },
  { nome: 'abono de dia inteiro (-1)', x: { d: '2026-11-05', tipo: 'util', marcas: '', srp: { abono: -1, extra: 0 } } },
  { nome: 'hora extra autorizada', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 18:00', srp: { extra: 60, abono: 0 } } },
  { nome: 'HE autorizada maior que o excedente', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 17:30', srp: { extra: 120, abono: 0 } } },
  { nome: 'trabalho em folga', x: { d: '2026-11-07', tipo: 'folga', marcas: '08:00 12:00' } },
  { nome: 'trabalho em feriado', x: { d: '2026-11-20', tipo: 'feriado', marcas: '08:00 12:00 13:00 17:00' } },
  { nome: 'ferias', x: { d: '2026-11-09', tipo: 'ferias', marcas: '' } },
  { nome: 'folga sem marcacao', x: { d: '2026-11-08', tipo: 'folga', marcas: '' } },
  { nome: 'dia de hoje ainda aberto', x: { d: HOJE, tipo: 'util', marcas: '08:00' } },
  { nome: 'dia de hoje fechado', x: { d: HOJE, tipo: 'util', marcas: '08:00 12:00 13:00 17:00' } },
  { nome: 'dia futuro', x: { d: '2026-11-30', tipo: 'util', marcas: '', futuro: true } },
  { nome: 'dia futuro ja preenchido', x: { d: '2026-11-30', tipo: 'util', marcas: '08:00 12:00 13:00 17:00', futuro: true } },
  { nome: 'dia sem marcacao nenhuma', x: { d: '2026-11-05', tipo: 'util', marcas: '' } },
  { nome: 'seis marcacoes', x: { d: '2026-11-05', tipo: 'util', marcas: '08:00 10:00 10:15 12:00 13:00 17:00' } },
  { nome: 'marcacoes fora de ordem (vira noturno)', x: { d: '2026-11-05', tipo: 'util', marcas: '18:00 20:00 02:00 04:00' } },
];

/* ---------- relatorios de exemplo ---------- */

const d2 = (d, m, y = 2026) => `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
const L = (d, m, marcas, carga = '08:00', occ = 'Inter Jornada;') =>
  `${d2(d, m)} ${marcas} ${carga} ${occ}`.replace(/\s+/g, ' ');

const RELATORIOS = [
  { nome: 'relatorio simples', txt: [L(3, 11, '08:00 12:00 13:00 17:00'), L(4, 11, '08:00 12:00 13:00 17:30')].join('\n') },
  { nome: 'com abono e afastamento', txt: [L(5, 11, '', '08:00', 'Afastamento: CONSULTA MEDICA; Total 04:00;')].join('\n') },
  { nome: 'com credito irregular e atraso', txt: [L(6, 11, '06:00 12:00 13:00 19:00', '08:00', 'Credito irregular 01:00; Atraso 00:10;')].join('\n') },
  { nome: 'ferias e feriado', txt: [L(9, 11, '', '00:00', 'FERIAS;'), L(20, 11, '08:00 12:00', '00:00', 'Feriado;')].join('\n') },
  { nome: 'jornada de 6 h', txt: [L(25, 11, '08:00 14:00', '06:00')].join('\n') },
  { nome: 'HE autorizada', txt: [L(26, 11, '08:00 12:00 13:00 18:00', '08:00', 'Extras 01:00; HE autorizada;')].join('\n') },
  { nome: 'marcacao impar', txt: [L(27, 11, '08:00 12:00 13:00', '08:00', 'Marcacao impar;')].join('\n') },
  { nome: 'compensacao mensal', txt: [L(28, 11, '08:00 12:00 13:00 17:00', '08:00', 'COMP. MENSAL DEB;')].join('\n') },
  { nome: 'turno noturno', txt: [L(10, 11, '22:00 02:00 03:00 06:00', '08:00')].join('\n') },
  { nome: 'cabecalho com titular', txt: ['Empregado: FULANO DE TAL   CEI: 123', L(11, 11, '08:00 12:00 13:00 17:00')].join('\n') },
];

/* ---------- comparacao ---------- */

const CAMPOS = ['worked', 'inter', 'desc', 'odd', 'carga', 'cred', 'irr', 'deb', 'extra', 'tol', 'fora', 'abono'];

function difere(a, b) {
  const fora = [];
  for (const k of CAMPOS) {
    const x = a[k] === undefined ? null : a[k];
    const y = b[k] === undefined ? null : b[k];
    if (x !== y) fora.push(`${k}: pagina ${JSON.stringify(x)} x app ${JSON.stringify(y)}`);
  }
  if (JSON.stringify(a.marks) !== JSON.stringify(b.marks)) {
    fora.push(`marks: pagina ${JSON.stringify(a.marks)} x app ${JSON.stringify(b.marks)}`);
  }
  return fora;
}

async function roda() {
  const regras = await import('file://' + path.join(__dirname, '..', 'web', 'regras.mjs').replace(/\\/g, '/'));
  regras.defineHoje(HOJE);
  const w = abrePagina();
  const daPagina = w.cartinhasTeste.calcDay;

  caso('A pagina e o modulo concordam sobre o dia de hoje', () => ({
    ok: w.cartinhasTeste.hoje() === regras.hoje(),
    obs: `pagina ${w.cartinhasTeste.hoje()} · app ${regras.hoje()}`,
  }));

  for (const c of DIAS) {
    caso('Mesmo resultado: ' + c.nome, () => {
      const a = daPagina(JSON.parse(JSON.stringify(c.x)));
      const b = regras.calcDay(JSON.parse(JSON.stringify(c.x)));
      const fora = difere(a, b);
      return {
        ok: fora.length === 0,
        obs: fora.length ? fora.join(' · ')
          : `trab ${regras.hm(b.worked)} · cred ${b.cred} · deb ${b.deb} · extra ${b.extra}${b.abono ? ' · abono ' + b.abono : ''}${b.fora ? ' · fora do banco' : ''}`,
      };
    });
  }

  /* A leitura do relatorio: compara o que a pagina guardou com o que o modulo devolve. */
  for (const r of RELATORIOS) {
    caso('Mesma leitura: ' + r.nome, () => {
      const p = abrePagina();
      p.document.getElementById('txt').value = r.txt;
      p.document.getElementById('btnTxt').click();
      const est = JSON.parse(p.localStorage.getItem('cartinhas.v4') || '{}');
      const doModulo = regras.parseReport(r.txt);
      const fora = [];
      for (const n of doModulo) {
        const ym = n.d.slice(0, 7);
        const mes = est.months && est.months[ym];
        const naPagina = ((mes && mes.days) || []).find((x) => x.d === n.d);
        if (!naPagina) { fora.push(`${n.d}: a pagina nao guardou esse dia`); continue; }
        for (const k of ['srpMarcas', 'tipo', 'obs']) {
          if ((naPagina[k] || '') !== (n[k] || '')) fora.push(`${n.d} ${k}: "${naPagina[k]}" x "${n[k]}"`);
        }
        if ((naPagina.carga || null) !== (n.carga || null)) fora.push(`${n.d} carga: ${naPagina.carga} x ${n.carga}`);
        if (JSON.stringify(naPagina.srp || null) !== JSON.stringify(n.srp || null)) {
          fora.push(`${n.d} srp: ${JSON.stringify(naPagina.srp)} x ${JSON.stringify(n.srp)}`);
        }
      }
      return {
        ok: fora.length === 0 && doModulo.length > 0,
        obs: fora.length ? fora.slice(0, 3).join(' · ') : `${doModulo.length} dia(s) lidos igual: ${doModulo.map((x) => x.d.slice(8) + '/' + x.d.slice(5, 7)).join(', ')}`,
      };
    });
  }

  caso('Mesmo titular lido do cabecalho', () => {
    const txt = 'Empregado: FULANO DE TAL   CEI: 123\n' + L(3, 11, '08:00 12:00 13:00 17:00');
    const m = regras.parseMeta(txt);
    return { ok: m.nome === 'FULANO DE TAL', obs: `o modulo leu "${m.nome}"` };
  });

  caso('Mesma uniao por data (relatorio parcial)', () => {
    const antigos = [
      { d: '2026-11-03', tipo: 'util', marcas: '08:00 12:00 13:00 18:00', srpMarcas: '08:00 12:00 13:00 17:00', obs: 'corrigi a mao', abono: '1:00' },
      { d: '2026-11-04', tipo: 'util', marcas: '08:00 12:00 13:00 17:00', srpMarcas: '08:00 12:00 13:00 17:00', obs: '' },
    ];
    const novos = [{ d: '2026-11-04', tipo: 'util', marcas: '08:00 12:00 13:00 17:30', srpMarcas: '08:00 12:00 13:00 17:30', obs: '' }];
    const a = w.cartinhasTeste.uneDias(JSON.parse(JSON.stringify(antigos)), JSON.parse(JSON.stringify(novos)), '2026-11');
    const b = regras.uneDias(JSON.parse(JSON.stringify(antigos)), JSON.parse(JSON.stringify(novos)), '2026-11');
    const ok = JSON.stringify(a.days) === JSON.stringify(b.days);
    return {
      ok,
      obs: ok ? `os dois mantiveram ${b.days.length} dias, com 03/11 em "${b.days[0].marcas}" e 04/11 em "${b.days[1].marcas}"`
        : `pagina ${JSON.stringify(a.days)} x app ${JSON.stringify(b.days)}`,
    };
  });

  /* A lista de feriados nao aparece na ponte de testes da pagina, entao a comparacao e
     pelo efeito: ao abrir um mes, a pagina marca sozinha os dias sem carga. */
  caso('A lista de feriados e a mesma', () => {
    const fora = [];
    const achados = [];
    for (const mes of [4, 11, 12]) {
      const p = abrePagina();
      p.document.getElementById('txt').value = L(1, mes, '08:00 12:00 13:00 17:00');
      p.document.getElementById('btnTxt').click();
      const ym = `2026-${String(mes).padStart(2, '0')}`;
      const est = JSON.parse(p.localStorage.getItem('cartinhas.v4') || '{}');
      const dias = ((est.months && est.months[ym] && est.months[ym].days) || []);
      if (!dias.length) { fora.push(`${ym}: a pagina nao abriu esse mes`); continue; }
      for (const d of dias) {
        if (d.d.endsWith('-01')) continue;                    // esse veio no relatorio
        const semana = regras.wd(d.d);
        const esperado = (semana === 0 || semana === 6) ? 'folga' : regras.ehFeriado(d.d) ? 'feriado' : 'util';
        if (d.tipo !== esperado) fora.push(`${d.d}: pagina "${d.tipo}" x app "${esperado}"`);
        if (regras.ehFeriado(d.d)) achados.push(d.d);
      }
    }
    return {
      ok: fora.length === 0 && achados.length >= 4,
      obs: fora.length ? fora.slice(0, 4).join(' · ') : `os dois marcam os mesmos dias sem carga: ${achados.join(', ')}`,
    };
  });

  caso('O modulo avisa quando a extracao nao reconhece o index.html', () => {
    const { pega } = require('../montar-regras.cjs');
    let erro = '';
    try { pega(['const outraCoisa=1;'], 'calcDay'); } catch (e) { erro = e.message; }
    return { ok: /nao achei a declaracao/.test(erro), obs: `a montagem para com "${erro}"` };
  });

  R.sort((a, b) => a.id - b.id);
  const fal = R.filter((r) => !r.ok);
  for (const r of R) console.log(`${r.ok ? 'PASSOU ' : 'FALHOU '} #${String(r.id).padStart(2, '0')} ${r.nome} — ${r.obs}`);
  console.log(`\nTotal: ${R.length} · passou ${R.length - fal.length} · falhou ${fal.length}`);
  fs.writeFileSync(path.join(__dirname, 'resultado-regras.json'), JSON.stringify(R, null, 1));
  if (fal.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}

roda();
