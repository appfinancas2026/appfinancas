import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { derivarParametrosCompetencia } from '../lib/buscaRelatorios.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Período de 3 meses dentro do mesmo ano
const INI_3M  = '2026-01-01';
const FIM_3M  = '2026-03-31';

// Período cruzando virada de ano (nov/2025 → jan/2026)
const INI_VIRADA = '2025-11-01';
const FIM_VIRADA = '2026-01-31';

// ── mesesFatura derivados corretamente ───────────────────────────────────────

describe('derivarParametrosCompetencia — mesesFatura', () => {
  test('3 meses no mesmo ano', () => {
    const { mesesFatura } = derivarParametrosCompetencia(INI_3M, FIM_3M);
    assert.deepEqual(mesesFatura, ['2026-01-01', '2026-02-01', '2026-03-01']);
  });

  test('cruzando virada de ano', () => {
    const { mesesFatura } = derivarParametrosCompetencia(INI_VIRADA, FIM_VIRADA);
    assert.deepEqual(mesesFatura, ['2025-11-01', '2025-12-01', '2026-01-01']);
  });

  test('mesmo mês retorna 1 elemento', () => {
    const { mesesFatura } = derivarParametrosCompetencia('2026-06-01', '2026-06-30');
    assert.deepEqual(mesesFatura, ['2026-06-01']);
  });

  test('intervalo de 1 dia dentro de um mês', () => {
    const { mesesFatura } = derivarParametrosCompetencia('2026-04-15', '2026-04-15');
    assert.deepEqual(mesesFatura, ['2026-04-01']);
  });

  test('ano inteiro retorna 12 meses', () => {
    const { mesesFatura } = derivarParametrosCompetencia('2026-01-01', '2026-12-31');
    assert.equal(mesesFatura.length, 12);
    assert.equal(mesesFatura[0], '2026-01-01');
    assert.equal(mesesFatura[11], '2026-12-01');
  });
});

// ── incluirCartao e filtroContaId ─────────────────────────────────────────────

describe('derivarParametrosCompetencia — incluirCartao', () => {
  test('sem filtroContaId: incluirCartao = true', () => {
    const { incluirCartao } = derivarParametrosCompetencia(INI_3M, FIM_3M);
    assert.equal(incluirCartao, true);
  });

  test('com filtroContaId: incluirCartao = false', () => {
    const { incluirCartao, filtroContaId } = derivarParametrosCompetencia(
      INI_3M, FIM_3M,
      { filtroContaId: 'uuid-conta-1' },
    );
    assert.equal(incluirCartao, false);
    assert.equal(filtroContaId, 'uuid-conta-1');
  });

  test('filtroContaId vazio equivale a ausente', () => {
    const { incluirCartao, filtroContaId } = derivarParametrosCompetencia(
      INI_3M, FIM_3M,
      { filtroContaId: '' },
    );
    assert.equal(incluirCartao, true);
    assert.equal(filtroContaId, null);
  });
});

// ── filtrosComuns propagados corretamente ─────────────────────────────────────

describe('derivarParametrosCompetencia — filtrosComuns', () => {
  test('sem filtros: todos null', () => {
    const { filtrosComuns } = derivarParametrosCompetencia(INI_3M, FIM_3M);
    assert.deepEqual(filtrosComuns, { tipo: null, categoria: null, essencialidade: null });
  });

  test('filtroTipo propagado', () => {
    const { filtrosComuns } = derivarParametrosCompetencia(INI_3M, FIM_3M, { filtroTipo: 'saida' });
    assert.equal(filtrosComuns.tipo, 'saida');
    assert.equal(filtrosComuns.categoria, null);
    assert.equal(filtrosComuns.essencialidade, null);
  });

  test('filtroCategoria propagado', () => {
    const { filtrosComuns } = derivarParametrosCompetencia(INI_3M, FIM_3M, { filtroCategoria: 'Alimentação' });
    assert.equal(filtrosComuns.categoria, 'Alimentação');
    assert.equal(filtrosComuns.tipo, null);
  });

  test('filtroEssencialidade propagado', () => {
    const { filtrosComuns } = derivarParametrosCompetencia(INI_3M, FIM_3M, { filtroEssencialidade: 'essencial' });
    assert.equal(filtrosComuns.essencialidade, 'essencial');
  });

  test('todos os filtros juntos', () => {
    const { filtrosComuns, filtroContaId, incluirCartao } = derivarParametrosCompetencia(
      INI_3M, FIM_3M,
      { filtroTipo: 'saida', filtroCategoria: 'Saúde', filtroEssencialidade: 'essencial', filtroContaId: 'id-abc' },
    );
    assert.deepEqual(filtrosComuns, { tipo: 'saida', categoria: 'Saúde', essencialidade: 'essencial' });
    assert.equal(filtroContaId, 'id-abc');
    assert.equal(incluirCartao, false);
  });

  test('filtro com string vazia vira null', () => {
    const { filtrosComuns } = derivarParametrosCompetencia(
      INI_3M, FIM_3M,
      { filtroTipo: '', filtroCategoria: '', filtroEssencialidade: '' },
    );
    assert.deepEqual(filtrosComuns, { tipo: null, categoria: null, essencialidade: null });
  });
});

// ── chamada sem argumentos de filtro (defaults) ───────────────────────────────

describe('derivarParametrosCompetencia — defaults', () => {
  test('omitir o terceiro argumento usa defaults', () => {
    const r = derivarParametrosCompetencia('2026-05-01', '2026-05-31');
    assert.deepEqual(r.filtrosComuns, { tipo: null, categoria: null, essencialidade: null });
    assert.equal(r.filtroContaId, null);
    assert.equal(r.incluirCartao, true);
    assert.deepEqual(r.mesesFatura, ['2026-05-01']);
  });
});
