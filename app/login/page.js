'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { formatarCPF, cpfValido } from '../../lib/cpf';
import { urlDoApp } from '../../lib/urls';

const MENSAGENS_ERRO = {
  'Invalid login credentials': 'Email ou senha incorretos.',
  'User already registered': 'Já existe uma conta com esse email. Tente entrar.',
  'Password should be at least 6 characters': 'A senha precisa ter pelo menos 6 caracteres.',
  'Unable to validate email address: invalid format': 'Esse email não parece válido.',
  'Email not confirmed': 'Confirme seu email antes de entrar (verifique sua caixa de entrada).',
  'For security purposes, you can only request this after 60 seconds': 'Aguarde um minuto antes de tentar de novo.',
  'Database error saving new user': 'Não foi possível criar a conta. Esse CPF pode já estar cadastrado.',
};

function traduzirErro(m) {
  return MENSAGENS_ERRO[m] || 'Algo deu errado. Tente novamente em instantes.';
}

const DIFERENCIAIS = [
  { icone: '✦', texto: 'Controle PF e PJ no mesmo lugar' },
  { icone: '✦', texto: 'Orçamento inteligente com IA' },
  { icone: '✦', texto: 'Compartilhe com família ou sócios' },
  { icone: '✦', texto: 'Importe extratos PDF de qualquer banco' },
];

export default function LoginPage() {
  const router = useRouter();
  const [modo, setModo] = useState('login');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [carregandoGoogle, setCarregandoGoogle] = useState(false);
  const [mensagem, setMensagem] = useState(null);
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
      if (!cpfValido(cpf)) {
        setCarregando(false);
        setMensagem({ tipo: 'erro', texto: 'Esse CPF não é válido. Confira os números.' });
        return;
      }

      const { error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: { data: { nome, cpf: cpf.replace(/\D/g, '') } },
      });

      setCarregando(false);

      if (error) {
        setMensagem({ tipo: 'erro', texto: traduzirErro(error.message) });
        return;
      }

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
      options: { redirectTo: `${urlDoApp()}/dashboard` },
    });

    if (error) {
      setCarregandoGoogle(false);
      setMensagem({ tipo: 'erro', texto: 'Não foi possível conectar com o Google. Tente novamente.' });
    }
  }

  return (
    <div className="login-root">
      {/* Painel esquerdo — identidade e diferenciais */}
      <div className="login-hero">
        <div className="login-hero-conteudo">
          <img src="/logo.png" alt="AppFinançasBr" className="login-logo" />

          <p className="login-tagline">
            Controle financeiro completo para você e sua empresa, em um só lugar.
          </p>

          <ul className="login-diferenciais">
            {DIFERENCIAIS.map((d) => (
              <li key={d.texto}>
                <span className="login-dif-icone">{d.icone}</span>
                {d.texto}
              </li>
            ))}
          </ul>
        </div>

        {/* Detalhe decorativo — linha de gradiente */}
        <div className="login-hero-linha" aria-hidden="true" />
      </div>

      {/* Painel direito — formulário */}
      <div className="login-form-panel">
        <div className="login-form-wrap">

          {temConvitePendente && (
            <div className="login-convite-aviso">
              🎉 Você foi convidado! Crie sua conta com o <strong>mesmo email</strong> que recebeu o convite.
            </div>
          )}

          <h1 className="login-titulo">
            {modo === 'login' ? 'Bem-vindo de volta' : 'Criar sua conta'}
          </h1>
          <p className="login-subtitulo">
            {modo === 'login'
              ? 'Entre para acessar seu painel financeiro.'
              : 'Grátis, sem cartão de crédito.'}
          </p>

          {/* Google */}
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

          <div className="auth-divisor"><span>ou entre com email</span></div>

          {/* Abas */}
          <div className="auth-tabs">
            <button type="button" onClick={() => trocarModo('login')} className={`auth-tab ${modo === 'login' ? 'auth-tab-active' : ''}`}>
              Entrar
            </button>
            <button type="button" onClick={() => trocarModo('cadastro')} className={`auth-tab ${modo === 'cadastro' ? 'auth-tab-active' : ''}`}>
              Criar conta
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modo === 'cadastro' && (
              <>
                <input className="input" placeholder="Seu nome completo" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus />
                <input className="input" inputMode="numeric" placeholder="CPF" value={cpf} onChange={(e) => setCpf(formatarCPF(e.target.value))} required />
              </>
            )}
            <input className="input" type="email" placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={modo === 'login'} />
            <input className="input" type="password" placeholder={modo === 'cadastro' ? 'Senha (mínimo 6 caracteres)' : 'Senha'} autoComplete={modo === 'cadastro' ? 'new-password' : 'current-password'} value={senha} onChange={(e) => setSenha(e.target.value)} minLength={6} required />

            <button type="submit" className="btn btn-primary login-btn-submit" disabled={carregando}>
              {carregando ? 'Aguarde...' : modo === 'cadastro' ? 'Criar conta grátis' : 'Entrar'}
            </button>
          </form>

          {mensagem && (
            <p className={`login-mensagem ${mensagem.tipo}`}>{mensagem.texto}</p>
          )}

          <p className="login-rodape">
            Ao continuar, você concorda com os{' '}
            <a href="#" className="btn-link">Termos de uso</a>{' '}
            e a{' '}
            <a href="#" className="btn-link">Política de privacidade</a>.
          </p>
        </div>
      </div>
    </div>
  );
}
