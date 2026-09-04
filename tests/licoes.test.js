import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { LICOES, getLicao } from '../lib/licoes.js';

const CHAVES_ESPERADAS = [
  'saldo_negativo',
  'limite_comprometido',
  'concentracao_vencimentos',
  'resultado_abaixo_media',
  'divida_comprometimento',
  'fatura_acima_media',
  'divida_juros_cara',
  'superfluos_altos',
  'categoria_em_alta',
  'dinheiro_parado_fatura',
  'resultado_acima_media',
  'dividas_quitadas',
];

describe('LICOES — estrutura', () => {
  test('tem exatamente 12 chaves', () => {
    assert.strictEqual(Object.keys(LICOES).length, 12);
  });

  test('contém todas as chaves esperadas', () => {
    for (const chave of CHAVES_ESPERADAS) {
      assert.ok(chave in LICOES, `Chave ausente: ${chave}`);
    }
  });

  test('cada lição tem titulo e texto não-vazios', () => {
    for (const [id, licao] of Object.entries(LICOES)) {
      assert.ok(typeof licao.titulo === 'string' && licao.titulo.length > 0, `titulo vazio em ${id}`);
      assert.ok(typeof licao.texto === 'string' && licao.texto.length > 0, `texto vazio em ${id}`);
    }
  });
});

describe('getLicao', () => {
  test('retorna a lição correta para id existente', () => {
    const l = getLicao('saldo_negativo');
    assert.ok(l !== null);
    assert.strictEqual(l, LICOES.saldo_negativo);
  });

  test('retorna null para id inexistente', () => {
    assert.strictEqual(getLicao('inexistente'), null);
  });

  test('retorna null para id undefined', () => {
    assert.strictEqual(getLicao(undefined), null);
  });
});
