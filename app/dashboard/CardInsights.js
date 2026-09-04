'use client';

import { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { gerarInsights, projetarSaldoDiario } from '../../lib/insights';
import { primeiroDiaDoMes, ultimoDiaDoMes, subtrairMeses, calcularPeriodoFaturaAberta, mesReferenciaStr } from '../../lib/financeiro';
import { buscarTransacoesCompetencia } from '../../lib/buscaRelatorios';
import { calcularFaturasCartao } from '../../lib/faturas';
import { getLicao } from '../../lib/licoes';

// Marcador de cor por tipo (mesma semântica do resto do app).
const COR_TIPO = {
  alta: 'var(--accent)',           // laranja/âmbar — atenção
  risco: 'var(--negative)',        // vermelho — risco
  oportunidade: 'var(--primary)',  // verde — oportunidade
};

export default function CardInsights({ entidadeAtual, contas, cartoes, lancamentosFixos, dataAtual, onNavegar, dividas }) {
  const [insights, setInsights] = useState([]);
  // Índice do insight com lição expandida (null = nenhum).
  const [expandido, setExpandido] = useState(null);

  useEffect(() => {
    let cancelado = false;

    async function carregar() {
      if (!entidadeAtual) { setInsights([]); return; }
      const { ano, mes } = dataAtual;

      // Períodos para as buscas de competência (regras de gasto).
      const ini = subtrairMeses(ano, mes, 3);
      const fim = subtrairMeses(ano, mes, 1);
      const hoje = new Date().toISOString().slice(0, 10);
      const inicioMedia = new Date();
      inicioMedia.setDate(inicioMedia.getDate() - 90);

      // Busca em paralelo: mês atual + histórico 3 meses (competência) + variáveis 90d (caixa p/ projeção).
      const [txsMesAtual, transacoesHistorico, { data: txsVar }] = await Promise.all([
        buscarTransacoesCompetencia(supabase, {
          entidadeId: entidadeAtual,
          dataInicio: primeiroDiaDoMes(ano, mes),
          dataFim: ultimoDiaDoMes(ano, mes),
        }),
        buscarTransacoesCompetencia(supabase, {
          entidadeId: entidadeAtual,
          dataInicio: primeiroDiaDoMes(ini.ano, ini.mes),
          dataFim: ultimoDiaDoMes(fim.ano, fim.mes),
        }),
        supabase
          .from('transacoes')
          .select('valor')
          .eq('entidade_id', entidadeAtual)
          .eq('tipo', 'saida')
          .is('transferencia_id', null)
          .neq('origem', 'recorrente')
          .gte('data', inicioMedia.toISOString().slice(0, 10))
          .lte('data', hoje),
      ]);

      const saldoInicial = (contas || []).reduce((s, c) => s + Number(c.saldo_atual || 0), 0);
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
        transacoesMes: txsMesAtual,
        transacoesHistorico,
        projecaoFluxo,
        lancamentosFixos: lancamentosFixos || [],
        dataAtual,
        cartoes: infoCartoes,
        saldoEmConta: saldoInicial,
        dividas: dividas || [],
      });

      if (!cancelado) {
        setInsights(resultado);
        setExpandido(null);
      }
    }

    carregar();
    return () => { cancelado = true; };
  }, [entidadeAtual, dataAtual.ano, dataAtual.mes, contas, cartoes, lancamentosFixos]);

  if (insights.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="card-header" style={{ marginBottom: 12 }}>
        <span className="card-title-group">
          <span className="card-icon"><Lightbulb size={16} /></span>
          <p className="card-title">Insights da semana</p>
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {insights.map((ins, i) => {
          const licao = getLicao(ins.licaoId);
          const aberto = expandido === i;
          return (
            <div
              key={i}
              role={ins.destino ? 'button' : undefined}
              tabIndex={ins.destino ? 0 : undefined}
              onClick={ins.destino ? () => onNavegar?.(ins.destino, ins.subaba) : undefined}
              onKeyDown={ins.destino ? (e) => { if (e.key === 'Enter') onNavegar?.(ins.destino, ins.subaba); } : undefined}
              style={{
                padding: '10px 0',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                cursor: ins.destino ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span
                  aria-hidden="true"
                  style={{ width: 8, height: 8, borderRadius: '50%', background: COR_TIPO[ins.tipo] || 'var(--text-muted)', flexShrink: 0, marginTop: 6 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 'var(--text-md)', lineHeight: 1.5 }}>{ins.texto}</p>
                  {licao && (
                    <button
                      aria-expanded={aberto}
                      aria-label={aberto ? 'Recolher explicação' : 'Saiba mais sobre este insight'}
                      onClick={(e) => { e.stopPropagation(); setExpandido(aberto ? null : i); }}
                      style={{
                        marginTop: 4,
                        background: 'none', border: 'none', padding: 0,
                        fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
                        cursor: 'pointer', textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                    >
                      {aberto ? 'recolher' : 'entenda'}
                    </button>
                  )}
                  {aberto && licao && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: '10px 12px',
                        background: 'var(--surface-2, var(--border))',
                        borderRadius: 8,
                        borderLeft: '3px solid var(--border)',
                      }}
                    >
                      <p style={{ margin: '0 0 4px', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary, var(--text-muted))' }}>
                        {licao.titulo}
                      </p>
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                        {licao.texto}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
