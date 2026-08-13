// Lógica pura de projeção de comprometimento futuro.
//
// Recebe dados já filtrados (sem acesso a banco) e calcula quanto das parcelas
// restantes (fixas parceladas + compras de cartão) cai em cada mês à frente.
// Sem supabase, sem React, sem Date.now() — anoAtual/mesAtual chegam como parâmetro.

import { calcularParcela, mesReferenciaStr, subtrairMeses } from './financeiro.js';

// Parcelas restantes de uma fixa parcelada a partir de anoAtual/mesAtual (inclusive).
// Usa calcularParcela como autoridade; o diff inline só distingue "antes" de "depois"
// quando calcularParcela retorna null (sem reimplementar a lógica principal).
function restantesFuturas(fixo, anoAtual, mesAtual) {
  const parcelaAtual = calcularParcela(fixo, anoAtual, mesAtual);
  if (parcelaAtual !== null) {
    return fixo.total_parcelas - parcelaAtual + 1;
  }
  // calcularParcela retornou null: série ainda não começou (mes_inicio no futuro)
  // ou já terminou. Distingue pelo sinal do diff.
  const mesRefAtual = mesReferenciaStr(anoAtual, mesAtual); // 'YYYY-MM-01'
  return fixo.mes_inicio > mesRefAtual ? Number(fixo.total_parcelas) : 0;
}

/**
 * Projeta comprometimento futuro somando parcelas de fixas parceladas e compras
 * de cartão parceladas.
 *
 * @param {Object[]} fixosParcelados   - Moldes lancamentos_fixos com parcelado=true,
 *                                       tipo='saida'. Campos: total_parcelas, mes_inicio,
 *                                       valor_padrao, nome.
 * @param {Object[]} transacoesCartaoFuturas - Transações de cartão já filtradas
 *                                       (parcela_total not null, mes_fatura >= mês atual).
 *                                       Campos: valor, mes_fatura, parcela_atual,
 *                                       parcela_total, descricao.
 * @param {number}   anoAtual          - Ano de referência (ex: 2026).
 * @param {number}   mesAtual          - Mês 0-based de referência (0 = janeiro).
 * @param {number}   [numMeses=6]      - Quantos meses projetar no porMes (gráfico).
 *
 * @returns {{ total, porMes, maioresParcelas }}
 *   total            — soma de TODAS as parcelas restantes, além do range do gráfico.
 *   porMes           — array de numMeses itens { ano, mes, mesRef:'YYYY-MM', valor }.
 *   maioresParcelas  — top 5 parcelas do PRÓXIMO mês, desc por valor.
 */
export function calcularComprometidoFuturo({
  fixosParcelados = [],
  transacoesCartaoFuturas = [],
  anoAtual,
  mesAtual,
  numMeses = 6,
}) {
  // ── 1. Monta os buckets mensais para o gráfico ──────────────────────────────
  const porMes = [];
  for (let i = 0; i < numMeses; i++) {
    const { ano, mes } = subtrairMeses(anoAtual, mesAtual, -i);
    porMes.push({ ano, mes, mesRef: mesReferenciaStr(ano, mes).slice(0, 7), valor: 0 });
  }

  // ── 2. Acumula fixas nos buckets (usa calcularParcela mês a mês) ─────────────
  for (const fixo of fixosParcelados) {
    for (const bucket of porMes) {
      if (calcularParcela(fixo, bucket.ano, bucket.mes) !== null) {
        bucket.valor += Number(fixo.valor_padrao);
      }
    }
  }

  // ── 3. Acumula transações de cartão nos buckets ───────────────────────────────
  for (const tx of transacoesCartaoFuturas) {
    const txMesRef = tx.mes_fatura.slice(0, 7);
    const bucket = porMes.find((m) => m.mesRef === txMesRef);
    if (bucket) bucket.valor += Number(tx.valor);
  }

  // ── 4. total: TODAS as parcelas restantes, além do range do porMes ───────────
  // porMes é limitado a numMeses (para o gráfico); total é completo.
  const totalFixas = fixosParcelados.reduce(
    (s, fixo) => s + restantesFuturas(fixo, anoAtual, mesAtual) * Number(fixo.valor_padrao),
    0,
  );
  const totalCartao = transacoesCartaoFuturas.reduce((s, t) => s + Number(t.valor), 0);
  const total = totalFixas + totalCartao;

  // ── 5. maioresParcelas: top 5 do PRÓXIMO mês (índice 1, fallback índice 0) ──
  const proximoBucket = porMes[1] ?? porMes[0];
  const candidatos = [];

  if (proximoBucket) {
    for (const fixo of fixosParcelados) {
      const parcela = calcularParcela(fixo, proximoBucket.ano, proximoBucket.mes);
      if (parcela !== null) {
        candidatos.push({
          nome: fixo.nome || '',
          parcela: `${parcela}/${fixo.total_parcelas}`,
          valor: Number(fixo.valor_padrao),
        });
      }
    }

    for (const tx of transacoesCartaoFuturas) {
      if (tx.mes_fatura.slice(0, 7) === proximoBucket.mesRef) {
        candidatos.push({
          nome: tx.descricao || '',
          parcela: tx.parcela_atual != null ? `${tx.parcela_atual}/${tx.parcela_total}` : '',
          valor: Number(tx.valor),
        });
      }
    }
  }

  candidatos.sort((a, b) => b.valor - a.valor);

  return {
    total,
    porMes,
    maioresParcelas: candidatos.slice(0, 5),
  };
}
