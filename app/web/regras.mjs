/* GERADO por app/montar-regras.cjs a partir de index.html. Nao editar a mao:
   a proxima montagem apaga qualquer mudanca feita aqui. Para mudar uma regra de
   calculo, mude no index.html e rode "node montar-regras.cjs" de novo.

   Origem: index.html (leitor de PDF 5.4.149) · montado em 2026-11-26 */

/* O dia de hoje e a lista do mes vivem fora destas funcoes no Cartinhas do computador.
   Aqui elas entram pelos dois ajustes abaixo, que o aplicativo chama ao abrir e na virada. */
let todayISO = '';
let days = [];
const DISP = {};
export function defineHoje(d) { todayISO = d; return todayISO; }
export function hoje() { return todayISO; }
export function defineDias(a) { days = a || []; return days; }
export function defineDispensas(o) {
  for (const k of Object.keys(DISP)) delete DISP[k];
  Object.assign(DISP, o || {});
  return DISP;
}
export const TIPOS = ['util', 'folga', 'feriado', 'ferias'];

/* index.html:266 */
const WD=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

/* index.html:275 */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* index.html:276 */
const toM=t=>{const m=/^(\d{1,2}):(\d{2})$/.exec(String(t).trim());return m&&+m[1]<24&&+m[2]<60?+m[1]*60+ +m[2]:null};

/* index.html:279 */
const dur=t=>{t=String(t||'').trim().toLowerCase().replace(/\s/g,'').replace(/^[+]/,'');if(!t)return null;let m;
  if(m=/^(\d{1,3}):(\d{2})$/.exec(t))return +m[1]*60+ +m[2];
  if(m=/^(\d{1,2})h(\d{1,2})?(?:m|min)?$/.exec(t))return +m[1]*60+(+m[2]||0);
  if(m=/^(\d{1,3})(?:m|min)$/.exec(t))return +m[1];
  if(m=/^(\d{1,2})[,.](\d{1,2})$/.exec(t))return Math.round(parseFloat(m[1]+'.'+m[2])*60);
  if((m=/^(\d{2})(\d{2})$/.exec(t))&&+m[2]<60)return +m[1]*60+ +m[2];
  if(m=/^(\d{1,3})$/.exec(t))return +m[1]<=12?+m[1]*60:+m[1];
  return null};

/* index.html:291 */
const comDoisPontos=s=>String(s??'').replace(/(?<![:\d])\d+(?![:\d])/g,d=>
  d.length<=2?d.padStart(2,'0')+':00':
  d.length===3?'0'+d[0]+':'+d.slice(1):
  d.length%4?d:
  d.match(/\d{4}/g).map(p=>p.slice(0,2)+':'+p.slice(2)).join(' '));

/* index.html:297 */
/* marcação digitada com algo inválido (25:00, 10:3o, 07:0, letras) */
const marcInvalida=s=>{s=comDoisPontos(s);const tok=s.match(/\d{1,2}:\d{2}/g)||[];return tok.some(x=>toM(x)==null)||/[^\s*]/.test(s.replace(/\d{1,2}:\d{2}/g,''))};

/* index.html:298 */
const parseList=s=>(comDoisPontos(s).match(/\d{1,2}:\d{2}/g)||[]).map(toM).filter(v=>v!=null);

/* index.html:301 */
const ROTM=['Entrada','Saída para o almoço','Volta do almoço','Saída'];

/* index.html:302 */
const emCampos=s=>{const t=String(s||'').trim().split(/\s+/).filter(Boolean);
  if(t.length===2)return [t[0],'','',t[1]];
  return Array.from({length:Math.max(4,t.length)},(_,k)=>t[k]||'')};

/* index.html:305 */
const normM=s=>parseList(s).map(m=>hm(m)).join(' ');

/* index.html:306 */
const fmt=(m,sign)=>{const s=m<0?'−':(sign&&m>0?'+':'');m=Math.abs(Math.round(m));return s+Math.floor(m/60)+'h'+String(m%60).padStart(2,'0')};

/* index.html:307 */
const hm=m=>{m=Math.abs(m);return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};

/* index.html:308 */
const clock=m=>{m=((m%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};

/* index.html:309 */
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');

/* index.html:311 */
const br=s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4);

/* index.html:312 */
const wd=s=>new Date(s+'T12:00').getDay();

/* index.html:314 */
/* feriados nacionais de data fixa + 30/11 (Dia do Evangélico, DF); confira no seu espelho */
const FER=new Set(['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','11-30','12-25']);

/* index.html:315 */
function pascoa(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1;return new Date(y,mo-1,da,12)}

/* index.html:316 */
function sextaSanta(y){const p=pascoa(y);p.setDate(p.getDate()-2);return iso(p)}

/* index.html:319 */
const ehFeriado=d=>!!DISP[d]||FER.has(d.slice(5))||d===sextaSanta(+d.slice(0,4));

/* index.html:320 */
const mk=(d,tipo,marcas)=>({d,tipo,marcas,srpMarcas:marcas,obs:''});

/* index.html:325 */
const cap=t=>t.charAt(0).toUpperCase()+t.slice(1);

/* index.html:326 */
const nomeMes=ym=>new Date(ym+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});

/* index.html:348 */
/* turno que passa da meia-noite: cada batida menor que a anterior é do dia seguinte */
const seguidas=ms=>{const o=[];let add=0;ms.forEach((m,i)=>{if(i&&m+add<o[i-1])add+=1440;o.push(m+add)});return o};

/* index.html:349 */
function calcDay(x,marcas){
  const marks=seguidas(parseList(marcas??x.marcas));
  const J=x.carga||480;
  let worked=0,inter=0;for(let i=0;i+1<marks.length;i+=2){worked+=Math.max(0,marks[i+1]-marks[i]);if(i>0)inter+=Math.max(0,marks[i]-marks[i-1])}
  let desc=0;if(worked>J&&inter<60){desc=Math.min(60-inter,worked-J);worked-=desc}
  const odd=marks.length%2===1,carga=x.tipo==='util'?J:0;
  const r={marks,worked,inter,desc,odd,carga,cred:0,irr:0,deb:0,extra:0,tol:0,fora:false};
  if(x.d>todayISO||(x.d===todayISO&&(odd||!marks.length))||(x.futuro&&!marks.length)){r.fora=true;return r}
  if(x.tipo!=='util'){r.extra=worked;return r}  /* trabalho em folga/feriado/férias = hora extra paga, fora do banco */
  let diff=worked-carga;
  const he=x.srp&&x.srp.extra||0;if(he&&diff>0){r.extra=Math.min(he,diff);diff-=r.extra}  /* HE autorizada é paga: fica fora do banco */
  if(marks.length&&Math.abs(diff)<=10){r.tol=diff;diff=0}  /* tolerância de até 10 min por dia */
  if(diff>0){r.cred=Math.min(diff,120);r.irr=diff-r.cred}else r.deb=-diff;
  let ab=(x.abono!=null&&x.abono!=='')?(dur(x.abono)||0):(x.srp&&x.srp.abono||0);if(ab<0)ab=carga;if(ab&&r.deb){r.abono=Math.min(ab,r.deb);r.deb-=r.abono}
  return r;
}

/* index.html:365 */
function totals(useExc,srp,arr){
  let cred=0,deb=0,irr=0;
  for(const x of (arr||days)){const r=calcDay(x,srp?x.srpMarcas:undefined);cred+=r.cred;deb+=r.deb;irr+=r.irr}
  return {cred,deb,irr,saldo:(useExc?cred:0)-deb};
}

/* index.html:497 */
function parseMeta(text){
  const g=re=>{const m=re.exec(text);return m?m[1]:null};
  const i=text.search(/\bGeral\b/);const s=i<0?'':text.slice(i);
  const h=re=>{const m=re.exec(s);return m?toM(m[1]):null};
  return {periodo:g(/Per[ií]odo:\s*([\d\/]+\s*[àa]\s*[\d\/]+)/),calc:g(/[ÚU]ltimo c[áa]lculo:\s*([\d\/]+\s+[\d:]+)/),nome:g(/Empregado:\s*(.+?)\s{1,}(?:CEI|$)/m),
    atraso:h(/Atraso\s+(\d+:\d{2})/),falta:h(/Falta\s+(\d+:\d{2})/),he:h(/HE N[ãa]o Autorizado\s+(\d+:\d{2})/),trab:h(/Trabalhada\s+(\d+:\d{2})/),carga:h(/Carga hor[áa]ria\s+(\d+:\d{2})/)};
}

/* index.html:504 */
function parseReport(text){
  const out=[];const L=text.split(/\r?\n/);
  const gi=L.findIndex(l=>/^\s*Geral\b/.test(l));const body=gi<0?L:L.slice(0,gi);
  const reD=/^\s*(\d{2})\/(\d{2})\/(\d{4})\s*(.*)$/;
  const idx=[];body.forEach((l,k)=>{const m=reD.exec(l);if(m&&!/^\d{1,2}:\d{2}:\d{2}/.test(m[4].trim()))idx.push(k)});
  const temOcc=k=>{const m=reD.exec(body[k]);const r=m[4];return r.search(/[A-Za-zÀ-ú]/)>=0};
  const extra=new Map(idx.map(k=>[k,[]]));
  for(let j=0;j<idx.length;j++){const k=idx[j],nx=j+1<idx.length?idx[j+1]:body.length;
    const gap=body.slice(k+1,nx).filter(l=>l.trim()&&!/^(FERIAS|FREQUENCIA|\d{3}:)/.test(l.trim()));
    if(j+1<idx.length&&!temOcc(nx)&&gap.length){extra.get(nx).push(gap.pop())}
    extra.get(k).push(...gap)}
  // linhas antes da primeira data (ocorrência acima dela)
  for(const k of idx){
    const m=reD.exec(body[k]);const rest=m[4];const iso=`${m[3]}-${m[2]}-${m[1]}`;
    if(out.some(o=>o.d===iso))continue;
    const cut=rest.search(/[A-Za-zÀ-ú]/);const head=cut<0?rest:rest.slice(0,cut);
    const occ=((cut<0?'':rest.slice(cut))+' '+extra.get(k).join(' ')).trim();
    const tm=re=>{const x=re.exec(occ);return x?x[1]:''};
    const srp={atraso:tm(/Atraso\s+(\d+:\d{2})/),falta:tm(/Falta\s+(\d+:\d{2})/),irr:tm(/Cr[ée]dito irregular\s+(\d+:\d{2})/),impar:/Marca[çc][ãa]o [íi]mpar/i.test(occ),
      abono:toM(tm(/Total\s+(\d+:\d{2})/))||(/ABONO|Afastamento|Licen[çc]a|Atestado/i.test(occ)?-1:0),
      extra:/f[ée]rias|feriado|folga/i.test(occ)?0:toM(tm(/Extras\s+(\d+:\d{2})/))||0,
      comp:/COMP\.?\s*MENSAL\s*DEB/i.test(occ)?'deb':/COMP\.?\s*MENSAL\s*CRED/i.test(occ)?'cred':'',
      lanc:(/Lan[çc]amento:\s*([^;]+)/i.exec(occ)||[])[1]||''};
    let t=head.match(/\d{1,2}:\d{2}/g)||[];
    let tipo='util';
    if(/f[ée]rias/i.test(occ))tipo='ferias';else if(/folga/i.test(occ))tipo='folga';else if(/feriado|ponto\s+facultativo/i.test(occ))tipo='feriado';
    else if(!t.length&&!occ){const w=new Date(iso+'T12:00').getDay();tipo=(w===0||w===6)?'folga':'util'}
    let carga=null;if(t.length&&tipo!=='folga'){carga=toM(t[t.length-1]);t=t.slice(0,-1)}
    const d=mk(iso,tipo,t.join(' '));d.srp=srp;if(carga&&carga!==480)d.carga=carga;
    const lan=(/Afastamento:\s*([^;]+)/i.exec(occ)||[])[1]||srp.lanc;
    if(srp.abono&&tipo==='util')d.obs=(lan?lan.trim():'Abono')+' '+hm(srp.abono<0?(carga||480):srp.abono);
    else if(tipo!=='util'&&t.length)d.obs='Trabalho em '+(tipo==='feriado'?'feriado':tipo==='ferias'?'férias':'folga')+' (hora extra, fora do banco)';
    else if(srp.comp==='deb')d.obs='Compensação de débito (COMP. MENSAL DEB)';
    else if(srp.comp==='cred')d.obs='Compensação de crédito (COMP. MENSAL CRED)';
    out.push(d);
  }
  return out.sort((a,b)=>a.d<b.d?-1:1);
}

/* index.html:547 */
function uneDias(antigos,novos,ym){
  const old=new Map(antigos.map(x=>[x.d,x]));
  const doMes=novos.filter(n=>n.d.slice(0,7)===ym);
  const vindos=new Set(doMes.map(n=>n.d));
  const trocados=doMes.map(n=>{const o=old.get(n.d);if(!o)return n;
    const keep=normM(o.marcas)!==normM(o.srpMarcas)&&normM(o.srpMarcas)===normM(n.srpMarcas);
    return {...n,marcas:keep?o.marcas:n.marcas,obs:o.obs||n.obs||'',abono:o.abono,tipo:o.tipoManual?o.tipo:n.tipo,tipoManual:o.tipoManual}});
  return {days:trocados.concat(antigos.filter(x=>!vindos.has(x.d))).sort((a,b)=>a.d<b.d?-1:1),vindos,old};
}

export { WD, esc, toM, dur, comDoisPontos, marcInvalida, parseList, ROTM, emCampos, normM, fmt, hm, clock, iso, br, wd, FER, pascoa, sextaSanta, ehFeriado, mk, cap, nomeMes, seguidas, calcDay, totals, parseMeta, parseReport, uneDias };
