'use client';

import CardDividas from './CardDividas';

export default function AbaDividas({ entidadeAtual, contas }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ font: `var(--weight-semibold) var(--text-xl) var(--font-display)`, margin: '0 0 2px' }}>Dívidas</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
          Acompanhe empréstimos, financiamentos e dívidas de cartão.
        </p>
      </div>
      <CardDividas entidadeAtual={entidadeAtual} contas={contas} />
    </div>
  );
}
