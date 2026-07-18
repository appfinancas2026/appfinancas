'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';

const GraficoFluxo = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoFluxo), { ssr: false });

function addDias(dataStr, n) {
  const d = new Date(dataStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatarData(dataStr) {
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}`;
}

function formatarDataCompleta(dataStr) {
  const [ano, mes, dia] = dataStr.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function AbaFluxoCaixa({ entidadeAtual, contas, lancamentosFixos }) {
  const [diasHistorico, setDiasHistorico] = useState(30);
  const [diasProjecao, setDiasProjecao]   = useState(60);
  const [mostrarProjecao, setMostrarProjecao] = useState(true);
  const [carregando, setCarregando]       = useState(false);
  const [fluxo, setFluxo]                 = useState(null);
  const [expandido, setExpandido]         = useState({});

  const calcularFluxo = useCallback(async () => {
    if (!entidadeAtual) return;
    setCarregando(true);

    const hoje = new Date().toISOString().slice(0, 10);
    const inicioHist = addDias(hoje, -(diasHistorico - 1));
    const saldoInicial = contas.reduce((s, c) => s + Number(c.saldo_atual), 0);

    const { data: txs } = await supabase
      .from('transacoes')
      .select('data, tipo, valor, descricao, categoria')
      .eq('entidade_id', entidadeAtual)
      .is('transferencia_id', null)
      .gte('data', inicioHist)
      .lte('data', hoje)
      .order('data', { ascending: true });

    const txsPorDia = {};
    (txs || []).forEach((t) => {
      if (!txsPorDia[t.data]) txsPorDia[t.data] = { entradas: 0, saidas: 0, itens: [] };
      if (t.tipo === 'entrada') txsPorDia[t.data].entradas += Number(t.valor);
      else txsPorDia[t.data].saidas += Number(t.valor);
      txsPorDia[t.data].itens.push(t);
    });

    // Reconstrói saldo histórico partindo do saldo atual e voltando no tempo
    const saldosPorData = { [hoje]: saldoInicial };
    let s = saldoInicial;
    for (let i = 1; i < diasHistorico; i++) {
      const dAtual = addDias(hoje, -i + 1);
      const mov = txsPorDia[dAtual] || {};
      s = s - (mov.entradas || 0) + (mov.saidas || 0);
      saldosPorData[addDias(hoje, -i)] = s;
    }

    const historico = [];
    for (let i = diasHistorico - 1; i >= 0; i--) {
      const data = addDias(hoje, -i);
      const mov = txsPorDia[data] || {};
      historico.push({
        data, label: formatarData(data),
        entradas: mov.entradas || 0,
        saidas: mov.saidas || 0,
        saldo: saldosPorData[data] ?? saldoInicial,
        itens: mov.itens || [],
        ehHoje: data === hoje, ehPassado: data < hoje,
      });
    }

    // Projeção futura com base nos fixos
    const projecao = [];
    if (mostrarProjecao && lancamentosFixos?.length > 0) {
      let saldoProj = saldoInicial;
      for (let i = 1; i <= diasProjecao; i++) {
        const data = addDias(hoje, i);
        const diaDoMes = parseInt(data.split('-')[2], 10);
        const fixosDoDia = lancamentosFixos.filter((f) => !f.parcelado && f.dia_referencia === diaDoMes);
        const entradas = fixosDoDia.filter((f) => f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor_padrao), 0);
        const saidas   = fixosDoDia.filter((f) => f.tipo === 'saida').reduce((s, f) => s + Number(f.valor_padrao), 0);
        saldoProj += entradas - saidas;
        if (entradas > 0 || saidas > 0 || i % 7 === 0) {
          projecao.push({
            data, label: formatarData(data), entradas, saidas, saldo: saldoProj,
            itens: fixosDoDia.map((f) => ({ descricao: f.nome, tipo: f.tipo, valor: f.valor_padrao })),
            ehProjecao: true,
          });
        }
      }
    }

    const tudo = [...historico, ...projecao];
    const totalEntradas = historico.reduce((s, d) => s + d.entradas, 0);
    const totalSaidas   = historico.reduce((s, d) => s + d.saidas, 0);
    const menorSaldo    = tudo.length ? Math.min(...tudo.map((d) => d.saldo)) : saldoInicial;
    const diasNegativos = tudo.filter((d) => d.saldo < 0);

    setFluxo({ historico, projecao, tudo, saldoInicial, totalEntradas, totalSaidas, menorSaldo, diasNegativos });
    setCarregando(false);
  }, [entidadeAtual, contas, lancamentosFixos, diasHistorico, diasProjecao, mostrarProjecao]);

  useEffect(() => { calcularFluxo(); }, [calcularFluxo]);

  if (!entidadeAtual) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ font: `var(--weight-semibold) var(--text-xl) var(--font-display)`, margin: '0 0 2px' }}>Fluxo de Caixa</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>Evolução do saldo e projeção com base nos lançamentos fixos.</p>
        </div>
        <button onClick={() => setMostrarProjecao((v) => !v)} className={`btn ${mostrarProjecao ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 'var(--text-sm)' }}>
          {mostrarProjecao ? '✓ Projeção ativa' : 'Mostrar projeção'}
        </button>
      </div>

      <div className="card" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Histórico</span>
          {[15, 30, 60, 90].map((n) => (
            <button key={n} onClick={() => setDiasHistorico(n)} className={`pill ${diasHistorico === n ? 'pill-active' : ''}`}>{n}d</button>
          ))}
        </div>
        {mostrarProjecao && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Projeção</span>
            {[30, 60, 90].map((n) => (
              <button key={n} onClick={() => setDiasProjecao(n)} className={`pill ${diasProjecao === n ? 'pill-active' : ''}`}>{n}d</button>
            ))}
          </div>
        )}
      </div>

      {carregando && <div className="card" style={{ textAlign: 'center', padding: 32 }}><p className="empty-hint">Calculando fluxo...</p></div>}

      {fluxo && !carregando && (
        <>
          <div className="relatorio-kpis">
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Saldo atual</p>
              <p className={`relatorio-kpi-valor ${fluxo.saldoInicial >= 0 ? 'positivo' : 'negativo'}`}>{formatarMoeda(fluxo.saldoInicial)}</p>
              <p className="relatorio-kpi-var">{contas.length} conta(s)</p>
            </div>
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Entradas ({diasHistorico}d)</p>
              <p className="relatorio-kpi-valor positivo">{formatarMoeda(fluxo.totalEntradas)}</p>
            </div>
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Saídas ({diasHistorico}d)</p>
              <p className="relatorio-kpi-valor">{formatarMoeda(fluxo.totalSaidas)}</p>
            </div>
            <div className={`relatorio-kpi ${fluxo.diasNegativos.length > 0 ? '' : 'destaque'}`}>
              <p className="relatorio-kpi-label">{fluxo.diasNegativos.length > 0 ? '⚠️ Menor saldo' : '✅ Menor saldo'}</p>
              <p className={`relatorio-kpi-valor ${fluxo.menorSaldo < 0 ? 'negativo' : 'positivo'}`}>{formatarMoeda(fluxo.menorSaldo)}</p>
              {fluxo.diasNegativos.length > 0 && <p className="relatorio-kpi-var" style={{ color: 'var(--negative)' }}>{fluxo.diasNegativos.length} dia(s) no vermelho</p>}
            </div>
          </div>

          {fluxo.diasNegativos.length > 0 && (
            <div style={{ background: 'var(--negative-tint)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 'var(--weight-semibold)', color: 'var(--negative)' }}>⚠️ Atenção: saldo negativo previsto</p>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                {fluxo.diasNegativos.filter((d) => d.ehProjecao).length > 0
                  ? `A projeção indica saldo negativo em ${fluxo.diasNegativos.filter((d) => d.ehProjecao).length} dia(s) nos próximos ${diasProjecao} dias.`
                  : `Houve saldo negativo em ${fluxo.diasNegativos.length} dia(s) nos últimos ${diasHistorico} dias.`}
              </p>
            </div>
          )}

          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Evolução do saldo</p>
            <p className="empty-hint" style={{ margin: '0 0 12px' }}>Linha sólida = histórico real · Tracejada = projeção</p>
            <GraficoFluxo dados={fluxo.tudo} />
          </div>

          <div className="card">
            <p className="card-title" style={{ marginBottom: 12 }}>Movimentos dia a dia</p>
            {fluxo.tudo.filter((d) => d.entradas > 0 || d.saidas > 0 || d.ehHoje).map((dia) => (
              <div key={dia.data} style={{ borderBottom: '1px solid var(--surface-alt)' }}>
                <div
                  className={`fluxo-linha${dia.ehHoje ? ' fluxo-hoje' : ''}${dia.ehProjecao ? ' fluxo-projecao' : ''}`}
                  onClick={() => dia.itens.length > 0 && setExpandido((p) => ({ ...p, [dia.data]: !p[dia.data] }))}
                  style={{ cursor: dia.itens.length > 0 ? 'pointer' : 'default' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {dia.itens.length > 0 && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{expandido[dia.data] ? '▾' : '▸'}</span>}
                    <span style={{ fontSize: 'var(--text-md)', fontWeight: dia.ehHoje ? 'var(--weight-semibold)' : 'inherit' }}>{formatarDataCompleta(dia.data)}</span>
                    {dia.ehHoje && <span style={{ fontSize: 'var(--text-xs)', background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 999 }}>hoje</span>}
                    {dia.ehProjecao && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>projeção</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    {dia.entradas > 0 && <span style={{ color: 'var(--primary)', fontSize: 'var(--text-sm)' }}>+{formatarMoeda(dia.entradas)}</span>}
                    {dia.saidas > 0 && <span style={{ color: 'var(--negative)', fontSize: 'var(--text-sm)' }}>−{formatarMoeda(dia.saidas)}</span>}
                    <span style={{ fontWeight: 'var(--weight-semibold)', color: dia.saldo < 0 ? 'var(--negative)' : 'inherit', fontVariantNumeric: 'tabular-nums', minWidth: 100, textAlign: 'right' }}>
                      {formatarMoeda(dia.saldo)}
                    </span>
                  </div>
                </div>
                {expandido[dia.data] && (
                  <div style={{ padding: '4px 24px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {dia.itens.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                        <span>{item.descricao || item.nome || item.categoria || '—'}</span>
                        <span style={{ color: item.tipo === 'entrada' ? 'var(--primary)' : 'var(--negative)' }}>
                          {item.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(item.valor || item.valor_padrao)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {mostrarProjecao && (!lancamentosFixos || lancamentosFixos.length === 0) && (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
              <p className="empty-hint">Cadastre receitas e despesas fixas no Painel para ver a projeção de fluxo.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
