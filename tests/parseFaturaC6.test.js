import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseFaturaC6 } from '../lib/parseFaturaC6.js';

// Fixture: linhas reais do C6 (array de arrays, como o SheetJS entrega)
const LINHA_TITULOS = [
  'Data de compra', 'Nome no cartão', 'Final do Cartão', 'Categoria',
  'Descrição', 'Parcela', 'Valor (em US$)', 'Cotação (em R$)', 'Valor (em R$)',
];

const LINHAS_FIXTURE = [
  LINHA_TITULOS,
  ['06/11/2025', 'RICARDO M BUENO', '4280', 'Departamento / Desconto', 'CASASBAHIACOM',       '9/10',  0, 0,  101.89],
  ['02/08/2026', 'RICARDO M BUENO', '4280', 'Transporte',               'DL*UBERRIDES',        'Única', 0, 0,   10.12],
  ['05/08/2026', 'RICARDO M BUENO', '7206', '-',                         'Pag Fatura Boleto',   'Única', 0, 0, -3942.78],
  ['24/08/2026', 'RICARDO M BUENO', '7206', '-',                         'Estorno Tarifa',      'Única', 0, 0,  -98.00],
  ['25/08/2026', 'CLISIA COUTINHO', '6930', 'Assistência médica',        'CCG FARMACIA E DROGARI', '1/2', 0, 0,  93.40],
];

describe('parseFaturaC6 — básico', () => {
  test('retorna array vazio para entrada vazia', () => {
    assert.deepEqual(parseFaturaC6([]), []);
    assert.deepEqual(parseFaturaC6(null), []);
  });

  test('retorna array vazio se não há linha de títulos', () => {
    assert.deepEqual(parseFaturaC6([['foo', 'bar', 'baz']]), []);
  });

  test('parse geral: 5 transações das linhas fixture', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    assert.strictEqual(result.length, 5);
  });
});

describe('parseFaturaC6 — compra simples à vista', () => {
  test('DL*UBERRIDES: saida, valor 10.12, sem sufixo de parcela', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const uber = result.find((t) => t.descricao === 'DL*UBERRIDES');
    assert.ok(uber, 'transação DL*UBERRIDES deve existir');
    assert.strictEqual(uber.tipo, 'saida');
    assert.strictEqual(uber.valor, 10.12);
    assert.strictEqual(uber.ehCredito, false);
    assert.strictEqual(uber.incluir, true);
    assert.strictEqual(uber.categoria, '');
    assert.strictEqual(uber.categoriaOrigem, null);
    assert.strictEqual(uber.referencia_externa, null);
  });

  test('data DD/MM/AAAA → ISO correto: 02/08/2026 → 2026-08-02', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const uber = result.find((t) => t.descricao === 'DL*UBERRIDES');
    assert.strictEqual(uber.data, '2026-08-02');
  });
});

describe('parseFaturaC6 — compra parcelada', () => {
  test('CASASBAHIACOM 9/10: sufixo na descrição, saida, valor 101.89', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const casa = result.find((t) => t.descricao === 'CASASBAHIACOM (9/10)');
    assert.ok(casa, 'descrição deve ter sufixo (9/10)');
    assert.strictEqual(casa.tipo, 'saida');
    assert.strictEqual(casa.valor, 101.89);
    assert.strictEqual(casa.incluir, true);
  });

  test('CCG FARMACIA 1/2: sufixo na descrição', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const ccg = result.find((t) => t.descricao === 'CCG FARMACIA E DROGARI (1/2)');
    assert.ok(ccg, 'descrição deve ter sufixo (1/2)');
    assert.strictEqual(ccg.data, '2026-08-25');
    assert.strictEqual(ccg.valor, 93.40);
  });

  test('compra à vista (Única) não recebe sufixo', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const uber = result.find((t) => t.descricao === 'DL*UBERRIDES');
    assert.ok(uber);
    assert.ok(!uber.descricao.includes('('), 'à vista não deve ter sufixo de parcela');
  });
});

describe('parseFaturaC6 — créditos e pagamentos', () => {
  test('Estorno Tarifa: ehCredito=true, tipo=entrada, incluir=false', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const estorno = result.find((t) => t.descricao === 'Estorno Tarifa');
    assert.ok(estorno);
    assert.strictEqual(estorno.ehCredito, true);
    assert.strictEqual(estorno.tipo, 'entrada');
    assert.strictEqual(estorno.valor, 98.00);
    assert.strictEqual(estorno.incluir, false);
  });

  test('Pag Fatura Boleto: ehPagamentoFatura=true, incluir=false', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const pag = result.find((t) => t.descricao === 'Pag Fatura Boleto');
    assert.ok(pag);
    assert.strictEqual(pag.ehCredito, true);
    assert.strictEqual(pag.ehPagamentoFatura, true);
    assert.strictEqual(pag.incluir, false);
    assert.strictEqual(pag.valor, 3942.78);
    assert.strictEqual(pag.tipo, 'entrada');
  });

  test('compra normal: ehPagamentoFatura=false', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const uber = result.find((t) => t.descricao === 'DL*UBERRIDES');
    assert.strictEqual(uber.ehPagamentoFatura, false);
  });
});

describe('parseFaturaC6 — detecção dinâmica da linha de títulos', () => {
  test('linha 0 de cabeçalho-nome antes dos títulos: ignora e acha os títulos', () => {
    const comCabecalhoNome = [
      ['Fatura C6 - Novembro 2025', '', '', '', '', '', '', '', ''],
      ...LINHAS_FIXTURE,
    ];
    const result = parseFaturaC6(comCabecalhoNome);
    assert.strictEqual(result.length, 5);
  });

  test('múltiplas linhas antes dos títulos: ainda acha', () => {
    const comExtras = [
      ['Banco C6'],
      [''],
      ['Período: Agosto 2026'],
      ...LINHAS_FIXTURE,
    ];
    const result = parseFaturaC6(comExtras);
    assert.strictEqual(result.length, 5);
  });

  test('linhas vazias entre dados são puladas', () => {
    const comVazias = [
      LINHA_TITULOS,
      ['06/11/2025', 'RICARDO M BUENO', '4280', 'Dept', 'CASASBAHIACOM', '9/10', 0, 0, 101.89],
      [],
      ['02/08/2026', 'RICARDO M BUENO', '4280', 'Transporte', 'DL*UBERRIDES', 'Única', 0, 0, 10.12],
    ];
    const result = parseFaturaC6(comVazias);
    assert.strictEqual(result.length, 2);
  });
});

describe('parseFaturaC6 — formato da transação', () => {
  test('todos os campos obrigatórios presentes', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    const t = result[0];
    assert.ok('data' in t);
    assert.ok('valor' in t);
    assert.ok('tipo' in t);
    assert.ok('descricao' in t);
    assert.ok('referencia_externa' in t);
    assert.ok('ehCredito' in t);
    assert.ok('ehPagamentoFatura' in t);
    assert.ok('incluir' in t);
    assert.ok('categoria' in t);
    assert.ok('categoriaOrigem' in t);
  });

  test('categoria sempre string vazia, categoriaOrigem sempre null', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    result.forEach((t) => {
      assert.strictEqual(t.categoria, '');
      assert.strictEqual(t.categoriaOrigem, null);
    });
  });

  test('referencia_externa sempre null', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    result.forEach((t) => assert.strictEqual(t.referencia_externa, null));
  });

  test('valor sempre positivo (Math.abs)', () => {
    const result = parseFaturaC6(LINHAS_FIXTURE);
    result.forEach((t) => assert.ok(t.valor >= 0, `valor deve ser >= 0, foi ${t.valor}`));
  });
});
