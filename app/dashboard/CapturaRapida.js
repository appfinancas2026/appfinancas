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

  // Renderiza a 1.ª página do PDF em canvas e retorna JPEG base64.
  // Reusa o mesmo padrão CDN de ImportadorExtrato.js — sem npm, sem next.config.
  // JPEG 0.85 é escolhido no lugar de PNG porque comprimi muito melhor para
  // fotos/scans, gerando arquivos tipicamente < 500 KB para comprovantes.
  // Se mesmo assim o resultado passar de 4 MB de base64 (raro, mas possível em
  // PDFs de altíssima resolução), re-renderiza em scale 1.5 com qualidade 0.80.
  async function pdfParaImagem(arquivo) {
    const arrayBuffer = await arquivo.arrayBuffer();
    const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pagina = await pdf.getPage(1);

    let scale = 2;
    let viewport = pagina.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await pagina.render({ canvasContext: ctx, viewport }).promise;

    let dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Re-renderiza em scale menor se o resultado ultrapassar 4 MB de chars base64
    if (dataUrl.length > 4 * 1024 * 1024) {
      scale = 1.5;
      viewport = pagina.getViewport({ scale });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: ctx, viewport }).promise;
      dataUrl = canvas.toDataURL('image/jpeg', 0.80);
    }

    return { base64: dataUrl.split(',')[1], tipoMime: 'image/jpeg', dataUrl };
  }

  async function handleArquivoImagem(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    const ehPdf = arquivo.type === 'application/pdf' || arquivo.name.toLowerCase().endsWith('.pdf');

    if (ehPdf) {
      setProcessando(true);
      setErro('');
      try {
        const { base64, tipoMime, dataUrl } = await pdfParaImagem(arquivo);
        // Preview usa a imagem já convertida — URL.createObjectURL de PDF não
        // renderiza como <img> na maioria dos browsers.
        setImagemPreview(dataUrl);
        enviarParaIA({ imagemBase64: base64, tipoMime });
      } catch {
        setErro('Não foi possível ler o PDF — tente uma imagem.');
        setProcessando(false);
      }
      return;
    }

    // Imagem normal: fluxo inalterado
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
            <input type="file" accept="image/*,application/pdf" onChange={handleArquivoImagem} style={{ display: 'none' }} />
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
