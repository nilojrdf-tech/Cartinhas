/* A fila de edicoes que ainda nao foram enviadas.

   Ela e de QUEM ESTA LOGADO, nao do aparelho: cada conta tem a sua, guardada com a
   matricula na chave. Se a pessoa sai e outra entra no mesmo celular, a segunda nao ve nem
   envia o que a primeira deixou pendente; quando a primeira voltar, a pendencia dela
   reaparece. E so sai da fila quando o servidor confirma: antes disso nada aparece como
   "salvo".

   Fica fora da tela de proposito, para poder ser exercitada pelos testes contra o
   servidor de verdade (testes/fila.test.js).

   criaFila({ storage, api, aoMudar }):
     storage  objeto tipo localStorage
     api      (metodo, caminho, corpo) -> { status, ok, dado }
     aoMudar  chamado sempre que a fila muda, para a tela se redesenhar
*/

export const CHAVE = 'cartinhas.app.fila.';

export function criaFila({ storage, api, aoMudar }) {
  let matricula = null;
  let itens = [];

  const avisa = () => { if (aoMudar) aoMudar(itens.slice()); };
  const chave = () => CHAVE + matricula;

  function le() {
    itens = [];
    if (!matricula) return;
    try {
      const v = JSON.parse(storage.getItem(chave()) || '[]');
      if (Array.isArray(v)) itens = v;
    } catch (_) { itens = []; }
  }

  function grava() {
    if (!matricula) return;
    try { storage.setItem(chave(), JSON.stringify(itens)); } catch (_) {}
    avisa();
  }

  return {
    /* Abre a fila desta conta. Nunca mistura com a de quem usou o aparelho antes. */
    entra(m) { matricula = m; le(); avisa(); return itens.slice(); },

    /* Sair nao apaga a pendencia: ela espera o titular voltar. */
    sai() { matricula = null; itens = []; avisa(); },

    de() { return matricula; },
    itens() { return itens.slice(); },
    conta() { return itens.length; },
    tem(d) { return itens.some((x) => x.d === d); },

    /* Enfileira um dia. A revisao guardada e a da PRIMEIRA edicao: e sobre ela que o
       servidor confere o conflito, mesmo que a pessoa mexa no dia varias vezes offline. */
    poe(dia) {
      if (!matricula) return;
      const i = itens.findIndex((x) => x.d === dia.d);
      if (i >= 0) itens[i] = { ...dia, rev: itens[i].rev };
      else itens.push({ ...dia });
      grava();
    },

    esquece(datas) {
      const fora = new Set(datas);
      itens = itens.filter((x) => !fora.has(x.d));
      grava();
    },

    /* Envia o que esta na fila, um lote por mes.
       Devolve { enviados, conflitos, erro }. Dia confirmado sai da fila; dia em conflito
       sai da fila e volta como conflito, para o titular escolher; o resto fica para a
       proxima tentativa. */
    async envia(metaDoMes) {
      if (!matricula || !itens.length) return { enviados: [], conflitos: [], erro: null };
      const porMes = new Map();
      for (const x of itens) {
        const ym = x.d.slice(0, 7);
        if (!porMes.has(ym)) porMes.set(ym, []);
        porMes.get(ym).push(x);
      }
      const enviados = [];
      const conflitos = [];
      let erro = null;
      for (const [ym, lote] of porMes) {
        let r;
        try { r = await api('POST', '/api/dias', { ym, meta: metaDoMes ? metaDoMes(ym) : undefined, dias: lote }); }
        catch (e) { erro = { tipo: 'rede', recado: 'Sem conexão agora. O que você editou continua guardado aqui.' }; break; }
        if (r.status === 401) { erro = { tipo: 'sessao', recado: 'Sua sessão terminou. Entre de novo para enviar o que ficou pendente.' }; break; }
        if (r.status !== 200 && r.status !== 409) {
          erro = { tipo: 'servidor', recado: (r.dado && r.dado.recado) || 'Não consegui enviar agora.' };
          break;
        }
        for (const s of (r.dado.salvos || [])) enviados.push(s);
        for (const c of (r.dado.conflitos || [])) {
          conflitos.push({ ...c, meu: lote.find((x) => x.d === c.d) || null });
        }
      }
      this.esquece([...enviados.map((s) => s.d), ...conflitos.map((c) => c.d)]);
      return { enviados, conflitos, erro };
    },
  };
}
