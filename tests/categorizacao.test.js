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

// ── sugerirCategoriaPorHistorico ──────────────────────────────────────────────

describe('sugerirCategoriaPorHistorico', () => {
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

  test('match por token: histórico tem "POSTO SHELL"→Combustível; nova "posto ipiranga centro" casa por token "posto"', () => {
    const historico = [
      { descricao: 'POSTO SHELL', categoria: 'Combustível', essencialidade: 'essencial' },
    ];
    const result = sugerirCategoriaPorHistorico('posto ipiranga centro', historico);
    assert.notEqual(result, null);
    assert.equal(result.categoria, 'Combustível');
    assert.equal(result.confianca, 'media');
  });

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

  test('sem match → retorna null', () => {
    const historico = [
      { descricao: 'iFood Delivery', categoria: 'Alimentação' },
    ];
    const result = sugerirCategoriaPorHistorico('academia fitness', historico);
    assert.equal(result, null);
  });

  test('essencialidade acompanha a categoria vencedora', () => {
    const historico = [
      { descricao: 'mercado extra', categoria: 'Mercado', essencialidade: 'essencial' },
      { descricao: 'mercado pao de acucar', categoria: 'Mercado', essencialidade: 'essencial' },
      { descricao: 'mercado livre compra', categoria: 'Lazer', essencialidade: 'superfluo' },
    ];
    const result = sugerirCategoriaPorHistorico('mercado municipal', historico);
    assert.equal(result.categoria, 'Mercado');
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

// ── sugerirCategoriasEmLote ───────────────────────────────────────────────────

describe('sugerirCategoriasEmLote', () => {
  test('retorna array com sugestões e nulls, preservando ordem', () => {
    const historico = [
      { descricao: 'iFood', categoria: 'Alimentação' },
      { descricao: 'uber', categoria: 'Transporte' },
    ];
    const result = sugerirCategoriasEmLote(['ifood entrega', 'netflix', 'uber app'], historico);
    assert.equal(result.length, 3);
    assert.equal(result[0].descricao, 'ifood entrega');
    assert.equal(result[0].sugestao?.categoria, 'Alimentação');
    assert.equal(result[1].sugestao, null);        // sem match
    assert.equal(result[2].sugestao?.categoria, 'Transporte');
  });
});
