'use client';

import { Settings, Bell } from 'lucide-react';
import { TEMAS_CORES } from '../../lib/temas';
import NotificacoesPush from './NotificacoesPush';

export default function MenuConfiguracoes({
  tema,
  alternarTema,
  valoresOcultos,
  alternarOcultarValores,
  pinConfigurado,
  alternarBloqueioPin,
  perfil,
  handleUploadLogo,
  nomeExibicaoInput,
  setNomeExibicaoInput,
  salvarNomeExibicao,
  selecionarTema,
  entidadeAtual,
  entidades,
  adicionarEntidadePJ,
  excluirEntidade,
  cnpj,
  setCnpj,
  nomeEmpresa,
  setNomeEmpresa,
  mostrarNovaEntidade,
  setMostrarNovaEntidade,
}) {
  const entidadesPJ = (entidades || []).filter((e) => e.tipo === 'PJ');

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon"><Settings size={16} /></span><p className="card-title">Preferências</p></span>
      </div>
      <div className="settings-item">
        <span>Modo escuro</span>
        <button onClick={alternarTema} className={`toggle-switch ${tema === 'dark' ? 'on' : ''}`} />
      </div>
      <div className="settings-item">
        <span>Ocultar valores</span>
        <button onClick={alternarOcultarValores} className={`toggle-switch ${valoresOcultos ? 'on' : ''}`} />
      </div>
      <div className="settings-item">
        <span>Bloqueio por PIN</span>
        <button onClick={alternarBloqueioPin} className={`toggle-switch ${pinConfigurado ? 'on' : ''}`} />
      </div>

      <div className="settings-divider" />

      <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <span style={{ fontWeight: 'var(--weight-medium)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Bell size={15} /> Notificações</span>
        <NotificacoesPush entidadeAtual={entidadeAtual} />
      </div>

      <div className="settings-divider" />

      <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <span>Logo</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {perfil.logo_url
            ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" />
            : <img src="/logo.png" alt="AppFinançasBr" className="brand-logo" />
          }
          <label className="btn-link" style={{ cursor: 'pointer' }}>
            alterar
            <input type="file" accept="image/*" onChange={handleUploadLogo} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <span>Nome de exibição</span>
        <input
          className="input"
          style={{ fontSize: 12, padding: '6px 8px', width: '100%' }}
          placeholder="Controle Financeiro"
          value={nomeExibicaoInput}
          onChange={(e) => setNomeExibicaoInput(e.target.value)}
          onBlur={() => salvarNomeExibicao(nomeExibicaoInput)}
        />
      </div>

      <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <span>Cor do tema</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.entries(TEMAS_CORES).map(([chave, t]) => (
            <button
              key={chave}
              onClick={() => selecionarTema(chave)}
              title={chave}
              className={`color-swatch ${(perfil.cor_destaque || 'teal') === chave ? 'selected' : ''}`}
              style={{ background: tema === 'dark' ? t.escuro.primary : t.primary }}
            />
          ))}
        </div>
      </div>

      <div className="settings-divider" />

      <div style={{ paddingBottom: 4 }}>
        <p style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Empresas (CNPJ)</p>
        {entidadesPJ.length === 0 && (
          <p className="empty-hint" style={{ marginBottom: 10 }}>Nenhuma empresa cadastrada.</p>
        )}
        {entidadesPJ.map((ent) => (
          <div key={ent.id} className="settings-item" style={{ padding: '6px 0' }}>
            <span style={{ fontSize: 'var(--text-md)' }}>{ent.nome_entidade}</span>
            <button onClick={() => excluirEntidade(ent)} className="btn-link" style={{ color: 'var(--negative)', fontSize: 'var(--text-sm)' }}>Remover</button>
          </div>
        ))}
        {mostrarNovaEntidade ? (
          <form onSubmit={adicionarEntidadePJ} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <input className="input" placeholder="Nome da empresa" value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} required autoFocus />
            <input className="input" placeholder="CNPJ" value={cnpj} onChange={(e) => setCnpj(e.target.value)} required />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar</button>
              <button type="button" onClick={() => setMostrarNovaEntidade(false)} className="btn btn-ghost">Cancelar</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setMostrarNovaEntidade(true)} className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }}>+ Adicionar empresa</button>
        )}
      </div>
    </div>
  );
}
