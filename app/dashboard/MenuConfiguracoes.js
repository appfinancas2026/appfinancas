'use client';

import { TEMAS_CORES } from '../../lib/temas';

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
}) {
  return (
    <div className="settings-menu">
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
        <span>Logo</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {perfil.logo_url ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}
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
              style={{ background: t.primary }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
