'use client';

export default function BottomNav({ aba, setAba, irParaSecao, onAbrirMenu }) {
  return (
    <nav className="bottom-nav">
      <button onClick={() => setAba('painel')} className={`bottom-nav-item ${aba === 'painel' ? 'active' : ''}`}>
        <span className="bottom-nav-icon">🏠</span>
        Painel
      </button>
      <button onClick={() => irParaSecao('secao-contas')} className="bottom-nav-item">
        <span className="bottom-nav-icon">🏦</span>
        Contas
      </button>
      <div className="bottom-nav-fab-wrap">
        <button onClick={() => irParaSecao('secao-lancamentos')} className="bottom-nav-fab" title="Novo lançamento">+</button>
      </div>
      <button onClick={() => setAba('relatorios')} className={`bottom-nav-item ${aba === 'relatorios' ? 'active' : ''}`}>
        <span className="bottom-nav-icon">📊</span>
        Relatórios
      </button>
      <button onClick={onAbrirMenu} className="bottom-nav-item">
        <span className="bottom-nav-icon">☰</span>
        Mais
      </button>
    </nav>
  );
}
