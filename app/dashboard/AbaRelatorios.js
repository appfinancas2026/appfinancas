'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { formatarMoeda } from '../../lib/financeiro';

// Carregamento sob demanda: os gráficos (recharts) só entram no bundle quando
// a aba Relatórios é aberta, não no carregamento inicial do app.
const GraficoComparativoPFPJ = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoComparativoPFPJ), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });
const GraficoEntradasSaidas = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoEntradasSaidas), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });
const GraficoEvolucaoPatrimonio = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoEvolucaoPatrimonio), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });
const GraficoDespesasPorCategoria = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoDespesasPorCategoria), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });

const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function AbaRelatorios({
  entidadeAtualObj,
  salvarMesInicioControle,
  exportarMesCSV,
  exportarAnoCSV,
  exportarPDF,
  comparativoPFPJ,
  dataAtual,
  totalEntradasMes,
  totalSaidasMes,
  resultadoMes,
  margemMes,
  despesasPagasMes,
  totalDespesasPagasMes,
  despesasAbertoMes,
  totalDespesasAbertoMes,
  receitasRecebidasMes,
  totalReceitasRecebidasMes,
  receitasAbertoMes,
  totalReceitasAbertoMes,
  pendenciasVencidas,
  confirmarOcorrencia,
  lancamentosFixos,
  dadosBarras,
  indicesMesesVisiveis,
  resumoAnual,
  evolucaoPatrimonio,
  despesasPorCategoria,
  saidasFixasMes,
  saidasVariaveisMes,
  pctFixas,
  pctRendaComprometida,
  corComprometimento,
  despesasEssenciais,
  despesasDesejaveis,
  despesasSuperfluas,
  despesasNaoClassificadas,
  compromissosFuturos,
  totalCompromissosFuturos,
  maioresLancamentos,
}) {
  const [mostrarTabelaAnual, setMostrarTabelaAnual] = useState(false);

  return (
    <>
      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="card-title" style={{ marginRight: 4 }}>Considerando dados a partir de</span>
        <input
          className="input"
          type="month"
          style={{ width: 160 }}
          value={entidadeAtualObj?.mes_inicio_controle ? entidadeAtualObj.mes_inicio_controle.slice(0, 7) : ''}
          onChange={(e) => salvarMesInicioControle(e.target.value)}
        />
        {entidadeAtualObj?.mes_inicio_controle && (
          <button onClick={() => salvarMesInicioControle('')} className="btn-link">usar detecção automática</button>
        )}
        <p className="empty-hint" style={{ margin: 0, width: '100%' }}>
          Meses anteriores a essa data ficam fora dos relatórios, mas continuam acessíveis navegando pelo Painel.
        </p>
      </div>

      <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="card-title" style={{ marginRight: 4 }}>Exportar</span>
        <button onClick={exportarMesCSV} className="btn btn-ghost">CSV do mês</button>
        <button onClick={exportarAnoCSV} className="btn btn-ghost">CSV do ano</button>
        <button onClick={exportarPDF} className="btn btn-ghost">PDF do mês</button>
      </div>

      {comparativoPFPJ.length > 1 && (
        <div className="card">
          <p className="card-title" style={{ marginBottom: 4 }}>Comparativo PF x PJ — {NOMES_MESES[dataAtual.mes]}</p>
          <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Quanto cada entidade recebeu e gastou neste mês.</p>
          <GraficoComparativoPFPJ dados={comparativoPFPJ} />
        </div>
      )}

      <div className="card">
        <p className="card-title" style={{ marginBottom: 12 }}>Resumo do mês — {NOMES_MESES[dataAtual.mes]}</p>
        <div className="row row-main"><span className="row-title">Receitas</span><span className="amount amount-positive">{formatarMoeda(totalEntradasMes)}</span></div>
        <div className="row row-main"><span className="row-title">Despesas</span><span className="amount">{formatarMoeda(totalSaidasMes)}</span></div>
        <div className="row row-main">
          <span className="row-title" style={{ fontWeight: 700 }}>Resultado</span>
          <span className="amount" style={{ fontSize: 18, color: resultadoMes >= 0 ? 'var(--primary)' : 'var(--negative)' }}>{formatarMoeda(resultadoMes)}</span>
        </div>
        {totalEntradasMes > 0 && (
          <p className="empty-hint" style={{ marginTop: 6, marginBottom: 12 }}>Margem: {margemMes.toFixed(1)}% da receita</p>
        )}
        <div style={{ borderTop: '1px solid var(--surface-alt)', paddingTop: 8, display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13 }}>
          <span>Despesas pagas: {despesasPagasMes.length} · <strong>{formatarMoeda(totalDespesasPagasMes)}</strong></span>
          <span>Despesas em aberto: {despesasAbertoMes.length} · <strong>{formatarMoeda(totalDespesasAbertoMes)}</strong></span>
          <span>Receitas recebidas: {receitasRecebidasMes.length} · <strong>{formatarMoeda(totalReceitasRecebidasMes)}</strong></span>
          <span>Receitas a receber: {receitasAbertoMes.length} · <strong>{formatarMoeda(totalReceitasAbertoMes)}</strong></span>
        </div>
      </div>

      {pendenciasVencidas.length > 0 && (
        <div className="card card-despesas">
          <p className="card-title" style={{ marginBottom: 4 }}>Atrasadas</p>
          <p className="empty-hint" style={{ marginTop: 0, marginBottom: 10 }}>Contas fixas de meses anteriores que nunca foram confirmadas.</p>
          {pendenciasVencidas.map((o) => (
            <div key={o.id} className="row row-main">
              <div>
                <p className="row-title">{o.lancamentos_fixos?.nome}</p>
                <p className="row-subtitle">referente a {o.mes_referencia.slice(0, 7)}</p>
              </div>
              <div className="row-actions">
                <span className="amount">{formatarMoeda(o.valor)}</span>
                <button
                  onClick={() => confirmarOcorrencia({ id: o.lancamento_fixo_id, tipo: o.lancamentos_fixos?.tipo, nome: o.lancamentos_fixos?.nome }, o)}
                  className="btn btn-primary"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                >
                  Confirmar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <p className="card-title" style={{ marginBottom: 4 }}>Entradas x saídas — {dataAtual.ano}</p>
        <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Transferências entre contas não entram nesse total.</p>
        <GraficoEntradasSaidas dados={dadosBarras} />
        <button onClick={() => setMostrarTabelaAnual((v) => !v)} className="btn-link" style={{ marginTop: 10 }}>
          {mostrarTabelaAnual ? 'ocultar detalhamento mês a mês' : 'ver detalhamento mês a mês'}
        </button>
        {mostrarTabelaAnual && (
          indicesMesesVisiveis.length === 0 ? (
            <p className="empty-hint" style={{ marginTop: 10 }}>Nenhuma movimentação registrada até {dataAtual.ano}.</p>
          ) : (
            <table className="report-table" style={{ marginTop: 10 }}>
              <thead>
                <tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo do mês</th></tr>
              </thead>
              <tbody>
                {indicesMesesVisiveis.map((i) => {
                  const m = resumoAnual[i];
                  const saldoMes = m.entradas - m.saidas;
                  return (
                    <tr key={i}>
                      <td>{NOMES_MESES[i]}</td>
                      <td style={{ color: 'var(--primary)' }}>{formatarMoeda(m.entradas)}</td>
                      <td>{formatarMoeda(m.saidas)}</td>
                      <td style={{ fontWeight: 600, color: saldoMes >= 0 ? 'var(--primary)' : 'var(--negative)' }}>{formatarMoeda(saldoMes)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        )}
      </div>

      {evolucaoPatrimonio.length > 1 && (
        <div className="card">
          <p className="card-title" style={{ marginBottom: 4 }}>Evolução do patrimônio — {dataAtual.ano}</p>
          <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Soma do saldo de todas as contas ao fim de cada mês.</p>
          <GraficoEvolucaoPatrimonio dados={evolucaoPatrimonio} />
        </div>
      )}

      <div className="card">
        <p className="card-title">Despesas por categoria — {NOMES_MESES[dataAtual.mes]}</p>
        {despesasPorCategoria.length === 0 ? (
          <p className="empty-hint">Nenhuma despesa neste mês ainda.</p>
        ) : (
          <GraficoDespesasPorCategoria dados={despesasPorCategoria} />
        )}
      </div>

      <div className="card">
        <p className="card-title" style={{ marginBottom: 12 }}>Perfil de gastos — {NOMES_MESES[dataAtual.mes]}</p>
        {totalSaidasMes === 0 ? (
          <p className="empty-hint">Nenhuma despesa neste mês ainda.</p>
        ) : (
          <>
            <p className="row-subtitle" style={{ margin: '0 0 6px' }}>Fixas x variáveis</p>
            <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${pctFixas}%`, background: 'var(--negative)' }} />
              <div style={{ width: `${100 - pctFixas}%`, background: 'var(--accent)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 18, fontSize: 13 }}>
              <span>🔴 Fixas — {formatarMoeda(saidasFixasMes)} ({pctFixas.toFixed(0)}%)</span>
              <span>🟡 Variáveis — {formatarMoeda(saidasVariaveisMes)} ({(100 - pctFixas).toFixed(0)}%)</span>
            </div>

            <p className="row-subtitle" style={{ margin: '0 0 6px' }}>Essencialidade</p>
            {totalEntradasMes > 0 && (
              <p style={{ fontSize: 13, margin: '0 0 8px', color: corComprometimento, fontWeight: 600 }}>
                {pctRendaComprometida.toFixed(0)}% da renda comprometida com despesas essenciais
                {pctRendaComprometida > 70 && ' — acima do recomendado (até ~50%)'}
              </p>
            )}
            <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${(despesasEssenciais / totalSaidasMes) * 100}%`, background: 'var(--primary)' }} />
              <div style={{ width: `${(despesasDesejaveis / totalSaidasMes) * 100}%`, background: 'var(--accent)' }} />
              <div style={{ width: `${(despesasSuperfluas / totalSaidasMes) * 100}%`, background: 'var(--negative)' }} />
              <div style={{ width: `${(despesasNaoClassificadas / totalSaidasMes) * 100}%`, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8, fontSize: 12 }}>
              <span>🟢 Essencial — {formatarMoeda(despesasEssenciais)}</span>
              <span>🟡 Desejável — {formatarMoeda(despesasDesejaveis)}</span>
              <span>🔴 Supérfluo — {formatarMoeda(despesasSuperfluas)}</span>
              {despesasNaoClassificadas > 0 && <span style={{ color: 'var(--text-muted)' }}>⚪ Não classificado — {formatarMoeda(despesasNaoClassificadas)}</span>}
            </div>
          </>
        )}
      </div>

      {compromissosFuturos.length > 0 && (
        <div className="card">
          <p className="card-title" style={{ marginBottom: 4 }}>Compromissos futuros em parcelas</p>
          <p className="empty-hint" style={{ marginTop: 0, marginBottom: 10 }}>Quanto ainda falta pagar nas despesas parceladas em andamento, a partir de hoje.</p>
          <p className="amount amount-hero" style={{ color: 'var(--negative)' }}>{formatarMoeda(totalCompromissosFuturos)}</p>
          {compromissosFuturos.map((item) => (
            <div key={item.fixo.id} className="row row-main">
              <span className="row-title">{item.fixo.nome}</span>
              <span className="row-subtitle">{item.restantes} parcela(s) restante(s) · {formatarMoeda(item.total)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <p className="card-title" style={{ marginBottom: 4 }}>Maiores lançamentos — {NOMES_MESES[dataAtual.mes]}</p>
        {maioresLancamentos.length === 0 ? (
          <p className="empty-hint">Nenhum lançamento neste mês ainda.</p>
        ) : (
          maioresLancamentos.map((t) => (
            <div key={t.id} className="row row-main">
              <div>
                <p className="row-title">{t.descricao || t.categoria}</p>
                <p className="row-subtitle">{t.categoria} · {t.data}</p>
              </div>
              <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>{formatarMoeda(t.valor)}</span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
