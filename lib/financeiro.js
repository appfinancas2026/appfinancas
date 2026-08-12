// Funções puras de cálculo financeiro.
//
// Este arquivo não importa o cliente do banco de propósito: assim pode ser
// testado isoladamente (`npm test`), sem precisar de conexão nem de mocks.
// A função que grava no banco vive em lib/saldos.js.

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function mesReferenciaStr(ano, mes) {
  return `${ano}-${pad2(mes + 1)}-01`;
}

export function primeiroDiaDoMes(ano, mes) {
  return `${ano}-${pad2(mes + 1)}-01`;
}

export function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
}

export function subtrairMeses(ano, mes, quantidade) {
  const totalMeses = ano * 12 + mes - quantidade;
  const anoResultado = Math.floor(totalMeses / 12);
  const mesResultado = totalMeses - anoResultado * 12;
  return { ano: anoResultado, mes: mesResultado };
}

export function avancarMeses(mesRef, quantidade) {
  const [anoStr, mesStr] = mesRef.split('-');
  const resultado = subtrairMeses(parseInt(anoStr, 10), parseInt(mesStr, 10) - 1, -quantidade);
  return mesReferenciaStr(resultado.ano, resultado.mes);
}

export function calcularParcela(fixo, ano, mes) {
  if (!fixo.parcelado || !fixo.mes_inicio) return null;
  const [anoInicio, mesInicioStr] = fixo.mes_inicio.split('-');
  const mesInicioIdx = parseInt(mesInicioStr, 10) - 1;
  const diffMeses = (ano - parseInt(anoInicio, 10)) * 12 + (mes - mesInicioIdx);
  const numero = diffMeses + 1;
  if (numero < 1 || (fixo.total_parcelas && numero > fixo.total_parcelas)) return null;
  return numero;
}

// Retorna true se o lançamento deve gerar ocorrência no mês (ano, mes).
// Para não-parcelados: sempre true. Para parcelados: só se a parcela existe.
export function parcelaAtivaNoMes(fixo, ano, mes) {
  if (!fixo.parcelado) return true;
  return calcularParcela(fixo, ano, mes) !== null;
}

export function calcularPeriodoFaturaAberta(cartao, hoje) {
  const dia = hoje.getDate();
  if (dia <= cartao.dia_fechamento) return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  return subtrairMeses(hoje.getFullYear(), hoje.getMonth(), -1);
}

export function calcularMesFaturaCompra(cartao, dataStr) {
  const [anoStr, mesStr, diaStr] = dataStr.split('-');
  const ano = parseInt(anoStr, 10);
  const mesIdx = parseInt(mesStr, 10) - 1;
  const dia = parseInt(diaStr, 10);
  if (dia <= cartao.dia_fechamento) return mesReferenciaStr(ano, mesIdx);
  const proximo = subtrairMeses(ano, mesIdx, -1);
  return mesReferenciaStr(proximo.ano, proximo.mes);
}

// Formata no padrão brasileiro: R$ 1.000,50 (ponto no milhar, vírgula no decimal).
// Intl.NumberFormat cuida disso e é nativo — sem dependência extra.
const FORMATADOR_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatarMoeda(v) {
  const numero = Number(v);
  if (Number.isNaN(numero)) return 'R$ 0,00';
  return FORMATADOR_BRL.format(numero);
}

export function parseOFX(texto) {
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const transacoes = [];

  blocos.forEach((bloco) => {
    const corpo = bloco.split(/<\/STMTTRN>/i)[0];
    const extrair = (tag) => {
      const m = corpo.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const dataRaw = extrair('DTPOSTED');
    const valorRaw = extrair('TRNAMT');
    const memo = extrair('MEMO') || extrair('NAME');
    const fitid = extrair('FITID');

    if (!dataRaw || !valorRaw) return;

    const ano = dataRaw.slice(0, 4);
    const mes = dataRaw.slice(4, 6);
    const dia = dataRaw.slice(6, 8);
    const valor = parseFloat(valorRaw.replace(',', '.'));
    if (Number.isNaN(valor)) return;

    transacoes.push({
      data: `${ano}-${mes}-${dia}`,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      descricao: memo || 'Importado do extrato',
      referencia_externa: fitid ? `${fitid}:${ano}-${mes}-${dia}` : null,
      ehCredito: valor < 0,
      incluir: true,
    });
  });

  return transacoes;
}

// Converte um valor monetário em texto para número, aceitando os dois formatos:
//   brasileiro:     1.234,56  ou  -45,90
//   internacional:  1,234.56  ou  -45.90
//
// A regra: o último separador que aparecer é o decimal — exceto quando ele é
// seguido de exatamente 3 dígitos e o número não tem separador de outro tipo
// (1.234 / 1.234.567). Aí é separador de milhar, não decimal: dinheiro não
// costuma ter 3 casas decimais.
export function parseValorMonetario(texto) {
  const limpo = (texto || '').trim().replace(/[^\d.,-]/g, '');
  if (!limpo) return NaN;

  const negativo = limpo.startsWith('-');
  const semSinal = limpo.replace(/-/g, '');

  const ultimaVirgula = semSinal.lastIndexOf(',');
  const ultimoPonto = semSinal.lastIndexOf('.');
  const ultimoSep = Math.max(ultimaVirgula, ultimoPonto);

  let normalizado;
  if (ultimoSep === -1) {
    normalizado = semSinal;
  } else {
    const casasDepois = semSinal.length - ultimoSep - 1;
    const separador = ultimoSep === ultimaVirgula ? ',' : '.';
    const ocorrencias = semSinal.split(separador).length - 1;
    const parteInteira = semSinal.slice(0, ultimoSep).replace(/[.,]/g, '');
    const temAmbos = ultimaVirgula !== -1 && ultimoPonto !== -1;

    const ehMilhar = casasDepois === 3 && !temAmbos && (ocorrencias > 1 || parteInteira.length <= 3);

    normalizado = ehMilhar
      ? semSinal.replace(/[.,]/g, '')
      : `${parteInteira}.${semSinal.slice(ultimoSep + 1)}`;
  }

  const numero = parseFloat(normalizado);
  if (Number.isNaN(numero)) return NaN;
  return negativo ? -numero : numero;
}

// Tira acentos para comparar cabeçalhos ("Histórico" → "historico").
function semAcento(texto) {
  return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Faturas de cart\u00e3o trazem mais de uma coluna "valor" (o C6 exporta
// "Valor (em US$)", "Cota\u00e7\u00e3o (em R$)" e "Valor (em R$)"). As de moeda
// estrangeira v\u00eam zeradas em compra nacional \u2014 pegar a primeira que casa
// zera a importa\u00e7\u00e3o inteira.
const COLUNA_MOEDA_ESTRANGEIRA = /us\$|usd|dolar|cotacao|iof/;
const COLUNA_MOEDA_LOCAL = /r\$|brl|reais|real/;

function escolherColunaValor(cabecalho) {
  const candidatos = cabecalho
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.includes('valor') || h.includes('amount'));

  if (candidatos.length === 0) return -1;

  const emReais = candidatos.filter(({ h }) => COLUNA_MOEDA_LOCAL.test(h) && !COLUNA_MOEDA_ESTRANGEIRA.test(h));
  if (emReais.length > 0) return emReais[emReais.length - 1].i;

  const semEstrangeira = candidatos.filter(({ h }) => !COLUNA_MOEDA_ESTRANGEIRA.test(h));
  const lista = semEstrangeira.length > 0 ? semEstrangeira : candidatos;
  // O valor final costuma ser a \u00faltima coluna de valor da linha.
  return lista[lista.length - 1].i;
}

// Pagamento da fatura anterior / estorno: vem no CSV do cart\u00e3o como cr\u00e9dito,
// mas n\u00e3o \u00e9 compra. Detectado pela descri\u00e7\u00e3o \u2014 o sinal negativo sozinho n\u00e3o
// serve, porque em extrato de conta negativo \u00e9 despesa leg\u00edtima.
const DESCRICAO_PAGAMENTO = /pag(?:to|amento)?\s*(?:de\s*)?fatura|pagamento\s+recebido|estorno/i;

export function parseCSVExtrato(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];

  const separador = linhas[0].includes(';') ? ';' : ',';
  const cabecalho = linhas[0].split(separador).map((h) => semAcento(h.trim().toLowerCase()));

  const idxData = cabecalho.findIndex((h) => h.includes('data') || h.includes('date'));
  const idxValor = escolherColunaValor(cabecalho);
  const idxDescricao = cabecalho.findIndex((h) => h.includes('desc') || h.includes('histor') || h.includes('memo') || h.includes('titulo'));

  if (idxData === -1 || idxValor === -1) return [];

  const transacoes = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = linhas[i].split(separador);
    const dataTexto = (campos[idxData] || '').trim();
    const valor = parseValorMonetario(campos[idxValor]);
    if (!dataTexto || Number.isNaN(valor)) continue;

    let dataISO = dataTexto;
    const partesData = dataTexto.split('/');
    if (partesData.length === 3) {
      const anoTexto = partesData[2].length === 2 ? `20${partesData[2]}` : partesData[2];
      dataISO = `${anoTexto}-${partesData[1].padStart(2, '0')}-${partesData[0].padStart(2, '0')}`;
    }

    const descricao = idxDescricao >= 0 ? (campos[idxDescricao] || '').trim() : 'Importado do extrato';
    const ehPagamentoFatura = DESCRICAO_PAGAMENTO.test(descricao);

    transacoes.push({
      data: dataISO,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      descricao,
      referencia_externa: null,
      // Crédito na fatura (pagamento/estorno): não é compra. Fica visível no
      // preview, mas desmarcado — quem importa decide.
      ehCredito: valor < 0,
      ehPagamentoFatura,
      incluir: !ehPagamentoFatura,
    });
  }
  return transacoes;
}

// Parte pura: dado o saldo inicial e as transações, qual o saldo atual.
// Separada do acesso ao banco para poder ser testada isoladamente.
export function calcularSaldoConta(saldoInicial, transacoes) {
  const soma = (transacoes || []).reduce(
    (s, t) => s + (t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor)),
    0,
  );
  return Number(saldoInicial) + soma;
}

// Data real de vencimento de uma ocorrência mensal.
// mesReferencia: string 'YYYY-MM-DD' (o dia é ignorado, conta só ano+mês).
// diaReferencia: dia do mês em que o lançamento fixo vence (1-31).
// Retorna um Date no início do dia de vencimento.
export function vencimentoOcorrencia(mesReferencia, diaReferencia) {
  const [ano, mes] = mesReferencia.slice(0, 7).split('-').map(Number);
  const dia = Number(diaReferencia) || 1;
  // Clampa o dia ao último dia do mês (ex: dia 31 em fevereiro vira 28/29).
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const diaValido = Math.min(dia, ultimoDia);
  const d = new Date(ano, mes - 1, diaValido);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Dias corridos entre hoje e o vencimento. Negativo = atrasado.
// Ex: -3 significa "venceu há 3 dias"; +2 significa "vence em 2 dias".
export function diasAteVencimento(mesReferencia, diaReferencia, hoje = new Date()) {
  const venc = vencimentoOcorrencia(mesReferencia, diaReferencia);
  const base = new Date(hoje);
  base.setHours(0, 0, 0, 0);
  return Math.round((venc - base) / 86400000);
}