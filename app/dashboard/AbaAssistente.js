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

export default function AbaAssistente({
  entidadeAtual,
  contas,
  transacoesDoMes,
  lancamentosFixos,
  ano,
  mes,
}) {
  const [conversa, setConversa] = useState([]);
  const [input, setInput] = useState('');
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState('');
  const fimRef = useRef(null);
  const inputRef = useRef(null);

  // Rola para o fim sempre que a conversa muda
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversa, pensando]);

  // Monta o contexto financeiro para enviar à IA
  const montarContexto = useCallback(async () => {
    const NOMES_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const mesNome = `${NOMES_MESES[mes]} de ${ano}`;

    // Saldo das contas
    const saldoTotal = contas.reduce((s, c) => s + Number(c.saldo_atual), 0);
    const linhasContas = contas.map((c) => `  - ${c.nome}: ${formatarMoeda(c.saldo_atual)}`).join('\n');

    // Transações do mês
    const entradas = transacoesDoMes.filter((t) => t.tipo === 'entrada' && !t.transferencia_id);
    const saidas = transacoesDoMes.filter((t) => t.tipo === 'saida' && !t.transferencia_id);
    const totalEntradas = entradas.reduce((s, t) => s + Number(t.valor), 0);
    const totalSaidas = saidas.reduce((s, t) => s + Number(t.valor), 0);

    // Gastos por categoria
    const porCategoria = {};
    saidas.forEach((t) => {
      const cat = t.categoria || 'Sem categoria';
      porCategoria[cat] = (porCategoria[cat] || 0) + Number(t.valor);
    });
    const linhasCategorias = Object.entries(porCategoria)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => `  - ${cat}: ${formatarMoeda(val)}`)
      .join('\n');

    // Fixos
    const fixosReceita = lancamentosFixos.filter((f) => f.tipo === 'entrada');
    const fixosDespesa = lancamentosFixos.filter((f) => f.tipo === 'saida');

    // Histórico dos últimos 3 meses para perguntas comparativas
    const tresMesesAtras = new Date(ano, mes - 3, 1).toISOString().slice(0, 10);
    const { data: txsHistorico } = await supabase
      .from('transacoes')
      .select('tipo, valor, categoria, data')
      .eq('entidade_id', entidadeAtual)
      .is('transferencia_id', null)
      .gte('data', tresMesesAtras)
      .order('data', { ascending: false });

    const totalReceitasHist = (txsHistorico || []).filter((t) => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor), 0);
    const totalSaidasHist = (txsHistorico || []).filter((t) => t.tipo === 'saida').reduce((s, t) => s + Number(t.valor), 0);

    return `Mês atual: ${mesNome}

CONTAS (saldo total: ${formatarMoeda(saldoTotal)}):
${linhasContas || '  Nenhuma conta cadastrada'}

MÊS ATUAL — ${mesNome}:
  Total de entradas: ${formatarMoeda(totalEntradas)}
  Total de saídas: ${formatarMoeda(totalSaidas)}
  Resultado: ${formatarMoeda(totalEntradas - totalSaidas)} (${totalEntradas >= totalSaidas ? 'positivo' : 'negativo'})

GASTOS POR CATEGORIA (${mesNome}):
${linhasCategorias || '  Nenhum gasto registrado'}

RECEITAS FIXAS MENSAIS (${fixosReceita.length}):
${fixosReceita.map((f) => `  - ${f.nome}: ${formatarMoeda(f.valor_padrao)}`).join('\n') || '  Nenhuma'}

DESPESAS FIXAS MENSAIS (${fixosDespesa.length}):
${fixosDespesa.map((f) => `  - ${f.nome}: ${formatarMoeda(f.valor_padrao)} (dia ${f.dia_referencia})`).join('\n') || '  Nenhuma'}

ÚLTIMOS 3 MESES (resumo):
  Total recebido: ${formatarMoeda(totalReceitasHist)}
  Total gasto: ${formatarMoeda(totalSaidasHist)}
  Saldo do período: ${formatarMoeda(totalReceitasHist - totalSaidasHist)}`;
  }, [entidadeAtual, contas, transacoesDoMes, lancamentosFixos, ano, mes]);

  async function enviar(texto) {
    const pergunta = (texto || input).trim();
    if (!pergunta || pensando) return;

    setInput('');
    setErro('');

    const novaMensagemUser = { papel: 'user', texto: pergunta };
    const conversaAtualizada = [...conversa, novaMensagemUser];
    setConversa(conversaAtualizada);
    setPensando(true);

    try {
      const contexto = await montarContexto();

      // Envia só as últimas 6 mensagens de histórico para não explodir o contexto
      const historico = conversaAtualizada.slice(-6).slice(0, -1);

      const resposta = await fetch('/api/assistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, contexto, historico }),
      });

      const json = await resposta.json();

      if (json.error) {
        setErro(json.error);
        setConversa((prev) => prev.slice(0, -1));
        return;
      }

      setConversa((prev) => [...prev, { papel: 'assistant', texto: json.resposta }]);
    } catch {
      setErro('Falha de conexão. Tente novamente.');
      setConversa((prev) => prev.slice(0, -1));
    } finally {
      setPensando(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function limpar() {
    setConversa([]);
    setErro('');
    setInput('');
    inputRef.current?.focus();
  }

  return (
    <div className="assistente-root">
      {/* Cabeçalho */}
      <div className="assistente-header">
        <div>
          <p className="assistente-titulo">✨ Assistente financeiro</p>
          <p className="assistente-subtitulo">
            Pergunte sobre seus gastos, receitas, categorias ou peça uma análise.
          </p>
        </div>
        {conversa.length > 0 && (
          <button onClick={limpar} className="btn-link" style={{ fontSize: 'var(--text-sm)' }}>
            Limpar conversa
          </button>
        )}
      </div>

      {/* Área de conversa */}
      <div className="assistente-conversa">
        {conversa.length === 0 && (
          <div className="assistente-vazio">
            <p style={{ fontSize: 'var(--text-md)', color: 'var(--text-muted)', marginBottom: 16 }}>
              Olá! Posso responder perguntas sobre suas finanças com base nos seus dados reais.
              Experimente:
            </p>
            <div className="assistente-sugestoes">
              {SUGESTOES.map((s) => (
                <button key={s} onClick={() => enviar(s)} className="assistente-sugestao">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {conversa.map((msg, i) => (
          <div key={i} className={`assistente-balao ${msg.papel}`}>
            {msg.papel === 'assistant' && (
              <span className="assistente-avatar">✨</span>
            )}
            <div className="assistente-texto">
              {msg.texto.split('\n').map((linha, j) => (
                <p key={j} style={{ margin: j === 0 ? 0 : '6px 0 0' }}>{linha}</p>
              ))}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="assistente-balao assistant">
            <span className="assistente-avatar">✨</span>
            <div className="assistente-texto assistente-pensando">
              <span /><span /><span />
            </div>
          </div>
        )}

        {erro && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--negative)', textAlign: 'center', margin: '8px 0' }}>
            {erro}
          </p>
        )}

        <div ref={fimRef} />
      </div>

      {/* Input */}
      <div className="assistente-input-row">
        <input
          ref={inputRef}
          className="input"
          placeholder="Pergunte algo sobre suas finanças..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && enviar()}
          disabled={pensando}
          style={{ flex: 1 }}
        />
        <button
          onClick={() => enviar()}
          disabled={!input.trim() || pensando}
          className="btn btn-primary"
          style={{ padding: '10px 18px', flexShrink: 0 }}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
