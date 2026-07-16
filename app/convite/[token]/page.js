'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

export default function PaginaConvite() {
  const router = useRouter();
  const params = useParams();
  const token = params?.token;

  const [estado, setEstado] = useState('verificando');
  const [mensagem, setMensagem] = useState('');

  const processar = useCallback(async () => {
    const { data: sessao } = await supabase.auth.getSession();

    if (!sessao.session) {
      // Guarda o token para retomar depois do login/cadastro.
      window.localStorage.setItem('convite_pendente', token);
      setEstado('precisa_login');
      return;
    }

    const { data, error } = await supabase.rpc('aceitar_convite', { token_convite: token });

    if (error) {
      setEstado('erro');
      setMensagem('Não foi possível processar o convite. Tente novamente.');
      return;
    }

    if (data?.ok) {
      window.localStorage.removeItem('convite_pendente');
      setEstado('sucesso');
      setTimeout(() => router.push('/dashboard'), 1800);
    } else {
      setEstado('erro');
      setMensagem(data?.erro || 'Convite inválido.');
    }
  }, [token, router]);

  useEffect(() => {
    if (token) processar();
  }, [token, processar]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
        {estado === 'verificando' && (
          <>
            <p className="card-title" style={{ marginBottom: 8 }}>Verificando convite...</p>
            <p className="empty-hint">Só um instante.</p>
          </>
        )}

        {estado === 'precisa_login' && (
          <>
            <p className="card-title" style={{ marginBottom: 8 }}>Você foi convidado! 🎉</p>
            <p className="empty-hint" style={{ marginBottom: 16 }}>
              Entre com a sua conta — ou crie uma, usando o mesmo email que recebeu o convite — para acessar o controle compartilhado.
            </p>
            <button onClick={() => router.push('/login')} className="btn btn-primary">Entrar ou criar conta</button>
          </>
        )}

        {estado === 'sucesso' && (
          <>
            <p className="card-title" style={{ marginBottom: 8 }}>Pronto! ✅</p>
            <p className="empty-hint">Você agora tem acesso. Redirecionando...</p>
          </>
        )}

        {estado === 'erro' && (
          <>
            <p className="card-title" style={{ marginBottom: 8 }}>Não deu certo</p>
            <p className="empty-hint" style={{ marginBottom: 16 }}>{mensagem}</p>
            <button onClick={() => router.push('/dashboard')} className="btn btn-ghost">Ir para o app</button>
          </>
        )}
      </div>
    </div>
  );
}
