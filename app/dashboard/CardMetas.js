'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const LIMITE_LISTA = 6;

function formatarMoeda(v) {
  return `R$ ${Number(v).toFixed(2)}`;
}

export default function CardMetas({ entidadeAtual, contas, aberto, onAlternarAberto }) {
  const [metas, setMetas] = useState([]);
  const [mostrarNovaMeta, setMostrarNovaMeta] = useState(false);
  const [nomeMeta, setNomeMeta] = useState('');
  const [valorAlvoMeta, setValorAlvoMeta] = useState('');
  const [dataAlvoMeta, setDataAlvoMeta] = useState('');
  const [contaMetaId, setContaMetaId] = useState('');
  const [edicaoMetaId, setEdicaoMetaId] = useState(null);
  const [formMeta, setFormMeta] = useState({ nome: '', valor_alvo: '', data_alvo: '', conta_id: '' });
  const [expandirMetas, setExpandirMetas] = useState(false);
  const [aporteMetaId, setAporteMetaId] = useState(null);
  const [valorAporte, setValorAporte] = useState('');

  const carregarMetas = useCallback(async (entidadeId) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('metas')
      .select('*')
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: true });

    setMetas(data || []);
  }, []);

  useEffect(() => {
    if (entidadeAtual) carregarMetas(entidadeAtual);
  }, [entidadeAtual, carregarMetas]);

  async function adicionarMeta(e) {
    e.preventDefault();
    if (!entidadeAtual || !nomeMeta || !valorAlvoMeta) return;

    const { error } = await supabase.from('metas').insert({
      entidade_id: entidadeAtual,
      nome: nomeMeta,
      valor_alvo: parseFloat(valorAlvoMeta),
      data_alvo: dataAlvoMeta || null,
      conta_id: contaMetaId || null,
    });

    if (!error) {
      setNomeMeta('');
      setValorAlvoMeta('');
      setDataAlvoMeta('');
      setContaMetaId('');
      setMostrarNovaMeta(false);
      carregarMetas(entidadeAtual);
    }
  }

  function iniciarEdicaoMeta(m) {
    setEdicaoMetaId(m.id);
    setFormMeta({ nome: m.nome, valor_alvo: m.valor_alvo, data_alvo: m.data_alvo || '', conta_id: m.conta_id || '' });
  }

  async function salvarEdicaoMeta(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('metas')
      .update({
        nome: formMeta.nome,
        valor_alvo: parseFloat(formMeta.valor_alvo),
        data_alvo: formMeta.data_alvo || null,
        conta_id: formMeta.conta_id || null,
      })
      .eq('id', edicaoMetaId);

    if (!error) {
      setEdicaoMetaId(null);
      carregarMetas(entidadeAtual);
    }
  }

  async function excluirMeta(id) {
    if (!window.confirm('Excluir esta meta?')) return;
    const { error } = await supabase.from('metas').delete().eq('id', id);
    if (!error) carregarMetas(entidadeAtual);
  }

  function iniciarAporte(meta) {
    setAporteMetaId(meta.id);
    setValorAporte('');
  }

  async function confirmarAporte(e, meta) {
    e.preventDefault();
    const incremento = parseFloat(valorAporte);
    if (!incremento) return;

    const { error } = await supabase
      .from('metas')
      .update({ valor_atual: Number(meta.valor_atual) + incremento })
      .eq('id', meta.id);

    if (!error) {
      setAporteMetaId(null);
      setValorAporte('');
      carregarMetas(entidadeAtual);
    }
  }

  return (
    <div className="card" id="secao-metas">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon">🎯</span><p className="card-title">Metas financeiras</p></span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setMostrarNovaMeta((v) => !v)} className="btn btn-ghost">+ Nova meta</button>
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? '▾' : '▸'}</button>
        </div>
      </div>

      {aberto && (
        <>
          {mostrarNovaMeta && (
            <form onSubmit={adicionarMeta} className="form-row" style={{ marginBottom: 12 }}>
              <input className="input" placeholder="Nome (ex: Viagem, Reserva)" value={nomeMeta} onChange={(e) => setNomeMeta(e.target.value)} required />
              <input className="input" style={{ width: 120 }} type="number" step="0.01" placeholder="Valor alvo" value={valorAlvoMeta} onChange={(e) => setValorAlvoMeta(e.target.value)} required />
              <input className="input" style={{ width: 150 }} type="date" value={dataAlvoMeta} onChange={(e) => setDataAlvoMeta(e.target.value)} />
              <select className="input" value={contaMetaId} onChange={(e) => setContaMetaId(e.target.value)}>
                <option value="">Controle manual (sem conta)</option>
                {contas.map((c) => (<option key={c.id} value={c.id}>Vincular: {c.nome}</option>))}
              </select>
              <button type="submit" className="btn btn-primary">Salvar</button>
            </form>
          )}

          {metas.length === 0 && <p className="empty-hint">Nenhuma meta cadastrada ainda.</p>}
          {(expandirMetas ? metas : metas.slice(0, LIMITE_LISTA)).map((m) => {
            if (edicaoMetaId === m.id) {
              return (
                <form key={m.id} onSubmit={salvarEdicaoMeta} className="form-row" style={{ padding: '8px 0' }}>
                  <input className="input" value={formMeta.nome} onChange={(e) => setFormMeta({ ...formMeta, nome: e.target.value })} required />
                  <input className="input" style={{ width: 120 }} type="number" step="0.01" value={formMeta.valor_alvo} onChange={(e) => setFormMeta({ ...formMeta, valor_alvo: e.target.value })} required />
                  <input className="input" style={{ width: 150 }} type="date" value={formMeta.data_alvo} onChange={(e) => setFormMeta({ ...formMeta, data_alvo: e.target.value })} />
                  <select className="input" value={formMeta.conta_id} onChange={(e) => setFormMeta({ ...formMeta, conta_id: e.target.value })}>
                    <option value="">Controle manual (sem conta)</option>
                    {contas.map((c) => (<option key={c.id} value={c.id}>Vincular: {c.nome}</option>))}
                  </select>
                  <button type="submit" className="btn btn-primary">Salvar</button>
                  <button type="button" onClick={() => setEdicaoMetaId(null)} className="btn-link">Cancelar</button>
                </form>
              );
            }

            const contaVinculada = contas.find((c) => c.id === m.conta_id);
            const progresso = contaVinculada ? Number(contaVinculada.saldo_atual) : Number(m.valor_atual);
            const percentual = Math.max(0, Math.min(100, (progresso / Number(m.valor_alvo)) * 100));
            const concluida = progresso >= Number(m.valor_alvo);

            let prazoTexto = null;
            if (m.data_alvo) {
              const dias = Math.ceil((new Date(m.data_alvo) - new Date()) / (1000 * 60 * 60 * 24));
              prazoTexto = dias < 0 ? `prazo vencido há ${Math.abs(dias)}d` : dias === 0 ? 'prazo é hoje' : `${dias}d restantes`;
            }

            return (
              <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                <div className="row-main" style={{ marginBottom: 6 }}>
                  <span className="row-title">{concluida && '🎉 '}{m.nome}{contaVinculada ? ` · ${contaVinculada.nome}` : ''}</span>
                  <span style={{ fontSize: 13 }}>{formatarMoeda(progresso)} / {formatarMoeda(m.valor_alvo)}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden' }}>
                  <div style={{ width: `${percentual}%`, height: '100%', background: concluida ? 'var(--primary)' : 'var(--accent)' }} />
                </div>
                <div className="row-main" style={{ marginTop: 6 }}>
                  <span className="row-subtitle">{percentual.toFixed(0)}%{prazoTexto ? ` · ${prazoTexto}` : ''}</span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    {!contaVinculada && aporteMetaId !== m.id && (
                      <button onClick={() => iniciarAporte(m)} className="btn-link">+ adicionar valor</button>
                    )}
                    <button onClick={() => iniciarEdicaoMeta(m)} className="btn-link">editar</button>
                    <button onClick={() => excluirMeta(m.id)} className="btn-link">excluir</button>
                  </div>
                </div>
                {aporteMetaId === m.id && (
                  <form onSubmit={(e) => confirmarAporte(e, m)} className="form-row" style={{ marginTop: 8 }}>
                    <input className="input" style={{ width: 120 }} type="number" step="0.01" placeholder="Valor" value={valorAporte} onChange={(e) => setValorAporte(e.target.value)} required autoFocus />
                    <button type="submit" className="btn btn-primary">Adicionar</button>
                    <button type="button" onClick={() => setAporteMetaId(null)} className="btn-link">Cancelar</button>
                  </form>
                )}
              </div>
            );
          })}
          {metas.length > LIMITE_LISTA && (
            <div className="show-more-row">
              <button onClick={() => setExpandirMetas((v) => !v)} className="btn-link">
                {expandirMetas ? 'ver menos' : `ver mais (${metas.length - LIMITE_LISTA})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
