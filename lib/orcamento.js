// Lógica pura de competência para o orçamento por categoria.
//
// Uma transação conta no mês em que GERA a obrigação (regime de competência):
//   - Compra de cartão → mês da fatura (mes_fatura)
//   - Transação de conta → mês da data
//   - Pagamento de fatura e transferências → nunca contam
//
// Sem supabase, sem React.

/**
 * Retorna o 'YYYY-MM' em que a transação conta no orçamento,
 * ou null se não deve contar.
 */
export function mesDeCompetencia(transacao) {
  if (transacao.transferencia_id) return null;
  if (transacao.origem === 'fatura') return null;
  if (transacao.cartao_id) {
    return transacao.mes_fatura ? transacao.mes_fatura.slice(0, 7) : null;
  }
  return transacao.data ? transacao.data.slice(0, 7) : null;
}

/**
 * Retorna true se a transação conta no orçamento do mês (ano, mes).
 * mes é 0-based, igual a Date.getMonth().
 */
export function contaNoMes(transacao, ano, mes) {
  const competencia = mesDeCompetencia(transacao);
  if (!competencia) return false;
  const mesStr = `${ano}-${String(mes + 1).padStart(2, '0')}`;
  return competencia === mesStr;
}

/**
 * Retorna { categoria: somaGasto } considerando só tipo==='saida'
 * e transações que contam no mês (ano, mes). Categoria null/vazia agrupa em ''.
 */
export function gastoPorCategoriaNoMes(transacoes, ano, mes) {
  const resultado = {};
  for (const t of transacoes) {
    if (t.tipo !== 'saida') continue;
    if (!contaNoMes(t, ano, mes)) continue;
    const cat = t.categoria ?? '';
    resultado[cat] = (resultado[cat] ?? 0) + Number(t.valor);
  }
  return resultado;
}
