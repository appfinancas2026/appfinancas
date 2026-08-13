import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  pad2,
  mesReferenciaStr,
  ultimoDiaDoMes,
  subtrairMeses,
  avancarMeses,
  calcularParcela,
  parcelaAtivaNoMes,
  calcularPeriodoFaturaAberta,
  calcularMesFaturaCompra,
  formatarMoeda,
  parseOFX,
  parseCSVExtrato,
  parseValorMonetario,
  calcularSaldoConta,
  mesesReferenciaNoPeriodo,
} from '../lib/financeiro.js';

// Lembrete: mês é 0-based (0 = janeiro), como no Date do JavaScript.

describe('pad2', () => {
  test('completa com zero à esquerda', () => {
    assert.equal(pad2(1), '01');
    assert.equal(pad2(9), '09');
  });

  test('não mexe em números de dois dígitos', () => {
    assert.equal(pad2(10), '10');
    assert.equal(pad2(12), '12');
  });
});

describe('mesReferenciaStr', () => {
  test('converte mês 0-based para data do primeiro dia', () => {
    assert.equal(mesReferenciaStr(2026, 0), '2026-01-01');
    assert.equal(mesReferenciaStr(2026, 11), '2026-12-01');
  });
});

describe('ultimoDiaDoMes', () => {
  test('meses de 31 e 30 dias', () => {
    assert.equal(ultimoDiaDoMes(2026, 0), '2026-01-31');
    assert.equal(ultimoDiaDoMes(2026, 3), '2026-04-30');
  });

  test('fevereiro em ano comum e bissexto', () => {
    assert.equal(ultimoDiaDoMes(2026, 1), '2026-02-28');
    assert.equal(ultimoDiaDoMes(2024, 1), '2024-02-29');
  });
});

describe('subtrairMeses', () => {
  test('dentro do mesmo ano', () => {
    assert.deepEqual(subtrairMeses(2026, 5, 2), { ano: 2026, mes: 3 });
  });

  test('atravessando o ano para trás', () => {
    assert.deepEqual(subtrairMeses(2026, 0, 1), { ano: 2025, mes: 11 });
  });

  test('quantidade negativa avança', () => {
    assert.deepEqual(subtrairMeses(2026, 11, -1), { ano: 2027, mes: 0 });
  });

  test('vários anos para trás', () => {
    assert.deepEqual(subtrairMeses(2026, 2, 24), { ano: 2024, mes: 2 });
  });
});

describe('avancarMeses', () => {
  test('avança dentro do ano', () => {
    assert.equal(avancarMeses('2026-01-01', 2), '2026-03-01');
  });

  test('vira o ano', () => {
    assert.equal(avancarMeses('2026-11-01', 2), '2027-01-01');
  });

  test('avançar zero devolve o mesmo mês', () => {
    assert.equal(avancarMeses('2026-07-01', 0), '2026-07-01');
  });

  test('12 meses = um ano exato', () => {
    assert.equal(avancarMeses('2026-07-01', 12), '2027-07-01');
  });
});

describe('calcularParcela', () => {
  const fixo = { parcelado: true, mes_inicio: '2026-01-01', total_parcelas: 6 };

  test('primeira parcela no mês de início', () => {
    assert.equal(calcularParcela(fixo, 2026, 0), 1);
  });

  test('parcela do meio', () => {
    assert.equal(calcularParcela(fixo, 2026, 2), 3);
  });

  test('última parcela', () => {
    assert.equal(calcularParcela(fixo, 2026, 5), 6);
  });

  test('depois da última devolve null', () => {
    assert.equal(calcularParcela(fixo, 2026, 6), null);
  });

  test('antes do início devolve null', () => {
    assert.equal(calcularParcela(fixo, 2025, 11), null);
  });

  test('não parcelado devolve null', () => {
    assert.equal(calcularParcela({ parcelado: false, mes_inicio: '2026-01-01' }, 2026, 0), null);
  });

  test('parcelado sem mes_inicio devolve null', () => {
    assert.equal(calcularParcela({ parcelado: true }, 2026, 0), null);
  });

  test('atravessa a virada do ano', () => {
    const f = { parcelado: true, mes_inicio: '2025-11-01', total_parcelas: 6 };
    assert.equal(calcularParcela(f, 2026, 0), 3); // nov=1, dez=2, jan=3
  });

  test('sem total_parcelas não tem limite superior', () => {
    const f = { parcelado: true, mes_inicio: '2026-01-01' };
    assert.equal(calcularParcela(f, 2030, 0), 49);
  });
});

describe('parcelaAtivaNoMes', () => {
  const fixo6 = { parcelado: true, mes_inicio: '2026-01-01', total_parcelas: 6 };

  test('não-parcelado é sempre ativo', () => {
    assert.equal(parcelaAtivaNoMes({ parcelado: false }, 2026, 0), true);
    assert.equal(parcelaAtivaNoMes({ parcelado: false }, 2020, 5), true);
  });

  test('parcelado antes do início retorna false', () => {
    assert.equal(parcelaAtivaNoMes(fixo6, 2025, 11), false);
  });

  test('primeira parcela (mês de início) retorna true', () => {
    assert.equal(parcelaAtivaNoMes(fixo6, 2026, 0), true);
  });

  test('última parcela retorna true', () => {
    assert.equal(parcelaAtivaNoMes(fixo6, 2026, 5), true);
  });

  test('após a última parcela retorna false', () => {
    assert.equal(parcelaAtivaNoMes(fixo6, 2026, 6), false);
  });

  test('parcelado sem mes_inicio retorna false', () => {
    assert.equal(parcelaAtivaNoMes({ parcelado: true }, 2026, 0), false);
  });
});

describe('calcularPeriodoFaturaAberta', () => {
  const cartao = { dia_fechamento: 10 };

  test('antes do fechamento: fatura do mês atual', () => {
    assert.deepEqual(calcularPeriodoFaturaAberta(cartao, new Date(2026, 6, 5)), { ano: 2026, mes: 6 });
  });

  test('no dia do fechamento: ainda o mês atual', () => {
    assert.deepEqual(calcularPeriodoFaturaAberta(cartao, new Date(2026, 6, 10)), { ano: 2026, mes: 6 });
  });

  test('depois do fechamento: fatura do mês seguinte', () => {
    assert.deepEqual(calcularPeriodoFaturaAberta(cartao, new Date(2026, 6, 11)), { ano: 2026, mes: 7 });
  });

  test('dezembro depois do fechamento vira janeiro do ano seguinte', () => {
    assert.deepEqual(calcularPeriodoFaturaAberta(cartao, new Date(2026, 11, 20)), { ano: 2027, mes: 0 });
  });
});

describe('calcularMesFaturaCompra', () => {
  const cartao = { dia_fechamento: 10 };

  test('compra antes do fechamento entra na fatura do mês', () => {
    assert.equal(calcularMesFaturaCompra(cartao, '2026-07-05'), '2026-07-01');
  });

  test('compra no dia do fechamento ainda entra no mês', () => {
    assert.equal(calcularMesFaturaCompra(cartao, '2026-07-10'), '2026-07-01');
  });

  test('compra depois do fechamento vai para o mês seguinte', () => {
    assert.equal(calcularMesFaturaCompra(cartao, '2026-07-11'), '2026-08-01');
  });

  test('compra em dezembro depois do fechamento vai para janeiro', () => {
    assert.equal(calcularMesFaturaCompra(cartao, '2026-12-15'), '2027-01-01');
  });

  test('fechamento no dia 1', () => {
    const c = { dia_fechamento: 1 };
    assert.equal(calcularMesFaturaCompra(c, '2026-07-01'), '2026-07-01');
    assert.equal(calcularMesFaturaCompra(c, '2026-07-02'), '2026-08-01');
  });
});

describe('formatarMoeda', () => {
  // Espaço não-quebrável (U+00A0) é o que o Intl usa entre "R$" e o número.
  const ESP = '\u00A0';

  test('padrão brasileiro: vírgula decimal', () => {
    assert.equal(formatarMoeda(10), `R$${ESP}10,00`);
    assert.equal(formatarMoeda(10.5), `R$${ESP}10,50`);
  });

  test('separador de milhar', () => {
    assert.equal(formatarMoeda(1000), `R$${ESP}1.000,00`);
    assert.equal(formatarMoeda(1234.56), `R$${ESP}1.234,56`);
    assert.equal(formatarMoeda(1234567.89), `R$${ESP}1.234.567,89`);
  });

  test('arredonda para dois decimais', () => {
    assert.equal(formatarMoeda(10.567), `R$${ESP}10,57`);
    assert.equal(formatarMoeda(0.005), `R$${ESP}0,01`);
  });

  test('zero e negativo', () => {
    assert.equal(formatarMoeda(0), `R$${ESP}0,00`);
    assert.equal(formatarMoeda(-50.5), `-R$${ESP}50,50`);
    assert.equal(formatarMoeda(-1234.56), `-R$${ESP}1.234,56`);
  });

  test('aceita string numérica (como vem do banco)', () => {
    assert.equal(formatarMoeda('123.456'), `R$${ESP}123,46`);
    assert.equal(formatarMoeda('1000'), `R$${ESP}1.000,00`);
  });

  test('valor inválido não quebra a tela', () => {
    assert.equal(formatarMoeda(null), `R$${ESP}0,00`);
    assert.equal(formatarMoeda(undefined), 'R$ 0,00');
    assert.equal(formatarMoeda('abc'), 'R$ 0,00');
  });
});

describe('parseOFX', () => {
  const ofx = `
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260705120000
<TRNAMT>-45.90
<FITID>ABC123
<MEMO>SUPERMERCADO XYZ
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260701
<TRNAMT>3500.00
<FITID>DEF456
<MEMO>SALARIO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  test('extrai todas as transações', () => {
    assert.equal(parseOFX(ofx).length, 2);
  });

  test('valor negativo vira saída com valor absoluto', () => {
    const [primeira] = parseOFX(ofx);
    assert.equal(primeira.tipo, 'saida');
    assert.equal(primeira.valor, 45.9);
  });

  test('valor positivo vira entrada', () => {
    const [, segunda] = parseOFX(ofx);
    assert.equal(segunda.tipo, 'entrada');
    assert.equal(segunda.valor, 3500);
  });

  test('converte a data para ISO', () => {
    assert.equal(parseOFX(ofx)[0].data, '2026-07-05');
  });

  test('guarda o FITID composto com a data (garante unicidade entre meses)', () => {
    assert.equal(parseOFX(ofx)[0].referencia_externa, 'ABC123:2026-07-05');
  });

  test('usa o MEMO como descrição', () => {
    assert.equal(parseOFX(ofx)[0].descricao, 'SUPERMERCADO XYZ');
  });

  test('vem marcada para incluir por padrão', () => {
    assert.equal(parseOFX(ofx)[0].incluir, true);
  });

  test('texto vazio devolve lista vazia', () => {
    assert.deepEqual(parseOFX(''), []);
  });

  test('ignora transação sem valor', () => {
    const semValor = '<STMTTRN><DTPOSTED>20260705<MEMO>X</STMTTRN>';
    assert.deepEqual(parseOFX(semValor), []);
  });

  test('cai para NAME quando não há MEMO', () => {
    const comName = '<STMTTRN><DTPOSTED>20260705<TRNAMT>-10.00<NAME>POSTO ABC</STMTTRN>';
    assert.equal(parseOFX(comName)[0].descricao, 'POSTO ABC');
  });

  test('sem MEMO nem NAME usa descrição padrão', () => {
    const semDesc = '<STMTTRN><DTPOSTED>20260705<TRNAMT>-10.00</STMTTRN>';
    assert.equal(parseOFX(semDesc)[0].descricao, 'Importado do extrato');
  });

  test('DTPOSTED com sufixo de timezone é parseado corretamente', () => {
    const comTz = '<STMTTRN><DTPOSTED>20260705120000[-3:BRT]<TRNAMT>-10.00<MEMO>X</STMTTRN>';
    assert.equal(parseOFX(comTz)[0].data, '2026-07-05');
  });

  test('TRNAMT com vírgula decimal (formato br) é aceito', () => {
    const comVirgula = '<STMTTRN><DTPOSTED>20260705<TRNAMT>-45,90<MEMO>X</STMTTRN>';
    const [t] = parseOFX(comVirgula);
    assert.equal(t.tipo, 'saida');
    assert.equal(t.valor, 45.9);
  });

  test('mesmo FITID em meses diferentes gera chaves distintas (caso Santander)', () => {
    const ofxDupFitid = `
<STMTTRN>
<DTPOSTED>20260705
<TRNAMT>-10.00
<FITID>SAMEKEY
<MEMO>JULHO
</STMTTRN>
<STMTTRN>
<DTPOSTED>20260805
<TRNAMT>-20.00
<FITID>SAMEKEY
<MEMO>AGOSTO
</STMTTRN>`;
    const [t1, t2] = parseOFX(ofxDupFitid);
    assert.equal(t1.referencia_externa, 'SAMEKEY:2026-07-05');
    assert.equal(t2.referencia_externa, 'SAMEKEY:2026-08-05');
    assert.notEqual(t1.referencia_externa, t2.referencia_externa);
  });
});

describe('parseValorMonetario', () => {
  test('formato brasileiro: vírgula decimal', () => {
    assert.equal(parseValorMonetario('45,90'), 45.9);
    assert.equal(parseValorMonetario('-45,90'), -45.9);
  });

  test('formato brasileiro com milhar', () => {
    assert.equal(parseValorMonetario('1.234,56'), 1234.56);
    assert.equal(parseValorMonetario('1.234.567,89'), 1234567.89);
  });

  test('formato internacional: ponto decimal', () => {
    assert.equal(parseValorMonetario('45.90'), 45.9);
    assert.equal(parseValorMonetario('-45.90'), -45.9);
  });

  test('formato internacional com milhar', () => {
    assert.equal(parseValorMonetario('1,234.56'), 1234.56);
  });

  test('número inteiro sem separador', () => {
    assert.equal(parseValorMonetario('100'), 100);
    assert.equal(parseValorMonetario('-100'), -100);
  });

  test('ignora símbolo de moeda e espaços', () => {
    assert.equal(parseValorMonetario('R$ 45,90'), 45.9);
    assert.equal(parseValorMonetario(' 45,90 '), 45.9);
  });

  test('texto inválido devolve NaN', () => {
    assert.ok(Number.isNaN(parseValorMonetario('abc')));
    assert.ok(Number.isNaN(parseValorMonetario('')));
  });
});

describe('parseCSVExtrato', () => {
  test('formato brasileiro: ponto e vírgula, vírgula decimal, data dd/mm/aaaa', () => {
    const csv = 'Data;Valor;Descrição\n05/07/2026;-45,90;SUPERMERCADO\n01/07/2026;3500,00;SALARIO';
    const r = parseCSVExtrato(csv);

    assert.equal(r.length, 2);
    assert.equal(r[0].data, '2026-07-05');
    assert.equal(r[0].valor, 45.9);
    assert.equal(r[0].tipo, 'saida');
    assert.equal(r[1].tipo, 'entrada');
  });

  test('formato internacional: vírgula separadora, ponto decimal', () => {
    const csv = 'Date,Amount,Description\n2026-07-05,-45.90,MARKET';
    const r = parseCSVExtrato(csv);

    assert.equal(r.length, 1);
    assert.equal(r[0].valor, 45.9);
  });

  test('milhar com ponto e decimal com vírgula', () => {
    const csv = 'Data;Valor;Descrição\n05/07/2026;1.234,56;COMPRA';
    assert.equal(parseCSVExtrato(csv)[0].valor, 1234.56);
  });

  test('ano com dois dígitos vira 20xx', () => {
    const csv = 'Data;Valor;Descrição\n05/07/26;-10,00;X';
    assert.equal(parseCSVExtrato(csv)[0].data, '2026-07-05');
  });

  test('dia e mês sem zero à esquerda', () => {
    const csv = 'Data;Valor;Descrição\n5/7/2026;-10,00;X';
    assert.equal(parseCSVExtrato(csv)[0].data, '2026-07-05');
  });

  test('cabeçalho alternativo (histórico)', () => {
    const csv = 'Data;Valor;Histórico\n05/07/2026;-10,00;PAGAMENTO';
    assert.equal(parseCSVExtrato(csv)[0].descricao, 'PAGAMENTO');
  });

  test('sem coluna de data devolve vazio', () => {
    assert.deepEqual(parseCSVExtrato('Valor;Descrição\n-10,00;X'), []);
  });

  test('sem coluna de valor devolve vazio', () => {
    assert.deepEqual(parseCSVExtrato('Data;Descrição\n05/07/2026;X'), []);
  });

  test('só cabeçalho devolve vazio', () => {
    assert.deepEqual(parseCSVExtrato('Data;Valor;Descrição'), []);
  });

  test('texto vazio devolve vazio', () => {
    assert.deepEqual(parseCSVExtrato(''), []);
  });

  test('pula linhas com valor inválido', () => {
    const csv = 'Data;Valor;Descrição\n05/07/2026;abc;X\n06/07/2026;-10,00;Y';
    const r = parseCSVExtrato(csv);
    assert.equal(r.length, 1);
    assert.equal(r[0].descricao, 'Y');
  });

  test('ignora linhas em branco no meio', () => {
    const csv = 'Data;Valor;Descrição\n05/07/2026;-10,00;X\n\n06/07/2026;-20,00;Y';
    assert.equal(parseCSVExtrato(csv).length, 2);
  });
});

// Layout real da fatura do C6: três colunas de "valor", sendo as de moeda
// estrangeira zeradas em compra nacional. Pegar a primeira zerava tudo.
describe('parseCSVExtrato — fatura de cartão (layout C6)', () => {
  const CABECALHO = 'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)';
  const csvC6 = [
    CABECALHO,
    '28/07/2025;RICARDO M BUENO;4280;Supermercados;BOLO DE MAE;12/12;0;0;136.60',
    '30/09/2025;RICARDO M BUENO;4280;Automotivo;RIVEL VEICULOS;10/10;0;0;1210.00',
    '10/07/2026;RICARDO M BUENO;4280;Pagamentos;Pag Fatura Boleto;Única;0;0;-5278.18',
  ].join('\n');

  test('usa a coluna "Valor (em R$)", não a de dólar nem a de cotação', () => {
    const r = parseCSVExtrato(csvC6);
    assert.equal(r[0].valor, 136.6);
    assert.equal(r[1].valor, 1210);
    assert.ok(r.every((t) => t.valor !== 0), 'nenhuma linha deve vir zerada');
  });

  test('marca o pagamento da fatura como crédito e já vem desmarcado', () => {
    const pagamento = parseCSVExtrato(csvC6).find((t) => /Pag Fatura/.test(t.descricao));
    assert.equal(pagamento.ehCredito, true);
    assert.equal(pagamento.ehPagamentoFatura, true);
    assert.equal(pagamento.incluir, false);
  });

  test('compras normais seguem marcadas para importar', () => {
    const compra = parseCSVExtrato(csvC6)[0];
    assert.equal(compra.incluir, true);
    assert.equal(compra.ehCredito, false);
  });

  test('extrato com uma única coluna de valor continua funcionando', () => {
    const r = parseCSVExtrato('Data;Valor;Descrição\n05/07/2026;-10,00;X');
    assert.equal(r[0].valor, 10);
    assert.equal(r[0].tipo, 'saida');
  });
});

describe('parseValorMonetario — milhar sem decimal', () => {
  test('ponto de milhar sem casas decimais', () => {
    assert.equal(parseValorMonetario('1.234'), 1234);
    assert.equal(parseValorMonetario('1.234.567'), 1234567);
  });

  test('não confunde com decimal de 2 casas', () => {
    assert.equal(parseValorMonetario('136.60'), 136.6);
    assert.equal(parseValorMonetario('1210.00'), 1210);
  });

  test('negativo com ponto decimal (pagamento de fatura)', () => {
    assert.equal(parseValorMonetario('-5278.18'), -5278.18);
  });
});

describe('calcularSaldoConta', () => {
  test('entradas somam, saídas subtraem', () => {
    const txs = [
      { valor: 100, tipo: 'entrada' },
      { valor: 30, tipo: 'saida' },
    ];
    assert.equal(calcularSaldoConta(1000, txs), 1070);
  });

  test('sem transações mantém o saldo inicial', () => {
    assert.equal(calcularSaldoConta(500, []), 500);
  });

  test('lista nula não quebra', () => {
    assert.equal(calcularSaldoConta(500, null), 500);
  });

  test('aceita valores em string (como vêm do banco)', () => {
    const txs = [{ valor: '250.50', tipo: 'saida' }];
    assert.equal(calcularSaldoConta('1000.00', txs), 749.5);
  });

  test('saldo pode ficar negativo', () => {
    assert.equal(calcularSaldoConta(100, [{ valor: 150, tipo: 'saida' }]), -50);
  });

  test('vários pagamentos parciais da mesma conta', () => {
    const txs = [
      { valor: 200, tipo: 'saida' },
      { valor: 100, tipo: 'saida' },
    ];
    assert.equal(calcularSaldoConta(1000, txs), 700);
  });
});

// ── mesesReferenciaNoPeriodo ──────────────────────────────────────────────────

describe('mesesReferenciaNoPeriodo', () => {
  test('mesmo mês retorna exatamente 1 elemento', () => {
    const r = mesesReferenciaNoPeriodo('2026-01-01', '2026-01-31');
    assert.deepEqual(r, ['2026-01-01']);
  });

  test('3 meses cruzando virada de ano', () => {
    const r = mesesReferenciaNoPeriodo('2025-11-01', '2026-01-31');
    assert.deepEqual(r, ['2025-11-01', '2025-12-01', '2026-01-01']);
  });

  test('mês único no fim do ano (dezembro)', () => {
    const r = mesesReferenciaNoPeriodo('2025-12-01', '2025-12-31');
    assert.deepEqual(r, ['2025-12-01']);
  });

  test('intervalo de 1 dia dentro de um mês retorna esse mês', () => {
    const r = mesesReferenciaNoPeriodo('2026-06-15', '2026-06-15');
    assert.deepEqual(r, ['2026-06-01']);
  });

  test('ano inteiro retorna 12 meses', () => {
    const r = mesesReferenciaNoPeriodo('2026-01-01', '2026-12-31');
    assert.equal(r.length, 12);
    assert.equal(r[0], '2026-01-01');
    assert.equal(r[11], '2026-12-01');
  });

  test('período parcial que começa no meio de um mês inclui esse mês', () => {
    const r = mesesReferenciaNoPeriodo('2026-03-15', '2026-05-10');
    assert.deepEqual(r, ['2026-03-01', '2026-04-01', '2026-05-01']);
  });

  test('6 meses cruzando dois anos', () => {
    const r = mesesReferenciaNoPeriodo('2025-08-01', '2026-01-31');
    assert.deepEqual(r, [
      '2025-08-01', '2025-09-01', '2025-10-01',
      '2025-11-01', '2025-12-01', '2026-01-01',
    ]);
  });
});
