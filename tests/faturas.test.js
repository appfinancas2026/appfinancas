import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calcularVencimentoFatura } from '../lib/faturas.js';

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
