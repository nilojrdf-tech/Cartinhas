'use strict';
/* Envio de e-mail do Cartinhas, sem dependencia externa.

   Dois modos:
   - "arquivo": grava a mensagem em /dados/mensagens e nao envia nada. E o modo do
     computador e dos testes, para o fluxo de convite e recuperacao poder ser exercitado
     inteiro antes de existir remetente de verdade.
   - "smtp": fala SMTP direto, com TLS implicito (465) ou STARTTLS (587).

   Nada de senha, token ou link entra no log: so o destinatario e o assunto. */

const net = require('node:net');
const tls = require('node:tls');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function cabecalho(texto) {
  // Assunto com acento vai codificado, para nao chegar embaralhado.
  return /^[\x20-\x7E]*$/.test(texto)
    ? texto
    : '=?UTF-8?B?' + Buffer.from(texto, 'utf8').toString('base64') + '?=';
}

function monta({ de, para, assunto, corpo }) {
  const id = crypto.randomUUID() + '@cartinhas';
  const linhas = [
    `From: ${de}`,
    `To: ${para}`,
    `Subject: ${cabecalho(assunto)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${id}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(corpo, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ];
  return linhas.join('\r\n') + '\r\n';
}

/* ---------- conversa SMTP ---------- */

function conversa(soquete, aceita) {
  return new Promise((ok, erro) => {
    let buf = '';
    const chegou = (p) => {
      buf += p.toString('utf8');
      // As linhas do meio vem como "250-texto"; a ultima, "250 texto". A resposta so
      // esta completa quando chega uma linha inteira com codigo seguido de espaco.
      const partes = buf.split('\r\n');
      const completas = partes.slice(0, -1);
      const fim = completas.find((l) => /^\d{3}(?: |$)/.test(l));
      if (!fim) return;
      const codigo = Number(fim.slice(0, 3));
      limpa();
      if (aceita.includes(codigo)) ok({ codigo, texto: buf });
      else erro(new Error(`SMTP respondeu ${codigo}: ${buf.trim().slice(0, 200)}`));
    };
    const falhou = (e) => { limpa(); erro(e); };
    const caiu = () => falhou(new Error('O servidor de e-mail encerrou a conexao.'));
    function limpa() {
      soquete.removeListener('data', chegou);
      soquete.removeListener('error', falhou);
      soquete.removeListener('close', caiu);
    }
    soquete.on('data', chegou);
    soquete.once('error', falhou);
    soquete.once('close', caiu);
  });
}

async function manda(soquete, linha, aceita) {
  if (linha != null) soquete.write(linha + '\r\n');
  return conversa(soquete, aceita);
}

function conecta(op) {
  return new Promise((ok, erro) => {
    const s = op.tls
      ? tls.connect({ host: op.host, port: op.port, servername: op.host })
      : net.connect({ host: op.host, port: op.port });
    s.setTimeout(20000);
    s.once(op.tls ? 'secureConnect' : 'connect', () => ok(s));
    s.once('timeout', () => { s.destroy(); erro(new Error('Tempo esgotado falando com o servidor de e-mail.')); });
    s.once('error', erro);
  });
}

function viraTls(s, host) {
  return new Promise((ok, erro) => {
    const t = tls.connect({ socket: s, servername: host }, () => ok(t));
    t.once('error', erro);
  });
}

async function porSmtp(cfg, msg) {
  const implicito = Number(cfg.porta) === 465;
  let s = await conecta({ host: cfg.host, port: Number(cfg.porta), tls: implicito });
  try {
    await conversa(s, [220]);
    let r = await manda(s, `EHLO ${cfg.ehlo}`, [250]);
    if (!implicito && /STARTTLS/i.test(r.texto)) {
      await manda(s, 'STARTTLS', [220]);
      s = await viraTls(s, cfg.host);
      r = await manda(s, `EHLO ${cfg.ehlo}`, [250]);
    }
    if (cfg.usuario) {
      if (/AUTH[^\r\n]*PLAIN/i.test(r.texto)) {
        const cred = Buffer.from('\0' + cfg.usuario + '\0' + cfg.senha, 'utf8').toString('base64');
        await manda(s, 'AUTH PLAIN ' + cred, [235]);
      } else {
        await manda(s, 'AUTH LOGIN', [334]);
        await manda(s, Buffer.from(cfg.usuario, 'utf8').toString('base64'), [334]);
        await manda(s, Buffer.from(cfg.senha, 'utf8').toString('base64'), [235]);
      }
    }
    await manda(s, `MAIL FROM:<${cfg.remetente}>`, [250]);
    await manda(s, `RCPT TO:<${msg.para}>`, [250, 251]);
    await manda(s, 'DATA', [354]);
    s.write(monta({ ...msg, de: cfg.de }));
    await manda(s, '.', [250]);
    try { await manda(s, 'QUIT', [221]); } catch (_) {}
  } finally {
    s.destroy();
  }
  return { modo: 'smtp', para: msg.para };
}

/* ---------- modo arquivo ---------- */

function porArquivo(cfg, msg) {
  const dir = cfg.pasta;
  fs.mkdirSync(dir, { recursive: true });
  const nome = `${new Date().toISOString().replace(/[:.]/g, '-')}-${msg.para.replace(/[^\w.@-]/g, '_')}.txt`;
  const arq = path.join(dir, nome);
  fs.writeFileSync(arq, monta({ ...msg, de: cfg.de }).replace(/\r\n/g, '\n') +
    '\n\n--- texto legivel ---\n' + msg.corpo + '\n', 'utf8');
  return { modo: 'arquivo', para: msg.para, arquivo: arq };
}

/* ---------- fachada ---------- */

function criaCorreio(cfg) {
  const modo = cfg.modo || 'arquivo';
  const guardadas = [];
  return {
    modo,
    enviadas: guardadas,          // so os testes e o modo arquivo olham aqui
    async envia(msg) {
      if (!msg || !msg.para || !msg.assunto) throw new Error('Mensagem incompleta.');
      const r = modo === 'smtp' ? await porSmtp(cfg, msg) : porArquivo(cfg, msg);
      guardadas.push({ para: msg.para, assunto: msg.assunto, corpo: msg.corpo, quando: Date.now() });
      if (guardadas.length > 50) guardadas.shift();
      return r;
    },
  };
}

/* ---------- textos ---------- */

const textos = {
  confirmacao: (endereco, token) => ({
    assunto: 'Cartinhas: confirme seu e-mail e crie sua senha',
    corpo:
`Voce foi convidado para o Cartinhas, a ferramenta de apoio que mostra o seu banco de horas
a partir do Relatorio Espelho de Ponto do SRP.

Para criar a sua senha, abra este link:

${endereco}/senha-nova#${token}

O link vale enquanto o convite estiver valido e so pode ser usado uma vez.
Se voce nao esperava este convite, ignore esta mensagem: sem abrir o link, nada e criado.

Cartinhas - ferramenta de apoio, nao oficial. O registro que vale e o do SRP.`,
  }),
  recuperacao: (endereco, token, minutos) => ({
    assunto: 'Cartinhas: link para redefinir sua senha',
    corpo:
`Alguem pediu uma nova senha para a sua conta no Cartinhas.

Para escolher outra senha, abra este link:

${endereco}/senha-nova#${token}

O link vale ${minutos} minutos e so pode ser usado uma vez. Ao trocar a senha, as sessoes
abertas em outros aparelhos pedem login de novo.

Se nao foi voce quem pediu, ignore esta mensagem: a senha atual continua valendo.

Cartinhas - ferramenta de apoio, nao oficial. O registro que vale e o do SRP.`,
  }),
  teste: (endereco) => ({
    assunto: 'Cartinhas: teste de envio',
    corpo:
`Mensagem de teste do Cartinhas em ${endereco}.

Se ela chegou, o remetente esta configurado e a fase 0 pode ser registrada como concluida
nesse ponto.`,
  }),
};

module.exports = { criaCorreio, textos, monta };
