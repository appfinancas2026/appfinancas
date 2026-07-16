'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const LIMITE_INICIAL = 15;

const ROTULO_TABELA = {
  transacoes: 'lançamento',
  contas: 'conta',
  cartoes: 'cartão',
  metas: 'meta',
  orcamentos: 'orçamento',
  lancamentos_fixos: 'lançamento fixo',
  lancamentos_fixos_mensal: 'ocorrência mensal',
};

const ROTULO_OPERACAO = {
  INSERT: { texto: 'criou', cor: 'var(--primary)' },
  UPDATE: { texto: 'editou', cor: 'var(--accent)' },
  DELETE: { texto: 'excluiu', cor: 'var(--negative)' },
};

function formatarQuando(iso) {
  const d = new Date(iso);
  const agora = new Date();
  const diffMin = Math.floor((agora - d) / 60000);

  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffMin < 1440) return `há ${Math.floor(diffMin / 60)}h`;

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CardAuditoria({ entidadeAtual, aberto, onAlternarAberto }) {
  const [registros, setRegistros] = useState([]);
  const [expandir, setExpandir] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async (entidadeId) => {
    if (!entidadeId) return;
    setCarregando(true);

    const { data } = await supabase
      .from('auditoria')
      .select('id, operacao, tabela, descricao, created_at, usuario_id, usuarios(nome, nome_exibicao)')
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: false })
      .limit(60);

    setRegistros(data || []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    if (entidadeAtual && aberto) carregar(entidadeAtual);
  }, [entidadeAtual, aberto, carregar]);

  const visiveis = expandir ? registros : registros.slice(0, LIMITE_INICIAL);

  return (
    <div className="card" id="secao-atividade">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon">📜</span><p className="card-title">Atividade recente</p></span>
        <div className="card-header-actions">
          <button onClick={() => carregar(entidadeAtual)} className="btn btn-ghost" disabled={carregando}>
            {carregando ? 'Atualizando...' : '↻ Atualizar'}
          </button>
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? '▾' : '▸'}</button>
        </div>
      </div>

      {aberto && (
        <>
          {registros.length === 0 && !carregando && (
            <p className="empty-hint">Nenhuma atividade registrada ainda.</p>
          )}

          {visiveis.map((r) => {
            const op = ROTULO_OPERACAO[r.operacao] || { texto: r.operacao, cor: 'var(--text-muted)' };
            const quem = r.usuarios?.nome_exibicao || r.usuarios?.nome || 'Alguém';
            const oque = ROTULO_TABELA[r.tabela] || r.tabela;

            return (
              <div key={r.id} className="row row-main">
                <div>
                  <p className="row-title" style={{ fontWeight: 400 }}>
                    <strong>{quem}</strong>{' '}
                    <span style={{ color: op.cor, fontWeight: 600 }}>{op.texto}</span>{' '}
                    {oque}
                    {r.descricao && <span style={{ color: 'var(--text-muted)' }}> · {r.descricao}</span>}
                  </p>
                </div>
                <span className="row-subtitle" style={{ whiteSpace: 'nowrap' }}>{formatarQuando(r.created_at)}</span>
              </div>
            );
          })}

          {registros.length > LIMITE_INICIAL && (
            <div className="show-more-row">
              <button onClick={() => setExpandir((v) => !v)} className="btn-link">
                {expandir ? 'ver menos' : `ver mais (${registros.length - LIMITE_INICIAL})`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
