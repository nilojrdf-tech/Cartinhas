/* Cartinhas no celular. As regras de calculo e a leitura do relatorio vem de regras.mjs,
   que e extraido do index.html do computador: aqui nao se reescreve regra nenhuma.

   O que e desta tela: falar com a API, guardar o que ainda nao foi enviado (por conta),
   desenhar o mes em cartoes e a conta inversa da hora de saida. */

import * as R from './regras.mjs';
import { horaDeSaida, parseAlvo } from './calculo.mjs';
import { criaFila } from './fila.mjs';

/* ---------- atalhos ---------- */

const $ = (id) => document.getElementById(id);
const esc = R.esc;
const TELAS = ['telaEntrar', 'telaConvite', 'telaSenha', 'telaUsuarios', 'telaApp'];

let eu = null;              // conta aberta nesta sessao
let cur = null;             // mes na tela (AAAA-MM)
let months = {};            // AAAA-MM -> {meta, dias}
let dias = [];              // dias do mes na tela
let enviando = false;
let conflitos = [];
let aberto = null;          // data do cartao expandido

/* ---------- API ---------- */

async function api(metodo, caminho, corpo) {
  const op = { method: metodo, headers: { 'x-cartinhas': '1' } };
  if (corpo !== undefined) {
    op.headers['content-type'] = 'application/json';
    op.body = JSON.stringify(corpo);
  }
  const res = await fetch(caminho, op);
  let dado = null;
  try { dado = await res.json(); } catch (_) {}
  return { status: res.status, ok: res.ok, dado: dado || {} };
}

const recado = (r, padrao) => (r.dado && r.dado.recado) || padrao || 'Não consegui falar com o servidor.';

function avisa(id, texto, classe) {
  const e = $(id);
  if (!e) return;
  e.className = 'aviso' + (classe ? ' ' + classe : '');
  e.innerHTML = texto || '';
}

/* ---------- fila por conta ---------- */
/* A pendencia fica amarrada a matricula: quem entrar depois neste aparelho nao ve nem
   envia a edicao de quem estava antes. A logica esta em fila.mjs, para os testes poderem
   exercita-la contra o servidor de verdade. */

const fila = criaFila({ storage: localStorage, api, aoMudar: pintaFila });

function pintaFila(itens) {
  const e = $('fila');
  const n = (itens || fila.itens()).length;
  if (!eu) { e.innerHTML = ''; return; }
  if (!n) {
    e.innerHTML = navigator.onLine ? '' : '<span class="mut">Sem conexão. O que você editar fica guardado aqui.</span>';
    return;
  }
  e.innerHTML = `<span>${n} ${n === 1 ? 'dia ainda não enviado' : 'dias ainda não enviados'}</span>` +
    `<button class="leve" id="btnEnviar" type="button">Enviar agora</button>`;
  $('btnEnviar').onclick = () => envia(true);
}

/* Enfileira um dia e tenta mandar. So some da fila quando o servidor confirma. */
function enfileira(dia) {
  fila.poe(paraEnvio(dia));
  envia();
}

async function envia(aMao) {
  if (enviando || !eu || !fila.conta()) return;
  if (!navigator.onLine && !aMao) return;
  enviando = true;
  try {
    const r = await fila.envia((ym) => (months[ym] && months[ym].meta ? { nome: months[ym].meta.nome } : undefined));
    for (const s of r.enviados) {
      const ym = s.d.slice(0, 7);
      const d = dias.find((x) => x.d === s.d);
      if (d) d.rev = s.rev;
      const m = months[ym] && months[ym].dias.find((x) => x.d === s.d);
      if (m) m.rev = s.rev;
    }
    if (r.conflitos.length) { conflitos = r.conflitos; pintaConflitos(); }
    if (r.erro && r.erro.tipo === 'sessao') return paraEntrar(r.erro.recado);
    if (r.erro) avisa('avisoConflito', esc(r.erro.recado), 'ruim');
    desenha();
  } finally {
    enviando = false;
  }
}

const paraEnvio = (x) => ({
  d: x.d, rev: x.rev || 0, marcas: x.marcas || '', srpMarcas: x.srpMarcas || '',
  tipo: x.tipo || 'util', tipoManual: !!x.tipoManual,
  abono: x.abono == null || x.abono === '' ? null : String(x.abono),
  obs: x.obs || '', carga: x.carga || null, srp: x.srp || null, futuro: !!x.futuro,
});

/* ---------- conflitos ---------- */

function pintaConflitos() {
  if (!conflitos.length) { avisa('avisoConflito', ''); return; }
  const linhas = conflitos.map((c, i) => {
    const meu = c.meu || {};
    const dele = c.dele || {};
    return `<div class="conflito" data-c="${i}">
      <h3>${esc(R.br(c.d))}: este dia mudou nos dois lugares</h3>
      <p>Enviei a sua edição depois que o dia já tinha mudado em outro aparelho. Não gravei nada
         por cima: escolha qual fica.</p>
      <div class="lado"><b>No servidor:</b> ${esc(dele.marcas || 'sem marcações')}
        ${dele.abono ? ' · abono ' + esc(dele.abono) : ''}${dele.obs ? ' · ' + esc(dele.obs) : ''}</div>
      <div class="lado"><b>Nesta tela:</b> ${esc(meu.marcas || 'sem marcações')}
        ${meu.abono ? ' · abono ' + esc(meu.abono) : ''}${meu.obs ? ' · ' + esc(meu.obs) : ''}</div>
      <div class="linha">
        <button type="button" data-fica="meu" data-i="${i}">Ficar com a minha</button>
        <button type="button" class="leve" data-fica="dele" data-i="${i}">Ficar com a do servidor</button>
      </div>
    </div>`;
  }).join('');
  avisa('avisoConflito', linhas);
  for (const b of $('avisoConflito').querySelectorAll('[data-fica]')) {
    b.onclick = () => resolve(Number(b.dataset.i), b.dataset.fica);
  }
}

function resolve(i, qual) {
  const c = conflitos[i];
  if (!c) return;
  const ym = c.d.slice(0, 7);
  if (qual === 'dele') {
    poeDia(ym, c.dele);
  } else {
    const meu = { ...c.meu, rev: c.dele ? c.dele.rev : 0 };
    poeDia(ym, meu);
    enfileira(meu);
  }
  conflitos.splice(i, 1);
  pintaConflitos();
  desenha();
}

function poeDia(ym, d) {
  if (!d) return;
  const m = months[ym];
  if (!m) return;
  const i = m.dias.findIndex((x) => x.d === d.d);
  if (i >= 0) m.dias[i] = { ...m.dias[i], ...d, futuro: false };
  else m.dias.push({ ...d });
  if (ym === cur) usaMes(cur, true);
}

/* ---------- telas ---------- */

function mostra(qual) {
  for (const t of TELAS) $(t).hidden = t !== qual;
  $('topo').hidden = qual === 'telaEntrar' || qual === 'telaConvite' || qual === 'telaSenha';
  $('rodape').hidden = false;
  $('btnUsuarios').hidden = !(eu && eu.admin);
}

function paraEntrar(porque) {
  eu = null;
  fila.sai();
  mostra('telaEntrar');
  pintaFila();
  if (porque) avisa('avisoEntrar', esc(porque), 'ruim');
}

/* ---------- entrar ---------- */

$('formEntrar').addEventListener('submit', async (e) => {
  e.preventDefault();
  avisa('avisoEntrar', '');
  $('btnEntrar').disabled = true;
  const r = await api('POST', '/api/entrar', { matricula: $('mat').value.trim(), senha: $('senha').value });
  $('btnEntrar').disabled = false;
  if (!r.ok) return avisa('avisoEntrar', esc(recado(r)), 'ruim');
  $('senha').value = '';
  await comeca();
});

$('btnEsqueci').addEventListener('click', async () => {
  const m = $('mat').value.trim();
  if (!/^[0-9]{8}$/.test(m)) return avisa('avisoEntrar', 'Digite a sua matrícula (oito algarismos) e toque de novo em “Esqueci minha senha”.', 'ruim');
  await api('POST', '/api/recuperar', { matricula: m });
  avisa('avisoEntrar', 'Se essa matrícula tiver conta aqui, o link para criar uma senha nova chega no e-mail cadastrado. Ele vale 20 minutos.', 'bom');
});

$('btnSair').addEventListener('click', async () => {
  if (fila.conta() && !confirm(`Você tem ${fila.conta()} dia(s) ainda não enviados. Eles ficam guardados neste aparelho e voltam quando você entrar de novo. Sair assim mesmo?`)) return;
  await api('POST', '/api/sair');
  paraEntrar();
});

$('btnUsuarios').addEventListener('click', () => { history.pushState({}, '', '/usuarios'); rota(); });
$('btnVoltaApp').addEventListener('click', () => { history.pushState({}, '', '/'); rota(); });

/* ---------- convite ---------- */

$('formConvite').addEventListener('submit', async (e) => {
  e.preventDefault();
  avisa('avisoConvite', '');
  const token = location.hash.slice(1);
  const r = await api('POST', '/api/convite/abrir', { token, matricula: $('matConvite').value.trim() });
  if (!r.ok) return avisa('avisoConvite', esc(recado(r)), 'ruim');
  avisa('avisoConvite',
    `Pronto. Enviei um e-mail para <b>${esc(r.dado.dica || '')}</b> com o link para você criar a sua senha. ` +
    `Abra o e-mail nesse aparelho mesmo e toque no link.`, 'bom');
});

/* ---------- senha nova ---------- */

$('formSenha').addEventListener('submit', async (e) => {
  e.preventDefault();
  avisa('avisoSenha', '');
  if ($('senha1').value !== $('senha2').value) return avisa('avisoSenha', 'As duas senhas estão diferentes.', 'ruim');
  const token = location.hash.slice(1);
  const r = await api('POST', '/api/senha-nova', { token, senha: $('senha1').value });
  if (!r.ok) return avisa('avisoSenha', esc(recado(r)), 'ruim');
  avisa('avisoSenha', 'Senha salva. Pode entrar com a sua matrícula e essa senha.', 'bom');
  setTimeout(() => { history.pushState({}, '', '/'); location.hash = ''; rota(); }, 1200);
});

/* ---------- usuarios (administrador) ---------- */

$('formConvidar').addEventListener('submit', async (e) => {
  e.preventDefault();
  avisa('avisoConvidar', '');
  const r = await api('POST', '/api/convites', { matricula: $('convMat').value.trim(), email: $('convEmail').value.trim() });
  if (!r.ok) return avisa('avisoConvidar', esc(recado(r)), 'ruim');
  $('convMat').value = ''; $('convEmail').value = '';
  avisa('avisoConvidar',
    `Convite criado para ${esc(r.dado.matricula)}. Agora é só mandar para a pessoa:` +
    `<div class="linha" style="margin-top:8px">` +
    `<a class="icone" style="line-height:40px;text-decoration:none" href="${esc(r.dado.whatsapp)}" target="_blank" rel="noopener">Compartilhar pelo WhatsApp</a>` +
    `<button type="button" class="leve" id="btnCopia">Copiar link</button></div>` +
    `<p class="mut" style="margin-top:8px">O convite vale 48 horas. A pessoa informa a matrícula, ` +
    `recebe um e-mail e só por ele cria a senha.</p>`, 'bom');
  const copia = $('btnCopia');
  if (copia) copia.onclick = async () => {
    try { await navigator.clipboard.writeText(r.dado.link); copia.textContent = 'Link copiado'; }
    catch (_) { prompt('Copie o link do convite:', r.dado.link); }
  };
  await carregaUsuarios();
});

async function carregaUsuarios() {
  const [c, u] = await Promise.all([api('GET', '/api/convites'), api('GET', '/api/usuarios')]);
  if (c.status === 401 || u.status === 401) return paraEntrar();
  if (c.status === 403) { $('listaConvites').innerHTML = '<p class="mut">Só o administrador vê os convites.</p>'; return; }
  const v = c.dado.vagas || {};
  $('vagas').textContent = `${v.ativas} conta(s) ativa(s) e ${v.reservadas} convite(s) aberto(s), de ${v.total} vagas. Livres: ${v.livres}.`;
  const conv = c.dado.convites || [];
  $('listaConvites').innerHTML = conv.length ? conv.map((x) => `
    <div class="dia">
      <div class="cab"><span class="data">${esc(x.matricula)}</span>
        <span class="sem">${esc(x.email)}</span></div>
      <div class="nota">${x.estado === 'confirmando' ? 'e-mail de confirmação enviado' : 'esperando a matrícula'} ·
        vale até ${esc(new Date(x.expira_em).toLocaleString('pt-BR'))}</div>
      <div class="linha" style="margin-top:8px">
        <button type="button" class="leve" data-ren="${x.id}">Renovar</button>
        <button type="button" class="leve" data-can="${x.id}">Cancelar</button>
      </div>
    </div>`).join('') : '<p class="mut">Nenhum convite aberto.</p>';
  for (const b of $('listaConvites').querySelectorAll('[data-ren]')) {
    b.onclick = async () => {
      const r = await api('POST', `/api/convites/${b.dataset.ren}/renovar`);
      if (r.ok) {
        avisa('avisoConvidar', `Convite renovado. O link anterior, e o e-mail que já tinha sido enviado, deixaram de valer.` +
          `<div class="linha" style="margin-top:8px"><a class="icone" style="line-height:40px;text-decoration:none" href="${esc(r.dado.whatsapp)}" target="_blank" rel="noopener">Compartilhar pelo WhatsApp</a></div>`, 'bom');
      } else avisa('avisoConvidar', esc(recado(r)), 'ruim');
      await carregaUsuarios();
    };
  }
  for (const b of $('listaConvites').querySelectorAll('[data-can]')) {
    b.onclick = async () => {
      if (!confirm('Cancelar este convite? Os links deixam de valer e a vaga volta a ficar livre.')) return;
      await api('POST', `/api/convites/${b.dataset.can}/cancelar`);
      await carregaUsuarios();
    };
  }
  const contas = (u.dado.contas || []);
  $('listaContas').innerHTML = contas.map((x) => `
    <div class="dia">
      <div class="cab"><span class="data">${esc(x.matricula)}</span>
        <span class="sem">${esc(x.email)}</span>
        <span class="vale">${x.admin ? 'administrador' : ''}</span></div>
      <div class="nota">${x.ativa ? 'ativa' : 'ainda não ativada'} desde ${esc(new Date(x.criada_em).toLocaleDateString('pt-BR'))}</div>
    </div>`).join('');
}

/* ---------- meses ---------- */

const ymDe = (d) => d.slice(0, 7);
const hojeYM = () => R.hoje().slice(0, 7);

/* Completa o mes com os dias que ainda nao vieram no relatorio, como a pagina do
   computador faz: fim de semana vira folga, feriado vira feriado. */
function completaMes(ym, lista) {
  const tem = new Set(lista.map((x) => x.d));
  const d = new Date(ym + '-01T12:00');
  const m = d.getMonth();
  const fora = [];
  for (; d.getMonth() === m; d.setDate(d.getDate() + 1)) {
    const s = R.iso(d);
    if (tem.has(s)) continue;
    const w = d.getDay();
    const n = R.mk(s, (w === 0 || w === 6) ? 'folga' : R.ehFeriado(s) ? 'feriado' : 'util', '');
    n.futuro = true;
    n.rev = 0;
    fora.push(n);
  }
  return lista.concat(fora).sort((a, b) => (a.d < b.d ? -1 : 1));
}

async function carregaMes(ym) {
  const r = await api('GET', '/api/mes/' + ym);
  if (r.status === 401) { paraEntrar(); return null; }
  if (!r.ok) return null;
  months[ym] = { meta: r.dado.meta || null, dias: r.dado.dias || [] };
  return months[ym];
}

function listaMeses() {
  const ks = new Set(Object.keys(months));
  const d = new Date(R.hoje() + 'T12:00');
  d.setDate(15);
  d.setMonth(d.getMonth() - 2);
  for (let i = 0; i < 3; i++) { ks.add(R.iso(d).slice(0, 7)); d.setMonth(d.getMonth() + 1); }
  if (cur) ks.add(cur);
  return [...ks].sort().reverse();
}

function pintaMeses() {
  const ks = listaMeses();
  $('mesSel').innerHTML = ks.map((k) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(R.cap(R.nomeMes(k)))}</option>`).join('');
  $('mesTit').textContent = 'Dias de ' + R.nomeMes(cur);
}

function usaMes(ym, soRedesenha) {
  cur = ym;
  const m = months[ym] || { meta: null, dias: [] };
  months[ym] = m;
  dias = completaMes(ym, m.dias.map((x) => ({ ...x })));
  R.defineDias(dias);
  if (!soRedesenha) pintaMeses();
  desenha();
}

$('mesSel').addEventListener('change', async () => {
  const ym = $('mesSel').value;
  if (!months[ym]) await carregaMes(ym);
  usaMes(ym);
});

/* ---------- desenho do mes ---------- */

function desenha() {
  if (!eu) return;
  const T = R.totals(true, false, dias);
  pintaSaldo(T);
  pintaDias();
  pintaCalculo(T);
  pintaFila();
}

function pintaSaldo(T) {
  const s = T.saldo;
  $('saldo').className = 'saldo' + (s < 0 ? ' deve' : '');
  $('saldoLbl').textContent = 'Saldo de ' + R.nomeMes(cur);
  $('saldoBig').textContent = (s < 0 ? '−' : s > 0 ? '+' : '') + R.fmt(Math.abs(s)).replace('−', '');
  $('saldoVerd').textContent = s < 0 ? 'Você está devendo' : s > 0 ? 'Você está sobrando' : 'Está em dia';

  /* Dias uteis que ainda faltam, para dizer quanto da para trabalhar a menos ou a mais. */
  const h = R.hoje();
  const faltam = dias.filter((x) => x.d > h && x.tipo === 'util').length;
  const partes = [
    `<div><span>Crédito no mês</span><b>${esc(R.fmt(T.cred))}</b></div>`,
    `<div><span>Débito no mês</span><b>${esc(R.fmt(T.deb))}</b></div>`,
  ];
  if (T.irr) partes.push(`<div><span>Crédito irregular (fora do banco)</span><b>${esc(R.fmt(T.irr))}</b></div>`);
  if (faltam && cur === hojeYM()) {
    const porDia = Math.round(Math.abs(s) / faltam);
    partes.push(`<div><span>${faltam} dia(s) útil(eis) até o fim do mês</span><b>${s < 0 ? '+' : '−'}${esc(R.hm(porDia))} por dia</b></div>`);
  }
  $('saldoAlts').innerHTML = partes.join('');
}

function pintaDias() {
  const h = R.hoje();
  const ordem = [...dias].sort((a, b) => (a.d < b.d ? 1 : -1));   // o mais recente primeiro, no celular
  $('dias').innerHTML = ordem.map((x) => {
    const r = R.calcDay(x);
    const vale = r.fora ? '' : r.cred ? `+${R.hm(r.cred)}` : r.deb ? `−${R.hm(r.deb)}` : r.extra ? `extra ${R.hm(r.extra)}` : '0:00';
    const classe = r.cred ? 'c' : r.deb ? 'd' : '';
    const naFila = fila.tem(x.d);
    return `<div class="dia ${esc(x.tipo)}${x.d === h ? ' hoje' : ''}${aberto === x.d ? ' aberto' : ''}" data-d="${esc(x.d)}">
      <div class="cab">
        <span class="data">${esc(x.d.slice(8))}/${esc(x.d.slice(5, 7))}</span>
        <span class="sem">${esc(R.WD[R.wd(x.d)])}${x.tipo !== 'util' ? ' · ' + esc({ folga: 'folga', feriado: 'feriado', ferias: 'férias' }[x.tipo]) : ''}</span>
        <span class="vale ${classe}">${esc(vale)}</span>
      </div>
      <div class="marcas">${esc(x.marcas || '—')}${r.odd ? ' <span class="nota">(marcação ímpar)</span>' : ''}</div>
      ${x.obs ? `<div class="nota">${esc(x.obs)}</div>` : ''}
      ${r.fora && x.d >= h ? '<div class="nota">ainda não entra no saldo</div>' : ''}
      ${naFila ? '<div class="nota">editado aqui, ainda não enviado</div>' : ''}
      <div class="campos">
        <div><label>Marcações — um campo para cada hora</label>
          <div class="mk">${R.emCampos(x.marcas).map((v, k) => `<input data-m="${k}" value="${esc(v)}" inputmode="numeric" placeholder="--:--" aria-label="${esc(R.ROTM[k] || 'Batida ' + (k + 1))}" title="${esc(R.ROTM[k] || 'Batida ' + (k + 1))}">`).join('')}</div></div>
        <div class="grade2">
          <div><label>Abono</label><input data-f="abono" value="${esc(x.abono || '')}" placeholder="0:00"></div>
          <div><label>Tipo do dia</label><select data-f="tipo">${R.TIPOS.map((t) =>
            `<option value="${t}"${t === x.tipo ? ' selected' : ''}>${({ util: 'dia útil', folga: 'folga', feriado: 'feriado', ferias: 'férias' })[t]}</option>`).join('')}</select></div>
        </div>
        <div><label>Observação</label><input data-f="obs" value="${esc(x.obs || '')}"></div>
        <div class="nota">Trabalhado ${esc(R.hm(r.worked))} · jornada ${esc(R.hm(r.carga))}${x.srpMarcas && R.normM(x.srpMarcas) !== R.normM(x.marcas) ? ' · no SRP: ' + esc(x.srpMarcas) : ''}</div>
      </div>
    </div>`;
  }).join('');

  for (const el of $('dias').querySelectorAll('.dia')) {
    el.querySelector('.cab').onclick = () => {
      aberto = aberto === el.dataset.d ? null : el.dataset.d;
      pintaDias();
    };
    for (const campo of el.querySelectorAll('[data-f]')) {
      campo.onchange = () => editaDia(el.dataset.d, campo.dataset.f, campo.value);
    }
    /* Um campo por hora: a linha de marcações é remontada na ordem dos campos. */
    const mk = el.querySelector('.mk');
    if (mk) for (const campo of mk.querySelectorAll('input[data-m]')) {
      campo.onchange = () => {
        const este = R.comDoisPontos(campo.value).trim();
        /* colar a linha inteira num campo só vale pela linha inteira, em vez de somar com o resto */
        const linha = este.split(/\s+/).filter(Boolean).length > 1 ? este
          : [...mk.querySelectorAll('input[data-m]')].map((c) => R.comDoisPontos(c.value).trim()).filter(Boolean).join(' ');
        editaDia(el.dataset.d, 'marcas', linha);
      };
    }
  }
}

function editaDia(data, campo, valor) {
  const x = dias.find((d) => d.d === data);
  if (!x) return;
  if (campo === 'marcas') valor = R.comDoisPontos(valor);
  if (campo === 'marcas' && R.marcInvalida(valor)) {
    avisa('avisoConflito', `Não entendi “${esc(valor)}”. Escreva cada hora como 08:00, ou sem os dois pontos: 0800.`, 'ruim');
    return;
  }
  avisa('avisoConflito', '');
  if (campo === 'tipo') { x.tipo = valor; x.tipoManual = true; }
  else x[campo] = valor;
  x.futuro = false;
  const m = months[cur];
  const i = m.dias.findIndex((d) => d.d === data);
  if (i >= 0) m.dias[i] = { ...m.dias[i], ...x };
  else m.dias.push({ ...x });
  enfileira(x);
  desenha();
}

/* ---------- calculo do dia ---------- */

const CAMPOS = ['cE1', 'cS1', 'cE2', 'cS2', 'cJ', 'cAlvo'];

/* As quatro batidas digitadas viram a mesma string de marcacoes que a tabela usa, com o
   mesmo tratamento de turno que passa da meia-noite. */
function marcasDigitadas() {
  return CAMPOS.slice(0, 4).map((id) => $(id).value.trim()).filter(Boolean).join(' ');
}

function diaSimulado(J) {
  const h = R.hoje();
  const arr = cur === hojeYM() ? dias : ((months[hojeYM()] && months[hojeYM()].dias) || []);
  const xh = arr.find((d) => d.d === h);
  return { ...(xh || { d: h, tipo: 'util', marcas: '', srpMarcas: '' }), carga: J, futuro: false };
}

function pintaCalculo(T) {
  const contrib = (r) => (r.fora ? 0 : r.cred - r.deb);
  const h = R.hoje();
  const arr = cur === hojeYM() ? dias : ((months[hojeYM()] && months[hojeYM()].dias) || []);
  const xh = arr.find((d) => d.d === h);
  const S = T.saldo - (xh ? contrib(R.calcDay(xh)) : 0);

  const v = (id) => R.toM($(id).value || '');
  let E1 = v('cE1'), S1 = v('cS1'), E2 = v('cE2'), S2 = v('cS2');
  const J = v('cJ') ?? 480;
  { let ant = E1, add = 0; const aj = (m) => { if (m == null) return m; if (ant != null && m + add < ant) add += 1440; ant = m + add; return m + add; }; S1 = aj(S1); E2 = aj(E2); S2 = aj(S2); }
  try { localStorage.setItem('cartinhas.app.calc', JSON.stringify(CAMPOS.map((i) => $(i).value))); } catch (_) {}

  const manha = (E1 != null && S1 != null) ? S1 - E1 : null;
  const tarde = (E2 != null && S2 != null) ? S2 - E2 : null;
  const semAlm = S1 == null && E2 == null;
  let total = null;
  if (semAlm && E1 != null && S2 != null) total = S2 - E1;
  else if (manha != null && tarde != null) total = manha + tarde;

  const sim = diaSimulado(J);
  let out = '';
  if (total != null) {
    const r = R.calcDay(sim, marcasDigitadas());
    const sal = r.cred - r.deb;
    $('calcDiaLbl').textContent = `Hoje, ${R.br(h)}: ${(sal < 0 ? '−' : '+')}${R.hm(sal)} no dia`;
    if (r.desc) out += `<p>O SRP desconta ${esc(R.hm(r.desc))} porque o intervalo foi menor que 1 h.</p>`;
    if (sim.tipo !== 'util') out += `<p>Hoje está como ${esc({ folga: 'fim de semana', feriado: 'feriado', ferias: 'férias' }[sim.tipo] || sim.tipo)}: as horas viram hora extra paga, fora do banco.</p>`;
    if (r.tol) out += `<p>${esc(R.hm(r.tol))} ${r.tol > 0 ? 'a mais' : 'a menos'} ficam na tolerância de 10 min e não entram no saldo.</p>`;
    if (r.extra && sim.tipo === 'util') out += `<p>${esc(R.hm(r.extra))} de hora extra autorizada: é paga e fica fora do banco.</p>`;
    if (r.abono) out += `<p>O abono de ${esc(R.hm(r.abono))} cobre ${r.deb ? 'parte do' : 'o'} débito do dia.</p>`;
    if (r.irr) out += `<p>Passou de +2:00: ${esc(R.hm(r.irr))} vira crédito irregular.</p>`;
    out += `<p>Com esse dia, o mês fica em <b>${esc(R.fmt(S + contrib(r), true))}</b>.</p>`;
  } else {
    $('calcDiaLbl').textContent = `Hoje é ${R.br(h)}. Digite a entrada e o almoço.`;
  }

  const alvo = parseAlvo($('cAlvo').value);
  if (S2 == null && E1 != null && alvo != null) {
    const q = horaDeSaida(E1, S1, E2, J, alvo, sim);
    if (q.saida != null) {
      const rs = R.calcDay(sim, [E1, S1, E2, q.saida].filter((m) => m != null).map(R.clock).join(' '));
      const efd = rs.cred - rs.deb;
      out = `<p><b style="font-size:20px">Pode ir embora às ${esc(R.clock(q.saida))}</b><br>` +
        `o dia fecha em ${esc((efd < 0 ? '−' : '+') + R.hm(efd))} · o mês fica em ${esc(R.fmt(S + contrib(rs), true))}</p>` +
        (q.semAlm && q.meta > J ? '<p>Sem almoço informado: como passa da jornada, já contei 1 h de intervalo.</p>' : '') +
        (q.bruto !== q.alvo ? `<p>Para o dia fechar em ${esc((q.alvo < 0 ? '−' : '+') + R.hm(q.alvo))} no banco, a conta pede ${esc(R.hm(Math.abs(q.bruto)))} ${q.bruto < 0 ? 'a menos' : 'a mais'} que a jornada, porque ${q.heA && q.alvo > 0 ? esc(R.hm(q.heA)) + ' de hora extra autorizada é paga à parte' : 'o abono de ' + esc(R.hm(q.abA)) + ' cobre parte do débito'}.</p>` : '') +
        out;
    } else {
      out = '<p>Informe a saída e a volta do almoço (ou deixe as duas em branco) para eu calcular a hora de saída.</p>' + out;
    }
  } else if (E1 == null) {
    out = '<p>Digite a entrada e o almoço. Com a saída em branco, eu digo a que horas você pode ir embora para o saldo que você escolher.</p>' + out;
  } else if (alvo == null && S2 == null) {
    out = '<p>Escreva o saldo desejado como +0:30, −1:00 ou 0:00.</p>' + out;
  }
  $('calcSaida').innerHTML = out;
}

for (const id of CAMPOS) {
  $(id).addEventListener('input', () => { if (eu) pintaCalculo(R.totals(true, false, dias)); });
}

$('btnHoje').addEventListener('click', () => {
  const x = dias.find((d) => d.d === R.hoje());
  const m = x ? R.parseList(x.marcas) : [];
  $('cJ').value = R.clock(x && x.carga ? x.carga : 480);
  const v = m.length === 2 ? [m[0], null, null, m[1]] : [m[0], m[1], m[2], m[3]];
  CAMPOS.slice(0, 4).forEach((id, k) => { $(id).value = v[k] != null ? R.clock(v[k]) : ''; });
  pintaCalculo(R.totals(true, false, dias));
});

/* ---------- importar o relatorio ---------- */

$('arq').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  avisa('avisoImp', 'Lendo o arquivo…');
  try {
    const texto = /\.txt$/i.test(f.name) || f.type === 'text/plain' ? await f.text() : await lePdf(f);
    await importa(texto);
  } catch (err) {
    avisa('avisoImp', 'Não consegui ler esse arquivo: ' + esc(err.message), 'ruim');
  }
  e.target.value = '';
});

async function lePdf(file) {
  const lib = await import('./vendor/pdf.min.mjs');
  lib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';
  /* isEvalSupported:false: o PDF nao executa script na pagina (CVE-2024-4367) */
  const doc = await lib.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  let txt = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const pag = await doc.getPage(p);
    const c = await pag.getTextContent();
    let linha = null, y = null;
    for (const it of c.items) {
      const ny = Math.round(it.transform[5]);
      if (y === null || Math.abs(ny - y) > 3) { if (linha !== null) txt += linha + '\n'; linha = ''; y = ny; }
      linha += it.str + ' ';
    }
    if (linha !== null) txt += linha + '\n';
  }
  return txt;
}

async function importa(texto) {
  const novos = R.parseReport(texto);
  if (!novos.length) {
    return avisa('avisoImp', 'Não encontrei nenhuma linha com data (dd/mm/aaaa) nesse arquivo. Use o PDF do Relatório Espelho de Ponto.', 'ruim');
  }
  const info = R.parseMeta(texto);
  const ym = ymDe(novos[0].d);
  if (!months[ym]) await carregaMes(ym);
  const antigos = (months[ym] && months[ym].dias) || [];
  const u = R.uneDias(antigos, novos, ym);
  const porData = new Map(antigos.map((x) => [x.d, x]));
  const paraMandar = u.days
    .filter((x) => u.vindos.has(x.d))
    .map((x) => ({ ...x, rev: (porData.get(x.d) || {}).rev || 0 }));

  const corpo = { ym, meta: info && info.nome ? { nome: info.nome.trim(), periodo: info.periodo } : undefined, dias: paraMandar.map(paraEnvio) };
  let r = await api('POST', '/api/dias', corpo);

  if (r.status === 409 && r.dado.erro === 'titular_diferente') {
    const vai = confirm(`Este relatório está em nome de ${r.dado.doArquivo}, e esta conta é de ${r.dado.daConta}. ` +
      `Não importei nada, para não misturar o ponto de duas pessoas.\n\nImportar mesmo assim?`);
    if (!vai) return avisa('avisoImp', `Não importei nada: o relatório é de ${esc(r.dado.doArquivo)} e a conta é de ${esc(r.dado.daConta)}.`, 'ruim');
    r = await api('POST', '/api/dias', { ...corpo, confirmaTitular: true });
  }
  if (r.status === 401) return paraEntrar();
  if (!r.ok && r.status !== 409) return avisa('avisoImp', esc(recado(r)), 'ruim');

  await carregaMes(ym);
  usaMes(ym);
  const n = (r.dado.salvos || []).length;
  if (r.dado.conflitos && r.dado.conflitos.length) {
    conflitos = r.dado.conflitos.map((c) => ({ ...c, meu: paraMandar.find((x) => x.d === c.d) }));
    pintaConflitos();
  }
  avisa('avisoImp', `Importei ${n} dia(s) de ${esc(R.nomeMes(ym))}.` +
    (r.dado.conflitos && r.dado.conflitos.length ? ` ${r.dado.conflitos.length} dia(s) mudaram em outro aparelho e estão esperando você escolher.` : ''), 'bom');
}

/* ---------- virada do dia ---------- */

function conferiaDia() {
  const h = R.iso(new Date());
  if (h === R.hoje()) return false;
  R.defineHoje(h);
  if (cur !== h.slice(0, 7) && !months[h.slice(0, 7)]) carregaMes(h.slice(0, 7)).then(() => usaMes(h.slice(0, 7)));
  else desenha();
  return true;
}
window.addEventListener('focus', conferiaDia);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { conferiaDia(); envia(); } });
window.addEventListener('online', () => { pintaFila(); envia(); });
window.addEventListener('offline', pintaFila);

/* ---------- rotas ---------- */

async function rota() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  if (p === '/convite') { mostra('telaConvite'); return; }
  if (p === '/senha-nova') {
    const token = location.hash.slice(1);
    const r = await api('GET', '/api/link/' + encodeURIComponent(token));
    if (!r.ok) {
      mostra('telaSenha');
      $('formSenha').hidden = false;
      avisa('avisoSenha', 'Esse link não vale mais. Peça um novo convite a quem convidou, ou use “Esqueci minha senha” na tela de entrada.', 'ruim');
      return;
    }
    $('tituloSenha').textContent = r.dado.tipo === 'convite' ? 'Criar a sua senha' : 'Escolher uma senha nova';
    $('recadoSenha').textContent = r.dado.tipo === 'convite'
      ? `Conta da matrícula ${r.dado.matricula}. Escolha a senha que você vai usar no Cartinhas.`
      : `Conta da matrícula ${r.dado.matricula}. Ao salvar, as sessões abertas em outros aparelhos pedem login de novo.`;
    $('matSenha').value = r.dado.matricula;
    mostra('telaSenha');
    return;
  }
  if (!eu) { const abriu = await comeca(true); if (!abriu) return; }
  if (p === '/usuarios' && eu.admin) { mostra('telaUsuarios'); await carregaUsuarios(); return; }
  mostra('telaApp');
}

window.addEventListener('popstate', rota);

/* ---------- comeco ---------- */

async function comeca(silencioso) {
  const r = await api('GET', '/api/eu');
  if (!r.dado.entrou) { if (!silencioso) paraEntrar(); else mostra('telaEntrar'); return false; }
  eu = r.dado.conta;
  $('quem').textContent = `matrícula ${eu.matricula}${eu.nome ? ' · ' + eu.nome : ''}`;
  fila.entra(eu.matricula);
  R.defineHoje(R.iso(new Date()));
  const ym = hojeYM();
  await carregaMes(ym);
  const outros = await api('GET', '/api/meses');
  for (const m of (outros.dado.meses || [])) if (!months[m.ym]) months[m.ym] = { meta: m.meta, dias: [] };
  usaMes(ym);
  mostra('telaApp');
  try {
    const guardado = JSON.parse(localStorage.getItem('cartinhas.app.calc') || '[]');
    if (Array.isArray(guardado) && guardado.length === CAMPOS.length) {
      CAMPOS.forEach((id, i) => { $(id).value = guardado[i] || ''; });
    }
  } catch (_) {}
  if (!$('cJ').value) $('btnHoje').click();
  envia();
  return true;
}

/* ---------- service worker ---------- */

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

api('GET', '/api/saude').then((r) => {
  $('versao').textContent = r.ok ? `versão ${r.dado.versao} · ${r.dado.vagas.ativas} de ${r.dado.vagas.total} vagas em uso` : '';
});

rota();
