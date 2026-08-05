'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';
import { recalcularSaldoConta } from '../../lib/saldos';
import ImportadorExtrato from './ImportadorExtrato';

const LIMITE_LISTA = 6;

export default function CardContas({ entidadeAtual, contas, aberto, onAlternarAberto, onContasAlteradas }) {
  const [mostrarNovaConta, setMostrarNovaConta] = useState(false);
  const [nomeConta, setNomeConta] = useState('');
  const [saldoConta, setSaldoConta] = useState('');
  const [edicaoContaId, setEdicaoContaId] = useState(null);
  const [formConta, setFormConta] = useState({ nome: '', saldo_inicial: '' });

  const [mostrarTransferencia, setMostrarTransferencia] = useState(false);
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [valorTransferencia, setValorTransferencia] = useState('');

  const [mostrarImportar, setMostrarImportar] = useState(false);

  const [expandirContas, setExpandirContas] = useState(false);
  const [alturaCheiaContas, setAlturaCheiaContas] = useState(false);

  async function adicionarConta(e) {
    e.preventDefault();
    if (!entidadeAtual || !nomeConta) return;
    const valorInicial = parseFloat(saldoConta || '0');
    const ehPrimeira = contas.length === 0;

    const { error } = await supabase.from('contas').insert({
      entidade_id: entidadeAtual, nome: nomeConta, saldo_inicial: valorInicial, saldo_atual: valorInicial, principal: ehPrimeira,
    });

    if (!error) {
      setNomeConta('');
      setSaldoConta('');
      setMostrarNovaConta(false);
      onContasAlteradas();
    }
  }

  function iniciarEdicaoConta(c) {
    setEdicaoContaId(c.id);
    setFormConta({ nome: c.nome, saldo_inicial: c.saldo_inicial });
  }

  async function salvarEdicaoConta(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('contas')
      .update({ nome: formConta.nome, saldo_inicial: parseFloat(formConta.saldo_inicial || '0') })
      .eq('id', edicaoContaId);

    if (!error) {
      await recalcularSaldoConta(edicaoContaId);
      setEdicaoContaId(null);
      onContasAlteradas();
    }
  }

  async function excluirConta(id) {
    if (!window.confirm('Excluir esta conta? Lançamentos fixos vinculados a ela ficam sem conta de origem.')) return;
    const { error } = await supabase.from('contas').delete().eq('id', id);
    if (!error) onContasAlteradas();
  }

  async function alternarPrincipal(conta) {
    if (conta.principal) {
      await supabase.from('contas').update({ principal: false }).eq('id', conta.id);
    } else {
      await supabase.from('contas').update({ principal: false }).eq('entidade_id', entidadeAtual).neq('id', conta.id);
      await supabase.from('contas').update({ principal: true }).eq('id', conta.id);
    }
    onContasAlteradas();
  }

  async function realizarTransferencia(e) {
    e.preventDefault();
    if (!entidadeAtual || !contaOrigemId || !contaDestinoId || !valorTransferencia) return;
    if (contaOrigemId === contaDestinoId) return;

    const contaOrigem = contas.find((c) => c.id === contaOrigemId);
    const contaDestino = contas.find((c) => c.id === contaDestinoId);
    const valorNum = parseFloat(valorTransferencia);
    const transferenciaId = crypto.randomUUID();

    const { error } = await supabase.from('transacoes').insert([
      { entidade_id: entidadeAtual, conta_id: contaOrigemId, valor: valorNum, tipo: 'saida', categoria: 'transferencia', descricao: `Transferência para ${contaDestino ? contaDestino.nome : 'outra conta'}`, origem: 'transferencia', status: 'pago', transferencia_id: transferenciaId },
      { entidade_id: entidadeAtual, conta_id: contaDestinoId, valor: valorNum, tipo: 'entrada', categoria: 'transferencia', descricao: `Transferência de ${contaOrigem ? contaOrigem.nome : 'outra conta'}`, origem: 'transferencia', status: 'pago', transferencia_id: transferenciaId },
    ]);

    if (error) return;

    await recalcularSaldoConta(contaOrigemId);
    await recalcularSaldoConta(contaDestinoId);

    setContaOrigemId('');
    setContaDestinoId('');
    setValorTransferencia('');
    setMostrarTransferencia(false);
    onContasAlteradas();
  }


  return (
    <div className="card card-contas" id="secao-contas">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon">🏦</span><p className="card-title">Contas</p></span>
        <div className="card-header-actions">
          {contas.length >= 2 && <button onClick={() => setMostrarTransferencia((v) => !v)} className="btn btn-ghost">⇄ Transferir</button>}
          <button onClick={() => setMostrarImportar((v) => !v)} className="btn btn-ghost">⬆ Importar extrato</button>
          <button onClick={() => setMostrarNovaConta((v) => !v)} className="btn btn-ghost">+ Nova conta</button>
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? '▾' : '▸'}</button>
        </div>
      </div>

      {aberto && (
        <>
          <div className={`card-limitada ${(alturaCheiaContas || mostrarNovaConta || mostrarTransferencia || mostrarImportar) ? 'expandida' : ''}`}>
          {mostrarNovaConta && (
            <form onSubmit={adicionarConta} className="form-row" style={{ marginBottom: 12 }}>
              <input className="input" placeholder="Nome (ex: Nubank)" value={nomeConta} onChange={(e) => setNomeConta(e.target.value)} required autoFocus />
              <input className="input" style={{ width: 120 }} type="number" step="0.01" placeholder="Saldo inicial" value={saldoConta} onChange={(e) => setSaldoConta(e.target.value)} />
              <button type="submit" className="btn btn-primary">Salvar</button>
            </form>
          )}

          {mostrarTransferencia && (
            <form onSubmit={realizarTransferencia} className="form-row" style={{ marginBottom: 12 }}>
              <select className="input" value={contaOrigemId} onChange={(e) => setContaOrigemId(e.target.value)} required>
                <option value="">De qual conta</option>
                {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
              </select>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>→</span>
              <select className="input" value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)} required>
                <option value="">Para qual conta</option>
                {contas.filter((c) => c.id !== contaOrigemId).map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
              </select>
              <input className="input" style={{ width: 110 }} type="number" step="0.01" placeholder="Valor" value={valorTransferencia} onChange={(e) => setValorTransferencia(e.target.value)} required />
              <button type="submit" className="btn btn-primary">Transferir</button>
            </form>
          )}

          {mostrarImportar && (
            <ImportadorExtrato
              modo="conta"
              entidadeAtual={entidadeAtual}
              contas={contas}
              onConcluido={() => { setMostrarImportar(false); onContasAlteradas(); }}
            />
          )}

          {contas.length === 0 && <p className="empty-hint">Nenhuma conta cadastrada ainda.</p>}
          {(expandirContas ? contas : contas.slice(0, LIMITE_LISTA)).map((c) => (
            edicaoContaId === c.id ? (
              <form key={c.id} onSubmit={salvarEdicaoConta} className="form-row" style={{ padding: '8px 0' }}>
                <input className="input" value={formConta.nome} onChange={(e) => setFormConta({ ...formConta, nome: e.target.value })} required />
                <input className="input" style={{ width: 130 }} type="number" step="0.01" value={formConta.saldo_inicial} onChange={(e) => setFormConta({ ...formConta, saldo_inicial: e.target.value })} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>saldo inicial</span>
                <button type="submit" className="btn btn-primary">Salvar</button>
                <button type="button" onClick={() => setEdicaoContaId(null)} className="btn-link">Cancelar</button>
              </form>
            ) : (
              <div key={c.id} className="row-main row">
                <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => alternarPrincipal(c)} className={`star-btn ${c.principal ? 'is-principal' : ''}`} title="Definir como conta principal">★</button>
                  {c.nome}
                </span>
                <div className="row-actions">
                  <span className={`amount ${Number(c.saldo_atual) < 0 ? 'amount-negative' : ''}`}>{formatarMoeda(c.saldo_atual)}</span>
                  <button onClick={() => iniciarEdicaoConta(c)} className="btn-link">editar</button>
                  <button onClick={() => excluirConta(c.id)} className="btn-link">excluir</button>
                </div>
              </div>
            )
          ))}
          {contas.length > LIMITE_LISTA && (
            <div className="show-more-row">
              <button onClick={() => setExpandirContas((v) => !v)} className="btn-link">
                {expandirContas ? 'ver menos' : `ver mais (${contas.length - LIMITE_LISTA})`}
              </button>
            </div>
          )}
          </div>
          <button onClick={() => setAlturaCheiaContas((v) => !v)} className="ver-card-completo">
            {alturaCheiaContas ? 'Recolher' : 'Ver conta completa'}
          </button>
        </>
      )}
    </div>
  );
}
