'use strict';
/* Prova que a calculadora do celular responde igual a do computador.

   A conta inversa — a que horas sair para o dia fechar no saldo pedido — e a unica parte
   que o aplicativo refaz, porque no index.html ela esta misturada com a tela. Entao aqui
   ela e comparada com a pagina de verdade, combinacao por combinacao: hora de saida, como
   o dia fecha e em quanto o mes fica.

   Rodar:  node testes/calculadora.test.js
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

const DECL = /(?:const|let) todayISO=iso\(new Date\(\)\);(?:\/\*[^*]*\*\/)?/;
const BASE = (() => {
  const t = fs.readFileSync(PAGINA, 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
  if (!DECL.test(t)) throw new Error('nao achei a declaracao de todayISO no index.html');
  return t.replace(DECL, `let todayISO='${HOJE}';`);
})();

function abrePagina(relatorio) {
  const dom = new JSDOM(BASE, {
    runScripts: 'dangerously', url: 'https://teste.local/', pretendToBeVisual: true,
    beforeParse(win) { win.localStorage.clear(); },
  });
  const w = dom.window;
  const d = w.document;
  if (relatorio) {
    d.getElementById('txt').value = relatorio;
    d.getElementById('btnTxt').click();
  }
  return {
    w, d,
    calc(v) {
      for (const [k, x] of Object.entries(v)) {
        const e = d.getElementById(k);
        e.value = x == null ? '' : x;
        e.dispatchEvent(new w.Event('input'));
      }
      return (d.getElementById('hoje') || { textContent: '' }).textContent.replace(/\s+/g, ' ').trim();
    },
    estado() { return JSON.parse(w.localStorage.getItem('cartinhas.v4') || '{}'); },
  };
}

/* ---------- cenarios ---------- */

const d2 = (dd, mm, y = 2026) => `${String(dd).padStart(2, '0')}/${String(mm).padStart(2, '0')}/${y}`;
const L = (dd, mm, marcas, carga = '08:00', occ = 'Inter Jornada;') =>
  `${d2(dd, mm)} ${marcas} ${carga} ${occ}`.replace(/\s+/g, ' ');

const CENARIOS = [
  { nome: 'dia comum de 8 h', rel: [L(3, 11, '08:00 12:00 13:00 17:00'), L(26, 11, '', '08:00', 'Inter Jornada;')].join('\n') },
  { nome: 'dia com hora extra autorizada', rel: [L(3, 11, '08:00 12:00 13:00 17:00'), L(26, 11, '08:00 12:00 13:00 18:00', '08:00', 'Extras 01:00; HE autorizada;')].join('\n') },
  { nome: 'dia com abono de 4 h', rel: [L(3, 11, '08:00 12:00 13:00 17:00'), L(26, 11, '13:07 17:38', '08:00', 'Afastamento: CONSULTA; Total 04:00;')].join('\n') },
  { nome: 'jornada de 6 h', rel: [L(3, 11, '08:00 12:00 13:00 17:00'), L(26, 11, '08:00 14:00', '06:00')].join('\n') },
  { nome: 'mes com debito acumulado', rel: [L(3, 11, '09:05 12:05 13:05 17:31'), L(4, 11, '09:00 12:00 13:00 17:00'), L(26, 11, '', '08:00', 'Inter Jornada;')].join('\n') },
];

const ENTRADAS = ['07:00', '08:00', '09:05'];
const ALMOCOS = [['12:00', '13:00'], ['12:00', '12:20'], [null, null]];
const JORNADAS = ['08:00', '06:00', '07:15'];
const ALVOS = ['0:00', '+1:00', '+2:00', '-1:00', '+0:30', '+3:00'];

const pegaSaida = (t) => (/Pode ir embora às ?(\d{2}:\d{2})/.exec(t) || [])[1] || null;
const pegaFecha = (t) => (/dia fecha em ([−+]\d{2}:\d{2})/.exec(t) || [])[1] || null;
/* O saldo sai como "+1h00" ou "−0h34". A pagina emenda a frase seguinte sem separador,
   entao o recorte pega so o numero, e nao o que vem depois dele. */
const pegaMes = (t) => (/m[êe]s fica em ([−+]?\d+h\d{2})/.exec(t) || [])[1] || null;

async function roda() {
  const reg = await import('file://' + path.join(__dirname, '..', 'web', 'regras.mjs').replace(/\\/g, '/'));
  const cal = await import('file://' + path.join(__dirname, '..', 'web', 'calculo.mjs').replace(/\\/g, '/'));
  reg.defineHoje(HOJE);

  for (const cen of CENARIOS) {
    caso('Mesma hora de saída: ' + cen.nome, () => {
      const p = abrePagina(cen.rel);
      const est = p.estado();
      const mes = (est.months && est.months['2026-11']) || { days: [] };
      const diasDoMes = mes.days || [];
      const xh = diasDoMes.find((x) => x.d === HOJE) || { d: HOJE, tipo: 'util', marcas: '', srpMarcas: '' };
      reg.defineDias(diasDoMes);
      const T = reg.totals(true, false, diasDoMes);
      const contrib = (r) => (r.fora ? 0 : r.cred - r.deb);
      const S = T.saldo - contrib(reg.calcDay(xh));

      let n = 0;
      const fora = [];
      for (const E1 of ENTRADAS) {
        for (const [S1, E2] of ALMOCOS) {
          for (const J of JORNADAS) {
            for (const alvo of ALVOS) {
              n++;
              const texto = p.calc({ cE1: E1, cS1: S1, cE2: E2, cS2: '', cJ: J, cAlvo: alvo });
              const daPagina = { saida: pegaSaida(texto), fecha: pegaFecha(texto), mes: pegaMes(texto) };

              const jm = reg.toM(J);
              const sim = { ...xh, carga: jm, futuro: false };
              let e1 = reg.toM(E1), s1 = S1 == null ? null : reg.toM(S1), e2 = E2 == null ? null : reg.toM(E2);
              { let ant = e1, add = 0; const aj = (m) => { if (m == null) return m; if (ant != null && m + add < ant) add += 1440; ant = m + add; return m + add; }; s1 = aj(s1); e2 = aj(e2); }
              const q = cal.horaDeSaida(e1, s1, e2, jm, cal.parseAlvo(alvo), sim);
              let doApp = { saida: null, fecha: null, mes: null };
              if (q.saida != null) {
                const rs = reg.calcDay(sim, [e1, s1, e2, q.saida].filter((m) => m != null).map(reg.clock).join(' '));
                const efd = rs.cred - rs.deb;
                doApp = {
                  saida: reg.clock(q.saida),
                  fecha: (efd < 0 ? '−' : '+') + reg.hm(efd),
                  mes: reg.fmt(S + contrib(rs), true),
                };
              }
              for (const k of ['saida', 'fecha', 'mes']) {
                const a = daPagina[k], b = doApp[k];
                if ((a || '').trim() !== (b || '').trim()) {
                  fora.push(`${E1}/${S1 || '—'}/${E2 || '—'} J${J} alvo ${alvo} · ${k}: pagina "${a}" x app "${b}"`);
                }
              }
            }
          }
        }
      }
      return {
        ok: fora.length === 0,
        obs: fora.length ? `${fora.length} de ${n * 3} comparações diferentes · ` + fora.slice(0, 3).join(' · ')
          : `${n} combinações de entrada, almoço, jornada e alvo: hora de saída, fecho do dia e saldo do mês iguais nos dois`,
      };
    });
  }

  caso('O alvo fora da faixa é limitado igual nos dois', () => {
    const p = abrePagina(CENARIOS[0].rel);
    const fora = [];
    for (const alvo of ['+5:00', '-12:00', '+2:30']) {
      const texto = p.calc({ cE1: '08:00', cS1: '12:00', cE2: '13:00', cS2: '', cJ: '08:00', cAlvo: alvo });
      const q = cal.horaDeSaida(480, 720, 780, 480, cal.parseAlvo(alvo), { d: HOJE, tipo: 'util', marcas: '', srpMarcas: '' });
      const daPagina = pegaSaida(texto);
      const doApp = q.saida == null ? null : reg.clock(q.saida);
      if (daPagina !== doApp) fora.push(`${alvo}: pagina ${daPagina} x app ${doApp}`);
    }
    return { ok: fora.length === 0, obs: fora.length ? fora.join(' · ') : 'alvo acima de +2:00 e abaixo de −jornada chegam ao mesmo limite' };
  });

  caso('Sem entrada, as duas pedem a mesma coisa', () => {
    const p = abrePagina(CENARIOS[0].rel);
    const texto = p.calc({ cE1: '', cS1: '', cE2: '', cS2: '', cJ: '08:00', cAlvo: '0:00' });
    return {
      ok: /Digite a entrada/.test(texto) && pegaSaida(texto) === null,
      obs: `a pagina responde "${texto.slice(0, 60)}…" e nao sugere hora nenhuma`,
    };
  });

  R.sort((a, b) => a.id - b.id);
  const fal = R.filter((r) => !r.ok);
  for (const r of R) console.log(`${r.ok ? 'PASSOU ' : 'FALHOU '} #${String(r.id).padStart(2, '0')} ${r.nome} — ${r.obs}`);
  console.log(`\nTotal: ${R.length} · passou ${R.length - fal.length} · falhou ${fal.length}`);
  fs.writeFileSync(path.join(__dirname, 'resultado-calculadora.json'), JSON.stringify(R, null, 1));
  if (fal.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
}

roda();
