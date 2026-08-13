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

describe('gerarInsights — blindagem contra pouco histórico', () => {
  test('categoria que só apareceu em 1 mês anterior não vira "alta" (evita falso positivo)', () => {
    const res = gerarInsights({
      transacoesMes: [{ data: '2026-07-05', tipo: 'saida', valor: 500, categoria: 'Delivery' }],
      transacoesHistorico: [
        // Delivery só existe em 1 mês → base insuficiente, mesmo sendo um "salto".
        { data: '2026-06-05', tipo: 'saida', valor: 100, categoria: 'Delivery' },
      ],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 0);
  });

  test('categoria com gasto em 2 meses anteriores já pode disparar', () => {
    const res = gerarInsights({
      // Entrada de 300 mantém o resultado do mês (−200) igual à média histórica,
      // isolando a regra de categoria (senão a regra de resultado também dispara).
      transacoesMes: [
        { data: '2026-07-05', tipo: 'saida', valor: 500, categoria: 'Delivery' },
        { data: '2026-07-01', tipo: 'entrada', valor: 300 },
      ],
      transacoesHistorico: [
        { data: '2026-05-05', tipo: 'saida', valor: 200, categoria: 'Delivery' },
        { data: '2026-06-05', tipo: 'saida', valor: 200, categoria: 'Delivery' },
      ],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'alta');
    assert.match(res[0].texto, /Delivery/);
  });

  test('resultado vs média não dispara com apenas 1 mês de histórico', () => {
    const res = gerarInsights({
      transacoesMes: [{ data: '2026-07-01', tipo: 'entrada', valor: 2000 }],
      transacoesHistorico: [
        { data: '2026-06-01', tipo: 'entrada', valor: 300 },
      ],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual,
    });
    assert.equal(res.length, 0);
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

// Insumos neutros p/ isolar as regras de cartão (nada de estoque/histórico).
const vazio = { transacoesMes: [], transacoesHistorico: [], projecaoFluxo: [], lancamentosFixos: [], dataAtual };

describe('gerarInsights — regra dinheiro parado vs fatura', () => {
  test('dispara sugerindo adiantar, mantendo o colchão de R$300', () => {
    const res = gerarInsights({ ...vazio, saldoEmConta: 1000, cartoes: [{ nome: 'Nubank', faturaAberta: 800 }] });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'oportunidade');
    assert.match(res[0].texto, /1\.000,00/); // saldo
    assert.match(res[0].texto, /800,00/);    // fatura
    assert.match(res[0].texto, /700,00/);    // adiantar = min(1000-300, 800)
    assert.match(res[0].texto, /reserva/);
  });

  test('não zera a conta: saldo 500 e fatura 450 sugere só R$200 (não os 450)', () => {
    const res = gerarInsights({ ...vazio, saldoEmConta: 500, cartoes: [{ nome: 'X', faturaAberta: 450 }] });
    assert.equal(res.length, 1);
    assert.match(res[0].texto, /200,00/); // adiantar = 500-300, não a fatura cheia
  });

  test('BLINDAGEM: adiantamento que zeraria a conta não dispara (saldo = colchão)', () => {
    const res = gerarInsights({ ...vazio, saldoEmConta: 300, cartoes: [{ nome: 'X', faturaAberta: 800 }] });
    assert.equal(res.length, 0);
  });

  test('BLINDAGEM: saldo abaixo do colchão não dispara', () => {
    const res = gerarInsights({ ...vazio, saldoEmConta: 250, cartoes: [{ nome: 'X', faturaAberta: 800 }] });
    assert.equal(res.length, 0);
  });

  test('BLINDAGEM: sem fatura em aberto não dispara', () => {
    const res = gerarInsights({ ...vazio, saldoEmConta: 5000, cartoes: [{ nome: 'X', faturaAberta: 0 }] });
    assert.equal(res.length, 0);
  });
});

describe('gerarInsights — regra fatura acima da média', () => {
  test('dispara quando a fatura atual está ≥30% acima da média', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'Nubank', faturaAtual: 1400, historicoFaturas: [1000, 1000] }] });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'alta');
    assert.match(res[0].texto, /Nubank/);
    assert.match(res[0].texto, /40%/);
  });

  test('BLINDAGEM: histórico insuficiente (só 1 mês) não dispara', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'Nubank', faturaAtual: 1400, historicoFaturas: [1000] }] });
    assert.equal(res.length, 0);
  });

  test('BLINDAGEM: média zero não dispara (não divide por zero)', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'Nubank', faturaAtual: 1400, historicoFaturas: [0, 0] }] });
    assert.equal(res.length, 0);
  });

  test('abaixo de 30% acima da média não dispara', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'Nubank', faturaAtual: 1200, historicoFaturas: [1000, 1000] }] });
    assert.equal(res.length, 0);
  });
});

describe('gerarInsights — regra limite comprometido', () => {
  test('dispara quando uso do limite ≥80%', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'Itaú', faturaAberta: 850, faturaFechadaNaoPaga: 0, limite: 1000 }] });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'risco');
    assert.match(res[0].texto, /Itaú/);
    assert.match(res[0].texto, /85%/);
    assert.match(res[0].texto, /850,00/);
    assert.match(res[0].texto, /1\.000,00/);
  });

  test('uso soma fatura aberta + fechada não paga', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'X', faturaAberta: 500, faturaFechadaNaoPaga: 400, limite: 1000 }] });
    assert.equal(res.length, 1);
    assert.match(res[0].texto, /90%/); // (500+400)/1000
  });

  test('BLINDAGEM: limite nulo não dispara (não calcula percentual)', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'X', faturaAberta: 900, faturaFechadaNaoPaga: 0, limite: null }] });
    assert.equal(res.length, 0);
  });

  test('BLINDAGEM: limite zero não dispara', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'X', faturaAberta: 900, faturaFechadaNaoPaga: 0, limite: 0 }] });
    assert.equal(res.length, 0);
  });

  test('abaixo de 80% não dispara', () => {
    const res = gerarInsights({ ...vazio, cartoes: [{ nome: 'X', faturaAberta: 700, faturaFechadaNaoPaga: 0, limite: 1000 }] });
    assert.equal(res.length, 0);
  });
});

describe('gerarInsights — regras de dívidas', () => {
  test('divida_comprometimento: dispara quando parcelas >= 30% da renda', () => {
    const res = gerarInsights({
      ...vazio,
      transacoesMes: [{ data: '2026-07-01', tipo: 'entrada', valor: 1000 }],
      dividas: [
        { status: 'ativa', parcela_valor: 400 },
        { status: 'ativa', parcela_valor: 100 },
      ],
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].destino, 'dividas');
    assert.equal(res[0].tipo, 'risco');
    assert.match(res[0].texto, /50%/); // 500/1000
    assert.match(res[0].texto, /500,00/);
  });

  test('BLINDAGEM divida_comprometimento: abaixo de 30% não dispara', () => {
    const res = gerarInsights({
      ...vazio,
      transacoesMes: [{ data: '2026-07-01', tipo: 'entrada', valor: 1000 }],
      dividas: [{ status: 'ativa', parcela_valor: 200 }],
    });
    assert.equal(res.length, 0); // 200/1000 = 20% < 30%
  });

  test('BLINDAGEM divida_comprometimento: sem entradas não dispara', () => {
    const res = gerarInsights({
      ...vazio,
      dividas: [{ status: 'ativa', parcela_valor: 500 }],
    });
    assert.equal(res.length, 0);
  });

  test('BLINDAGEM divida_comprometimento: dividas null não dispara', () => {
    const res = gerarInsights({ ...vazio, transacoesMes: [{ data: '2026-07-01', tipo: 'entrada', valor: 1000 }], dividas: null });
    assert.equal(res.length, 0);
  });

  test('divida_juros_cara: dispara para a dívida com taxa >= 3%', () => {
    const res = gerarInsights({
      ...vazio,
      dividas: [
        { status: 'ativa', nome: 'Crédito Pessoal', taxa_juros_mensal: '3.5', parcela_valor: '500', valor_atual: '5000' },
      ],
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].destino, 'dividas');
    assert.equal(res[0].tipo, 'risco');
    assert.match(res[0].texto, /Crédito Pessoal/);
    assert.match(res[0].texto, /3\.5%/);
  });

  test('divida_juros_cara: escolhe a mais cara entre várias', () => {
    const res = gerarInsights({
      ...vazio,
      dividas: [
        { status: 'ativa', nome: 'Barata', taxa_juros_mensal: '3', parcela_valor: '200', valor_atual: '2000' },
        { status: 'ativa', nome: 'Cara', taxa_juros_mensal: '5', parcela_valor: '300', valor_atual: '3000' },
      ],
    });
    assert.equal(res.length, 1);
    assert.match(res[0].texto, /Cara/);
    assert.match(res[0].texto, /5%/);
  });

  test('BLINDAGEM divida_juros_cara: taxa abaixo de 3% não dispara', () => {
    const res = gerarInsights({
      ...vazio,
      dividas: [{ status: 'ativa', nome: 'Financiamento', taxa_juros_mensal: '1.5', parcela_valor: '300', valor_atual: '3000' }],
    });
    assert.equal(res.length, 0);
  });

  test('BLINDAGEM divida_juros_cara: dividas null não dispara', () => {
    const res = gerarInsights({ ...vazio, dividas: null });
    assert.equal(res.length, 0);
  });

  test('dividas_quitadas: dispara quando >= 30% das dívidas foram quitadas', () => {
    const res = gerarInsights({
      ...vazio,
      dividas: [
        { status: 'quitada' },
        { status: 'quitada' },
        { status: 'ativa' },
        { status: 'ativa' },
      ],
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'oportunidade');
    assert.equal(res[0].destino, 'dividas');
    assert.match(res[0].texto, /2 de 4/);
    assert.match(res[0].texto, /50%/);
  });

  test('BLINDAGEM dividas_quitadas: menos de 30% não dispara', () => {
    const res = gerarInsights({
      ...vazio,
      dividas: [
        { status: 'quitada' },
        { status: 'ativa' },
        { status: 'ativa' },
        { status: 'ativa' },
      ],
    });
    assert.equal(res.length, 0); // 1/4 = 25% < 30%
  });

  test('BLINDAGEM dividas_quitadas: nenhuma quitada não dispara', () => {
    const res = gerarInsights({
      ...vazio,
      dividas: [{ status: 'ativa' }, { status: 'ativa' }],
    });
    assert.equal(res.length, 0);
  });

  test('BLINDAGEM dividas_quitadas: array vazio não dispara', () => {
    const res = gerarInsights({ ...vazio, dividas: [] });
    assert.equal(res.length, 0);
  });
});

describe('gerarInsights — bucketing cartão por mes_fatura (competência)', () => {
  test('compra de cartão com data em nov e mes_fatura em dez é bucketizada em dez', () => {
    // Nov: conta regular Alimentação 300 (data='2025-11-15')
    // Cartão: data='2025-11-28', mas pertence a dez (mes_fatura='2025-12-01')
    // Com bucketing correto: nov={Alimentação:300}, dez={Alimentação:600} → 2 meses → avg=450
    // Com bucketing errado (t.data): nov={Alimentação:900}, dez={} → 1 mês (< MIN=2) → sem insight
    // Mês atual: Alimentação 900 → 900 vs avg 450 = +100% → deve disparar "categoria em alta".
    const res = gerarInsights({
      transacoesMes: [
        { data: '2025-12-01', tipo: 'entrada', valor: '10000', transferencia_id: null },
        { data: '2025-12-15', tipo: 'saida', valor: '900', categoria: 'Alimentação', transferencia_id: null },
      ],
      transacoesHistorico: [
        { data: '2025-11-01', tipo: 'entrada', valor: '10000', transferencia_id: null },
        { data: '2025-11-15', tipo: 'saida', valor: '300', categoria: 'Alimentação', transferencia_id: null },
        // Cartão: data em novembro, fatura em dezembro — deve ser bucketizado em dezembro
        { data: '2025-11-28', mes_fatura: '2025-12-01', cartao_id: 'c1', tipo: 'saida', valor: '600',
          categoria: 'Alimentação', transferencia_id: null, origem: 'compra' },
        { data: '2025-12-01', tipo: 'entrada', valor: '10000', transferencia_id: null },
      ],
      projecaoFluxo: [],
      lancamentosFixos: [],
      dataAtual: { ano: 2025, mes: 11 }, // dezembro (mes 0-indexed)
    });
    assert.equal(res.length, 1);
    assert.equal(res[0].tipo, 'alta');
    assert.match(res[0].texto, /Alimentação/);
  });
});
