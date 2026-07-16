'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

const MENSAGENS_ERRO = {
  'Invalid login credentials': 'Email ou senha incorretos.',
  'User already registered': 'Já existe uma conta com esse email. Tente entrar.',
  'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'Esse email não parece válido.',
  'Email not confirmed': 'Confirme seu email antes de entrar (verifique sua caixa de entrada).',
  'For security purposes, you can only request this after 60 seconds': 'Aguarde um minuto antes de tentar de novo.',
};

function traduzirErro(mensagem) {
  return MENSAGENS_ERRO[mensagem] || 'Algo deu errado. Tente novamente em instantes.';
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [carregandoGoogle, setCarregandoGoogle] = useState(false);
  const [mensagem, setMensagem] = useState(null);

  // Quem chega por um link de convite vê o contexto e já cai no cadastro.
  const [temConvitePendente, setTemConvitePendente] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem('convite_pendente')) {
      setTemConvitePendente(true);
      setModo('cadastro');
    }
  }, []);

  function trocarModo(novoModo) {
    setModo(novoModo);
    setMensagem(null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setCarregando(true);
    setMensagem(null);

    if (modo === 'cadastro') {
      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome } },
      });

      setCarregando(false);

      if (error) {
        setMensagem({ tipo: 'erro', texto: traduzirErro(error.message) });
        return;
      }

      // Com "Confirm email" desativado no Supabase, o cadastro já cria sessão.
      const { data: sessao } = await supabase.auth.getSession();
      if (sessao.session) {
        router.push('/dashboard');
      } else {
        setMensagem({ tipo: 'ok', texto: 'Conta criada! Verifique seu email para confirmar e depois entre.' });
        setModo('login');
      }
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);

    if (error) {
      setMensagem({ tipo: 'erro', texto: traduzirErro(error.message) });
      return;
    }

    router.push('/dashboard');
  }

  async function entrarComGoogle() {
    setCarregandoGoogle(true);
    setMensagem(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    });

    if (error) {
      setCarregandoGoogle(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível conectar com o Google. Tente novamente.' });
    }
    // Em caso de sucesso o navegador é redirecionado — nada mais a fazer aqui.
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 380, width: '100%', padding: 28 }}>
        <span className="brand" style={{ marginBottom: 4 }}>
          <span className="brand-mark">R$</span>
          <span>Controle Financeiro</span>
        </span>

        {temConvitePendente && (
          <p style={{ fontSize: 13, margin: '10px 0 0', padding: 10, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', color: 'var(--text)' }}>
            🎉 Você foi convidado! Crie sua conta com o <strong>mesmo email</strong> que recebeu o convite.
          </p>
        )}

        <div className="auth-tabs">
          <button
            type="button"
            onClick={() => trocarModo('login')}
            className={`auth-tab ${modo === 'login' ? 'auth-tab-active' : ''}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => trocarModo('cadastro')}
            className={`auth-tab ${modo === 'cadastro' ? 'auth-tab-active' : ''}`}
          >
            Criar conta
          </button>
        </div>

        <button
          type="button"
          onClick={entrarComGoogle}
          className="btn-google"
          disabled={carregandoGoogle}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {carregandoGoogle ? 'Conectando...' : 'Continuar com Google'}
        </button>

        <div className="auth-divisor"><span>ou</span></div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modo === 'cadastro' && (
            <input
              className="input"
              placeholder="Seu nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          )}
          <input
            className="input"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            type="password"
            placeholder={modo === 'cadastro' ? 'Senha (mínimo 6 caracteres)' : 'Senha'}
            autoComplete={modo === 'cadastro' ? 'new-password' : 'current-password'}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            minLength={6}
            required
          />

          <button type="submit" className="btn btn-primary" style={{ padding: '11px 16px', marginTop: 4 }} disabled={carregando}>
            {carregando ? 'Aguarde...' : modo === 'cadastro' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        {mensagem && (
          <p style={{ marginTop: 12, fontSize: 13, color: mensagem.tipo === 'erro' ? 'var(--negative)' : 'var(--primary)' }}>
            {mensagem.texto}
          </p>
        )}
      </div>
    </div>
  );
}
