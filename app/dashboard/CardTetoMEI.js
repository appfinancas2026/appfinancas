'use client';

import { formatarMoeda } from '../../lib/financeiro';

const MESES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const COR_ZONA = {
  verde: 'var(--primary)',
  amarelo: 'var(--accent)',
  vermelho: 'var(--negative)',
};

export default function CardTetoMEI({ statusMEI, entidadeAtualObj }) {
  if (!entidadeAtualObj?.is_mei || !statusMEI) return null;

  const { teto, tetoProporcional, acumulado, percentual, zona, limiteTolerancia, projecao } = statusMEI;
  const { mesEstouro, vaiEstourar } = projecao;
  const anoAtual = new Date().getFullYear();
  const cor = COR_ZONA[zona];

  // Barra: barEnd = 115% do limiteTolerancia (ou acumulado*105% se extrapolou)
  const barEnd = Math.max(limiteTolerancia * 1.15, acumulado * 1.05);
  const pctTeto = (teto / barEnd) * 100;
  const pctTolZone = ((limiteTolerancia - teto) / barEnd) * 100;
  const pctFill = Math.min((acumulado / barEnd) * 100, 100);

  // Mensagem contextual por zona
  let mensagem;
  if (zona === 'verde') {
    mensagem = vaiEstourar
      ? `No ritmo atual, você atinge o teto em ${MESES_PT[(mesEstouro ?? 1) - 1]}.`
      : 'Dentro do limite. No ritmo atual, não atinge o teto este ano.';
  } else if (zona === 'amarelo') {
    mensagem = acumulado <= teto
      ? `Atenção: você já usou ${(percentual * 100).toFixed(0)}% do teto.`
      : 'Você passou do teto, mas ainda dentro da margem de 20% (regularizável pagando a diferença).';
  } else {
    mensagem = 'Teto ultrapassado além da margem de 20% — risco de desenquadramento. Procure seu contador.';
  }

  // Mês de abertura para label do teto proporcional
  let mesAberturaLabel = null;
  if (tetoProporcional && entidadeAtualObj.data_abertura) {
    const m = parseInt(entidadeAtualObj.data_abertura.slice(5, 7), 10) - 1;
    mesAberturaLabel = MESES_PT[m] ?? null;
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title-group">
          <p className="card-title">Teto MEI {anoAtual}</p>
        </span>
      </div>

      {/* Valores */}
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-semibold)', color: cor, fontVariantNumeric: 'tabular-nums' }}>
          {formatarMoeda(acumulado)}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', marginLeft: 6 }}>
          de {formatarMoeda(teto)} ({(percentual * 100).toFixed(0)}%)
        </span>
        {tetoProporcional && mesAberturaLabel && (
          <span style={{ display: 'block', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
            teto proporcional (aberto em {mesAberturaLabel})
          </span>
        )}
      </div>

      {/* Barra de progresso com três zonas visuais */}
      <div
        style={{ position: 'relative', display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', marginBottom: 12 }}
        role="progressbar"
        aria-valuenow={Math.round(percentual * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Zona verde: 0 → teto */}
        <div style={{ width: `${pctTeto}%`, background: 'var(--primary-tint)' }} />
        {/* Zona amarela: teto → teto*1.20 */}
        <div style={{ width: `${pctTolZone}%`, background: 'var(--accent-tint)' }} />
        {/* Zona vermelha: além */}
        <div style={{ flex: 1, background: 'var(--negative-tint)' }} />
        {/* Fill: acumulado em cor sólida da zona */}
        {pctFill > 0 && (
          <div style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            width: `${pctFill}%`, minWidth: 4,
            background: cor,
            borderRadius: 6,
          }} />
        )}
      </div>

      {/* Mensagem contextual */}
      <p style={{ fontSize: 'var(--text-sm)', color: zona === 'verde' ? 'var(--text-muted)' : cor, margin: 0, lineHeight: 1.5 }}>
        {mensagem}
      </p>
    </div>
  );
}
