'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';

const SUGESTOES = [
  'Quanto gastei esse mês?',
  'Qual categoria mais pesou este mês?',
  'Quanto recebi nos últimos 3 meses?',
  'Quais despesas fixas tenho cadastradas?',
  'Estou gastando mais do que ganho?',
  'Qual meu saldo atual em todas as contas?',
];

export default function AbaAssistente({ entidadeAtual, contas, transacoesDoMes, lancamentosFixos, ano, mes }) {
  const [conversa, setConversa] = useState([]);
  const [input, setInput] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState('');
  const [gravando, setGravando] = useState(false);
  const fimRef = useRef(null);
  const inputRef = useRef(null);
  const reconhecimentoRef = useRef(null);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversa, pensando]);

  const montarContexto = useCallback(async () => {
    const NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const mesNome = `${NOMES[mes]} de ${ano}`;
    const saldoTotal = contas.reduce((s, c) => s + Number(c.saldo_atual), 0);
    const entradas = transacoesDoMes.filter((t) => t.tipo === 'entrada' && !t.transferencia_id);
    const saidas = transacoesDoMes.filter((t) => t.tipo === 'saida' && !t.transferencia_id);
    const totalEntradas = entradas.reduce((s, t) => s + Number(t.valor), 0);
    const totalSaidas = saidas.reduce((s, t) => s + Number(t.valor), 0);
    const porCategoria = {};
    saidas.forEach((t) => { const c = t.categoria || 'Sem categoria'; porCategoria[c] = (porCategoria[c] || 0) + Number(t.valor); });
    const linhasCategorias = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).map(([c, v]) => `  - ${c}: ${formatarMoeda(v)}`).join('\n');
    const fixosReceita = lancamentosFixos.filter((f) => f.tipo === 'entrada');
    const fixosDespesa = lancamentosFixos.filter((f) => f.tipo === 'saida');
    const tresMesesAtras = new Date(ano, mes - 3, 1).toISOString().slice(0, 10);
    const { data: hist } = await supabase.from('transacoes').select('tipo, valor').eq('entidade_id', entidadeAtual).is('transferencia_id', null).gte('data', tresMesesAtras);
    const totalRHist = (hist || []).filter((t) => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor), 0);
    const totalSHist = (hist || []).filter((t) => t.tipo === 'saida').reduce((s, t) => s + Number(t.valor), 0);

    return `Mês atual: ${mesNome}
CONTAS (total: ${formatarMoeda(saldoTotal)}):
${contas.map((c) => `  - ${c.nome}: ${formatarMoeda(c.saldo_atual)}`).join('\n') || '  Nenhuma'}
MÊS ATUAL: entradas ${formatarMoeda(totalEntradas)} | saídas ${formatarMoeda(totalSaidas)} | resultado ${formatarMoeda(totalEntradas - totalSaidas)}
GASTOS POR CATEGORIA:
${linhasCategorias || '  Nenhum'}
RECEITAS FIXAS: ${fixosReceita.map((f) => `${f.nome} R$${f.valor_padrao}`).join(', ') || 'Nenhuma'}
DESPESAS FIXAS: ${fixosDespesa.map((f) => `${f.nome} R$${f.valor_padrao} dia${f.dia_referencia}`).join(', ') || 'Nenhuma'}
ÚLTIMOS 3 MESES: recebido ${formatarMoeda(totalRHist)} | gasto ${formatarMoeda(totalSHist)}`;
  }, [entidadeAtual, contas, transacoesDoMes, lancamentosFixos, ano, mes]);

  async function enviar(texto) {
    const pergunta = (texto || input).trim();
    if (!pergunta || pensando) return;
    setInput(''); setErro('');
    const conversaAtualizada = [...conversa, { papel: 'user', texto: pergunta }];
    setConversa(conversaAtualizada);
    setPensando(true);
    try {
      const contexto = await montarContexto();
      const historico = conversaAtualizada.slice(-6).slice(0, -1);
      const resposta = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, contexto, historico }),
      });
      const json = await resposta.json();
      if (json.error) { setErro(json.error); setConversa((p) => p.slice(0, -1)); return; }
      setConversa((p) => [...p, { papel: 'assistant', texto: json.resposta }]);
    } catch {
      setErro('Falha de conexão. Tente novamente.');
      setConversa((p) => p.slice(0, -1));
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function iniciarGravacao() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) { setErro('Reconhecimento de voz não disponível. Use o Chrome.'); return; }
    const r = new Rec();
    r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
    r.onstart = () => setGravando(true);
    r.onerror = () => { setGravando(false); setErro('Não consegui captar o áudio. Tente novamente.'); };
    r.onend = () => setGravando(false);
    r.onresult = (e) => enviar(e.results[0][0].transcript);
    reconhecimentoRef.current = r;
    r.start();
  }

  function pararGravacao() { reconhecimentoRef.current?.stop(); }

  return (
    <div className="assistente-root">
      <div className="assistente-header">
        <div>
          <p className="assistente-titulo">✨ Assistente financeiro</p>
          <p className="assistente-subtitulo">Pergunte sobre seus gastos, receitas ou peça uma análise. Texto ou voz.</p>
        </div>
        {conversa.length > 0 && (
          <button onClick={() => { setConversa([]); setErro(''); setInput(''); }} className="btn-link" style={{ fontSize: 'var(--text-sm)' }}>
            Limpar conversa
          </button>
        )}
      </div>

      <div className="assistente-conversa">
        {conversa.length === 0 && (
          <div className="assistente-vazio">
            <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)', marginBottom: 16 }}>
              Olá! Posso responder perguntas sobre suas finanças com base nos seus dados reais. Experimente:
            </p>
            <div className="assistente-sugestoes">
              {SUGESTOES.map((s) => <button key={s} onClick={() => enviar(s)} className="assistente-sugestao">{s}</button>)}
            </div>
          </div>
        )}

        {conversa.map((msg, i) => (
          <div key={i} className={`assistente-balao ${msg.papel}`}>
            {msg.papel === 'assistant' && <span className="assistente-avatar">✨</span>}
            <div className="assistente-texto">
              {msg.texto.split('\n').map((l, j) => <p key={j} style={{ margin: j === 0 ? 0 : '6px 0 0' }}>{l}</p>)}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="assistente-balao assistant">
            <span className="assistente-avatar">✨</span>
            <div className="assistente-texto assistente-pensando"><span /><span /><span /></div>
          </div>
        )}

        {erro && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--negative)', textAlign: 'center', margin: '8px 0' }}>{erro}</p>}
        <div ref={fimRef} />
      </div>

      <div className="assistente-input-row">
        <input
          ref={inputRef}
          className="input"
          placeholder={gravando ? 'Ouvindo...' : 'Pergunte algo sobre suas finanças...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
          disabled={pensando || gravando}
          style={{ flex: 1 }}
        />
        <button
          onClick={gravando ? pararGravacao : iniciarGravacao}
          disabled={pensando}
          title={gravando ? 'Parar gravação' : 'Falar pergunta'}
          className={`btn assistente-mic ${gravando ? 'gravando' : ''}`}
        >
          {gravando ? '⏹' : '🎤'}
        </button>
        <button
          onClick={() => enviar()}
          disabled={!input.trim() || pensando || gravando}
          className="btn btn-primary"
          style={{ padding: '10px 18px', flexShrink: 0 }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
