'use client';

import { useState } from 'react';
import { formatarMoeda } from '../../lib/financeiro';

// Taxa padrão sugerida para o rotativo. É configurável porque varia muito
// entre bancos e muda com a regulação — o usuário deve conferir na fatura dele.
const TAXA_ROTATIVO_PADRAO = 15;
const MESES_SIMULADOS = 24;

// Evolução do saldo devedor pagando um valor fixo por mês.
// saldo_novo = (saldo - pagamento) * (1 + taxa)
function simular(divida, pagamentoMensal, taxaMensalPct, limiteMeses = MESES_SIMULADOS) {
  const i = taxaMensalPct / 100;
  let saldo = divida;
  let totalPago = 0;
  const evolucao = [];

  for (let mes = 1; mes <= limiteMeses; mes++) {
    const pagamento = Math.min(pagamentoMensal, saldo);
    totalPago += pagamento;
    saldo = (saldo - pagamento) * (1 + i);
    evolucao.push({ mes, saldo: Math.max(0, saldo), totalPago });
    if (saldo <= 0.01) {
      return { quita: true, meses: mes, totalPago, jurosPagos: totalPago - divida, evolucao, saldoFinal: 0 };
    }
  }

  return {
    quita: false,
    meses: null,
    totalPago,
    jurosPagos: totalPago - (divida - saldo),
    evolucao,
    saldoFinal: saldo,
  };
}

export default function SimuladorRotativo() {
  const [divida, setDivida] = useState('');
  const [taxa, setTaxa] = useState(String(TAXA_ROTATIVO_PADRAO));
  const [pagamentoEscolhido, setPagamentoEscolhido] = useState('');

  const D = parseFloat(String(divida).replace(',', '.')) || 0;
  const i = parseFloat(String(taxa).replace(',', '.')) || 0;
  const minimo = D * 0.15; // mínimo típico: 15% da fatura
  const escolhido = parseFloat(String(pagamentoEscolhido).replace(',', '.')) || 0;

  const jurosDoMes = D * (i / 100);
  const pagamentoNaoCobreJuros = escolhido > 0 && escolhido < jurosDoMes;

  const cenarios = D > 0 ? [
    {
      nome: 'Pagando o mínimo',
      pagamento: minimo,
      resultado: simular(D, minimo, i),
      destaque: 'alerta',
    },
    ...(escolhido > 0 ? [{
      nome: 'Pagando o valor que você escolheu',
      pagamento: escolhido,
      resultado: simular(D, escolhido, i),
      destaque: 'escolhido',
    }] : []),
  ] : [];

  // Quanto se economiza pagando um pouco mais que o mínimo
  const economiaExtra = (() => {
    if (D <= 0) return null;
    const base = simular(D, minimo, i);
    const comMais = simular(D, minimo + 50, i);
    if (!base.quita && !comMais.quita) {
      return { viavel: false };
    }
    if (base.quita && comMais.quita) {
      return {
        viavel: true,
        mesesAntes: base.meses - comMais.meses,
        economia: base.totalPago - comMais.totalPago,
      };
    }
    if (!base.quita && comMais.quita) {
      return { viavel: true, viraQuitavel: true, meses: comMais.meses };
    }
    return null;
  })();

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p className="card-title" style={{ marginBottom: 4 }}>Simulador de rotativo do cartão</p>
        <p className="empty-hint simulador-subtitulo" style={{ margin: 0 }}>
          Veja quanto custa deixar parte da fatura para o mês seguinte.
        </p>
      </div>

      {/* Entradas */}
      <div className="simulador-campos" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Valor da fatura
          </label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="0,00"
            value={divida}
            onChange={(e) => setDivida(e.target.value)}
            style={{ width: 160 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Juros ao mês (%)
          </label>
          <input
            className="input"
            type="number"
            step="0.1"
            value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            style={{ width: 120 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>
            Quanto você pode pagar/mês
          </label>
          <input
            className="input"
            type="number"
            step="0.01"
            placeholder="opcional"
            value={pagamentoEscolhido}
            onChange={(e) => setPagamentoEscolhido(e.target.value)}
            style={{ width: 180 }}
          />
        </div>
      </div>

      {D > 0 && (
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>
          Confira a taxa na sua fatura — ela varia bastante entre bancos.
          O mínimo costuma ser 15% da fatura: {formatarMoeda(minimo)}.
        </p>
      )}

      {/* Aviso: pagamento não cobre nem os juros */}
      {pagamentoNaoCobreJuros && (
        <div style={{ padding: '12px 14px', background: 'var(--negative-tint)', borderRadius: 'var(--radius-sm)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--negative)' }}>
            Esse valor não cobre nem os juros do mês ({formatarMoeda(jurosDoMes)}).
            Pagando isso, a dívida <strong>cresce</strong> todo mês mesmo você pagando.
          </p>
        </div>
      )}

      {/* Cenários */}
      {cenarios.map((c) => (
        <div
          key={c.nome}
          style={{
            padding: 14,
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${c.destaque === 'alerta' ? 'var(--negative)' : 'var(--primary)'}`,
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 'var(--weight-semibold)' }}>{c.nome}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              {formatarMoeda(c.pagamento)}/mês
            </span>
          </div>

          {c.resultado.quita ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
              <div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>Quita em</p>
                <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>
                  {c.resultado.meses} {c.resultado.meses === 1 ? 'mês' : 'meses'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>Total pago</p>
                <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0 }}>
                  {formatarMoeda(c.resultado.totalPago)}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', margin: 0 }}>Só de juros</p>
                <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, margin: 0, color: 'var(--negative)' }}>
                  {formatarMoeda(c.resultado.jurosPagos)}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ margin: '0 0 6px', color: 'var(--negative)', fontWeight: 'var(--weight-semibold)' }}>
                Não quita em {MESES_SIMULADOS} meses.
              </p>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                Depois de {MESES_SIMULADOS} meses pagando {formatarMoeda(c.pagamento)}/mês,
                você teria pago {formatarMoeda(c.resultado.totalPago)} e ainda deveria{' '}
                <strong style={{ color: 'var(--negative)' }}>{formatarMoeda(c.resultado.saldoFinal)}</strong>.
              </p>
            </div>
          )}
        </div>
      ))}

      {/* Efeito de pagar um pouco mais */}
      {economiaExtra?.viavel && (
        <div style={{ padding: '12px 14px', background: 'var(--primary-tint)', borderRadius: 'var(--radius-sm)' }}>
          {economiaExtra.viraQuitavel ? (
            <p style={{ margin: 0, fontSize: 'var(--text-md)' }}>
              Pagando <strong>R$ 50 a mais</strong> por mês que o mínimo, a dívida passa a ser quitável
              em {economiaExtra.meses} meses — em vez de nunca acabar.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 'var(--text-md)' }}>
              Pagando <strong>R$ 50 a mais</strong> por mês que o mínimo, você quita{' '}
              <strong>{economiaExtra.mesesAntes} {economiaExtra.mesesAntes === 1 ? 'mês' : 'meses'}</strong> antes
              e economiza <strong>{formatarMoeda(economiaExtra.economia)}</strong> em juros.
            </p>
          )}
        </div>
      )}

      {/* Saídas do rotativo */}
      {D > 0 && (
        <div style={{ padding: '12px 14px', background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
          <p style={{ margin: '0 0 8px', fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-md)' }}>
            O rotativo quase nunca é a melhor saída
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--text-muted)', lineHeight: 1.7 }}>
            <li>
              <strong>Parcelar a fatura</strong> — o próprio banco costuma oferecer juros bem menores
              que o rotativo. Peça a simulação no app do cartão antes do vencimento.
            </li>
            <li>
              <strong>Portabilidade de dívida</strong> — outro banco pode assumir o saldo com taxa menor.
              Você pode pedir a proposta e comparar.
            </li>
            <li>
              <strong>Crédito com garantia</strong> — modalidades com garantia (consignado, por exemplo)
              costumam ter juros muito abaixo do rotativo.
            </li>
            <li>
              <strong>Renegociação direta</strong> — se a dívida já está atrasada, credores frequentemente
              aceitam descontos. Vale consultar seu CPF e as ofertas disponíveis.
            </li>
          </ul>
          <p style={{ margin: '10px 0 0', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Esta é uma simulação com base nos valores que você informou, não uma recomendação
            financeira. As condições reais dependem do seu contrato e do seu banco.
          </p>
        </div>
      )}
    </div>
  );
}