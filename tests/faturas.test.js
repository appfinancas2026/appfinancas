import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calcularVencimentoFatura, gerarEventosFaturaFutura } from '../lib/faturas.js';

function d(ano, mes1, dia) {
  const dt = new Date(ano, mes1 - 1, dia);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

describe('calcularVencimentoFatura', () => {
  // fecha 20, vence 28: 28 > 20 → mesmo mês do ciclo
  test('dia_vencimento > dia_fechamento: vence no mesmo mês do ciclo', () => {
    const cartao = { dia_fechamento: 20, dia_vencimento: 28 };
    const result = calcularVencimentoFatura(cartao, '2025-07-01', '2025-08-01');
    assert.deepEqual(result, d(2025, 7, 28));
  });

  // fecha 25, vence 5: 5 < 25 → mês seguinte (mesRefAberta)
  test('dia_vencimento < dia_fechamento: vence no mês da fatura aberta', () => {
    const cartao = { dia_fechamento: 25, dia_vencimento: 5 };
    const result = calcularVencimentoFatura(cartao, '2025-07-01', '2025-08-01');
    assert.deepEqual(result, d(2025, 8, 5));
  });

  // fecha 15, vence 15: 15 <= 15 → mês seguinte
  test('dia_vencimento == dia_fechamento: vence no mês da fatura aberta', () => {
    const cartao = { dia_fechamento: 15, dia_vencimento: 15 };
    const result = calcularVencimentoFatura(cartao, '2025-07-01', '2025-08-01');
    assert.deepEqual(result, d(2025, 8, 15));
  });

  // clamp: dia 31 em setembro (30 dias) → dia 30
  test('clamp: dia_vencimento 31 em mês de 30 dias vira último dia', () => {
    const cartao = { dia_fechamento: 5, dia_vencimento: 31 };
    // 31 <= 5 é falso → mesmo mês do ciclo = setembro (30 dias)
    const result = calcularVencimentoFatura(cartao, '2025-09-01', '2025-10-01');
    assert.deepEqual(result, d(2025, 9, 30));
  });

  // clamp: dia 31 em fevereiro → 28 (não-bissexto)
  test('clamp: dia_vencimento 31 em fevereiro vira dia 28', () => {
    const cartao = { dia_fechamento: 5, dia_vencimento: 31 };
    // 31 > 5 → mesmo mês do ciclo = fevereiro 2025 (28 dias)
    const result = calcularVencimentoFatura(cartao, '2025-02-01', '2025-03-01');
    assert.deepEqual(result, d(2025, 2, 28));
  });

  // virada de ano: ciclo dezembro, vencimento no mês seguinte = janeiro/2026
  test('virada de ano: ciclo dezembro vence em janeiro do ano seguinte', () => {
    const cartao = { dia_fechamento: 25, dia_vencimento: 5 };
    // 5 <= 25 → mesRefAberta = janeiro 2026
    const result = calcularVencimentoFatura(cartao, '2025-12-01', '2026-01-01');
    assert.deepEqual(result, d(2026, 1, 5));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gerarEventosFaturaFutura
// ─────────────────────────────────────────────────────────────────────────────

describe('gerarEventosFaturaFutura', () => {
  // Helpers de fixture
  function cartao(id, nome, dia_fechamento, dia_vencimento) {
    return { id, nome, dia_fechamento, dia_vencimento };
  }
  function tx(cartao_id, valor, mes_fatura) {
    return { cartao_id, valor, mes_fatura };
  }

  // Data de referência fixa para todos os testes (mês atual = agosto 2026)
  const HOJE = '2026-08-01';

  test('um cartão, uma parcela futura → evento no dia de vencimento correto', () => {
    // dia_vencimento(28) > dia_fechamento(20) → vence no mesmo mês do ciclo (agosto)
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 20, 28)],
      transacoesCartaoFuturas: [tx(1, 500, '2026-08-01')],
      hoje: HOJE,
      dias: 60,
    });
    assert.strictEqual(eventos.length, 1);
    assert.strictEqual(eventos[0].data, '2026-08-28');
    assert.strictEqual(eventos[0].tipo, 'saida');
    assert.strictEqual(eventos[0].valor, 500);
    assert.strictEqual(eventos[0].nome, 'Fatura VISA');
  });

  test('múltiplas parcelas do mesmo cartão no mesmo mês → somadas em um único evento', () => {
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 20, 28)],
      transacoesCartaoFuturas: [
        tx(1, 300, '2026-08-01'), // TV parcela 2
        tx(1, 200, '2026-08-01'), // Sofá parcela 1
      ],
      hoje: HOJE,
      dias: 60,
    });
    assert.strictEqual(eventos.length, 1);
    assert.strictEqual(eventos[0].valor, 500);
    assert.strictEqual(eventos[0].data, '2026-08-28');
  });

  test('dois cartões com vencimentos diferentes → dois eventos em dias distintos', () => {
    // VISA: 28 > 20 → vence em agosto (mesmo mês ciclo) → 2026-08-28
    // MASTER: 5 < 25 → vence no mês seguinte (setembro) → 2026-09-05
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 20, 28), cartao(2, 'MASTER', 25, 5)],
      transacoesCartaoFuturas: [tx(1, 400, '2026-08-01'), tx(2, 300, '2026-08-01')],
      hoje: HOJE,
      dias: 60,
    });
    assert.strictEqual(eventos.length, 2);
    const visa   = eventos.find((e) => e.nome === 'Fatura VISA');
    const master = eventos.find((e) => e.nome === 'Fatura MASTER');
    assert.strictEqual(visa.data,   '2026-08-28');
    assert.strictEqual(master.data, '2026-09-05');
    assert.strictEqual(visa.valor,   400);
    assert.strictEqual(master.valor, 300);
  });

  test('dia_vencimento == dia_fechamento → vence no mês seguinte (mesRefAberta)', () => {
    // 15 > 15 é falso → mesRefAberta = setembro → dia 15 em setembro
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'NUBANK', 15, 15)],
      transacoesCartaoFuturas: [tx(1, 600, '2026-08-01')],
      hoje: HOJE,
      dias: 60,
    });
    assert.strictEqual(eventos.length, 1);
    assert.strictEqual(eventos[0].data, '2026-09-15');
  });

  test('evento cujo vencimento excede o horizonte → não gerado', () => {
    // horizon = 2026-08-01 + 20d = 2026-08-21; fatura VISA vence dia 28 → fora
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 20, 28)],
      transacoesCartaoFuturas: [tx(1, 500, '2026-08-01')],
      hoje: HOJE,
      dias: 20,
    });
    assert.strictEqual(eventos.length, 0);
  });

  test('evento cujo vencimento cai em hoje → não gerado (horizonte é hoje exclusivo)', () => {
    // hoje = '2026-08-28'; VISA ciclo agosto vence exatamente em 28/08 → excluído
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 20, 28)],
      transacoesCartaoFuturas: [tx(1, 500, '2026-08-01')],
      hoje: '2026-08-28',
      dias: 30,
    });
    assert.strictEqual(eventos.length, 0);
  });

  test('cartao_id sem correspondência → evento ignorado silenciosamente', () => {
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 20, 28)],
      transacoesCartaoFuturas: [tx(99, 500, '2026-08-01')], // cartao 99 não existe
      hoje: HOJE,
      dias: 60,
    });
    assert.strictEqual(eventos.length, 0);
  });

  test('virada de ano: ciclo dezembro, vencimento (dia 5 < fech 25) cai em janeiro', () => {
    // mesRefCiclo = 2026-12-01; mesRefAberta = 2027-01-01; dia 5 → 2027-01-05
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 25, 5)],
      transacoesCartaoFuturas: [tx(1, 700, '2026-12-01')],
      hoje: '2026-12-01',
      dias: 60,
    });
    assert.strictEqual(eventos.length, 1);
    assert.strictEqual(eventos[0].data, '2027-01-05');
  });

  test('múltiplos meses futuros de um cartão → um evento por mês', () => {
    // VISA vence dia 28 de cada mês do ciclo
    const eventos = gerarEventosFaturaFutura({
      cartoes: [cartao(1, 'VISA', 20, 28)],
      transacoesCartaoFuturas: [
        tx(1, 100, '2026-08-01'),
        tx(1, 200, '2026-09-01'),
      ],
      hoje: HOJE,
      dias: 90,
    });
    assert.strictEqual(eventos.length, 2);
    const datas = eventos.map((e) => e.data).sort();
    assert.strictEqual(datas[0], '2026-08-28');
    assert.strictEqual(datas[1], '2026-09-28');
  });
});
