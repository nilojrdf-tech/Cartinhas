'use strict';
/* Baixa o pdf.js para web/vendor, na mesma versao que o index.html usa.

   O leitor fica junto do aplicativo, e nao num endereco de fora, por tres motivos:
   a pagina so permite script da propria origem (ver a politica no servidor), o celular
   abre mais rapido, e a PWA continua lendo PDF sem internet.

   Rodar:  node montar-pdfjs.cjs
*/

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const ORIGEM = path.join(__dirname, '..', 'index.html');
const DESTINO = path.join(__dirname, 'web', 'vendor');
const ARQUIVOS = ['pdf.min.mjs', 'pdf.worker.min.mjs'];

function versao() {
  const p = fs.readFileSync(ORIGEM, 'utf8');
  const m = /<script type="module" data-pdfjs-versao="([^"]+)"/.exec(p);
  if (!m) throw new Error('nao achei data-pdfjs-versao no index.html');
  return m[1];
}

function baixa(url) {
  return new Promise((ok, erro) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) return ok(baixa(res.headers.location));
      if (res.statusCode !== 200) return erro(new Error(`${url} respondeu ${res.statusCode}`));
      const partes = [];
      res.on('data', (p) => partes.push(p));
      res.on('end', () => ok(Buffer.concat(partes)));
    }).on('error', erro);
  });
}

async function monta() {
  const v = versao();
  fs.mkdirSync(DESTINO, { recursive: true });
  const feitos = [];
  for (const nome of ARQUIVOS) {
    const alvo = path.join(DESTINO, nome);
    const url = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/${nome}`;
    const dado = await baixa(url);
    if (dado.length < 50000) throw new Error(`${nome} veio pequeno demais (${dado.length} bytes)`);
    fs.writeFileSync(alvo, dado);
    feitos.push({ nome, bytes: dado.length });
  }
  fs.writeFileSync(path.join(DESTINO, 'VERSAO.txt'),
    `pdf.js ${v} (Mozilla, licenca Apache 2.0), baixado de cdnjs em ${new Date().toISOString().slice(0, 10)}\n` +
    `A versao vem do index.html (data-pdfjs-versao). Para trocar, mude la e rode montar-pdfjs.cjs.\n`);
  return { versao: v, feitos };
}

if (require.main === module) {
  monta().then((r) => {
    for (const f of r.feitos) console.log(`${f.nome}: ${(f.bytes / 1024).toFixed(0)} KB`);
    console.log(`pdf.js ${r.versao} em web/vendor`);
  }).catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
}

module.exports = { monta, versao };
