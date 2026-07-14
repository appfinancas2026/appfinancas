'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda, parseOFX, parseCSVExtrato, calcularMesFaturaCompra, recalcularSaldoConta } from '../../lib/financeiro';

const LIMITE_LISTA = 6;

export default function CardContas({ entidadeAtual, contas, cartoes, aberto, onAlternarAberto, onContasAlteradas }) {
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
  const [destinoImportacaoId, setDestinoImportacaoId] = useState('');
  const [previewImportacao, setPreviewImportacao] = useState([]);
  const [nomeArquivoImportado, setNomeArquivoImportado] = useState('');
  const [importando, setImportando] = useState(false);

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

  function handleArquivoExtrato(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    setNomeArquivoImportado(arquivo.name);
    const extensao = arquivo.name.split('.').pop().toLowerCase();

    const leitor = new FileReader();
    leitor.onload = (evento) => {
      const texto = evento.target.result;
      const resultado = extensao === 'csv' ? parseCSVExtrato(texto) : parseOFX(texto);
      setPreviewImportacao(resultado);
    };
    leitor.readAsText(arquivo, 'ISO-8859-1');
  }

  function alternarInclusaoPreview(index) {
    setPreviewImportacao((lista) => lista.map((t, i) => (i === index ? { ...t, incluir: !t.incluir } : t)));
  }

  function marcarTodosPreview(valor) {
    setPreviewImportacao((lista) => lista.map((t) => ({ ...t, incluir: valor })));
  }

  async function confirmarImportacao() {
    if (!destinoImportacaoId || previewImportacao.length === 0) return;
    setImportando(true);

    const [tipoDestino, idDestino] = destinoImportacaoId.split(':');
    const cartaoSelecionado = tipoDestino === 'cartao' ? cartoes.find((c) => c.id === idDestino) : null;

    const selecionadas = previewImportacao.filter((t) => t.incluir);
    const referencias = selecionadas.map((t) => t.referencia_externa).filter(Boolean);

    let existentes = new Set();
    if (referencias.length > 0) {
      let consulta = supabase.from('transacoes').select('referencia_externa').in('referencia_externa', referencias);
      consulta = tipoDestino === 'cartao' ? consulta.eq('cartao_id', idDestino) : consulta.eq('conta_id', idDestino);
      const { data } = await consulta;
      existentes = new Set((data || []).map((t) => t.referencia_externa));
    }

    const novas = selecionadas
      .filter((t) => !t.referencia_externa || !existentes.has(t.referencia_externa))
      .map((t) => {
        const base = {
          entidade_id: entidadeAtual,
          valor: t.valor,
          tipo: t.tipo,
          categoria: 'importado',
          descricao: t.descricao,
          data: t.data,
          origem: 'importado',
          status: 'pago',
          referencia_externa: t.referencia_externa,
        };

        if (tipoDestino === 'cartao') {
          return { ...base, tipo: 'saida', cartao_id: idDestino, mes_fatura: calcularMesFaturaCompra(cartaoSelecionado, t.data) };
        }
        return { ...base, conta_id: idDestino };
      });

    const ignoradas = selecionadas.length - novas.length;

    if (novas.length > 0) {
      await supabase.from('transacoes').insert(novas);
      if (tipoDestino === 'conta') await recalcularSaldoConta(idDestino);
    }

    setImportando(false);
    setPreviewImportacao([]);
    setNomeArquivoImportado('');
    setMostrarImportar(false);
    onContasAlteradas();

    window.alert(`${novas.length} lançamento(s) importado(s).${ignoradas > 0 ? ` ${ignoradas} já existiam e foram ignorados.` : ''}`);
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
              <input className="input" placeholder="Nome (ex: Nubank)" value={nomeConta} onChange={(e) => setNomeConta(e.target.value)} required />
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
            <div style={{ marginBottom: 12, padding: 12, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
              <div className="form-row" style={{ marginBottom: previewImportacao.length > 0 ? 12 : 0 }}>
                <select className="input" value={destinoImportacaoId} onChange={(e) => setDestinoImportacaoId(e.target.value)} required>
                  <option value="">Importar para...</option>
                  {contas.length > 0 && (
                    <optgroup label="Contas">
                      {contas.map((c) => (<option key={`conta:${c.id}`} value={`conta:${c.id}`}>{c.nome}</option>))}
                    </optgroup>
                  )}
                  {cartoes.length > 0 && (
                    <optgroup label="Cartões de crédito">
                      {cartoes.map((c) => (<option key={`cartao:${c.id}`} value={`cartao:${c.id}`}>{c.nome} (fatura)</option>))}
                    </optgroup>
                  )}
                </select>
                <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                  {nomeArquivoImportado || 'Escolher arquivo .ofx ou .csv'}
                  <input type="file" accept=".ofx,.csv" onChange={handleArquivoExtrato} style={{ display: 'none' }} />
                </label>
              </div>

              {destinoImportacaoId.startsWith('cartao:') && previewImportacao.length > 0 && (
                <p className="empty-hint" style={{ margin: '0 0 8px' }}>
                  Todos os itens selecionados entram como compras (despesa) na fatura correspondente à data de cada um.
                </p>
              )}

              {previewImportacao.length > 0 && (
                <>
                  <p className="empty-hint" style={{ margin: '0 0 8px' }}>
                    {previewImportacao.length} lançamento(s) encontrado(s). Confira antes de importar.
                  </p>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => marcarTodosPreview(true)} className="btn-link">marcar todos</button>
                    <button onClick={() => marcarTodosPreview(false)} className="btn-link">desmarcar todos</button>
                  </div>
                  <div style={{ maxHeight: 260, overflowY: 'auto', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
                    {previewImportacao.map((t, i) => (
                      <div key={i} className="row row-main" style={{ opacity: t.incluir ? 1 : 0.4 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                          <input type="checkbox" checked={t.incluir} onChange={() => alternarInclusaoPreview(i)} />
                          <span>{t.data} · {t.descricao}</span>
                        </label>
                        <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>
                          {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button onClick={confirmarImportacao} className="btn btn-primary" disabled={!destinoImportacaoId || importando}>
                      {importando ? 'Importando...' : `Importar ${previewImportacao.filter((t) => t.incluir).length} selecionado(s)`}
                    </button>
                    <button onClick={() => { setPreviewImportacao([]); setNomeArquivoImportado(''); }} className="btn-link">Cancelar</button>
                  </div>
                </>
              )}
            </div>
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
