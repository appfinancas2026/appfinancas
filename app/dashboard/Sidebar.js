'use client';

const ITENS_SECAO = [
  { id: 'secao-contas', chave: 'contas', icone: '🏦', label: 'Contas' },
  { id: 'secao-cartoes', chave: 'cartoes', icone: '💳', label: 'Cartões' },
  { id: 'secao-receitas', chave: 'receitas', icone: '⬇', label: 'Receitas fixas' },
  { id: 'secao-despesas', chave: 'despesas', icone: '⬆', label: 'Despesas fixas' },
  { id: 'secao-orcamento', chave: 'orcamento', icone: '📋', label: 'Orçamento' },
  { id: 'secao-metas', chave: 'metas', icone: '🎯', label: 'Metas' },
  { id: 'secao-lancamentos', chave: 'lancamentos', icone: '🧾', label: 'Lançamentos' },
  { id: 'secao-membros', chave: 'membros', icone: '👥', label: 'Quem tem acesso' },
  { id: 'secao-atividade', chave: 'atividade', icone: '📜', label: 'Atividade' },
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
  secoesOcultas = [],
}) {
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

        <button onClick={() => { setAba('painel'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'painel' ? 'active' : ''}`}>
          <span className="sidebar-icon">🏠</span><span className="sidebar-label">Painel</span>
        </button>
        <button onClick={() => { setAba('relatorios'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'relatorios' ? 'active' : ''}`}>
          <span className="sidebar-icon">📊</span><span className="sidebar-label">Relatórios</span>
        </button>
        <button onClick={() => { setAba('dre'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'dre' ? 'active' : ''}`}>
          <span className="sidebar-icon">📑</span><span className="sidebar-label">DRE</span>
        </button>
        <button onClick={() => { setAba('fluxo'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'fluxo' ? 'active' : ''}`}>
          <span className="sidebar-icon">💹</span><span className="sidebar-label">Fluxo de Caixa</span>
        </button>
        <button onClick={() => { setAba('assistente'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'assistente' ? 'active' : ''}`}>
          <span className="sidebar-icon">✨</span><span className="sidebar-label">Assistente IA</span>
        </button>

        <div className="sidebar-divider" />

        {ITENS_SECAO.filter((item) => !secoesOcultas.includes(item.chave)).map((item) => (
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
