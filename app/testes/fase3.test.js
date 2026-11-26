'use strict';
/* Testes de aceite da fase 3: trazer os meses do arquivo para a conta.

   Usa um arquivo de exemplo, nao o cartinhas-dados.json de ninguem: dado real de ponto nao
   entra em teste nem em repositorio. O que se prova aqui e o roteiro — conferir o formato e
   o titular antes de gravar, bater dia a dia depois, e poder repetir sem mudar nada.

   Rodar:  node testes/fase3.test.js
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const banco = require('../lib/banco');
const contas = require('../lib/contas');
const ponto = require('../lib/ponto');
const migrar = require('../migrar.cjs');

const R = [];
const CASOS = [];
function caso(grupo, nome, fn) { CASOS.push({ id: CASOS.length + 1, grupo, nome, fn }); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cartinhas-fase3-'));
const arquivoCom = (o) => {
  const p = path.join(TMP, `dados-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(o));
  return p;
};

function bancoCom(matricula, nome) {
  const p = path.join(TMP, `banco-${Math.random().toString(36).slice(2)}.sqlite`);
  const db = banco.abre(p);
  const c = contas.criaAdmin(db, matricula, 'teste@exemplo.test');
  if (nome) db.prepare('UPDATE contas SET nome = ? WHERE id = ?').run(nome, c.id);
  db.close();
  return p;
}

/* Um mes de exemplo parecido com o de verdade: dias normais, um com abono, um corrigido a
   mao, um feriado, um fim de semana e um dia que ainda nao veio no relatorio mas ja tem
   observacao — foi esse que pegou a perda da marca "ainda sem relatorio". */
const MES = {
  meta: { nome: 'FULANO DE TAL', periodo: '01/11/2026 a 30/11/2026' },
  days: [
    { d: '2026-11-03', tipo: 'util', marcas: '07:02 11:01 12:01 18:05', srpMarcas: '07:02 11:01 12:01 18:05', obs: '', srp: { atraso: '', falta: '', irr: '', impar: false, abono: 0, extra: 0, comp: '', lanc: '' } },
    { d: '2026-11-04', tipo: 'util', marcas: '09:05 12:05 13:05 17:31', srpMarcas: '09:05 12:05 13:05 17:31', obs: '' },
    { d: '2026-11-05', tipo: 'util', marcas: '08:00 12:00 13:00 18:00', srpMarcas: '08:00 12:00 13:00 17:00', obs: 'corrigi à mão' },
    { d: '2026-11-06', tipo: 'util', marcas: '13:07 17:38', srpMarcas: '13:07 17:38', abono: '4:00', obs: 'consulta' },
    { d: '2026-11-07', tipo: 'folga', marcas: '', srpMarcas: '', obs: '' },
    { d: '2026-11-09', tipo: 'ferias', marcas: '', srpMarcas: '', obs: '', tipoManual: true },
    { d: '2026-11-10', tipo: 'util', marcas: '08:00 14:00', srpMarcas: '08:00 14:00', carga: 360, obs: '' },
    { d: '2026-11-20', tipo: 'feriado', marcas: '', srpMarcas: '', obs: '' },
    { d: '2026-11-27', tipo: 'util', marcas: '', srpMarcas: '', obs: 'cirurgia', futuro: true },
  ],
};

const bom = () => ({ app: 'Cartinhas', versao: 1, cur: '2026-11', months: { '2026-11': JSON.parse(JSON.stringify(MES)) } });

async function migra(arquivo, bancoArq, extra = {}) {
  const guardado = [];
  const log = console.log, err = console.error;
  console.log = (...a) => guardado.push(a.join(' '));
  console.error = (...a) => guardado.push('ERRO: ' + a.join(' '));
  let r = null, falhou = null, saiuCom = 0;
  try {
    r = await migrar.roda({ arquivo, matricula: '00000123', banco: bancoArq, ...extra });
    saiuCom = (r && r.codigo) || 0;
  } catch (e) {
    falhou = e;
    saiuCom = e instanceof migrar.Saida ? e.codigo : 99;
    if (saiuCom === 99) guardado.push('ERRO INESPERADO: ' + e.message);
  }
  console.log = log; console.error = err;
  return { r, falhou, saiuCom, texto: guardado.join('\n') };
}

/* ---------- casos ---------- */

caso('Migração', 'Confere o formato antes de gravar: JSON de outro programa não passa', async () => {
  const ruins = [
    { outroApp: 'ROTA', registros: [{ id: 1 }] },
    { months: { '2026-13': { days: [] } } },
    { months: { '2026-11': { days: [{ d: '03/11/2026' }] } } },
    { months: { '2026-11': { days: [{ d: '2026-11-03', tipo: 'inventado' }] } } },
    { months: { '2026-11': { days: [{ d: '2026-10-30', marcas: '' }] } } },
    { months: { '2026-11': { dias: [] } } },
  ];
  const fora = [];
  for (const o of ruins) {
    const erros = migrar.confere(o);
    if (!erros.length) fora.push(JSON.stringify(o).slice(0, 50));
  }
  return {
    ok: fora.length === 0 && migrar.confere(bom()).length === 0,
    obs: fora.length ? 'passou sem reclamar: ' + fora.join(' · ') : `os ${ruins.length} arquivos fora do formato são recusados, e o do Cartinhas passa`,
  };
});

caso('Migração', 'Sem --confirmar não grava nada, só mostra', async () => {
  const b = bancoCom('00000123');
  const s = await migra(arquivoCom(bom()), b);
  const db = banco.abre(b);
  const n = db.prepare('SELECT COUNT(*) n FROM dias').get().n;
  db.close();
  return {
    ok: n === 0 && /Nada foi gravado/.test(s.texto) && /2026-11: 7 dia/.test(s.texto),
    obs: `mostrou os 7 dias com conteúdo de novembro e o banco seguiu com ${n} dia(s)`,
  };
});

caso('Migração', 'Com --confirmar, grava e confere dia a dia', async () => {
  const b = bancoCom('00000123');
  const s = await migra(arquivoCom(bom()), b, { confirmar: true });
  const db = banco.abre(b);
  const conta = db.prepare('SELECT id, nome FROM contas WHERE matricula = ?').get('00000123');
  const lido = ponto.mes(db, conta.id, '2026-11');
  db.close();
  const d5 = lido.dias.find((x) => x.d === '2026-11-05');
  const d6 = lido.dias.find((x) => x.d === '2026-11-06');
  const d27 = lido.dias.find((x) => x.d === '2026-11-27');
  const d9 = lido.dias.find((x) => x.d === '2026-11-09');
  return {
    ok: s.saiuCom === 0 && /Tudo conferido/.test(s.texto) && lido.dias.length === 7 &&
        d5.marcas === '08:00 12:00 13:00 18:00' && d5.srpMarcas === '08:00 12:00 13:00 17:00' &&
        d6.abono === '4:00' && d6.obs === 'consulta' &&
        d9.tipo === 'ferias' && d9.tipoManual === true &&
        d27.futuro === true && conta.nome === 'FULANO DE TAL',
    obs: `${lido.dias.length} dias gravados (o sábado e o feriado vazios a tela desenha sozinha) · marcação corrigida e a do SRP preservadas · abono ${d6.abono} e "${d6.obs}" · férias marcadas à mão · 27/11 continua como "ainda sem relatório" · titular ${conta.nome}`,
  };
});

caso('Migração', 'A marca de "ainda sem relatório" não pode se perder', async () => {
  const b = bancoCom('00000123');
  await migra(arquivoCom(bom()), b, { confirmar: true });
  const db = banco.abre(b);
  const conta = db.prepare('SELECT id FROM contas WHERE matricula = ?').get('00000123');
  const lido = ponto.mes(db, conta.id, '2026-11');
  db.close();
  const reg = await import(require('node:url').pathToFileURL(path.join(__dirname, '..', 'web', 'regras.mjs')).href);
  reg.defineHoje('2099-12-31');
  const d27 = lido.dias.find((x) => x.d === '2026-11-27');
  const r = reg.calcDay(d27);
  const doArquivo = reg.calcDay(MES.days.find((x) => x.d === '2026-11-27'));
  return {
    ok: d27.futuro === true && r.fora === true && r.deb === doArquivo.deb,
    obs: `um dia passado sem marcação e sem relatório segue fora do saldo (débito ${r.deb}, como no arquivo) — se a marca se perdesse, ele viraria um dia inteiro devendo`,
  };
});

caso('Migração', 'Repetir a migração não muda o resultado', async () => {
  const b = bancoCom('00000123');
  const arq = arquivoCom(bom());
  await migra(arq, b, { confirmar: true });
  const db1 = banco.abre(b);
  const conta = db1.prepare('SELECT id FROM contas WHERE matricula = ?').get('00000123');
  const antes = ponto.mes(db1, conta.id, '2026-11').dias.map((x) => ({ ...x, rev: 0, salvoEm: 0 }));
  db1.close();
  const s = await migra(arq, b, { confirmar: true });
  const db2 = banco.abre(b);
  const depois = ponto.mes(db2, conta.id, '2026-11').dias.map((x) => ({ ...x, rev: 0, salvoEm: 0 }));
  db2.close();
  return {
    ok: s.saiuCom === 0 && JSON.stringify(antes) === JSON.stringify(depois) && /Tudo conferido/.test(s.texto),
    obs: `a segunda passada devolveu os mesmos ${depois.length} dias, com o mesmo conteúdo`,
  };
});

caso('Migração', 'Arquivo de outro titular não entra sem confirmação', async () => {
  const b = bancoCom('00000123', 'BELTRANO');
  const s = await migra(arquivoCom(bom()), b, { confirmar: true });
  const db = banco.abre(b);
  const n = db.prepare('SELECT COUNT(*) n FROM dias').get().n;
  db.close();
  return {
    ok: s.saiuCom === 1 && n === 0 && /a conta é de BELTRANO e o arquivo é de FULANO DE TAL/.test(s.texto) &&
        /--confirmar-titular/.test(s.texto),
    obs: `recusou antes de gravar (${n} dia no banco) e disse o que fazer se for mesmo para gravar`,
  };
});

caso('Migração', 'Com --confirmar-titular, grava e mantém o titular da conta', async () => {
  const b = bancoCom('00000123', 'BELTRANO');
  const s = await migra(arquivoCom(bom()), b, { confirmar: true, 'confirmar-titular': true });
  const db = banco.abre(b);
  const c = db.prepare('SELECT id, nome FROM contas WHERE matricula = ?').get('00000123');
  const n = ponto.mes(db, c.id, '2026-11').dias.length;
  db.close();
  return {
    ok: s.saiuCom === 0 && n === 7 && c.nome === 'BELTRANO',
    obs: `gravou os ${n} dias e a conta seguiu em nome de ${c.nome}`,
  };
});

caso('Migração', 'Mais de um titular no arquivo é avisado', async () => {
  const o = bom();
  o.months['2026-10'] = { meta: { nome: 'OUTRA PESSOA' }, days: [{ d: '2026-10-01', tipo: 'util', marcas: '08:00 12:00 13:00 17:00', srpMarcas: '08:00 12:00 13:00 17:00', obs: '' }] };
  const s = await migra(arquivoCom(o), bancoCom('00000123'), {});
  return {
    ok: /mais de um titular/.test(s.texto),
    obs: 'o aviso aparece antes de qualquer gravação',
  };
});

caso('Migração', 'Sem conta no banco, não grava e explica', async () => {
  const p = path.join(TMP, `vazio-${Math.random().toString(36).slice(2)}.sqlite`);
  banco.abre(p).close();
  const s = await migra(arquivoCom(bom()), p, { confirmar: true });
  return {
    ok: s.saiuCom === 1 && /Não existe conta com a matrícula/.test(s.texto) && /convite/.test(s.texto),
    obs: 'diz que a conta precisa existir antes, e como criar',
  };
});

caso('Migração', 'Dias sem nada não ocupam espaço no banco', async () => {
  const o = bom();
  for (let d = 11; d <= 19; d++) {
    o.months['2026-11'].days.push({ d: `2026-11-${d}`, tipo: 'util', marcas: '', srpMarcas: '', obs: '', futuro: true });
  }
  const b = bancoCom('00000123');
  await migra(arquivoCom(o), b, { confirmar: true });
  const db = banco.abre(b);
  const n = db.prepare('SELECT COUNT(*) n FROM dias').get().n;
  db.close();
  return {
    ok: n === 9,
    obs: `dos ${o.months['2026-11'].days.length} dias do arquivo, só os ${n} com conteúdo foram gravados; os vazios o aplicativo desenha sozinho`,
  };
});

/* ---------- saida ---------- */

(async () => {
  for (const c of CASOS) {
    let r;
    try { r = (await c.fn()) || { ok: true, obs: '' }; }
    catch (e) { r = { ok: false, obs: 'ERRO: ' + e.message }; }
    R.push({ id: c.id, grupo: c.grupo, nome: c.nome, ...r });
  }
  const fal = R.filter((r) => !r.ok);
  for (const r of R) console.log(`${r.ok ? 'PASSOU ' : 'FALHOU '} #${String(r.id).padStart(2, '0')} [${r.grupo}] ${r.nome} — ${r.obs}`);
  console.log(`\nTotal: ${R.length} · passou ${R.length - fal.length} · falhou ${fal.length}`);
  fs.writeFileSync(path.join(__dirname, 'resultado-fase3.json'), JSON.stringify(R, null, 1));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  if (fal.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
