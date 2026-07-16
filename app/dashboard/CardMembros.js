'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { linkDeConvite } from '../../lib/urls';

export default function CardMembros({ entidadeAtual, usuarioId, aberto, onAlternarAberto }) {
  const [membros, setMembros] = useState([]);
  const [convites, setConvites] = useState([]);
  const [emailConvite, setEmailConvite] = useState('');
  const [mostrarConvidar, setMostrarConvidar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [linkGerado, setLinkGerado] = useState(null);
  const [ultimoEmail, setUltimoEmail] = useState(null);
  const [mostrarLink, setMostrarLink] = useState(false);
  const [avisoDominio, setAvisoDominio] = useState(false);

  useEffect(() => {
    // Sem NEXT_PUBLIC_APP_URL configurada, o link herda o endereço atual —
    // que pode ser uma URL de preview da Vercel, protegida por login de equipe.
    // Previews terminam com "-<usuario>-<time>-projects.vercel.app".
    if (!process.env.NEXT_PUBLIC_APP_URL && typeof window !== 'undefined') {
      setAvisoDominio(/-projects\.vercel\.app$/.test(window.location.hostname));
    }
  }, []);

  const carregarMembros = useCallback(async (entidadeId) => {
    if (!entidadeId) return;

    const { data } = await supabase
      .from('entidade_membros')
      .select('id, papel, usuario_id, usuarios(nome, nome_exibicao)')
      .eq('entidade_id', entidadeId)
      .order('papel', { ascending: true });

    setMembros(data || []);
  }, []);

  const carregarConvites = useCallback(async (entidadeId) => {
    if (!entidadeId) return;

    const { data } = await supabase
      .from('convites')
      .select('*')
      .eq('entidade_id', entidadeId)
      .is('aceito_em', null)
      .order('created_at', { ascending: false });

    setConvites(data || []);
  }, []);

  useEffect(() => {
    if (entidadeAtual) {
      carregarMembros(entidadeAtual);
      carregarConvites(entidadeAtual);
    }
  }, [entidadeAtual, carregarMembros, carregarConvites]);

  const souDono = membros.some((m) => m.usuario_id === usuarioId && m.papel === 'dono');

  async function convidar(e) {
    e.preventDefault();
    const email = emailConvite.trim().toLowerCase();
    if (!email) return;

    setEnviando(true);
    setAviso(null);
    setLinkGerado(null);
    setUltimoEmail(null);

    const { data, error } = await supabase
      .from('convites')
      .insert({ entidade_id: entidadeAtual, email, criado_por: usuarioId })
      .select()
      .single();

    if (error) {
      setEnviando(false);
      setAviso({ tipo: 'erro', texto: 'Não foi possível cadastrar. Verifique se você é dono desta entidade.' });
      return;
    }

    // Descobre se a pessoa já tem conta, para explicar o que acontece agora.
    const { data: temConta } = await supabase.rpc('email_ja_tem_conta', { email_alvo: email });

    setEnviando(false);
    setLinkGerado(linkDeConvite(data.token));
    setUltimoEmail({ email, temConta: temConta === true });
    setEmailConvite('');
    carregarConvites(entidadeAtual);
  }

  async function copiarLink(link) {
    try {
      await navigator.clipboard.writeText(link);
      setAviso({ tipo: 'ok', texto: 'Link copiado!' });
      setTimeout(() => setAviso(null), 2500);
    } catch {
      setAviso({ tipo: 'erro', texto: 'Não foi possível copiar. Selecione e copie manualmente.' });
    }
  }

  async function cancelarConvite(id) {
    if (!window.confirm('Cancelar este convite? O link deixará de funcionar.')) return;
    const { error } = await supabase.from('convites').delete().eq('id', id);
    if (!error) carregarConvites(entidadeAtual);
  }

  async function removerMembro(m) {
    const ehEuMesmo = m.usuario_id === usuarioId;
    const mensagem = ehEuMesmo
      ? 'Sair desta entidade? Você perderá o acesso aos dados dela.'
      : 'Remover esta pessoa? Ela perderá o acesso aos dados desta entidade.';

    if (!window.confirm(mensagem)) return;

    const { error } = await supabase.from('entidade_membros').delete().eq('id', m.id);
    if (!error) {
      if (ehEuMesmo) {
        window.location.reload();
      } else {
        carregarMembros(entidadeAtual);
      }
    }
  }

  function nomeDoMembro(m) {
    const u = m.usuarios;
    if (!u) return 'Usuário';
    return u.nome_exibicao || u.nome || 'Usuário';
  }

  return (
    <div className="card" id="secao-membros">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon">👥</span><p className="card-title">Quem tem acesso</p></span>
        <div className="card-header-actions">
          {souDono && <button onClick={() => setMostrarConvidar((v) => !v)} className="btn btn-ghost">+ Convidar</button>}
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? '▾' : '▸'}</button>
        </div>
      </div>

      {aberto && (
        <>
          {aviso && (
            <p style={{ fontSize: 13, margin: '0 0 10px', color: aviso.tipo === 'erro' ? 'var(--negative)' : 'var(--primary)' }}>
              {aviso.texto}
            </p>
          )}

          {mostrarConvidar && souDono && (
            <div style={{ marginBottom: 12, padding: 12, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
              <p className="empty-hint" style={{ margin: '0 0 8px' }}>
                Informe o email da pessoa. Ela terá acesso assim que entrar no app com esse email.
              </p>
              <form onSubmit={convidar} className="form-row" style={{ marginBottom: ultimoEmail ? 10 : 0 }}>
                <input
                  className="input"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={emailConvite}
                  onChange={(e) => setEmailConvite(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={enviando}>
                  {enviando ? 'Cadastrando...' : 'Dar acesso'}
                </button>
              </form>

              {ultimoEmail && (
                <div>
                  <p style={{ fontSize: 13, margin: '0 0 8px', color: 'var(--primary)' }}>
                    ✓ <strong>{ultimoEmail.email}</strong> cadastrado.{' '}
                    {ultimoEmail.temConta
                      ? 'Como já tem conta, o acesso aparece no próximo login.'
                      : 'Assim que criar a conta com esse email, o acesso é liberado.'}
                  </p>

                  <button onClick={() => setMostrarLink((v) => !v)} className="btn-link">
                    {mostrarLink ? 'ocultar link' : 'ou envie um link de convite'}
                  </button>

                  {mostrarLink && (
                    <div style={{ marginTop: 8 }}>
                      {avisoDominio && (
                        <p style={{ fontSize: 12, margin: '0 0 6px', color: 'var(--negative)' }}>
                          ⚠ Você está acessando o app por um endereço de teste. Confira se este link abre normalmente antes de enviar.
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input className="input" readOnly value={linkGerado} style={{ flex: 1, minWidth: 180, fontSize: 12 }} onFocus={(e) => e.target.select()} />
                        <button onClick={() => copiarLink(linkGerado)} className="btn btn-ghost">Copiar</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {membros.map((m) => (
            <div key={m.id} className="row row-main">
              <div>
                <p className="row-title">
                  {nomeDoMembro(m)}
                  {m.usuario_id === usuarioId && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> (você)</span>}
                </p>
                <p className="row-subtitle">{m.papel === 'dono' ? 'Dono — acesso total' : 'Membro — pode lançar e editar'}</p>
              </div>
              <div className="row-actions">
                {m.papel === 'dono' && <span className="badge badge-confirmed">Dono</span>}
                {((souDono && m.usuario_id !== usuarioId) || (m.usuario_id === usuarioId && m.papel !== 'dono')) && (
                  <button onClick={() => removerMembro(m)} className="btn-link">
                    {m.usuario_id === usuarioId ? 'sair' : 'remover'}
                  </button>
                )}
              </div>
            </div>
          ))}

          {convites.length > 0 && (
            <>
              <p className="row-subtitle" style={{ marginTop: 14, marginBottom: 4, fontWeight: 600 }}>Aguardando entrar</p>
              {convites.map((c) => {
                const expirado = new Date(c.expira_em) < new Date();
                const link = linkDeConvite(c.token);
                return (
                  <div key={c.id} className="row row-main">
                    <div>
                      <p className="row-title">{c.email}</p>
                      <p className="row-subtitle" style={{ color: expirado ? 'var(--negative)' : 'var(--text-muted)' }}>
                        {expirado ? 'expirou — cadastre de novo' : 'terá acesso ao entrar no app'}
                      </p>
                    </div>
                    <div className="row-actions">
                      {!expirado && <button onClick={() => copiarLink(link)} className="btn-link">copiar link</button>}
                      {souDono && <button onClick={() => cancelarConvite(c.id)} className="btn-link">cancelar</button>}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {!souDono && (
            <p className="empty-hint" style={{ marginTop: 10 }}>
              Apenas o dono pode convidar ou remover pessoas.
            </p>
          )}
        </>
      )}
    </div>
  );
}
