'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ArrowLeftRight } from 'lucide-react';
import { formatarMoeda } from '../../lib/financeiro';
import CampoDescricao from './CampoDescricao';
import CampoCategoria from './CampoCategoria';

const LIMITE_LISTA = 6;
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatarCabecalhoDia(dataISO) {
  const d = new Date(`${dataISO}T00:00:00`);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()}`;
}

// Lista de lançamentos do mês (visão), separada do formulário de novo
// lançamento (ação) para permitir que fiquem em lugares diferentes numa
// fase futura.
export default function CardListaLancamentos({
  entidadeAtual,
  transacoes,
  contas,
  nomeMes,
  aberto,
  onAlternarAberto,
  expandirLancamentos,
  setExpandirLancamentos,
  edicaoTransacaoId,
  setEdicaoTransacaoId,
  formTransacao,
  setFormTransacao,
  salvarEdicaoTransacao,
  iniciarEdicaoTransacao,
  excluirTransacao,
  classificarEssencialidade,
}) {
  const [filtroContaId, setFiltroContaId] = useState('');

  const mostrarFiltro = (contas || []).length > 1;

  const filtradas = filtroContaId
    ? transacoes.filter((t) => t.conta_id === filtroContaId)
    : transacoes;

  return (
    <div className="card card-lancamentos">
      <div className="card-header">
        <p className="card-title" style={{ marginBottom: 0 }}>Lançamentos de {nomeMes}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {mostrarFiltro && (
            <select
              className="input"
              style={{ fontSize: 12, padding: '3px 8px', height: 28 }}
              value={filtroContaId}
              onChange={(e) => { setFiltroContaId(e.target.value); setExpandirLancamentos(false); }}
            >
              <option value="">Todas as contas</option>
              {(contas || []).map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
            </select>
          )}
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        </div>
      </div>
      {aberto && (
        <>
          {filtradas.length === 0 && (
            <p className="empty-hint">
              {filtroContaId
                ? 'Nenhum lançamento nesta conta neste mês.'
                : `Nenhum lançamento em ${nomeMes.toLowerCase()}.`}
            </p>
          )}
          {(() => {
            let dataAnterior = null;
            return (expandirLancamentos ? filtradas : filtradas.slice(0, LIMITE_LISTA)).map((t) => {
              const novoDia = t.data !== dataAnterior;
              dataAnterior = t.data;
              return (
                <div key={t.id}>
                  {novoDia && <p className="date-header">{formatarCabecalhoDia(t.data)}</p>}
                  {edicaoTransacaoId === t.id ? (
                    <form onSubmit={salvarEdicaoTransacao} className="form-row" style={{ padding: '10px 0' }}>
                      <input className="input" style={{ width: 100 }} type="number" step="0.01" value={formTransacao.valor} onChange={(e) => setFormTransacao({ ...formTransacao, valor: e.target.value })} required />
                      <CampoDescricao entidadeAtual={entidadeAtual} tipo={formTransacao.tipo} value={formTransacao.descricao} onChange={(e) => setFormTransacao({ ...formTransacao, descricao: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                      <CampoCategoria entidadeAtual={entidadeAtual} tipo={formTransacao.tipo} value={formTransacao.categoria} onChange={(e) => setFormTransacao({ ...formTransacao, categoria: e.target.value })} style={{ width: 120 }} />
                      <input className="input" style={{ width: 140 }} type="date" value={formTransacao.data} onChange={(e) => setFormTransacao({ ...formTransacao, data: e.target.value })} />
                      {t.tipo === 'saida' && (
                        <select className="input" value={formTransacao.essencialidade} onChange={(e) => setFormTransacao({ ...formTransacao, essencialidade: e.target.value })}>
                          <option value="">Essencialidade (opc.)</option>
                          <option value="essencial">Essencial</option>
                          <option value="desejavel">Desejável</option>
                          <option value="superfluo">Supérfluo</option>
                        </select>
                      )}
                      <button type="submit" className="btn btn-primary">Salvar</button>
                      <button type="button" onClick={() => setEdicaoTransacaoId(null)} className="btn-link">Cancelar</button>
                    </form>
                  ) : (
                    <div className="row row-lancamento">
                      <div className="lancamento-info">
                        <p className="row-title" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{t.transferencia_id && <ArrowLeftRight size={13} />}{t.descricao || t.categoria}</p>
                        <p className="row-subtitle">{t.transferencia_id ? 'transferência entre contas' : t.categoria}</p>
                      </div>
                      <div className="row-actions lancamento-actions">
                        {t.tipo === 'saida' && !t.transferencia_id && !t.essencialidade && (
                          <select
                            className="input"
                            style={{ fontSize: 11, padding: '4px 6px', borderColor: 'var(--accent)' }}
                            value=""
                            onChange={(e) => classificarEssencialidade(t, e.target.value)}
                          >
                            <option value="">Classificar</option>
                            <option value="essencial">Essencial</option>
                            <option value="desejavel">Desejável</option>
                            <option value="superfluo">Supérfluo</option>
                          </select>
                        )}
                        <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>
                          {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                        </span>
                        {!t.transferencia_id && <button onClick={() => iniciarEdicaoTransacao(t)} className="btn-link">editar</button>}
                        <button onClick={() => excluirTransacao(t)} className="btn-link">excluir</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            });
          })()}
          {filtradas.length > LIMITE_LISTA && (
            <div className="show-more-row">
              <button onClick={() => setExpandirLancamentos((v) => !v)} className="btn-link">
                {expandirLancamentos ? 'ver menos' : `ver mais (${filtradas.length - LIMITE_LISTA})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
