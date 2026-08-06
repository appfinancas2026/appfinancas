'use client';
const ITENS_MENU = [
  { view: 'home', icone: '🏠', label: 'Painel' },
  { view: 'relatorios', icone: '📊', label: 'Relatórios' },
  { view: 'fluxo', icone: '💹', label: 'Fluxo de Caixa' },
  { view: 'assistente', icone: '✨', label: 'Assistente IA' },
  { view: 'contas-cartoes', icone: '🏦', label: 'Contas & Cartões' },
  { view: 'lancamentos', icone: '🧾', label: 'Lançamentos' },
  { view: 'contas-fixas', icone: '📆', label: 'Contas fixas' },
  { view: 'planejamento', icone: '🎯', label: 'Planejamento' },
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
          <button onClick={alternarSidebar} className="sidebar-toggle" title="Recolher/expandir menu">☰</button>
        </div>
        {ITENS_MENU.map((item) => (
          <button key={item.view} onClick={() => irPara(item.view)} className={`sidebar-link ${view === item.view ? 'active' : ''}`}>
            <span className="sidebar-icon">{item.icone}</span><span className="sidebar-label">{item.label}</span>
          </button>
        ))}
        {tipoEntidade === 'PJ' && (
          <button onClick={() => irPara('relatorios')} className={`sidebar-link ${view === 'relatorios' ? 'active' : ''}`}>
            <span className="sidebar-icon">📑</span><span className="sidebar-label">DRE</span>
          </button>
        )}
        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <button onClick={() => irPara('configuracoes')} className={`sidebar-link ${view === 'configuracoes' ? 'active' : ''}`}>
            <span className="sidebar-icon">⚙</span><span className="sidebar-label">Configurações</span>
          </button>
          <button onClick={sair} className="sidebar-link">
            <span className="sidebar-icon">🚪</span><span className="sidebar-label">Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
