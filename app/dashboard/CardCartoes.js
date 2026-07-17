'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  formatarMoeda, calcularMesFaturaCompra, avancarMeses,
  calcularPeriodoFaturaAberta, subtrairMeses, mesReferenciaStr,
} from '../../lib/financeiro';
import { recalcularSaldoConta } from '../../lib/saldos';
import CampoCategoria from './CampoCategoria';

export default function CardCartoes({ entidadeAtual, contas, cartoes, onAtualizar, aberto, onAlternarAberto }) {
  const [faturasPorCartao, setFaturasPorCartao] = useState({});
  const [mostrarNovoCartao, setMostrarNovoCartao] = useState(false);
  const [nomeCartao, setNomeCartao] = useState('');
  const [diaFechamentoCartao, setDiaFechamentoCartao] = useState('');
  const [diaVencimentoCartao, setDiaVencimentoCartao] = useState('');
  const [contaPagamentoCartaoId, setContaPagamentoCartaoId] = useState('');
  const [edicaoCartaoId, setEdicaoCartaoId] = useState(null);
  const [formCartao, setFormCartao] = useState({ nome: '', dia_fechamento: '', dia_vencimento: '', conta_pagamento_id: '' });

  const [mostrarCompraCartaoId, setMostrarCompraCartaoId] = useState(null);
  const [valorCompraCartao, setValorCompraCartao] = useState('');
  const [categoriaCompraCartao, setCategoriaCompraCartao] = useState('');
  const [descricaoCompraCartao, setDescricaoCompraCartao] = useState('');
  const [dataCompraCartao, setDataCompraCartao] = useState(() => new Date().toISOString().slice(0, 10));
  const [essencialidadeCompraCartao, setEssencialidadeCompraCartao] = useState('');
  const [parceladoCompraCartao, setParceladoCompraCartao] = useState(false);
  const [totalParcelasCompraCartao, setTotalParcelasCompraCartao] = useState('');
  const [parcelaAtualCompraCartao, setParcelaAtualCompraCartao] = useState('');
  const [sugestaoCompraCartao, setSugestaoCompraCartao] = useState(null);

  const [comprasCartaoVisivelId, setComprasCartaoVisivelId] = useState(null);
  const [comprasDoCartao, setComprasDoCartao] = useState([]);
  const [edicaoCompraCartaoId, setEdicaoCompraCartaoId] = useState(null);
  const [formCompraCartao, setFormCompraCartao] = useState({ valor: '', categoria: '', descricao: '', data: '', essencialidade: '' });

  const [alturaCheiaCartoes, setAlturaCheiaCartoes] = useState(false);

  const carregarFaturas = useCallback(async (listaCartoes) => {
    if (!entidadeAtual || !listaCartoes || listaCartoes.length === 0) { setFaturasPorCartao({}); return; }

    const hoje = new Date();
    const resultado = {};

    await Promise.all(listaCartoes.map(async (cartao) => {
      const aberta = calcularPeriodoFaturaAberta(cartao, hoje);
      const fechada = subtrairMeses(aberta.ano, aberta.mes, 1);

      const mesRefAberta = mesReferenciaStr(aberta.ano, aberta.mes);
      const mesRefFechada = mesReferenciaStr(fechada.ano, fechada.mes);

      const { data } = await supabase
        .from('transacoes')
        .select('valor, mes_fatura, origem')
        .eq('cartao_id', cartao.id)
        .in('mes_fatura', [mesRefAberta, mesRefFechada]);

      const compras = (data || []).filter((t) => t.origem !== 'fatura');
      const pagamentos = (data || []).filter((t) => t.origem === 'fatura');

      const totalAberta = compras.filter((t) => t.mes_fatura === mesRefAberta).reduce((s, t) => s + Number(t.valor), 0);
      const totalFechada = compras.filter((t) => t.mes_fatura === mesRefFechada).reduce((s, t) => s + Number(t.valor), 0);
      const fechadaPaga = pagamentos.some((t) => t.mes_fatura === mesRefFechada);

      resultado[cartao.id] = {
        aberta: { mesRef: mesRefAberta, total: totalAberta },
        fechada: { mesRef: mesRefFechada, total: totalFechada, paga: fechadaPaga },
      };
    }));

    setFaturasPorCartao(resultado);
  }, [entidadeAtual]);

  useEffect(() => {
    if (entidadeAtual) carregarFaturas(cartoes);
  }, [entidadeAtual, cartoes, carregarFaturas]);

  // Sugestão de categoria/essencialidade com base no histórico de descrições parecidas.
  useEffect(() => {
    if (!entidadeAtual || descricaoCompraCartao.trim().length < 3) {
      setSugestaoCompraCartao(null);
      return;
    }
    const timeoutId = setTimeout(async () => {
      const { data } = await supabase
        .from('transacoes')
        .select('categoria, essencialidade')
        .eq('entidade_id', entidadeAtual)
        .is('transferencia_id', null)
        .ilike('descricao', `%${descricaoCompraCartao.trim()}%`)
        .order('data', { ascending: false })
        .limit(10);

      if (!data || data.length === 0) { setSugestaoCompraCartao(null); return; }

      const contagem = {};
      data.forEach((t) => {
        const chave = `${t.categoria}|${t.essencialidade}`;
        contagem[chave] = (contagem[chave] || 0) + 1;
      });
      const [chaveMaisComum] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
      const [categoriaSugerida, essencialidadeSugerida] = chaveMaisComum.split('|');

      setSugestaoCompraCartao({
        categoria: categoriaSugerida,
        essencialidade: essencialidadeSugerida !== 'null' ? essencialidadeSugerida : '',
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [descricaoCompraCartao, entidadeAtual]);

  function aplicarSugestaoCompraCartao() {
    if (!sugestaoCompraCartao) return;
    setCategoriaCompraCartao(sugestaoCompraCartao.categoria || '');
    if (sugestaoCompraCartao.essencialidade) setEssencialidadeCompraCartao(sugestaoCompraCartao.essencialidade);
    setSugestaoCompraCartao(null);
  }

  async function adicionarCartao(e) {
    e.preventDefault();
    if (!entidadeAtual || !nomeCartao || !diaFechamentoCartao || !diaVencimentoCartao) return;

    const { error } = await supabase.from('cartoes').insert({
      entidade_id: entidadeAtual,
      nome: nomeCartao,
      dia_fechamento: parseInt(diaFechamentoCartao, 10),
      dia_vencimento: parseInt(diaVencimentoCartao, 10),
      conta_pagamento_id: contaPagamentoCartaoId || null,
    });

    if (!error) {
      setNomeCartao('');
      setDiaFechamentoCartao('');
      setDiaVencimentoCartao('');
      setContaPagamentoCartaoId('');
      setMostrarNovoCartao(false);
      onAtualizar();
    }
  }

  function iniciarEdicaoCartao(c) {
    setEdicaoCartaoId(c.id);
    setFormCartao({
      nome: c.nome,
      dia_fechamento: c.dia_fechamento,
      dia_vencimento: c.dia_vencimento,
      conta_pagamento_id: c.conta_pagamento_id || '',
    });
  }

  async function salvarEdicaoCartao(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('cartoes')
      .update({
        nome: formCartao.nome,
        dia_fechamento: parseInt(formCartao.dia_fechamento, 10),
        dia_vencimento: parseInt(formCartao.dia_vencimento, 10),
        conta_pagamento_id: formCartao.conta_pagamento_id || null,
      })
      .eq('id', edicaoCartaoId);

    if (!error) {
      setEdicaoCartaoId(null);
      onAtualizar();
    }
  }

  async function excluirCartao(id) {
    if (!window.confirm('Excluir este cartão? Compras já lançadas continuam no histórico, sem vínculo com o cartão.')) return;
    const { error } = await supabase.from('cartoes').delete().eq('id', id);
    if (!error) onAtualizar();
  }

  async function carregarComprasCartao(cartaoId) {
    const { data } = await supabase
      .from('transacoes')
      .select('*')
      .eq('cartao_id', cartaoId)
      .neq('origem', 'fatura')
      .order('data', { ascending: false });

    setComprasDoCartao(data || []);
  }

  function alternarComprasCartao(cartaoId) {
    if (comprasCartaoVisivelId === cartaoId) {
      setComprasCartaoVisivelId(null);
      setComprasDoCartao([]);
    } else {
      setComprasCartaoVisivelId(cartaoId);
      carregarComprasCartao(cartaoId);
    }
  }

  function iniciarEdicaoCompraCartao(compra) {
    setEdicaoCompraCartaoId(compra.id);
    setFormCompraCartao({
      valor: compra.valor,
      categoria: compra.categoria || '',
      descricao: compra.descricao || '',
      data: compra.data,
      essencialidade: compra.essencialidade || '',
    });
  }

  async function salvarEdicaoCompraCartao(e, cartao) {
    e.preventDefault();
    const novaMesFatura = calcularMesFaturaCompra(cartao, formCompraCartao.data);

    const { error } = await supabase
      .from('transacoes')
      .update({
        valor: parseFloat(formCompraCartao.valor),
        categoria: formCompraCartao.categoria || 'outros',
        descricao: formCompraCartao.descricao,
        data: formCompraCartao.data,
        essencialidade: formCompraCartao.essencialidade || null,
        mes_fatura: novaMesFatura,
      })
      .eq('id', edicaoCompraCartaoId);

    if (!error) {
      setEdicaoCompraCartaoId(null);
      carregarComprasCartao(cartao.id);
      carregarFaturas(cartoes);
    }
  }

  async function excluirCompraCartao(compra) {
    if (!window.confirm('Excluir esta compra?')) return;
    const { error } = await supabase.from('transacoes').delete().eq('id', compra.id);
    if (!error) {
      carregarComprasCartao(compra.cartao_id);
      carregarFaturas(cartoes);
    }
  }

  async function classificarEssencialidadeCompra(compra, novoValor) {
    const { error } = await supabase.from('transacoes').update({ essencialidade: novoValor || null }).eq('id', compra.id);
    if (!error) carregarComprasCartao(compra.cartao_id);
  }

  async function adicionarCompraCartao(e, cartao) {
    e.preventDefault();
    if (!valorCompraCartao) return;
    if (parceladoCompraCartao && !totalParcelasCompraCartao) return;

    const data = dataCompraCartao || new Date().toISOString().slice(0, 10);
    const mesFaturaBase = calcularMesFaturaCompra(cartao, data);

    const base = {
      entidade_id: entidadeAtual,
      cartao_id: cartao.id,
      valor: parseFloat(valorCompraCartao),
      tipo: 'saida',
      categoria: categoriaCompraCartao || 'outros',
      descricao: descricaoCompraCartao,
      essencialidade: essencialidadeCompraCartao || null,
      origem: 'texto',
      status: 'pago',
      data,
    };

    let linhas;
    if (parceladoCompraCartao) {
      const total = parseInt(totalParcelasCompraCartao, 10);
      const parcelaInicial = parcelaAtualCompraCartao ? parseInt(parcelaAtualCompraCartao, 10) : 1;
      const compraParceladaId = crypto.randomUUID();

      linhas = [];
      for (let n = parcelaInicial; n <= total; n++) {
        linhas.push({
          ...base,
          mes_fatura: avancarMeses(mesFaturaBase, n - parcelaInicial),
          parcela_atual: n,
          parcela_total: total,
          compra_parcelada_id: compraParceladaId,
        });
      }
    } else {
      linhas = [{ ...base, mes_fatura: mesFaturaBase }];
    }

    const { error } = await supabase.from('transacoes').insert(linhas);

    if (!error) {
      setValorCompraCartao('');
      setCategoriaCompraCartao('');
      setDescricaoCompraCartao('');
      setEssencialidadeCompraCartao('');
      setDataCompraCartao(new Date().toISOString().slice(0, 10));
      setParceladoCompraCartao(false);
      setTotalParcelasCompraCartao('');
      setParcelaAtualCompraCartao('');
      setSugestaoCompraCartao(null);
      setMostrarCompraCartaoId(null);
      carregarFaturas(cartoes);
      if (comprasCartaoVisivelId === cartao.id) carregarComprasCartao(cartao.id);
    }
  }

  async function pagarFatura(cartao) {
    const info = faturasPorCartao[cartao.id];
    if (!info || info.fechada.total <= 0) return;
    if (!window.confirm(`Confirmar pagamento da fatura de ${cartao.nome} (${formatarMoeda(info.fechada.total)})?`)) return;

    const { error } = await supabase.from('transacoes').insert({
      entidade_id: entidadeAtual,
      cartao_id: cartao.id,
      conta_id: cartao.conta_pagamento_id,
      valor: info.fechada.total,
      tipo: 'saida',
      categoria: 'Fatura cartão',
      descricao: `Fatura ${cartao.nome}`,
      origem: 'fatura',
      status: 'pago',
      mes_fatura: info.fechada.mesRef,
      data: new Date().toISOString().slice(0, 10),
    });

    if (error) return;

    if (cartao.conta_pagamento_id) await recalcularSaldoConta(cartao.conta_pagamento_id);

    onAtualizar();
    carregarFaturas(cartoes);
  }

  return (
    <div className="card" id="secao-cartoes">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon">💳</span><p className="card-title">Cartões de crédito</p></span>
        <div className="card-header-actions">
          {aberto && <button onClick={() => setMostrarNovoCartao((v) => !v)} className="btn btn-ghost">+ Novo cartão</button>}
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? '▾' : '▸'}</button>
        </div>
      </div>

      {aberto && (
      <>
      <div className={`card-limitada ${(alturaCheiaCartoes || mostrarNovoCartao || comprasCartaoVisivelId || mostrarCompraCartaoId) ? 'expandida' : ''}`}>
      {mostrarNovoCartao && (
        <form onSubmit={adicionarCartao} className="form-row" style={{ marginBottom: 12 }}>
          <input className="input" placeholder="Nome (ex: Nubank)" value={nomeCartao} onChange={(e) => setNomeCartao(e.target.value)} required autoFocus />
          <input className="input" style={{ width: 100 }} type="number" min="1" max="31" placeholder="Dia fecham." value={diaFechamentoCartao} onChange={(e) => setDiaFechamentoCartao(e.target.value)} required />
          <input className="input" style={{ width: 100 }} type="number" min="1" max="31" placeholder="Dia venc." value={diaVencimentoCartao} onChange={(e) => setDiaVencimentoCartao(e.target.value)} required />
          <select className="input" value={contaPagamentoCartaoId} onChange={(e) => setContaPagamentoCartaoId(e.target.value)}>
            <option value="">Conta de pagamento (opcional)</option>
            {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
          </select>
          <button type="submit" className="btn btn-primary">Salvar</button>
        </form>
      )}

      {cartoes.length === 0 && <p className="empty-hint">Nenhum cartão cadastrado ainda.</p>}
      {cartoes.map((cartao) => {
        if (edicaoCartaoId === cartao.id) {
          return (
            <form key={cartao.id} onSubmit={salvarEdicaoCartao} className="form-row" style={{ padding: '8px 0' }}>
              <input className="input" value={formCartao.nome} onChange={(e) => setFormCartao({ ...formCartao, nome: e.target.value })} required />
              <input className="input" style={{ width: 100 }} type="number" min="1" max="31" value={formCartao.dia_fechamento} onChange={(e) => setFormCartao({ ...formCartao, dia_fechamento: e.target.value })} required />
              <input className="input" style={{ width: 100 }} type="number" min="1" max="31" value={formCartao.dia_vencimento} onChange={(e) => setFormCartao({ ...formCartao, dia_vencimento: e.target.value })} required />
              <select className="input" value={formCartao.conta_pagamento_id} onChange={(e) => setFormCartao({ ...formCartao, conta_pagamento_id: e.target.value })}>
                <option value="">Conta de pagamento (opcional)</option>
                {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
              </select>
              <button type="submit" className="btn btn-primary">Salvar</button>
              <button type="button" onClick={() => setEdicaoCartaoId(null)} className="btn-link">Cancelar</button>
            </form>
          );
        }

        const info = faturasPorCartao[cartao.id];
        const contaPagamento = contas.find((c) => c.id === cartao.conta_pagamento_id);

        return (
          <div key={cartao.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-alt)' }}>
            <div className="row-main">
              <span className="row-title">{cartao.nome}</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button onClick={() => alternarComprasCartao(cartao.id)} className="btn-link">
                  {comprasCartaoVisivelId === cartao.id ? 'ocultar compras' : 'ver compras'}
                </button>
                <button onClick={() => setMostrarCompraCartaoId(mostrarCompraCartaoId === cartao.id ? null : cartao.id)} className="btn-link">+ compra</button>
                <button onClick={() => iniciarEdicaoCartao(cartao)} className="btn-link">editar cartão</button>
                <button onClick={() => excluirCartao(cartao.id)} className="btn-link">excluir</button>
              </div>
            </div>
            <p className="row-subtitle">fecha dia {cartao.dia_fechamento} · vence dia {cartao.dia_vencimento}{contaPagamento ? ` · ${contaPagamento.nome}` : ''}</p>

            {info && (
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                <div>
                  <p className="row-subtitle" style={{ margin: 0 }}>Fatura aberta</p>
                  <span className="amount">{formatarMoeda(info.aberta.total)}</span>
                </div>
                <div>
                  <p className="row-subtitle" style={{ margin: 0 }}>Fatura fechada</p>
                  <span className="amount">{formatarMoeda(info.fechada.total)}</span>
                  {info.fechada.total > 0 && (
                    info.fechada.paga ? (
                      <span className="badge badge-confirmed" style={{ marginLeft: 8 }}>Paga</span>
                    ) : (
                      <button onClick={() => pagarFatura(cartao)} className="btn btn-primary" style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}>Pagar fatura</button>
                    )
                  )}
                </div>
              </div>
            )}

            {comprasCartaoVisivelId === cartao.id && (
              <div style={{ marginTop: 10, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
                {comprasDoCartao.length === 0 && <p className="empty-hint">Nenhuma compra lançada neste cartão ainda.</p>}
                {comprasDoCartao.map((compra) => (
                  edicaoCompraCartaoId === compra.id ? (
                    <form key={compra.id} onSubmit={(e) => salvarEdicaoCompraCartao(e, cartao)} className="form-row" style={{ padding: '8px 0' }}>
                      <input className="input" style={{ width: 100 }} type="number" step="0.01" value={formCompraCartao.valor} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, valor: e.target.value })} required />
                      <CampoCategoria entidadeAtual={entidadeAtual} tipo="saida" value={formCompraCartao.categoria} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, categoria: e.target.value })} style={{ width: 120 }} />
                      <input className="input" style={{ flex: 1, minWidth: 120 }} value={formCompraCartao.descricao} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, descricao: e.target.value })} />
                      <input className="input" style={{ width: 150 }} type="date" value={formCompraCartao.data} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, data: e.target.value })} required />
                      <select className="input" value={formCompraCartao.essencialidade} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, essencialidade: e.target.value })}>
                        <option value="">Essencialidade (opc.)</option>
                        <option value="essencial">Essencial</option>
                        <option value="desejavel">Desejável</option>
                        <option value="superfluo">Supérfluo</option>
                      </select>
                      <button type="submit" className="btn btn-primary">Salvar</button>
                      <button type="button" onClick={() => setEdicaoCompraCartaoId(null)} className="btn-link">Cancelar</button>
                    </form>
                  ) : (
                    <div key={compra.id} className="row row-main">
                      <div>
                        <p className="row-title">
                          {compra.descricao || compra.categoria}
                          {compra.parcela_total && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {compra.parcela_atual}/{compra.parcela_total}</span>}
                        </p>
                        <p className="row-subtitle">{compra.categoria} · {compra.data} · fatura {compra.mes_fatura?.slice(0, 7)}</p>
                      </div>
                      <div className="row-actions">
                        {!compra.essencialidade && (
                          <select
                            className="input"
                            style={{ fontSize: 11, padding: '4px 6px', borderColor: 'var(--accent)' }}
                            value=""
                            onChange={(e) => classificarEssencialidadeCompra(compra, e.target.value)}
                          >
                            <option value="">Classificar</option>
                            <option value="essencial">Essencial</option>
                            <option value="desejavel">Desejável</option>
                            <option value="superfluo">Supérfluo</option>
                          </select>
                        )}
                        <span className="amount">{formatarMoeda(compra.valor)}</span>
                        <button onClick={() => iniciarEdicaoCompraCartao(compra)} className="btn-link">editar</button>
                        <button onClick={() => excluirCompraCartao(compra)} className="btn-link">excluir</button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            {mostrarCompraCartaoId === cartao.id && (
              <>
                {sugestaoCompraCartao && (
                  <div className="suggestion-banner" style={{ marginTop: 10 }}>
                    <span>Sugestão baseada no histórico: <strong>{sugestaoCompraCartao.categoria}</strong>{sugestaoCompraCartao.essencialidade && ` · ${sugestaoCompraCartao.essencialidade}`}</span>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <button type="button" onClick={aplicarSugestaoCompraCartao} className="btn-link btn-link-accent">usar</button>
                      <button type="button" onClick={() => setSugestaoCompraCartao(null)} className="btn-link">ignorar</button>
                    </div>
                  </div>
                )}
                <form onSubmit={(e) => adicionarCompraCartao(e, cartao)} className="form-row" style={{ marginTop: sugestaoCompraCartao ? 0 : 10 }}>
                <input className="input" style={{ width: 100 }} type="number" step="0.01" placeholder={parceladoCompraCartao ? 'Valor da parcela' : 'Valor'} value={valorCompraCartao} onChange={(e) => setValorCompraCartao(e.target.value)} required autoFocus />
                <CampoCategoria entidadeAtual={entidadeAtual} tipo="saida" value={categoriaCompraCartao} onChange={(e) => setCategoriaCompraCartao(e.target.value)} style={{ width: 130 }} />
                <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="Descrição" value={descricaoCompraCartao} onChange={(e) => setDescricaoCompraCartao(e.target.value)} />
                <input className="input" style={{ width: 150 }} type="date" value={dataCompraCartao} onChange={(e) => setDataCompraCartao(e.target.value)} required />
                <select className="input" value={essencialidadeCompraCartao} onChange={(e) => setEssencialidadeCompraCartao(e.target.value)}>
                  <option value="">Essencialidade (opc.)</option>
                  <option value="essencial">Essencial</option>
                  <option value="desejavel">Desejável</option>
                  <option value="superfluo">Supérfluo</option>
                </select>
                <label className="checkbox-label">
                  <input type="checkbox" checked={parceladoCompraCartao} onChange={(e) => setParceladoCompraCartao(e.target.checked)} />
                  Parcelado
                </label>
                {parceladoCompraCartao && (
                  <>
                    <input className="input" style={{ width: 130 }} type="number" min="1" placeholder="Total de parcelas" value={totalParcelasCompraCartao} onChange={(e) => setTotalParcelasCompraCartao(e.target.value)} required />
                    <input className="input" style={{ width: 170 }} type="number" min="1" placeholder="Já está na parcela nº (opc.)" value={parcelaAtualCompraCartao} onChange={(e) => setParcelaAtualCompraCartao(e.target.value)} />
                  </>
                )}
                <button type="submit" className="btn btn-primary">Lançar</button>
              </form>
              </>
            )}
          </div>
        );
      })}
      </div>
      <button onClick={() => setAlturaCheiaCartoes((v) => !v)} className="ver-card-completo">
        {alturaCheiaCartoes ? 'Recolher' : 'Ver cartões completo'}
      </button>
      </>
      )}
    </div>
  );
}
