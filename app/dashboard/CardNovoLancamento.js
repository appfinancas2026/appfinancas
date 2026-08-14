'use client';

import { Receipt, Sparkles } from 'lucide-react';
import { formatarMoeda } from '../../lib/financeiro';
import CampoDescricao from './CampoDescricao';
import CampoCategoria from './CampoCategoria';
import CapturaRapida from './CapturaRapida';

// Formulário de lançamento manual (ação), separado da lista de lançamentos
// (visão) para permitir que fiquem em lugares diferentes numa fase futura.
export default function CardNovoLancamento({
  entidadeAtual,
  contas,
  adicionarTransacao,
  tipo,
  setTipo,
  valor,
  setValor,
  descricao,
  setDescricao,
  categoria,
  setCategoria,
  dataLancamento,
  setDataLancamento,
  essencialidade,
  setEssencialidade,
  contaLancamentoId,
  setContaLancamentoId,
  mostrarCapturaRapida,
  setMostrarCapturaRapida,
  aplicarExtracaoIA,
  sugestao,
  setSugestao,
  aplicarSugestao,
}) {
  return (
    <div className="card card-lancamentos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <span className="card-title-group" style={{ marginBottom: 0 }}><span className="card-icon"><Receipt size={16} /></span><p className="card-title">Novo lançamento</p></span>
        {!mostrarCapturaRapida && (
          <button onClick={() => setMostrarCapturaRapida(true)} className="btn btn-ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> Capturar com IA</button>
        )}
      </div>
      {mostrarCapturaRapida && (
        <CapturaRapida onExtraido={aplicarExtracaoIA} onFechar={() => setMostrarCapturaRapida(false)} />
      )}
      {sugestao && (
        <div className="suggestion-banner">
          <span>
            Histórico sugere: <strong>{sugestao.tipo === 'entrada' ? 'Entrada' : 'Saída'}</strong>
            {sugestao.valor && <> · <strong>{formatarMoeda(sugestao.valor)}</strong></>}
            {sugestao.categoria && <> · {sugestao.categoria}</>}
            {sugestao.conta_nome && <> · {sugestao.conta_nome}</>}
            {sugestao.essencialidade && <> · {sugestao.essencialidade}</>}
          </span>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={aplicarSugestao} className="btn-link btn-link-accent">usar</button>
            <button type="button" onClick={() => setSugestao(null)} className="btn-link">ignorar</button>
          </div>
        </div>
      )}
      <form onSubmit={adicionarTransacao} className="form-row">
        <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="saida">Saída (despesa)</option>
          <option value="entrada">Entrada (receita)</option>
        </select>
        <input className="input" style={{ width: 100 }} type="number" step="0.01" placeholder="Valor" aria-label="Valor" value={valor} onChange={(e) => setValor(e.target.value)} required />
        <CampoDescricao entidadeAtual={entidadeAtual} tipo={tipo} value={descricao} onChange={(e) => setDescricao(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <CampoCategoria entidadeAtual={entidadeAtual} tipo={tipo} value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <input className="input" style={{ width: 150 }} type="date" aria-label="Data do lançamento" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} required />
        {tipo === 'saida' && (
          <select className="input" value={essencialidade} onChange={(e) => setEssencialidade(e.target.value)}>
            <option value="">Essencialidade (opc.)</option>
            <option value="essencial">Essencial</option>
            <option value="desejavel">Desejável</option>
            <option value="superfluo">Supérfluo</option>
          </select>
        )}
        <select className="input" value={contaLancamentoId} onChange={(e) => setContaLancamentoId(e.target.value)} required>
          <option value="" disabled>Conta *</option>
          {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}{c.principal ? ' ★' : ''}</option>))}
        </select>
        <button type="submit" className="btn btn-primary" disabled={contas.length === 0}>Lançar</button>
      </form>
      {contas.length === 0 && <p className="error-hint">Cadastre uma conta antes de lançar movimentações.</p>}
    </div>
  );
}
