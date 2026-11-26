/* A conta inversa do "Cálculo do dia": a que horas sair para o dia fechar no saldo pedido.

   Isto e a unica parte da conta que nao sai de regras.mjs, porque no Cartinhas do
   computador ela esta misturada com a tela. Por isso existe testes/calculadora.test.js,
   que compara esta funcao com a mesma conta na pagina, caso a caso. Qualquer diferenca
   entre as duas faz a suite terminar com erro.

   O EFEITO de sair aquela hora nunca e calculado aqui: quem diz como o dia fecha e sempre
   o calcDay de regras.mjs, com tolerancia, hora extra autorizada e abono. */

import { dur } from './regras.mjs';

export const parseAlvo = (t) => {
  t = String(t || '').trim();
  const neg = /^[-−]/.test(t);
  const v = dur(t.replace(/^[-−+]/, ''));
  return v == null ? null : neg ? -v : v;
};

export function horaDeSaida(E1, S1, E2, J, alvoPedido, sim) {
  /* o banco so aceita de −jornada a +2 h no dia */
  const alvo = Math.max(-J, Math.min(alvoPedido, 120));

  /* O alvo e o efeito no BANCO. A hora extra autorizada e paga e sai do credito, e o abono
     cobre parte do debito: nos dois casos a diferenca bruta a atingir e maior que o alvo. */
  const heA = (sim.srp && sim.srp.extra) || 0;
  let abA = (sim.abono != null && sim.abono !== '') ? (dur(sim.abono) || 0) : ((sim.srp && sim.srp.abono) || 0);
  if (abA < 0) abA = J;
  const bruto = alvo > 0 ? alvo + heA : alvo < 0 ? alvo - abA : 0;
  const meta = J + bruto;

  const manha = (E1 != null && S1 != null) ? S1 - E1 : null;
  const inter = (S1 != null && E2 != null) ? E2 - S1 : 0;
  const semAlm = S1 == null && E2 == null;

  let saida = null;
  if (E2 != null && S1 != null) {
    /* passando da jornada, o SRP exige 1 h de intervalo: o que faltou entra na conta */
    const extra = meta > J && inter < 60 ? 60 - inter : 0;
    saida = E2 + (meta - manha) + extra;
  } else if (semAlm && E1 != null) {
    const extra = meta > J ? 60 : 0;
    saida = E1 + meta + extra;
  }
  return { saida, bruto, alvo, heA, abA, semAlm, meta };
}
