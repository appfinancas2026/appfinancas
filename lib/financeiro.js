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
    const valor = parseFloat(valorRaw);
    if (Number.isNaN(valor)) return;

    transacoes.push({
      data: `${ano}-${mes}-${dia}`,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      descricao: memo || 'Importado do extrato',
      referencia_externa: fitid || null,
      incluir: true,
    });
  });

  return transacoes;
}

// Converte um valor monetário em texto para número, aceitando os dois formatos:
//   brasileiro:     1.234,56  ou  -45,90
//   internacional:  1,234.56  ou  -45.90
// A regra: o último separador que aparecer é o decimal; o resto é milhar.
export function parseValorMonetario(texto) {
  const limpo = (texto || '').trim().replace(/[^\d.,-]/g, '');
  if (!limpo) return NaN;

  const ultimaVirgula = limpo.lastIndexOf(',');
  const ultimoPonto = limpo.lastIndexOf('.');

  let normalizado;
  if (ultimaVirgula === -1 && ultimoPonto === -1) {
    normalizado = limpo;
  } else if (ultimaVirgula > ultimoPonto) {
    // Vírgula é o decimal: tira os pontos (milhar) e troca a vírgula por ponto.
    normalizado = limpo.replace(/\./g, '').replace(',', '.');
  } else {
    // Ponto é o decimal: tira as vírgulas (milhar).
    normalizado = limpo.replace(/,/g, '');
  }

  return parseFloat(normalizado);
}

// Tira acentos para comparar cabeçalhos ("Histórico" → "historico").
function semAcento(texto) {
  return (texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function parseCSVExtrato(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];

  const separador = linhas[0].includes(';') ? ';' : ',';
  const cabecalho = linhas[0].split(separador).map((h) => semAcento(h.trim().toLowerCase()));

  const idxData = cabecalho.findIndex((h) => h.includes('data') || h.includes('date'));
  const idxValor = cabecalho.findIndex((h) => h.includes('valor') || h.includes('amount'));
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

    transacoes.push({
      data: dataISO,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      descricao: idxDescricao >= 0 ? (campos[idxDescricao] || '').trim() : 'Importado do extrato',
      referencia_externa: null,
      incluir: true,
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