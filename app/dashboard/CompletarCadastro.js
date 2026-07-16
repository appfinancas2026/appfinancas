'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatarCPF, cpfValido } from '../../lib/cpf';

export default function CompletarCadastro({ usuarioId, nomeAtual, onConcluido }) {
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState(nomeAtual || '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  async function salvar(e) {
    e.preventDefault();
    setErro('');

    if (!cpfValido(cpf)) {
      setErro('Esse CPF não é válido. Confira os números.');
      return;
    }

    setSalvando(true);

    const { error } = await supabase
      .from('usuarios')
      .update({ cpf: cpf.replace(/\D/g, ''), nome: nome.trim() })
      .eq('id', usuarioId);

    setSalvando(false);

    if (error) {
      if (error.code === '23505') {
        setErro('Esse CPF já está cadastrado em outra conta.');
      } else if (error.code === '23514') {
        setErro('Esse CPF não é válido. Confira os números.');
      } else {
        setErro('Não foi possível salvar. Tente novamente.');
      }
      return;
    }

    onConcluido();
  }

  async function sair() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 380, width: '100%', padding: 28 }}>
        <span className="brand" style={{ marginBottom: 4 }}>
          <span className="brand-mark">R$</span>
          <span>Quase lá!</span>
        </span>

        <p className="empty-hint" style={{ marginTop: 6, marginBottom: 18 }}>
          Falta só o seu CPF para concluir o cadastro.
        </p>

        <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            className="input"
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
          />
          <input
            className="input"
            inputMode="numeric"
            placeholder="CPF"
            value={cpf}
            onChange={(e) => setCpf(formatarCPF(e.target.value))}
            required
          />

          <button type="submit" className="btn btn-primary" style={{ padding: '11px 16px', marginTop: 4 }} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Concluir cadastro'}
          </button>
        </form>

        {erro && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--negative)' }}>{erro}</p>}

        <p style={{ fontSize: 12, marginTop: 16, textAlign: 'center' }}>
          <button onClick={sair} className="btn-link">Sair e entrar com outra conta</button>
        </p>
      </div>
    </div>
  );
}
