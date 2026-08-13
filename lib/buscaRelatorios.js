// Busca compartilhada de competência para relatórios de gasto.
//
// Regra: transações de CONTA contam pelo campo `data`; compras de CARTÃO
// contam pelo campo `mes_fatura` (regime de competência). Pagamentos de fatura
// e transferências entre contas nunca entram nos relatórios de gasto.
//
// Separa lógica pura (derivarParametrosCompetencia, testável sem banco) da
// execução das queries (buscarTransacoesCompetencia, que recebe o cliente
// supabase como argumento).

import { mesesReferenciaNoPeriodo } from './financeiro.js';

// Colunas selecionadas por ambos os sub-queries. Superset que atende todos os
// relatórios de gasto: AbaRelatorios, AbaDRE, CardInsights, CSVs, DRE, etc.
const SELECT =
  'id, tipo, valor, categoria, descricao, data, essencialidade, status, ' +
  'conta_id, cartao_id, mes_fatura, origem, transferencia_id';

// ─────────────────────────────────────────────────────────────────────────────
// PARTE PURA — sem supabase, testável isoladamente
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Deriva os parâmetros que cada sub-query de competência deve receber.
 *
 * @param {string} dataInicio  'YYYY-MM-DD'
 * @param {string} dataFim     'YYYY-MM-DD'
 * @param {object} filtros     { filtroTipo, filtroCategoria, filtroEssencialidade, filtroContaId }
 * @returns {{
 *   mesesFatura: string[],     // 'YYYY-MM-01' que cobrem o período — para .in('mes_fatura', ...)
 *   filtrosComuns: { tipo: string|null, categoria: string|null, essencialidade: string|null },
 *   filtroContaId: string|null,
 *   incluirCartao: boolean,    // false quando filtroContaId está presente (ver nota abaixo)
 * }}
 */
export function derivarParametrosCompetencia(dataInicio, dataFim, {
  filtroTipo = '',
  filtroCategoria = '',
  filtroEssencialidade = '',
  filtroContaId = '',
} = {}) {
  const mesesFatura = mesesReferenciaNoPeriodo(dataInicio, dataFim);

  const filtrosComuns = {
    tipo:          filtroTipo          || null,
    categoria:     filtroCategoria     || null,
    essencialidade: filtroEssencialidade || null,
  };

  // Quando o usuário filtra por uma conta específica, faz sentido excluir cartão:
  // transações de cartão não têm conta_id, então aplicar o filtro zeraria o
  // sub-query B — melhor pulá-lo completamente e deixar claro que "só essa conta"
  // significa somente transações de conta.
  const incluirCartao = !filtroContaId;

  return {
    mesesFatura,
    filtrosComuns,
    filtroContaId: filtroContaId || null,
    incluirCartao,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXECUÇÃO — recebe o cliente supabase como parâmetro (não importa do módulo)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca transações no regime de competência para relatórios de gasto.
 *
 * Executa dois sub-queries em paralelo e concatena os resultados:
 *   (A) Transações de conta — filtradas por `data` no intervalo [dataInicio, dataFim]
 *   (B) Compras de cartão   — filtradas por `mes_fatura` nos meses que cobrem o período
 *
 * Exclui de ambos: fatura (origem='fatura') e transferências (transferencia_id preenchido).
 *
 * @param {object} supabase    Cliente Supabase já instanciado
 * @param {object} opcoes
 * @param {string} opcoes.entidadeId
 * @param {string} opcoes.dataInicio        'YYYY-MM-DD'
 * @param {string} opcoes.dataFim           'YYYY-MM-DD'
 * @param {string} [opcoes.filtroTipo]      'entrada' | 'saida' | '' (omitido = todos)
 * @param {string} [opcoes.filtroCategoria]
 * @param {string} [opcoes.filtroEssencialidade]
 * @param {string} [opcoes.filtroContaId]   Se presente, sub-query B (cartão) é pulado
 * @returns {Promise<object[]>}  Array unificado, ordenado por data desc
 */
export async function buscarTransacoesCompetencia(supabase, {
  entidadeId,
  dataInicio,
  dataFim,
  filtroTipo = '',
  filtroCategoria = '',
  filtroEssencialidade = '',
  filtroContaId = '',
} = {}) {
  const { mesesFatura, filtrosComuns, incluirCartao } = derivarParametrosCompetencia(
    dataInicio,
    dataFim,
    { filtroTipo, filtroCategoria, filtroEssencialidade, filtroContaId },
  );

  // Sub-query A: transações de conta, filtradas por data
  let queryA = supabase
    .from('transacoes')
    .select(SELECT)
    .eq('entidade_id', entidadeId)
    .is('cartao_id', null)
    .is('transferencia_id', null)
    .neq('origem', 'fatura')
    .gte('data', dataInicio)
    .lte('data', dataFim);

  if (filtrosComuns.tipo)          queryA = queryA.eq('tipo', filtrosComuns.tipo);
  if (filtrosComuns.categoria)     queryA = queryA.eq('categoria', filtrosComuns.categoria);
  if (filtrosComuns.essencialidade) queryA = queryA.eq('essencialidade', filtrosComuns.essencialidade);
  if (filtroContaId)               queryA = queryA.eq('conta_id', filtroContaId);

  // Sub-query B: compras de cartão, filtradas por mes_fatura (competência).
  // Pulado quando filtroContaId está presente — ver nota em derivarParametrosCompetencia.
  let promiseB = Promise.resolve({ data: [] });
  if (incluirCartao && mesesFatura.length > 0) {
    let queryB = supabase
      .from('transacoes')
      .select(SELECT)
      .eq('entidade_id', entidadeId)
      .not('cartao_id', 'is', null)
      .is('transferencia_id', null)
      .neq('origem', 'fatura')
      .in('mes_fatura', mesesFatura);

    if (filtrosComuns.tipo)          queryB = queryB.eq('tipo', filtrosComuns.tipo);
    if (filtrosComuns.categoria)     queryB = queryB.eq('categoria', filtrosComuns.categoria);
    if (filtrosComuns.essencialidade) queryB = queryB.eq('essencialidade', filtrosComuns.essencialidade);

    promiseB = queryB;
  }

  const [{ data: txsConta }, { data: txsCartao }] = await Promise.all([queryA, promiseB]);

  const todas = [...(txsConta || []), ...(txsCartao || [])];
  // Ordena por data desc (campo 'data' existe em todas as transações — para
  // cartão é a data da compra, não do mes_fatura).
  todas.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return todas;
}
