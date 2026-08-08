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
// O dia de vencimento é o mesmo dia de data_inicio.
// Se o dia ainda não chegou no mês atual → retorna data deste mês.
// Se já passou (dia < hoje) → retorna data do mês seguinte.
// Usa new Date(ano, mes, dia) — nunca new Date(string) — padrão do projeto.
export function calcularProximoVencimento(divida, hoje = new Date()) {
  const diaVenc = parseInt(divida.data_inicio.split('-')[2], 10);
  const anoHoje = hoje.getFullYear();
  const mesHoje = hoje.getMonth(); // 0-indexed
  const diaHoje = hoje.getDate();

  if (diaVenc >= diaHoje) {
    return new Date(anoHoje, mesHoje, diaVenc);
  }
  const proximo = addMeses(anoHoje, mesHoje, 1);
  return new Date(proximo.ano, proximo.mes, diaVenc);
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
