// Funções puras de cálculo de dívidas.
// Sem imports externos — testável isolado (igual a lib/financeiro.js).

// Desloca ano+mês em n meses (n pode ser negativo).
// mes0 é 0-indexed (janeiro = 0).
function addMeses(ano, mes0, n) {
  const total = ano * 12 + mes0 + n;
  return { ano: Math.floor(total / 12), mes: total % 12 };
}

// ---- Saldo devedor ----
//
// Opção A (taxa_juros_mensal null/0): valor_original - soma dos principais pagos.
// Opção B (taxa > 0): reconstrói a tabela Price mês a mês a partir do
//   valor_original — não usa valor_principal armazenado, garantindo consistência
//   mesmo que pagamentos sejam editados.
export function calcularSaldoDevedor(divida, pagamentos = []) {
  const pags = pagamentos || [];

  if (!divida.taxa_juros_mensal) {
    const pago = pags.reduce((s, p) => s + Number(p.valor_principal), 0);
    return Math.max(0, Number(divida.valor_original) - pago);
  }

  const taxa = Number(divida.taxa_juros_mensal) / 100;
  let saldo = Number(divida.valor_original);
  for (let i = 0; i < pags.length; i++) {
    const juros = saldo * taxa;
    const principal = Number(divida.parcela_valor) - juros;
    saldo = Math.max(0, saldo - principal);
  }
  return saldo;
}

// ---- Data de quitação ----
//
// Opção A: data_inicio + parcelas_total meses (null se prazo indeterminado).
// Opção B: simula parcelas a partir de valor_atual até saldo ≤ 0.
//   Retorna null se o pagamento não cobre os juros ou ultrapassa 360 meses.
export function calcularDataQuitacao(divida) {
  const [anoI, mesI, diaI] = divida.data_inicio.split('-').map(Number);
  // mesI é 1-indexed na string; diaI é o dia do vencimento

  if (!divida.taxa_juros_mensal) {
    if (!divida.parcelas_total) return null;
    const fim = addMeses(anoI, mesI - 1, Number(divida.parcelas_total));
    return new Date(fim.ano, fim.mes, diaI);
  }

  const taxa = Number(divida.taxa_juros_mensal) / 100;
  let saldo = Number(divida.valor_atual);
  let mesesRestantes = 0;
  const MAX = 360;

  while (saldo > 0.01 && mesesRestantes < MAX) {
    const juros = saldo * taxa;
    const principal = Number(divida.parcela_valor) - juros;
    if (principal <= 0) return null; // parcela não cobre os juros
    saldo -= principal;
    mesesRestantes++;
  }

  if (saldo > 0.01) return null; // não quita dentro do prazo máximo

  const pagasFeitas = Number(divida.parcelas_pagas) || 0;
  const fim = addMeses(anoI, mesI - 1, pagasFeitas + mesesRestantes);
  return new Date(fim.ano, fim.mes, diaI);
}

// ---- Próximo vencimento ----
//
// Retorna a data de vencimento da próxima parcela NÃO paga.
// A (parcelas_pagas + 1)-ésima parcela vence em data_inicio + parcelas_pagas meses.
//
// Retorna null quando a dívida tem parcelas_total definido e parcelas_pagas já
// atingiu ou superou esse total (dívida quitada por contagem).
//
// Parcelas atrasadas são retornadas normalmente (data no passado, diasRestantes
// negativo) — o chamador decide como exibir. NÃO empurra pro mês seguinte só
// porque o dia calendário passou: sem um pagamento registrado, a parcela ainda
// é a próxima a vencer, mesmo que esteja vencida.
//
// Clamp: dia 31 em mês de 30 dias → último dia do mês.
// Usa new Date(ano, mes, dia) — nunca new Date(string) — padrão do projeto.
// O segundo parâmetro `_hoje` é mantido por compatibilidade com chamadores
// antigos, mas não é mais utilizado (o vencimento depende de parcelas_pagas,
// não da data de hoje).
export function calcularProximoVencimento(divida, _hoje) {
  const [anoI, mesI, diaI] = divida.data_inicio.split('-').map(Number);

  const parcPagas = Number(divida.parcelas_pagas) || 0;
  const parcTotal = divida.parcelas_total ? Number(divida.parcelas_total) : null;

  // Dívida quitada por contagem de parcelas: não há próxima a vencer
  if (parcTotal !== null && parcPagas >= parcTotal) return null;

  // A próxima parcela não paga vence em data_inicio + parcelas_pagas meses
  const alvo = addMeses(anoI, mesI - 1, parcPagas);

  // Clamp: se o dia de vencimento não existe no mês alvo (ex: dia 31 em abril),
  // usa o último dia do mês — new Date(ano, mes+1, 0) devolve o último dia de mes.
  const ultimoDia = new Date(alvo.ano, alvo.mes + 1, 0).getDate();
  const diaFinal = Math.min(diaI, ultimoDia);

  return new Date(alvo.ano, alvo.mes, diaFinal);
}

// ---- Total de juros futuros ----
//
// Opção A: 0 (sem juros).
// Opção B: simula parcelas a partir de valor_atual e soma os juros de cada mês.
export function calcularTotalJurosFuturos(divida) {
  if (!divida.taxa_juros_mensal) return 0;

  const taxa = Number(divida.taxa_juros_mensal) / 100;
  let saldo = Number(divida.valor_atual);
  let totalJuros = 0;
  const MAX = 360;

  for (let i = 0; i < MAX && saldo > 0.01; i++) {
    const juros = saldo * taxa;
    const principal = Number(divida.parcela_valor) - juros;
    if (principal <= 0) break;
    totalJuros += juros;
    saldo = Math.max(0, saldo - principal);
  }

  return totalJuros;
}

// ---- Juros de um ciclo Price ----
//
// Retorna os juros devidos no próximo período: saldo * taxa_mensal_decimal.
// Centraliza a fórmula para evitar reimplementação em componentes de UI.
export function calcularJurosCiclo(saldo, taxaMensalDecimal) {
  return saldo * taxaMensalDecimal;
}

// ---- Progresso percentual ----
//
// Com parcelas_total: parcelas_pagas / parcelas_total * 100.
// Sem parcelas_total: (valor_original - valor_atual) / valor_original * 100.
export function calcularProgressoPct(divida) {
  const total = Number(divida.parcelas_total);
  if (total > 0) {
    return Math.min(100, (Number(divida.parcelas_pagas) / total) * 100);
  }
  const original = Number(divida.valor_original);
  if (original > 0) {
    const pago = original - Number(divida.valor_atual);
    return Math.min(100, Math.max(0, (pago / original) * 100));
  }
  return 0;
}
