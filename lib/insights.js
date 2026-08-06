// Insights da semana — regras puras que transformam os números do mês em
// frases curtas e acionáveis.
//
// Segue o padrão de lib/financeiro.js: nenhum acesso ao banco aqui, só
// funções puras. Os dados chegam já carregados (o CardInsights faz as
// queries) e cada regra é uma função isolada que devolve um insight ou null,
// o que deixa tudo testável com `npm test`.

import { formatarMoeda, calcularParcela } from './financeiro.js';

// ---- Limiares (todos num lugar só, fáceis de calibrar) ----
const MESES_MEDIA = 3;                 // meses anteriores usados nas médias
const CATEGORIA_ALTA_PCT = 0.30;       // +30% vs média p/ "categoria em alta"
const CATEGORIA_ALTA_MIN = 100;        // e pelo menos R$100 gastos no mês
const RESULTADO_DESVIO_PCT = 0.25;     // ±25% vs média no resultado do mês
const SUPERFLUO_PCT = 0.30;            // supérfluo acima de 30% dos não-essenciais
const VENCIMENTOS_JANELA = 5;          // janela (dias) p/ concentração de vencimentos
const VENCIMENTOS_MIN = 3;             // nº mínimo de contas fixas na janela
const MIN_MESES_HISTORICO = 2;         // mín. de meses com dado real p/ comparar com média
const COLCHAO_MINIMO = 300;            // reserva mínima que deve sobrar em conta ao adiantar fatura
const FATURA_ALTA_PCT = 0.30;          // fatura ≥30% acima da média das anteriores
const LIMITE_ALERTA_PCT = 0.80;        // uso do limite ≥80% do total

// Score base por regra. Quanto maior, mais para o topo. Saldo negativo é o
// mais urgente; oportunidade é o menos urgente.
const SCORE = {
  saldoNegativo: 100,
  vencimentos: 70,
  resultadoAlerta: 65,
  limiteComprometido: 62,
  faturaAlta: 52,
  superfluo: 50,
  categoriaAlta: 45,
  resultadoOportunidade: 40,
  dinheiroParado: 38,
};

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// ---- Helpers puros ----
function somaValores(txs) {
  return (txs || []).reduce((s, t) => s + Number(t.valor || 0), 0);
}

function saidasReais(transacoes) {
  return (transacoes || []).filter((t) => t.tipo === 'saida' && !t.transferencia_id);
}

function entradasReais(transacoes) {
  return (transacoes || []).filter((t) => t.tipo === 'entrada' && !t.transferencia_id);
}

function chaveMes(dataStr) {
  return (dataStr || '').slice(0, 7); // 'YYYY-MM'
}

function formatarDiaMes(dataStr) {
  const [, mes, dia] = (dataStr || '').split('-');
  return dia && mes ? `${dia}/${mes}` : dataStr;
}

function addDias(dataStr, n) {
  const d = new Date(dataStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Dia efetivo de vencimento no mês (dia 31 num mês de 30 dias vira 30).
function diaVencimentoNoMes(diaReferencia, ano, mes) {
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return Math.min(Number(diaReferencia) || 1, ultimoDia);
}

// Agrupa gastos por categoria: { categoria: total }
function gastoPorCategoria(saidas) {
  const mapa = {};
  saidas.forEach((t) => {
    const cat = t.categoria || 'Sem categoria';
    mapa[cat] = (mapa[cat] || 0) + Number(t.valor || 0);
  });
  return mapa;
}

// Projeção pura de saldo dia a dia — mesma lógica do fluxo de caixa
// (AbaFluxoCaixa): parte do saldo atual e aplica os lançamentos fixos que
// vencem em cada dia, descontando a média diária de gastos variáveis.
// Devolve [{ data, saldo }] para os próximos `dias` dias.
export function projetarSaldoDiario({ saldoInicial, lancamentosFixos = [], dias = 30, mediaDiariaVariavel = 0, hoje }) {
  const base = hoje || new Date().toISOString().slice(0, 10);
  const out = [];
  let saldo = Number(saldoInicial) || 0;
  for (let i = 1; i <= dias; i++) {
    const data = addDias(base, i);
    const [anoStr, mesStr, diaStr] = data.split('-');
    const ano = parseInt(anoStr, 10);
    const mesIdx = parseInt(mesStr, 10) - 1;
    const diaDoMes = parseInt(diaStr, 10);
    const ultimoDiaDoMes = new Date(ano, mesIdx + 1, 0).getDate();

    const fixosDoDia = lancamentosFixos.filter((f) => {
      const diaEfetivo = Math.min(Number(f.dia_referencia) || 1, ultimoDiaDoMes);
      if (diaEfetivo !== diaDoMes) return false;
      if (f.parcelado) return calcularParcela(f, ano, mesIdx) !== null;
      return true;
    });

    const entradas = fixosDoDia.filter((f) => f.tipo === 'entrada').reduce((s, f) => s + Number(f.valor_padrao), 0);
    const saidas = fixosDoDia.filter((f) => f.tipo === 'saida').reduce((s, f) => s + Number(f.valor_padrao), 0);
    saldo += entradas - saidas - mediaDiariaVariavel;
    // `itens` traz os lançamentos fixos crus do dia; quem consome (ex: o gráfico
    // de fluxo) mapeia para o formato que precisa. A média diária de variáveis
    // já está descontada no `saldo`, mas não entra em `saidas` — cabe a quem
    // exibe decidir se soma.
    out.push({ data, saldo, entradas, saidas, itens: fixosDoDia });
  }
  return out;
}

// ---- Regras (cada uma devolve um insight { texto, score, tipo } ou null) ----

// 1) Categoria em alta vs média dos últimos meses.
function regraCategoriaEmAlta(saidasMes, saidasHistoricoPorMes) {
  const meses = Object.keys(saidasHistoricoPorMes);
  if (meses.length === 0) return null;

  const gastoMes = gastoPorCategoria(saidasMes);
  let melhor = null;

  for (const [categoria, valorMes] of Object.entries(gastoMes)) {
    if (valorMes < CATEGORIA_ALTA_MIN) continue;

    // Só compara contra meses em que a categoria teve gasto real (>0). Meses em
    // que ela nem apareceu não são "zero por economia": incluí-los rebaixaria a
    // média e geraria falso positivo de "alta".
    let soma = 0;
    let mesesComGasto = 0;
    for (const mes of meses) {
      const gastoNoMes = saidasHistoricoPorMes[mes][categoria] || 0;
      if (gastoNoMes > 0) { soma += gastoNoMes; mesesComGasto += 1; }
    }
    if (mesesComGasto < MIN_MESES_HISTORICO) continue; // histórico insuficiente p/ comparar
    const media = soma / mesesComGasto;
    if (media <= 0) continue; // nunca divide por zero

    const variacao = (valorMes - media) / media;
    if (variacao < CATEGORIA_ALTA_PCT) continue;

    const score = SCORE.categoriaAlta + clamp(variacao, 0, 1) * 12;
    if (!melhor || score > melhor.score) {
      melhor = {
        texto: `${categoria}: ${formatarMoeda(valorMes)} este mês, ${Math.round(variacao * 100)}% acima da sua média.`,
        score,
        tipo: 'alta',
        destino: 'relatorios',
      };
    }
  }
  return melhor;
}

// 2) Resultado do mês (receitas − despesas) vs média dos últimos meses.
function regraResultadoVsMedia(resultadoMes, resultadosHistorico) {
  // Precisa de pelo menos MIN_MESES_HISTORICO meses com dado real p/ ter média confiável.
  if (resultadosHistorico.length < MIN_MESES_HISTORICO) return null;
  const media = resultadosHistorico.reduce((s, v) => s + v, 0) / resultadosHistorico.length;
  if (media === 0) return null; // nunca divide por zero (denominador Math.abs(media))

  const desvio = (resultadoMes - media) / Math.abs(media);
  if (Math.abs(desvio) < RESULTADO_DESVIO_PCT) return null;

  const diff = Math.abs(resultadoMes - media);
  if (desvio > 0) {
    return {
      texto: `Você fechou ${formatarMoeda(diff)} acima da sua média dos últimos meses — dá pra reforçar uma meta ou adiantar a fatura do cartão.`,
      score: SCORE.resultadoOportunidade + clamp(desvio, 0, 1) * 10,
      tipo: 'oportunidade',
      destino: 'relatorios',
    };
  }
  return {
    texto: `Seu resultado ficou ${formatarMoeda(diff)} abaixo da média dos últimos meses. Vale revisar os gastos antes do fim do mês.`,
    score: SCORE.resultadoAlerta + clamp(Math.abs(desvio), 0, 1) * 12,
    tipo: 'risco',
    destino: 'relatorios',
  };
}

// 3) Supérfluos acima de 30% dos gastos não-essenciais (desejável + supérfluo).
function regraSuperfluos(saidasMes) {
  const desejavel = somaValores(saidasMes.filter((t) => t.essencialidade === 'desejavel'));
  const superfluo = somaValores(saidasMes.filter((t) => t.essencialidade === 'superfluo'));
  const naoEssenciais = desejavel + superfluo;
  if (naoEssenciais <= 0) return null;

  const pct = superfluo / naoEssenciais;
  if (pct <= SUPERFLUO_PCT) return null;

  return {
    texto: `Gastos supérfluos somaram ${formatarMoeda(superfluo)} — ${Math.round(pct * 100)}% dos seus gastos não-essenciais este mês.`,
    score: SCORE.superfluo + clamp((pct - SUPERFLUO_PCT) / SUPERFLUO_PCT, 0, 1) * 10,
    tipo: 'alta',
    destino: 'relatorios',
  };
}

// 4) Saldo projetado negativo nos próximos dias (urgente → score alto).
function regraSaldoProjetadoNegativo(projecaoFluxo) {
  if (!Array.isArray(projecaoFluxo) || projecaoFluxo.length === 0) return null;
  const primeiro = projecaoFluxo.find((d) => Number(d.saldo) < 0);
  if (!primeiro) return null;

  return {
    texto: `Sua projeção aponta saldo negativo em ${formatarDiaMes(primeiro.data)} (${formatarMoeda(primeiro.saldo)}). Ainda dá tempo de remanejar.`,
    score: SCORE.saldoNegativo,
    tipo: 'risco',
    destino: 'relatorios',
    subaba: 'fluxo',
  };
}

// 5) Concentração de vencimentos: ≥3 contas fixas numa janela de até 5 dias.
function regraConcentracaoVencimentos(lancamentosFixos, dataAtual) {
  const { ano, mes } = dataAtual;
  const vencimentos = (lancamentosFixos || [])
    .filter((f) => f.tipo === 'saida' && (!f.parcelado || calcularParcela(f, ano, mes) !== null))
    .map((f) => ({ dia: diaVencimentoNoMes(f.dia_referencia, ano, mes), valor: Number(f.valor_padrao) || 0 }))
    .sort((a, b) => a.dia - b.dia);

  if (vencimentos.length < VENCIMENTOS_MIN) return null;

  let melhor = null;
  for (let i = 0; i < vencimentos.length; i++) {
    const janela = vencimentos.filter((v) => v.dia >= vencimentos[i].dia && v.dia <= vencimentos[i].dia + VENCIMENTOS_JANELA);
    if (janela.length < VENCIMENTOS_MIN) continue;

    const total = janela.reduce((s, v) => s + v.valor, 0);
    const diaIni = janela[0].dia;
    const diaFim = janela[janela.length - 1].dia;
    if (!melhor || janela.length > melhor._n || (janela.length === melhor._n && total > melhor._total)) {
      melhor = {
        texto: `${janela.length} contas fixas vencem entre os dias ${diaIni} e ${diaFim} — ${formatarMoeda(total)} concentrados. Confira se o caixa cobre.`,
        score: SCORE.vencimentos + clamp((janela.length - VENCIMENTOS_MIN) / 3, 0, 1) * 8,
        tipo: 'alta',
        destino: 'contas-fixas',
        _n: janela.length,
        _total: total,
      };
    }
  }
  if (melhor) { delete melhor._n; delete melhor._total; }
  return melhor;
}

// 6) Dinheiro parado vs. fatura em aberto — oportunidade de adiantar pagamento
//    sem comprometer a reserva. `saldoEmConta` é o total nas contas; `faturaAberta`
//    é o total das faturas em aberto (soma dos cartões).
function regraDinheiroParadoVsFatura(saldoEmConta, faturaAberta) {
  const saldo = Number(saldoEmConta) || 0;
  const fatura = Number(faturaAberta) || 0;
  if (fatura <= 0) return null;               // não há fatura em aberto p/ adiantar
  if (saldo <= COLCHAO_MINIMO) return null;   // sem folga além da reserva — nunca zera a conta

  const disponivel = saldo - COLCHAO_MINIMO;
  const adiantar = Math.min(disponivel, fatura);
  if (adiantar <= 0) return null;             // nada a adiantar mantendo o colchão

  return {
    texto: `Você tem ${formatarMoeda(saldo)} em conta e uma fatura de ${formatarMoeda(fatura)} em aberto. Adiantar ${formatarMoeda(adiantar)} economiza juros, mantendo ${formatarMoeda(COLCHAO_MINIMO)} de reserva.`,
    score: SCORE.dinheiroParado,
    tipo: 'oportunidade',
    destino: 'contas-cartoes',
  };
}

// 7) Fatura acima da média — compara a fatura atual de cada cartão com a média
//    das faturas anteriores. Mesma blindagem de histórico das outras regras.
function regraFaturaAcimaMedia(cartoes) {
  let melhor = null;
  for (const c of (cartoes || [])) {
    const historico = (c.historicoFaturas || []).map((v) => Number(v || 0));
    if (historico.length < MIN_MESES_HISTORICO) continue; // histórico insuficiente
    const media = historico.reduce((s, v) => s + v, 0) / historico.length;
    if (media <= 0) continue;                              // nunca divide por zero

    const atual = Number(c.faturaAtual) || 0;
    const variacao = (atual - media) / media;
    if (variacao < FATURA_ALTA_PCT) continue;

    const score = SCORE.faturaAlta + clamp(variacao, 0, 1) * 10;
    if (!melhor || score > melhor.score) {
      melhor = {
        texto: `Fatura do ${c.nome}: ${formatarMoeda(atual)} este mês, ${Math.round(variacao * 100)}% acima da sua média.`,
        score,
        tipo: 'alta',
        destino: 'contas-cartoes',
      };
    }
  }
  return melhor;
}

// 8) Limite comprometido — uso do limite ≥80%. Só calcula se o cartão tem
//    limite preenchido e > 0 (caso contrário, fica quieta). O uso é o total
//    comprometido: fatura em aberto + fatura fechada ainda não paga.
function regraLimiteComprometido(cartoes) {
  let melhor = null;
  for (const c of (cartoes || [])) {
    const limite = Number(c.limite);
    if (!limite || limite <= 0) continue; // sem limite → não há percentual a calcular

    const usado = (Number(c.faturaAberta) || 0) + (Number(c.faturaFechadaNaoPaga) || 0);
    const pct = usado / limite;
    if (pct < LIMITE_ALERTA_PCT) continue;

    const score = SCORE.limiteComprometido + clamp((pct - LIMITE_ALERTA_PCT) / (1 - LIMITE_ALERTA_PCT), 0, 1) * 10;
    if (!melhor || score > melhor.score) {
      melhor = {
        texto: `Cartão ${c.nome}: você usou ${Math.round(pct * 100)}% do limite (${formatarMoeda(usado)} de ${formatarMoeda(limite)}).`,
        score,
        tipo: 'risco',
        destino: 'contas-cartoes',
      };
    }
  }
  return melhor;
}

// Orquestra: prepara os agregados e roda as regras. Devolve no máximo 3
// insights ordenados por score decrescente.
export function gerarInsights({ transacoesMes, transacoesHistorico, projecaoFluxo, lancamentosFixos, dataAtual, cartoes = [], saldoEmConta = 0 }) {
  const saidasMes = saidasReais(transacoesMes);
  const entradasMes = entradasReais(transacoesMes);
  const resultadoMes = somaValores(entradasMes) - somaValores(saidasMes);

  // Agrega o histórico por mês: gastos por categoria e resultado do mês.
  const saidasHistoricoPorMes = {};   // { 'YYYY-MM': { categoria: total } }
  const resultadoHistoricoPorMes = {}; // { 'YYYY-MM': resultado }
  (transacoesHistorico || []).forEach((t) => {
    if (t.transferencia_id) return;
    const mes = chaveMes(t.data);
    if (!mes) return;
    if (resultadoHistoricoPorMes[mes] === undefined) resultadoHistoricoPorMes[mes] = 0;
    if (t.tipo === 'entrada') {
      resultadoHistoricoPorMes[mes] += Number(t.valor || 0);
    } else if (t.tipo === 'saida') {
      resultadoHistoricoPorMes[mes] -= Number(t.valor || 0);
      if (!saidasHistoricoPorMes[mes]) saidasHistoricoPorMes[mes] = {};
      const cat = t.categoria || 'Sem categoria';
      saidasHistoricoPorMes[mes][cat] = (saidasHistoricoPorMes[mes][cat] || 0) + Number(t.valor || 0);
    }
  });

  // Usa só os até MESES_MEDIA meses mais recentes do histórico.
  const mesesOrdenados = Object.keys(resultadoHistoricoPorMes).sort().slice(-MESES_MEDIA);
  const saidasHistFiltrado = {};
  mesesOrdenados.forEach((m) => { saidasHistFiltrado[m] = saidasHistoricoPorMes[m] || {}; });
  const resultadosHistorico = mesesOrdenados.map((m) => resultadoHistoricoPorMes[m]);

  const faturaAbertaTotal = (cartoes || []).reduce((s, c) => s + (Number(c.faturaAberta) || 0), 0);

  const insights = [
    regraSaldoProjetadoNegativo(projecaoFluxo),
    regraLimiteComprometido(cartoes),
    regraConcentracaoVencimentos(lancamentosFixos, dataAtual),
    regraResultadoVsMedia(resultadoMes, resultadosHistorico),
    regraFaturaAcimaMedia(cartoes),
    regraSuperfluos(saidasMes),
    regraCategoriaEmAlta(saidasMes, saidasHistFiltrado),
    regraDinheiroParadoVsFatura(saldoEmConta, faturaAbertaTotal),
  ].filter(Boolean);

  return insights.sort((a, b) => b.score - a.score).slice(0, 3);
}
