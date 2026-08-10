'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, Wallet, Edit2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';
import { recalcularSaldoConta } from '../../lib/saldos';
import {
  calcularSaldoDevedor,
  calcularDataQuitacao,
  calcularProximoVencimento,
  calcularProgressoPct,
  calcularJurosCiclo,
  calcularTotalJurosFuturos,
} from '../../lib/dividas';

const TIPO_LABEL = {
  emprestimo: 'Empréstimo',
  financiamento: 'Financiamento',
  cartao_rotativo: 'Rotativo',
  outro: 'Outro',
};

const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function formatarDataLocal(d) {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function formatarMesAno(d) {
  return `${MESES_ABREV[d.getMonth()]}/${d.getFullYear()}`;
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

// Calcula valor_atual para N parcelas já pagas sem criar registros no banco.
// Opção A (sem taxa): desconta N × parcela do original.
// Opção B (com taxa): simula N ciclos Price via calcularSaldoDevedor.
function calcularValorAtualInicial(valorOriginal, taxaNum, parcelaNum, parcPagas) {
  if (parcPagas <= 0) return valorOriginal;
  if (!taxaNum) return Math.max(0, valorOriginal - parcPagas * parcelaNum);
  const dividaTemp = { valor_original: valorOriginal, taxa_juros_mensal: taxaNum, parcela_valor: parcelaNum };
  return calcularSaldoDevedor(dividaTemp, Array(parcPagas).fill({ valor_principal: 0 }));
}

const FORM_NOVO_VAZIO = {
  nome: '', tipo: 'outro', valor_original: '', parcela_valor: '',
  parcelas_total: '', data_inicio: '', taxa_juros_mensal: '', conta_debito_id: '',
  parcelas_pagas: '',
};

const labelSx = { fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 3 };

export default function CardDividas({ entidadeAtual, contas, onTransacaoCriada }) {
  const [dividas, setDividas] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [expandida, setExpandida] = useState(null);
  const [pagamentos, setPagamentos] = useState({});

  // formulário nova dívida
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // formulário edição inline
  const [editando, setEditando] = useState(null);
  const [formEdit, setFormEdit] = useState({ nome: '', tipo: 'outro', parcela_valor: '', parcelas_total: '', taxa_juros_mensal: '', conta_debito_id: '' });
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // excluir inline
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(null);

  // registrar pagamento — desconto para Opção A, informativo para Opção B
  const [mostrarFormPag, setMostrarFormPag] = useState(null);
  const [formPag, setFormPag] = useState({ data: '', valor_pago: '', desconto: '' });
  const [salvandoPag, setSalvandoPag] = useState(false);

  // quitação antecipada
  const [mostrarFormAntecip, setMostrarFormAntecip] = useState(null);
  const [formAntecip, setFormAntecip] = useState({ valor: '', desconto: '', multa: '', data: '' });
  const [salvandoAntecip, setSalvandoAntecip] = useState(false);
  const [ultimaQuitacao, setUltimaQuitacao] = useState(null); // { id, economiaJuros }

  // simulação "pagar a mais"
  const [simulacaoExtra, setSimulacaoExtra] = useState({});

  const HOJE = hojeLocalISO();
  const [form, setForm] = useState({ ...FORM_NOVO_VAZIO, data_inicio: HOJE });

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
      setEditando(null);
      setConfirmandoExcluir(null);
    } else {
      setExpandida(id);
      if (!pagamentos[id]) carregarPagamentosDivida(id);
    }
  }

  function abrirEdicao(e, d) {
    e.stopPropagation();
    setFormEdit({
      nome: d.nome,
      tipo: d.tipo,
      parcela_valor: String(d.parcela_valor),
      parcelas_total: d.parcelas_total ?? '',
      taxa_juros_mensal: d.taxa_juros_mensal ?? '',
      conta_debito_id: d.conta_debito_id ?? '',
    });
    setEditando(d.id);
    setExpandida(d.id);
    if (!pagamentos[d.id]) carregarPagamentosDivida(d.id);
  }

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async function adicionarDivida(e) {
    e.preventDefault();
    if (!entidadeAtual) return;
    setSalvando(true);

    const valorNum   = parseFloat(String(form.valor_original).replace(',', '.'));
    const parcelaNum = parseFloat(String(form.parcela_valor).replace(',', '.'));
    const taxaNum    = form.taxa_juros_mensal ? parseFloat(String(form.taxa_juros_mensal).replace(',', '.')) : null;
    const totalNum   = form.parcelas_total ? parseInt(form.parcelas_total, 10) : null;
    const parcPagas  = form.parcelas_pagas ? parseInt(form.parcelas_pagas, 10) : 0;

    const valorAtual  = calcularValorAtualInicial(valorNum, taxaNum, parcelaNum, parcPagas);
    const statusFinal = (totalNum && parcPagas >= totalNum) ? 'quitada' : 'ativa';

    const { error } = await supabase.from('dividas').insert({
      entidade_id: entidadeAtual,
      nome: form.nome,
      tipo: form.tipo,
      valor_original: valorNum,
      valor_atual: valorAtual,
      taxa_juros_mensal: taxaNum,
      parcela_valor: parcelaNum,
      parcelas_total: totalNum,
      parcelas_pagas: parcPagas,
      data_inicio: form.data_inicio,
      conta_debito_id: form.conta_debito_id || null,
      status: statusFinal,
    });

    if (!error) {
      setMostrarForm(false);
      setForm({ ...FORM_NOVO_VAZIO, data_inicio: HOJE });
      carregar();
    }
    setSalvando(false);
  }

  async function editarDivida(e, divida) {
    e.preventDefault();
    setSalvandoEdit(true);

    const parcelaNum = parseFloat(String(formEdit.parcela_valor).replace(',', '.'));
    const taxaNum    = formEdit.taxa_juros_mensal ? parseFloat(String(formEdit.taxa_juros_mensal).replace(',', '.')) : null;
    const totalNum   = formEdit.parcelas_total ? parseInt(formEdit.parcelas_total, 10) : null;

    const { error } = await supabase.from('dividas').update({
      nome: formEdit.nome,
      tipo: formEdit.tipo,
      parcela_valor: parcelaNum,
      parcelas_total: totalNum,
      taxa_juros_mensal: taxaNum,
      conta_debito_id: formEdit.conta_debito_id || null,
    }).eq('id', divida.id);

    if (!error) { setEditando(null); carregar(); }
    setSalvandoEdit(false);
  }

  async function registrarPagamento(e, divida) {
    e.preventDefault();
    setSalvandoPag(true);

    const pags         = pagamentos[divida.id] || [];
    const saldoAtual   = calcularSaldoDevedor(divida, pags);
    const valorDigitado = parseFloat(String(formPag.valor_pago).replace(',', '.'));
    const descontoNum  = parseFloat(String(formPag.desconto || '0').replace(',', '.')) || 0;

    let valorJuros    = 0;
    let valorPrincipal;
    let valorParaBD;   // o que entra em dividas_pagamentos.valor_pago

    if (divida.taxa_juros_mensal) {
      // Opção B (Price): desconto reduz o valor efetivo pago; juros calculados sobre saldo atual.
      // Se há desconto → valor_juros negativo (economia em verde no histórico, igual à Opção A).
      const taxa = Number(divida.taxa_juros_mensal) / 100;
      const valorEfetivo = valorDigitado - descontoNum;
      valorJuros     = calcularJurosCiclo(saldoAtual, taxa);
      valorPrincipal = Math.min(Math.max(0, valorEfetivo - valorJuros), saldoAtual);
      valorJuros     = descontoNum > 0 ? -descontoNum : (valorEfetivo - valorPrincipal);
      valorParaBD    = valorEfetivo;
    } else {
      // Opção A: aplica desconto — só o valor efetivo (pago − desconto) reduz o saldo
      const valorEfetivo = valorDigitado - descontoNum;
      valorPrincipal = Math.min(valorEfetivo, saldoAtual);
      valorJuros     = descontoNum > 0 ? -descontoNum : 0; // negativo = economia registrada
      valorParaBD    = valorEfetivo;
    }

    const saldoApos = Math.max(0, saldoAtual - valorPrincipal);

    // Se há conta vinculada, cria a transação antes de registrar o pagamento.
    // transacao_id é armazenado no registro para possibilitar o desfazer.
    let transacaoId = null;
    if (divida.conta_debito_id) {
      const { data: txData, error: txError } = await supabase.from('transacoes').insert({
        entidade_id: entidadeAtual,
        conta_id: divida.conta_debito_id,
        tipo: 'saida',
        valor: valorParaBD,
        descricao: `Pagamento dívida: ${divida.nome}`,
        categoria: 'Dívidas',
        data: formPag.data,
        origem: 'divida',
        status: 'pago',
      }).select('id').single();
      transacaoId = txData?.id ?? null;
    }

    const { error } = await supabase.from('dividas_pagamentos').insert({
      divida_id: divida.id,
      data: formPag.data,
      valor_pago: valorParaBD,
      valor_principal: valorPrincipal,
      valor_juros: valorJuros,
      saldo_apos: saldoApos,
      transacao_id: transacaoId,
    });

    if (!error) {
      const novoStatus = saldoApos <= 0.01 ? 'quitada' : 'ativa';
      await supabase.from('dividas').update({
        valor_atual: saldoApos,
        parcelas_pagas: pags.length + 1,
        status: novoStatus,
      }).eq('id', divida.id);

      if (transacaoId) {
        await recalcularSaldoConta(divida.conta_debito_id);
        onTransacaoCriada?.();
      }

      setFormPag({ data: '', valor_pago: '', desconto: '' });
      setMostrarFormPag(null);
      await carregarPagamentosDivida(divida.id);
      carregar();
    } else if (transacaoId) {
      // Rollback: remove a transação se o registro do pagamento falhou
      await supabase.from('transacoes').delete().eq('id', transacaoId);
    }
    setSalvandoPag(false);
  }

  async function quitarAntecipadamente(e, divida, saldoDevedor, jurosFuturos) {
    e.preventDefault();
    setSalvandoAntecip(true);

    const descontoAnt = parseFloat(String(formAntecip.desconto || '0').replace(',', '.')) || 0;
    const multaPct    = parseFloat(String(formAntecip.multa || '0').replace(',', '.')) || 0;
    const valorSaldo  = parseFloat(String(formAntecip.valor).replace(',', '.')) || saldoDevedor;
    const valorBase   = valorSaldo - descontoAnt;          // saldo após desconto negociado
    const valorTotal  = valorBase * (1 + multaPct / 100);  // aplica multa sobre valor com desconto
    const valorMultaR = valorTotal - valorBase;

    const { error } = await supabase.from('dividas_pagamentos').insert({
      divida_id: divida.id,
      data: formAntecip.data,
      valor_pago: valorTotal,
      valor_principal: valorBase,
      // multa em R$ positivo; desconto aparece implícito em valorBase < valorSaldo
      valor_juros: valorMultaR,
      saldo_apos: 0,
    });

    if (!error) {
      // parcelas_pagas → parcelas_total quando definido, senão incrementa
      const novasParcelas = divida.parcelas_total
        ? Number(divida.parcelas_total)
        : (Number(divida.parcelas_pagas) || 0) + 1;

      await supabase.from('dividas').update({
        valor_atual: 0,
        parcelas_pagas: novasParcelas,
        status: 'quitada',
      }).eq('id', divida.id);

      setMostrarFormAntecip(null);
      setUltimaQuitacao({ id: divida.id, economiaJuros: jurosFuturos });
      await carregarPagamentosDivida(divida.id);
      carregar();
    }
    setSalvandoAntecip(false);
  }

  async function desfazerUltimoPagamento(divida) {
    const pags = pagamentos[divida.id] || [];
    if (pags.length === 0) return;
    const ultimo = pags[pags.length - 1];
    const saldoAnterior = pags.length > 1
      ? Number(pags[pags.length - 2].saldo_apos)
      : Number(divida.valor_original);

    await supabase.from('dividas_pagamentos').delete().eq('id', ultimo.id);
    await supabase.from('dividas').update({
      valor_atual: saldoAnterior,
      parcelas_pagas: Math.max(0, pags.length - 1),
      status: 'ativa',
    }).eq('id', divida.id);

    // Desfaz a transação associada e recalcula o saldo da conta
    if (ultimo.transacao_id) {
      await supabase.from('transacoes').delete().eq('id', ultimo.transacao_id);
      if (divida.conta_debito_id) await recalcularSaldoConta(divida.conta_debito_id);
    }

    if (ultimaQuitacao?.id === divida.id) setUltimaQuitacao(null);
    await carregarPagamentosDivida(divida.id);
    carregar();
  }

  async function excluirDivida(id) {
    await supabase.from('dividas').delete().eq('id', id);
    setExpandida(null);
    setConfirmandoExcluir(null);
    carregar();
  }

  // ── Dados do resumo ───────────────────────────────────────────────────────────

  const ativas      = dividas.filter((d) => d.status === 'ativa');
  const totalAtual  = ativas.reduce((s, d) => s + Number(d.valor_atual), 0);
  const proximaVenc = ativas.reduce((best, d) => {
    if (!best) return d;
    return calcularProximoVencimento(d) < calcularProximoVencimento(best) ? d : best;
  }, null);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Cabeçalho */}
      <div className="card-header">
        <span className="card-title-group">
          <span className="card-icon"><Wallet size={16} /></span>
          <p className="card-title">Dívidas</p>
        </span>
        <div className="card-header-actions">
          <button onClick={() => { setMostrarForm((v) => !v); setEditando(null); }} className="btn btn-ghost">
            + Nova dívida
          </button>
        </div>
      </div>

      {/* Resumo geral */}
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

      {/* ── Formulário nova dívida ── */}
      {mostrarForm && (
        <form
          onSubmit={adicionarDivida}
          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="input" placeholder="Nome da dívida *" value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              required style={{ flex: 2, minWidth: 180 }} autoFocus />
            <select className="input" value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })} style={{ flex: 1, minWidth: 140 }}>
              <option value="emprestimo">Empréstimo</option>
              <option value="financiamento">Financiamento</option>
              <option value="cartao_rotativo">Rotativo</option>
              <option value="outro">Outro</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={labelSx}>Valor original *</label>
              <input className="input" type="number" step="0.01" placeholder="0,00" value={form.valor_original}
                onChange={(e) => setForm({ ...form, valor_original: e.target.value })} required style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={labelSx}>Parcela mensal *</label>
              <input className="input" type="number" step="0.01" placeholder="0,00" value={form.parcela_valor}
                onChange={(e) => setForm({ ...form, parcela_valor: e.target.value })} required style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={labelSx}>Nº parcelas</label>
              <input className="input" type="number" placeholder="— sem limite" value={form.parcelas_total}
                onChange={(e) => setForm({ ...form, parcelas_total: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 100 }}>
              <label style={labelSx}>Já paguei (parcelas)</label>
              <input className="input" type="number" min="0" placeholder="0" value={form.parcelas_pagas}
                onChange={(e) => setForm({ ...form, parcelas_pagas: e.target.value })} style={{ width: '100%' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <label style={labelSx}>Data de início *</label>
              <input className="input" type="date" value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} required style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <label style={labelSx}>Juros % a.m.</label>
              <input className="input" type="number" step="0.01" placeholder="— sem juros" value={form.taxa_juros_mensal}
                onChange={(e) => setForm({ ...form, taxa_juros_mensal: e.target.value })} style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={labelSx}>Conta de débito</label>
              <select className="input" value={form.conta_debito_id}
                onChange={(e) => setForm({ ...form, conta_debito_id: e.target.value })} style={{ width: '100%' }}>
                <option value="">— nenhuma</option>
                {(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
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

      {/* ── Lista de dívidas ── */}
      {dividas.map((d) => {
        const progresso  = calcularProgressoPct(d);
        const dataQuit   = calcularDataQuitacao(d);   // usa d.valor_atual para o subtitle do header
        const proxVenc   = calcularProximoVencimento(d);
        const diasVenc   = diasAteData(proxVenc);
        const pagsD      = pagamentos[d.id] || [];
        const aberta     = expandida === d.id;
        const quitada    = d.status === 'quitada';
        const modoEdicao = editando === d.id;

        // Cálculos do painel (usa pagamentos carregados para precisão máxima)
        const saldoCalculado  = calcularSaldoDevedor(d, pagsD);
        const dividaComSaldo  = { ...d, valor_atual: saldoCalculado };
        const dataQuitPanel   = calcularDataQuitacao(dividaComSaldo);
        const jurosFuturos    = calcularTotalJurosFuturos(dividaComSaldo);
        const totalPago       = pagsD.reduce((s, p) => s + Number(p.valor_pago), 0);
        const totalJurosPagos = pagsD.reduce((s, p) => s + Number(p.valor_juros), 0);

        // Simulação "pagar a mais"
        const extraStr = simulacaoExtra[d.id] || '';
        const extraVal = parseFloat(extraStr) || 0;
        const dividaSim     = extraVal > 0 ? { ...dividaComSaldo, parcela_valor: Number(d.parcela_valor) + extraVal } : null;
        const dataQuitSim   = dividaSim ? calcularDataQuitacao(dividaSim) : null;
        const jurosFutSim   = dividaSim ? calcularTotalJurosFuturos(dividaSim) : null;

        // Feedback automático ao digitar valor no form de pagamento
        let feedbackPag = null;
        if (mostrarFormPag === d.id) {
          const valorDig = parseFloat(formPag.valor_pago) || 0;
          const parcela  = Number(d.parcela_valor);
          if (valorDig > 0 && Math.abs(valorDig - parcela) > 0.005) {
            if (valorDig < parcela) {
              feedbackPag = { tipo: 'desconto', valor: parcela - valorDig };
            } else {
              const extra = valorDig - parcela;
              let meses = null;
              if (d.taxa_juros_mensal && dataQuitPanel) {
                const taxa       = Number(d.taxa_juros_mensal) / 100;
                const jurosEste  = calcularJurosCiclo(saldoCalculado, taxa);
                const princPago  = Math.max(0, valorDig - jurosEste);
                const saldoAposT = Math.max(0, saldoCalculado - princPago);
                const dataExtra  = calcularDataQuitacao({ ...dividaComSaldo, valor_atual: saldoAposT });
                if (dataExtra) {
                  const diff = (dataQuitPanel.getFullYear() * 12 + dataQuitPanel.getMonth())
                             - (dataExtra.getFullYear()      * 12 + dataExtra.getMonth());
                  if (diff > 0) meses = diff;
                }
              }
              feedbackPag = { tipo: 'extra', valor: extra, meses };
            }
          }
        }

        // Pré-visualização do form de antecipação
        const valorAntecipNum  = parseFloat(formAntecip.valor) || saldoCalculado;
        const descontoAntecipN = parseFloat(formAntecip.desconto) || 0;
        const valorBaseAntecip = valorAntecipNum - descontoAntecipN;
        const multaAntecipPct  = parseFloat(formAntecip.multa) || 0;
        const multaAntecipR    = valorBaseAntecip * (multaAntecipPct / 100);
        const totalAntecip     = valorBaseAntecip + multaAntecipR;

        let corBorda = 'var(--surface-alt)';
        if (quitada) corBorda = 'var(--positive)';
        else if (diasVenc <= 3) corBorda = '#e0a000';

        return (
          <div key={d.id} style={{ border: `1px solid ${corBorda}`, borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>

            {/* Linha clicável */}
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
                      {diasVenc < 0 ? `atrasada ${Math.abs(diasVenc)}d` : diasVenc === 0 ? 'vence hoje' : `vence em ${diasVenc}d`}
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
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>de {formatarMoeda(d.valor_original)}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={(e) => abrirEdicao(e, d)} className="btn-link"
                    style={{ fontSize: 'var(--text-xs)', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', gap: 3 }}
                    title="Editar">
                    <Edit2 size={11} /> Editar
                  </button>
                  <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}>
                    {aberta ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </div>
              </div>
            </div>

            {/* Barra de progresso */}
            <div style={{ height: 4, background: 'var(--surface-alt)', margin: '0 14px' }}>
              <div style={{ height: '100%', width: `${progresso}%`, background: quitada ? 'var(--positive)' : 'var(--primary)', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <div style={{ padding: '3px 14px 10px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {progresso.toFixed(0)}% pago
              {d.parcelas_total ? ` · ${d.parcelas_pagas ?? 0}/${d.parcelas_total} parcelas` : ''}
            </div>

            {/* ── Painel expandido ── */}
            {aberta && (
              <div style={{ borderTop: '1px solid var(--surface-alt)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* ── MODO EDIÇÃO ── */}
                {modoEdicao ? (
                  <form onSubmit={(e) => editarDivida(e, d)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>Editar dívida</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input className="input" placeholder="Nome *" value={formEdit.nome}
                        onChange={(e) => setFormEdit({ ...formEdit, nome: e.target.value })}
                        required style={{ flex: 2, minWidth: 180 }} autoFocus />
                      <select className="input" value={formEdit.tipo}
                        onChange={(e) => setFormEdit({ ...formEdit, tipo: e.target.value })} style={{ flex: 1, minWidth: 140 }}>
                        <option value="emprestimo">Empréstimo</option>
                        <option value="financiamento">Financiamento</option>
                        <option value="cartao_rotativo">Rotativo</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={labelSx}>Parcela mensal *</label>
                        <input className="input" type="number" step="0.01" value={formEdit.parcela_valor}
                          onChange={(e) => setFormEdit({ ...formEdit, parcela_valor: e.target.value })} required style={{ width: '100%' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 100 }}>
                        <label style={labelSx}>Nº parcelas</label>
                        <input className="input" type="number" placeholder="— sem limite" value={formEdit.parcelas_total}
                          onChange={(e) => setFormEdit({ ...formEdit, parcelas_total: e.target.value })} style={{ width: '100%' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={labelSx}>Juros % a.m.</label>
                        <input className="input" type="number" step="0.01" placeholder="— sem juros" value={formEdit.taxa_juros_mensal}
                          onChange={(e) => setFormEdit({ ...formEdit, taxa_juros_mensal: e.target.value })} style={{ width: '100%' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <label style={labelSx}>Conta de débito</label>
                        <select className="input" value={formEdit.conta_debito_id}
                          onChange={(e) => setFormEdit({ ...formEdit, conta_debito_id: e.target.value })} style={{ width: '100%' }}>
                          <option value="">— nenhuma</option>
                          {(contas || []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Valor original, parcelas pagas e saldo devedor não são editáveis — derivam do histórico de pagamentos.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="submit" className="btn btn-primary" disabled={salvandoEdit}>
                        {salvandoEdit ? 'Salvando…' : 'Salvar alterações'}
                      </button>
                      <button type="button" onClick={() => setEditando(null)} className="btn-link">Cancelar</button>
                    </div>
                  </form>

                ) : (
                  <>
                    {/* ── RESUMO FINANCEIRO ── */}
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid var(--surface-alt)' }}>
                      {[
                        { label: 'Valor original',  valor: d.valor_original,  cor: null },
                        { label: 'Total já pago',    valor: totalPago,         cor: totalPago > 0 ? 'var(--positive)' : null },
                        { label: 'Juros pagos',      valor: totalJurosPagos,   cor: totalJurosPagos > 0 ? 'var(--negative)' : null },
                        { label: 'Saldo devedor',    valor: saldoCalculado,    cor: saldoCalculado > 0.01 ? 'var(--negative)' : 'var(--positive)' },
                      ].map(({ label, valor, cor }) => (
                        <div key={label}>
                          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '0 0 2px' }}>{label}</p>
                          <p style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-semibold)', margin: 0, color: cor || 'inherit' }}>
                            {formatarMoeda(valor)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* ── PROJEÇÃO + SIMULAÇÃO ── */}
                    {!quitada && (
                      <div style={{ paddingBottom: 12, borderBottom: '1px solid var(--surface-alt)' }}>
                        <p style={{ margin: '0 0 8px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Projeção
                        </p>
                        {dataQuitPanel ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 10 }}>
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Quitação estimada</p>
                              <p style={{ margin: 0, fontWeight: 'var(--weight-semibold)' }}>{formatarMesAno(dataQuitPanel)}</p>
                            </div>
                            {jurosFuturos > 0 && (
                              <div>
                                <p style={{ margin: '0 0 2px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Juros a pagar</p>
                                <p style={{ margin: 0, fontWeight: 'var(--weight-semibold)', color: 'var(--negative)' }}>{formatarMoeda(jurosFuturos)}</p>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p style={{ margin: '0 0 10px', fontSize: 'var(--text-sm)', color: 'var(--negative)' }}>
                            {d.taxa_juros_mensal
                              ? '⚠ A parcela atual não cobre os juros — esta dívida não quita com o valor atual da parcela.'
                              : 'Prazo indeterminado (sem total de parcelas definido).'}
                          </p>
                        )}

                        {/* Simulação "pagar a mais" */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                          <div>
                            <label style={labelSx}>Simular: pagar + R$ por mês</label>
                            <input className="input" type="number" step="0.01" placeholder="0,00" value={extraStr}
                              onChange={(e) => setSimulacaoExtra((prev) => ({ ...prev, [d.id]: e.target.value }))}
                              style={{ width: 130 }} />
                          </div>
                          {extraVal > 0 && (
                            <div style={{ fontSize: 'var(--text-sm)', display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
                              <span>Quita em <strong>{dataQuitSim ? formatarMesAno(dataQuitSim) : '— não quita'}</strong></span>
                              {jurosFuturos > 0 && jurosFutSim !== null && (
                                <span style={{ color: 'var(--positive)' }}>
                                  Economiza <strong>{formatarMoeda(Math.max(0, jurosFuturos - jurosFutSim))}</strong> em juros
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── HISTÓRICO DE PAGAMENTOS ── */}
                    {pagsD.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Nenhum pagamento registrado ainda.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: 'var(--text-sm)', borderCollapse: 'collapse', minWidth: 460 }}>
                          <thead>
                            <tr style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>
                              <th style={{ textAlign: 'left',  padding: '4px 8px 4px 0', fontWeight: 'normal' }}>Data</th>
                              <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Valor pago</th>
                              <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Principal</th>
                              <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Juros</th>
                              <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 'normal' }}>Saldo após</th>
                              <th style={{ padding: '4px 0' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagsD.map((p, idx) => (
                              <tr key={p.id} style={{ borderTop: '1px solid var(--surface-alt)' }}>
                                <td style={{ padding: '6px 8px 6px 0' }}>{formatarDataStr(p.data)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 0' }}>{formatarMoeda(p.valor_pago)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 0' }}>{formatarMoeda(p.valor_principal)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 0', color: Number(p.valor_juros) > 0 ? 'var(--negative)' : Number(p.valor_juros) < 0 ? 'var(--positive)' : 'var(--text-muted)' }}>
                                  {Number(p.valor_juros) < 0 ? `−${formatarMoeda(Math.abs(p.valor_juros))} desc.` : formatarMoeda(p.valor_juros)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 'var(--weight-semibold)' }}>{formatarMoeda(p.saldo_apos)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 0 6px 10px' }}>
                                  {idx === pagsD.length - 1 && (
                                    <button onClick={() => desfazerUltimoPagamento(d)} className="btn-link"
                                      style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }} title="Desfazer este pagamento">
                                      desfazer
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* ── REGISTRAR PAGAMENTO ── */}
                    {!quitada && (
                      mostrarFormPag === d.id ? (
                        <form onSubmit={(e) => registrarPagamento(e, d)}
                          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div>
                              <label style={labelSx}>Data</label>
                              <input className="input" type="date" value={formPag.data}
                                onChange={(e) => setFormPag({ ...formPag, data: e.target.value })}
                                required style={{ width: 140 }} autoFocus />
                            </div>
                            <div>
                              <label style={labelSx}>Valor pago</label>
                              <input className="input" type="number" step="0.01" placeholder={String(d.parcela_valor)}
                                value={formPag.valor_pago}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const valorDig = parseFloat(val) || 0;
                                  const parcela  = Number(d.parcela_valor);
                                  const autoDesc = valorDig > 0 && valorDig < parcela
                                    ? (parcela - valorDig).toFixed(2)
                                    : '';
                                  setFormPag({ ...formPag, valor_pago: val, desconto: autoDesc });
                                }}
                                required style={{ width: 130 }} />
                            </div>
                            <div>
                              <label style={labelSx}>Desconto obtido (R$)</label>
                              <input className="input" type="number" step="0.01" placeholder="0,00"
                                value={formPag.desconto} onChange={(e) => setFormPag({ ...formPag, desconto: e.target.value })}
                                style={{ width: 130 }} />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button type="submit" className="btn btn-primary" disabled={salvandoPag}>
                                {salvandoPag ? 'Salvando…' : 'Registrar'}
                              </button>
                              <button type="button" onClick={() => { setMostrarFormPag(null); setFormPag({ data: '', valor_pago: '', desconto: '' }); }} className="btn-link">
                                Cancelar
                              </button>
                            </div>
                          </div>

                          {/* Aviso: sem conta vinculada */}
                          {!d.conta_debito_id && (
                            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                              Sem conta vinculada — pagamento não reflete no saldo
                            </p>
                          )}

                          {/* Feedback automático: desconto ou amortização extra */}
                          {feedbackPag?.tipo === 'desconto' && (
                            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--positive)' }}>
                              ↓ Desconto de {formatarMoeda(feedbackPag.valor)} vs. parcela normal
                            </p>
                          )}
                          {feedbackPag?.tipo === 'extra' && (
                            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>
                              ↑ {formatarMoeda(feedbackPag.valor)} além da parcela — amortiza principal
                              {feedbackPag.meses && (
                                <span style={{ color: 'var(--text-muted)' }}>
                                  {' '}· quitação avança {feedbackPag.meses} {feedbackPag.meses === 1 ? 'mês' : 'meses'}
                                </span>
                              )}
                            </p>
                          )}
                        </form>
                      ) : (
                        <button
                          onClick={() => {
                            setMostrarFormPag(d.id);
                            setMostrarFormAntecip(null);
                            setFormPag({ data: HOJE, valor_pago: String(d.parcela_valor), desconto: '' });
                          }}
                          className="btn btn-ghost"
                          style={{ alignSelf: 'flex-start' }}
                        >
                          + Registrar pagamento
                        </button>
                      )
                    )}

                    {/* ── QUITAR ANTECIPADAMENTE ── */}
                    {!quitada && (
                      mostrarFormAntecip === d.id ? (
                        <form onSubmit={(e) => quitarAntecipadamente(e, d, saldoCalculado, jurosFuturos)}
                          style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 10, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                          <p style={{ margin: 0, fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)' }}>Quitar antecipadamente</p>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div>
                              <label style={labelSx}>Valor para quitar (R$)</label>
                              <input className="input" type="number" step="0.01"
                                value={formAntecip.valor}
                                onChange={(e) => setFormAntecip({ ...formAntecip, valor: e.target.value })}
                                required style={{ width: 150 }} autoFocus />
                            </div>
                            <div>
                              <label style={labelSx}>Desconto obtido (R$)</label>
                              <input className="input" type="number" step="0.01" placeholder="0,00"
                                value={formAntecip.desconto}
                                onChange={(e) => setFormAntecip({ ...formAntecip, desconto: e.target.value })}
                                style={{ width: 130 }} />
                            </div>
                            <div>
                              <label style={labelSx}>Multa % (opcional)</label>
                              <input className="input" type="number" step="0.01" placeholder="0"
                                value={formAntecip.multa}
                                onChange={(e) => setFormAntecip({ ...formAntecip, multa: e.target.value })}
                                style={{ width: 110 }} />
                            </div>
                            <div>
                              <label style={labelSx}>Data</label>
                              <input className="input" type="date"
                                value={formAntecip.data}
                                onChange={(e) => setFormAntecip({ ...formAntecip, data: e.target.value })}
                                required style={{ width: 140 }} />
                            </div>
                          </div>

                          {/* Preview desconto / multa / total */}
                          {(descontoAntecipN > 0 || multaAntecipPct > 0) && (
                            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                              {descontoAntecipN > 0 && (
                                <span>Desconto: <strong style={{ color: 'var(--positive)' }}>−{formatarMoeda(descontoAntecipN)}</strong></span>
                              )}
                              {multaAntecipPct > 0 && (
                                <span>Multa: <strong style={{ color: 'var(--negative)' }}>{formatarMoeda(multaAntecipR)}</strong></span>
                              )}
                              <span>Total a pagar: <strong>{formatarMoeda(totalAntecip)}</strong></span>
                            </p>
                          )}

                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary" disabled={salvandoAntecip}>
                              {salvandoAntecip ? 'Processando…' : 'Confirmar quitação'}
                            </button>
                            <button type="button" onClick={() => setMostrarFormAntecip(null)} className="btn-link">Cancelar</button>
                          </div>
                        </form>
                      ) : (
                        <button
                          onClick={() => {
                            setMostrarFormAntecip(d.id);
                            setMostrarFormPag(null);
                            setFormAntecip({ valor: saldoCalculado.toFixed(2), desconto: '', multa: '', data: HOJE });
                          }}
                          className="btn-link"
                          style={{ alignSelf: 'flex-start', fontSize: 'var(--text-sm)' }}
                        >
                          Quitar antecipadamente
                        </button>
                      )
                    )}

                    {/* ── CONFIRMAÇÃO DE QUITAÇÃO ── */}
                    {quitada && ultimaQuitacao?.id === d.id && (
                      <div style={{ background: 'rgba(0,180,90,0.08)', border: '1px solid var(--positive)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--positive)' }}>
                          ✓ Dívida quitada!
                          {ultimaQuitacao.economiaJuros > 0 && (
                            <> Você economizou <strong>{formatarMoeda(ultimaQuitacao.economiaJuros)}</strong> em juros vs. continuar pagando normalmente.</>
                          )}
                        </p>
                        <button onClick={() => setUltimaQuitacao(null)} className="btn-link" style={{ fontSize: 'var(--text-xs)', flexShrink: 0 }}>✕</button>
                      </div>
                    )}

                    {/* ── EXCLUIR DÍVIDA (confirmação inline) ── */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
                      {confirmandoExcluir === d.id ? (
                        <>
                          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Tem certeza?</span>
                          <button onClick={() => excluirDivida(d.id)} className="btn-link"
                            style={{ color: 'var(--negative)', fontSize: 'var(--text-sm)' }}>Sim, excluir</button>
                          <button onClick={() => setConfirmandoExcluir(null)} className="btn-link"
                            style={{ fontSize: 'var(--text-sm)' }}>Não</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmandoExcluir(d.id)} className="btn-link"
                          style={{ color: 'var(--negative)', fontSize: 'var(--text-sm)' }}>
                          excluir dívida
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
