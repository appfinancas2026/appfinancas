'use client';

import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function FeedbackModal({ entidadeAtualObj, perfil }) {
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (!mensagem.trim() || enviando) return;
    setEnviando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          mensagem: mensagem.trim(),
          view: searchParams.get('view') || 'home',
          entidade: entidadeAtualObj?.nome_entidade || null,
          usuario_email: session?.user?.email || null,
          usuario_nome: perfil?.nome_exibicao || session?.user?.email || null,
        }),
      });
      setAberto(false);
      setMensagem('');
      setSucesso(true);
      setTimeout(() => setSucesso(false), 3000);
    } finally {
      setEnviando(false);
    }
  }

  function fechar() {
    if (enviando) return;
    setAberto(false);
    setMensagem('');
  }

  return (
    <>
      {/* Botão trigger fixo — canto inferior esquerdo */}
      <button
        onClick={() => setAberto(true)}
        className="feedback-fab"
        title="Enviar feedback"
        aria-label="Enviar feedback"
      >
        <MessageSquare size={18} />
      </button>

      {/* Toast de sucesso */}
      {sucesso && (
        <div className="feedback-toast">
          Feedback enviado, obrigado!
        </div>
      )}

      {/* Overlay + modal */}
      {aberto && (
        <div className="feedback-overlay" onClick={fechar}>
          <div
            className="feedback-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-titulo"
          >
            <div className="feedback-modal-header">
              <span id="feedback-titulo" className="feedback-modal-titulo">Enviar feedback</span>
              <button onClick={fechar} className="feedback-fechar" aria-label="Fechar">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={enviar}>
              <textarea
                className="feedback-textarea"
                placeholder="Descreva o problema ou sugestão..."
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={5}
                autoFocus
                disabled={enviando}
              />
              <div className="feedback-acoes">
                <button type="button" onClick={fechar} className="btn" disabled={enviando}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={!mensagem.trim() || enviando}>
                  {enviando ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
