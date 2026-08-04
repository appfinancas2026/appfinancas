'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { gerarInsights, projetarSaldoDiario } from '../../lib/insights';
import { primeiroDiaDoMes, ultimoDiaDoMes, subtrairMeses, calcularPeriodoFaturaAberta, mesReferenciaStr } from '../../lib/financeiro';
import { calcularFaturasCartao } from '../../lib/faturas';

// Marcador de cor por tipo (mesma semântica do resto do app).
const COR_TIPO = {
  alta: 'var(--accent)',           // laranja/âmbar — atenção
  risco: 'var(--negative)',        // vermelho — risco
  oportunidade: 'var(--primary)',  // verde — oportunidade
};

export default function CardInsights({ entidadeAtual, contas, cartoes, lancamentosFixos, dataAtual, transacoesMes }) {
  const [insights, setInsights] = useState([]);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!entidadeAtual) { setInsights([]); return; }
      const { ano, mes } = dataAtual;

      // Transações dos 3 meses anteriores ao mês exibido.
      const ini = subtrairMeses(ano, mes, 3);
      const fim = subtrairMeses(ano, mes, 1);
      const { data: historico } = await supabase
        .from('transacoes')
        .select('data, tipo, valor, categoria, essencialidade, transferencia_id')
        .eq('entidade_id', entidadeAtual)
        .is('transferencia_id', null)
        .or('cartao_id.is.null,origem.eq.fatura')
        .gte('data', primeiroDiaDoMes(ini.ano, ini.mes))
        .lte('data', ultimoDiaDoMes(fim.ano, fim.mes));

      // Projeção de 30 dias — mesma base do fluxo de caixa.
      const hoje = new Date().toISOString().slice(0, 10);
      const saldoInicial = (contas || []).reduce((s, c) => s + Number(c.saldo_atual || 0), 0);

      const inicioMedia = new Date();
      inicioMedia.setDate(inicioMedia.getDate() - 90);
      const { data: txsVar } = await supabase
        .from('transacoes')
        .select('valor')
        .eq('entidade_id', entidadeAtual)
        .eq('tipo', 'saida')
        .is('transferencia_id', null)
        .neq('origem', 'recorrente')
        .gte('data', inicioMedia.toISOString().slice(0, 10))
        .lte('data', hoje);
      const mediaDiariaVariavel = (txsVar || []).reduce((s, t) => s + Number(t.valor || 0), 0) / 90;

      const projecaoFluxo = projetarSaldoDiario({
        saldoInicial,
        lancamentosFixos: lancamentosFixos || [],
        dias: 30,
        mediaDiariaVariavel,
        hoje,
      });

      // Cartões — fatura aberta/fechada + histórico p/ média (dados puros p/ os insights).
      const hojeDate = new Date();
      const infoCartoes = await Promise.all((cartoes || []).map(async (cartao) => {
        const aberta = calcularPeriodoFaturaAberta(cartao, hojeDate);
        const maisAntigo = subtrairMeses(aberta.ano, aberta.mes, 6);
        const { data: txsCartao } = await supabase
          .from('transacoes')
          .select('valor, mes_fatura, origem')
          .eq('cartao_id', cartao.id)
          .gte('mes_fatura', mesReferenciaStr(maisAntigo.ano, maisAntigo.mes))
          .lte('mes_fatura', mesReferenciaStr(aberta.ano, aberta.mes));

        const { aberta: fa, fechada: ff } = calcularFaturasCartao(cartao, txsCartao || [], hojeDate);

        // Histórico: total por fatura dos meses anteriores à fechada (só compras).
        const totaisPorMes = {};
        (txsCartao || []).filter((t) => t.origem !== 'fatura').forEach((t) => {
          totaisPorMes[t.mes_fatura] = (totaisPorMes[t.mes_fatura] || 0) + Number(t.valor || 0);
        });
        const historicoFaturas = Object.keys(totaisPorMes)
          .filter((m) => m < ff.mesRef)
          .sort()
          .map((m) => totaisPorMes[m]);

        return {
          nome: cartao.nome,
          faturaAberta: fa.total,
          faturaFechadaNaoPaga: ff.paga ? 0 : ff.total,
          faturaAtual: ff.total,
          historicoFaturas,
          limite: (cartao.limite != null && cartao.limite !== '') ? Number(cartao.limite) : null,
        };
      }));

      const resultado = gerarInsights({
        transacoesMes: transacoesMes || [],
        transacoesHistorico: historico || [],
        projecaoFluxo,
        lancamentosFixos: lancamentosFixos || [],
        dataAtual,
        cartoes: infoCartoes,
        saldoEmConta: saldoInicial,
      });

      if (!cancelado) setInsights(resultado);
    }

    carregar();
    return () => { cancelado = true; };
  }, [entidadeAtual, dataAtual.ano, dataAtual.mes, transacoesMes, contas, cartoes, lancamentosFixos]);

  if (insights.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <span className="card-title-group">
          <span className="card-icon">💡</span>
          <p className="card-title">Insights da semana</p>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {insights.map((ins, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 0',
              borderTop: i > 0 ? '1px solid var(--border)' : 'none',
            }}
          >
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, borderRadius: '50%', background: COR_TIPO[ins.tipo] || 'var(--text-muted)', flexShrink: 0, marginTop: 6 }}
            />
            <p style={{ margin: 0, fontSize: 'var(--text-md)', lineHeight: 1.5 }}>{ins.texto}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
