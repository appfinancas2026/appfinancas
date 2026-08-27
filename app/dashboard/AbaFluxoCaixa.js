'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';
import { projetarSaldoDiario } from '../../lib/insights';
import { gerarEventosFaturaFutura } from '../../lib/faturas';

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

export default function AbaFluxoCaixa({ entidadeAtual, contas, lancamentosFixos, dividas = [] }) {
  const [diasHistorico, setDiasHistorico] = useState(30);
  const [diasProjecao, setDiasProjecao]   = useState(60);
  const [mostrarProjecao, setMostrarProjecao] = useState(true);
  const [incluirVariaveis, setIncluirVariaveis] = useState(true);
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

    // Média diária de gastos variáveis dos últimos 3 meses.
    // Exclui os recorrentes (origem 'recorrente'), que já entram na projeção
    // pelos lançamentos fixos — senão contaria o mesmo gasto duas vezes.
    let mediaDiariaVariavel = 0;
    if (mostrarProjecao && incluirVariaveis) {
      const inicioMedia = addDias(hoje, -90);
      const { data: txsVar } = await supabase
        .from('transacoes')
        .select('valor, data, origem')
        .eq('entidade_id', entidadeAtual)
        .eq('tipo', 'saida')
        .is('transferencia_id', null)
        .neq('origem', 'recorrente')
        .is('parcela_total', null)   // exclui parcelados: entram via eventos de fatura (sem dupla contagem)
        .gte('data', inicioMedia)
        .lte('data', hoje);

      const totalVariavel = (txsVar || []).reduce((s, t) => s + Number(t.valor), 0);
      mediaDiariaVariavel = totalVariavel / 90;
    }

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

    // Parcelas futuras de cartão → eventos de data absoluta para a projeção.
    // Cada grupo (cartão × mes_fatura) vira uma saída no dia de vencimento da fatura.
    // Esses eventos substituem a representação que antes existia só na média variável
    // (que agora exclui parcelados via .is('parcela_total', null) acima).
    let eventosAbsolutos = [];
    if (mostrarProjecao) {
      const mesRefAtual = `${hoje.slice(0, 7)}-01`;
      const [{ data: cartoesData }, { data: txsCartaoData }] = await Promise.all([
        supabase
          .from('cartoes')
          .select('id, nome, dia_fechamento, dia_vencimento')
          .eq('entidade_id', entidadeAtual),
        supabase
          .from('transacoes')
          .select('cartao_id, valor, mes_fatura, parcela_total')
          .eq('entidade_id', entidadeAtual)
          .not('parcela_total', 'is', null)
          .neq('origem', 'fatura')
          .gte('mes_fatura', mesRefAtual),
      ]);
      eventosAbsolutos = gerarEventosFaturaFutura({
        cartoes: cartoesData || [],
        transacoesCartaoFuturas: txsCartaoData || [],
        hoje,
        dias: diasProjecao,
      });
    }

    // Projeção futura com base nos fixos. A lógica dia a dia vive em
    // lib/insights.js (projetarSaldoDiario), reutilizada pelo Card de insights.
    // Aqui montamos a versão "esparsa" para o gráfico: só entram os dias com
    // movimento ou a cada 7 dias, e a média de variáveis é somada às saídas.
    //
    // Dívidas ativas entram como saídas fixas no dia de vencimento de cada mês
    // (mesmo dia de data_inicio), usando a parcela_valor como valor.
    const dividasComoFixos = (dividas || [])
      .filter((d) => d.status === 'ativa')
      .map((d) => ({
        dia_referencia: parseInt(d.data_inicio.split('-')[2], 10),
        tipo: 'saida',
        valor_padrao: Number(d.parcela_valor),
        nome: d.nome,
        parcelado: false,
      }));
    const todosFixos = [...(lancamentosFixos || []), ...dividasComoFixos];

    const projecao = [];
    if (mostrarProjecao && (todosFixos.length > 0 || eventosAbsolutos.length > 0)) {
      const diaria = projetarSaldoDiario({ saldoInicial, lancamentosFixos: todosFixos, dias: diasProjecao, mediaDiariaVariavel, hoje, eventosAbsolutos });
      diaria.forEach((d, idx) => {
        const i = idx + 1;
        if (d.entradas > 0 || d.saidas > 0 || i % 7 === 0) {
          projecao.push({
            data: d.data, label: formatarData(d.data),
            entradas: d.entradas,
            saidas: d.saidas + mediaDiariaVariavel,
            saldo: d.saldo,
            // f.valor_padrao ?? f.valor: fixos têm valor_padrao; eventos absolutos têm valor
            itens: d.itens.map((f) => ({ descricao: f.nome, tipo: f.tipo, valor: f.valor_padrao ?? f.valor })),
            ehProjecao: true,
          });
        }
      });
    }

    const tudo = [...historico, ...projecao];
    const totalEntradas = historico.reduce((s, d) => s + d.entradas, 0);
    const totalSaidas   = historico.reduce((s, d) => s + d.saidas, 0);
    const menorSaldo    = tudo.length ? Math.min(...tudo.map((d) => d.saldo)) : saldoInicial;
    const diasNegativos = tudo.filter((d) => d.saldo < 0);

    // Primeiro dia futuro em que o saldo fica negativo — é o dado acionável.
    const primeiroNegativoFuturo = tudo.find((d) => d.saldo < 0 && (d.ehProjecao || d.ehHoje)) || null;
    const diasAteNegativo = primeiroNegativoFuturo
      ? Math.round((new Date(primeiroNegativoFuturo.data + 'T00:00:00') - new Date(hoje + 'T00:00:00')) / 86400000)
      : null;

    setFluxo({
      historico, projecao, tudo, saldoInicial, totalEntradas, totalSaidas,
      menorSaldo, diasNegativos, primeiroNegativoFuturo, diasAteNegativo,
      mediaDiariaVariavel,
    });
    setCarregando(false);
  }, [entidadeAtual, contas, lancamentosFixos, dividas, diasHistorico, diasProjecao, mostrarProjecao, incluirVariaveis]);

  useEffect(() => { calcularFluxo(); }, [calcularFluxo]);

  if (!entidadeAtual) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ font: `var(--weight-semibold) var(--text-xl) var(--font-display)`, margin: '0 0 2px' }}>Fluxo de Caixa</h2>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>Evolução do saldo e projeção com base nos lançamentos fixos.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setMostrarProjecao((v) => !v)} className={`btn ${mostrarProjecao ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 6, ...(mostrarProjecao ? { color: 'var(--btn-primary-text)', background: 'var(--btn-primary-bg)' } : {}) }}>
            {mostrarProjecao ? <><Check size={14} /> Projeção ativa</> : 'Mostrar projeção'}
          </button>
          {mostrarProjecao && (
            <button onClick={() => setIncluirVariaveis((v) => !v)} className={`btn ${incluirVariaveis ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: 'var(--text-sm)', display: 'inline-flex', alignItems: 'center', gap: 6, ...(incluirVariaveis ? { color: 'var(--btn-primary-text)', background: 'var(--btn-primary-bg)' } : {}) }}>
              {incluirVariaveis ? <><Check size={14} /> Com gastos do dia a dia</> : 'Só contas fixas'}
            </button>
          )}
        </div>
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
              <p className="relatorio-kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {fluxo.diasNegativos.length > 0 ? <AlertTriangle size={12} /> : <CheckCircle2 size={12} />} Menor saldo
              </p>
              <p className={`relatorio-kpi-valor ${fluxo.menorSaldo < 0 ? 'negativo' : 'positivo'}`}>{formatarMoeda(fluxo.menorSaldo)}</p>
              {fluxo.diasNegativos.length > 0 && <p className="relatorio-kpi-var" style={{ color: 'var(--negative)' }}>{fluxo.diasNegativos.length} dia(s) no vermelho</p>}
            </div>
          </div>

          {fluxo.primeiroNegativoFuturo ? (
            <div style={{ background: 'var(--negative-tint)', border: '1px solid var(--negative)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 'var(--weight-semibold)', color: 'var(--negative)' }}>
                Seu saldo fica negativo em {formatarDataCompleta(fluxo.primeiroNegativoFuturo.data)}
                {fluxo.diasAteNegativo > 0 && ` — daqui a ${fluxo.diasAteNegativo} dia${fluxo.diasAteNegativo > 1 ? 's' : ''}`}
              </p>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                Faltam <strong>{formatarMoeda(Math.abs(fluxo.primeiroNegativoFuturo.saldo))}</strong> para cobrir os compromissos desse dia.
                {fluxo.diasNegativos.filter((d) => d.ehProjecao).length > 1 &&
                  ` No total, a projeção indica ${fluxo.diasNegativos.filter((d) => d.ehProjecao).length} dias no vermelho nos próximos ${diasProjecao} dias.`}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Ainda dá tempo de agir: antecipar um recebimento, remanejar uma despesa ou negociar a data de vencimento
                costuma sair bem mais barato que entrar no rotativo ou no cheque especial.
              </p>
            </div>
          ) : fluxo.diasNegativos.length > 0 ? (
            <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', padding: '12px 16px' }}>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
                Houve saldo negativo em {fluxo.diasNegativos.length} dia(s) nos últimos {diasHistorico} dias.
                A projeção atual não indica novos dias no vermelho.
              </p>
            </div>
          ) : null}

          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Evolução do saldo</p>
            <p className="empty-hint" style={{ margin: '0 0 12px' }}>
              Linha sólida = histórico real · Tracejada = projeção
              {incluirVariaveis && mostrarProjecao && fluxo.mediaDiariaVariavel > 0 &&
                ` · inclui ${formatarMoeda(fluxo.mediaDiariaVariavel)}/dia de gastos variáveis (média dos últimos 3 meses)`}
            </p>
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
                    {dia.itens.length > 0 && <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>{expandido[dia.data] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>}
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

          {mostrarProjecao && (!lancamentosFixos || lancamentosFixos.length === 0) && !(dividas || []).some((d) => d.status === 'ativa') && (
            <div className="card" style={{ textAlign: 'center', padding: 24 }}>
              <p className="empty-hint">Cadastre receitas e despesas fixas no Painel para ver a projeção de fluxo.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}