// Auditoria de testes do Cartinhas — roda a página real num navegador simulado (jsdom)
// Uso: node auditoria.test.js <caminho do index.html> [AAAA-MM-DD de "hoje"]
const {JSDOM}=require(process.env.JSDOM||'jsdom');const fs=require('fs');
const ARQ=process.argv[2];const HOJE=process.argv[3]||'2026-11-25';
const DECL=/(?:const|let) todayISO=iso\(new Date\(\)\);(?:\/\*[^*]*\*\/)?/;
const BASE=(()=>{const t=fs.readFileSync(ARQ,'utf8').replace(/<script src=[^>]+><\/script>/g,'');
  if(!DECL.test(t))throw new Error('não achei a declaração de todayISO em '+ARQ);
  return t.replace(DECL,`let todayISO='${HOJE}';`)})();
const JANELAS=[];
function abre(hoje){const html=hoje?BASE.replace(`let todayISO='${HOJE}';`,`let todayISO='${hoje}';`):BASE;
  const erros=[];const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://teste.local/',pretendToBeVisual:true,beforeParse(win){win.localStorage.clear();win.addEventListener('error',e=>erros.push(e.message))}});const w=dom.window;JANELAS.push(w);
  const d=w.document;const T=id=>(d.getElementById(id)||{textContent:''}).textContent.replace(/\s+/g,' ').trim();
  const api={w,d,erros,T,
    importa(txt){d.getElementById('txt').value=txt;d.getElementById('btnTxt').click()},
    est(){return JSON.parse(w.localStorage.getItem('cartinhas.v4')||'{}')},
    mes(ym){const s=d.getElementById('mesSel');s.value=ym;s.dispatchEvent(new w.Event('change'))},
    linha(dd){return [...d.querySelectorAll('#tb tr')].find(tr=>tr.querySelector('td')&&tr.querySelector('td').textContent.startsWith(dd))},
    /* A coluna de marcações tem um campo por hora: o caso digita a linha inteira e aqui ela
       é espalhada pelos campos, do mesmo jeito que a tela espalha ao desenhar. */
    marcas(dd,val){const cs=[...api.linha(dd).querySelectorAll('input[data-m]')];
      const t=String(val).trim()?String(val).trim().split(/\s+/):[];
      const v=t.length===2?[t[0],'','',t[1]]:t;
      cs.forEach((c,k)=>{c.value=v[k]||''});
      if(v.length>cs.length)cs[cs.length-1].value=v.slice(cs.length-1).join(' ');
      cs[0].dispatchEvent(new w.Event('change',{bubbles:true}))},
    campos(dd){return [...api.linha(dd).querySelectorAll('input[data-m]')].map(c=>c.value)},
    /* digita em UM campo de hora, como a pessoa faz */
    digita(dd,k,val){const c=[...api.linha(dd).querySelectorAll('input[data-m]')][k];
      c.value=val;c.dispatchEvent(new w.Event('change',{bubbles:true}))},
    invalido(dd){return [...api.linha(dd).querySelectorAll('input[data-m]')].some(c=>c.classList.contains('inv'))},
    edita(dd,campo,val){if(campo==='marcas')return api.marcas(dd,val);
      const tr=api.linha(dd);const i=tr.querySelector(`[data-f=${campo}]`);i.value=val;i.dispatchEvent(new w.Event('change',{bubbles:true}))},
    cel(dd){const tr=api.linha(dd);if(!tr)return null;const c=tr.querySelectorAll('td');return {trab:c[3].textContent.trim(),abono:c[4].querySelector('input')?c[4].querySelector('input').value:'',cred:c[5].textContent.trim(),deb:c[6].textContent.trim(),tipo:tr.querySelector('select').value,classe:tr.className}},
    saldo(){return T('bigLbl')+' | '+T('big')},
    calc(v){for(const [k,x] of Object.entries(v)){const e=d.getElementById(k);e.value=x;e.dispatchEvent(new w.Event('input'))}return T('hoje')}};
  return api}
const R=[];let id=0;
function caso(grupo,nome,fn){id++;let r;try{r=fn()}catch(e){r={ok:false,obs:'ERRO: '+e.message}}R.push({id,grupo,nome,...r});}
/* Casos que mexem no arquivo de dados são assíncronos: guardam o número agora e resolvem no fim. */
const PEND=[];
function casoA(grupo,nome,fn){id++;const meu=id;PEND.push((async()=>{let r;try{r=await fn()}catch(e){r={ok:false,obs:'ERRO: '+e.message}}R.push({id:meu,grupo,nome,...r})})())}
/* Um arquivo de dados de verdade, em memória, com a mesma interface que a página usa.
   Assim a suíte exercita conecta/gravaArq em vez de procurar mensagens no código. */
function fakeArq(texto){let conteudo=texto||'',mtime=1000,gravacoes=0;
  return {get conteudo(){return conteudo},get gravacoes(){return gravacoes},
    queryPermission:async()=>'granted',requestPermission:async()=>'granted',
    getFile:async()=>({lastModified:mtime,text:async()=>conteudo}),
    createWritable:async()=>({write:async t=>{conteudo=t;mtime+=1;gravacoes+=1},close:async()=>{}})}}
const leuDoArq=h=>{try{return JSON.parse(h.conteudo)}catch(e){return null}};
const diasDoArq=(h,ym)=>{const o=leuDoArq(h);
  return ((o&&o.months&&o.months[ym]&&o.months[ym].days)||[]).filter(x=>x.marcas&&String(x.marcas).trim()).map(x=>x.d)};
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
  const antes=JSON.stringify(p.cel('03/11'));
  p.importa('03/11/2026 Ter 10:53 16:58 10:53 16:58 06:05 01:55\n04/11/2026 Qua 09:46 15:47 09:46 15:47 06:01 01:59');
  const m=p.T('msg');const depois=JSON.stringify(p.cel('03/11'));
  /* o certo é o texto ser recusado: o dia tem de ficar exatamente como estava, com ou sem dados antes */
  return {ok:/tela do SRP/.test(m)&&depois===antes,obs:'aviso: '+m.slice(0,58)+' · 03/11 inalterado: '+(depois===antes)}});
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
  const inv=p.invalido('03/11');return {ok:inv&&c.trab!=='16:00',aviso:true,obs:`campo em vermelho: ${inv}; trabalhadas ${c.trab||'(ignora a hora inválida)'}`}});
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
casoA('Dados','Dois navegadores gravando dias diferentes no mesmo arquivo',async()=>{
  const h=fakeArq('');const a=abre(),b=abre();
  await a.w.cartinhasTeste.conecta(h,true);          // A adota o arquivo vazio
  await b.w.cartinhasTeste.conecta(h,true);          // B lê o que A gravou
  a.importa(L(3,11,'08:00 12:00 13:00 18:00'));
  b.importa(L(4,11,'08:00 12:00 13:00 18:00'));
  await a.w.cartinhasTeste.gravaArq();
  await b.w.cartinhasTeste.gravaArq();
  const dias=diasDoArq(h,'2026-11');
  return {ok:dias.includes('2026-11-03')&&dias.includes('2026-11-04'),
    obs:`no arquivo ficaram: ${dias.join(', ')||'nenhum'} · B avisou: ${b.T('nuvem').slice(0,56)}`}});
caso('Dados','Firefox / navegador sem acesso a arquivo',()=>{const p=abre();const t=p.T('nuvem');
  /* as duas redações avisam: a limpa manda usar Chrome ou Edge, a pessoal diz que ficou só neste navegador */
  return {ok:/Chrome ou o Edge/.test(t)||/s[óo] neste navegador/.test(t),aviso:true,obs:'aviso na tela: '+t.slice(0,80)}});

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

// ---------- ACHADOS 2, 4, 5, 6, 7 e 8 DA AUDITORIA DE 25/11/2026 ----------
// Saldo do mês em minutos, com sinal (o número na tela vem sem sinal, o sinal está no rótulo).
const saldoMin=p=>{const m=/(\d+)h(\d{2})/.exec(p.T('big'));if(!m)return null;
  const v=+m[1]*60+ +m[2];return /negativo/.test(p.T('bigLbl'))?-v:v};
const mesMin=t=>{const m=/mês fica em ([+−-]?)(\d+)h(\d{2})/.exec(t);
  return m?(m[1]==='−'||m[1]==='-'?-1:1)*(+m[2]*60+ +m[3]):null};
const zero=t=>/^[+−-]?0?0:00$/.test(String(t).trim());
const fmtMin=v=>v==null?'—':(v<0?'−':'+')+Math.floor(Math.abs(v)/60)+'h'+String(Math.abs(v)%60).padStart(2,'0');
// Simular um dia que já está fechado com as mesmas batidas não pode mudar o total do mês:
// se mudar, o dia está entrando duas vezes (ou com regra diferente da tabela).
const simulaMesmoDia=(p,marcas)=>{const [E1,S1,E2,S2]=marcas.split(/\s+/);
  const r=p.calc(S1?{cE1:E1,cS1:S1,cE2:E2,cS2:S2,cAlvo:'+0:00'}:{cE1:E1,cS1:'',cE2:'',cS2:S2,cAlvo:'+0:00'});
  return {r,mes:mesMin(r),antes:saldoMin(p),dia:p.T('cSal')}};

caso('Cálculo do dia','Hoje não é somado duas vezes no saldo do mês',()=>{const p=abre();
  p.importa(L(25,11,'08:00 12:00 13:00 18:00'));
  const s=simulaMesmoDia(p,'08:00 12:00 13:00 18:00');
  return {ok:s.mes!=null&&s.mes===s.antes&&/^\+01:00$/.test(s.dia),
    obs:`mês hoje ${fmtMin(s.antes)} · simulando o mesmo dia fechado: ${fmtMin(s.mes)} (dia ${s.dia})`}});
caso('Cálculo do dia','Tolerância de 10 min vale igual na tabela e no Cálculo do dia',()=>{const p=abre();
  p.importa(L(25,11,'08:00 12:00 13:00 17:05'));
  const c=p.cel('25/11');const s=simulaMesmoDia(p,'08:00 12:00 13:00 17:05');
  return {ok:!c.cred&&!c.deb&&zero(s.dia)&&s.mes===s.antes,
    obs:`tabela: crédito ${c.cred||'-'} débito ${c.deb||'-'} · calculadora: dia ${s.dia}, mês ${fmtMin(s.antes)} → ${fmtMin(s.mes)}`}});
caso('Cálculo do dia','Hora extra autorizada não entra no saldo do Cálculo do dia',()=>{const p=abre();
  p.importa(L(25,11,'08:00 12:00 13:00 18:00','08:00','Extras 01:00; HE autorizada;'));
  const s=simulaMesmoDia(p,'08:00 12:00 13:00 18:00');
  return {ok:zero(s.dia)&&s.mes===s.antes&&/autorizada/.test(s.r),
    obs:`dia ${s.dia}, mês ${fmtMin(s.antes)} → ${fmtMin(s.mes)} · aviso de HE autorizada: ${/autorizada/.test(s.r)}`}});
caso('Cálculo do dia','Abono do dia entra no Cálculo do dia',()=>{const p=abre();
  p.importa(L(25,11,'08:00 12:00 13:00 16:00'));
  p.edita('25/11','abono','1:00');
  const s=simulaMesmoDia(p,'08:00 12:00 13:00 16:00');
  return {ok:zero(s.dia)&&s.mes===s.antes&&/abono/i.test(s.r),
    obs:`1 h de débito abonada — dia ${s.dia}, mês ${fmtMin(s.antes)} → ${fmtMin(s.mes)} · aviso de abono: ${/abono/i.test(s.r)}`}});
caso('Dados','Releitura por mudança de versão mantém abono e tipo trocado à mão',()=>{const p=abre();
  p.importa(L(3,11,'08:00 12:00 13:00 16:00'));
  p.edita('03/11','abono','1:00');p.edita('03/11','tipo','feriado');p.edita('03/11','obs','guardar isso');
  p.w.cartinhasTeste.estado().months['2026-11'].meta.pv=0;  // finge relatório lido por versão antiga
  p.w.cartinhasTeste.relerMeses();
  const d=p.w.cartinhasTeste.estado().months['2026-11'].days.find(x=>x.d==='2026-11-03')||{};
  return {ok:d.abono==='1:00'&&d.tipo==='feriado'&&!!d.tipoManual&&d.obs==='guardar isso',
    obs:`depois de reler: abono "${d.abono||'—'}", tipo ${d.tipo} (à mão: ${!!d.tipoManual}), obs "${d.obs||'—'}"`}});
caso('Dados','Arquivo de dados fora do formato é recusado sem mexer na tela',()=>{const p=abre();
  p.importa(L(3,11,'08:00 12:00 13:00 17:00'));
  const antes=p.saldo();const V=p.w.cartinhasTeste.validaArq;
  const ruins=[{},{months:{}},{months:{'2026-11':{}}},{months:{'2026-13':{days:[]}}},
    {months:{'2026-11':{days:[{d:'2026-11-03',tipo:'inventado'}]}}},
    {months:{'2026-11':{days:[{d:'2026-12-03'}]}}},
    {months:{'2026-11':{days:[{d:'2026-11-03',obs:{}}]}}}];
  const recusados=ruins.filter(o=>typeof V(o)==='string').length;
  const voltou=p.w.cartinhasTeste.aplicaArq({months:{'2026-11':{}}});
  const bom=V({months:{'2026-11':{days:[{d:'2026-11-03',marcas:'08:00 12:00',tipo:'util'}],meta:null}}});
  return {ok:recusados===ruins.length&&voltou===false&&p.saldo()===antes&&bom===null&&/fora do formato/.test(p.T('nuvem')),
    obs:`${recusados} de ${ruins.length} arquivos ruins recusados · arquivo bom aceito: ${bom===null} · saldo intacto: ${p.saldo()===antes} · aviso na tela: ${/fora do formato/.test(p.T('nuvem'))}`}});
caso('Datas e meses','Virada da meia-noite com a página aberta',()=>{
  const z=n=>String(n).padStart(2,'0');
  const isoD=d=>`${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
  const agora=new Date();const ontem=new Date(agora.getFullYear(),agora.getMonth(),agora.getDate()-1);
  const p=abre(isoD(ontem));                 // a página abriu "ontem" e ficou aberta
  const antes=p.w.cartinhasTeste.hoje();
  const mudou=p.w.cartinhasTeste.conferiaDia();
  const depois=p.w.cartinhasTeste.hoje();
  return {ok:antes===isoD(ontem)&&mudou===true&&depois===isoD(agora),
    obs:`abriu em ${antes} e passou para ${depois} sem recarregar (mudou: ${mudou})`}});
casoA('Dados','Duas janelas no mesmo dia: nada se perde calado',async()=>{
  const h=fakeArq('');const a=abre(),b=abre();
  await a.w.cartinhasTeste.conecta(h,true);
  await b.w.cartinhasTeste.conecta(h,true);
  a.importa(L(3,11,'08:00 12:00 13:00 18:00'));
  await a.w.cartinhasTeste.gravaArq();               // A grava 9 h no dia 03
  b.importa(L(3,11,'08:00 12:00 13:00 17:00'));      // B mexe no MESMO dia
  await b.w.cartinhasTeste.gravaArq();
  const o=leuDoArq(h);
  const d=((o&&o.months&&o.months['2026-11'].days)||[]).find(x=>x.d==='2026-11-03')||{};
  const copia=b.w.localStorage.getItem('cartinhas.v4.conflito');
  const nuvem=b.T('nuvem');
  /* o arquivo fica com UMA versão (a dele), a desta janela fica guardada e a tela oferece voltar */
  const umaSo=d.marcas==='08:00 12:00 13:00 18:00';
  const avisou=/mesmo dia foi alterado/.test(nuvem)&&/usar só os meus/.test(nuvem);
  return {ok:umaSo&&!!copia&&avisou,
    obs:`no arquivo ficou "${d.marcas||'—'}" (a versão do arquivo) · cópia desta janela guardada: ${!!copia} · avisou e ofereceu voltar: ${avisou}`}});

// ---------- REAUDITORIA DE 25/11/2026 ----------
casoA('Dados','Arquivo de outro programa não é sobrescrito',async()=>{
  const p=abre();const original='{"outroApp":"ROTA","registros":[{"id":1,"rota":"A-12"}]}';const h=fakeArq(original);
  await p.w.cartinhasTeste.conecta(h,true);
  return {ok:h.conteudo===original&&h.gravacoes===0&&/não é do Cartinhas/.test(p.T('nuvem')),
    obs:`conteúdo intacto: ${h.conteudo===original} · gravações no arquivo: ${h.gravacoes} · aviso: ${p.T('nuvem').slice(0,58)}`}});
casoA('Dados','Arquivo vazio é adotado e recebe os dados',async()=>{
  const p=abre();const h=fakeArq('');
  await p.w.cartinhasTeste.conecta(h,true);
  const o=leuDoArq(h);const n=o&&o.months?Object.keys(o.months).length:0;
  return {ok:n>0&&/Salvo em/.test(p.T('nuvem')),
    obs:`gravou ${n} mês(es) no arquivo · ${p.T('nuvem').slice(0,40)}`}});
caso('Cálculo do dia','"Usar batidas de hoje" leva a jornada do dia (6 h)',()=>{const p=abre();
  p.importa(L(25,11,'08:00 14:00','06:00'));
  const c=p.cel('25/11');
  p.d.getElementById('cHoje').click();
  const j=p.d.getElementById('cJ').value;const dia=p.T('cSal');
  return {ok:!c.cred&&!c.deb&&j==='06:00'&&zero(dia),
    obs:`tabela: trab ${c.trab}, crédito ${c.cred||'-'} débito ${c.deb||'-'} · calculadora: jornada ${j}, dia ${dia}`}});
caso('Cálculo do dia','Hora de saída para +1h num dia com hora extra autorizada',()=>{const p=abre();
  p.importa(L(25,11,'08:00 12:00 13:00 18:00','08:00','Extras 01:00; HE autorizada;'));
  const r=p.calc({cE1:'08:00',cS1:'12:00',cE2:'13:00',cS2:'',cJ:'08:00',cAlvo:'+1:00'});
  const hs=/Pode ir embora às(\d{2}:\d{2})/.exec(r);const fe=/dia fecha em ([+−-]?\d{1,2}:\d{2})/.exec(r);
  return {ok:!!hs&&hs[1]==='19:00'&&!!fe&&/^\+?0?1:00$/.test(fe[1].replace('+','')),
    obs:`sugeriu sair ${hs?hs[1]:'—'} e o dia fecha em ${fe?fe[1]:'—'} (a HE autorizada de 1 h é paga à parte)`}});
caso('Leitura do relatório','Relatório de outra pessoa não é gravado sem confirmação',()=>{const p=abre();
  p.importa('Empregado: FULANO DE TAL CEI:\n'+L(3,11,'08:00 12:00 13:00 17:00'));
  const marcas04=()=>((p.est().months['2026-11'].days.find(x=>x.d==='2026-11-04')||{}).marcas||'');
  const antes=marcas04();                           // a versão pessoal já traz 04/11 de exemplo
  p.importa('Empregado: BELTRANO CEI:\n'+L(4,11,'08:00 12:00 13:00 19:00'));
  const nome=(p.est().months['2026-11'].meta&&p.est().months['2026-11'].meta.nome)||'';
  const b=p.d.getElementById('btnOutro');
  const barrou=marcas04()===antes&&/FULANO/.test(nome)&&!!b;
  if(b)b.click();                                   // "Importar mesmo assim"
  const depois=marcas04();
  return {ok:barrou&&depois==='08:00 12:00 13:00 19:00',
    obs:`sem confirmar: 04/11 seguiu "${antes||'vazio'}" e o mês em nome de ${nome||'—'} · depois de "Importar mesmo assim": "${depois||'vazio'}"`}});

// ---------- HORA DIGITADA (um campo por hora) ----------
const comQuatro=()=>{const p=abre();p.importa(L(3,11,'08:00 12:00 13:00 17:00'));return p};

caso('Hora digitada','"1832" no campo da saída vira 18:32',()=>{const p=comQuatro();
  p.digita('03/11',3,'1832');const c=p.cel('03/11');
  return {ok:p.campos('03/11').join('|')==='08:00|12:00|13:00|18:32'&&c.trab==='09:32',
    obs:`campos: ${p.campos('03/11').filter(Boolean).join(' ')} · trabalhadas ${c.trab}`}});

caso('Hora digitada','"8" vira 08:00 e "932" vira 09:32',()=>{const p=comQuatro();
  p.digita('03/11',0,'8');p.digita('03/11',1,'932');
  const v=p.campos('03/11');
  return {ok:v[0]==='08:00'&&v[1]==='09:32',obs:`ficou ${v.filter(Boolean).join(' ')}`}});

caso('Hora digitada','Abono "0032" vira 0:32',()=>{const p=comQuatro();
  p.edita('03/11','abono','0032');
  return {ok:p.cel('03/11').abono==='0:32',obs:`campo de abono: ${p.cel('03/11').abono}`}});

caso('Hora digitada','Cada hora em seu campo: duas batidas ficam em entrada e saída',()=>{const p=abre();
  p.importa(L(25,11,'13:07 17:38'));const v=p.campos('25/11');
  p.digita('25/11',1,'1400');
  const d=(p.est().months['2026-11'].days.find(x=>x.d==='2026-11-25')||{}).marcas;
  return {ok:v.join('|')==='13:07|||17:38'&&d==='13:07 14:00 17:38',
    obs:`campos ao abrir: "${v.join('|')}" · depois de digitar a saída do almoço: "${d}"`}});

caso('Hora digitada','Linha inteira colada num campo só se reparte',()=>{const p=abre();
  p.importa(L(3,11,'08:00'));p.digita('03/11',0,'0932135214521700');
  const d=(p.est().months['2026-11'].days.find(x=>x.d==='2026-11-03')||{}).marcas;
  p.digita('03/11',0,'09:32 13:52');
  const e=(p.est().months['2026-11'].days.find(x=>x.d==='2026-11-03')||{}).marcas;
  return {ok:d==='09:32 13:52 14:52 17:00'&&e==='09:32 13:52',
    obs:`emendado: "${d}" · com espaço: "${e}"`}});

caso('Hora digitada','Hora pela metade não desaparece calada ("07:0")',()=>{const p=comQuatro();
  p.digita('03/11',0,'07:0');const c=p.cel('03/11');
  return {ok:p.invalido('03/11')&&c.trab!=='08:00',
    obs:`campo em vermelho: ${p.invalido('03/11')} · trabalhadas ${c.trab||'—'} (não conta a hora pela metade)`}});

caso('Hora digitada','Hora impossível no campo ("2532") é acusada',()=>{const p=comQuatro();
  p.digita('03/11',3,'2532');
  return {ok:p.invalido('03/11'),obs:`campos: ${p.campos('03/11').filter(Boolean).join(' ')} · em vermelho: ${p.invalido('03/11')}`}});

// ---------- PROGRAMAÇÃO DE FÉRIAS — fase 1: regras puras (PLANO-FERIAS.md) ----------
const FR=(()=>{let f=null;return ()=>f||(f=abre().w.cartinhasTeste.ferias)})();

caso('Férias — ciclos','Nenhum dia sem ciclo nem em dois: quatro admissões, doze ciclos cada (seção 6.1)',()=>{const f=FR();const furos=[];
  for(const adm of ['2026-03-01','2024-02-29','2025-01-31','2020-03-15'])for(let n=1;n<=12;n++){const a=f.fCiclo(adm,n),b=f.fCiclo(adm,n+1);
    if(f.fSoma(a.coFim,1)!==b.coIni)furos.push(`${adm} ciclo ${n}: concessivo acaba ${a.coFim}, o seguinte começa ${b.coIni}`);
    if(f.fSoma(a.aqFim,1)!==b.aqIni)furos.push(`${adm} ciclo ${n}: aquisitivo acaba ${a.aqFim}, o seguinte começa ${b.aqIni}`);
    if(a.coIni!==f.fSoma(a.aqFim,1))furos.push(`${adm} ciclo ${n}: concessivo não emenda no aquisitivo`)}
  return {ok:!furos.length,obs:furos.length?furos.slice(0,2).join(' · '):'48 ciclos contínuos (o caso de 01/03/2026 era o que quebrava na versão 3 do plano)'}});

caso('Férias — ciclos','Admissão em 15/03/2020 produz a tabela do levantamento',()=>{const f=FR();const c=n=>f.fCiclo('2020-03-15',n);
  const t=[c(1),c(2),c(7)].map(x=>`${x.aqIni}→${x.aqFim} / ${x.coIni}→${x.coFim}`);
  const ok=t[0]==='2020-03-15→2021-03-14 / 2021-03-15→2022-03-14'&&t[1]==='2021-03-15→2022-03-14 / 2022-03-15→2023-03-14'&&t[2]==='2026-03-15→2027-03-14 / 2027-03-15→2028-03-14';
  return {ok,obs:t.join(' · ')}});

caso('Férias — ciclos','29/02: o aniversário vira 01/03 nos anos que não são bissextos',()=>{const f=FR();const c1=f.fCiclo('2024-02-29',1),c4=f.fCiclo('2024-02-29',4);
  const ok=c1.aqFim==='2025-02-28'&&c4.aqIni==='2027-03-01'&&c4.aqFim==='2028-02-28'&&c4.coIni==='2028-02-29';
  return {ok,obs:`1º aquisitivo até ${c1.aqFim}; 4º de ${c4.aqIni} a ${c4.aqFim}, concessivo a partir de ${c4.coIni}`}});

caso('Férias — ciclos','31/01: o ciclo fecha em 30/01, sem escorregar de mês',()=>{const f=FR();const c=f.fCiclo('2025-01-31',1);
  return {ok:c.aqFim==='2026-01-30'&&c.coIni==='2026-01-31'&&c.coFim==='2027-01-30',obs:`aquisitivo até ${c.aqFim}; concessivo ${c.coIni} a ${c.coFim}`}});

caso('Férias — ciclos','Aquisitivo ajustado: o ciclo interrompido sai e o vão aparece com as datas',()=>{const f=FR();
  const r=f.fCiclos('2020-03-15','2026-09-01','2026-11-25');
  const aq=r.emAquisitivo,co=r.emConcessivo[0];
  const ok=!!r.emenda&&r.emenda.tipo==='vao'&&r.emenda.de==='2027-03-15'&&r.emenda.ate==='2027-08-31'
    &&aq&&aq.ajustado&&aq.aqIni==='2026-09-01'&&co&&co.coIni==='2026-03-15'&&!r.lista.some(c=>c.aqIni==='2026-03-15');
  return {ok,obs:`emenda: ${r.emenda?r.emenda.tipo+' de '+r.emenda.de+' a '+r.emenda.ate:'nenhuma'} · aquisitivo em curso ${aq&&aq.aqIni} · concessivo em curso ${co&&co.coIni}`}});

caso('Férias — fracionamento','As sete combinações permitidas da tabela dos Correios passam',()=>{const f=FR();
  const L=[[30],[15,15],[14,16],[20,10],[14,8,8],[15,10,5],[20,5,5]];const ruins=L.filter(d=>!f.fCombinacao(d,true).ok);
  return {ok:!ruins.length,obs:ruins.length?'recusou '+ruins.map(d=>d.join('+')).join(', '):'30 · 15+15 · 14+16 · 20+10 · 14+8+8 · 15+10+5 · 20+5+5'}});

caso('Férias — fracionamento','As três combinações proibidas são recusadas, pela regra do fracionamento',()=>{const f=FR();
  const L=[[10,10,10],[12,12,6],[13,12,5]];const r=L.map(d=>f.fCombinacao(d,true));
  return {ok:r.every(x=>!x.ok&&x.regra==='R2f'),obs:r.map((x,i)=>L[i].join('+')+': '+(x.ok?'ACEITA':x.motivo)).join(' · ')}});

caso('Férias — fracionamento','Bloco único curto: 12 dias de uma vez, sem concordância',()=>{const f=FR();
  return {ok:f.fCombinacao([12],false).ok&&f.fCompletavel([],12,false),obs:'12 dias de uma vez é combinação válida, e não exige o período de 14'}});

caso('Férias — fracionamento','Saldo de 18 não fraciona; 19 é o mínimo (14 + 5)',()=>{const f=FR();let alguma=null;
  for(let a=1;a<18;a++)if(f.fCombinacao([a,18-a],true).ok)alguma=a+'+'+(18-a);
  for(let a=1;a<18;a++)for(let b=1;a+b<18;b++)if(f.fCombinacao([a,b,18-a-b],true).ok)alguma=[a,b,18-a-b].join('+');
  return {ok:!alguma&&!f.fPodeFracionar(18)&&f.fPodeFracionar(19)&&f.fCompletavel([],18,true),obs:alguma?'aceitou '+alguma:'nenhuma divisão de 18 passa; 18 de uma vez passa'}});

caso('Férias — fracionamento','Começar pelo bloco de 5: com 25 restando e concordância, fecha; sem concordância, não',()=>{const f=FR();
  const com=f.fCompletavel([5],25,true),sem=f.fCompletavel([5],25,false);
  return {ok:com&&!sem,obs:`com concordância: ${com?'completável (5+25)':'não'} · sem: ${sem?'COMPLETÁVEL':'não'}`}});

caso('Férias — fracionamento','Abono de 10: os 20 que sobram fecham em 20, 14+6 ou 15+5, nunca em três',()=>{const f=FR();
  const bons=[[20],[14,6],[15,5]].every(d=>f.fCombinacao(d,true).ok);const dez=f.fCombinacao([10,10],true).ok;let trio=null;
  for(let a=1;a<20;a++)for(let b=1;a+b<20;b++)if(f.fCombinacao([a,b,20-a-b],true).ok)trio=[a,b,20-a-b].join('+');
  return {ok:bons&&!dez&&!trio,obs:`20, 14+6, 15+5: ${bons?'aceitos':'RECUSADOS'} · 10+10: ${dez?'ACEITO':'recusado'} · trio: ${trio||'nenhum'}`}});

caso('Férias — saldo','Saldo provisório: 30 presumidos e 10 na fila; ao confirmar, 20, ainda provisório',()=>{const f=FR();const c=f.fCiclo('2020-03-15',6);
  const a=f.fSaldo(c,{direitoInformado:false,abonoInformado:true,periodos:[]},{fila:1},'2026-11-25');
  const b=f.fSaldo(c,{direitoInformado:false,abonoInformado:true,periodos:[{ini:'2026-07-01',fim:'2026-07-10',estado:'usufruido'}]},{fila:0},'2026-11-25');
  const k=f.fSaldo(c,{direitoInformado:true,abonoInformado:true,periodos:[{ini:'2026-07-01',fim:'2026-07-10',estado:'usufruido'}]},{fila:0},'2026-11-25');
  const ok=a.livre===30&&a.provisorio&&a.motivos.length===2&&b.livre===20&&b.provisorio&&k.livre===20&&!k.provisorio;
  return {ok,obs:`antes: ${a.livre} (${a.motivos.join('; ')}) · confirmado: ${b.livre}, ${b.provisorio?'provisório':'firme'} · direito informado: ${k.livre}, ${k.provisorio?'provisório':'firme'}`}});

caso('Férias — saldo','Planejado e aprovado não aparecem como consumido',()=>{const f=FR();const c=f.fCiclo('2020-03-15',6);
  const s=f.fSaldo(c,{direitoInformado:true,abonoInformado:true,abono:10,periodos:[{ini:'2027-01-04',fim:'2027-01-17',estado:'planejado'},{ini:'2026-12-01',fim:'2026-12-05',estado:'aprovado'}]},null,'2026-11-25');
  return {ok:s.consumido===10&&s.comprometido===5&&s.pretendido===14&&s.livre===1,obs:`consumido ${s.consumido} (só o abono) · comprometido ${s.comprometido} · pretendido ${s.pretendido} · livre ${s.livre}`}});

// ---------- PROGRAMAÇÃO DE FÉRIAS — fase 2: área, gravação e cópias (PLANO-FERIAS.md) ----------
const KF='cartinhas.v4.ferias';
const espera=ms=>new Promise(r=>setTimeout(r,ms));
const canonT=x=>JSON.stringify(x,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((o,c)=>(o[c]=v[c],o),{}):v);
/* abre a área e informa a admissão, como a pessoa faz */
function comPlano(p,adm){p.w.cartinhasTeste.fer.abre();p.d.getElementById('fAdm').value=adm||'2020-03-15';p.d.getElementById('fAdmOk').click();return p.w.cartinhasTeste.fer.estado()}
const muda=(p,ciclo,campo,v)=>{const s=p.d.querySelector(`[data-ciclo="${ciclo}"] [data-fc="${campo}"]`);if(s.type==='checkbox')s.checked=v;else s.value=v;s.dispatchEvent(new p.w.Event('change',{bubbles:true}))};
const arqBase=extra=>JSON.stringify({app:'Cartinhas',versao:1,cur:'2026-11',months:{'2026-11':{days:[{d:'2026-11-03',marcas:'08:00 12:00 13:00 17:00',srpMarcas:'08:00 12:00 13:00 17:00',tipo:'util',obs:''}],meta:null}},...extra});
/* o que uma versão antiga faz: regrava só com os campos que conhece */
async function versaoAntigaGrava(h,mexe){const o=JSON.parse(h.conteudo);delete o.ferias;o.versao=1;if(mexe)mexe(o);const w=await h.createWritable();await w.write(JSON.stringify(o,null,1));await w.close();return o}

caso('Férias — área','A área abre e volta pelo botão abaixo do Mês, sem mexer no banco de horas',()=>{const p=abre();
  p.importa(L(3,11,'08:00 12:00 13:00 18:00'));const s0=p.saldo(),m0=JSON.stringify(p.w.cartinhasTeste.estado().months);
  p.d.getElementById('btnFerias').click();
  const abriu=p.w.cartinhasTeste.fer.modo()&&p.w.location.hash==='#ferias'&&!p.d.getElementById('secFerias').hidden&&p.d.body.classList.contains('modo-ferias');
  p.d.getElementById('btnFerias').click();
  const voltou=!p.w.cartinhasTeste.fer.modo()&&/^#mes-/.test(p.w.location.hash)&&p.d.getElementById('secFerias').hidden;
  const igual=p.saldo()===s0&&JSON.stringify(p.w.cartinhasTeste.estado().months)===m0;
  return {ok:abriu&&voltou&&igual,obs:`abriu em #ferias: ${abriu} · voltou ao mês: ${voltou} · saldo e meses iguais: ${igual} (${s0})`}});

caso('Férias — área','Pergunta só a admissão e mostra os dois ciclos, com o saldo provisório',()=>{const p=abre();
  p.w.cartinhasTeste.fer.abre();const pediu=!!p.d.getElementById('fAdm');
  const f=comPlano(p,'2020-03-15');const t=p.T('ferias');
  const ok=pediu&&f&&f.admissao==='2020-03-15'&&f.rev===1&&/Ciclo 2025\/2026/.test(t)&&/Ciclo 2026\/2027/.test(t)&&/presumido/.test(t)&&/Saldo provisório/.test(t)&&!!p.w.localStorage.getItem(KF);
  return {ok,obs:`pediu a admissão: ${pediu} · ciclos na tela: ${(t.match(/Ciclo \d{4}\/\d{4}/g)||[]).join(', ')} · cópia no navegador: ${!!p.w.localStorage.getItem(KF)}`}});

caso('Férias — área','Data de admissão no futuro ou inválida é recusada com explicação',()=>{const p=abre();p.w.cartinhasTeste.fer.abre();
  p.d.getElementById('fAdm').value='2027-01-10';p.d.getElementById('fAdmOk').click();
  return {ok:!p.w.cartinhasTeste.fer.estado()&&/não esteja no futuro/.test(p.T('ferias')),obs:'admissão em 10/01/2027 com hoje em 25/11/2026: '+(p.w.cartinhasTeste.fer.estado()?'ACEITA':'recusada')}});

casoA('Férias — arquivo','Sem plano, o arquivo de dados continua exatamente no formato de antes',async()=>{const p=abre();const h=fakeArq('');
  await p.w.cartinhasTeste.conecta(h,true);await p.w.cartinhasTeste.gravaArq();const o=JSON.parse(h.conteudo);
  return {ok:o.versao===1&&!('ferias' in o),obs:`versão ${o.versao}, campo ferias: ${'ferias' in o?'PRESENTE':'ausente'}`}});

casoA('Férias — arquivo','Com plano, ele vai para o arquivo, e o arquivo sobe para a versão 2',async()=>{const p=abre();const h=fakeArq('');
  await p.w.cartinhasTeste.conecta(h,true);comPlano(p);await p.w.cartinhasTeste.gravaArq();const o=JSON.parse(h.conteudo);
  return {ok:o.versao===2&&o.ferias&&o.ferias.admissao==='2020-03-15',obs:`versão ${o.versao} · admissão no arquivo: ${o.ferias&&o.ferias.admissao}`}});

casoA('Férias — arquivo','Campo de topo que esta versão não conhece continua no arquivo depois de gravar',async()=>{const p=abre();
  const h=fakeArq(arqBase({recursoFuturo:{x:1}}));await p.w.cartinhasTeste.conecta(h,true);
  p.edita('03/11','obs','mudei');await p.w.cartinhasTeste.gravaArq();const o=JSON.parse(h.conteudo);
  return {ok:!!(o.recursoFuturo&&o.recursoFuturo.x===1)&&o.months['2026-11'].days.find(x=>x.d==='2026-11-03').obs==='mudei',obs:`recursoFuturo depois de gravar: ${JSON.stringify(o.recursoFuturo)}`}});

casoA('Férias — arquivo','Arquivo de versão mais nova não é sobrescrito: avisa e pede para atualizar',async()=>{const p=abre();
  const h=fakeArq(arqBase({versao:3}));await p.w.cartinhasTeste.conecta(h,true);p.edita('03/11','obs','tentativa');await espera(700);
  return {ok:h.gravacoes===0&&/versão mais nova/.test(p.T('nuvem')),obs:`gravações: ${h.gravacoes} · aviso: ${p.T('nuvem').slice(0,90)}`}});

casoA('Férias — arquivo','Plano fora do formato recusa o arquivo inteiro, sem mexer na tela',async()=>{const ruins=[
    {admissao:'2020-03-15',ciclos:{'2025-03-15':{direito:45,periodos:[]}}},
    {admissao:'2020-03-15',ciclos:{'2025-03-15':{direito:30,periodos:[{ini:'2026-07-10',fim:'2026-07-01',estado:'planejado'}]}}},
    {admissao:'2020-03-15',ciclos:{'2025-03-15':{direito:30,periodos:[{ini:'2026-07-01',fim:'2026-07-10',estado:'sonhado'}]}}},
    {admissao:'2020-03-15',ciclos:{'2025-03-15':{direito:30,abono:12,periodos:[]}}}];
  const res=[];for(const f of ruins){const p=abre();p.importa(L(4,11,'08:00 12:00 13:00 17:00'));const s0=p.saldo();
    const h=fakeArq(arqBase({versao:2,ferias:f}));await p.w.cartinhasTeste.conecta(h,true);
    res.push({ok:h.gravacoes===0&&p.saldo()===s0&&!p.w.cartinhasTeste.fer.estado()&&/fora do formato/.test(p.T('nuvem')),msg:p.T('nuvem').replace(/^.*\((.*)\).*$/,'$1')})}
  return {ok:res.every(r=>r.ok),obs:res.map(r=>(r.ok?'recusado: ':'ACEITO: ')+r.msg).join(' · ')}});

casoA('Férias — arquivo','Versão antiga apagou o plano (mesmo navegador): ele volta, e o ponto gravado por ela fica',async()=>{
  const A=abre();A.importa(L(3,11,'08:00 12:00 13:00 17:00'));const h=fakeArq('');await A.w.cartinhasTeste.conecta(h,true);
  comPlano(A);await A.w.cartinhasTeste.gravaArq();
  const velho=await versaoAntigaGrava(h,o=>{o.months['2026-11'].days.find(x=>x.d==='2026-11-03').obs='feito na versão antiga'});
  const B=abre();B.w.localStorage.setItem(KF,A.w.localStorage.getItem(KF));
  await B.w.cartinhasTeste.conecta(h,true);const of=B.w.cartinhasTeste.fer.oferta();
  B.w.cartinhasTeste.fer.abre();B.d.querySelector('[data-fres="0"]').click();await B.w.cartinhasTeste.gravaArq();
  const o=JSON.parse(h.conteudo);const mesIgual=canonT(o.months['2026-11'])===canonT(velho.months['2026-11']);
  return {ok:!!of&&of.opcoes.length===1&&!!o.ferias&&o.ferias.admissao==='2020-03-15'&&mesIgual,
    obs:`ofereceu: ${!!of} · plano de volta no arquivo: ${!!o.ferias} · novembro igual ao que a versão antiga gravou: ${mesIgual}`}});

casoA('Férias — arquivo','Versão antiga apagou o plano (outro navegador): ele volta pela cópia salva fora do navegador',async()=>{
  const A=abre();const h=fakeArq('');await A.w.cartinhasTeste.conecta(h,true);comPlano(A);await A.w.cartinhasTeste.gravaArq();
  const copia=fakeArq('');A.w.showSaveFilePicker=async()=>copia;A.d.getElementById('fCopia').click();await espera(30);
  const so=JSON.parse(copia.conteudo||'{}');
  await versaoAntigaGrava(h,o=>{o.months['2026-11'].days.find(x=>x.d==='2026-11-03').obs='ponto da versão antiga'});
  const C=abre();await C.w.cartinhasTeste.conecta(h,true);const semOferta=!C.w.cartinhasTeste.fer.oferta();
  C.w.showOpenFilePicker=async()=>[copia];C.w.cartinhasTeste.fer.abre();C.d.getElementById('fAbreCopia').click();await espera(30);
  const of=C.w.cartinhasTeste.fer.oferta();C.d.querySelector('[data-fres="0"]').click();await C.w.cartinhasTeste.gravaArq();
  const o=JSON.parse(h.conteudo);
  return {ok:so.tipo==='copia-ferias'&&!('months' in so)&&semOferta&&!!of&&!!o.ferias&&o.months['2026-11'].days.find(x=>x.d==='2026-11-03').obs==='ponto da versão antiga',
    obs:`cópia só com o plano: ${so.tipo==='copia-ferias'&&!('months' in so)} · navegador novo sem oferta: ${semOferta} · restaurado pela cópia: ${!!o.ferias} · ponto da versão antiga mantido: ${o.months['2026-11'].days.find(x=>x.d==='2026-11-03').obs}`}});

casoA('Férias — arquivo','Cópia do navegador mais velha que o arquivo não é oferecida, e passa a acompanhar o arquivo',async()=>{
  const A=abre();const h=fakeArq('');await A.w.cartinhasTeste.conecta(h,true);comPlano(A);
  muda(A,'2025-03-15','direito','24');muda(A,'2025-03-15','abono','0');await A.w.cartinhasTeste.gravaArq();
  const velha=JSON.parse(A.w.localStorage.getItem(KF));velha.rev=1;velha.ciclos={};
  const B=abre();B.w.localStorage.setItem(KF,JSON.stringify(velha));await B.w.cartinhasTeste.conecta(h,true);
  const revArq=JSON.parse(h.conteudo).ferias.rev,revNav=JSON.parse(B.w.localStorage.getItem(KF)).rev;
  return {ok:!B.w.cartinhasTeste.fer.oferta()&&revNav===revArq,obs:`oferta: ${B.w.cartinhasTeste.fer.oferta()?'FEITA':'nenhuma'} · cópia do navegador agora na revisão ${revNav} (arquivo: ${revArq})`}});

casoA('Férias — arquivo','Duas cópias com mudanças diferentes: mostra as duas e pede decisão',async()=>{
  const A=abre();const h=fakeArq('');await A.w.cartinhasTeste.conecta(h,true);comPlano(A);await A.w.cartinhasTeste.gravaArq();
  const nav=JSON.parse(A.w.localStorage.getItem(KF));nav.rev=4;nav.unidade={sei:'',gestor:'versão do navegador'};
  const ext=JSON.parse(JSON.stringify(nav));ext.unidade={sei:'',gestor:'versão da cópia'};
  await versaoAntigaGrava(h);
  const B=abre();B.w.localStorage.setItem(KF,JSON.stringify(nav));await B.w.cartinhasTeste.conecta(h,true);
  B.w.cartinhasTeste.fer.avaliaCopia(ext,'Cópia salva em arquivo');const of=B.w.cartinhasTeste.fer.oferta();
  return {ok:!!of&&of.opcoes.length===2&&/duas cópias/.test(of.motivo),obs:of?`${of.opcoes.length} opções: ${of.opcoes.map(o=>o.nome).join(' / ')} — ${of.motivo}`:'nenhuma oferta'}});

casoA('Férias — arquivo','Duas janelas mudando o plano: fica o do arquivo, e a outra avisa e guarda o seu',async()=>{
  const A=abre();const h=fakeArq('');await A.w.cartinhasTeste.conecta(h,true);comPlano(A);await A.w.cartinhasTeste.gravaArq();
  const B=abre();await B.w.cartinhasTeste.conecta(h,true);B.w.cartinhasTeste.fer.abre();
  muda(A,'2025-03-15','direito','24');await A.w.cartinhasTeste.gravaArq();
  muda(B,'2025-03-15','abono','5');await B.w.cartinhasTeste.gravaArq();
  const o=JSON.parse(h.conteudo),y=o.ferias.ciclos['2025-03-15']||{};
  return {ok:y.direito===24&&!y.abonoInformado&&/plano de férias foi alterado nos dois/.test(B.T('nuvem')),
    obs:`no arquivo: direito ${y.direito}, abono ${y.abonoInformado?y.abono:'não informado'} · B avisou: ${B.T('nuvem').slice(0,110)}`}});

casoA('Férias — arquivo','Só uma janela mudou o plano: a mudança dela vale, junto com o ponto da outra',async()=>{
  const A=abre();A.importa(L(3,11,'08:00 12:00 13:00 17:00'));const h=fakeArq('');await A.w.cartinhasTeste.conecta(h,true);comPlano(A);await A.w.cartinhasTeste.gravaArq();
  const B=abre();await B.w.cartinhasTeste.conecta(h,true);B.w.cartinhasTeste.fer.abre();
  A.edita('03/11','obs','ponto de A');await A.w.cartinhasTeste.gravaArq();
  muda(B,'2025-03-15','concorda',true);await B.w.cartinhasTeste.gravaArq();
  const o=JSON.parse(h.conteudo);const y=o.ferias.ciclos['2025-03-15']||{};const obs=o.months['2026-11'].days.find(x=>x.d==='2026-11-03').obs;
  return {ok:y.concordaFracionar===true&&obs==='ponto de A',obs:`concordância de B no arquivo: ${y.concordaFracionar} · observação de A no arquivo: ${obs}`}});

// ---------- PROGRAMAÇÃO DE FÉRIAS — fases 3 e 4: calendário, configuração e histórico (PLANO-FERIAS.md) ----------
const SEGSEX={diasTrabalhados:[1,2,3,4,5],dsr:0};
/* outubro/2026 com férias de 05 a 09 e de 13 a 16, fim de semana e o feriado de 12/10 no meio */
const relFeriasOut=()=>[5,6,7,8,9].map(d=>dia(d,10)+' Férias;').concat([dia(10,10)+' Folga;',dia(11,10)+' Folga;',dia(12,10)+' 08:00 Feriado;'],[13,14,15,16].map(d=>dia(d,10)+' Férias;')).join('\n');
const clica=(p,sel)=>{const b=p.d.querySelector(sel);if(!b)throw new Error('não achei '+sel);b.click()};
const cicloDe=(p,k)=>(p.w.cartinhasTeste.fer.estado().ciclos[k]||{periodos:[]});
/* põe um período no plano direto no estado (a marcação pelo gráfico chega na fase 5) */
function poePeriodo(p,k,per){const f=p.w.cartinhasTeste.fer.estado();if(!f.ciclos[k])f.ciclos[k]={direito:30,abono:0,periodos:[]};f.ciclos[k].periodos.push({id:'t'+Math.random().toString(36).slice(2,7),origem:'digitado',confirmado:true,...per});p.w.cartinhasTeste.fer.render()}

caso('Férias — calendário','Dispensa conta como dia livre, mas não é feriado: não gera vedação legal',()=>{const p=abre();
  const c=p.w.cartinhasTeste.fer.contexto(SEGSEX,{'2026-12-31':'Dispensa: abono para todos'});
  const ok=c.livre('2026-12-31')&&!c.baseLegal('2026-12-31')&&c.tipo('2026-12-31')==='dispensa'&&c.baseLegal('2026-12-25');
  return {ok,obs:`31/12: livre ${c.livre('2026-12-31')}, base de vedação legal ${c.baseLegal('2026-12-31')}, tipo ${c.tipo('2026-12-31')} · 25/12: base legal ${c.baseLegal('2026-12-25')}`}});

caso('Férias — calendário','Feriado de outra lotação não vale: 30/11 só para quem está no DF',()=>{const p=abre();
  const df=p.w.cartinhasTeste.fer.contexto({...SEGSEX,uf:'DF'}),sp=p.w.cartinhasTeste.fer.contexto({...SEGSEX,uf:'SP'});
  const ok=df.cal.feriadoDaLotacao('2026-11-30')&&!sp.cal.feriadoDaLotacao('2026-11-30')&&df.cal.feriadoDaLotacao('2026-11-20')&&sp.cal.feriadoDaLotacao('2026-11-20');
  return {ok,obs:`30/11 no DF: ${df.cal.feriadoDaLotacao('2026-11-30')} · em SP: ${sp.cal.feriadoDaLotacao('2026-11-30')} · 20/11 nos dois: ${df.cal.feriadoDaLotacao('2026-11-20')&&sp.cal.feriadoDaLotacao('2026-11-20')}`}});

caso('Férias — calendário','Carnaval e Corpus Christi de 2027 são ponto facultativo; só contam como livres se a pessoa disser',()=>{const p=abre();
  const n=p.w.cartinhasTeste.fer.contexto(SEGSEX),s=p.w.cartinhasTeste.fer.contexto({...SEGSEX,facultativosLivres:true});
  const datas=['2027-02-08','2027-02-09','2027-05-27'];
  const ok=datas.every(d=>n.cal.facultativo(d)&&!n.livre(d)&&s.livre(d))&&!n.cal.facultativo('2027-02-10');
  return {ok,obs:datas.map(d=>`${d.slice(8)}/${d.slice(5,7)}: facultativo ${n.cal.facultativo(d)}, livre ${n.livre(d)}→${s.livre(d)}`).join(' · ')}});

caso('Férias — calendário','Jornada de segunda a sábado: o sábado deixa de ser livre',()=>{const p=abre();
  const a=p.w.cartinhasTeste.fer.contexto(SEGSEX),b=p.w.cartinhasTeste.fer.contexto({diasTrabalhados:[1,2,3,4,5,6],dsr:0});
  return {ok:a.livre('2026-11-28')&&!b.livre('2026-11-28')&&b.livre('2026-11-29'),obs:`sábado 28/11: ${a.livre('2026-11-28')?'livre':'útil'} → ${b.livre('2026-11-28')?'livre':'útil'}; domingo segue livre`}});

caso('Férias — calendário','Feriado local acrescentado na tela entra no calendário, e repete todo ano',()=>{const p=abre();comPlano(p);
  p.d.getElementById('fLocData').value='2026-06-13';p.d.getElementById('fLocNome').value='Santo Antônio';clica(p,'#fLocAdd');
  const c=p.w.cartinhasTeste.fer.contexto();
  return {ok:c.cal.feriadoDaLotacao('2026-06-13')&&c.cal.feriadoDaLotacao('2027-06-13')&&/Santo Antônio/.test(p.T('ferias')),obs:`13/06/2026: ${c.cal.feriadoDaLotacao('2026-06-13')} · 13/06/2027: ${c.cal.feriadoDaLotacao('2027-06-13')}`}});

caso('Férias — histórico','Férias do relatório viram um período só, com fim de semana e feriado no meio, e esperam confirmação',()=>{const p=abre();
  p.importa(relFeriasOut());comPlano(p);const fila=p.w.cartinhasTeste.fer.fila();const t=p.T('ferias');
  const ok=fila.length===1&&fila[0].ini==='2026-10-05'&&fila[0].fim==='2026-10-16'&&fila[0].origem==='relatorio'&&fila[0].sugestao==='2025-03-15'
    &&/não entram no saldo/.test(t)&&/período achado no histórico ainda não foi confirmado/.test(t);
  return {ok,obs:fila.map(h=>`${h.ini} a ${h.fim} (${h.origem}, sugestão ${h.sugestao})`).join(' · ')||'fila vazia'}});

caso('Férias — histórico','Confirmar põe o período no ciclo e tira 12 dias do saldo; reimportar não muda nada',()=>{const p=abre();
  p.importa(relFeriasOut());comPlano(p);clica(p,'[data-fila="0"] [data-ff="confirma"]');
  const y=cicloDe(p,'2025-03-15'),livre1=/Livre para planejar\s*18/.test(p.T('ferias'));
  p.importa(relFeriasOut());p.w.cartinhasTeste.fer.render();
  const y2=cicloDe(p,'2025-03-15');
  const ok=y.periodos.length===1&&y.periodos[0].estado==='usufruido'&&y.periodos[0].confirmado&&livre1&&p.w.cartinhasTeste.fer.fila().length===0&&y2.periodos.length===1;
  return {ok,obs:`períodos no ciclo: ${y.periodos.length} · saldo livre 18: ${livre1} · depois de reimportar: fila ${p.w.cartinhasTeste.fer.fila().length}, períodos ${y2.periodos.length}`}});

caso('Férias — histórico','A pessoa pode escolher outro ciclo que não o sugerido, e é o que fica',()=>{const p=abre();
  p.importa(relFeriasOut());comPlano(p);const s=p.d.querySelector('[data-fila="0"] [data-ff-ciclo]');s.value='2024-03-15';clica(p,'[data-fila="0"] [data-ff="confirma"]');
  return {ok:cicloDe(p,'2024-03-15').periodos.length===1&&cicloDe(p,'2025-03-15').periodos.length===0,obs:`no ciclo 2024/2025: ${cicloDe(p,'2024-03-15').periodos.length} · no sugerido: ${cicloDe(p,'2025-03-15').periodos.length}`}});

caso('Férias — histórico','Relatório igual a um período aprovado promove o período, sem criar outro',()=>{const p=abre();comPlano(p);
  poePeriodo(p,'2025-03-15',{ini:'2026-10-05',fim:'2026-10-16',estado:'aprovado'});p.importa(relFeriasOut());p.w.cartinhasTeste.fer.render();
  const ofereceu=/É o mesmo período que estava aprovado/.test(p.T('ferias'));clica(p,'[data-fila="0"] [data-ff="promove"]');
  const y=cicloDe(p,'2025-03-15');
  return {ok:ofereceu&&y.periodos.length===1&&y.periodos[0].estado==='usufruido'&&y.periodos[0].origem==='relatorio',obs:`ofereceu promover: ${ofereceu} · períodos: ${y.periodos.length}, ${y.periodos[0]&&y.periodos[0].estado}`}});

caso('Férias — histórico','Relatório que coincide em parte pergunta qual vale, e não ajusta sozinho',()=>{const p=abre();comPlano(p);
  poePeriodo(p,'2025-03-15',{ini:'2026-10-05',fim:'2026-10-17',estado:'planejado'});p.importa(relFeriasOut());p.w.cartinhasTeste.fer.render();
  const antes=JSON.stringify(cicloDe(p,'2025-03-15').periodos);const perguntou=/Coincide em parte/.test(p.T('ferias'));
  clica(p,'[data-fila="0"] [data-ff="vale-relatorio"]');const y=cicloDe(p,'2025-03-15').periodos[0];
  return {ok:perguntou&&/2026-10-17/.test(antes)&&y.fim==='2026-10-16'&&y.estado==='usufruido',obs:`perguntou: ${perguntou} · antes de escolher: até ${JSON.parse(antes)[0].fim} · depois: até ${y.fim}, ${y.estado}`}});

caso('Férias — histórico','Mudar a admissão com períodos registrados: nada se move sem confirmação; cancelar devolve tudo',()=>{const p=abre();
  p.importa(relFeriasOut());comPlano(p);clica(p,'[data-fila="0"] [data-ff="confirma"]');
  const muda=()=>{clica(p,'#fAdmMuda');p.d.getElementById('fAdm').value='2020-06-01';clica(p,'#fAdmOk')};
  muda();const painel=/Conferir antes de mudar a data/.test(p.T('ferias')),igual=p.w.cartinhasTeste.fer.estado().admissao==='2020-03-15';
  clica(p,'#fRbCancela');const cancelou=p.w.cartinhasTeste.fer.estado().admissao==='2020-03-15'&&cicloDe(p,'2025-03-15').periodos.length===1;
  muda();clica(p,'#fRbOk');const f=p.w.cartinhasTeste.fer.estado();
  const ok=painel&&igual&&cancelou&&f.admissao==='2020-06-01'&&(f.ciclos['2025-06-01']||{periodos:[]}).periodos.length===1&&!f.ciclos['2025-03-15'];
  return {ok,obs:`painel: ${painel} · sem mudança antes de confirmar: ${igual} · cancelar devolveu: ${cancelou} · depois de confirmar: admissão ${f.admissao}, período no ciclo ${Object.keys(f.ciclos).join(',')}`}});

caso('Férias — histórico','Histórico irregular (10 + 10) avisa e segue com o saldo certo',()=>{const p=abre();comPlano(p);
  poePeriodo(p,'2025-03-15',{ini:'2026-04-06',fim:'2026-04-15',estado:'usufruido'});poePeriodo(p,'2025-03-15',{ini:'2026-07-06',fim:'2026-07-15',estado:'usufruido'});
  const t=p.T('ferias');
  return {ok:/não fecha com as regras de fracionamento/.test(t)&&/Livre para planejar\s*10/.test(t),obs:`aviso: ${/não fecha/.test(t)} · livre 10: ${/Livre para planejar\s*10/.test(t)}`}});

caso('Férias — histórico','Acrescentar férias já tiradas, e recusar dias que já estão em outro período',()=>{const p=abre();comPlano(p);
  const add=(a,b)=>{p.d.getElementById('fUsIni').value=a;p.d.getElementById('fUsFim').value=b;clica(p,'#fUsAdd')};
  add('2026-04-06','2026-04-15');const um=cicloDe(p,'2025-03-15').periodos.length;
  add('2026-04-10','2026-04-20');const recusou=/já estão em outro período/.test(p.T('ferias'))&&cicloDe(p,'2025-03-15').periodos.length===1;
  return {ok:um===1&&recusou&&cicloDe(p,'2025-03-15').periodos[0].origem==='digitado',obs:`acrescentou: ${um} · sobreposto recusado: ${recusou}`}});

caso('Férias — histórico','Apagar período aprovado pede o segundo clique',()=>{const p=abre();comPlano(p);
  poePeriodo(p,'2025-03-15',{ini:'2027-01-04',fim:'2027-01-17',estado:'aprovado'});
  clica(p,'[data-pid] [data-pa="apagar"]');const pediu=/Confirmar: apagar/.test(p.T('ferias'))&&cicloDe(p,'2025-03-15').periodos.length===1;
  clica(p,'[data-pid] [data-pa="apagar"]');
  return {ok:pediu&&cicloDe(p,'2025-03-15').periodos.length===0,obs:`pediu confirmação: ${pediu} · apagou no segundo clique: ${cicloDe(p,'2025-03-15').periodos.length===0}`}});

caso('Férias — saldo','Meses sem relatório deixam o saldo provisório, até a pessoa dizer que conferiu',()=>{const p=abre();comPlano(p);
  const antes=/faltam os relatórios de \d+ meses/.test(p.T('ferias'));
  const ch=p.d.querySelector('[data-ciclo="2025-03-15"] [data-fc="historico"]');ch.checked=true;ch.dispatchEvent(new p.w.Event('change',{bubbles:true}));
  const card=p.d.querySelector('[data-ciclo="2025-03-15"]').textContent;
  return {ok:antes&&!/faltam os relatórios/.test(card),obs:`antes: ${antes?'faltam relatórios':'—'} · depois de conferir: ${/faltam os relatórios/.test(card)?'AINDA FALTA':'pendência resolvida'}`}});

// ---------- PROGRAMAÇÃO DE FÉRIAS — fases 5 e 6: marcar no mês e validar (PLANO-FERIAS.md) ----------
function vaiMes(p,ym){for(let i=0;i<30&&!p.d.querySelector(`#fMesCard [data-d="${ym}-01"]`);i++){const at=p.d.querySelector('#fMesCard [data-d]').dataset.d.slice(0,7);clica(p,at<ym?'#fMesProx':'#fMesAnt')}}
function marca(p,a,b){vaiMes(p,a.slice(0,7));clica(p,`#fMesCard [data-d="${a}"]`);vaiMes(p,b.slice(0,7));clica(p,`#fMesCard [data-d="${b}"]`)}
const painel=p=>{const e=p.d.querySelector('#fMesCard .fnat');return e?{cls:e.className,txt:e.textContent.replace(/\s+/g,' ').trim()}:{cls:'',txt:''}};
const V=p=>p.w.cartinhasTeste.fer;
const concorda=p=>{const c=p.d.querySelector('[data-ciclo="2025-03-15"] [data-fc="concorda"]');c.checked=true;c.dispatchEvent(new p.w.Event('change',{bubbles:true}))};

caso('Férias — marcação','Marcar 30 dias de uma vez: útil fica rosa, fim de semana fica com a cor dele puxada para o rosa, e o banco de horas não muda',()=>{const p=abre();
  p.importa(L(3,11,'08:00 12:00 13:00 18:00'));const s0=p.saldo(),m0=JSON.stringify(p.w.cartinhasTeste.estado().months);
  comPlano(p);marca(p,'2027-01-04','2027-02-02');const y=cicloDe(p,'2025-03-15');vaiMes(p,'2027-01');
  const cl=d=>p.d.querySelector(`[data-d="${d}"]`).className,pr=p.d.querySelector('[data-d="2027-01-05"]').getAttribute('aria-pressed');
  const cores=/\butil\b.*p-planejado/.test(cl('2027-01-05'))&&/\bfolga\b.*p-planejado/.test(cl('2027-01-09'))&&/\bferiado\b/.test(cl('2027-01-01'))&&!/p-/.test(cl('2027-01-01'));
  V(p).fecha();const igual=p.saldo()===s0&&JSON.stringify(p.w.cartinhasTeste.estado().months)===m0;
  const ok=y.periodos.length===1&&y.periodos[0].estado==='planejado'&&y.periodos[0].ini==='2027-01-04'&&y.periodos[0].fim==='2027-02-02'&&cores&&pr==='true'&&igual;
  return {ok,obs:`período: ${y.periodos.map(x=>x.ini+' a '+x.fim+' '+x.estado).join(', ')} · cores certas: ${cores} · aria-pressed: ${pr} · banco de horas e meses iguais: ${igual}`}});

caso('Férias — validação','Dia de início: segunda a quarta passam; sexta e sábado são proibição legal; domingo e quinta, regra interna',()=>{const p=abre();comPlano(p);
  const r=['2027-01-04','2027-01-05','2027-01-06','2027-01-07','2027-01-08','2027-01-09','2027-01-10'].map(d=>V(p).inicio(d));
  const esp=[[true],[true],[true],[false,'R1b','interna'],[false,'R1a','legal'],[false,'R1a','legal'],[false,'R1c','interna']];
  const ok=r.every((x,i)=>x.ok===esp[i][0]&&(x.ok||(x.regra===esp[i][1]&&x.natureza===esp[i][2])));
  return {ok,obs:r.map((x,i)=>['seg','ter','qua','qui','sex','sáb','dom'][i]+': '+(x.ok?'passa':x.regra+' '+x.natureza)).join(' · ')}});

caso('Férias — validação','Leitura só da CLT: a quinta passa, a sexta continua proibida por lei',()=>{const p=abre();comPlano(p);
  const s=p.d.getElementById('fLeitura');s.value='clt';s.dispatchEvent(new p.w.Event('change',{bubbles:true}));
  const qui=V(p).inicio('2027-01-07'),sex=V(p).inicio('2027-01-08');
  return {ok:qui.ok&&!sex.ok&&sex.natureza==='legal',obs:`quinta: ${qui.ok?'passa':qui.regra} · sexta: ${sex.ok?'PASSA':sex.regra+' '+sex.natureza}`}});

caso('Férias — validação','Véspera e antevéspera de feriado: proibição legal, dizendo qual feriado',()=>{const p=abre();comPlano(p);
  const a=V(p).inicio('2026-12-23'),b=V(p).inicio('2026-12-24');
  return {ok:!a.ok&&!b.ok&&a.natureza==='legal'&&b.natureza==='legal'&&/25\/12\/2026/.test(a.msg),obs:`23/12: ${a.msg} · 24/12: ${b.regra} ${b.natureza}`}});

caso('Férias — validação','Recusa aparece no mês com a natureza, e nada é marcado',()=>{const p=abre();comPlano(p);marca(p,'2027-01-08','2027-02-06');
  const pa=painel(p);
  return {ok:/fnat-legal/.test(pa.cls)&&/Proibição legal/.test(pa.txt)&&/não foi marcado/.test(pa.txt)&&cicloDe(p,'2025-03-15').periodos.length===0,obs:pa.txt.slice(0,140)}});

caso('Férias — validação','Prazo do ciclo (R4) e saldo: período que passa do concessivo, ou que pede mais dias que o saldo, é recusado',()=>{const p=abre();comPlano(p);
  const a=V(p).valida('2027-03-01','2027-03-30').recusa||{},b=V(p).valida('2027-01-04','2027-02-03').recusa||{};
  return {ok:a.regra==='R4'&&a.natureza==='legal'&&b.regra==='saldo',obs:`01/03 a 30/03: ${a.regra} — ${a.msg} · 31 dias: ${b.regra} — ${b.msg}`}});

caso('Férias — validação','Dividir sem concordância é recusado (R11); com ela, 14 dias passam',()=>{const p=abre();comPlano(p);
  const a=V(p).valida('2027-01-04','2027-01-17');concorda(p);const b=V(p).valida('2027-01-04','2027-01-17');
  return {ok:a.recusa&&a.recusa.regra==='R11'&&b.ok,obs:`sem concordância: ${a.recusa?a.recusa.regra:'PASSOU'} · com: ${b.ok?'passa':b.recusa.regra}`}});

caso('Férias — validação','Mínimos: 4 dias recusado; 15 marcados e depois 12 deixariam 3, e é recusado (R2c)',()=>{const p=abre();comPlano(p);concorda(p);
  const a=V(p).valida('2027-01-04','2027-01-07');marca(p,'2027-01-04','2027-01-18');const b=V(p).valida('2027-02-22','2027-03-05');
  return {ok:a.recusa&&a.recusa.regra==='R2f'&&b.recusa&&b.recusa.regra==='R2c'&&/menos que o mínimo de 5/.test(b.recusa.msg),obs:`4 dias: ${a.recusa&&a.recusa.msg} · 15 + 12: ${b.recusa&&b.recusa.msg}`}});

caso('Férias — validação','Intervalo de 30 dias (R3): 01/02 recusado como regra interna; 17/02 passa',()=>{const p=abre();comPlano(p);concorda(p);
  marca(p,'2027-01-04','2027-01-17');const a=V(p).valida('2027-02-01','2027-02-16'),b=V(p).valida('2027-02-17','2027-03-04');
  return {ok:a.recusa&&a.recusa.regra==='R3'&&a.recusa.natureza==='interna'&&/17\/02\/2027/.test(a.recusa.msg)&&b.ok,obs:`01/02: ${a.recusa&&a.recusa.msg} · 17/02: ${b.ok?'passa':b.recusa.msg}`}});

caso('Férias — validação','O que sobra precisa caber nas datas (R2c): 14 dias no meio de um prazo curto, sem lugar para os 16 restantes, é recusado',()=>{const p=abre('2027-01-20');comPlano(p);concorda(p);
  const a=V(p).valida('2027-02-01','2027-02-14');
  return {ok:!!(a.recusa&&a.recusa.regra==='R2c'&&/não há datas/.test(a.recusa.msg)),obs:a.recusa?a.recusa.msg:'PASSOU'}});

caso('Férias — validação','Antecedência menor que 40 dias marca mesmo assim, com aviso',()=>{const p=abre();comPlano(p);marca(p,'2026-12-14','2027-01-12');
  const pa=painel(p),y=cicloDe(p,'2025-03-15');
  return {ok:y.periodos.length===1&&/fnat-ok/.test(pa.cls)&&/Faltam 19 dias/.test(pa.txt)&&/Aviso/.test(pa.txt),obs:`marcou: ${y.periodos.length} · painel: ${pa.txt.slice(0,120)}`}});

caso('Férias — marcação','Clicar num período planejado mostra as duas medidas e deixa desmarcar',()=>{const p=abre();comPlano(p);marca(p,'2027-01-04','2027-02-02');
  vaiMes(p,'2027-01');clica(p,'#fMesCard [data-d="2027-01-20"]');const pa=painel(p);clica(p,'[data-desmarca]');
  return {ok:/Descanso seguido/.test(pa.txt)&&/Dias úteis poupados/.test(pa.txt)&&cicloDe(p,'2025-03-15').periodos.length===0,obs:pa.txt.slice(0,150)}});

caso('Férias — marcação','O início fica guardado ao trocar de mês, e Esc cancela',()=>{const p=abre();comPlano(p);
  vaiMes(p,'2026-12');clica(p,'#fMesCard [data-d="2026-12-14"]');vaiMes(p,'2027-01');const guardou=/Início em 14\/12\/2026/.test(p.T('fMesCard'));
  p.d.dispatchEvent(new p.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));const cancelou=!/Início em/.test(p.T('fMesCard'));
  return {ok:guardou&&cancelou,obs:`guardou o início em janeiro: ${guardou} · Esc cancelou: ${cancelou}`}});

caso('Férias — medidas','Descanso seguido conta as bordas que não se pagam: 04/01 a 02/02/2027 dá 33 dias fora e 22 úteis poupados',()=>{const p=abre();comPlano(p);
  const a=V(p).avalia('2027-01-04',30);
  return {ok:a.antes===3&&a.depois===0&&a.uteis===22&&a.descanso===33,obs:`antes ${a.antes} (01/01 feriado, 02 e 03 fim de semana) · depois ${a.depois} · úteis ${a.uteis} · descanso ${a.descanso}`}});

// ---------- SAÍDA ----------
Promise.all(PEND).then(()=>{
R.sort((a,b)=>a.id-b.id);
const fal=R.filter(r=>!r.ok&&!r.aviso),av=R.filter(r=>!r.ok&&r.aviso),ok=R.filter(r=>r.ok);
for(const r of R)console.log(`${r.ok?'PASSOU ':r.aviso?'ATENÇÃO':'FALHOU '} #${String(r.id).padStart(2,'0')} [${r.grupo}] ${r.nome} — ${r.obs}`);
console.log(`\nTotal: ${R.length} · passou ${ok.length} · falhou ${fal.length} · atenção ${av.length}`);
fs.writeFileSync(require('path').join(__dirname,'resultado.json'),JSON.stringify(R,null,1));
if(fal.length)process.exitCode=1;
/* a página agenda a virada do dia com setTimeout: encerra sem esperar esses relógios,
   e sem fechar as janelas (fechar derruba o documento com callbacks ainda na fila) */
setTimeout(()=>process.exit(process.exitCode||0),50);
});
