'use client';

import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Loader2, Sparkles, X, BarChart3, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda, primeiroDiaDoMes, ultimoDiaDoMes } from '../../lib/financeiro';
import { gastoPorCategoriaNoMes, mesDeCompetencia } from '../../lib/orcamento';
import CampoCategoria from './CampoCategoria';

const LIMITE_LISTA = 6;

function diasRestantesNoMes(ano, mes) {
  const hoje = new Date();
  if (ano !== hoje.getFullYear() || mes !== hoje.getMonth()) return null;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return ultimoDia - hoje.getDate() + 1;
}

function BadgeStatus({ status }) {
  const cores = {
    'saudável': { bg: 'var(--primary-tint)', color: 'var(--primary-dark)' },
    'atenção':  { bg: 'var(--accent-tint)',  color: 'var(--accent-text)' },
    'crítico':  { bg: 'var(--negative-tint)', color: 'var(--negative)' },
  };
  const { bg, color } = cores[status] || cores['saudável'];
  return (
    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', padding: '2px 8px', borderRadius: 999, background: bg, color }}>
      {status}
    </span>
  );
}

export default function CardOrcamento({ entidadeAtual, ano, mes, aberto, onAlternarAberto }) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [mostrarNovoOrcamento, setMostrarNovoOrcamento] = useState(false);
  const [categoriaOrcamento, setCategoriaOrcamento] = useState('');
  const [valorLimiteOrcamento, setValorLimiteOrcamento] = useState('');
  const [edicaoOrcamentoId, setEdicaoOrcamentoId] = useState(null);
  const [formOrcamento, setFormOrcamento] = useState({ categoria: '', valor_limite: '' });
  const [expandir, setExpandir] = useState(false);
  const [alturaCheia, setAlturaCheia] = useState(false);

  // Superset de transações em regime de competência para o tracker.
  // Query separada do estado global transacoes (usado por outras telas) para
  // incluir compras de cartão por mes_fatura sem quebrar outros componentes.
  const [transacoesOrcamento, setTransacoesOrcamento] = useState([]);

  const carregarTransacoesOrcamento = useCallback(async (entidadeId, ano, mes) => {
    if (!entidadeId) { setTransacoesOrcamento([]); return; }
    const mesRef = `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
    const [{ data: txsConta }, { data: txsCartao }] = await Promise.all([
      supabase.from('transacoes').select('*')
        .eq('entidade_id', entidadeId)
        .is('cartao_id', null)
        .is('transferencia_id', null)
        .neq('origem', 'fatura')
        .gte('data', primeiroDiaDoMes(ano, mes))
        .lte('data', ultimoDiaDoMes(ano, mes)),
      supabase.from('transacoes').select('*')
        .eq('entidade_id', entidadeId)
        .not('cartao_id', 'is', null)
        .is('transferencia_id', null)
        .neq('origem', 'fatura')
        .eq('mes_fatura', mesRef),
    ]);
    setTransacoesOrcamento([...(txsConta || []), ...(txsCartao || [])]);
  }, []);

  useEffect(() => {
    if (entidadeAtual) carregarTransacoesOrcamento(entidadeAtual, ano, mes);
  }, [entidadeAtual, ano, mes, carregarTransacoesOrcamento]);

  // Estado do orçamento inteligente
  const [analisando, setAnalisando] = useState(false);
  const [analise, setAnalise] = useState(null); // resultado da IA
  const [erroAnalise, setErroAnalise] = useState('');
  const [sugestoesEditaveis, setSugestoesEditaveis] = useState([]);
  const [modoAplicar, setModoAplicar] = useState(null); // 'substituir' | 'complementar' | null

  const carregarOrcamentos = useCallback(async (entidadeId) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('orcamentos')
      .select('*')
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: true });
    setOrcamentos(data || []);
  }, []);

  useEffect(() => {
    if (entidadeAtual) carregarOrcamentos(entidadeAtual);
  }, [entidadeAtual, carregarOrcamentos]);

  async function adicionarOrcamento(e) {
    e.preventDefault();
    if (!entidadeAtual || !categoriaOrcamento || !valorLimiteOrcamento) return;
    const { error } = await supabase.from('orcamentos').insert({
      entidade_id: entidadeAtual,
      categoria: categoriaOrcamento,
      valor_limite: parseFloat(valorLimiteOrcamento),
    });
    if (!error) {
      setCategoriaOrcamento('');
      setValorLimiteOrcamento('');
      setMostrarNovoOrcamento(false);
      carregarOrcamentos(entidadeAtual);
    }
  }

  function iniciarEdicaoOrcamento(o) {
    setEdicaoOrcamentoId(o.id);
    setFormOrcamento({ categoria: o.categoria, valor_limite: o.valor_limite });
  }

  async function salvarEdicaoOrcamento(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('orcamentos')
      .update({ categoria: formOrcamento.categoria, valor_limite: parseFloat(formOrcamento.valor_limite) })
      .eq('id', edicaoOrcamentoId);
    if (!error) {
      setEdicaoOrcamentoId(null);
      carregarOrcamentos(entidadeAtual);
    }
  }

  async function excluirOrcamento(id) {
    if (!window.confirm('Excluir este orçamento?')) return;
    const { error } = await supabase.from('orcamentos').delete().eq('id', id);
    if (!error) carregarOrcamentos(entidadeAtual);
  }

  // ── Orçamento inteligente ──────────────────────────────────────────────────

  async function gerarOrcamento() {
    setAnalisando(true);
    setErroAnalise('');
    setAnalise(null);
    setModoAplicar(null);

    try {
      // Busca até 6 meses para garantir que captura quem tem menos de 3.
      // O ideal é 3 meses — com menos, a análise avisa sobre a limitação.
      const hoje = new Date();
      const seisMesesAtras = new Date(hoje.getFullYear(), hoje.getMonth() - 6, 1).toISOString().slice(0, 10);

      const { data: txs } = await supabase
        .from('transacoes')
        .select('tipo, valor, categoria, essencialidade, data, cartao_id, mes_fatura, origem, transferencia_id')
        .eq('entidade_id', entidadeAtual)
        .is('transferencia_id', null)
        .neq('origem', 'fatura')
        .gte('data', seisMesesAtras)
        .order('data', { ascending: false });

      if (!txs || txs.length === 0) {
        setErroAnalise('Nenhum lançamento encontrado. Registre algumas transações primeiro para que o sistema possa analisar seu perfil de gastos.');
        return;
      }

      // Meses distintos por competência (mes_fatura para cartão, data para conta)
      const mesesDistintos = new Set(
        txs.map((t) => mesDeCompetencia(t)).filter(Boolean)
      );
      const mesesRef = Math.min(3, Math.max(1, mesesDistintos.size));
      const mesesReais = mesesDistintos.size;

      // Renda média (entradas de conta — mesDeCompetencia retorna non-null para elas)
      const totalReceitas = txs
        .filter((t) => t.tipo === 'entrada' && mesDeCompetencia(t) !== null)
        .reduce((s, t) => s + Number(t.valor), 0);
      const rendaMedia = totalReceitas / mesesRef;

      // Gasto médio por categoria — usa mesDeCompetencia para excluir faturas e
      // transferências e contar cada compra de cartão no mês correto
      const gastosPorCat = {};
      const essencialidadePorCat = {};
      txs.filter((t) => t.tipo === 'saida' && mesDeCompetencia(t) !== null).forEach((t) => {
        const cat = (t.categoria || 'Outros').trim();
        gastosPorCat[cat] = (gastosPorCat[cat] || 0) + Number(t.valor);
        if (t.essencialidade && !essencialidadePorCat[cat]) {
          essencialidadePorCat[cat] = t.essencialidade;
        }
      });

      const historico = Object.entries(gastosPorCat).map(([categoria, total]) => ({
        categoria,
        media: total / mesesRef,
        essencialidade: essencialidadePorCat[categoria] || null,
      })).sort((a, b) => b.media - a.media);

      const resposta = await fetch('/api/gerar-orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico, rendaMedia, mesesAnalisados: mesesRef, mesesReais }),
      });

      const json = await resposta.json();
      if (json.error) { setErroAnalise(json.error); return; }

      setAnalise({ ...json, rendaMedia, mesesAnalisados: mesesRef, mesesReais });
      setSugestoesEditaveis(json.categorias.map((c) => ({ ...c, incluir: true, valorEditado: c.sugestao })));

    } catch {
      setErroAnalise('Erro ao gerar o orçamento. Tente novamente.');
    } finally {
      setAnalisando(false);
    }
  }

  async function aplicarSugestoes() {
    const selecionadas = sugestoesEditaveis.filter((s) => s.incluir);
    if (selecionadas.length === 0) return;

    const categoriasExistentes = new Set(orcamentos.map((o) => o.categoria.toLowerCase()));

    if (modoAplicar === 'substituir') {
      // Apaga todos e recria com as selecionadas
      await supabase.from('orcamentos').delete().eq('entidade_id', entidadeAtual);
      await supabase.from('orcamentos').insert(
        selecionadas.map((s) => ({
          entidade_id: entidadeAtual,
          categoria: s.categoria,
          valor_limite: s.valorEditado,
        }))
      );
    } else {
      // Só insere categorias que ainda não existem
      const novas = selecionadas.filter((s) => !categoriasExistentes.has(s.categoria.toLowerCase()));
      if (novas.length > 0) {
        await supabase.from('orcamentos').insert(
          novas.map((s) => ({
            entidade_id: entidadeAtual,
            categoria: s.categoria,
            valor_limite: s.valorEditado,
          }))
        );
      }
    }

    setAnalise(null);
    setSugestoesEditaveis([]);
    setModoAplicar(null);
    carregarOrcamentos(entidadeAtual);
  }

  // ── Cálculos do mês atual ─────────────────────────────────────────────────

  const gastosPorCat = gastoPorCategoriaNoMes(transacoesOrcamento, ano, mes);

  function gastoDaCategoria(categoria) {
    return gastosPorCat[categoria] ?? 0;
  }

  const totalOrcado = orcamentos.reduce((s, o) => s + Number(o.valor_limite), 0);
  const totalGastoOrcado = orcamentos.reduce((s, o) => s + gastoDaCategoria(o.categoria), 0);
  const disponivel = totalOrcado - totalGastoOrcado;
  const diasRestantes = diasRestantesNoMes(ano, mes);
  const disponivelPorDia = diasRestantes && diasRestantes > 0 ? disponivel / diasRestantes : null;

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon"><ClipboardList size={16} /></span><p className="card-title">Orçamento por categoria</p></span>
        <div className="card-header-actions">
          {aberto && !analise && (
            <>
              <button onClick={gerarOrcamento} disabled={analisando} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {analisando ? <><Loader2 size={14} className="spin" /> Analisando...</> : <><Sparkles size={14} /> Gerar inteligente</>}
              </button>
              <button onClick={() => setMostrarNovoOrcamento((v) => !v)} className="btn btn-ghost">+ Novo</button>
            </>
          )}
          {analise && (
            <button onClick={() => { setAnalise(null); setSugestoesEditaveis([]); setModoAplicar(null); }} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <X size={14} /> Fechar análise
            </button>
          )}
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        </div>
      </div>

      {aberto && (
        <>
          {/* ── Painel de análise da IA ── */}
          {analise && (
            <div style={{ marginBottom: 20 }}>

              {/* Resumo */}
              <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <p style={{ fontSize: 'var(--text-md)', margin: 0, fontWeight: 'var(--weight-semibold)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart3 size={14} /> Análise baseada em {analise.mesesReais} {analise.mesesReais === 1 ? 'mês' : 'meses'} de histórico
                  </p>
                  {analise.mesesReais < 3 && (
                    <span style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 999, background: 'var(--accent-tint)', color: 'var(--accent-text)', fontWeight: 'var(--weight-semibold)' }}>
                      análise parcial — ideal com 3 meses
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 10px' }}>
                  Renda média: <strong>{formatarMoeda(analise.rendaMedia)}/mês</strong>
                  {analise.mesesReais < 3 && ' · as sugestões ficarão mais precisas conforme você registrar mais lançamentos'}
                </p>
                <p style={{ fontSize: 'var(--text-md)', margin: 0, lineHeight: 1.6 }}>{analise.resumo}</p>
              </div>

              {/* Alertas */}
              {analise.alertas?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  {analise.alertas.map((a, i) => (
                    <p key={i} style={{ fontSize: 'var(--text-md)', margin: '0 0 6px', paddingLeft: 12, borderLeft: '3px solid var(--negative)', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={14} /> {a}
                    </p>
                  ))}
                </div>
              )}

              {/* Recomendações */}
              {analise.recomendacoes?.length > 0 && (
                <div style={{ background: 'var(--primary-tint)', borderRadius: 'var(--radius-sm)', padding: '10px 16px', marginBottom: 16 }}>
                  <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', margin: '0 0 6px', color: 'var(--primary-dark)' }}>
                    Recomendações
                  </p>
                  {analise.recomendacoes.map((r, i) => (
                    <p key={i} style={{ fontSize: 'var(--text-md)', margin: '0 0 4px', color: 'var(--primary-dark)' }}>→ {r}</p>
                  ))}
                </div>
              )}

              {/* Sugestões editáveis por categoria */}
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Revise as sugestões — ajuste os valores ou desmarque categorias que não quiser aplicar:
              </p>

              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                {sugestoesEditaveis.map((s, i) => (
                  <div key={s.categoria} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', opacity: s.incluir ? 1 : 0.45 }}>
                    <input type="checkbox" checked={s.incluir} onChange={() => setSugestoesEditaveis((prev) => prev.map((x, j) => j === i ? { ...x, incluir: !x.incluir } : x))} />
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <span style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-medium)' }}>{s.categoria}</span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginLeft: 8 }}>
                        média: {formatarMoeda(s.media_gasta)}/mês
                      </span>
                    </div>
                    <BadgeStatus status={s.status} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Limite:</span>
                      <input
                        type="number"
                        step="0.01"
                        value={s.valorEditado}
                        onChange={(e) => setSugestoesEditaveis((prev) => prev.map((x, j) => j === i ? { ...x, valorEditado: parseFloat(e.target.value) || 0 } : x))}
                        className="input"
                        style={{ width: 100 }}
                        disabled={!s.incluir}
                      />
                    </div>
                    {s.justificativa && (
                      <p style={{ width: '100%', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
                        {s.justificativa}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {analise.sobra_sugerida !== undefined && (
                <p style={{ fontSize: 'var(--text-sm)', margin: '10px 0 0', color: analise.sobra_sugerida >= 0 ? 'var(--primary)' : 'var(--negative)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {analise.sobra_sugerida >= 0
                    ? <><CheckCircle2 size={14} /> Com esse orçamento, sobraria {formatarMoeda(analise.sobra_sugerida)}/mês para reserva ou investimento.</>
                    : <><AlertTriangle size={14} /> Mesmo com esse orçamento, os gastos superam a renda em {formatarMoeda(Math.abs(analise.sobra_sugerida))}/mês.</>}
                </p>
              )}

              {/* Pergunta: substituir ou complementar */}
              {modoAplicar === null ? (
                <div style={{ marginTop: 16, padding: '14px 16px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                  <p style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', margin: '0 0 10px' }}>
                    Como aplicar as sugestões selecionadas?
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={() => setModoAplicar('substituir')} className="btn btn-primary">
                      Substituir tudo
                    </button>
                    <button onClick={() => setModoAplicar('complementar')} className="btn btn-ghost">
                      Só as categorias que ainda não tenho
                    </button>
                  </div>
                  <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                    "Substituir tudo" apaga os orçamentos atuais e cria os sugeridos. "Só as que não tenho" mantém o que você já configurou.
                  </p>
                </div>
              ) : (
                <div style={{ marginTop: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={aplicarSugestoes} className="btn btn-primary">
                    Confirmar e aplicar ({sugestoesEditaveis.filter((s) => s.incluir).length} categorias)
                  </button>
                  <button onClick={() => setModoAplicar(null)} className="btn-link">Voltar</button>
                </div>
              )}
            </div>
          )}

          {erroAnalise && (
            <p style={{ color: 'var(--negative)', fontSize: 'var(--text-sm)', margin: '0 0 12px' }}>{erroAnalise}</p>
          )}

          {/* ── Orçamentos existentes ── */}
          {!analise && (
            <>
              {orcamentos.length > 0 && (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 'var(--text-md)' }}>
                  <span>Orçado: <strong>{formatarMoeda(totalOrcado)}</strong></span>
                  <span>Gasto: <strong>{formatarMoeda(totalGastoOrcado)}</strong></span>
                  <span style={{ color: disponivel >= 0 ? 'var(--primary)' : 'var(--negative)' }}>
                    {disponivel >= 0 ? 'Disponível' : 'Excedeu'}: <strong>{formatarMoeda(Math.abs(disponivel))}</strong>
                  </span>
                  {disponivelPorDia !== null && (
                    <span>Por dia até o fim do mês: <strong>{formatarMoeda(Math.max(0, disponivelPorDia))}</strong></span>
                  )}
                </div>
              )}

              <div className={`card-limitada ${(alturaCheia || mostrarNovoOrcamento) ? 'expandida' : ''}`}>
                {mostrarNovoOrcamento && (
                  <form onSubmit={adicionarOrcamento} className="form-row" style={{ marginBottom: 12 }}>
                    <CampoCategoria entidadeAtual={entidadeAtual} tipo="saida" value={categoriaOrcamento} onChange={(e) => setCategoriaOrcamento(e.target.value)} placeholder="Categoria (ex: Alimentação)" style={{ flex: 1 }} />
                    <input className="input" style={{ width: 130 }} type="number" step="0.01" placeholder="Limite mensal" value={valorLimiteOrcamento} onChange={(e) => setValorLimiteOrcamento(e.target.value)} required autoFocus />
                    <button type="submit" className="btn btn-primary">Salvar</button>
                  </form>
                )}

                {orcamentos.length === 0 && !mostrarNovoOrcamento && (
                  <p className="empty-hint">Nenhum orçamento cadastrado. Use "Gerar inteligente" para o sistema analisar seu histórico — funciona com qualquer quantidade de dados, mas fica mais preciso com 3 meses de lançamentos.</p>
                )}

                {(expandir ? orcamentos : orcamentos.slice(0, LIMITE_LISTA)).map((o) => {
                  if (edicaoOrcamentoId === o.id) {
                    return (
                      <form key={o.id} onSubmit={salvarEdicaoOrcamento} className="form-row" style={{ padding: '8px 0' }}>
                        <input className="input" value={formOrcamento.categoria} onChange={(e) => setFormOrcamento({ ...formOrcamento, categoria: e.target.value })} required />
                        <input className="input" style={{ width: 130 }} type="number" step="0.01" value={formOrcamento.valor_limite} onChange={(e) => setFormOrcamento({ ...formOrcamento, valor_limite: e.target.value })} required />
                        <button type="submit" className="btn btn-primary">Salvar</button>
                        <button type="button" onClick={() => setEdicaoOrcamentoId(null)} className="btn-link">Cancelar</button>
                      </form>
                    );
                  }

                  const gasto = gastoDaCategoria(o.categoria);
                  const percentual = Math.max(0, Math.min(100, (gasto / Number(o.valor_limite)) * 100));
                  const excedeu = gasto > Number(o.valor_limite);

                  return (
                    <div key={o.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                      <div className="row-main" style={{ marginBottom: 6 }}>
                        <span className="row-title">{o.categoria}</span>
                        <span style={{ fontSize: 'var(--text-md)' }}>{formatarMoeda(gasto)} / {formatarMoeda(o.valor_limite)}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden' }}>
                        <div style={{ width: `${percentual}%`, height: '100%', background: excedeu ? 'var(--negative)' : 'var(--primary)', transition: 'width 0.3s' }} />
                      </div>
                      <div className="row-main" style={{ marginTop: 6 }}>
                        <span className="row-subtitle" style={{ color: excedeu ? 'var(--negative)' : 'var(--text-muted)' }}>
                          {excedeu ? `excedeu ${formatarMoeda(gasto - o.valor_limite)}` : `restam ${formatarMoeda(o.valor_limite - gasto)}`}
                        </span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button onClick={() => iniciarEdicaoOrcamento(o)} className="btn-link">editar</button>
                          <button onClick={() => excluirOrcamento(o.id)} className="btn-link">excluir</button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {orcamentos.length > LIMITE_LISTA && (
                  <div className="show-more-row">
                    <button onClick={() => setExpandir((v) => !v)} className="btn-link">
                      {expandir ? 'ver menos' : `ver mais (${orcamentos.length - LIMITE_LISTA})`}
                    </button>
                  </div>
                )}
              </div>

              <button onClick={() => setAlturaCheia((v) => !v)} className="ver-card-completo">
                {alturaCheia ? 'Recolher' : 'Ver orçamento completo'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
