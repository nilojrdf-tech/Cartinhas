# Cartinhas — aplicativo (PWA)

O mesmo Cartinhas, agora com conta por pessoa e os dados num servidor, para abrir no
celular e no computador. O Cartinhas de um arquivo só (`../index.html` e
`../instalacao/Cartinhas.html`) **continua funcionando igual** e não depende disto.

> Ferramenta de apoio, **não oficial**. O registro que vale é o do SRP.

## O que já está pronto

| Fase | O que entrega | Situação |
| --- | --- | --- |
| 0 | App, volumes e domínio no EasyPanel | Falta fazer: depende do acesso ao painel. O que dá para preparar está pronto — `Dockerfile`, variáveis, `backup.cjs` e o roteiro em [FASE-0.md](FASE-0.md) |
| 1 | Contas, convites pelo WhatsApp, confirmação por e-mail, recuperação de senha e gravação por conta e dia | Pronto, com 39 verificações |
| 2 | Tela de celular, PWA, importação do PDF no aparelho, calculadora e fila de edições por conta | Pronto, com 11 verificações |
| 3 | Trazer os meses do `cartinhas-dados.json` | Pronto, com 10 verificações (`migrar.cjs`) |
| 4 | Testes | 180 verificações ao todo, incluindo as 62 do Cartinhas do computador |
| 5 | Ícone nos celulares e endereço nos favoritos | Depende da fase 0 |
| 6 | Backup diário, retenção de 30 dias e restauração | Pronto, com 6 verificações (`backup.cjs`) |

## Rodar aqui no computador

Precisa de **Node 22.5 ou mais novo** (o SQLite vem dentro do Node; não há `npm install`).

```
cd publico/app
node montar-regras.cjs          # extrai as regras de cálculo do ../index.html
node montar-pdfjs.cjs           # baixa o leitor de PDF para web/vendor (uma vez)
CARTINHAS_ADMIN_MATRICULA=12345678 CARTINHAS_ADMIN_EMAIL=voce@exemplo.test node servidor.js
```

Abra `http://localhost:8080`. Com `CARTINHAS_EMAIL_MODO=arquivo` (o padrão), nenhum e-mail
é enviado: as mensagens são gravadas em `dados/mensagens/`. O primeiro acesso é assim:

1. Na tela de entrada, digite a matrícula e toque em **Esqueci minha senha**.
2. Abra o arquivo mais novo de `dados/mensagens/` e copie o link.
3. Abra o link, escolha a senha, e entre.

## Rodar os testes

```
node testes/todos.js
```

Termina com código de erro se qualquer verificação falhar. Para rodar uma suíte só:
`node testes/fase1.test.js`, `node testes/regras.test.js`, etc. Cada suíte grava o detalhe
em `testes/resultado-*.json`.

## Como o cálculo não se divide em dois

Esta é a regra mais importante do projeto: **as regras de cálculo moram no
`../index.html`**, que é a versão auditada. O aplicativo não tem uma segunda cópia delas.

- `montar-regras.cjs` extrai do `index.html` as funções de cálculo e de leitura do
  relatório e gera `web/regras.mjs`. Se o `index.html` mudar de forma que a extração não
  reconheça uma declaração, a montagem **para com erro** em vez de gerar meia regra.
- `testes/regras.test.js` roda a página de verdade (num navegador simulado) e o módulo
  extraído lado a lado e compara campo por campo, em 30 situações de dia e 10 relatórios.
- A única conta que o aplicativo refaz é a **hora de saída** (`web/calculo.mjs`), porque no
  `index.html` ela está misturada com a tela. `testes/calculadora.test.js` compara as duas
  em 810 combinações de entrada, almoço, jornada e saldo desejado.

Mudou uma regra no `index.html`? Rode `node montar-regras.cjs` e `node testes/todos.js`.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `servidor.js` | O servidor: rotas, sessão, arquivos da tela. Node puro, sem dependência de npm |
| `lib/banco.js` | Esquema do SQLite e a cópia consistente usada pelo backup |
| `lib/contas.js` | Matrícula, senha, sessão, convites, vagas e limite de tentativas |
| `lib/ponto.js` | Dias por conta, com revisão por dia, e a conferência do titular |
| `lib/correio.js` | Envio de e-mail (SMTP próprio, sem biblioteca) e o modo "arquivo" |
| `web/index.html` | A tela do celular |
| `web/app.mjs` | A lógica da tela |
| `web/regras.mjs` | **Gerado** do `../index.html`. Não editar à mão |
| `web/calculo.mjs` | A conta inversa da hora de saída |
| `web/fila.mjs` | As edições que ainda não foram enviadas, por conta |
| `web/sw.js` | Service worker: guarda a casca do aplicativo, nunca o ponto |
| `web/vendor/` | **Baixado** pelo `montar-pdfjs.cjs`: o pdf.js, na versão do `index.html` |
| `migrar.cjs` | Fase 3: traz os meses do `cartinhas-dados.json` para uma conta |
| `backup.cjs` | Fase 6: cópia diária, retenção e conferência |
| `Dockerfile` | A imagem para o EasyPanel |
| `FASE-0.md` | O roteiro de publicação na VPS |

## O que vai ao servidor, e o que não vai

Vão os horários, abonos e observações de cada dia — o mesmo que já está no
`cartinhas-dados.json` — mais o que a conta exige: matrícula, hash da senha com sal, e
e-mail de recuperação.

**Não vão:** o PDF do SRP (lido no próprio aparelho, só os horários seguem) e a senha do
SRP, que nunca é pedida. O service worker nunca guarda chamada de `/api/`, então nenhum
saldo fica em cache no aparelho de outra pessoa. Os registros (`registro`) guardam o que
aconteceu — convite criado, conta ativada, senha trocada — e nunca senha, token ou link.
