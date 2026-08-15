import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizarDescricao, semAcento } from '../lib/financeiro.js';
import { sugerirCategoriaPorHistorico, sugerirCategoriasEmLote } from '../lib/categorizacao.js';

// ── normalizarDescricao ───────────────────────────────────────────────────────

describe('normalizarDescricao', () => {
  test('converte para lowercase', () => {
    assert.equal(normalizarDescricao('POSTO SHELL'), 'posto shell');
  });

  test('remove acentos', () => {
    assert.equal(normalizarDescricao('Alimentação'), 'alimentacao');
  });

  test('remove dígitos', () => {
    assert.equal(normalizarDescricao('POSTO SHELL 123'), 'posto shell');
  });

  test('remove caracteres especiais e barras', () => {
    assert.equal(normalizarDescricao('POSTO SHELL 123 AV/BR'), 'posto shell av br');
  });

  test('colapsa espaços múltiplos', () => {
    assert.equal(normalizarDescricao('  iFood   Delivery  '), 'ifood delivery');
  });

  test('string vazia retorna string vazia', () => {
    assert.equal(normalizarDescricao(''), '');
  });

  test('null retorna string vazia', () => {
    assert.equal(normalizarDescricao(null), '');
  });

  test('semAcento exportada funciona', () => {
    assert.equal(semAcento('Histórico'), 'Historico');
  });
});

// ── sugerirCategoriaPorHistorico — camada 1: exato ───────────────────────────

describe('sugerirCategoriaPorHistorico — exato', () => {
  test('match exato: iFood no histórico como Alimentação → sugere Alimentação com confiança alta', () => {
    const historico = [
      { descricao: 'iFood', categoria: 'Alimentação', essencialidade: 'essencial' },
      { descricao: 'Uber', categoria: 'Transporte', essencialidade: null },
    ];
    const result = sugerirCategoriaPorHistorico('iFood', historico);
    assert.equal(result.categoria, 'Alimentação');
    assert.equal(result.confianca, 'alta');
    assert.equal(result.origem, 'historico');
    assert.equal(result.essencialidade, 'essencial');
  });

  test('normalização aplicada: case/acento/número não impedem o match exato', () => {
    const historico = [
      { descricao: 'farmácia são joão', categoria: 'Farmácia', essencialidade: null },
    ];
    const result = sugerirCategoriaPorHistorico('FARMACIA SAO JOAO 01', historico);
    assert.notEqual(result, null);
    assert.equal(result.categoria, 'Farmácia');
    assert.equal(result.confianca, 'alta');
  });

  test('histórico vazio retorna null', () => {
    assert.equal(sugerirCategoriaPorHistorico('iFood', []), null);
  });

  test('descrição vazia retorna null', () => {
    const historico = [{ descricao: 'iFood', categoria: 'Alimentação' }];
    assert.equal(sugerirCategoriaPorHistorico('', historico), null);
  });
});

// ── camada 2: substring forte ─────────────────────────────────────────────────

describe('sugerirCategoriaPorHistorico — substring forte', () => {
  test('nova descrição contém entrada do histórico → confiança alta', () => {
    const historico = [
      { descricao: 'uber', categoria: 'Transporte' },
    ];
    const result = sugerirCategoriaPorHistorico('uber trip 8829 sao paulo', historico);
    assert.notEqual(result, null);
    assert.equal(result.categoria, 'Transporte');
    assert.equal(result.confianca, 'alta');
  });

  test('substring funciona com entrada mais longa que a nova descrição', () => {
    const historico = [
      { descricao: 'ifood delivery sao paulo', categoria: 'Alimentação' },
    ];
    // "ifood delivery" está contida em "ifood delivery sao paulo"
    const result = sugerirCategoriaPorHistorico('ifood delivery', historico);
    assert.notEqual(result, null);
    assert.equal(result.categoria, 'Alimentação');
    assert.equal(result.confianca, 'alta');
  });

  test('substring com menos de 4 chars não qualifica (evita ruído)', () => {
    const historico = [
      { descricao: 'ok', categoria: 'Outros' }, // 2 chars — abaixo do mínimo
    ];
    const result = sugerirCategoriaPorHistorico('ok pay', historico);
    assert.equal(result, null);
  });
});

// ── camada 3: multi-token e token distintivo ──────────────────────────────────

describe('sugerirCategoriaPorHistorico — multi-token', () => {
  test('dois tokens em comum qualificam → confiança media', () => {
    const historico = [
      { descricao: 'posto shell centro', categoria: 'Combustível', essencialidade: 'essencial' },
    ];
    const result = sugerirCategoriaPorHistorico('posto shell avenida', historico);
    assert.notEqual(result, null);
    assert.equal(result.categoria, 'Combustível');
    assert.equal(result.confianca, 'media');
  });

  test('token distintivo único (longo, 1 categoria): ifood → Alimentação', () => {
    const historico = [
      // Entradas mais longas que "ifood xyz": a substring não bate, mas o token "ifood" bate.
      { descricao: 'ifood pizza margherita grande', categoria: 'Alimentação' },
      { descricao: 'ifood hamburguer artesanal', categoria: 'Alimentação' },
    ];
    // "ifood" tem 5 chars e aparece só em Alimentação → distintivo → media
    const result = sugerirCategoriaPorHistorico('ifood almoco', historico);
    assert.notEqual(result, null);
    assert.equal(result.categoria, 'Alimentação');
    assert.equal(result.confianca, 'media');
  });

  test('token distintivo único (5 chars, ≤ 2 cats): posto em 1 categoria → qualifica', () => {
    const historico = [
      { descricao: 'POSTO SHELL', categoria: 'Combustível', essencialidade: 'essencial' },
    ];
    // "posto" tem 5 chars e aparece só em Combustível → distintivo
    const result = sugerirCategoriaPorHistorico('posto ipiranga centro', historico);
    assert.notEqual(result, null);
    assert.equal(result.categoria, 'Combustível');
    assert.equal(result.confianca, 'media');
  });

  test('token não-distintivo (aparece em 3 categorias distintas) → não qualifica sozinho → null', () => {
    const historico = [
      { descricao: 'viagem hotel', categoria: 'Viagem' },
      { descricao: 'viagem passagem', categoria: 'Transporte' },
      { descricao: 'viagem seguro', categoria: 'Saúde' },
    ];
    // "viagem" tem 6 chars mas aparece em 3 categorias (> MAX_CATS_DISTINTIVO=2)
    // e é o único token em comum → não qualifica
    const result = sugerirCategoriaPorHistorico('viagem promo', historico);
    assert.equal(result, null);
  });
});

// ── falsos positivos eliminados ───────────────────────────────────────────────

describe('sugerirCategoriaPorHistorico — falsos positivos', () => {
  test('token curto compartilhado não basta: "pao" em "PADARIA PAO QUENTE" vs "PAO DE ACUCAR"→Mercado → null', () => {
    const historico = [
      { descricao: 'PAO DE ACUCAR', categoria: 'Mercado' },
    ];
    // "pao" tem 3 chars < MIN_TOKEN_DISTINTIVO=5 → não é distintivo
    // só 1 token em comum → não qualifica → null
    const result = sugerirCategoriaPorHistorico('PADARIA PAO QUENTE', historico);
    assert.equal(result, null);
  });

  test('"CASA DO CONSTRUTOR" vs "CASAS BAHIA"→Lojas: nenhum token em comum → null', () => {
    const historico = [
      { descricao: 'CASAS BAHIA', categoria: 'Lojas' },
    ];
    // "casa" ≠ "casas" como tokens — nenhum token igual → null
    const result = sugerirCategoriaPorHistorico('CASA DO CONSTRUTOR', historico);
    assert.equal(result, null);
  });

  test('único token curto (3 chars) não qualifica mesmo com ≤ 2 categorias', () => {
    const historico = [
      { descricao: 'bar do ze', categoria: 'Alimentação' },
    ];
    // "bar" tem 3 chars < 5 → não é distintivo; só 1 token em comum → null
    const result = sugerirCategoriaPorHistorico('bar restaurante centro', historico);
    assert.equal(result, null);
  });
});

// ── moda e essencialidade ─────────────────────────────────────────────────────

describe('sugerirCategoriaPorHistorico — moda e essencialidade', () => {
  test('moda: histórico tem "uber" 3× Transporte e 1× Outros → sugere Transporte', () => {
    const historico = [
      { descricao: 'uber', categoria: 'Transporte' },
      { descricao: 'uber corrida', categoria: 'Transporte' },
      { descricao: 'uber app', categoria: 'Transporte' },
      { descricao: 'uber taxa', categoria: 'Outros' },
    ];
    const result = sugerirCategoriaPorHistorico('uber viagem', historico);
    assert.equal(result.categoria, 'Transporte');
  });

  test('essencialidade mais frequente da categoria vencedora é retornada', () => {
    const historico = [
      { descricao: 'mercado extra compras', categoria: 'Mercado', essencialidade: 'essencial' },
      { descricao: 'mercado central compras', categoria: 'Mercado', essencialidade: 'essencial' },
      { descricao: 'farmacia central compras', categoria: 'Farmácia', essencialidade: 'essencial' },
    ];
    // "mercado compras" tem 2 tokens em comum com as 2 primeiras entradas → multi-token
    const result = sugerirCategoriaPorHistorico('mercado municipal compras', historico);
    assert.equal(result.categoria, 'Mercado');
    assert.equal(result.essencialidade, 'essencial');
  });

  test('sem match → retorna null', () => {
    const historico = [
      { descricao: 'iFood Delivery', categoria: 'Alimentação' },
    ];
    const result = sugerirCategoriaPorHistorico('academia fitness', historico);
    assert.equal(result, null);
  });
});

// ── sugerirCategoriasEmLote ───────────────────────────────────────────────────

describe('sugerirCategoriasEmLote', () => {
  test('retorna array com sugestões e nulls, preservando ordem', () => {
    const historico = [
      { descricao: 'iFood', categoria: 'Alimentação' },
      { descricao: 'uber', categoria: 'Transporte' },
    ];
    // "ifood entrega" contém "ifood" → substring alta
    // "uber app" contém "uber" → substring alta
    // "netflix" → sem match → null
    const result = sugerirCategoriasEmLote(['ifood entrega', 'netflix', 'uber app'], historico);
    assert.equal(result.length, 3);
    assert.equal(result[0].descricao, 'ifood entrega');
    assert.equal(result[0].sugestao?.categoria, 'Alimentação');
    assert.equal(result[1].sugestao, null);
    assert.equal(result[2].sugestao?.categoria, 'Transporte');
  });
});
