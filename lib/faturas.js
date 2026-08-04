// Cálculo de faturas de cartão — função pura, sem acesso ao banco.
// Extraído do CardCartoes (onde vivia inline no carregarFaturas) para ser
// reutilizado tanto pela UI dos cartões quanto pelos insights.
//
// A query continua no chamador; aqui só se agrega o que já foi carregado.

import { calcularPeriodoFaturaAberta, subtrairMeses, mesReferenciaStr } from './financeiro.js';

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
