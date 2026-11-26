'use strict';
/* Ponto por conta e por dia.

   Cada dia tem uma revisao propria. Quem grava diz sobre qual revisao editou:
   - revisao igual a do banco  -> grava e a revisao sobe;
   - dia que ainda nao existe  -> rev 0 na entrada;
   - revisao atrasada          -> conflito: nada daquele dia e gravado e a resposta devolve
                                  a versao do servidor, para o titular comparar e decidir.
   Dias diferentes na mesma conta nunca brigam entre si: a chave e (conta, data). */

const { emTransacao, anota } = require('./banco');
const { Recusa } = require('./contas');

const TIPOS = ['util', 'folga', 'feriado', 'ferias'];
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_YM = /^\d{4}-\d{2}$/;

function texto(v, max) {
  if (v == null) return '';
  if (typeof v !== 'string') throw new Recusa('formato', 'Campo de texto invalido.');
  if (v.length > (max || 200)) throw new Recusa('formato', 'Campo de texto longo demais.');
  return v;
}

/* Confere a forma do dia antes de encostar no banco, como o validaArq faz no
   Cartinhas do computador. Um JSON de outro programa para aqui. */
function limpaDia(x) {
  if (!x || typeof x !== 'object') throw new Recusa('formato', 'Dia invalido.');
  if (!RE_DATA.test(x.d)) throw new Recusa('formato', `Data invalida: ${String(x.d).slice(0, 20)}`);
  if (Number.isNaN(Date.parse(x.d + 'T12:00:00Z'))) throw new Recusa('formato', `Data inexistente: ${x.d}`);
  const tipo = x.tipo == null ? 'util' : String(x.tipo);
  if (!TIPOS.includes(tipo)) throw new Recusa('formato', `Tipo de dia desconhecido: ${tipo}`);
  let abono = null;
  if (x.abono != null && x.abono !== '') {
    if (typeof x.abono !== 'string' || !/^-?\d{1,3}:[0-5]\d$|^-$/.test(x.abono)) {
      throw new Recusa('formato', `Abono invalido em ${x.d}.`);
    }
    abono = x.abono;
  }
  let carga = null;
  if (x.carga != null && x.carga !== '') {
    carga = Number(x.carga);
    if (!Number.isInteger(carga) || carga < 0 || carga > 24 * 60) throw new Recusa('formato', `Jornada invalida em ${x.d}.`);
  }
  let srp = null;
  if (x.srp != null) {
    if (typeof x.srp !== 'object' || Array.isArray(x.srp)) throw new Recusa('formato', `Totais do SRP invalidos em ${x.d}.`);
    srp = x.srp;
  }
  const rev = x.rev == null ? 0 : Number(x.rev);
  if (!Number.isInteger(rev) || rev < 0) throw new Recusa('formato', `Revisao invalida em ${x.d}.`);
  return {
    d: x.d,
    rev,
    futuro: !!x.futuro,
    marcas: texto(x.marcas, 120),
    srpMarcas: texto(x.srpMarcas, 120),
    tipo,
    tipoManual: !!x.tipoManual,
    abono,
    obs: texto(x.obs, 200),
    carga,
    srp,
  };
}

function paraFora(l) {
  return {
    d: l.data,
    rev: l.rev,
    marcas: l.marcas,
    srpMarcas: l.srp_marcas,
    tipo: l.tipo,
    tipoManual: !!l.tipo_manual,
    abono: l.abono,
    obs: l.obs,
    carga: l.carga,
    srp: l.srp ? JSON.parse(l.srp) : null,
    futuro: !!l.futuro,
    salvoEm: l.salvo_em,
  };
}

function meses(db, contaId) {
  const linhas = db.prepare(
    `SELECT substr(data,1,7) ym, COUNT(*) dias, MAX(salvo_em) salvo_em
       FROM dias WHERE conta_id = ? GROUP BY 1 ORDER BY 1`
  ).all(contaId);
  const metas = db.prepare('SELECT ym, meta FROM meses WHERE conta_id = ?').all(contaId);
  const porYm = new Map(metas.map((m) => [m.ym, m.meta ? JSON.parse(m.meta) : null]));
  return linhas.map((l) => ({ ym: l.ym, dias: l.dias, salvoEm: l.salvo_em, meta: porYm.get(l.ym) || null }));
}

function mes(db, contaId, ym) {
  if (!RE_YM.test(ym)) throw new Recusa('formato', 'Mes invalido.');
  const dias = db.prepare('SELECT * FROM dias WHERE conta_id = ? AND substr(data,1,7) = ? ORDER BY data')
    .all(contaId, ym).map(paraFora);
  const m = db.prepare('SELECT meta FROM meses WHERE conta_id = ? AND ym = ?').get(contaId, ym);
  return { ym, meta: m && m.meta ? JSON.parse(m.meta) : null, dias };
}

function umDia(db, contaId, data) {
  const l = db.prepare('SELECT * FROM dias WHERE conta_id = ? AND data = ?').get(contaId, data);
  return l ? paraFora(l) : null;
}

/* O titular do relatorio precisa bater com o da conta. A conferencia acontece ANTES de
   qualquer gravacao: importar na conta errada nao pode deixar meio relatorio para tras. */
function confereTitular(db, conta, nomeRelatorio, confirma) {
  const nome = (nomeRelatorio || '').trim();
  if (!nome) return { nome: null, adotou: false };
  const atual = db.prepare('SELECT nome FROM contas WHERE id = ?').get(conta.id).nome;
  if (!atual) return { nome, adotou: true };
  if (atual.trim().toUpperCase() === nome.toUpperCase()) return { nome: atual, adotou: false };
  if (!confirma) {
    const e = new Recusa(
      'titular_diferente',
      `Este relatorio esta em nome de ${nome}, e esta conta e de ${atual}. Nada foi gravado, para nao misturar o ponto de duas pessoas.`,
      409
    );
    e.extra = { daConta: atual, doArquivo: nome };
    throw e;
  }
  anota(db, conta.id, 'ponto.titular_confirmado', `${atual} <- ${nome}`);
  return { nome: atual, adotou: false };
}

/* Grava um lote de dias numa transacao so. Os que estao em dia gravam; os que vieram de
   uma revisao atrasada voltam como conflito, com a versao do servidor junto. */
function grava(db, conta, corpo) {
  if (!corpo || typeof corpo !== 'object') throw new Recusa('formato', 'Nada para gravar.');
  const ym = corpo.ym;
  if (ym != null && !RE_YM.test(ym)) throw new Recusa('formato', 'Mes invalido.');
  if (!Array.isArray(corpo.dias)) throw new Recusa('formato', 'Lista de dias ausente.');
  if (corpo.dias.length > 400) throw new Recusa('formato', 'Dias demais num envio so.');
  const dias = corpo.dias.map(limpaDia);                 // valida tudo antes de abrir a transacao
  if (ym && dias.some((x) => x.d.slice(0, 7) !== ym)) {
    throw new Recusa('formato', 'Ha dias fora do mes informado.');
  }
  const vistos = new Set();
  for (const x of dias) {
    if (vistos.has(x.d)) throw new Recusa('formato', `O dia ${x.d} veio duas vezes no mesmo envio.`);
    vistos.add(x.d);
  }
  const meta = corpo.meta && typeof corpo.meta === 'object' && !Array.isArray(corpo.meta) ? corpo.meta : null;

  return emTransacao(db, () => {
    const titular = confereTitular(db, conta, meta && meta.nome, !!corpo.confirmaTitular);
    if (titular.adotou) {
      db.prepare('UPDATE contas SET nome = ? WHERE id = ?').run(titular.nome, conta.id);
    }

    const t = Date.now();
    const pega = db.prepare('SELECT * FROM dias WHERE conta_id = ? AND data = ?');
    const poe = db.prepare(
      `INSERT INTO dias (conta_id, data, rev, marcas, srp_marcas, tipo, tipo_manual, abono, obs, carga, srp, futuro, salvo_em)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(conta_id, data) DO UPDATE SET
         rev = excluded.rev, marcas = excluded.marcas, srp_marcas = excluded.srp_marcas,
         tipo = excluded.tipo, tipo_manual = excluded.tipo_manual, abono = excluded.abono,
         obs = excluded.obs, carga = excluded.carga, srp = excluded.srp,
         futuro = excluded.futuro, salvo_em = excluded.salvo_em`
    );

    const salvos = [];
    const conflitos = [];
    for (const x of dias) {
      const atual = pega.get(conta.id, x.d);
      const revAtual = atual ? atual.rev : 0;
      if (x.rev !== revAtual) {
        conflitos.push({ d: x.d, revEnviada: x.rev, dele: atual ? paraFora(atual) : null });
        continue;
      }
      const nova = revAtual + 1;
      poe.run(
        conta.id, x.d, nova, x.marcas, x.srpMarcas, x.tipo, x.tipoManual ? 1 : 0,
        x.abono, x.obs, x.carga, x.srp ? JSON.stringify(x.srp) : null, x.futuro ? 1 : 0, t
      );
      salvos.push({ d: x.d, rev: nova });
    }

    if (ym) {
      const antes = db.prepare('SELECT meta FROM meses WHERE conta_id = ? AND ym = ?').get(conta.id, ym);
      const base = antes && antes.meta ? JSON.parse(antes.meta) : {};
      const junto = meta ? { ...base, ...meta } : base;
      db.prepare(
        `INSERT INTO meses (conta_id, ym, meta, salvo_em) VALUES (?,?,?,?)
         ON CONFLICT(conta_id, ym) DO UPDATE SET meta = excluded.meta, salvo_em = excluded.salvo_em`
      ).run(conta.id, ym, JSON.stringify(junto), t);
    }

    if (conflitos.length) anota(db, conta.id, 'ponto.conflito', conflitos.map((c) => c.d).join(','));
    return { salvos, conflitos, titular: titular.nome };
  });
}

function apaga(db, conta, data) {
  if (!RE_DATA.test(data)) throw new Recusa('formato', 'Data invalida.');
  const n = db.prepare('DELETE FROM dias WHERE conta_id = ? AND data = ?').run(conta.id, data).changes;
  return { apagou: n > 0 };
}

function feriados(db) {
  return db.prepare('SELECT data, nome, tipo FROM feriados ORDER BY data').all();
}

function poeFeriado(db, quem, data, nome, tipo) {
  if (!quem || !quem.admin) throw new Recusa('sem_permissao', 'Somente o administrador mexe na lista de feriados.', 403);
  if (!RE_DATA.test(data)) throw new Recusa('formato', 'Data invalida.');
  const t = tipo === 'folga' ? 'folga' : 'feriado';
  db.prepare(
    `INSERT INTO feriados (data, nome, tipo) VALUES (?,?,?)
     ON CONFLICT(data) DO UPDATE SET nome = excluded.nome, tipo = excluded.tipo`
  ).run(data, texto(nome, 80) || 'feriado', t);
  return { data, nome, tipo: t };
}

module.exports = { TIPOS, limpaDia, paraFora, meses, mes, umDia, grava, apaga, feriados, poeFeriado, confereTitular };
