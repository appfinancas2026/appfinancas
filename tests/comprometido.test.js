import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { calcularComprometidoFuturo } from '../lib/comprometido.js';

// Lembrete: mesAtual é 0-based (0 = janeiro), como em Date.getMonth().
// Todos os testes usam anoAtual=2026, mesAtual=0 (janeiro) como ponto de partida,
// exceto onde especificado.

// ── Helpers de fixture ────────────────────────────────────────────────────────

// fixo cuja parcela 1 começa em 'YYYY-MM-01'.
// Para calcularParcela(fixo, 2026, 0) = 4:
//   diffMeses = (2026-2025)*12 + (0-9) = 3  →  numero = 4
// mes_inicio = '2025-10-01' (outubro 2025)
function fixoNotebook() {
  return {
    parcelado: true,
    total_parcelas: 10,
    mes_inicio: '2025-10-01',
    valor_padrao: 450,
    nome: 'Notebook',
  };
}

function tx(descricao, mes_fatura, valor, parcela_atual, parcela_total) {
  return { descricao, mes_fatura, valor, parcela_atual, parcela_total };
}

// ── Só fixas ──────────────────────────────────────────────────────────────────

describe('só fixas parceladas', () => {
  test('total = parcelas restantes × valor_padrao (parcela 4/10, 7 restantes)', () => {
    const r = calcularComprometidoFuturo({
      fixosParcelados: [fixoNotebook()],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    // parcelas 4..10 = 7 restantes (incluindo o mês atual)
    assert.strictEqual(r.total, 7 * 450);
  });

  test('porMes[0] recebe o valor do mês atual', () => {
    const r = calcularComprometidoFuturo({
      fixosParcelados: [fixoNotebook()],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.porMes[0].mesRef, '2026-01');
    assert.strictEqual(r.porMes[0].valor, 450);
  });

  test('porMes limitado a numMeses — parcela além do range não aparece, mas entra no total', () => {
    // numMeses=6 cobre jan-jun 2026 (parcelas 4-9). Parcela 10 = jul 2026 fica fora.
    const r = calcularComprometidoFuturo({
      fixosParcelados: [fixoNotebook()],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    const somaPorMes = r.porMes.reduce((s, m) => s + m.valor, 0);
    assert.strictEqual(r.porMes.length, 6);
    assert.strictEqual(somaPorMes, 6 * 450);          // 6 parcelas no gráfico
    assert.strictEqual(r.total, 7 * 450);              // 7 parcelas no total
    assert.ok(r.total > somaPorMes, 'total > soma do porMes quando há parcelas além do range');
  });

  test('fixa já terminada não contribui', () => {
    // mes_inicio=2025-01, total=3 → última parcela = mar 2025
    // jan 2026: diffMeses=12, numero=13 > 3 → null → ended
    const fixo = {
      parcelado: true,
      total_parcelas: 3,
      mes_inicio: '2025-01-01',
      valor_padrao: 200,
      nome: 'Old',
    };
    const r = calcularComprometidoFuturo({
      fixosParcelados: [fixo],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.total, 0);
    r.porMes.forEach((m) => assert.strictEqual(m.valor, 0));
  });

  test('fixa que ainda não começou — total conta todas as parcelas futuras', () => {
    // mes_inicio=2026-03 (mar): jan 2026 está antes do início
    // calcularParcela(jan) → numero=-1 < 1 → null; mas todas 5 parcelas são futuras
    const fixo = {
      parcelado: true,
      total_parcelas: 5,
      mes_inicio: '2026-03-01',
      valor_padrao: 300,
      nome: 'Future',
    };
    const r = calcularComprometidoFuturo({
      fixosParcelados: [fixo],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.total, 5 * 300);
    assert.strictEqual(r.porMes[0].valor, 0);   // jan — antes do início
    assert.strictEqual(r.porMes[1].valor, 0);   // fev — antes do início
    assert.strictEqual(r.porMes[2].mesRef, '2026-03');
    assert.strictEqual(r.porMes[2].valor, 300); // mar — parcela 1
  });
});

// ── Só cartão ─────────────────────────────────────────────────────────────────

describe('só transações de cartão', () => {
  test('agrupa por mes_fatura e soma corretamente', () => {
    const txs = [
      tx('TV',   '2026-01-01', 300, 2, 5),
      tx('Sofá', '2026-01-01', 500, 1, 3),
      tx('TV',   '2026-02-01', 300, 3, 5),
    ];
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: txs,
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.total, 1100);
    assert.strictEqual(r.porMes[0].valor, 800); // jan: 300+500
    assert.strictEqual(r.porMes[1].valor, 300); // fev: 300
    assert.strictEqual(r.porMes[2].valor, 0);
  });

  test('transação fora do range do porMes entra no total mas não no gráfico', () => {
    const txs = [
      tx('A', '2026-01-01', 100, 1, 2),
      tx('A', '2026-08-01', 100, 2, 2), // ago 2026: além de numMeses=6
    ];
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: txs,
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.total, 200);
    const somaPorMes = r.porMes.reduce((s, m) => s + m.valor, 0);
    assert.strictEqual(somaPorMes, 100); // só jan no gráfico
  });
});

// ── Fixas + cartão combinados ─────────────────────────────────────────────────

describe('fixas + cartão no mesmo mês', () => {
  test('valores somados corretamente no mesmo bucket', () => {
    // mes_inicio=2026-01: parcela 1 = jan, 2 = fev
    const fixo = {
      parcelado: true,
      total_parcelas: 2,
      mes_inicio: '2026-01-01',
      valor_padrao: 100,
      nome: 'Gym',
    };
    const txGym = tx('Curso', '2026-01-01', 50, 1, 2);
    const r = calcularComprometidoFuturo({
      fixosParcelados: [fixo],
      transacoesCartaoFuturas: [txGym],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 3,
    });
    assert.strictEqual(r.porMes[0].valor, 150); // jan: 100 (fixa) + 50 (cartão)
    assert.strictEqual(r.porMes[1].valor, 100); // fev: só fixa (parcela 2)
    assert.strictEqual(r.total, 2 * 100 + 50);  // fixas(200) + cartão(50)
  });
});

// ── maioresParcelas ──────────────────────────────────────────────────────────

describe('maioresParcelas', () => {
  test('retorna parcelas do PRÓXIMO mês ordenadas por valor desc', () => {
    // Mês atual = jan 2026; próximo = fev 2026
    const txs = [
      tx('A', '2026-02-01', 100, 1, 3),
      tx('D', '2026-02-01', 800, 1, 2),
      tx('C', '2026-02-01', 200, 3, 6),
      tx('B', '2026-02-01', 500, 2, 5),
    ];
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: txs,
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.maioresParcelas[0].valor, 800);
    assert.strictEqual(r.maioresParcelas[0].nome, 'D');
    assert.strictEqual(r.maioresParcelas[0].parcela, '1/2');
    assert.strictEqual(r.maioresParcelas[1].valor, 500);
    assert.strictEqual(r.maioresParcelas[1].nome, 'B');
    assert.strictEqual(r.maioresParcelas[2].valor, 200);
    assert.strictEqual(r.maioresParcelas[3].valor, 100);
  });

  test('limita a 5 itens', () => {
    const txs = Array.from({ length: 8 }, (_, i) => ({
      descricao: `Item${i}`,
      mes_fatura: '2026-02-01',
      valor: (i + 1) * 100,
      parcela_atual: 1,
      parcela_total: 2,
    }));
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: txs,
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.maioresParcelas.length, 5);
    assert.strictEqual(r.maioresParcelas[0].valor, 800); // maior dos 8 (8*100)
  });

  test('inclui fixas parceladas do próximo mês', () => {
    // mes_inicio=2026-01: parcela 1=jan, parcela 2=fev (próximo mês)
    const fixo = {
      parcelado: true,
      total_parcelas: 5,
      mes_inicio: '2026-01-01',
      valor_padrao: 600,
      nome: 'Aluguel',
    };
    const txCartao = tx('Notebook', '2026-02-01', 300, 2, 3);
    const r = calcularComprometidoFuturo({
      fixosParcelados: [fixo],
      transacoesCartaoFuturas: [txCartao],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    // próximo mês = fev: fixa(600, 2/5) + cartão(300, 2/3)
    assert.strictEqual(r.maioresParcelas.length, 2);
    assert.strictEqual(r.maioresParcelas[0].valor, 600);
    assert.strictEqual(r.maioresParcelas[0].nome, 'Aluguel');
    assert.strictEqual(r.maioresParcelas[0].parcela, '2/5');
    assert.strictEqual(r.maioresParcelas[1].valor, 300);
    assert.strictEqual(r.maioresParcelas[1].parcela, '2/3');
  });

  test('transações do mês atual não aparecem em maioresParcelas (só próximo)', () => {
    const txAtual    = tx('Agora', '2026-01-01', 999, 1, 2);
    const txProximo  = tx('Depois', '2026-02-01', 100, 2, 2);
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: [txAtual, txProximo],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 6,
    });
    assert.strictEqual(r.maioresParcelas.length, 1);
    assert.strictEqual(r.maioresParcelas[0].nome, 'Depois'); // 999 do mês atual não entra
  });
});

// ── Estrutura de porMes ──────────────────────────────────────────────────────

describe('estrutura de porMes', () => {
  test('retorna exatamente numMeses entradas', () => {
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 4,
    });
    assert.strictEqual(r.porMes.length, 4);
  });

  test('mesRef no formato YYYY-MM e avança corretamente cruzando o ano', () => {
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 11, // dez 2026
      numMeses: 3,
    });
    assert.strictEqual(r.porMes[0].mesRef, '2026-12');
    assert.strictEqual(r.porMes[1].mesRef, '2027-01');
    assert.strictEqual(r.porMes[2].mesRef, '2027-02');
  });

  test('porMes[i] expõe ano e mes corretos', () => {
    const r = calcularComprometidoFuturo({
      fixosParcelados: [],
      transacoesCartaoFuturas: [],
      anoAtual: 2026,
      mesAtual: 0,
      numMeses: 2,
    });
    assert.strictEqual(r.porMes[0].ano, 2026);
    assert.strictEqual(r.porMes[0].mes, 0);
    assert.strictEqual(r.porMes[1].ano, 2026);
    assert.strictEqual(r.porMes[1].mes, 1);
  });
});
