'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, Wallet } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';
import {
  calcularSaldoDevedor,
  calcularDataQuitacao,
  calcularProximoVencimento,
  calcularProgressoPct,
  calcularJurosCiclo,
} from '../../lib/dividas';

const TIPO_LABEL = {
  emprestimo: 'Empréstimo',
  financiamento: 'Financiamento',
  cartao_rotativo: 'Rotativo',
  outro: 'Outro',
};

function formatarDataLocal(d) {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

// YYYY-MM-DD → DD/MM/AAAA sem risco de fuso (não usa Date)
function formatarDataStr(s) {
  const [a, m, d] = s.split('-');
  return `${d}/${m}/${a}`;
}

function hojeLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasAteData(dataObj) {
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const alvo = new Date(dataObj.getFullYear(), dataObj.getMonth(), dataObj.getDate());
  return Math.round((alvo - base) / 86400000);
}

export default function CardDividas({ entidadeAtual, contas }) {
  const [dividas, setDividas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [expandida, setExpandida] = useState(null);
  const [pagamentos, setPagamentos] = useState({});
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [mostrarFormPag, setMostrarFormPag] = useState(null);
  const [formPag, setFormPag] = useState({ data: '', valor_pago: '' });
  const [salvandoPag, setSalvandoPag] = useState(false);

  const HOJE = hojeLocalISO();
  const [form, setForm] = useState({
    nome: '', tipo: 'outro', valor_original: '', parcela_valor: '',
    parcelas_total: '', data_inicio: HOJE, taxa_juros_mensal: '', conta_debito_id: '',
  });

  const carregar = useCallback(async () => {
    if (!entidadeAtual) return;
    setCarregando(true);
    const { data } = await supabase
      .from('dividas')
      .select('*')
      .eq('entidade_id', entidadeAtual)
      .order('data_inicio', { ascending: true });
    setDividas(data || []);
    setCarregando(false);
  }, [entidadeAtual]);

  useEffect(() => { carregar(); }, [carregar]);

  async function carregarPagamentosDivida(dividaId) {
    const { data } = await supabase
      .from('dividas_pagamentos')
      .select('*')
      .eq('divida_id', dividaId)
      .order('data', { ascending: true });
    setPagamentos((prev) => ({ ...prev, [dividaId]: data || [] }));
  }

  function alternarExpandida(id) {
    if (expandida === id) {
      setExpandida(null);
    } else {
      setExpandida(id);
      if (!pagamentos[id]) carregarPagamentosDivida(id);
    }
  }

  async function adicionarDivida(e) {
    e.preventDefault();
    if (!entidadeAtual) return;
    setSalvando(true);

    const valorNum = parseFloat(String(form.valor_original).replace(',', '.'));
    const parcelaNum = parseFloat(String(form.parcela_valor).replace(',', '.'));
    const taxaNum = form.taxa_juros_mensal
      ? parseFloat(String(form.taxa_juros_mensal).replace(',', '.'))
      : null;
    const totalNum = form.parcelas_total ? parseInt(form.parcelas_total, 10) : null;

    const { error } = await supabase.from('dividas').insert({
      entidade_id: entidadeAtual,
      nome: form.nome,
      tipo: form.tipo,
      valor_original: valorNum,
      valor_atual: valorNum,
      taxa_juros_mensal: taxaNum,
      parcela_valor: parcelaNum,
      parcelas_total: totalNum,
      parcelas_pagas: 0,
      data_inicio: form.data_inicio,
      conta_debito_id: form.conta_debito_id || null,
      status: 'ativa',
    });

    if (!error) {
      setMostrarForm(false);
      setForm({ nome: '', tipo: 'outro', valor_original: '', parcela_valor: '', parcelas_total: '', data_inicio: HOJE, taxa_juros_mensal: '', conta_debito_id: '' });
      carregar();
    }
    setSalvando(false);
  }

  async function registrarPagamento(e, divida) {
    e.preventDefault();
    setSalvandoPag(true);

    const pags = pagamentos[divida.id] || [];
    // Reconstrói saldo via calcularSaldoDevedor (consistência com tabela Price)
    const saldoAtual = calcularSaldoDevedor(divida, pags);
    const valorPago = parseFloat(String(formPag.valor_pago).replace(',', '.'));

    let valorJuros = 0;
    let valorPrincipal = Math.min(valorPago, saldoAtual);

    if (divida.taxa_juros_mensal) {
      const taxa = Number(divida.taxa_juros_mensal) / 100;
      valorJuros = calcularJurosCiclo(saldoAtual, taxa);
      // Principal = pago − juros do período, limitado ao saldo atual
      valorPrincipal = Math.min(Math.max(0, valorPago - valorJuros), saldoAtual);
      valorJuros = valorPago - valorPrincipal;
    }

    const saldoApos = Math.max(0, saldoAtual - valorPrincipal);

    const { error } = await supabase.from('dividas_pagamentos').insert({
      divida_id: divida.id,
      data: formPag.data,
      valor_pago: valorPago,
      valor_principal: valorPrincipal,
      valor_juros: valorJuros,
      saldo_apos: saldoApos,
    });

    if (!error) {
      const novoStatus = saldoApos <= 0.01 ? 'quitada' : 'ativa';
      await supabase.from('dividas').update({
        valor_atual: saldoApos,
        parcelas_pagas: (Number(divida.parcelas_pagas) || 0) + 1,
        status: novoStatus,
      }).eq('id', divida.id);

      setFormPag({ data: '', valor_pago: '' });
      setMostrarFormPag(null);
      await carregarPagamentosDivida(divida.id);
      carregar();
    }
    setSalvandoPag(false);
  }

  async function excluirDivida(id) {
    if (!window.confirm('Excluir esta dívida e todo o histórico de pagamentos?')) return;
    await supabase.from('dividas').delete().eq('id', id);
    setExpandida(null);
    carregar();
  }

  // --- Dados do resumo ---
  const ativas = dividas.filter((d) => d.status === 'ativa');
  const totalAtual = ativas.reduce((s, d) => s + Number(d.valor_atual), 0);

  const proximaVenc = ativas.reduce((best, d) => {
    const vd = calcularProximoVencimento(d);
    if (!best) return d;
    return vd < calcularProximoVencimento(best) ? d : best;
  }, null);

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cabeçalho */}
      <div className="card-header">
        <span className="card-title-group">
          <span className="card-icon"><Wallet size={16} /></span>
          <p className="card-title">Dívidas</p>
        </span>
        <div className="card-header-actions">
          <button onClick={() => setMostrarForm((v) => !v)} className="btn btn-ghost">
            + Nova dívida
          </button>
        </div>
      </div>

      {/* Resumo */}
      {ativas.length > 0 && (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid var(--surface-alt)' }}>
          <div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 2px' }}>Ativas</p>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', margin: 0 }}>{ativas.length}</p>
          </div>
          <div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 2px' }}>Total a pagar</p>
            <p style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', margin: 0, color: 'var(--negative)' }}>
              {formatarMoeda(totalAtual)}
            </p>
          </div>
          {proximaVenc && (
            <div>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 2px' }}>Próx. vencimento</p>
              <p style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', margin: 0 }}>
                {proximaVenc.nome} — dia {proximaVenc.data_inicio.split('-')[2]}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Formulário de nova dívida */}
      {mostrarForm && (
        <form onSubmit={adicionarDivida} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="input" placeholder="Nome da dívida *"
              value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required style={{ flex: 2, minWidth: 180 }} autoFocus
            />
            <select
              className="input" value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              style={{ flex: 1, minWidth: 140 }}
            >
              <option value="emprestimo">Empréstimo</option>
              <option value="financiamento">Financiamento</option>
              <option value="cartao_rotativo">Rotativo</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Valor original *</label>
              <input className="input" type="number" step="0.01" placeholder="0,00"
                value={form.valor_original} onChange={(e) => setForm({ ...form, valor_original: e.target.value })}
                required style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Parcela mensal *</label>
              <input className="input" type="number" step="0.01" placeholder="0,00"
                value={form.parcela_valor} onChange={(e) => setForm({ ...form, parcela_valor: e.target.value })}
                required style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 110 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Nº parcelas</label>
              <input className="input" type="number" placeholder="— sem limite"
                value={form.parcelas_total} onChange={(e) => setForm({ ...form, parcelas_total: e.target.value })}
                style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Data de início *</label>
              <input className="input" type="date"
                value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                required style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Juros % a.m.</label>
              <input className="input" type="number" step="0.01" placeholder="— sem juros"
                value={form.taxa_juros_mensal} onChange={(e) => setForm({ ...form, taxa_juros_mensal: e.target.value })}
                style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Conta de débito</label>
              <select className="input" value={form.conta_debito_id}
                onChange={(e) => setForm({ ...form, conta_debito_id: e.target.value })}
                style={{ width: '100%' }}>
                <option value="">— nenhuma</option>
                {(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setMostrarForm(false)} className="btn-link">Cancelar</button>
          </div>
        </form>
      )}

      {carregando && <p className="empty-hint">Carregando…</p>}

      {!carregando && dividas.length === 0 && (
        <p className="empty-hint">
          Nenhuma dívida cadastrada. Adicione empréstimos, financiamentos ou cartão rotativo para acompanhar aqui.
        </p>
      )}

      {/* Lista de dívidas */}
      {dividas.map((d) => {
        const progresso = calcularProgressoPct(d);
        const dataQuit = calcularDataQuitacao(d);
        const proxVenc = calcularProximoVencimento(d);
        const diasVenc = diasAteData(proxVenc);
        const pagsD = pagamentos[d.id] || [];
        const aberta = expandida === d.id;
        const quitada = d.status === 'quitada';

        let corBorda = 'var(--surface-alt)';
        if (quitada) corBorda = 'var(--positive)';
        else if (diasVenc <= 3) corBorda = '#e0a000';

        return (
          <div key={d.id} style={{ border: `1px solid ${corBorda}`, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            {/* Linha principal */}
            <div
              onClick={() => alternarExpandida(d.id)}
              style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontWeight: 'var(--weight-semibold)' }}>{d.nome}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', background: 'var(--surface-alt)', padding: '1px 6px', borderRadius: 999 }}>
                    {TIPO_LABEL[d.tipo] || d.tipo}
                  </span>
                  {quitada && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--positive)', background: 'rgba(0,180,90,0.1)', padding: '1px 6px', borderRadius: 999 }}>
                      ✓ quitada
                    </span>
                  )}
                  {!quitada && diasVenc <= 3 && (
                    <span style={{ fontSize: 'var(--text-xs)', color: '#c07000', background: '#fff3cd', padding: '1px 6px', borderRadius: 999 }}>
                      {diasVenc < 0
                        ? `atrasada ${Math.abs(diasVenc)}d`
                        : diasVenc === 0 ? 'vence hoje' : `vence em ${diasVenc}d`}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  {formatarMoeda(d.parcela_valor)}/mês · dia {d.data_inicio.split('-')[2]}
                  {dataQuit && ` · quita ${formatarDataLocal(dataQuit)}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <p style={{ margin: 0, fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', color: quitada ? 'var(--positive)' : 'var(--negative)' }}>
                  {formatarMoeda(d.valor_atual)}
                </p>
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  de {formatarMoeda(d.valor_original)}
                </p>
                <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                  {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </div>
            </div>

            {/* Barra de progresso */}
            <div style={{ height: 4, background: 'var(--surface-alt)', margin: '0 14px' }}>
              <div style={{
                height: '100%',
                width: `${progresso}%`,
                background: quitada ? 'var(--positive)' : 'var(--primary)',
                borderRadius: 2,
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ padding: '3px 14px 10px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {progresso.toFixed(0)}% pago
              {d.parcelas_total ? ` · ${d.parcelas_pagas ?? 0}/${d.parcelas_total} parcelas` : ''}
            </div>

            {/* Painel expandido */}
            {aberta && (
              <div style={{ borderTop: '1px solid var(--surface-alt)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Histórico de pagamentos */}
                {pagsD.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                    Nenhum pagamento registrado ainda.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', fontSize: 'var(--text-sm)', borderCollapse: 'collapse', minWidth: 420 }}>
                      <thead>
                        <tr style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                          <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', fontWeight: 'normal' }}>Data</th>
                          <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Valor pago</th>
                          <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Principal</th>
                          <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Juros</th>
                          <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Saldo após</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagsD.map((p) => (
                          <tr key={p.id} style={{ borderTop: '1px solid var(--surface-alt)' }}>
                            <td style={{ padding: '6px 8px 6px 0' }}>{formatarDataStr(p.data)}</td>
                            <td style={{ textAlign: 'right', padding: '6px 0' }}>{formatarMoeda(p.valor_pago)}</td>
                            <td style={{ textAlign: 'right', padding: '6px 0' }}>{formatarMoeda(p.valor_principal)}</td>
                            <td style={{ textAlign: 'right', padding: '6px 0', color: Number(p.valor_juros) > 0 ? 'var(--negative)' : 'var(--text-muted)' }}>
                              {formatarMoeda(p.valor_juros)}
                            </td>
                            <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 'var(--weight-semibold)' }}>
                              {formatarMoeda(p.saldo_apos)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Registrar pagamento */}
                {!quitada && (
                  mostrarFormPag === d.id ? (
                    <form
                      onSubmit={(e) => registrarPagamento(e, d)}
                      style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}
                    >
                      <div>
                        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Data</label>
                        <input
                          className="input" type="date"
                          value={formPag.data} onChange={(e) => setFormPag({ ...formPag, data: e.target.value })}
                          required style={{ width: 140 }} autoFocus
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Valor pago</label>
                        <input
                          className="input" type="number" step="0.01"
                          placeholder={String(d.parcela_valor)}
                          value={formPag.valor_pago} onChange={(e) => setFormPag({ ...formPag, valor_pago: e.target.value })}
                          required style={{ width: 130 }}
                        />
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={salvandoPag}>
                        {salvandoPag ? 'Salvando…' : 'Registrar'}
                      </button>
                      <button type="button" onClick={() => { setMostrarFormPag(null); setFormPag({ data: '', valor_pago: '' }); }} className="btn-link">
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setMostrarFormPag(d.id);
                        setFormPag({ data: HOJE, valor_pago: String(d.parcela_valor) });
                      }}
                      className="btn btn-ghost"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      + Registrar pagamento
                    </button>
                  )
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => excluirDivida(d.id)}
                    className="btn-link"
                    style={{ color: 'var(--negative)', fontSize: 'var(--text-sm)' }}
                  >
                    excluir dívida
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
