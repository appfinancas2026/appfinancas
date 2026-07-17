'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';

const LIMITE_LISTA = 6;

function diasRestantesNoMes(ano, mes) {
  const hoje = new Date();
  if (ano !== hoje.getFullYear() || mes !== hoje.getMonth()) return null;
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return ultimoDia - hoje.getDate() + 1;
}

export default function CardOrcamento({ entidadeAtual, transacoesDoMes, ano, mes, aberto, onAlternarAberto }) {
  const [orcamentos, setOrcamentos] = useState([]);
  const [mostrarNovoOrcamento, setMostrarNovoOrcamento] = useState(false);
  const [categoriaOrcamento, setCategoriaOrcamento] = useState('');
  const [valorLimiteOrcamento, setValorLimiteOrcamento] = useState('');
  const [edicaoOrcamentoId, setEdicaoOrcamentoId] = useState(null);
  const [formOrcamento, setFormOrcamento] = useState({ categoria: '', valor_limite: '' });
  const [expandir, setExpandir] = useState(false);
  const [alturaCheia, setAlturaCheia] = useState(false);

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

  const despesasDoMes = transacoesDoMes.filter((t) => t.tipo === 'saida' && !t.transferencia_id);

  function gastoDaCategoria(categoria) {
    return despesasDoMes.filter((t) => (t.categoria || '') === categoria).reduce((s, t) => s + Number(t.valor), 0);
  }

  const totalOrcado = orcamentos.reduce((s, o) => s + Number(o.valor_limite), 0);
  const totalGastoOrcado = orcamentos.reduce((s, o) => s + gastoDaCategoria(o.categoria), 0);
  const disponivel = totalOrcado - totalGastoOrcado;
  const diasRestantes = diasRestantesNoMes(ano, mes);
  const disponivelPorDia = diasRestantes && diasRestantes > 0 ? disponivel / diasRestantes : null;

  return (
    <div className="card" id="secao-orcamento">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon">📋</span><p className="card-title">Orçamento por categoria</p></span>
        <div className="card-header-actions">
          <button onClick={() => setMostrarNovoOrcamento((v) => !v)} className="btn btn-ghost">+ Novo orçamento</button>
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? '▾' : '▸'}</button>
        </div>
      </div>

      {aberto && (
        <>
          {orcamentos.length > 0 && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
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
              <input className="input" placeholder="Categoria (ex: Alimentação)" value={categoriaOrcamento} onChange={(e) => setCategoriaOrcamento(e.target.value)} required autoFocus />
              <input className="input" style={{ width: 130 }} type="number" step="0.01" placeholder="Limite mensal" value={valorLimiteOrcamento} onChange={(e) => setValorLimiteOrcamento(e.target.value)} required />
              <button type="submit" className="btn btn-primary">Salvar</button>
            </form>
          )}

          {orcamentos.length === 0 && <p className="empty-hint">Nenhum orçamento cadastrado ainda.</p>}
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
                  <span style={{ fontSize: 13 }}>{formatarMoeda(gasto)} / {formatarMoeda(o.valor_limite)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden' }}>
                  <div style={{ width: `${percentual}%`, height: '100%', background: excedeu ? 'var(--negative)' : 'var(--primary)' }} />
                </div>
                <div className="row-main" style={{ marginTop: 6 }}>
                  <span className="row-subtitle" style={{ color: excedeu ? 'var(--negative)' : 'var(--text-muted)' }}>
                    {excedeu ? `excedeu ${formatarMoeda(gasto - o.valor_limite)}` : `restam ${formatarMoeda(o.valor_limite - gasto)}`}
                  </span>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
    </div>
  );
}
