'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronRight, ArrowDown, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';

const NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

function hoje() { return new Date().toISOString().slice(0, 10); }
function primeiroDia(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; }
function ultimoDia(d = new Date()) { return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0, 10); }
function mesesAtras(n) { const d = new Date(); d.setMonth(d.getMonth()-n+1); d.setDate(1); return d.toISOString().slice(0,10); }
function anoAtual() { return new Date().getFullYear(); }

const PERIODOS = [
  { label: 'Este mês',        de: () => primeiroDia(),                           ate: () => ultimoDia() },
  { label: 'Mês anterior',    de: () => { const d=new Date(); d.setMonth(d.getMonth()-1); return primeiroDia(d); }, ate: () => { const d=new Date(); d.setMonth(d.getMonth()-1); return ultimoDia(d); } },
  { label: 'Últimos 3 meses', de: () => mesesAtras(3),                           ate: () => ultimoDia() },
  { label: 'Últimos 6 meses', de: () => mesesAtras(6),                           ate: () => ultimoDia() },
  { label: `Ano ${anoAtual()}`,de: () => `${anoAtual()}-01-01`,                  ate: () => `${anoAtual()}-12-31` },
  { label: 'Personalizado',   de: null, ate: null },
];

// ── Linha do DRE ────────────────────────────────────────────────────────────
function Linha({ label, valor, valorAnt, nivel = 0, destaque = false, tipo = 'normal', expandivel = false, expandido = false, onToggle, children }) {
  const cor = tipo === 'positivo' ? 'var(--primary)'
    : tipo === 'negativo' ? 'var(--negative)'
    : tipo === 'resultado' ? (valor >= 0 ? 'var(--primary)' : 'var(--negative)')
    : 'inherit';

  const variacao = valorAnt !== undefined && valorAnt !== 0
    ? ((valor - valorAnt) / Math.abs(valorAnt)) * 100
    : null;

  return (
    <>
      <tr
        className={`dre-linha nivel-${nivel} ${destaque ? 'dre-destaque' : ''} ${expandivel ? 'dre-expandivel' : ''}`}
        onClick={expandivel ? onToggle : undefined}
      >
        <td className="dre-label">
          {expandivel && <span className="dre-chevron">{expandido ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
          <span style={{ paddingLeft: nivel * 16 }}>{label}</span>
        </td>
        <td className="dre-valor" style={{ color: cor, fontWeight: destaque ? 'var(--weight-semibold)' : 'inherit' }}>
          {valor !== 0 ? formatarMoeda(Math.abs(valor)) : '—'}
        </td>
        {valorAnt !== undefined && (
          <td className="dre-valor" style={{ color: 'var(--text-muted)' }}>
            {valorAnt !== 0 ? formatarMoeda(Math.abs(valorAnt)) : '—'}
          </td>
        )}
        {variacao !== null && (
          <td className="dre-variacao" style={{ color: Math.abs(variacao) < 0.1 ? 'var(--text-muted)' : variacao > 0 ? 'var(--primary)' : 'var(--negative)' }}>
            {variacao > 0 ? '▲' : '▼'} {Math.abs(variacao).toFixed(1)}%
          </td>
        )}
        {variacao === null && valorAnt !== undefined && <td />}
      </tr>
      {expandido && children}
    </>
  );
}

// ── Separador ────────────────────────────────────────────────────────────────
function Separador({ label }) {
  return (
    <tr className="dre-separador">
      <td colSpan={4}>{label}</td>
    </tr>
  );
}

export default function AbaDRE({ entidadeAtual, entidades }) {
  const [periodoPre, setPeriodoPre]   = useState(0);
  const [dataInicio, setDataInicio]   = useState(primeiroDia());
  const [dataFim, setDataFim]         = useState(ultimoDia());
  const [comparar, setComparar]       = useState(true);
  const [carregando, setCarregando]   = useState(false);
  const [dre, setDre]                 = useState(null);
 
  // Quais seções estão expandidas
  const [expandidas, setExpandidas] = useState({ receitas: true, essencial: false, desejavel: false, superfluo: false, naoclassif: false });
  function toggle(sec) { setExpandidas((p) => ({ ...p, [sec]: !p[sec] })); }

  function aplicarPeriodo(idx) {
    setPeriodoPre(idx);
    const p = PERIODOS[idx];
    if (p.de && p.ate) { setDataInicio(p.de()); setDataFim(p.ate()); }
  }

  // Período anterior de mesmo tamanho para comparativo
  function periodoAnterior(ini, fim) {
    const dias = (new Date(fim) - new Date(ini)) / 86400000 + 1;
    const fimAnt = new Date(ini); fimAnt.setDate(fimAnt.getDate() - 1);
    const iniAnt = new Date(fimAnt); iniAnt.setDate(iniAnt.getDate() - dias + 1);
    return { de: iniAnt.toISOString().slice(0,10), ate: fimAnt.toISOString().slice(0,10) };
  }

  async function buscarTxs(ini, fim) {
    const { data } = await supabase
      .from('transacoes')
      .select('tipo, valor, categoria, essencialidade, descricao')
      .eq('entidade_id', entidadeAtual)
      .is('transferencia_id', null)
      .gte('data', ini)
      .lte('data', fim);
    return data || [];
  }

  function calcularDRE(txs) {
    const e  = (f) => txs.filter(f).reduce((s,t) => s + Number(t.valor), 0);

    // Receitas por categoria
    const receitasBruta = e((t) => t.tipo === 'entrada');
    const receitasPorCat = {};
    txs.filter((t) => t.tipo === 'entrada').forEach((t) => {
      const c = t.categoria || 'Outras receitas';
      receitasPorCat[c] = (receitasPorCat[c] || 0) + Number(t.valor);
    });

    // Despesas por essencialidade e categoria
    const mkGrupo = (filtro) => {
      const total = e(filtro);
      const porCat = {};
      txs.filter(filtro).forEach((t) => {
        const c = t.categoria || 'Sem categoria';
        porCat[c] = (porCat[c] || 0) + Number(t.valor);
      });
      return { total, porCat };
    };

    const essencial   = mkGrupo((t) => t.tipo==='saida' && t.essencialidade==='essencial');
    const desejavel   = mkGrupo((t) => t.tipo==='saida' && t.essencialidade==='desejavel');
    const superfluo   = mkGrupo((t) => t.tipo==='saida' && t.essencialidade==='superfluo');
    const naoClassif  = mkGrupo((t) => t.tipo==='saida' && !t.essencialidade);
    const totalDespesas = essencial.total + desejavel.total + superfluo.total + naoClassif.total;
    const resultado   = receitasBruta - totalDespesas;

    return { receitasBruta, receitasPorCat, essencial, desejavel, superfluo, naoClassif, totalDespesas, resultado };
  }

  const buscarDados = useCallback(async () => {
    if (!entidadeAtual) return;
    setCarregando(true);
    const txs = await buscarTxs(dataInicio, dataFim);
    const atual = calcularDRE(txs);

    let anterior = null;
    if (comparar) {
      const { de, ate } = periodoAnterior(dataInicio, dataFim);
      const txsAnt = await buscarTxs(de, ate);
      anterior = calcularDRE(txsAnt);
    }

    const nDias = Math.round((new Date(dataFim) - new Date(dataInicio)) / 86400000) + 1;
    setDre({ atual, anterior, nDias });
    setCarregando(false);
  }, [entidadeAtual, dataInicio, dataFim, comparar]);

  useEffect(() => { buscarDados(); }, [buscarDados]);

  function exportarDRE() {
    if (!dre) return;
    const { atual: a, anterior: ant } = dre;
    const linhas = [
      ['DRE — AppFinançasBr', '', ''],
      [`Período: ${dataInicio} a ${dataFim}`, '', ''],
      ['', '', ''],
      ['Item', 'Período atual', ant ? 'Período anterior' : ''],
      ['RECEITA BRUTA', a.receitasBruta, ant?.receitasBruta ?? ''],
      ...Object.entries(a.receitasPorCat).map(([c,v]) => [`  ${c}`, v, ant?.receitasPorCat[c] ?? '']),
      ['(-) DESPESAS ESSENCIAIS', -a.essencial.total, ant ? -ant.essencial.total : ''],
      ['(-) DESPESAS DESEJÁVEIS', -a.desejavel.total, ant ? -ant.desejavel.total : ''],
      ['(-) DESPESAS SUPÉRFLUAS', -a.superfluo.total, ant ? -ant.superfluo.total : ''],
      ['(-) NÃO CLASSIFICADAS', -a.naoClassif.total, ant ? -ant.naoClassif.total : ''],
      ['TOTAL DE DESPESAS', -a.totalDespesas, ant ? -ant.totalDespesas : ''],
      ['RESULTADO DO PERÍODO', a.resultado, ant?.resultado ?? ''],
    ];
    const csv = linhas.map((r) => r.map((v) => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : `"${v}"`).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `DRE_${dataInicio}_${dataFim}.csv`; link.click();
    URL.revokeObjectURL(url);
  }

  const mostrarComp = comparar && dre?.anterior;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ font: `var(--weight-semibold) var(--text-xl) var(--font-display)`, margin: '0 0 2px' }}>
            Demonstrativo de Resultado
          </h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
            Visão consolidada de receitas, despesas e resultado no período.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setComparar((v) => !v)} className={`btn ${comparar ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {comparar ? <><Check size={14} /> Comparativo</> : 'Comparativo'}
          </button>
          <button onClick={exportarDRE} className="btn btn-ghost" style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><ArrowDown size={13} /> CSV</button>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PERIODOS.map((p, i) => (
            <button key={p.label} onClick={() => aplicarPeriodo(i)} className={`pill ${periodoPre === i ? 'pill-active' : ''}`}>{p.label}</button>
          ))}
        </div>
        {periodoPre === 5 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input className="input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={{ width: 150 }} />
            <span style={{ color: 'var(--text-muted)' }}>até</span>
            <input className="input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={{ width: 150 }} />
          </div>
        )}
      </div>

      {carregando && <div className="card" style={{ textAlign: 'center', padding: 32 }}><p className="empty-hint">Calculando DRE...</p></div>}

      {dre && !carregando && (
        <>
          {/* KPIs rápidos */}
          <div className="relatorio-kpis">
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Receita bruta</p>
              <p className="relatorio-kpi-valor positivo">{formatarMoeda(dre.atual.receitasBruta)}</p>
              {mostrarComp && dre.anterior.receitasBruta > 0 && (
                <p className={`relatorio-kpi-var ${dre.atual.receitasBruta >= dre.anterior.receitasBruta ? 'pos' : 'neg'}`}>
                  {dre.atual.receitasBruta >= dre.anterior.receitasBruta ? '▲' : '▼'} {Math.abs(((dre.atual.receitasBruta - dre.anterior.receitasBruta)/dre.anterior.receitasBruta)*100).toFixed(1)}% vs ant.
                </p>
              )}
            </div>
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Total despesas</p>
              <p className="relatorio-kpi-valor">{formatarMoeda(dre.atual.totalDespesas)}</p>
              {mostrarComp && dre.anterior.totalDespesas > 0 && (
                <p className={`relatorio-kpi-var ${dre.atual.totalDespesas <= dre.anterior.totalDespesas ? 'pos' : 'neg'}`}>
                  {dre.atual.totalDespesas <= dre.anterior.totalDespesas ? '▼' : '▲'} {Math.abs(((dre.atual.totalDespesas - dre.anterior.totalDespesas)/dre.anterior.totalDespesas)*100).toFixed(1)}% vs ant.
                </p>
              )}
            </div>
            <div className="relatorio-kpi destaque">
              <p className="relatorio-kpi-label">Resultado líquido</p>
              <p className={`relatorio-kpi-valor ${dre.atual.resultado >= 0 ? 'positivo' : 'negativo'}`}>{formatarMoeda(dre.atual.resultado)}</p>
              {dre.atual.receitasBruta > 0 && (
                <p className="relatorio-kpi-var">{((dre.atual.resultado / dre.atual.receitasBruta) * 100).toFixed(1)}% de margem</p>
              )}
            </div>
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Índice de comprometimento</p>
              <p className={`relatorio-kpi-valor ${dre.atual.receitasBruta > 0 && dre.atual.totalDespesas / dre.atual.receitasBruta > 0.9 ? 'negativo' : ''}`}>
                {dre.atual.receitasBruta > 0 ? `${((dre.atual.totalDespesas / dre.atual.receitasBruta)*100).toFixed(0)}%` : '—'}
              </p>
              <p className="relatorio-kpi-var">despesas / receitas</p>
            </div>
          </div>

          {/* Tabela DRE */}
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="dre-tabela">
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', paddingBottom: 12 }}>Item</th>
                  <th style={{ textAlign: 'right', paddingBottom: 12 }}>{PERIODOS[periodoPre < 5 ? periodoPre : 5].label !== 'Personalizado' ? PERIODOS[periodoPre].label : `${dataInicio} → ${dataFim}`}</th>
                  {mostrarComp && <th style={{ textAlign: 'right', paddingBottom: 12, color: 'var(--text-muted)' }}>Período anterior</th>}
                  {mostrarComp && <th style={{ textAlign: 'right', paddingBottom: 12, color: 'var(--text-muted)' }}>Var. %</th>}
                </tr>
              </thead>
              <tbody>
                {/* Receitas */}
                <Separador label="RECEITAS" />
                <Linha
                  label="Receita bruta"
                  valor={dre.atual.receitasBruta}
                  valorAnt={mostrarComp ? dre.anterior.receitasBruta : undefined}
                  destaque
                  tipo="positivo"
                  expandivel={Object.keys(dre.atual.receitasPorCat).length > 0}
                  expandido={expandidas.receitas}
                  onToggle={() => toggle('receitas')}
                >
                  {Object.entries(dre.atual.receitasPorCat).sort((a,b) => b[1]-a[1]).map(([cat, val]) => (
                    <Linha key={cat} label={cat} valor={val} valorAnt={mostrarComp ? (dre.anterior.receitasPorCat[cat] || 0) : undefined} nivel={1} tipo="positivo" />
                  ))}
                </Linha>

                {/* Despesas */}
                <Separador label="DESPESAS" />
                <Linha
                  label="(-) Despesas essenciais"
                  valor={-dre.atual.essencial.total}
                  valorAnt={mostrarComp ? -dre.anterior.essencial.total : undefined}
                  tipo="negativo"
                  expandivel={Object.keys(dre.atual.essencial.porCat).length > 0}
                  expandido={expandidas.essencial}
                  onToggle={() => toggle('essencial')}
                >
                  {Object.entries(dre.atual.essencial.porCat).sort((a,b) => b[1]-a[1]).map(([cat, val]) => (
                    <Linha key={cat} label={cat} valor={-val} valorAnt={mostrarComp ? -(dre.anterior.essencial.porCat[cat] || 0) : undefined} nivel={1} />
                  ))}
                </Linha>

                <Linha
                  label="(-) Despesas desejáveis"
                  valor={-dre.atual.desejavel.total}
                  valorAnt={mostrarComp ? -dre.anterior.desejavel.total : undefined}
                  tipo="negativo"
                  expandivel={Object.keys(dre.atual.desejavel.porCat).length > 0}
                  expandido={expandidas.desejavel}
                  onToggle={() => toggle('desejavel')}
                >
                  {Object.entries(dre.atual.desejavel.porCat).sort((a,b) => b[1]-a[1]).map(([cat, val]) => (
                    <Linha key={cat} label={cat} valor={-val} valorAnt={mostrarComp ? -(dre.anterior.desejavel.porCat[cat] || 0) : undefined} nivel={1} />
                  ))}
                </Linha>

                <Linha
                  label="(-) Despesas supérfluas"
                  valor={-dre.atual.superfluo.total}
                  valorAnt={mostrarComp ? -dre.anterior.superfluo.total : undefined}
                  tipo="negativo"
                  expandivel={Object.keys(dre.atual.superfluo.porCat).length > 0}
                  expandido={expandidas.superfluo}
                  onToggle={() => toggle('superfluo')}
                >
                  {Object.entries(dre.atual.superfluo.porCat).sort((a,b) => b[1]-a[1]).map(([cat, val]) => (
                    <Linha key={cat} label={cat} valor={-val} valorAnt={mostrarComp ? -(dre.anterior.superfluo.porCat[cat] || 0) : undefined} nivel={1} />
                  ))}
                </Linha>

                {dre.atual.naoClassif.total > 0 && (
                  <Linha
                    label="(-) Não classificadas"
                    valor={-dre.atual.naoClassif.total}
                    valorAnt={mostrarComp ? -dre.anterior.naoClassif.total : undefined}
                    expandivel={Object.keys(dre.atual.naoClassif.porCat).length > 0}
                    expandido={expandidas.naoclassif}
                    onToggle={() => toggle('naoclassif')}
                  >
                    {Object.entries(dre.atual.naoClassif.porCat).sort((a,b) => b[1]-a[1]).map(([cat, val]) => (
                      <Linha key={cat} label={cat} valor={-val} valorAnt={mostrarComp ? -(dre.anterior.naoClassif.porCat[cat] || 0) : undefined} nivel={1} />
                    ))}
                  </Linha>
                )}

                {/* Totais */}
                <Separador label="" />
                <Linha
                  label="(=) Total de despesas"
                  valor={-dre.atual.totalDespesas}
                  valorAnt={mostrarComp ? -dre.anterior.totalDespesas : undefined}
                  destaque
                  tipo="negativo"
                />

                <tr className="dre-resultado-final">
                  <td className="dre-label"><strong>RESULTADO DO PERÍODO</strong></td>
                  <td className="dre-valor" style={{ color: dre.atual.resultado >= 0 ? 'var(--primary)' : 'var(--negative)', fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-lg)' }}>
                    {formatarMoeda(dre.atual.resultado)}
                  </td>
                  {mostrarComp && (
                    <td className="dre-valor" style={{ color: 'var(--text-muted)', fontWeight: 'var(--weight-semibold)' }}>
                      {formatarMoeda(dre.anterior.resultado)}
                    </td>
                  )}
                  {mostrarComp && dre.anterior.resultado !== 0 && (
                    <td className="dre-variacao" style={{ color: dre.atual.resultado >= dre.anterior.resultado ? 'var(--primary)' : 'var(--negative)', fontWeight: 'var(--weight-semibold)' }}>
                      {dre.atual.resultado >= dre.anterior.resultado ? '▲' : '▼'} {Math.abs(((dre.atual.resultado - dre.anterior.resultado)/Math.abs(dre.anterior.resultado))*100).toFixed(1)}%
                    </td>
                  )}
                  {mostrarComp && dre.anterior.resultado === 0 && <td />}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Nota de rodapé */}
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
            ℹ️ Transferências entre contas não entram no DRE. Clique nas linhas para expandir o detalhamento por categoria.
           {entidades?.find((e) => e.id === entidadeAtual)?.tipo !== 'PJ' && ' Classifique suas despesas por essencialidade para um DRE mais preciso.'}
          </p>
        </>
      )}
    </div>
  );
}
