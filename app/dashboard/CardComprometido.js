'use client';

import { TrendingDown } from 'lucide-react';
import { formatarMoeda } from '../../lib/financeiro';

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatarCompacto(valor) {
  if (valor >= 1000) return `${(valor / 1000).toFixed(1).replace('.', ',')}k`;
  return `R$${valor.toFixed(0)}`;
}

export default function CardComprometido({ comprometidoFuturo }) {
  if (!comprometidoFuturo) return null;

  const { total, porMes, maioresParcelas } = comprometidoFuturo;

  if (total === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title-group">
            <div className="card-icon" style={{ background: 'var(--surface-alt)' }}>
              <TrendingDown size={14} style={{ color: 'var(--text-muted)' }} />
            </div>
            <h2 className="card-title">Comprometido com parcelas</h2>
          </div>
        </div>
        <p className="empty-hint">Nenhuma parcela futura encontrada.</p>
      </div>
    );
  }

  const maxValor = Math.max(...porMes.map((m) => m.valor), 1);
  const BAR_AREA_HEIGHT = 64;

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title-group">
          <div className="card-icon" style={{ background: 'var(--surface-alt)' }}>
            <TrendingDown size={14} style={{ color: 'var(--primary)' }} />
          </div>
          <h2 className="card-title">Comprometido com parcelas</h2>
        </div>
      </div>

      {/* Número âncora */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {formatarMoeda(total)}
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
          em parcelas · próximos 6 meses
        </p>
      </div>

      {/* Gráfico de barras CSS */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: BAR_AREA_HEIGHT + 16 }}>
          {porMes.map((m) => {
            const barH = m.valor > 0 ? Math.max(Math.round((m.valor / maxValor) * BAR_AREA_HEIGHT), 4) : 0;
            const mesIdx = parseInt(m.mesRef.slice(5, 7), 10) - 1;
            return (
              <div
                key={m.mesRef}
                title={formatarMoeda(m.valor)}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
              >
                <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', minHeight: 14, lineHeight: '14px' }}>
                  {m.valor > 0 ? formatarCompacto(m.valor) : ''}
                </span>
                <div style={{
                  width: '100%',
                  height: barH,
                  background: 'var(--primary)',
                  borderRadius: '3px 3px 0 0',
                  opacity: 0.85,
                }} />
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          {porMes.map((m) => {
            const mesIdx = parseInt(m.mesRef.slice(5, 7), 10) - 1;
            return (
              <span key={m.mesRef} style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                {MESES_CURTOS[mesIdx]}
              </span>
            );
          })}
        </div>
      </div>

      {/* Maiores parcelas do próximo mês */}
      {maioresParcelas.length > 0 && (
        <div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 'var(--weight-medium)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Próximo mês
          </p>
          {maioresParcelas.map((p, i) => (
            <div
              key={i}
              className="row-main"
              style={{ padding: '5px 0', borderTop: i === 0 ? '1px solid var(--border)' : 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-medium)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.nome || '—'}
                </span>
                {p.parcela && (
                  <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)', fontSize: 10, padding: '1px 6px', flexShrink: 0 }}>
                    {p.parcela}
                  </span>
                )}
              </div>
              <span className="amount">{formatarMoeda(p.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
