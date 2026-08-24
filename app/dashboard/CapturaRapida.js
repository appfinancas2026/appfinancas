'use client';

import { useState, useRef } from 'react';
import { Camera, Keyboard, Mic, Square } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function CapturaRapida({ onExtraido, onFechar }) {
  const [modo, setModo] = useState('foto');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const [textoLivre, setTextoLivre] = useState('');
  const [imagemPreview, setImagemPreview] = useState(null);
  const [gravando, setGravando] = useState(false);
  const reconhecimentoRef = useRef(null);

  async function enviarParaIA(payload) {
    setProcessando(true);
    setErro('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resposta = await fetch('/api/extrair-gasto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify(payload),
      });
      const dados = await resposta.json();

      if (!resposta.ok || dados.error) {
        setErro(dados.error || 'Não foi possível processar. Tente novamente.');
        setProcessando(false);
        return;
      }

      if (dados.valor === null || dados.valor === undefined) {
        setErro('Não consegui identificar um valor. Você pode preencher manualmente no formulário.');
      }

      onExtraido(dados);
    } catch (e) {
      setErro('Falha de conexão. Tente novamente.');
    }
    setProcessando(false);
  }

  function handleArquivoImagem(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    setImagemPreview(URL.createObjectURL(arquivo));

    const leitor = new FileReader();
    leitor.onload = (evento) => {
      const base64 = evento.target.result.split(',')[1];
      enviarParaIA({ imagemBase64: base64, tipoMime: arquivo.type });
    };
    leitor.readAsDataURL(arquivo);
  }

  function enviarTexto(e) {
    e.preventDefault();
    if (!textoLivre.trim()) return;
    enviarParaIA({ texto: textoLivre.trim() });
  }

  function iniciarGravacao() {
    const Reconhecimento = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Reconhecimento) {
      setErro('Reconhecimento de voz não é suportado neste navegador. Tente no Chrome, ou use texto.');
      return;
    }

    const reconhecimento = new Reconhecimento();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.interimResults = false;
    reconhecimento.maxAlternatives = 1;

    reconhecimento.onstart = () => setGravando(true);
    reconhecimento.onerror = () => { setGravando(false); setErro('Não consegui captar o áudio. Tente de novo.'); };
    reconhecimento.onend = () => setGravando(false);
    reconhecimento.onresult = (evento) => {
      const texto = evento.results[0][0].transcript;
      setTextoLivre(texto);
      enviarParaIA({ texto });
    };

    reconhecimentoRef.current = reconhecimento;
    reconhecimento.start();
  }

  function pararGravacao() {
    reconhecimentoRef.current?.stop();
    setGravando(false);
  }

  return (
    <div style={{ background: 'var(--surface-alt)', borderRadius: 'var(--radius-md)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div className="tabs">
          <button onClick={() => { setModo('foto'); setErro(''); }} className={`tab ${modo === 'foto' ? 'tab-active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Camera size={14} /> Foto</button>
          <button onClick={() => { setModo('texto'); setErro(''); }} className={`tab ${modo === 'texto' ? 'tab-active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Keyboard size={14} /> Texto</button>
          <button onClick={() => { setModo('audio'); setErro(''); }} className={`tab ${modo === 'audio' ? 'tab-active' : ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mic size={14} /> Áudio</button>
        </div>
        <button onClick={onFechar} className="btn-link">fechar</button>
      </div>

      {processando && <p className="empty-hint">Analisando com IA...</p>}

      {!processando && modo === 'foto' && (
        <div>
          <label className="btn btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
            Tirar foto ou escolher da galeria
            <input type="file" accept="image/*" capture="environment" onChange={handleArquivoImagem} style={{ display: 'none' }} />
          </label>
          {imagemPreview && (
            <img src={imagemPreview} alt="Comprovante" style={{ display: 'block', marginTop: 10, maxWidth: 160, borderRadius: 'var(--radius-sm)' }} />
          )}
        </div>
      )}

      {!processando && modo === 'texto' && (
        <form onSubmit={enviarTexto} className="form-row">
          <input
            className="input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Ex: gastei 45 reais no mercado hoje"
            value={textoLivre}
            onChange={(e) => setTextoLivre(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">Extrair</button>
        </form>
      )}

      {!processando && modo === 'audio' && (
        <div>
          {!gravando ? (
            <button onClick={iniciarGravacao} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mic size={14} /> Começar a falar</button>
          ) : (
            <button onClick={pararGravacao} className="btn btn-primary" style={{ background: 'var(--negative)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Square size={14} /> Parar</button>
          )}
          {textoLivre && <p className="empty-hint" style={{ marginTop: 8 }}>Ouvi: &ldquo;{textoLivre}&rdquo;</p>}
        </div>
      )}

      {erro && <p className="error-hint" style={{ marginTop: 10 }}>{erro}</p>}
    </div>
  );
}
