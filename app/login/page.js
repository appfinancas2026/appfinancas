'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

const MENSAGENS_ERRO = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'User already registered': 'Já existe uma conta com esse e-mail.',
  'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'Esse e-mail não parece válido.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).',
};

function traduzirErro(mensagem) {
  return MENSAGENS_ERRO[mensagem] || 'Algo deu errado. Tente novamente em instantes.';
}

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState('cadastro');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  async function handleCadastro(e) {
    e.preventDefault();
    setCarregando(true);
    setMensagem('');

    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { cpf, nome } },
    });

    setCarregando(false);

    if (error) {
      setMensagem(traduzirErro(error.message));
      return;
    }

    setMensagem('Cadastro feito. Verifique seu email para confirmar a conta e depois faça login.');
    setModo('login');
  }

  async function handleLogin(e) {
    e.preventDefault();
    setCarregando(true);
    setMensagem('');

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    setCarregando(false);

    if (error) {
      setMensagem(traduzirErro(error.message));
      return;
    }

    router.push('/dashboard');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 360, width: '100%', padding: 28 }}>
        <span className="brand" style={{ marginBottom: 4 }}>
          <span className="brand-mark">R$</span>
          <span>Controle Financeiro</span>
        </span>
        <p className="empty-hint" style={{ marginTop: 6, marginBottom: 20 }}>
          {modo === 'cadastro' ? 'Cadastro rápido, 15 segundos.' : 'Bem-vindo de volta.'}
        </p>

        <form onSubmit={modo === 'cadastro' ? handleCadastro : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modo === 'cadastro' && (
            <>
              <input className="input" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
              <input className="input" placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} required />
            </>
          )}
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} required />

          <button type="submit" className="btn btn-primary" style={{ padding: '11px 16px', marginTop: 4 }} disabled={carregando}>
            {carregando ? 'Aguarde...' : modo === 'cadastro' ? 'Criar conta' : 'Entrar'}
          </button>
        </form>

        {mensagem && <p className="error-hint" style={{ marginTop: 12 }}>{mensagem}</p>}

        <p style={{ fontSize: 13, marginTop: 16, textAlign: 'center', color: 'var(--text-muted)' }}>
          {modo === 'cadastro' ? (
            <>Já tem conta?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setModo('login'); setMensagem(''); }} style={{ color: 'var(--primary-dark)' }}>Entrar</a>
            </>
          ) : (
            <>Ainda não tem conta?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setModo('cadastro'); setMensagem(''); }} style={{ color: 'var(--primary-dark)' }}>Cadastrar</a>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
