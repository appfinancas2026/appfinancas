'use client';

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda } from '../../lib/financeiro';

const TOTAL_PASSOS = 4;

export default function Onboarding({ entidadeAtual, onConcluir }) {
  const [passo, setPasso] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Passo 1 e 2: conta + saldo (a conta só é criada no fim do passo 2,
  // para não deixar conta órfã se a pessoa desistir no meio).
  const [nomeConta, setNomeConta] = useState('');
  const [saldoConta, setSaldoConta] = useState('');
  const [contaCriadaId, setContaCriadaId] = useState(null);

  // Passo 3: despesa fixa
  const [nomeFixo, setNomeFixo] = useState('');
  const [valorFixo, setValorFixo] = useState('');
  const [diaFixo, setDiaFixo] = useState('');

  // Passo 4: primeiro lançamento
  const [descLancamento, setDescLancamento] = useState('');
  const [valorLancamento, setValorLancamento] = useState('');

  async function salvarConta() {
    setErro('');
    if (!nomeConta.trim()) {
      setErro('Dê um nome para a conta.');
      return;
    }

    setSalvando(true);
    const valorInicial = parseFloat(saldoConta || '0');

    const { data, error } = await supabase
      .from('contas')
      .insert({
        entidade_id: entidadeAtual,
        nome: nomeConta.trim(),
        saldo_inicial: valorInicial,
        saldo_atual: valorInicial,
        principal: true,
      })
      .select()
      .single();

    setSalvando(false);

    if (error) {
      setErro('Não foi possível criar a conta. Tente novamente.');
      return;
    }

    setContaCriadaId(data.id);
    setPasso(3);
  }

  async function salvarDespesaFixa() {
    setErro('');

    // Passo opcional: sem nome, apenas avança.
    if (!nomeFixo.trim()) {
      setPasso(4);
      return;
    }

    const valor = parseFloat(valorFixo);
    const dia = parseInt(diaFixo, 10);

    if (!valor || valor <= 0) {
      setErro('Informe o valor da despesa.');
      return;
    }
    if (!dia || dia < 1 || dia > 31) {
      setErro('Informe o dia do vencimento (1 a 31).');
      return;
    }

    setSalvando(true);

    const { error } = await supabase.from('lancamentos_fixos').insert({
      entidade_id: entidadeAtual,
      nome: nomeFixo.trim(),
      tipo: 'saida',
      valor_padrao: valor,
      dia_referencia: dia,
      conta_padrao_id: contaCriadaId,
    });

    setSalvando(false);

    if (error) {
      setErro('Não foi possível salvar. Tente novamente.');
      return;
    }

    setPasso(4);
  }

  async function salvarLancamento() {
    setErro('');

    if (!descLancamento.trim() && !valorLancamento) {
      onConcluir();
      return;
    }

    const valor = parseFloat(valorLancamento);
    if (!valor || valor <= 0) {
      setErro('Informe o valor, ou pule este passo.');
      return;
    }

    setSalvando(true);

    const { error } = await supabase.from('transacoes').insert({
      entidade_id: entidadeAtual,
      conta_id: contaCriadaId,
      valor,
      tipo: 'saida',
      categoria: 'outros',
      descricao: descLancamento.trim() || 'Primeiro lançamento',
      origem: 'manual',
      status: 'pago',
      data: new Date().toISOString().slice(0, 10),
    });

    setSalvando(false);

    if (error) {
      setErro('Não foi possível salvar. Tente novamente.');
      return;
    }

    onConcluir();
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 28 }}>
        <div className="onboarding-progresso">
          {Array.from({ length: TOTAL_PASSOS }, (_, i) => (
            <div key={i} className={`onboarding-bolinha ${i + 1 <= passo ? 'ativa' : ''}`} />
          ))}
        </div>

        {passo === 1 && (
          <>
            <p className="card-title" style={{ marginBottom: 6 }}>Vamos começar 👋</p>
            <p className="empty-hint" style={{ marginBottom: 18 }}>
              Primeiro, onde está o seu dinheiro? Pode ser sua conta do banco, carteira, ou o que você usar no dia a dia.
            </p>

            <input
              className="input"
              placeholder="Ex: Nubank, Itaú, Carteira"
              value={nomeConta}
              onChange={(e) => setNomeConta(e.target.value)}
              autoFocus
            />

            <button
              onClick={() => {
                if (!nomeConta.trim()) {
                  setErro('Dê um nome para a conta.');
                  return;
                }
                setErro('');
                setPasso(2);
              }}
              className="btn btn-primary"
              style={{ width: '100%', padding: '11px 16px', marginTop: 12 }}
            >
              Continuar
            </button>
          </>
        )}

        {passo === 2 && (
          <>
            <p className="card-title" style={{ marginBottom: 6 }}>Quanto tem em {nomeConta}?</p>
            <p className="empty-hint" style={{ marginBottom: 18 }}>
              O saldo de hoje. A partir dele, o app calcula tudo automaticamente conforme você registra entradas e saídas.
            </p>

            <input
              className="input"
              type="number"
              step="0.01"
              placeholder="0,00"
              value={saldoConta}
              onChange={(e) => setSaldoConta(e.target.value)}
              autoFocus
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setErro(''); setPasso(1); }} className="btn btn-ghost">Voltar</button>
              <button onClick={salvarConta} className="btn btn-primary" style={{ flex: 1, padding: '11px 16px' }} disabled={salvando}>
                {salvando ? 'Salvando...' : 'Continuar'}
              </button>
            </div>
          </>
        )}

        {passo === 3 && (
          <>
            <p className="card-title" style={{ marginBottom: 6 }}>Alguma conta que se repete todo mês?</p>
            <p className="empty-hint" style={{ marginBottom: 18 }}>
              Aluguel, luz, internet, assinatura. O app lembra você todo mês, e não precisa recadastrar.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="input"
                placeholder="Ex: Aluguel, Conta de luz"
                value={nomeFixo}
                onChange={(e) => setNomeFixo(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  placeholder="Valor"
                  value={valorFixo}
                  onChange={(e) => setValorFixo(e.target.value)}
                  style={{ flex: 1 }}
                />
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Dia"
                  value={diaFixo}
                  onChange={(e) => setDiaFixo(e.target.value)}
                  style={{ width: 90 }}
                />
              </div>
            </div>

            <button onClick={salvarDespesaFixa} className="btn btn-primary" style={{ width: '100%', padding: '11px 16px', marginTop: 12 }} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Continuar'}
            </button>
            <button onClick={() => { setErro(''); setPasso(4); }} className="btn-link" style={{ width: '100%', marginTop: 10 }}>
              não tenho, pular
            </button>
          </>
        )}

        {passo === 4 && (
          <>
            <p className="card-title" style={{ marginBottom: 6 }}>Gastou algo hoje?</p>
            <p className="empty-hint" style={{ marginBottom: 18 }}>
              Registre agora pra ver como funciona. Se não tiver nada, pode pular — o app está pronto pra usar.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="input"
                placeholder="Ex: Almoço, Mercado"
                value={descLancamento}
                onChange={(e) => setDescLancamento(e.target.value)}
                autoFocus
              />
              <input
                className="input"
                type="number"
                step="0.01"
                placeholder="Valor"
                value={valorLancamento}
                onChange={(e) => setValorLancamento(e.target.value)}
              />
            </div>

            <button onClick={salvarLancamento} className="btn btn-primary" style={{ width: '100%', padding: '11px 16px', marginTop: 12 }} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Concluir'}
            </button>
            <button onClick={onConcluir} className="btn-link" style={{ width: '100%', marginTop: 10 }}>
              pular e ir para o app
            </button>
          </>
        )}

        {erro && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--negative)' }}>{erro}</p>}

        {passo === 1 && (
          <p style={{ fontSize: 12, marginTop: 18, textAlign: 'center' }}>
            <button onClick={onConcluir} className="btn-link">configurar depois</button>
          </p>
        )}
      </div>
    </div>
  );
}
