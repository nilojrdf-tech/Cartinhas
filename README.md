# Cartinhas

**Banco de horas: estou devendo?** Ferramenta de apoio que lê o *Relatório Espelho de Ponto* do SRP (em PDF) e mostra, dia a dia e mês a mês, se você está devendo ou sobrando hora.

> Ferramenta de apoio, **não oficial**. O registro que vale é o do SRP.
> Tudo roda no seu computador: nenhum dado é enviado para lugar nenhum.

## O que ele faz

- **Saldo do mês**, positivo (azul) ou negativo (vermelho), com créditos e débitos de cada dia.
- **Gráfico diário**, com fins de semana, feriados e férias destacados.
- **Até o fim do mês**: quanto você pode trabalhar a menos, ou precisa fazer a mais, nos dias úteis que faltam.
- **Cálculo do dia**: digite entrada e almoço e veja a que horas pode ir embora, para o saldo que você escolher.
- **Vários meses**, cada um com sua tela; o relatório importado entra sozinho no mês certo.
- **Abono** por dia (consulta, atestado etc.): digite as horas abonadas e elas cobrem o débito do dia.
- **Conferência** com os totais do próprio relatório do SRP.
- **Dados num arquivo seu** (`cartinhas-dados.json`), lido e gravado por qualquer navegador (Chrome ou Edge).

## Como usar

1. Baixe o pacote da pasta [`instalacao`](instalacao) e rode `instalar.bat` (cria o atalho na Área de Trabalho),
   ou simplesmente abra `instalacao/Cartinhas.html` no Chrome ou no Edge.
2. No SRP: *Meu Espelho Ponto* → escolha o mês → *Relatório Espelho de Ponto* em PDF.
3. Arraste o PDF para a caixa "Importar o espelho do SRP".
4. No topo, clique em **Conectar cartinhas-dados.json** para guardar seus dados num arquivo da sua pasta.

## Regras de cálculo (as observadas no SRP)

- Carga do dia vem do relatório (8h, 7h15 etc.); fins de semana, feriados e férias sem carga.
- Crédito máximo de 2h por dia; o excedente é "crédito irregular" e não entra no saldo.
- Passando da jornada, intervalo mínimo de 1h; o que faltar é descontado.
- Tolerância de até 10 minutos por dia.
- Turnos que passam da meia-noite são tratados como um dia só.
- Abonos, compensações (COMP. MENSAL) e lançamentos com "Total" são considerados.
- Trabalho em folga ou feriado, e hora extra autorizada, é hora extra paga e fica fora do banco.
- Ponto facultativo no relatório = dia sem carga; afastamento ou licença = dia abonado.

## Testes

`testes/auditoria.test.js` roda 47 situações (relatórios fora do padrão, tolerância, turno noturno, meses, abono etc.) num navegador simulado:

```
cd testes
npm install
node auditoria.test.js ../index.html
```

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | O sistema, código legível (carrega o leitor de PDF da internet). |
| `instalacao/Cartinhas.html` | O mesmo sistema em um arquivo só, com o leitor de PDF embutido (funciona sem internet). |
| `instalacao/instalar.bat` / `desinstalar.bat` | Instalam e removem o atalho no Windows. |
| `instalacao/LEIA-ME.txt` | Instruções para quem vai usar. |
| `logo/` | Logo em SVG, PNG e ícone do Windows. |

O leitor de PDF é o [pdf.js](https://github.com/mozilla/pdf.js) (Mozilla, licença Apache 2.0).

## Licença

[MIT](LICENSE): pode usar, copiar, modificar e distribuir, mantendo o aviso de autoria.
