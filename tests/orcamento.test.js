import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { mesDeCompetencia, contaNoMes, gastoPorCategoriaNoMes } from '../lib/orcamento.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function txConta(overrides = {}) {
  return {
    tipo: 'saida',
    valor: 100,
    categoria: 'Alimentação',
    data: '2026-01-15',
    cartao_id: null,
    mes_fatura: null,
    origem: null,
    transferencia_id: null,
    ...overrides,
  };
}

function txCartao(overrides = {}) {
  return {
    tipo: 'saida',
    valor: 200,
    categoria: 'Compras',
    data: '2025-12-20',           // data no mês anterior
    cartao_id: 'cartao-uuid-1',
    mes_fatura: '2026-01-01',     // fatura no mês seguinte
    origem: null,
    transferencia_id: null,
    ...overrides,
  };
}

// ── mesDeCompetencia ──────────────────────────────────────────────────────────

describe('mesDeCompetencia', () => {
  test('transação de conta retorna o YYYY-MM da data', () => {
    const r = mesDeCompetencia(txConta());
    assert.strictEqual(r, '2026-01');
  });

  test('compra de cartão retorna o YYYY-MM do mes_fatura, não da data', () => {
    const tx = txCartao(); // data=dez/2025, mes_fatura=jan/2026
    assert.strictEqual(mesDeCompetencia(tx), '2026-01');
  });

  test('pagamento de fatura (origem=fatura) retorna null', () => {
    const tx = txCartao({ origem: 'fatura' });
    assert.strictEqual(mesDeCompetencia(tx), null);
  });

  test('transferência (transferencia_id preenchido) retorna null', () => {
    const tx = txConta({ transferencia_id: 'uuid-abc' });
    assert.strictEqual(mesDeCompetencia(tx), null);
  });

  test('cartão sem mes_fatura retorna null', () => {
    const tx = txCartao({ mes_fatura: null });
    assert.strictEqual(mesDeCompetencia(tx), null);
  });

  test('transação de conta sem data retorna null', () => {
    const tx = txConta({ data: null });
    assert.strictEqual(mesDeCompetencia(tx), null);
  });

  test('transferência tem prioridade sobre origem=fatura (ambos → null)', () => {
    const tx = txCartao({ transferencia_id: 'x', origem: 'fatura' });
    assert.strictEqual(mesDeCompetencia(tx), null);
  });
});

// ── contaNoMes ────────────────────────────────────────────────────────────────

describe('contaNoMes', () => {
  test('transação de conta conta no mês certo (por data)', () => {
    // data = 2026-01-15 → janeiro 2026 (mes=0)
    assert.ok(contaNoMes(txConta(), 2026, 0));
  });

  test('transação de conta NÃO conta em mês diferente', () => {
    // data = 2026-01-15 → não conta em fevereiro
    assert.ok(!contaNoMes(txConta(), 2026, 1));
  });

  test('compra de cartão conta pelo mes_fatura (jan), NÃO pela data (dez)', () => {
    const tx = txCartao(); // data=dez/2025, mes_fatura=jan/2026
    assert.ok(contaNoMes(tx, 2026, 0));   // jan 2026 ✓
    assert.ok(!contaNoMes(tx, 2025, 11)); // dez 2025 ✗ — data não conta
  });

  test('3 parcelas com mes_fatura distintos: cada uma conta no seu mês', () => {
    const base = { tipo: 'saida', valor: 150, categoria: 'Eletrônicos', data: '2025-12-10', cartao_id: 'c1', origem: null, transferencia_id: null };
    const p1 = { ...base, mes_fatura: '2026-01-01' };
    const p2 = { ...base, mes_fatura: '2026-02-01' };
    const p3 = { ...base, mes_fatura: '2026-03-01' };

    // Parcela 1 → janeiro
    assert.ok(contaNoMes(p1, 2026, 0));
    assert.ok(!contaNoMes(p1, 2026, 1));
    assert.ok(!contaNoMes(p1, 2026, 2));

    // Parcela 2 → fevereiro
    assert.ok(!contaNoMes(p2, 2026, 0));
    assert.ok(contaNoMes(p2, 2026, 1));
    assert.ok(!contaNoMes(p2, 2026, 2));

    // Parcela 3 → março
    assert.ok(!contaNoMes(p3, 2026, 0));
    assert.ok(!contaNoMes(p3, 2026, 1));
    assert.ok(contaNoMes(p3, 2026, 2));
  });

  test('pagamento de fatura nunca conta', () => {
    const tx = txCartao({ origem: 'fatura', mes_fatura: '2026-01-01' });
    assert.ok(!contaNoMes(tx, 2026, 0));
    assert.ok(!contaNoMes(tx, 2025, 11));
  });

  test('transferência nunca conta', () => {
    const tx = txConta({ transferencia_id: 'uuid-xyz', data: '2026-01-10' });
    assert.ok(!contaNoMes(tx, 2026, 0));
  });

  test('virada de ano: mes=11 (dez 2025) vs mes=0 (jan 2026)', () => {
    const txDez = txConta({ data: '2025-12-31' });
    const txJan = txConta({ data: '2026-01-01' });
    assert.ok(contaNoMes(txDez, 2025, 11));
    assert.ok(!contaNoMes(txDez, 2026, 0));
    assert.ok(!contaNoMes(txJan, 2025, 11));
    assert.ok(contaNoMes(txJan, 2026, 0));
  });
});

// ── gastoPorCategoriaNoMes ────────────────────────────────────────────────────

describe('gastoPorCategoriaNoMes', () => {
  test('soma transação de conta + compra de cartão na mesma categoria', () => {
    const txs = [
      txConta({ valor: 100, categoria: 'Alimentação', data: '2026-01-10' }),          // conta jan
      txCartao({ valor: 200, categoria: 'Alimentação', mes_fatura: '2026-01-01' }),   // cartão jan
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.strictEqual(r['Alimentação'], 300);
  });

  test('pagamento de fatura é excluído da soma', () => {
    const txs = [
      txConta({ valor: 100, categoria: 'Alimentação' }),
      txCartao({ valor: 500, categoria: null, origem: 'fatura', mes_fatura: '2026-01-01' }),
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.strictEqual(r['Alimentação'], 100);
    assert.strictEqual(r[''], undefined); // fatura não entra
  });

  test('transferência é excluída da soma', () => {
    const txs = [
      txConta({ valor: 200, categoria: 'Transporte' }),
      txConta({ valor: 1000, categoria: 'Transporte', transferencia_id: 'uuid-t' }),
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.strictEqual(r['Transporte'], 200); // só a primeira
  });

  test('entradas são ignoradas', () => {
    const txs = [
      txConta({ tipo: 'entrada', valor: 5000, categoria: 'Salário' }),
      txConta({ valor: 300, categoria: 'Saúde' }),
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.strictEqual(r['Salário'], undefined);
    assert.strictEqual(r['Saúde'], 300);
  });

  test('transação de outro mês não conta', () => {
    const txs = [
      txConta({ valor: 100, categoria: 'Lazer', data: '2026-01-20' }), // jan
      txConta({ valor: 200, categoria: 'Lazer', data: '2026-02-05' }), // fev
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0); // só jan
    assert.strictEqual(r['Lazer'], 100);
  });

  test('cartão de outro mes_fatura não conta no mês errado', () => {
    const txs = [
      txCartao({ valor: 300, categoria: 'Compras', mes_fatura: '2026-01-01' }), // jan
      txCartao({ valor: 400, categoria: 'Compras', mes_fatura: '2026-02-01' }), // fev
    ];
    const rJan = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.strictEqual(rJan['Compras'], 300);

    const rFev = gastoPorCategoriaNoMes(txs, 2026, 1);
    assert.strictEqual(rFev['Compras'], 400);
  });

  test('categoria null/vazia agrupa em string vazia', () => {
    const txs = [
      txConta({ valor: 50, categoria: null }),
      txConta({ valor: 30, categoria: '' }),
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.strictEqual(r[''], 80);
  });

  test('retorna objeto vazio quando nenhuma transação conta no mês', () => {
    const txs = [
      txConta({ data: '2025-12-20' }), // mês diferente
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.deepEqual(r, {});
  });

  test('múltiplas categorias são somadas separadamente', () => {
    const txs = [
      txConta({ valor: 120, categoria: 'Alimentação' }),
      txConta({ valor: 80,  categoria: 'Transporte' }),
      txCartao({ valor: 250, categoria: 'Alimentação', mes_fatura: '2026-01-01' }),
    ];
    const r = gastoPorCategoriaNoMes(txs, 2026, 0);
    assert.strictEqual(r['Alimentação'], 370); // 120 + 250
    assert.strictEqual(r['Transporte'], 80);
  });
});
