'use strict';
/* Fase 3: traz os meses do cartinhas-dados.json para a conta de alguem no banco do aplicativo.

   Como e dado real de ponto, o roteiro e conservador:
   - confere o formato do arquivo inteiro ANTES de gravar qualquer mes;
   - mostra a matricula de destino, o titular e o periodo, e so grava com --confirmar;
   - grava pelo mesmo caminho que o aplicativo usa (ponto.grava), com as mesmas conferencias;
   - depois de gravar, LE DE VOLTA do banco e compara dia a dia com a origem: marcacoes
     originais e corrigidas, tipo, abono, observacao e o saldo de cada mes;
   - rodar de novo nao muda o resultado.

   O arquivo de dados nunca e copiado para o repositorio nem sai desta maquina.

   Ver o que seria feito:
     node migrar.cjs --arquivo ../../cartinhas-dados.json --matricula 00000123
   Gravar:
     node migrar.cjs --arquivo ... --matricula ... --confirmar
*/

const fs = require('node:fs');
const path = require('node:path');
const banco = require('./lib/banco');
const contas = require('./lib/contas');
const ponto = require('./lib/ponto');

/* Parar sem derrubar o processo: assim o migrador pode ser chamado por um teste.
   Quem roda pela linha de comando converte isto no codigo de saida. */
class Saida extends Error {
  constructor(codigo, recado) { super(recado || ('saiu com ' + codigo)); this.codigo = codigo; }
}

function args(argv) {
  const o = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      o[k] = v;
    }
  }
  return o;
}

/* Mesma conferencia de estrutura do Cartinhas do computador: um JSON de outro programa,
   ou com um campo fora do formato, para aqui e nao chega a tocar no banco. */
function confere(o) {
  const erros = [];
  if (!o || typeof o !== 'object' || Array.isArray(o)) { erros.push('o arquivo não é um objeto JSON'); return erros; }
  if (!o.months || typeof o.months !== 'object' || Array.isArray(o.months)) {
    erros.push('não achei a lista de meses (campo "months"): este arquivo não é do Cartinhas');
    return erros;
  }
  const ymRe = /^(\d{4})-(0[1-9]|1[0-2])$/;
  for (const [ym, m] of Object.entries(o.months)) {
    if (!ymRe.test(ym)) { erros.push(`"${ym}" não é um mês no formato AAAA-MM`); continue; }
    if (!m || !Array.isArray(m.days)) { erros.push(`o mês ${ym} não tem lista de dias`); continue; }
    for (const d of m.days) {
      try { ponto.limpaDia({ ...d, rev: 0 }); }
      catch (e) { erros.push(`${ym}: ${e.recado || e.message}`); }
      if (d && d.d && d.d.slice(0, 7) !== ym) erros.push(`o dia ${d.d} está guardado dentro do mês ${ym}`);
    }
  }
  return erros;
}

/* Vale a pena guardar este dia?

   O aplicativo desenha sozinho os dias que ainda nao vieram em relatorio nenhum: fim de
   semana vira folga, feriado conhecido vira feriado, o resto vira dia util. Entao um dia
   vazio e igual ao que a tela ja faria nao precisa ocupar linha no banco.

   Mas o tipo que NAO bate com esse padrao tem de ser guardado, mesmo sem marcacao: um
   ponto facultativo que so o relatorio sabe, por exemplo, se perderia e voltaria como dia
   util devendo oito horas. "tipoPadrao" e o que a tela desenharia; sem ele, so o conteudo
   conta. */
const temConteudo = (x, tipoPadrao) => !!(
  (x.marcas && x.marcas.trim()) || (x.abono != null && x.abono !== '') ||
  (x.obs && x.obs.trim()) || x.tipoManual || x.srp ||
  (tipoPadrao && x.tipo && x.tipo !== tipoPadrao)
);

/* Dois saldos por mes, de proposito:
   - "conferencia": com o dia de hoje la na frente, todo dia entra na conta. E o numero que
     prova que o arquivo e o banco guardam a mesma coisa, sem nenhum dia de fora.
   - "hoje": com a data de verdade, que e o numero que a pessoa reconhece na tela. Os dois
     podem ser bem diferentes: um dia passado com uma batida so pesa um dia inteiro,
     enquanto no proprio dia ele ainda estava em aberto. */
async function saldos(meses) {
  const reg = await import(require('node:url').pathToFileURL(path.join(__dirname, 'web', 'regras.mjs')).href);
  const conta = (quando) => {
    reg.defineHoje(quando);
    const fora = {};
    for (const [ym, dias] of Object.entries(meses)) fora[ym] = reg.totals(true, false, dias);
    return fora;
  };
  const hojeReal = reg.iso(new Date());
  return { reg, saldos: conta('2099-12-31'), hoje: conta(hojeReal), quandoHoje: hojeReal };
}

async function roda(op) {
  const arquivo = op.arquivo;
  if (!arquivo || !op.matricula) {
    console.error('Uso: node migrar.cjs --arquivo <cartinhas-dados.json> --matricula <8 algarismos> [--confirmar] [--banco <arquivo.sqlite>]');
    throw new Saida(2);
  }
  if (!contas.matriculaOk(String(op.matricula))) {
    console.error('A matrícula precisa ter exatamente oito algarismos.');
    throw new Saida(2);
  }

  const bruto = fs.readFileSync(arquivo, 'utf8');
  let o;
  try { o = JSON.parse(bruto); }
  catch (e) { console.error('Não consegui ler o JSON:', e.message); throw new Saida(1); }

  const erros = confere(o);
  if (erros.length) {
    console.error('Não migrei nada. O arquivo tem problema de formato:');
    for (const e of erros.slice(0, 20)) console.error(' -', e);
    if (erros.length > 20) console.error(` - (e mais ${erros.length - 20})`);
    throw new Saida(1);
  }

  const dbArq = op.banco || path.join(__dirname, 'dados', 'cartinhas.sqlite');
  const db = banco.abre(dbArq);
  const conta = db.prepare('SELECT id, matricula, nome, ativa FROM contas WHERE matricula = ?').get(String(op.matricula));
  if (!conta) {
    console.error(`Não existe conta com a matrícula ${op.matricula} no banco ${dbArq}.`);
    console.error('Crie a conta primeiro (convite, ou CARTINHAS_ADMIN_MATRICULA na primeira subida).');
    db.close();
    throw new Saida(1);
  }

  /* Titular: o do arquivo tem de bater com o da conta, ou a pessoa confirma na mao. */
  const nomes = [...new Set(Object.values(o.months).map((m) => m && m.meta && m.meta.nome).filter(Boolean).map((n) => n.trim()))];
  /* O padrao do calendario vem das mesmas regras da tela, para o filtro abaixo nao
     discordar do que o aplicativo desenha. */
  const reg = await import(require('node:url').pathToFileURL(path.join(__dirname, 'web', 'regras.mjs')).href);
  const tipoPadrao = (d) => {
    const w = reg.wd(d);
    return (w === 0 || w === 6) ? 'folga' : reg.ehFeriado(d) ? 'feriado' : 'util';
  };

  const porMes = {};
  for (const [ym, m] of Object.entries(o.months)) {
    porMes[ym] = (m.days || []).filter((x) => temConteudo(x, tipoPadrao(x.d))).map((x) => ({ ...x }));
  }
  const { saldos: antes, hoje: antesHoje, quandoHoje } = await saldos(porMes);

  console.log(`Arquivo:   ${arquivo}`);
  console.log(`Banco:     ${dbArq}`);
  console.log(`Conta:     matrícula ${conta.matricula}${conta.nome ? ' (' + conta.nome + ')' : ' (ainda sem titular registrado)'}${conta.ativa ? '' : ' — conta ainda não ativada'}`);
  console.log(`Titular no arquivo: ${nomes.length ? nomes.join(' / ') : '(o arquivo não diz)'}`);
  console.log('');
  console.log('Meses a migrar:');
  for (const ym of Object.keys(porMes).sort()) {
    const s = antes[ym], h = antesHoje[ym];
    const nota = s.saldo === h.saldo ? '' : ` · na tela de hoje (${quandoHoje}): ${fmtSaldo(h.saldo)}`;
    console.log(`  ${ym}: ${porMes[ym].length} dia(s) com conteúdo · saldo ${fmtSaldo(s.saldo)} (crédito ${fmtSaldo(s.cred)}, débito ${fmtSaldo(s.deb)})${nota}`);
  }
  console.log('');

  if (nomes.length > 1) {
    console.log('ATENÇÃO: o arquivo tem mais de um titular. Isso é ponto de mais de uma pessoa.');
  }
  if (conta.nome && nomes.length && !nomes.some((n) => n.toUpperCase() === conta.nome.trim().toUpperCase())) {
    console.log(`ATENÇÃO: a conta é de ${conta.nome} e o arquivo é de ${nomes.join(' / ')}.`);
    if (!op['confirmar-titular']) {
      console.error('Não migrei nada. Se for mesmo para gravar, acrescente --confirmar-titular.');
      db.close();
      throw new Saida(1);
    }
  }
  if (!nomes.length) {
    console.log('O arquivo não identifica o titular. Confira a matrícula de destino e o período acima antes de gravar.');
  }

  if (!op.confirmar) {
    console.log('Nada foi gravado: isto foi só a conferência. Para gravar, repita com --confirmar.');
    db.close();
    return { gravou: false, meses: Object.keys(porMes).length };
  }

  /* Grava mes a mes, pelo mesmo caminho do aplicativo. A revisao de cada dia vem do que
     ja esta no banco, para rodar de novo não virar conflito. */
  const quem = { id: conta.id, matricula: conta.matricula, admin: false };
  const gravados = {};
  for (const ym of Object.keys(porMes).sort()) {
    const atual = ponto.mes(db, conta.id, ym);
    const rev = new Map(atual.dias.map((x) => [x.d, x.rev]));
    const corpo = {
      ym,
      meta: (o.months[ym].meta && o.months[ym].meta.nome) ? { nome: o.months[ym].meta.nome.trim() } : undefined,
      confirmaTitular: !!op['confirmar-titular'],
      dias: porMes[ym].map((x) => ({
        d: x.d, rev: rev.get(x.d) || 0,
        marcas: x.marcas || '', srpMarcas: x.srpMarcas || '',
        tipo: x.tipo || 'util', tipoManual: !!x.tipoManual,
        abono: x.abono == null || x.abono === '' ? null : String(x.abono),
        obs: x.obs || '', carga: x.carga || null, srp: x.srp || null,
        futuro: !!x.futuro,
      })),
    };
    const r = ponto.grava(db, quem, corpo);
    gravados[ym] = r;
    console.log(`${ym}: ${r.salvos.length} dia(s) gravado(s)${r.conflitos.length ? `, ${r.conflitos.length} em conflito` : ''}`);
  }

  /* Conferencia: le de volta e compara com a origem. */
  console.log('');
  console.log('Conferência depois de gravar:');
  const depoisDias = {};
  const difs = [];
  for (const ym of Object.keys(porMes).sort()) {
    const lido = ponto.mes(db, conta.id, ym);
    depoisDias[ym] = lido.dias;
    const porData = new Map(lido.dias.map((x) => [x.d, x]));
    for (const x of porMes[ym]) {
      const y = porData.get(x.d);
      if (!y) { difs.push(`${x.d}: não voltou do banco`); continue; }
      const cmp = [
        ['marcações', x.marcas || '', y.marcas || ''],
        ['marcações do SRP', x.srpMarcas || '', y.srpMarcas || ''],
        ['tipo', x.tipo || 'util', y.tipo],
        ['abono', x.abono == null || x.abono === '' ? '' : String(x.abono), y.abono == null ? '' : String(y.abono)],
        ['observação', x.obs || '', y.obs || ''],
        ['jornada', x.carga || '', y.carga || ''],
        ['totais do SRP', JSON.stringify(x.srp || null), JSON.stringify(y.srp || null)],
        ['ainda sem relatório', x.futuro ? 'sim' : 'não', y.futuro ? 'sim' : 'não'],
      ];
      for (const [campo, a, b] of cmp) if (String(a) !== String(b)) difs.push(`${x.d} ${campo}: origem "${a}" x banco "${b}"`);
    }
    const sobrando = lido.dias.filter((y) => temConteudo(y, tipoPadrao(y.d)) && !porMes[ym].some((x) => x.d === y.d));
    for (const y of sobrando) difs.push(`${y.d}: está no banco e não estava no arquivo`);
  }
  const { saldos: depois, hoje: depoisHoje } = await saldos(depoisDias);
  for (const ym of Object.keys(porMes).sort()) {
    const a = antes[ym], b = depois[ym];
    const igual = a.saldo === b.saldo && a.cred === b.cred && a.deb === b.deb && a.irr === b.irr &&
      antesHoje[ym].saldo === depoisHoje[ym].saldo;
    console.log(`  ${ym}: saldo ${fmtSaldo(b.saldo)} ${igual ? '— igual ao do arquivo' : `— DIFERENTE do arquivo (${fmtSaldo(a.saldo)})`}`);
    if (!igual) difs.push(`${ym}: saldo do arquivo ${fmtSaldo(a.saldo)} x saldo no banco ${fmtSaldo(b.saldo)}`);
  }

  db.close();
  if (difs.length) {
    console.log('');
    console.error(`NÃO BATEU em ${difs.length} ponto(s):`);
    for (const d of difs.slice(0, 30)) console.error(' -', d);
    return { gravou: true, difs, codigo: 1 };
  }
  console.log('');
  console.log('Tudo conferido: dia a dia e saldo por mês batem com o arquivo de origem.');
  return { gravou: true, difs: [] };
}

function fmtSaldo(m) {
  const s = m < 0 ? '−' : '+';
  m = Math.abs(Math.round(m));
  return `${s}${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

if (require.main === module) {
  roda(args(process.argv))
    .then((r) => { if (r && r.codigo) process.exitCode = r.codigo; })
    .catch((e) => {
      if (e instanceof Saida) { process.exitCode = e.codigo; return; }
      console.error('Falhou:', e.message);
      process.exitCode = 1;
    });
}

module.exports = { confere, roda, temConteudo, fmtSaldo, Saida };
