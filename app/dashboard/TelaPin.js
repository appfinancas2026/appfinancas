'use client';

import { Delete } from 'lucide-react';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

export default function TelaPin({ titulo, subtitulo, logoUrl, pinDigitado, onTecla, onCancelar }) {
  return (
    <div className="lock-screen">
      <div className="lock-card">
        <span className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>
          {logoUrl ? <img src={logoUrl} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}
        </span>
        <p className="card-title" style={{ marginTop: 10 }}>{titulo}</p>
        <p className="empty-hint">{subtitulo}</p>

        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`pin-dot ${i < pinDigitado.length ? 'pin-dot-filled' : ''}`} />
          ))}
        </div>

        <div className="pin-keypad">
          {TECLAS.map((t, i) => (t === '' ? <span key={i} /> : (
            <button key={i} type="button" className="pin-key" onClick={() => onTecla(t)}>
              {t === '⌫' ? <Delete size={18} style={{ display: 'inline-flex' }} /> : t}
            </button>
          )))}
        </div>

        {onCancelar && (
          <button onClick={onCancelar} className="btn-link" style={{ marginTop: 14 }}>Cancelar</button>
        )}
      </div>
    </div>
  );
}
