import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { TETO_MEI_ANUAL, calcularStatusTetoMEI } from '../lib/mei.js';

// Helpers
const MES_AGO = '2026-08-01';
const MES_JUN = '2026-06-01';
const MES_JAN = '2026-01-01';
const ANO = 2026;

describe('calcularStatusTetoMEI — teto', () => {
  test('dataAbertura de ano anterior → teto cheio 81000, tetoProporcional false', () => {
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 40000, ano: ANO, dataAbertura: '2025-01-15', mesReferencia: MES_AGO });
    assert.strictEqual(r.teto, TETO_MEI_ANUAL);
    assert.strictEqual(r.tetoProporcional, false);
    assert.strictEqual(r.zona, 'verde');
  });

  test('dataAbertura null → teto cheio 81000', () => {
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 40000, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.teto, TETO_MEI_ANUAL);
    assert.strictEqual(r.tetoProporcional, false);
  });

  test('abriu em julho do ano corrente → teto proporcional 40500 (6 meses)', () => {
    // 12-7+1=6 meses → 81000/12*6=40500
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 30000, ano: ANO, dataAbertura: '2026-07-01', mesReferencia: MES_AGO });
    assert.strictEqual(r.teto, 40500);
    assert.strictEqual(r.tetoProporcional, true);
  });

  test('abriu em janeiro do ano corrente → teto proporcional 81000 (12 meses)', () => {
    // 12-1+1=12 meses → teto cheio
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 0, ano: ANO, dataAbertura: '2026-01-10', mesReferencia: MES_JAN });
    assert.strictEqual(r.teto, TETO_MEI_ANUAL);
    assert.strictEqual(r.tetoProporcional, true);
  });
});

describe('calcularStatusTetoMEI — zonas', () => {
  test('zona verde: acumulado abaixo de 80% do teto', () => {
    // 40000 / 81000 = 49.4% → verde
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 40000, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.zona, 'verde');
  });

  test('zona amarela por aproximação: acumulado >= 80% do teto mas <= teto', () => {
    // 70000 / 81000 ≈ 86.4% → amarelo (aproximando)
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 70000, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.zona, 'amarelo');
    assert.ok(r.acumulado <= r.teto); // ainda não estourou
  });

  test('zona amarela por estouro dentro da tolerância: acumulado entre teto e teto*1.20', () => {
    // 90000: 81000 < 90000 <= 97200 → amarelo
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 90000, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.zona, 'amarelo');
    assert.ok(r.acumulado > r.teto); // passou do teto
    assert.ok(r.acumulado <= r.limiteTolerancia); // dentro da tolerância
  });

  test('zona vermelha: acumulado > teto * 1.20 (97200)', () => {
    // 100000 > 97200 → vermelho
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 100000, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.zona, 'vermelho');
  });

  test('teto proporcional — acumulado abaixo do proporcional → verde', () => {
    // teto = 40500; 30000 < 40500*0.8=32400 → verde
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 30000, ano: ANO, dataAbertura: '2026-07-01', mesReferencia: MES_AGO });
    assert.strictEqual(r.teto, 40500);
    assert.strictEqual(r.zona, 'verde');
  });

  test('teto proporcional — acumulado acima do proporcional mas dentro da tolerância → amarelo', () => {
    // teto = 40500; 42000 > 40500 mas 42000 <= 40500*1.20=48600 → amarelo
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 42000, ano: ANO, dataAbertura: '2026-07-01', mesReferencia: MES_AGO });
    assert.strictEqual(r.teto, 40500);
    assert.strictEqual(r.zona, 'amarelo');
  });

  test('percentual calculado corretamente', () => {
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 40500, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.ok(Math.abs(r.percentual - 40500 / 81000) < 0.0001);
  });

  test('limiteTolerancia = teto * 1.20', () => {
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 0, ano: ANO, dataAbertura: null, mesReferencia: MES_JAN });
    assert.strictEqual(r.limiteTolerancia, 81000 * 1.20);
  });
});

describe('calcularStatusTetoMEI — projeção', () => {
  test('projeção não estoura: acumulado 40000 em agosto → mediaMensal 5000 → mes 17 > 12 → vaiEstourar false', () => {
    // mediaMensal = 40000/8 = 5000; 5000*16=80000 ≤ 81000; 5000*17=85000 > 81000 mas 17>12
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 40000, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.projecao.mediaMensal, 5000);
    assert.strictEqual(r.projecao.mesEstouro, null);
    assert.strictEqual(r.projecao.vaiEstourar, false);
  });

  test('projeção estoura: acumulado 60000 em junho → mediaMensal 10000 → mesEstouro 9', () => {
    // mediaMensal = 60000/6 = 10000; 10000*9=90000 > 81000 → mesEstouro=9
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 60000, ano: ANO, dataAbertura: null, mesReferencia: MES_JUN });
    assert.strictEqual(r.projecao.mediaMensal, 10000);
    assert.strictEqual(r.projecao.mesEstouro, 9);
    assert.strictEqual(r.projecao.vaiEstourar, true);
  });

  test('já estourou: acumulado 85000 em agosto → mesEstouro = 8 (mês atual), vaiEstourar true', () => {
    // mediaMensal = 85000/8 = 10625; primeiro m onde 10625*m > 81000: ceil(81000/10625)=8=mesAtual
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 85000, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.projecao.mesEstouro, 8);
    assert.strictEqual(r.projecao.vaiEstourar, true);
  });

  test('acumulado 0 → mediaMensal 0, vaiEstourar false', () => {
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 0, ano: ANO, dataAbertura: null, mesReferencia: MES_AGO });
    assert.strictEqual(r.projecao.mediaMensal, 0);
    assert.strictEqual(r.projecao.mesEstouro, null);
    assert.strictEqual(r.projecao.vaiEstourar, false);
  });

  test('mesesDecorridos 0 (mês 0 inválido) → sem divisão por zero, mediaMensal 0', () => {
    // Proteção defensiva: parseInt('00')=0 → guard ativa
    const r = calcularStatusTetoMEI({ receitaAcumuladaAno: 5000, ano: ANO, dataAbertura: null, mesReferencia: '2026-00-01' });
    assert.strictEqual(r.projecao.mediaMensal, 0);
    assert.strictEqual(r.projecao.vaiEstourar, false);
  });
});
