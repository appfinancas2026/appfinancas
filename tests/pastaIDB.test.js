import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// IDB é API de browser — não há store real em Node. Só verificamos que o módulo
// exporta as funções esperadas sem lançar na importação.
import { salvarHandle, lerHandle, removerHandle, suportaPastaImport } from '../lib/pastaIDB.js';

describe('pastaIDB — exports', () => {
  test('salvarHandle é uma função', () => {
    assert.strictEqual(typeof salvarHandle, 'function');
  });

  test('lerHandle é uma função', () => {
    assert.strictEqual(typeof lerHandle, 'function');
  });

  test('removerHandle é uma função', () => {
    assert.strictEqual(typeof removerHandle, 'function');
  });

  test('suportaPastaImport é uma função', () => {
    assert.strictEqual(typeof suportaPastaImport, 'function');
  });

  test('suportaPastaImport retorna false em Node (sem window)', () => {
    // Em Node, window não existe → deve retornar false sem lançar.
    assert.strictEqual(suportaPastaImport(), false);
  });
});
