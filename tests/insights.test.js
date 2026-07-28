import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { gerarInsights, projetarSaldoDiario } from '../lib/insights.js';

const dataAtual = { ano: 2026, mes: 6 }; // julho (0-indexed)

// Cada teste isola uma regra deixando os outros insumos vazios/neutros.

describe('projetarSaldoDiario', () => {
  test('devolve um registro por dia e desconta o fixo no dia do vencimento', () => {
    const out = projetarSaldoDiario({
      saldoInicial: 1000,
      lancamentosFixos: [{ tipo: 'saida', valor_padrao: 100, dia_referencia: 3, parcelado: false }],
      dias: 5,
      hoje: '2026-07-01',
    });
    assert.equal(out.length, 5);
    assert.equal(out[0].data, '2026-07-02');
    assert.equal(out[0].saldo, 1000);       // dia sem vencimento
    assert.equal(out[1].data, '2026-07-03');
    assert.equal(out[1].saldo, 900);        // vence o fixo de 100
    assert.equal(out[1].saidas, 100);
    assert.equal(out[4].saldo, 900);        // segue estável depois
  });

  test('desconta a média diária de variáveis todo dia', () => {
    const out = projetarSaldoDiario({ saldoInicial: 100, lancamentosFixos: [], dias: 3, mediaDiariaVariavel: 10, hoje: '2026-07-01' });
    assert.equal(out[0].saldo, 90);
    assert.equal(out[2].saldo, 70);
  });
});

describe('gerarInsights — regras isoladas', () => {
  test('1) categoria em alta: dispara com valor e % acima da média', () => {
    const res = gerarInsights({
      transacoesMes: [
        { data: '2026-07-05', tipo: 'saida', valor: 420, categoria: 'Delivery' },
        { data: '2026-07-01', tipo: 'entrada', valor: 1000 },
      ],
      transacoesHistorico: [
        { data: '2026-04-05', tipo: 'saida', valor: 200, categoria: 'Delivery' },
        { data: '2026-04-01', tipo: 'entrada', valor: 1000 },
        { data: '2026-05-05', tipo: 'saida', valor: 300, categoria: 'Delivery' },
        { data: '2026-05-01', tipo: 'entrada', valor: 1000 },
        { data: '2026-06-05', tipo: 'saida', valor: 265, categoria: 'Delivery' },
        { data: '2026-06-01', tipo: 'entrada', valor: 1000 },
      ],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'alta');
    assert.match(res[0].texto, /Delivery/);
    assert.match(res[0].texto, /65%/); // (420-255)/255 = 64.7% -> 65
  });

  test('1b) categoria sem histórico não vira "alta"', () => {
    const res = gerarInsights({
      transacoesMes: [{ data: '2026-07-05', tipo: 'saida', valor: 500, categoria: 'Nova' }],
      transacoesHistorico: [],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 0);
  });

  test('2) resultado acima da média vira oportunidade (verde)', () => {
    const res = gerarInsights({
      transacoesMes: [{ data: '2026-07-01', tipo: 'entrada', valor: 2000 }],
      transacoesHistorico: [
        { data: '2026-04-01', tipo: 'entrada', valor: 500 },
        { data: '2026-05-01', tipo: 'entrada', valor: 500 },
        { data: '2026-06-01', tipo: 'entrada', valor: 500 },
      ],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'oportunidade');
  });

  test('2b) resultado abaixo da média vira risco (vermelho)', () => {
    const res = gerarInsights({
      transacoesMes: [{ data: '2026-07-01', tipo: 'entrada', valor: 100 }],
      transacoesHistorico: [
        { data: '2026-04-01', tipo: 'entrada', valor: 1000 },
        { data: '2026-05-01', tipo: 'entrada', valor: 1000 },
        { data: '2026-06-01', tipo: 'entrada', valor: 1000 },
      ],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'risco');
  });

  test('3) supérfluos acima de 30% dos não-essenciais', () => {
    const res = gerarInsights({
      transacoesMes: [
        { data: '2026-07-02', tipo: 'saida', valor: 400, categoria: 'Bar', essencialidade: 'superfluo' },
        { data: '2026-07-03', tipo: 'saida', valor: 200, categoria: 'Cinema', essencialidade: 'desejavel' },
      ],
      transacoesHistorico: [],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'alta');
    assert.match(res[0].texto, /67%/); // 400/600
  });

  test('3b) supérfluos abaixo do limiar não dispara', () => {
    const res = gerarInsights({
      transacoesMes: [
        { data: '2026-07-02', tipo: 'saida', valor: 100, categoria: 'Bar', essencialidade: 'superfluo' },
        { data: '2026-07-03', tipo: 'saida', valor: 400, categoria: 'Cinema', essencialidade: 'desejavel' },
      ],
      transacoesHistorico: [],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 0); // 100/500 = 20% < 30%
  });

  test('4) saldo projetado negativo: score alto e tipo risco', () => {
    const res = gerarInsights({
      transacoesMes: [],
      transacoesHistorico: [],
      projecaoFluxo: [
        { data: '2026-07-09', saldo: 50 },
        { data: '2026-07-10', saldo: -120 },
        { data: '2026-07-11', saldo: -300 },
      ],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'risco');
    assert.equal(res[0].score, 100);
    assert.match(res[0].texto, /10\/07/); // reporta a primeira data negativa
  });

  test('5) concentração de vencimentos: >=3 contas em janela de 5 dias', () => {
    const res = gerarInsights({
      transacoesMes: [],
      transacoesHistorico: [],
      projecaoFluxo: [],
      lancamentosFixos: [
        { tipo: 'saida', valor_padrao: 500, dia_referencia: 10, parcelado: false },
        { tipo: 'saida', valor_padrao: 300, dia_referencia: 12, parcelado: false },
        { tipo: 'saida', valor_padrao: 200, dia_referencia: 14, parcelado: false },
        { tipo: 'saida', valor_padrao: 90, dia_referencia: 28, parcelado: false },
      ],
      dataAtual,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'alta');
    assert.match(res[0].texto, /3 contas fixas/);
    assert.match(res[0].texto, /1\.000,00/); // 500+300+200
  });
});

describe('gerarInsights — orquestração', () => {
  test('retorna no máximo 3, ordenados por score decrescente', () => {
    const res = gerarInsights({
      transacoesMes: [
        { data: '2026-07-05', tipo: 'saida', valor: 420, categoria: 'Delivery', essencialidade: 'superfluo' },
        { data: '2026-07-06', tipo: 'saida', valor: 100, categoria: 'Bar', essencialidade: 'desejavel' },
        { data: '2026-07-01', tipo: 'entrada', valor: 3000 },
      ],
      transacoesHistorico: [
        { data: '2026-04-05', tipo: 'saida', valor: 200, categoria: 'Delivery' },
        { data: '2026-05-05', tipo: 'saida', valor: 300, categoria: 'Delivery' },
        { data: '2026-06-05', tipo: 'saida', valor: 265, categoria: 'Delivery' },
      ],
      projecaoFluxo: [{ data: '2026-07-10', saldo: -240 }],
      lancamentosFixos: [
        { tipo: 'saida', valor_padrao: 500, dia_referencia: 10, parcelado: false },
        { tipo: 'saida', valor_padrao: 300, dia_referencia: 12, parcelado: false },
        { tipo: 'saida', valor_padrao: 200, dia_referencia: 14, parcelado: false },
      ],
      dataAtual,
    });
    assert.equal(res.length, 3);
    assert.ok(res.every((x, i) => i === 0 || res[i - 1].score >= x.score));
    assert.equal(res[0].score, 100); // saldo negativo no topo
  });

  test('sem dados relevantes retorna array vazio', () => {
    const res = gerarInsights({ transacoesMes: [], transacoesHistorico: [], projecaoFluxo: [], lancamentosFixos: [], dataAtual });
    assert.deepEqual(res, []);
  });
});
