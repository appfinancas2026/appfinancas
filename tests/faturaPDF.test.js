import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extrairLinhasTransacaoFatura } from '../lib/faturaPDF.js';

const TRANSACOES = [
  '08/08 AMAZONMKTPLC*EFINDUSTR SAO PAULO BRA 48,27',
  '10/08 PAGAMENTO RECEBIDO - OBRIGADO 11,87-',
  '15/08 POSTO IPIRANGA COMBUSTIVEL 180,00',
];

const RUIDO = [
  'Juros do parcelamento: 10,70% a.m. 238,67% a.a.',
  'Valor total a pagar: R$ 155,04',
  'Código de barras: 1234.5678 9012.3456',
  'CET: 14,20% a.m.',
  '',
  'FATURA DE CARTÃO DE CRÉDITO',
];

describe('extrairLinhasTransacaoFatura — filtro', () => {
  test('mantém apenas linhas de transação (DD/MM + valor)', () => {
    const texto = [...RUIDO, ...TRANSACOES, ...RUIDO].join('\n');
    const { texto: filtrado, encontradas } = extrairLinhasTransacaoFatura(texto);
    assert.strictEqual(encontradas, 3);
    const linhas = filtrado.split('\n');
    assert.strictEqual(linhas.length, 3);
  });

  test('linha de compra comum é mantida', () => {
    const texto = RUIDO.join('\n') + '\n' + '08/08 AMAZONMKTPLC*EFINDUSTR SAO PAULO BRA 48,27';
    const { texto: filtrado, encontradas } = extrairLinhasTransacaoFatura(texto);
    assert.strictEqual(encontradas, 1);
    assert.ok(filtrado.includes('AMAZONMKTPLC'));
  });

  test('linha de crédito com hífen no fim é mantida', () => {
    const texto = '10/08 PAGAMENTO RECEBIDO - OBRIGADO 11,87-';
    const { encontradas } = extrairLinhasTransacaoFatura(texto);
    assert.strictEqual(encontradas, 1);
  });

  test('linha de juros de parcelamento é removida', () => {
    const texto = 'Juros do parcelamento: 10,70% a.m. 238,67% a.a.\n08/08 COMPRA NORMAL 50,00';
    const { texto: filtrado, encontradas } = extrairLinhasTransacaoFatura(texto);
    assert.strictEqual(encontradas, 1);
    assert.ok(!filtrado.includes('Juros'));
  });

  test('linha "Valor total a pagar" é removida', () => {
    const texto = 'Valor total a pagar: R$ 155,04\n12/08 MERCADO LIVRE 99,90';
    const { texto: filtrado } = extrairLinhasTransacaoFatura(texto);
    assert.ok(!filtrado.includes('Valor total'));
    assert.ok(filtrado.includes('MERCADO LIVRE'));
  });
});

describe('extrairLinhasTransacaoFatura — fallback', () => {
  test('nenhuma linha de transação → retorna texto original + encontradas:0', () => {
    const original = RUIDO.join('\n');
    const { texto, encontradas } = extrairLinhasTransacaoFatura(original);
    assert.strictEqual(encontradas, 0);
    assert.strictEqual(texto, original);
  });

  test('string vazia → fallback com encontradas:0', () => {
    const { texto, encontradas } = extrairLinhasTransacaoFatura('');
    assert.strictEqual(encontradas, 0);
    assert.strictEqual(texto, '');
  });
});

describe('extrairLinhasTransacaoFatura — formato retornado', () => {
  test('retorna objeto com texto (string) e encontradas (number)', () => {
    const { texto, encontradas } = extrairLinhasTransacaoFatura(TRANSACOES.join('\n'));
    assert.strictEqual(typeof texto, 'string');
    assert.strictEqual(typeof encontradas, 'number');
  });

  test('texto filtrado não contém linhas de ruído', () => {
    const entrada = [...TRANSACOES, ...RUIDO].join('\n');
    const { texto } = extrairLinhasTransacaoFatura(entrada);
    for (const r of RUIDO.filter(Boolean)) {
      assert.ok(!texto.includes(r), `ruído não deve aparecer: "${r}"`);
    }
  });

  test('3 transações reais → texto com 3 linhas', () => {
    const { texto, encontradas } = extrairLinhasTransacaoFatura(TRANSACOES.join('\n'));
    assert.strictEqual(encontradas, 3);
    assert.strictEqual(texto.split('\n').length, 3);
  });
});
