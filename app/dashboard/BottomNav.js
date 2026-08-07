'use client';

import { Home, Landmark, BarChart3, Menu } from 'lucide-react';

export default function BottomNav({ view, setView, onAbrirMenu }) {
  return (
    <nav className="bottom-nav">
      <button onClick={() => setView('home')} className={`bottom-nav-item ${view === 'home' ? 'active' : ''}`}>
        <span className="bottom-nav-icon"><Home size={20} /></span>
        Painel
      </button>
      <button onClick={() => setView('contas-cartoes')} className={`bottom-nav-item ${view === 'contas-cartoes' ? 'active' : ''}`}>
        <span className="bottom-nav-icon"><Landmark size={20} /></span>
        Contas
      </button>
      <div className="bottom-nav-fab-wrap">
        <button onClick={() => setView('lancamentos')} className="bottom-nav-fab" title="Novo lançamento">+</button>
      </div>
      <button onClick={() => setView('relatorios')} className={`bottom-nav-item ${view === 'relatorios' ? 'active' : ''}`}>
        <span className="bottom-nav-icon"><BarChart3 size={20} /></span>
        Relatórios
      </button>
      <button onClick={onAbrirMenu} className="bottom-nav-item">
        <span className="bottom-nav-icon"><Menu size={20} /></span>
        Mais
      </button>
    </nav>
  );
}
