// Cálculo de faturas de cartão — função pura, sem acesso ao banco.
// Extraído do CardCartoes (onde vivia inline no carregarFaturas) para ser
// reutilizado tanto pela UI dos cartões quanto pelos insights.
//
// A query continua no chamador; aqui só se agrega o que já foi carregado.

import { calcularPeriodoFaturaAberta, subtrairMeses, mesReferenciaStr } from './financeiro.js';

// Dado um cartão e o mesRef do ciclo fechado (+ do ciclo aberto = mês seguinte),
// retorna a data de vencimento daquela fatura como objeto Date.
//
// REGRA: se dia_vencimento > dia_fechamento o vencimento cai no MESMO mês do
// ciclo; caso contrário cai no mês da fatura aberta (= mês seguinte ao ciclo).
// O dia é clampado ao último dia do mês, igual a vencimentoOcorrencia.
export function calcularVencimentoFatura(cartao, mesRefCiclo, mesRefAberta) {
  const mesRefVenc = cartao.dia_vencimento > cartao.dia_fechamento
    ? mesRefCiclo
    : mesRefAberta;

  const ano = parseInt(mesRefVenc.slice(0, 4), 10);
  const mes  = parseInt(mesRefVenc.slice(5, 7), 10); // 1-based

  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dia = Math.min(Number(cartao.dia_vencimento), ultimoDia);

  const d = new Date(ano, mes - 1, dia);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Gera eventos de saída de fatura para a projeção de fluxo de caixa.
 *
 * Para cada par (cartão, mes_fatura) nas transações futuras, soma os valores das
 * parcelas e calcula a DATA ABSOLUTA de vencimento usando calcularVencimentoFatura.
 * Retorna apenas eventos dentro do horizonte [hoje+1, hoje+dias].
 *
 * Shape do evento retornado: { data: 'YYYY-MM-DD', tipo: 'saida', valor, nome }
 * Formato de data absoluta — não dia_referencia recorrente — porque cada fatura é
 * de um único mês, não de todos os meses.
 *
 * @param {Object[]} cartoes                 - Cartões da entidade (id, nome, dia_fechamento, dia_vencimento).
 * @param {Object[]} transacoesCartaoFuturas - Transações com mes_fatura >= mês atual. Campos: cartao_id, valor, mes_fatura.
 * @param {string}   hoje                    - Data de referência 'YYYY-MM-DD'.
 * @param {number}   dias                    - Horizonte da projeção em dias.
 * @returns {Array<{data: string, tipo: string, valor: number, nome: string}>}
 */
export function gerarEventosFaturaFutura({ cartoes, transacoesCartaoFuturas, hoje, dias }) {
  const mapaCartoes = Object.fromEntries((cartoes || []).map((c) => [c.id, c]));

  // 1. Agrupa por cartao_id + mes_fatura, somando valores de parcelas do mesmo grupo
  const grupos = new Map();
  for (const tx of (transacoesCartaoFuturas || [])) {
    const chave = `${tx.cartao_id}||${tx.mes_fatura}`;
    const atual = grupos.get(chave) ?? { cartao_id: tx.cartao_id, mes_fatura: tx.mes_fatura, valor: 0 };
    atual.valor += Number(tx.valor);
    grupos.set(chave, atual);
  }

  const dataBase = new Date(hoje + 'T00:00:00');
  const dataHorizonte = new Date(hoje + 'T00:00:00');
  dataHorizonte.setDate(dataHorizonte.getDate() + dias);

  const eventos = [];
  for (const { cartao_id, mes_fatura, valor } of grupos.values()) {
    const cartao = mapaCartoes[cartao_id];
    if (!cartao) continue;

    // 2. mes_fatura ('YYYY-MM-01') é o mesRefCiclo; mesRefAberta = mês seguinte.
    //    calcularVencimentoFatura decide entre os dois conforme a regra de fechamento.
    const anoC = parseInt(mes_fatura.slice(0, 4), 10);
    const mesC0 = parseInt(mes_fatura.slice(5, 7), 10) - 1; // 1-based → 0-based
    const mesRefCiclo = mesReferenciaStr(anoC, mesC0);
    const { ano: anoA, mes: mesA0 } = subtrairMeses(anoC, mesC0, -1); // avança 1 mês
    const mesRefAberta = mesReferenciaStr(anoA, mesA0);

    const vencimento = calcularVencimentoFatura(cartao, mesRefCiclo, mesRefAberta);

    // 3. Filtra: só eventos futuros dentro do horizonte (hoje exclusivo, hoje+dias inclusivo)
    if (vencimento <= dataBase || vencimento > dataHorizonte) continue;

    const dataStr = [
      vencimento.getFullYear(),
      String(vencimento.getMonth() + 1).padStart(2, '0'),
      String(vencimento.getDate()).padStart(2, '0'),
    ].join('-');

    eventos.push({ data: dataStr, tipo: 'saida', valor, nome: `Fatura ${cartao.nome}` });
  }

  return eventos;
}

// Dado um cartão e as transações dele (das faturas relevantes), devolve os
// totais da fatura aberta (ciclo atual) e da fechada (ciclo anterior), além de
// se a fechada já foi paga. `transacoes` deve conter ao menos os meses de
// referência aberta e fechada — a soma ignora o que estiver fora deles.
export function calcularFaturasCartao(cartao, transacoes, hoje = new Date()) {
  const aberta = calcularPeriodoFaturaAberta(cartao, hoje);
  const fechada = subtrairMeses(aberta.ano, aberta.mes, 1);

  const mesRefAberta = mesReferenciaStr(aberta.ano, aberta.mes);
  const mesRefFechada = mesReferenciaStr(fechada.ano, fechada.mes);

  const compras = (transacoes || []).filter((t) => t.origem !== 'fatura');
  const pagamentos = (transacoes || []).filter((t) => t.origem === 'fatura');

  const totalAberta = compras
    .filter((t) => t.mes_fatura === mesRefAberta)
    .reduce((s, t) => s + Number(t.valor || 0), 0);
  const totalFechada = compras
    .filter((t) => t.mes_fatura === mesRefFechada)
    .reduce((s, t) => s + Number(t.valor || 0), 0);
  const fechadaPaga = pagamentos.some((t) => t.mes_fatura === mesRefFechada);

  return {
    aberta: { mesRef: mesRefAberta, total: totalAberta },
    fechada: { mesRef: mesRefFechada, total: totalFechada, paga: fechadaPaga },
  };
}
