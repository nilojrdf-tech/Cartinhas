/* Monta o Cartinhas.html de instalação: a página de ../index.html com o leitor de PDF
   embutido, para funcionar sem internet.

   Uso:  cd publico/instalacao && node montar.cjs
         node montar.cjs --de C:\caminho\com\pdf.min.mjs     (usa arquivos locais em vez de baixar)

   A versão do pdf.js é a declarada em ../index.html (data-pdfjs-versao), para a página
   online e a offline nunca ficarem em versões diferentes. */

const fs = require('fs');
const path = require('path');

const AQUI = __dirname;
const ENTRADA = path.join(AQUI, '..', 'index.html');
const SAIDA = path.join(AQUI, 'Cartinhas.html');
const ARQUIVOS = ['pdf.min.mjs', 'pdf.worker.min.mjs'];

const argDe = process.argv.indexOf('--de');
const DE = argDe > -1 ? process.argv[argDe + 1] : null;

async function pega(versao, nome) {
  if (DE) return fs.readFileSync(path.join(DE, nome), 'utf8');
  const url = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${versao}/${nome}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} respondeu ${r.status}`);
  return r.text();
}

(async () => {
  const pagina = fs.readFileSync(ENTRADA, 'utf8');

  const mv = /data-pdfjs-versao="([\d.]+)"/.exec(pagina);
  if (!mv) throw new Error('não achei data-pdfjs-versao em ../index.html');
  const versao = mv[1];

  const re = /<script type="module" data-pdfjs-versao="[\d.]+">[\s\S]*?<\/script>/;
  if (!re.test(pagina)) throw new Error('não achei o bloco que carrega o pdf.js em ../index.html');

  const fontes = {};
  for (const nome of ARQUIVOS) {
    fontes[nome] = await pega(versao, nome);
    if (/<\/script/i.test(fontes[nome])) throw new Error(`${nome} contém "</script": não dá para embutir assim`);
    console.log(`  ${nome}: ${fontes[nome].length} bytes`);
  }

  /* O pdf.js 4+ só existe como módulo (.mjs), e um módulo não pode ser embutido direto
     num <script type="module"> e virar window.pdfjsLib. Então o código fica guardado em
     dois <script type="text/plain"> e é importado de um blob:, o que funciona em file://
     e sem internet. O worker vai pelo mesmo caminho. */
  const embutido = `<!-- leitor de PDF embutido: pdf.js ${versao} (funciona sem internet) -->
<script type="text/plain" id="pdfjs-lib">${fontes['pdf.min.mjs']}</script>
<script type="text/plain" id="pdfjs-worker">${fontes['pdf.worker.min.mjs']}</script>
<script type="module" data-pdfjs-versao="${versao}">
const blobUrl=id=>URL.createObjectURL(new Blob([document.getElementById(id).textContent],{type:'text/javascript'}));
window.pdfjsPronto=(async()=>{const lib=await import(blobUrl('pdfjs-lib'));lib.GlobalWorkerOptions.workerSrc=blobUrl('pdfjs-worker');window.pdfjsLib=lib;return lib})();
window.pdfjsPronto.catch(()=>{});/* se falhar, a mensagem aparece quando o usuário tentar ler o PDF */
</script>`;

  /* função no lugar de string: o pdf.js minificado tem "$&", "$1" e afins, que o replace
     com string trataria como marcadores e trocaria pelo texto encontrado */
  fs.writeFileSync(SAIDA, pagina.replace(re, () => embutido));
  console.log(`pronto: ${SAIDA} (${fs.statSync(SAIDA).size} bytes, pdf.js ${versao})`);
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
