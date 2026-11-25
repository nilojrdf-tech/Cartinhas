// Auditoria de testes do Cartinhas — roda a página real num navegador simulado (jsdom)
// Uso: node auditoria.test.js <caminho do index.html> [AAAA-MM-DD de "hoje"]
const {JSDOM}=require(process.env.JSDOM||'jsdom');const fs=require('fs');
const ARQ=process.argv[2];const HOJE=process.argv[3]||'2026-11-25';
const BASE=fs.readFileSync(ARQ,'utf8').replace(/<script src=[^>]+><\/script>/g,'').replace("const todayISO=iso(new Date());",`const todayISO='${HOJE}';`);
function abre(hoje){const html=hoje?BASE.replace(`const todayISO='${HOJE}';`,`const todayISO='${hoje}';`):BASE;
  const erros=[];const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://teste.local/',pretendToBeVisual:true,beforeParse(win){win.localStorage.clear();win.addEventListener('error',e=>erros.push(e.message))}});const w=dom.window;
  const d=w.document;const T=id=>(d.getElementById(id)||{textContent:''}).textContent.replace(/\s+/g,' ').trim();
  const api={w,d,erros,T,
    importa(txt){d.getElementById('txt').value=txt;d.getElementById('btnTxt').click()},
    est(){return JSON.parse(w.localStorage.getItem('cartinhas.v4')||'{}')},
    mes(ym){const s=d.getElementById('mesSel');s.value=ym;s.dispatchEvent(new w.Event('change'))},
    linha(dd){return [...d.querySelectorAll('#tb tr')].find(tr=>tr.querySelector('td')&&tr.querySelector('td').textContent.startsWith(dd))},
    edita(dd,campo,val){const tr=api.linha(dd);const i=tr.querySelector(`[data-f=${campo}]`);i.value=val;i.dispatchEvent(new w.Event('change',{bubbles:true}))},
    cel(dd){const tr=api.linha(dd);if(!tr)return null;const c=tr.querySelectorAll('td');return {trab:c[3].textContent.trim(),abono:c[4].querySelector('input')?c[4].querySelector('input').value:'',cred:c[5].textContent.trim(),deb:c[6].textContent.trim(),tipo:tr.querySelector('select').value,classe:tr.className}},
    saldo(){return T('bigLbl')+' | '+T('big')},
    calc(v){for(const [k,x] of Object.entries(v)){const e=d.getElementById(k);e.value=x;e.dispatchEvent(new w.Event('input'))}return T('hoje')}};
  return api}
const R=[];let id=0;
function caso(grupo,nome,fn){id++;let r;try{r=fn()}catch(e){r={ok:false,obs:'ERRO: '+e.message}}R.push({id,grupo,nome,...r});}
const dia=(d,m,y=2026)=>`${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`;
const L=(d,m,marks,carga='08:00',occ='Inter Jornada;',y=2026)=>`${dia(d,m,y)} ${marks} ${carga} ${occ}`.replace(/\s+/g,' ');

// ---------- LEITURA DO RELATÓRIO ----------
caso('Leitura do relatório','Relatório de 2 páginas com cabeçalho repetido no meio dos dias',()=>{const p=abre();
  p.importa([L(3,11,'08:00 12:00 13:00 17:00'),'Página 1 de 2','RELATÓRIO ESPELHO DE PONTO','25/11/2026 14:02:38','Competência: Período: 01/11/2026 à 30/11/2026','Data Marcações','Ocorrências',L(4,11,'08:00 12:00 13:00 18:00')].join('\n'));
  const a=p.cel('03/11'),b=p.cel('04/11');return {ok:a.trab==='08:00'&&b.trab==='09:00'&&b.cred==='01:00',obs:`03/11 ${a.trab}, 04/11 ${b.trab} crédito ${b.cred}`}});
caso('Leitura do relatório','Período que atravessa dois meses (21/10 a 20/11)',()=>{const p=abre();
  p.importa([L(30,10,'08:00 12:00 13:00 17:00'),L(31,10,'',"",'Folga;'),L(3,11,'08:00 12:00 13:00 18:00')].join('\n'));
  const e=p.est();const out=e.months&&e.months['2026-10'],nov=e.months&&e.months['2026-11'];
  const temNov=nov&&nov.days.some(x=>x.d==='2026-11-03'&&x.marcas);
  return {ok:!!temNov,obs:temNov?'os dois meses recebem seus dias':'os dias de novembro foram descartados (só o mês da primeira data é importado)'}});
caso('Leitura do relatório','Texto copiado da tela do SRP (não do PDF)',()=>{const p=abre();
  p.importa('03/11/2026 Ter 10:53 16:58 10:53 16:58 06:05 01:55\n04/11/2026 Qua 09:46 15:47 09:46 15:47 06:01 01:59');
  const m=p.T('msg');const a=p.cel('03/11');return {ok:/tela do SRP/.test(m)&&!(a&&a.deb),obs:'aviso: '+m.slice(0,70)}});
caso('Leitura do relatório','Três pares de batidas (dois intervalos)',()=>{const p=abre();
  p.importa(L(3,11,'08:00 10:00 10:15 12:00 13:00 17:00'));const a=p.cel('03/11');
  return {ok:a.trab==='07:45'&&a.deb==='00:15',obs:`trabalhadas ${a.trab}, débito ${a.deb}`}});
caso('Leitura do relatório','"Ponto facultativo" sem carga no relatório',()=>{const p=abre();
  p.importa(dia(28,10)+' Ponto Facultativo;');const e=p.est();const x=e.months['2026-10'].days.find(z=>z.d==='2026-10-28');p.mes('2026-10');const c=p.cel('28/10');
  return {ok:!c.deb,obs:`tipo lido: ${x.tipo}; débito: ${c.deb||'nenhum'}`}});
caso('Leitura do relatório','Afastamento/licença sem "Total" no relatório',()=>{const p=abre();
  p.importa(dia(10,11)+' 08:00 Afastamento: Licença Médica;');const c=p.cel('10/11');
  return {ok:!c.deb,obs:`débito: ${c.deb||'nenhum'} · abono: ${c.abono||'nenhum'}`}});
caso('Leitura do relatório','Carga de 6h (jornada reduzida)',()=>{const p=abre();
  p.importa(L(3,11,'08:00 14:00','06:00'));const c=p.cel('03/11');return {ok:!c.deb&&!c.cred,obs:`trab ${c.trab}, crédito ${c.cred||'-'}, débito ${c.deb||'-'}`}});
caso('Leitura do relatório','Dia útil inteiro sem batida e sem ocorrência (falta)',()=>{const p=abre();
  p.importa(dia(3,11)+' 08:00 Falta 08:00;');const c=p.cel('03/11');return {ok:c.deb==='08:00',obs:`débito ${c.deb}`}});
caso('Leitura do relatório','Hora extra autorizada em dia útil ("Extras 01:00")',()=>{const p=abre();
  p.importa(L(3,11,'08:00 12:00 13:00 18:00','08:00','Extras 01:00; HE autorizada;'));const c=p.cel('03/11');
  return {ok:!c.cred,aviso:true,obs:`crédito no banco: ${c.cred||'nenhum'} (HE autorizada é paga e fica fora do banco)`}});
caso('Leitura do relatório','Relatório de outra pessoa importado por engano',()=>{const p=abre();
  p.importa('Empregado: FULANO DE TAL CEI:\n'+L(3,11,'08:00 12:00 13:00 17:00'));p.importa('Empregado: BELTRANO CEI:\n'+L(4,11,'08:00 12:00 13:00 17:00'));
  const m=p.T('msg');return {ok:/BELTRANO/.test(m)&&/FULANO/.test(m),aviso:true,obs:'aviso: '+m.slice(m.indexOf('Atenção'))}});
caso('Leitura do relatório','Importar de novo um relatório mais antigo depois de corrigir um dia',()=>{const p=abre();
  p.importa(L(6,11,'10:36 13:50 19:00'));p.edita('06/11','marcas','10:36 13:50 19:00 23:10');p.importa(L(6,11,'10:36 13:50 19:00'));const c=p.cel('06/11');
  return {ok:c.trab==='07:24',obs:`após reimportar: trabalhadas ${c.trab} (correção ${c.trab==='07:24'?'mantida':'perdida'})`}});
caso('Leitura do relatório','SRP aprova a cartinha (batidas mudam no relatório)',()=>{const p=abre();
  p.importa(L(6,11,'10:36 13:50 19:00'));p.edita('06/11','marcas','10:36 13:50 19:00 23:10');p.importa(L(6,11,'10:36 13:50 19:00 23:00'));const c=p.cel('06/11');
  return {ok:c.trab==='07:14',obs:`passa a valer o SRP: trabalhadas ${c.trab}`}});

// ---------- CÁLCULO ----------
const umDia=(marks,carga)=>{const p=abre();p.importa(L(3,11,marks,carga));return p.cel('03/11')};
caso('Cálculo','Tolerância: +10 min não conta',()=>{const c=umDia('08:00 12:00 13:00 17:10');return {ok:!c.cred,obs:`crédito ${c.cred||'nenhum'}`}});
caso('Cálculo','Tolerância: +11 min conta inteiro',()=>{const c=umDia('08:00 12:00 13:00 17:11');return {ok:c.cred==='00:11',obs:`crédito ${c.cred}`}});
caso('Cálculo','Tolerância: −10 min não conta',()=>{const c=umDia('08:00 12:00 13:00 16:50');return {ok:!c.deb,obs:`débito ${c.deb||'nenhum'}`}});
caso('Cálculo','Crédito exatamente +2:00',()=>{const c=umDia('08:00 12:00 13:00 19:00');return {ok:c.cred==='02:00',obs:`crédito ${c.cred}`}});
caso('Cálculo','Crédito +2:30 → 2:00 no banco e 0:30 irregular',()=>{const c=umDia('08:00 12:00 13:00 19:30');return {ok:c.cred==='02:00',obs:`crédito ${c.cred}`}});
caso('Cálculo','Intervalo de 59 min com jornada acima de 8h (desconta 1 min)',()=>{const c=umDia('08:00 12:00 12:59 18:00');return {ok:c.trab==='09:00',obs:`trabalhadas ${c.trab}`}});
caso('Cálculo','Sem intervalo, 9h seguidas (desconta 1h)',()=>{const c=umDia('08:00 17:00');return {ok:c.trab==='08:00',obs:`trabalhadas ${c.trab}`}});
caso('Cálculo','Turno noturno 22:00–06:00 com carga 07:15',()=>{const c=umDia('22:00 02:00 03:00 06:15','07:15');return {ok:c.trab==='07:15'&&!c.deb,obs:`trabalhadas ${c.trab}`}});
caso('Cálculo','Batidas fora de ordem digitadas na tabela (17:00 antes de 08:00)',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));p.edita('03/11','marcas','13:00 17:00 08:00 12:00');const c=p.cel('03/11');
  return {ok:c.trab==='08:00',obs:`trabalhadas ${c.trab} (o sistema entende a batida menor como do dia seguinte)`}});
caso('Cálculo','Hora inválida digitada ("25:00", "10:3o")',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));p.edita('03/11','marcas','08:00 12:00 13:00 25:00');const c=p.cel('03/11');
  const inv=p.linha('03/11').querySelector('[data-f=marcas]').classList.contains('inv');return {ok:inv&&c.trab!=='16:00',aviso:true,obs:`campo em vermelho: ${inv}; trabalhadas ${c.trab||'(ignora a hora inválida)'}`}});
caso('Cálculo','Trabalho em sábado (folga) — fora do banco',()=>{const p=abre();p.importa(dia(7,11)+' 08:00 12:00 Folga;');const c=p.cel('07/11');
  return {ok:!c.cred,obs:`crédito ${c.cred||'nenhum'}, trabalhadas ${c.trab}`}});

// ---------- ABONO ----------
caso('Abono','"30min" digitado no abono',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 16:30'));p.edita('03/11','abono','30min');const c=p.cel('03/11');
  return {ok:c.abono==='0:30',obs:`virou "${c.abono}"`}});
caso('Abono','"1:30" e "4h" digitados',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 15:30'));p.edita('03/11','abono','1:30');const a=p.cel('03/11');p.edita('03/11','abono','4h');const b=p.cel('03/11');
  return {ok:a.abono==='1:30'&&b.abono==='4:00',obs:`"1:30"→${a.abono} · "4h"→${b.abono}`}});
caso('Abono','Abono maior que o débito não vira crédito',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 16:00'));p.edita('03/11','abono','4:00');const c=p.cel('03/11');
  return {ok:!c.cred&&!c.deb,obs:`crédito ${c.cred||'-'}, débito ${c.deb||'-'}`}});
caso('Abono','Abono em dia sem nenhuma batida (dia inteiro abonado)',()=>{const p=abre();p.importa(dia(3,11)+' 08:00 Falta 08:00;');p.edita('03/11','abono','8:00');const c=p.cel('03/11');
  return {ok:!c.deb,obs:`débito ${c.deb||'nenhum'}`}});
caso('Abono','Abono em dia futuro sem batida (planejado)',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));p.edita('27/11','abono','8:00');const c=p.cel('27/11');
  return {ok:!c.deb,aviso:true,obs:`dia futuro: ${c.deb?'débito '+c.deb:'fora do saldo até chegar'}; a previsão do mês ainda conta o dia como útil`}});

// ---------- DATAS E MESES ----------
caso('Datas e meses','Virada de ano: dezembro → janeiro',()=>{const p=abre('2027-01-05');const ops=[...p.d.querySelectorAll('#mesSel option')].map(o=>o.value);
  return {ok:ops.includes('2027-01')&&ops.includes('2026-12'),obs:'meses: '+ops.join(', ')}});
caso('Datas e meses','1º de janeiro marcado como feriado',()=>{const p=abre('2027-01-05');const c=p.cel('01/01');return {ok:c&&c.tipo==='feriado',obs:'01/01: '+(c?c.tipo:'?')}});
caso('Datas e meses','Ano bissexto (fevereiro/2028 com 29 dias)',()=>{const p=abre('2028-02-10');const ok=!!p.cel('29/02');return {ok,obs:ok?'29/02 aparece':'29/02 não aparece'}});
caso('Datas e meses','Carnaval (ponto facultativo) não marcado',()=>{const p=abre('2027-02-08');const c=p.cel('09/02');
  const nota=/[Pp]onto facultativo/.test(p.d.querySelector('.note:not(.aviso)').textContent);return {ok:nota,aviso:true,obs:`09/02/2027 aparece como "${c?c.tipo:'?'}"; a tela orienta mudar o Tipo para Feriado: ${nota}`}});
caso('Datas e meses','Corpus Christi (ponto facultativo) não marcado',()=>{const p=abre('2027-05-20');const c=p.cel('27/05');
  const nota=/[Pp]onto facultativo/.test(p.d.querySelector('.note:not(.aviso)').textContent);return {ok:nota,aviso:true,obs:`27/05/2027 aparece como "${c?c.tipo:'?'}"; orientação na tela: ${nota}`}});
caso('Datas e meses','Hoje com entrada em aberto não conta; hoje fechado conta',()=>{const p=abre();p.importa(L(25,11,'08:00 12:00 13:00'));const a=p.cel('25/11');p.edita('25/11','marcas','08:00 12:00 13:00 17:00');const b=p.cel('25/11');
  return {ok:!a.deb&&b.trab==='08:00',obs:`aberto: débito ${a.deb||'nenhum'} · fechado: trabalhadas ${b.trab}`}});
caso('Datas e meses','Abrir o sistema num mês sem dados',()=>{const p=abre('2027-03-10');return {ok:/Sem dados/.test(p.T('prev'))&&!p.erros.length,obs:p.T('prev').slice(0,60)}});

// ---------- CÁLCULO DO DIA ----------
caso('Cálculo do dia','Saída para saldo +0:00 com almoço',()=>{const p=abre();const t=p.calc({cE1:'08:10',cS1:'12:00',cE2:'13:00',cS2:'',cAlvo:'+0:00'});return {ok:/17:10/.test(t),obs:t.slice(0,60)}});
caso('Cálculo do dia','Saldo desejado acima de +2:00 é limitado a +2:00',()=>{const p=abre();const t=p.calc({cE1:'08:00',cS1:'12:00',cE2:'13:00',cS2:'',cAlvo:'+3:00'});return {ok:/19:00/.test(t),obs:t.slice(0,60)}});
caso('Cálculo do dia','Turno noturno no cálculo (entrada 22:00)',()=>{const p=abre();const t=p.calc({cE1:'22:00',cS1:'02:00',cE2:'03:00',cS2:'',cJ:'07:15',cAlvo:'+0:00'});return {ok:/06:15/.test(t),obs:t.slice(0,60)}});
caso('Cálculo do dia','Saldo digitado com vírgula ou só número ("1,5", "30")',()=>{const p=abre();const t=p.calc({cE1:'08:00',cS1:'12:00',cE2:'13:00',cS2:'',cAlvo:'30'});
  return {ok:/17:30/.test(t),obs:'"30" lido como 30 min: '+t.slice(0,50)}});

// ---------- DADOS E SEGURANÇA ----------
caso('Dados','Texto com código na observação não é executado',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));p.edita('03/11','obs','<img src=x onerror=alert(1)>');
  return {ok:!p.d.querySelector('#tb img'),obs:'observação exibida como texto'}});
caso('Dados','Apagar tudo e desfazer',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));const b=p.d.getElementById('btnClear');b.click();b.click();const vazio=!p.cel('03/11')||!p.cel('03/11').trab;p.d.getElementById('btnUndo').click();const volta=p.cel('03/11').trab==='08:00';
  return {ok:vazio&&volta&&!p.erros.length,obs:`apagou: ${vazio}, desfez: ${volta}, erros: ${p.erros.length}`}});
caso('Dados','Remover um dia e importar de novo',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));p.linha('03/11').querySelector('button[data-del]').click();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));
  return {ok:!!p.cel('03/11'),obs:'o dia volta com a reimportação'}});
caso('Dados','Dois navegadores gravando o mesmo arquivo ao mesmo tempo',()=>({ok:/alterados em outro navegador/.test(BASE),aviso:true,obs:'antes de gravar, o sistema confere se o arquivo mudou e relê (conferido no código; o acesso a arquivo não roda no simulador)'}));
caso('Dados','Firefox / navegador sem acesso a arquivo',()=>{const p=abre();return {ok:/Chrome ou o Edge/.test(p.T('nuvem')),aviso:true,obs:'aviso na tela: '+p.T('nuvem')}});

caso('Abono','Formatos "1h30", "1,5" e "45min"',()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 15:00'));const v=[];for(const x of ['1h30','1,5','45min']){p.edita('03/11','abono',x);v.push(p.cel('03/11').abono)}
  return {ok:v.join(' ')==='1:30 1:30 0:45',obs:v.join(' · ')}});
caso('Leitura do relatório','Abono de dia inteiro aparece como 8:00 na coluna',()=>{const p=abre();p.importa(dia(10,11)+' 08:00 Afastamento: Licença Médica;');const c=p.cel('10/11');return {ok:c.abono==='08:00',obs:'coluna Abono: '+c.abono}});
caso('Leitura do relatório','Tipo trocado à mão continua depois de reimportar',()=>{const p=abre();p.importa(L(3,11,'',''));p.edita('03/11','tipo','feriado');p.importa(L(3,11,'',''));const c=p.cel('03/11');return {ok:c.tipo==='feriado',obs:'tipo: '+c.tipo}});

// ---------- CORREÇÕES DA AUDITORIA DE 25/11/2026 ----------
caso('Leitura do relatório','Relatório parcial não apaga os dias já importados',()=>{const p=abre();
  p.importa([L(3,11,'08:00 12:00 13:00 18:00'),L(4,11,'08:00 12:00 13:00 17:00')].join('\n'));
  p.edita('03/11','marcas','08:00 12:00 13:00 19:00');p.edita('03/11','obs','cartinha assinada');p.edita('03/11','abono','1:00');p.edita('03/11','tipo','folga');
  p.importa(L(4,11,'08:00 12:00 13:00 17:30'));
  const d3=(p.est().months['2026-11'].days.find(z=>z.d==='2026-11-03'))||{};const c4=p.cel('04/11');
  const ok=d3.marcas==='08:00 12:00 13:00 19:00'&&d3.obs==='cartinha assinada'&&d3.abono==='1:00'&&d3.tipo==='folga'&&!!d3.tipoManual&&!!c4&&c4.trab==='08:30';
  return {ok,obs:`03/11 continua com batidas "${d3.marcas||'—'}", obs "${d3.obs||'—'}", abono "${d3.abono||'—'}", tipo ${d3.tipo} (à mão: ${!!d3.tipoManual}) · 04/11 atualizado para ${c4?c4.trab:'—'}`}});
caso('Dados','Leitor de PDF em versão sem a falha CVE-2024-4367 e com eval desligado',()=>{
  const bruto=fs.readFileSync(ARQ,'utf8');const MIN=[4,2,67];const num=v=>v[0]*1e6+v[1]*1e3+v[2];
  const achadas=[...bruto.matchAll(/pdf\.js\/(\d+)\.(\d+)\.(\d+)\//g),...bruto.matchAll(/data-pdfjs-versao="(\d+)\.(\d+)\.(\d+)"/g)].map(m=>[+m[1],+m[2],+m[3]]);
  const vs=[...new Set(achadas.map(v=>v.join('.')))];
  const velhas=vs.filter(v=>num(v.split('.').map(Number))<num(MIN));
  const semEval=/getDocument\(\{[^}]*isEvalSupported:\s*false/.test(bruto);
  return {ok:vs.length>0&&!velhas.length&&semEval,
    obs:`pdf.js ${vs.join(', ')||'não encontrado'}${velhas.length?' — abaixo da versão corrigida '+MIN.join('.')+': '+velhas.join(', '):''} · isEvalSupported:false ${semEval?'presente':'AUSENTE'}`}});

// ---------- SAÍDA ----------
const fal=R.filter(r=>!r.ok&&!r.aviso),av=R.filter(r=>!r.ok&&r.aviso),ok=R.filter(r=>r.ok);
for(const r of R)console.log(`${r.ok?'PASSOU ':r.aviso?'ATENÇÃO':'FALHOU '} #${String(r.id).padStart(2,'0')} [${r.grupo}] ${r.nome} — ${r.obs}`);
console.log(`\nTotal: ${R.length} · passou ${ok.length} · falhou ${fal.length} · atenção ${av.length}`);
fs.writeFileSync('resultado.json',JSON.stringify(R,null,1));
