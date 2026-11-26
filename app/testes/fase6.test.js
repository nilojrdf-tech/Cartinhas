'use strict';
/* Testes de aceite da fase 6: backup e restauração.

   O plano pede copia diaria consistente, retencao de 30 dias e roteiro de restauracao
   conferido — restaurar fora do banco em uso e bater contas e saldos. E o que se prova
   aqui, com bancos de mentira numa pasta temporaria.

   Rodar:  node testes/fase6.test.js
*/

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const banco = require('../lib/banco');
const contas = require('../lib/contas');
const ponto = require('../lib/ponto');
const backup = require('../backup.cjs');

const R = [];
const CASOS = [];
function caso(nome, fn) { CASOS.push({ id: CASOS.length + 1, nome, fn }); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cartinhas-fase6-'));
const novo = (sufixo) => path.join(TMP, `${sufixo}-${Math.random().toString(36).slice(2)}`);

/* Um banco com duas contas e alguns dias, como seria na VPS. */
function bancoCheio() {
  const arq = novo('banco') + '.sqlite';
  const db = banco.abre(arq);
  const a = contas.criaAdmin(db, '12345678', 'nilo@exemplo.test');
  db.prepare('INSERT INTO contas (matricula, email, admin, ativa, criada_em) VALUES (?,?,0,1,?)')
    .run('00000123', 'marcos@exemplo.test', Date.now());
  const b = db.prepare('SELECT id FROM contas WHERE matricula = ?').get('00000123');
  for (const [conta, dia, marcas] of [
    [a.id, '2026-11-03', '08:00 12:00 13:00 17:00'],
    [a.id, '2026-11-04', '08:00 12:00 13:00 18:00'],
    [b.id, '2026-11-03', '09:00 12:00 13:00 17:00'],
  ]) {
    ponto.grava(db, { id: conta, matricula: 'x' }, {
      ym: dia.slice(0, 7),
      dias: [{ d: dia, rev: 0, marcas, srpMarcas: marcas, tipo: 'util' }],
    });
  }
  db.close();
  return arq;
}

const resumo = (arq) => {
  const db = banco.abre(arq);
  const r = {
    contas: db.prepare('SELECT matricula, admin, ativa FROM contas ORDER BY matricula').all(),
    dias: db.prepare('SELECT conta_id, data, marcas FROM dias ORDER BY conta_id, data').all(),
  };
  db.close();
  return r;
};

/* ---------- casos ---------- */

caso('A cópia diária sai consistente e com tudo dentro', () => {
  const origem = bancoCheio();
  const pasta = novo('backups');
  const r = backup.roda({ banco: origem, pasta });
  const antes = resumo(origem);
  const depois = resumo(r.destino);
  return {
    ok: r.ok && fs.existsSync(r.destino) &&
        JSON.stringify(antes) === JSON.stringify(depois) &&
        r.contas === 2 && r.dias === 3,
    obs: `${path.basename(r.destino)}: íntegra, ${r.contas} contas e ${r.dias} dias, idêntica à origem`,
  };
});

caso('A cópia é feita com o aplicativo em uso, sem travar o banco', () => {
  const origem = bancoCheio();
  const pasta = novo('backups');
  const db = banco.abre(origem);                       // o "aplicativo" continua aberto
  const conta = db.prepare('SELECT id FROM contas WHERE matricula = ?').get('12345678');
  const r = backup.roda({ banco: origem, pasta });
  // e continua gravando depois da copia
  ponto.grava(db, { id: conta.id, matricula: '12345678' }, {
    ym: '2026-11', dias: [{ d: '2026-11-05', rev: 0, marcas: '08:00 12:00 13:00 17:00', srpMarcas: '08:00 12:00 13:00 17:00', tipo: 'util' }],
  });
  const agora = db.prepare('SELECT COUNT(*) n FROM dias').get().n;
  db.close();
  const naCopia = resumo(r.destino).dias.length;
  return {
    ok: r.ok && naCopia === 3 && agora === 4,
    obs: `a cópia congelou os ${naCopia} dias do momento e o aplicativo seguiu gravando (${agora} agora)`,
  };
});

caso('A retenção apaga o que passou de 30 dias e guarda o resto', () => {
  const origem = bancoCheio();
  const pasta = novo('backups');
  fs.mkdirSync(pasta, { recursive: true });
  const dia = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const velhas = [dia(31), dia(60), dia(400)];
  const novas = [dia(1), dia(15), dia(29)];
  for (const d of [...velhas, ...novas]) fs.writeFileSync(path.join(pasta, `cartinhas-${d}.sqlite`), 'copia de mentira');
  fs.writeFileSync(path.join(pasta, 'outra-coisa.txt'), 'nao e copia');

  const r = backup.roda({ banco: origem, pasta });
  const ficaram = fs.readdirSync(pasta);
  return {
    ok: r.ok && velhas.every((d) => !ficaram.includes(`cartinhas-${d}.sqlite`)) &&
        novas.every((d) => ficaram.includes(`cartinhas-${d}.sqlite`)) &&
        ficaram.includes('outra-coisa.txt') && r.restam === 4,
    obs: `apagou as ${velhas.length} cópias acima de 30 dias, guardou as ${novas.length} recentes mais a de hoje, e não mexeu no que não é cópia`,
  };
});

caso('Cópia que não abre é denunciada', () => {
  const falsa = novo('quebrada') + '.sqlite';
  fs.writeFileSync(falsa, 'isto nao e um banco sqlite');
  const r = backup.roda({ conferir: falsa });
  const semArquivo = backup.roda({ banco: novo('nao-existe') + '.sqlite', pasta: novo('backups') });
  return {
    ok: r.codigo === 1 && r.ok === false && semArquivo.codigo === 1,
    obs: `uma cópia que não abre sai com erro e recado ("${String(r.erro).slice(0, 40)}…"), e backup sem banco de origem também`,
  };
});

caso('Restaurar: a cópia vira um banco que abre e confere', () => {
  const origem = bancoCheio();
  const pasta = novo('backups');
  const r = backup.roda({ banco: origem, pasta });

  /* Restaurar e copiar o arquivo para outro lugar e subir o aplicativo apontando para ele.
     Aqui o "outro lugar" e uma pasta separada, como manda o roteiro: nunca por cima do
     banco em uso. */
  const restaurado = novo('restaurado') + '.sqlite';
  fs.copyFileSync(r.destino, restaurado);
  const antes = resumo(origem);
  const depois = resumo(restaurado);
  const conferida = backup.confere(restaurado);

  /* e o banco restaurado aceita gravacao normalmente */
  const db = banco.abre(restaurado);
  const c = db.prepare('SELECT id FROM contas WHERE matricula = ?').get('00000123');
  const g = ponto.grava(db, { id: c.id, matricula: '00000123' }, {
    ym: '2026-11', dias: [{ d: '2026-11-06', rev: 0, marcas: '08:00 12:00', srpMarcas: '08:00 12:00', tipo: 'util' }],
  });
  db.close();

  return {
    ok: conferida.ok && JSON.stringify(antes.contas) === JSON.stringify(depois.contas) &&
        JSON.stringify(antes.dias) === JSON.stringify(depois.dias) && g.salvos.length === 1,
    obs: `restaurado em pasta separada: as ${depois.contas.length} contas e os ${depois.dias.length} dias batem com a origem, e o banco restaurado aceita gravação`,
  };
});

caso('Cada conta continua com os dias dela depois da restauração', () => {
  const origem = bancoCheio();
  const pasta = novo('backups');
  const r = backup.roda({ banco: origem, pasta });
  const db = banco.abre(r.destino);
  const porConta = db.prepare(
    'SELECT c.matricula, COUNT(d.data) n FROM contas c LEFT JOIN dias d ON d.conta_id = c.id GROUP BY c.id ORDER BY c.matricula'
  ).all();
  const cruzado = db.prepare('SELECT COUNT(*) n FROM dias d JOIN contas c ON c.id = d.conta_id WHERE c.matricula IS NULL').get().n;
  db.close();
  return {
    ok: porConta.length === 2 && cruzado === 0 &&
        porConta.find((x) => x.matricula === '12345678').n === 2 &&
        porConta.find((x) => x.matricula === '00000123').n === 1,
    obs: porConta.map((x) => `${x.matricula}: ${x.n} dia(s)`).join(' · ') + ' — nenhum dia solto',
  };
});

/* ---------- saida ---------- */

(async () => {
  for (const c of CASOS) {
    let r;
    try { r = (await c.fn()) || { ok: true, obs: '' }; }
    catch (e) { r = { ok: false, obs: 'ERRO: ' + e.message }; }
    R.push({ id: c.id, nome: c.nome, ...r });
  }
  const fal = R.filter((x) => !x.ok);
  for (const x of R) console.log(`${x.ok ? 'PASSOU ' : 'FALHOU '} #${String(x.id).padStart(2, '0')} ${x.nome} — ${x.obs}`);
  console.log(`\nTotal: ${R.length} · passou ${R.length - fal.length} · falhou ${fal.length}`);
  fs.writeFileSync(path.join(__dirname, 'resultado-fase6.json'), JSON.stringify(R, null, 1));
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
  if (fal.length) process.exitCode = 1;
  setTimeout(() => process.exit(process.exitCode || 0), 50);
})();
