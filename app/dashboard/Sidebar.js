'use client';

const ITENS_SECAO = [
  { id: 'secao-contas', icone: '🏦', label: 'Contas' },
  { id: 'secao-cartoes', icone: '💳', label: 'Cartões' },
  { id: 'secao-receitas', icone: '⬇', label: 'Receitas fixas' },
  { id: 'secao-despesas', icone: '⬆', label: 'Despesas fixas' },
  { id: 'secao-metas', icone: '🎯', label: 'Metas' },
  { id: 'secao-lancamentos', icone: '🧾', label: 'Lançamentos' },
];

export default function Sidebar({
  perfil,
  aba,
  setAba,
  irParaSecao,
  sair,
  sidebarAberta,
  sidebarMobileAberta,
  setSidebarMobileAberta,
  alternarSidebar,
  setMostrarConfiguracoes,
}) {
  return (
    <>
      <div className={`sidebar-backdrop ${sidebarMobileAberta ? 'mobile-open' : ''}`} onClick={() => setSidebarMobileAberta(false)} />
      <aside className={`sidebar ${sidebarAberta ? '' : 'collapsed'} ${sidebarMobileAberta ? 'mobile-open' : ''}`}>
        <button onClick={alternarSidebar} className="sidebar-toggle" title="Recolher/expandir menu">☰</button>

        <div className="sidebar-brand">
          {perfil.logo_url ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}
          <span className="brand-text" style={{ fontWeight: 700, fontSize: 14 }}>{perfil.nome_exibicao || 'Finanças'}</span>
        </div>

        <button onClick={() => { setAba('painel'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'painel' ? 'active' : ''}`}>
          <span className="sidebar-icon">🏠</span><span className="sidebar-label">Painel</span>
        </button>
        <button onClick={() => { setAba('relatorios'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'relatorios' ? 'active' : ''}`}>
          <span className="sidebar-icon">📊</span><span className="sidebar-label">Relatórios</span>
        </button>

        <div className="sidebar-divider" />

        {ITENS_SECAO.map((item) => (
          <button key={item.id} onClick={() => irParaSecao(item.id)} className="sidebar-link">
            <span className="sidebar-icon">{item.icone}</span><span className="sidebar-label">{item.label}</span>
          </button>
        ))}

        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <button onClick={() => setMostrarConfiguracoes((v) => !v)} className="sidebar-link">
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
