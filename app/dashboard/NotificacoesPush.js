'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

export default function NotificacoesPush({ entidadeAtual }) {
  const [suporte, setSuporte]         = useState(false);
  const [permissao, setPermissao]     = useState('default');
  const [ativa, setAtiva]             = useState(false);
  const [carregando, setCarregando]   = useState(false);
  const [mensagem, setMensagem]       = useState('');

  useEffect(() => {
    const tem = 'serviceWorker' in navigator && 'PushManager' in window;
    setSuporte(tem);
    if (!tem) return;

    setPermissao(Notification.permission);

    // Verifica se já tem subscription ativa
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setAtiva(!!sub);
      });
    });
  }, []);

  async function ativar() {
    setCarregando(true);
    setMensagem('');

    try {
      // Pede permissão ao usuário
      const perm = await Notification.requestPermission();
      setPermissao(perm);

      if (perm !== 'granted') {
        setMensagem('Permissão negada. Ative nas configurações do navegador.');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMensagem('Erro ao identificar usuário.'); return; }

      const resp = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub, usuarioId: user.id, entidadeId: entidadeAtual }),
      });

      if (resp.ok) {
        setAtiva(true);
        setMensagem('✅ Notificações ativadas! Você receberá lembretes de vencimentos.');
      } else {
        setMensagem('Erro ao salvar. Tente novamente.');
      }
    } catch (e) {
      setMensagem('Erro ao ativar. Verifique se o app está instalado ou tente no Chrome.');
    } finally {
      setCarregando(false);
    }
  }

  async function desativar() {
    setCarregando(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: sub.endpoint, usuarioId: user.id }),
          });
        }
      }
      setAtiva(false);
      setMensagem('Notificações desativadas.');
    } catch {
      setMensagem('Erro ao desativar.');
    } finally {
      setCarregando(false);
    }
  }

  if (!suporte) return (
    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
      Notificações push não são suportadas neste navegador. Use Chrome ou instale o app.
    </p>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-medium)', margin: '0 0 2px' }}>
            Lembretes de vencimento
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
            {ativa
              ? 'Você receberá notificações quando uma conta vencer hoje ou amanhã.'
              : 'Receba uma notificação quando uma conta estiver para vencer.'}
          </p>
        </div>
        <button
          onClick={ativa ? desativar : ativar}
          disabled={carregando || permissao === 'denied'}
          className={`btn ${ativa ? 'btn-ghost' : 'btn-primary'}`}
          style={{ flexShrink: 0, fontSize: 'var(--text-sm)', padding: '8px 14px' }}
        >
          {carregando ? '...' : ativa ? 'Desativar' : 'Ativar'}
        </button>
      </div>

      {permissao === 'denied' && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--negative)', margin: '8px 0 0' }}>
          Permissão bloqueada. Vá em Configurações do navegador → Notificações → Permitir para este site.
        </p>
      )}

      {mensagem && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: '8px 0 0' }}>{mensagem}</p>
      )}
    </div>
  );
}
