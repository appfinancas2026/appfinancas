'use client';

export default function BottomNav({ view, setView, onAbrirMenu }) {
  return (
    <nav className="bottom-nav">
      <button onClick={() => setView('home')} className={`bottom-nav-item ${view === 'home' ? 'active' : ''}`}>
        <span className="bottom-nav-icon">🏠</span>
        Painel
      </button>
      <button onClick={() => setView('contas-cartoes')} className={`bottom-nav-item ${view === 'contas-cartoes' ? 'active' : ''}`}>
        <span className="bottom-nav-icon">🏦</span>
        Contas
      </button>
      <div className="bottom-nav-fab-wrap">
        <button onClick={() => setView('lancamentos')} className="bottom-nav-fab" title="Novo lançamento">+</button>
      </div>
      <button onClick={() => setView('relatorios')} className={`bottom-nav-item ${view === 'relatorios' ? 'active' : ''}`}>
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
