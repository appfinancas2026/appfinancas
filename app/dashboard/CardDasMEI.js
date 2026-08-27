'use client';

import { useState } from 'react';
import { formatarMoeda } from '../../lib/financeiro';

export default function CardDasMEI({
  dasFixo,
  ocorrenciasDoMes,
  confirmarOcorrencia,
  criarDas,
  salvarEdicaoDas,
  entidadeAtualObj,
  nomeMes,
}) {
  // Todos os hooks ANTES de qualquer return condicional
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formValor, setFormValor] = useState('');
  const [formDia, setFormDia] = useState('20');
  const [salvando, setSalvando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [editValor, setEditValor] = useState('');
  const [editDia, setEditDia] = useState('');

  if (!entidadeAtualObj?.is_mei) return null;

  // Ocorrência do mês derivada do mapa já existente (atualizado por garantirOcorrenciasDoMes)
  const dasOcorrencia = dasFixo ? (ocorrenciasDoMes?.[dasFixo.id] ?? null) : null;
  const pago = dasOcorrencia?.status === 'confirmado';

  async function handleCriar(e) {
    e.preventDefault();
    const valor = parseFloat(formValor);
    const dia = parseInt(formDia, 10);
    if (!valor || !dia) return;
    setSalvando(true);
    await criarDas(valor, dia);
    setSalvando(false);
    setMostrarForm(false);
    setFormValor('');
    setFormDia('20');
  }

  function iniciarEdicao() {
    setEditValor(String(dasFixo.valor_padrao));
    setEditDia(String(dasFixo.dia_referencia));
    setEditando(true);
  }

  async function handleEditar(e) {
    e.preventDefault();
    const valor = parseFloat(editValor);
    const dia = parseInt(editDia, 10);
    if (!valor || !dia) return;
    setSalvando(true);
    await salvarEdicaoDas(valor, dia);
    setSalvando(false);
    setEditando(false);
  }

  // ── CASO A: DAS não cadastrado ────────────────────────────────────────────
  if (!dasFixo) {
    return (
      <div className="card">
        <div className="card-header">
          <span className="card-title-group">
            <p className="card-title">DAS mensal</p>
          </span>
        </div>

        {!mostrarForm ? (
          <>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
              Cadastre seu DAS mensal para acompanhar o imposto do MEI.
            </p>
            <button onClick={() => setMostrarForm(true)} className="btn btn-primary" style={{ width: '100%' }}>
              Cadastrar DAS
            </button>
          </>
        ) : (
          <form onSubmit={handleCriar} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Valor do DAS (R$)
              </label>
              <input
                className="input"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 75.90"
                value={formValor}
                onChange={(e) => setFormValor(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div>
              <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
                Dia de vencimento (padrão: 20)
              </label>
              <input
                className="input"
                type="number"
                min="1"
                max="31"
                placeholder="20"
                value={formDia}
                onChange={(e) => setFormDia(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Confirmar'}
              </button>
              <button type="button" onClick={() => setMostrarForm(false)} className="btn btn-ghost">
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // ── CASO B: DAS cadastrado ────────────────────────────────────────────────
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title-group">
          <p className="card-title">DAS de {nomeMes}</p>
        </span>
        {!editando && (
          <button onClick={iniciarEdicao} className="btn-link" style={{ fontSize: 'var(--text-sm)' }}>
            editar
          </button>
        )}
      </div>

      {editando ? (
        <form onSubmit={handleEditar} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 4 }}>
          <div>
            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Novo valor (R$)
            </label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={editValor}
              onChange={(e) => setEditValor(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
              Dia de vencimento
            </label>
            <input
              className="input"
              type="number"
              min="1"
              max="31"
              value={editDia}
              onChange={(e) => setEditDia(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="btn btn-ghost">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', fontVariantNumeric: 'tabular-nums' }}>
              {formatarMoeda(dasFixo.valor_padrao)}
            </span>
            <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
              vence dia {dasFixo.dia_referencia}
            </span>
          </div>

          {pago ? (
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Pago ✓
            </span>
          ) : dasOcorrencia ? (
            <button
              onClick={() => confirmarOcorrencia(dasFixo, dasOcorrencia)}
              className="btn btn-primary"
            >
              Pagar
            </button>
          ) : (
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Pendente
            </span>
          )}
        </div>
      )}
    </div>
  );
}
