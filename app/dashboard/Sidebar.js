'use client';
import { Home, BarChart3, Landmark, Receipt, CalendarDays, Target, FileText, Settings, LogOut, Menu } from 'lucide-react';

const ITENS_MENU = [
  { view: 'home', Icone: Home, label: 'Painel' },
  { view: 'relatorios', Icone: BarChart3, label: 'Relatórios' },
  { view: 'contas-cartoes', Icone: Landmark, label: 'Contas & Cartões' },
  { view: 'contas-fixas', Icone: CalendarDays, label: 'Contas fixas' },
  { view: 'lancamentos', Icone: Receipt, label: 'Lançamentos' },
  { view: 'planejamento', Icone: Target, label: 'Planejamento' },
];
export default function Sidebar({
  perfil,
  view,
  setView,
  sair,
  sidebarAberta,
  sidebarMobileAberta,
  setSidebarMobileAberta,
  alternarSidebar,
  tipoEntidade,
}) {
  function irPara(v) {
    setView(v);
    setSidebarMobileAberta(false);
  }
  return (
    <>
      <div className={`sidebar-backdrop ${sidebarMobileAberta ? 'mobile-open' : ''}`} onClick={() => setSidebarMobileAberta(false)} />
      <aside className={`sidebar ${sidebarAberta ? '' : 'collapsed'} ${sidebarMobileAberta ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            {perfil.logo_url
              ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" />
              : <img src="/logo.png" alt="AppFinançasBr" className="brand-logo" />
            }
            <span className="brand-text">{perfil.nome_exibicao || 'AppFinançasBr'}</span>
          </div>
          <button onClick={alternarSidebar} className="sidebar-toggle" title="Recolher/expandir menu"><Menu size={18} /></button>
        </div>
        {ITENS_MENU.map((item) => (
          <button key={item.view} onClick={() => irPara(item.view)} className={`sidebar-link ${view === item.view ? 'active' : ''}`}>
            <span className="sidebar-icon"><item.Icone size={18} /></span><span className="sidebar-label">{item.label}</span>
          </button>
        ))}
        {tipoEntidade === 'PJ' && (
          <button onClick={() => irPara('relatorios')} className={`sidebar-link ${view === 'relatorios' ? 'active' : ''}`}>
            <span className="sidebar-icon"><FileText size={18} /></span><span className="sidebar-label">DRE</span>
          </button>
        )}
        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <button onClick={() => irPara('configuracoes')} className={`sidebar-link ${view === 'configuracoes' ? 'active' : ''}`}>
            <span className="sidebar-icon"><Settings size={18} /></span><span className="sidebar-label">Configurações</span>
          </button>
          <button onClick={sair} className="sidebar-link">
            <span className="sidebar-icon"><LogOut size={18} /></span><span className="sidebar-label">Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
