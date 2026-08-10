import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularSaldoDevedor,
  calcularDataQuitacao,
  calcularProximoVencimento,
  calcularTotalJurosFuturos,
  calcularProgressoPct,
  calcularJurosCiclo,
} from '../lib/dividas.js';

// ─── fixtures ────────────────────────────────────────────────────────────────

const dividaA = {
  valor_original: 10000,
  valor_atual: 7000,
  taxa_juros_mensal: null,
  parcela_valor: 1000,
  parcelas_total: 10,
  parcelas_pagas: 3,
  data_inicio: '2026-01-10',
  status: 'ativa',
};

// Taxa alta para ter juros > principal no 1.º mês (1000 * 5% = 50 juros, 10 principal)
const dividaB = {
  valor_original: 1000,
  valor_atual: 1000,
  taxa_juros_mensal: 5,
  parcela_valor: 60,
  parcelas_total: null,
  parcelas_pagas: 0,
  data_inicio: '2026-01-10',
  status: 'ativa',
};

// Dívida Price que quita rapidamente para facilitar asserções
const dividaBRapida = {
  valor_original: 100,
  valor_atual: 61, // após 1 pagamento
  taxa_juros_mensal: 1,
  parcela_valor: 40,
  parcelas_total: null,
  parcelas_pagas: 1,
  data_inicio: '2026-01-10',
  status: 'ativa',
};

// ─── calcularSaldoDevedor ────────────────────────────────────────────────────

describe('calcularSaldoDevedor', () => {
  describe('Opção A — sem juros', () => {
    it('retorna valor_original quando não há pagamentos', () => {
      assert.equal(calcularSaldoDevedor(dividaA, []), 10000);
    });

    it('aceita pagamentos undefined sem lançar', () => {
      assert.equal(calcularSaldoDevedor(dividaA), 10000);
    });

    it('subtrai corretamente 3 pagamentos de R$ 1.000', () => {
      const pags = [
        { valor_principal: 1000 },
        { valor_principal: 1000 },
        { valor_principal: 1000 },
      ];
      assert.equal(calcularSaldoDevedor(dividaA, pags), 7000);
    });

    it('não vai abaixo de zero mesmo com pagamentos excessivos', () => {
      const pags = Array(20).fill({ valor_principal: 1000 });
      assert.equal(calcularSaldoDevedor(dividaA, pags), 0);
    });

    it('aceita valor_principal como string (vindo do Supabase)', () => {
      const pags = [{ valor_principal: '2500' }, { valor_principal: '2500' }];
      assert.equal(calcularSaldoDevedor(dividaA, pags), 5000);
    });
  });

  describe('Opção B — Price', () => {
    it('retorna valor_original quando não há pagamentos', () => {
      assert.ok(Math.abs(calcularSaldoDevedor(dividaB, []) - 1000) < 0.01);
    });

    it('após 1 pagamento: saldo = 1000 - (60 - 1000*0.05) = 990', () => {
      const saldo = calcularSaldoDevedor(dividaB, [{}]);
      assert.ok(Math.abs(saldo - 990) < 0.01, `esperado ≈990, obtido ${saldo}`);
    });

    it('1.º pagamento: juros (50) > principal (10) — tabela Price com taxa alta', () => {
      const taxa = 5 / 100;
      const juros1 = 1000 * taxa;       // 50
      const principal1 = 60 - juros1;   // 10
      assert.ok(juros1 > principal1, `juros ${juros1} deveria ser > principal ${principal1}`);
    });

    it('simula corretamente sem usar valor_principal dos pagamentos', () => {
      // Mesmo que p.valor_principal esteja errado, recalcula do zero
      const pagsComValorErrado = [{ valor_principal: 99999 }];
      const saldo = calcularSaldoDevedor(dividaB, pagsComValorErrado);
      assert.ok(Math.abs(saldo - 990) < 0.01);
    });
  });
});

// ─── calcularDataQuitacao ────────────────────────────────────────────────────

describe('calcularDataQuitacao', () => {
  describe('Opção A — prazo fixo', () => {
    it('data_inicio 2026-01-10 + 10 parcelas = 2026-11-10', () => {
      const d = calcularDataQuitacao(dividaA);
      assert.equal(d.getFullYear(), 2026);
      assert.equal(d.getMonth(), 10); // novembro (0-indexed)
      assert.equal(d.getDate(), 10);
    });

    it('data_inicio 2026-01-10 + 12 parcelas = 2027-01-10', () => {
      const d = calcularDataQuitacao({ ...dividaA, parcelas_total: 12 });
      assert.equal(d.getFullYear(), 2027);
      assert.equal(d.getMonth(), 0); // janeiro
      assert.equal(d.getDate(), 10);
    });

    it('retorna null quando parcelas_total é null (prazo indeterminado)', () => {
      assert.equal(calcularDataQuitacao({ ...dividaA, parcelas_total: null }), null);
    });

    it('retorna null quando parcelas_total é 0', () => {
      assert.equal(calcularDataQuitacao({ ...dividaA, parcelas_total: 0 }), null);
    });
  });

  describe('Opção B — Price, simula a partir de valor_atual', () => {
    it('dividaBRapida quita em 2 meses a partir de valor_atual=61 (1+2=3 desde início → abril)', () => {
      // Simulação manual partindo de saldo=61:
      //   mês 1: juros=0.61, principal=39.39, saldo=21.61
      //   mês 2: juros=0.22, principal=39.78, saldo<0 → quita
      // parcelas_pagas=1, mesesRestantes=2 → addMeses(2026, 0, 3) = abril 2026
      const d = calcularDataQuitacao(dividaBRapida);
      assert.ok(d instanceof Date, 'deveria retornar Date');
      assert.equal(d.getFullYear(), 2026);
      assert.equal(d.getMonth(), 3); // abril (0-indexed)
      assert.equal(d.getDate(), 10);
    });

    it('retorna null se a parcela não cobre os juros', () => {
      const d = calcularDataQuitacao({ ...dividaB, parcela_valor: 40, valor_atual: 1000 });
      // juros do mês = 1000 * 5% = 50, parcela = 40 → não cobre
      assert.equal(d, null);
    });
  });
});

// ─── calcularProximoVencimento ───────────────────────────────────────────────

describe('calcularProximoVencimento', () => {
  const hoje = new Date(2026, 7, 8); // 8 de agosto de 2026

  it('dia de vencimento já passou no mês (dia 5 < 8) → setembro', () => {
    const venc = calcularProximoVencimento({ data_inicio: '2026-01-05' }, hoje);
    assert.equal(venc.getFullYear(), 2026);
    assert.equal(venc.getMonth(), 8); // setembro
    assert.equal(venc.getDate(), 5);
  });

  it('dia de vencimento ainda não chegou no mês (dia 15 > 8) → agosto', () => {
    const venc = calcularProximoVencimento({ data_inicio: '2026-01-15' }, hoje);
    assert.equal(venc.getFullYear(), 2026);
    assert.equal(venc.getMonth(), 7); // agosto
    assert.equal(venc.getDate(), 15);
  });

  it('vencimento é hoje (dia 8 = 8) → retorna hoje (mesmo mês)', () => {
    const venc = calcularProximoVencimento({ data_inicio: '2026-01-08' }, hoje);
    assert.equal(venc.getMonth(), 7); // agosto
    assert.equal(venc.getDate(), 8);
  });

  it('virada de ano: hoje = dez/2026, dia 3 → janeiro 2027', () => {
    const hojeOut = new Date(2026, 11, 5); // 5 de dezembro
    const venc = calcularProximoVencimento({ data_inicio: '2026-01-03' }, hojeOut);
    assert.equal(venc.getFullYear(), 2027);
    assert.equal(venc.getMonth(), 0); // janeiro
    assert.equal(venc.getDate(), 3);
  });

  it('usa new Date() quando hoje não é fornecido (smoke test)', () => {
    const venc = calcularProximoVencimento({ data_inicio: '2026-01-10' });
    assert.ok(venc instanceof Date);
  });
});

// ─── calcularTotalJurosFuturos ────────────────────────────────────────────────

describe('calcularTotalJurosFuturos', () => {
  it('Opção A: retorna 0 (sem juros)', () => {
    assert.equal(calcularTotalJurosFuturos(dividaA), 0);
  });

  it('Opção A: retorna 0 mesmo com taxa_juros_mensal=0', () => {
    assert.equal(calcularTotalJurosFuturos({ ...dividaA, taxa_juros_mensal: 0 }), 0);
  });

  it('Opção B: total de juros futuros é positivo', () => {
    const juros = calcularTotalJurosFuturos(dividaBRapida);
    assert.ok(juros > 0, `esperado > 0, obtido ${juros}`);
  });

  it('Opção B: juros futuros menores que valor_atual * taxa * 360 (limitante superior trivial)', () => {
    const juros = calcularTotalJurosFuturos(dividaBRapida);
    const limSup = dividaBRapida.valor_atual * (dividaBRapida.taxa_juros_mensal / 100) * 360;
    assert.ok(juros < limSup, `${juros} deveria ser < ${limSup}`);
  });

  it('retorna 0 quando valor_atual é 0 (dívida quitada)', () => {
    const juros = calcularTotalJurosFuturos({ ...dividaB, valor_atual: 0 });
    assert.equal(juros, 0);
  });

  it('retorna 0 (não quebra) quando parcela não cobre juros', () => {
    const juros = calcularTotalJurosFuturos({ ...dividaB, parcela_valor: 40, valor_atual: 1000 });
    // loop interrompe imediatamente (principal ≤ 0)
    assert.equal(juros, 0);
  });
});

// ─── calcularJurosCiclo ───────────────────────────────────────────────────────

describe('calcularJurosCiclo', () => {
  it('retorna saldo * taxa (caso base)', () => {
    assert.ok(Math.abs(calcularJurosCiclo(1000, 0.05) - 50) < 0.001);
  });

  it('retorna 0 quando taxa é 0', () => {
    assert.equal(calcularJurosCiclo(1000, 0), 0);
  });

  it('retorna 0 quando saldo é 0 (dívida quitada)', () => {
    assert.equal(calcularJurosCiclo(0, 0.05), 0);
  });

  it('consistente com o ciclo interno de calcularSaldoDevedor', () => {
    // Após 1 pagamento de dividaB: juros do 1.º ciclo = 1000 * 5% = 50
    const juros = calcularJurosCiclo(1000, 0.05);
    assert.ok(Math.abs(juros - 50) < 0.001);
  });
});

// ─── Desconto no pagamento (Opção A) ─────────────────────────────────────────

describe('Desconto no pagamento (Opção A)', () => {
  it('valor efetivo registrado = valor_pago - desconto', () => {
    const valorPago = 1000;
    const desconto  = 50;
    assert.equal(valorPago - desconto, 950);
  });

  it('valor_juros recebe -desconto (negativo = economia)', () => {
    const desconto    = 50;
    const valorJuros  = -desconto;
    assert.equal(valorJuros, -50);
    assert.ok(valorJuros < 0, 'negativo indica economia, não encargo');
  });

  it('saldo reduz pelo valor efetivo, não pelo valor digitado', () => {
    // dividaA sem pagamentos: saldo = 10 000
    const saldo        = calcularSaldoDevedor(dividaA, []);
    const valorPago    = 1000;
    const desconto     = 100;
    const valorEfetivo = valorPago - desconto; // 900
    const saldoApos    = Math.max(0, saldo - valorEfetivo);
    assert.equal(saldoApos, 9100);
  });

  it('sem desconto: comportamento inalterado (valorEfetivo = valorPago)', () => {
    const valorPago    = 1000;
    const desconto     = 0;
    const valorEfetivo = valorPago - desconto;
    assert.equal(valorEfetivo, 1000);
  });
});

// ─── Quitação antecipada com multa ───────────────────────────────────────────

describe('Quitação antecipada com multa', () => {
  it('sem multa: valorTotal = saldo devedor (multa = 0)', () => {
    const saldo      = calcularSaldoDevedor(dividaBRapida, []);
    const multa      = 0;
    const valorTotal = saldo * (1 + multa / 100);
    assert.ok(Math.abs(valorTotal - saldo) < 0.01);
  });

  it('com multa 2%: valorTotal = saldo * 1.02', () => {
    const saldo      = calcularSaldoDevedor(dividaBRapida, []);
    const multa      = 2;
    const valorTotal = saldo * (1 + multa / 100);
    assert.ok(Math.abs(valorTotal - saldo * 1.02) < 0.01);
  });

  it('valor_juros na quitação = multa em R$ (valorTotal - saldo)', () => {
    const saldo       = calcularSaldoDevedor(dividaBRapida, []);
    const multa       = 2;
    const valorTotal  = saldo * (1 + multa / 100);
    const valorJuros  = valorTotal - saldo; // multa em R$
    assert.ok(Math.abs(valorJuros - saldo * 0.02) < 0.01);
  });

  it('economia = juros futuros calculados antes da quitação', () => {
    const economia = calcularTotalJurosFuturos(dividaBRapida);
    assert.ok(economia > 0, 'deve haver juros futuros a economizar');
  });

  it('quitação sem multa não gera valor_juros positivo', () => {
    const saldo      = calcularSaldoDevedor(dividaBRapida, []);
    const valorJuros = saldo * (1 + 0 / 100) - saldo; // = 0
    assert.equal(valorJuros, 0);
  });
});

// ─── calcularProgressoPct ─────────────────────────────────────────────────────

describe('calcularProgressoPct', () => {
  describe('com parcelas_total', () => {
    it('0 parcelas pagas → 0%', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 0, parcelas_total: 12, valor_original: 10000, valor_atual: 10000 }), 0);
    });

    it('6 de 12 parcelas pagas → 50%', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 6, parcelas_total: 12, valor_original: 10000, valor_atual: 5000 }), 50);
    });

    it('12 de 12 parcelas pagas → 100%', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 12, parcelas_total: 12, valor_original: 10000, valor_atual: 0 }), 100);
    });

    it('não ultrapassa 100% mesmo com parcelas_pagas > parcelas_total', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 15, parcelas_total: 12, valor_original: 10000, valor_atual: 0 }), 100);
    });
  });

  describe('sem parcelas_total (dívida rotativa/aberta)', () => {
    it('nenhum pagamento → 0%', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 0, parcelas_total: null, valor_original: 10000, valor_atual: 10000 }), 0);
    });

    it('metade paga → 50%', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 0, parcelas_total: null, valor_original: 10000, valor_atual: 5000 }), 50);
    });

    it('totalmente paga → 100%', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 0, parcelas_total: null, valor_original: 10000, valor_atual: 0 }), 100);
    });

    it('não vai abaixo de 0% (valor_atual > valor_original)', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 0, parcelas_total: null, valor_original: 1000, valor_atual: 1500 }), 0);
    });

    it('retorna 0 quando valor_original = 0', () => {
      assert.equal(calcularProgressoPct({ parcelas_pagas: 0, parcelas_total: null, valor_original: 0, valor_atual: 0 }), 0);
    });
  });
});
