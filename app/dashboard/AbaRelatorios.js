'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { formatarMoeda, vencimentoOcorrencia } from '../../lib/financeiro';

const GraficoEntradasSaidas    = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoEntradasSaidas),    { ssr: false });
const GraficoDespesasPorCategoria = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoDespesasPorCategoria), { ssr: false });
const GraficoEvolucaoPatrimonio  = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoEvolucaoPatrimonio),  { ssr: false });
const GraficoComparativoPFPJ    = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoComparativoPFPJ),    { ssr: false });
const AbaDRE = dynamic(() => import('./AbaDRE'), { ssr: false });
const NOMES_MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const NOMES_MESES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const CORES_CAT = ['#0F6E56','#C68A2E','#B4472F','#3B6E8F','#7A5C9E','#5C8A3A','#A6763F','#4A5A6B','#2E7D6E','#8B5E3C'];

function hoje() { return new Date().toISOString().slice(0, 10); }
function primeiroDiaMes(data = new Date()) { return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-01`; }
function ultimoDiaMes(data = new Date()) {
  const ultimo = new Date(data.getFullYear(), data.getMonth()+1, 0);
  return ultimo.toISOString().slice(0, 10);
}
function mesesAtras(n) {
  const d = new Date(); d.setMonth(d.getMonth() - n + 1); d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function anoAtual() { return new Date().getFullYear(); }

const PERIODOS = [
  { label: 'Este mês',      de: () => primeiroDiaMes(), ate: () => ultimoDiaMes() },
  { label: 'Mês anterior',  de: () => { const d = new Date(); d.setMonth(d.getMonth()-1); return primeiroDiaMes(d); }, ate: () => { const d = new Date(); d.setMonth(d.getMonth()-1); return ultimoDiaMes(d); } },
  { label: 'Últimos 3 meses', de: () => mesesAtras(3), ate: () => ultimoDiaMes() },
  { label: 'Últimos 6 meses', de: () => mesesAtras(6), ate: () => ultimoDiaMes() },
  { label: `Ano ${anoAtual()}`, de: () => `${anoAtual()}-01-01`, ate: () => `${anoAtual()}-12-31` },
  { label: 'Personalizado', de: null, ate: null },
];

// Deriva a lista de meses de referência (YYYY-MM-01) que caem no período.
function mesesReferenciaNoPeriodo(inicio, fim) {
  const meses = [];
  const dIni = new Date(inicio);
  const dFim = new Date(fim);
  let ano = dIni.getFullYear();
  let mes = dIni.getMonth();
  while (ano < dFim.getFullYear() || (ano === dFim.getFullYear() && mes <= dFim.getMonth())) {
    meses.push(`${ano}-${String(mes + 1).padStart(2, '0')}-01`);
    mes += 1;
    if (mes > 11) { mes = 0; ano += 1; }
  }
  return meses;
}

export default function AbaRelatorios({
  entidadeAtual,
  entidadeAtualObj,
  salvarMesInicioControle,
  exportarMesCSV,
  exportarAnoCSV,
  exportarPDF,
  comparativoPFPJ,
  dataAtual,
  confirmarOcorrencia,
  pendenciasVencidas,
}) {
  const [periodoPre, setPeriodoPre] = useState(0);
  const [dataInicio, setDataInicio] = useState(primeiroDiaMes());
  const [dataFim, setDataFim] = useState(ultimoDiaMes());
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroEssencialidade, setFiltroEssencialidade] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState(null);
  const [contasData, setContasData] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [abaAtiva, setAbaAtiva] = useState('resumo');

  // Estado da aba Contas
  const [contasTipo, setContasTipo] = useState('saida');       // 'saida' | 'entrada'
  const [contasSituacao, setContasSituacao] = useState('aberto'); // 'aberto' | 'atraso' | 'quitado'

  // Aplica preset de período
  function aplicarPeriodo(idx) {
    setPeriodoPre(idx);
    const p = PERIODOS[idx];
    if (p.de && p.ate) { setDataInicio(p.de()); setDataFim(p.ate()); }
  }

  const buscarDados = useCallback(async () => {
    if (!entidadeAtual) return;
    setCarregando(true);

    let query = supabase
      .from('transacoes')
      .select('id, tipo, valor, categoria, descricao, data, essencialidade, status, conta_id, transferencia_id')
      .eq('entidade_id', entidadeAtual)
      .is('transferencia_id', null)
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .order('data', { ascending: false });

    if (filtroTipo !== 'todos') query = query.eq('tipo', filtroTipo);
    if (filtroCategoria) query = query.eq('categoria', filtroCategoria);
    if (filtroEssencialidade) query = query.eq('essencialidade', filtroEssencialidade);

    const { data: txs } = await query;
    const lista = txs || [];

    // Categorias disponíveis para o filtro
    const { data: catData } = await supabase
      .from('transacoes')
      .select('categoria')
      .eq('entidade_id', entidadeAtual)
      .is('transferencia_id', null)
      .gte('data', dataInicio)
      .lte('data', dataFim)
      .neq('categoria', null)
      .neq('categoria', '');
    setCategorias([...new Set((catData || []).map((t) => t.categoria))].sort());

    // Cálculos
    const entradas = lista.filter((t) => t.tipo === 'entrada');
    const saidas   = lista.filter((t) => t.tipo === 'saida');
    const totalE   = entradas.reduce((s, t) => s + Number(t.valor), 0);
    const totalS   = saidas.reduce((s, t) => s + Number(t.valor), 0);
    const resultado = totalE - totalS;
    const margem   = totalE > 0 ? (resultado / totalE) * 100 : 0;

    // Por categoria
    const porCat = {};
    saidas.forEach((t) => {
      const c = t.categoria || 'Sem categoria';
      porCat[c] = (porCat[c] || 0) + Number(t.valor);
    });
    const despesasPorCategoria = Object.entries(porCat)
      .map(([categoria, valor]) => ({ categoria, valor }))
      .sort((a, b) => b.valor - a.valor);

    // Por mês (para gráfico de tendência)
    const porMes = {};
    lista.forEach((t) => {
      const m = t.data.slice(0, 7);
      if (!porMes[m]) porMes[m] = { mes: m, Entradas: 0, Saídas: 0 };
      if (t.tipo === 'entrada') porMes[m].Entradas += Number(t.valor);
      else porMes[m].Saídas += Number(t.valor);
    });
    const dadosMensais = Object.values(porMes)
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .map((m) => ({ ...m, mes: `${NOMES_MESES[parseInt(m.mes.slice(5,7))-1]}/${m.mes.slice(2,4)}` }));

    // Essencialidade
    const ess = { essencial: 0, desejavel: 0, superfluo: 0, outro: 0 };
    saidas.forEach((t) => {
      const e = t.essencialidade;
      if (e === 'essencial') ess.essencial += Number(t.valor);
      else if (e === 'desejavel') ess.desejavel += Number(t.valor);
      else if (e === 'superfluo') ess.superfluo += Number(t.valor);
      else ess.outro += Number(t.valor);
    });

    // Maiores lançamentos
    const maiores = [...lista].sort((a, b) => Number(b.valor) - Number(a.valor)).slice(0, 10);

    // Variação mês a mês (últimos 2 meses disponíveis)
    const mesesOrdenados = Object.values(porMes).sort((a, b) => b.mes.localeCompare(a.mes));
    let variacaoE = null, variacaoS = null;
    if (mesesOrdenados.length >= 2) {
      const [atual, anterior] = mesesOrdenados;
      variacaoE = anterior.Entradas > 0 ? ((atual.Entradas - anterior.Entradas) / anterior.Entradas) * 100 : null;
      variacaoS = anterior.Saídas > 0 ? ((atual.Saídas - anterior.Saídas) / anterior.Saídas) * 100 : null;
    }

    setDados({ lista, totalE, totalS, resultado, margem, despesasPorCategoria, dadosMensais, ess, maiores, variacaoE, variacaoS });

    // ── Contas em aberto/atraso/quitadas — vêm de lancamentos_fixos_mensal,
    //    não de transacoes (uma conta só vira transação quando é paga). ──
    const mesesRef = mesesReferenciaNoPeriodo(dataInicio, dataFim);
    const { data: ocorrencias } = await supabase
      .from('lancamentos_fixos_mensal')
      .select('*, lancamentos_fixos(nome, tipo, dia_referencia)')
      .eq('entidade_id', entidadeAtual)
      .in('mes_referencia', mesesRef);

    // Quanto já foi pago de cada ocorrência (soma das transações vinculadas),
    // para o valor pendente das parciais. Mesmo princípio do page.js.
    const { data: txVinc } = await supabase
      .from('transacoes')
      .select('lancamento_mensal_id, valor')
      .eq('entidade_id', entidadeAtual)
      .not('lancamento_mensal_id', 'is', null);

    const pagoPorOcorrencia = {};
    (txVinc || []).forEach((t) => {
      pagoPorOcorrencia[t.lancamento_mensal_id] =
        (pagoPorOcorrencia[t.lancamento_mensal_id] || 0) + Number(t.valor);
    });
    const pendenteDe = (o) => Math.max(0, Number(o.valor) - (pagoPorOcorrencia[o.id] || 0));

 const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const estaAtrasada = (o) => {
      if (o.status === 'confirmado') return false;
      const venc = vencimentoOcorrencia(o.mes_referencia, o.lancamentos_fixos?.dia_referencia);
      return venc < inicioHoje;
    };

    const ocs = (ocorrencias || []).filter((o) => o.lancamentos_fixos);
    const mapContas = {
      saida: {
        aberto:  ocs.filter((o) => o.lancamentos_fixos.tipo === 'saida' && o.status !== 'confirmado'),
        quitado: ocs.filter((o) => o.lancamentos_fixos.tipo === 'saida' && o.status === 'confirmado'),
      },
      entrada: {
        aberto:  ocs.filter((o) => o.lancamentos_fixos.tipo === 'entrada' && o.status !== 'confirmado'),
        quitado: ocs.filter((o) => o.lancamentos_fixos.tipo === 'entrada' && o.status === 'confirmado'),
      },
    };
    mapContas.saida.atraso   = mapContas.saida.aberto.filter(estaAtrasada);
    mapContas.entrada.atraso = mapContas.entrada.aberto.filter(estaAtrasada);

    setContasData({ mapContas, pendenteDe, estaAtrasada });

    setCarregando(false);
  }, [entidadeAtual, dataInicio, dataFim, filtroTipo, filtroCategoria, filtroEssencialidade]);

  useEffect(() => { buscarDados(); }, [buscarDados]);

  const nDias = Math.round((new Date(dataFim) - new Date(dataInicio)) / 86400000) + 1;
  const labelPeriodo = periodoPre < 5 ? PERIODOS[periodoPre].label : `${dataInicio} → ${dataFim}`;

  // ── Derivados da aba Contas (fora do buscarDados p/ reagir ao seletor) ──
  const contasView = (() => {
    if (!contasData) return null;
    const { mapContas, pendenteDe } = contasData;
    const grupo = mapContas[contasTipo];
    const somaPendente = (arr) => arr.reduce((s, o) => s + pendenteDe(o), 0);
    const somaCheia = (arr) => arr.reduce((s, o) => s + Number(o.valor), 0);

    const totais = {
      aberto:  somaPendente(grupo.aberto),
      atraso:  somaPendente(grupo.atraso),
      quitado: somaCheia(grupo.quitado),
      labelQuitado: contasTipo === 'saida' ? 'Pagas' : 'Recebidas',
    };
    const lista = grupo[contasSituacao] || [];
    const base = totais.aberto + totais.quitado;
    return {
      totais,
      lista,
      pctQuitado:     base > 0 ? (totais.quitado / base) * 100 : 0,
      pctAtraso:      base > 0 ? (totais.atraso  / base) * 100 : 0,
      pctAbertoEmDia: base > 0 ? ((totais.aberto - totais.atraso) / base) * 100 : 0,
      base,
    };
  })();

  function exportarContasCSV() {
    if (!contasView || !contasData) return;
    const { pendenteDe, estaAtrasada } = contasData;
    const tipoLabel = contasTipo === 'saida' ? 'A pagar' : 'A receber';
    const situacaoLabel = { aberto: 'Em aberto', atraso: 'Em atraso', quitado: contasView.totais.labelQuitado }[contasSituacao];
    const cabecalho = ['Descrição', 'Tipo', 'Situação', 'Mês ref.', 'Dia venc.', 'Valor'];

    const linhas = contasView.lista.map((o) => {
      const valor = contasSituacao === 'quitado' ? Number(o.valor) : pendenteDe(o);
      return [
        o.lancamentos_fixos?.nome || '',
        tipoLabel,
        estaAtrasada(o) ? 'Em atraso' : situacaoLabel,
        o.mes_referencia?.slice(0, 7) || '',
        o.lancamentos_fixos?.dia_referencia || '',
        valor.toFixed(2).replace('.', ','),
      ];
    });

    const csv = [cabecalho, ...linhas]
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tipoLabel}_${situacaoLabel}_${dataInicio}_${dataFim}.csv`.replace(/ /g, '-');
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

       {/* ── Filtros (ocultos na sub-aba DRE, que tem período próprio) ── */}
      {abaAtiva !== 'dre' && (
      <div className="card relatorio-filtros">
        <div className="relatorio-filtros-periodos">
          {PERIODOS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => aplicarPeriodo(i)}
              className={`pill ${periodoPre === i ? 'pill-active' : ''}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {periodoPre === 5 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <input className="input" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} style={{ width: 150 }} />
            <span style={{ color: 'var(--text-muted)' }}>até</span>
            <input className="input" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} style={{ width: 150 }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <select className="input" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ width: 140 }}>
            <option value="todos">Todos os tipos</option>
            <option value="entrada">Só entradas</option>
            <option value="saida">Só saídas</option>
          </select>
          <select className="input" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ width: 180 }}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input" value={filtroEssencialidade} onChange={(e) => setFiltroEssencialidade(e.target.value)} style={{ width: 180 }}>
            <option value="">Toda essencialidade</option>
            <option value="essencial">Essencial</option>
            <option value="desejavel">Desejável</option>
            <option value="superfluo">Supérfluo</option>
          </select>
          {(filtroTipo !== 'todos' || filtroCategoria || filtroEssencialidade) && (
            <button onClick={() => { setFiltroTipo('todos'); setFiltroCategoria(''); setFiltroEssencialidade(''); }} className="btn-link">
              Limpar filtros
            </button>
          )}
        </div>

       <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '8px 0 0' }}>
          {carregando ? 'Carregando...' : dados ? `${dados.lista.length} lançamentos em ${nDias} dias — ${labelPeriodo}` : ''}
        </p>
      </div>
      )}

      {dados && !carregando && (
        <>
          {/* ── KPIs ── */}
          <div className="relatorio-kpis">
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Receitas</p>
              <p className="relatorio-kpi-valor positivo">{formatarMoeda(dados.totalE)}</p>
              {dados.variacaoE !== null && (
                <p className={`relatorio-kpi-var ${dados.variacaoE >= 0 ? 'pos' : 'neg'}`}>
                  {dados.variacaoE >= 0 ? '▲' : '▼'} {Math.abs(dados.variacaoE).toFixed(1)}% vs mês ant.
                </p>
              )}
            </div>
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Despesas</p>
              <p className="relatorio-kpi-valor">{formatarMoeda(dados.totalS)}</p>
              {dados.variacaoS !== null && (
                <p className={`relatorio-kpi-var ${dados.variacaoS <= 0 ? 'pos' : 'neg'}`}>
                  {dados.variacaoS >= 0 ? '▲' : '▼'} {Math.abs(dados.variacaoS).toFixed(1)}% vs mês ant.
                </p>
              )}
            </div>
            <div className="relatorio-kpi destaque">
              <p className="relatorio-kpi-label">Resultado</p>
              <p className={`relatorio-kpi-valor ${dados.resultado >= 0 ? 'positivo' : 'negativo'}`}>
                {formatarMoeda(dados.resultado)}
              </p>
              {dados.totalE > 0 && (
                <p className="relatorio-kpi-var">{dados.margem.toFixed(1)}% de margem</p>
              )}
            </div>
            <div className="relatorio-kpi">
              <p className="relatorio-kpi-label">Lançamentos</p>
              <p className="relatorio-kpi-valor">{dados.lista.length}</p>
              <p className="relatorio-kpi-var">{nDias} dias analisados</p>
            </div>
          </div>

          {/* ── Abas internas ── */}
          <div className="relatorio-abas">
            {['resumo','categorias','contas','lançamentos','essencialidade', ...(entidadeAtualObj?.tipo === 'PJ' ? ['dre'] : [])].map((a) => (
              <button key={a} onClick={() => setAbaAtiva(a)} className={`tab ${abaAtiva === a ? 'tab-active' : ''}`} style={{ textTransform: 'capitalize' }}>
                {a}
              </button>
            ))}
          </div>

          {/* ── Aba Resumo ── */}
          {abaAtiva === 'resumo' && (
            <>
              {dados.dadosMensais.length > 1 && (
                <div className="card">
                  <p className="card-title" style={{ marginBottom: 12 }}>Entradas x saídas por mês</p>
                  <GraficoEntradasSaidas dados={dados.dadosMensais} />
                </div>
              )}

              {pendenciasVencidas?.length > 0 && (
                <div className="card card-despesas">
                  <p className="card-title" style={{ marginBottom: 4 }}>Contas atrasadas</p>
                  <p className="empty-hint" style={{ margin: '0 0 10px' }}>Despesas fixas de meses anteriores não confirmadas.</p>
                  {pendenciasVencidas.map((o) => (
                    <div key={o.id} className="row row-main">
                      <div>
                        <p className="row-title">{o.lancamentos_fixos?.nome}</p>
                        <p className="row-subtitle">ref. {o.mes_referencia?.slice(0, 7)}</p>
                      </div>
                      <div className="row-actions">
                        <span className="amount">{formatarMoeda(o.valor)}</span>
                        <button onClick={() => confirmarOcorrencia({ id: o.lancamento_fixo_id, tipo: 'saida', nome: o.lancamentos_fixos?.nome }, o)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}>
                          Confirmar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {comparativoPFPJ?.length > 1 && (
                <div className="card">
                  <p className="card-title" style={{ marginBottom: 12 }}>Comparativo PF x PJ</p>
                  <GraficoComparativoPFPJ dados={comparativoPFPJ} />
                </div>
              )}

              <div className="card">
                <p className="card-title" style={{ marginBottom: 4 }}>Top 10 maiores lançamentos</p>
                {dados.maiores.length === 0
                  ? <p className="empty-hint">Nenhum lançamento no período.</p>
                  : dados.maiores.map((t) => (
                    <div key={t.id} className="row row-main" style={{ padding: '8px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.descricao || t.categoria || '—'}</p>
                        <p className="row-subtitle">{t.categoria} · {t.data}</p>
                      </div>
                      <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`} style={{ flexShrink: 0 }}>
                        {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                      </span>
                    </div>
                  ))
                }
              </div>
            </>
          )}

          {/* ── Aba Categorias ── */}
          {abaAtiva === 'categorias' && (
            <>
              <div className="card">
                <p className="card-title" style={{ marginBottom: 12 }}>Despesas por categoria</p>
                {dados.despesasPorCategoria.length === 0
                  ? <p className="empty-hint">Nenhuma despesa no período.</p>
                  : (
                    <>
                      <GraficoDespesasPorCategoria dados={dados.despesasPorCategoria.slice(0, 8)} />
                      <table className="report-table" style={{ marginTop: 16 }}>
                        <thead><tr><th>Categoria</th><th>Valor</th><th>% do total</th></tr></thead>
                        <tbody>
                          {dados.despesasPorCategoria.map((c, i) => (
                            <tr key={c.categoria}>
                              <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: CORES_CAT[i % CORES_CAT.length], marginRight: 8 }} />{c.categoria}</td>
                              <td>{formatarMoeda(c.valor)}</td>
                              <td>{dados.totalS > 0 ? ((c.valor / dados.totalS) * 100).toFixed(1) + '%' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )
                }
              </div>
            </>
          )}

          {/* ── Aba Contas (aberto / atraso / pagas-recebidas) ── */}
          {abaAtiva === 'contas' && contasView && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <p className="card-title" style={{ margin: 0 }}>Contas do período</p>
                <select className="input" value={contasTipo} onChange={(e) => setContasTipo(e.target.value)} style={{ width: 160 }}>
                  <option value="saida">Contas a pagar</option>
                  <option value="entrada">Contas a receber</option>
                </select>
              </div>

              {/* Cartões */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
                {[
                  { chave: 'aberto',  titulo: 'Em aberto',  valor: contasView.totais.aberto,  sub: null },
                  { chave: 'atraso',  titulo: 'Em atraso',  valor: contasView.totais.atraso,  sub: 'incluído no aberto' },
                  { chave: 'quitado', titulo: contasView.totais.labelQuitado, valor: contasView.totais.quitado, sub: null },
                ].map((c) => {
                  const ativo = contasSituacao === c.chave;
                  const corValor = c.chave === 'atraso' ? 'var(--negative)' : c.chave === 'quitado' ? 'var(--primary)' : 'inherit';
                  return (
                    <button
                      key={c.chave}
                      onClick={() => setContasSituacao(c.chave)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                        padding: 12, borderRadius: 'var(--radius-sm)', textAlign: 'left', cursor: 'pointer',
                        background: 'var(--surface)',
                        border: `1px solid ${ativo ? (c.chave === 'atraso' ? 'var(--negative)' : 'var(--primary)') : 'var(--border)'}`,
                        boxShadow: ativo ? `0 0 0 2px ${c.chave === 'atraso' ? 'var(--negative-tint)' : 'var(--primary-tint)'}` : 'none',
                      }}
                    >
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{c.titulo}</span>
                      <span style={{ fontSize: 'var(--text-lg)', fontWeight: 600, marginTop: 2, color: corValor }}>{formatarMoeda(c.valor)}</span>
                      {c.sub && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{c.sub}</span>}
                    </button>
                  );
                })}
              </div>

              {/* Barra de proporção */}
              {contasView.base > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-alt)' }}>
                    <div style={{ width: `${contasView.pctQuitado}%`, background: 'var(--primary)', transition: 'width .3s' }} />
                    <div style={{ width: `${contasView.pctAbertoEmDia}%`, background: 'var(--border)', transition: 'width .3s' }} />
                    <div style={{ width: `${contasView.pctAtraso}%`, background: 'var(--negative)', transition: 'width .3s' }} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>{contasView.totais.labelQuitado} {contasView.pctQuitado.toFixed(0)}%</span>
                    <span>Em aberto {contasView.pctAbertoEmDia.toFixed(0)}%</span>
                    {contasView.totais.atraso > 0 && <span style={{ color: 'var(--negative)' }}>Atraso {contasView.pctAtraso.toFixed(0)}%</span>}
                  </div>
                </div>
              )}

              {/* Lista filtrada */}
              {contasView.lista.length === 0 ? (
                <p className="empty-hint">
                  Nenhuma conta {contasTipo === 'saida' ? 'a pagar' : 'a receber'} nesta situação no período.
                </p>
              ) : (
                contasView.lista.map((o) => {
                  const atrasada = contasData.estaAtrasada(o);
                  const valor = contasSituacao === 'quitado' ? Number(o.valor) : contasData.pendenteDe(o);
                  return (
                    <div key={o.id} className="row row-main" style={{ padding: '8px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="row-title">{o.lancamentos_fixos?.nome}</p>
                        <p className="row-subtitle">
                          ref. {o.mes_referencia?.slice(0, 7)} · dia {o.lancamentos_fixos?.dia_referencia}
                          {atrasada && <span style={{ color: 'var(--negative)' }}> · atrasada</span>}
                        </p>
                      </div>
                      <div className="row-actions">
                        <span className="amount">{formatarMoeda(valor)}</span>
                        {contasSituacao !== 'quitado' && (
                          <button
                            onClick={() => confirmarOcorrencia({ id: o.lancamento_fixo_id, tipo: o.lancamentos_fixos?.tipo, nome: o.lancamentos_fixos?.nome }, o)}
                            className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}
                          >
                            {contasTipo === 'saida' ? 'Pagar' : 'Receber'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              <div style={{ marginTop: 14 }}>
                <button onClick={exportarContasCSV} className="btn btn-ghost">
                  Exportar CSV ({contasView.lista.length})
                </button>
              </div>
            </div>
          )}

          {/* ── Aba Lançamentos ── */}
          {abaAtiva === 'lançamentos' && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 12 }}>
                Todos os lançamentos — {dados.lista.length} registros
              </p>
              {dados.lista.length === 0
                ? <p className="empty-hint">Nenhum lançamento no período com os filtros aplicados.</p>
                : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="report-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Descrição</th>
                          <th>Categoria</th>
                          <th>Tipo</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.lista.map((t) => (
                          <tr key={t.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{t.data}</td>
                            <td>{t.descricao || '—'}</td>
                            <td>{t.categoria || '—'}</td>
                            <td>
                              <span style={{ fontSize: 'var(--text-xs)', padding: '2px 6px', borderRadius: 999, background: t.tipo === 'entrada' ? 'var(--primary-tint)' : 'var(--negative-tint)', color: t.tipo === 'entrada' ? 'var(--primary-dark)' : 'var(--negative)' }}>
                                {t.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600, color: t.tipo === 'entrada' ? 'var(--primary)' : 'inherit', whiteSpace: 'nowrap' }}>
                              {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </div>
          )}

          {/* ── Aba Essencialidade ── */}
          {abaAtiva === 'essencialidade' && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 16 }}>Perfil de gastos por essencialidade</p>
              {dados.totalS === 0
                ? <p className="empty-hint">Nenhuma despesa no período.</p>
                : (
                  <>
                    {[
                      { label: 'Essencial', valor: dados.ess.essencial, cor: 'var(--primary)' },
                      { label: 'Desejável', valor: dados.ess.desejavel, cor: 'var(--accent)' },
                      { label: 'Supérfluo', valor: dados.ess.superfluo, cor: 'var(--negative)' },
                      { label: 'Não classificado', valor: dados.ess.outro, cor: 'var(--border)' },
                    ].map(({ label, valor, cor }) => {
                      const pct = ((valor / dados.totalS) * 100).toFixed(1);
                      return (
                        <div key={label} style={{ marginBottom: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-medium)' }}>{label}</span>
                            <span style={{ fontSize: 'var(--text-md)' }}>{formatarMoeda(valor)} <span style={{ color: 'var(--text-muted)' }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: cor, transition: 'width 0.4s' }} />
                          </div>
                        </div>
                      );
                    })}
                    {dados.totalE > 0 && (
                      <div style={{ marginTop: 20, padding: '12px 16px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                        <p style={{ fontSize: 'var(--text-md)', margin: 0 }}>
                          <strong>{((dados.ess.essencial / dados.totalE) * 100).toFixed(0)}%</strong> da receita comprometida com despesas essenciais
                          {((dados.ess.essencial / dados.totalE) * 100) > 50 && (
                            <span style={{ color: 'var(--negative)', marginLeft: 6 }}>— acima do recomendado (até ~50%)</span>
                          )}
                        </p>
                      </div>
                    )}
                  </>
                )
              }
            </div>
          )}

          {/* ── Aba DRE (só PJ) ── */}
          {abaAtiva === 'dre' && entidadeAtualObj?.tipo === 'PJ' && (
            <AbaDRE entidadeAtual={entidadeAtual} entidades={[entidadeAtualObj]} />
          )}

         {/* ── Exportar (oculto na sub-aba DRE) ── */}
          {abaAtiva !== 'dre' && (
          <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="card-title" style={{ marginRight: 4 }}>Exportar</span>
            <button onClick={exportarMesCSV} className="btn btn-ghost">CSV do mês</button>
            <button onClick={exportarAnoCSV} className="btn btn-ghost">CSV do ano</button>
            <button onClick={exportarPDF}    className="btn btn-ghost">PDF do mês</button>
          </div>
          )}
        </>
      )}

      {carregando && (
        <div className="card" style={{ textAlign: 'center', padding: 32 }}>
          <p className="empty-hint">Carregando dados...</p>
        </div>
      )}
    </div>
  );
}