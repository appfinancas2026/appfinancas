import { supabase } from './supabase';

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

export function formatarMoeda(v) {
  return `R$ ${Number(v).toFixed(2)}`;
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

export function parseCSVExtrato(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];

  const separador = linhas[0].includes(';') ? ';' : ',';
  const cabecalho = linhas[0].split(separador).map((h) => h.trim().toLowerCase());

  const idxData = cabecalho.findIndex((h) => h.includes('data') || h.includes('date'));
  const idxValor = cabecalho.findIndex((h) => h.includes('valor') || h.includes('amount'));
  const idxDescricao = cabecalho.findIndex((h) => h.includes('desc') || h.includes('histor') || h.includes('memo') || h.includes('titulo'));

  if (idxData === -1 || idxValor === -1) return [];

  const transacoes = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = linhas[i].split(separador);
    const dataTexto = (campos[idxData] || '').trim();
    const valorTexto = (campos[idxValor] || '').trim().replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(valorTexto);
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

export async function recalcularSaldoConta(contaId) {
  const { data: contaAtual } = await supabase.from('contas').select('saldo_inicial').eq('id', contaId).single();
  if (!contaAtual) return;

  const { data: txs } = await supabase.from('transacoes').select('valor, tipo').eq('conta_id', contaId);
  const soma = (txs || []).reduce((s, t) => s + (t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor)), 0);

  await supabase.from('contas').update({ saldo_atual: Number(contaAtual.saldo_inicial) + soma }).eq('id', contaId);
}
