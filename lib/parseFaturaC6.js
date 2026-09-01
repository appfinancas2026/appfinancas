// Nomes normalizados dos títulos esperados
const TITULO_DATA = 'data de compra';
const TITULO_DESCRICAO = 'descricao';
const TITULO_PARCELA = 'parcela';
const TITULO_VALOR_BRL = 'valor (em r$)';

// Replica o padrão de parseCSVExtrato — pagamento/estorno pela descrição
const DESCRICAO_PAGAMENTO = /pag(?:to|amento)?\s*(?:de\s*)?fatura|pagamento\s+recebido|estorno/i;

function normalizarTitulo(texto) {
  return (texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function dataISOdeDDMMAA(texto) {
  const s = String(texto || '').trim();
  const partes = s.split('/');
  if (partes.length !== 3) return null;
  const [dd, mm, aaaa] = partes;
  const ano = aaaa.length === 2 ? `20${aaaa}` : aaaa;
  if (!dd || !mm || !ano) return null;
  return `${ano}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Recebe as linhas brutas da planilha (array de arrays já lido pelo SheetJS)
 * e devolve transações no formato do preview de importação de fatura.
 *
 * @param {Array<Array<any>>} linhas - Linhas da planilha, cada uma como array de células.
 * @returns {Array<Object>} Transações no formato do preview.
 */
export function parseFaturaC6(linhas) {
  if (!linhas || linhas.length === 0) return [];

  // Acha dinamicamente a linha de títulos (contém "Data de compra")
  let idxTitulos = -1;
  let idxData = -1, idxDescricao = -1, idxParcela = -1, idxValorBRL = -1;

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!Array.isArray(linha)) continue;
    const normalizada = linha.map(normalizarTitulo);
    const posData = normalizada.indexOf(TITULO_DATA);
    if (posData === -1) continue;

    // Linha de títulos encontrada
    idxTitulos = i;
    idxData = posData;
    idxDescricao = normalizada.findIndex((h) => h === TITULO_DESCRICAO);
    idxParcela = normalizada.findIndex((h) => h === TITULO_PARCELA);
    idxValorBRL = normalizada.findIndex((h) => h === TITULO_VALOR_BRL);
    break;
  }

  if (idxTitulos === -1 || idxData === -1 || idxValorBRL === -1) return [];

  const transacoes = [];

  for (let i = idxTitulos + 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!Array.isArray(linha)) continue;

    const dataTexto = String(linha[idxData] ?? '').trim();
    const dataISO = dataISOdeDDMMAA(dataTexto);
    if (!dataISO) continue;

    const valorRaw = linha[idxValorBRL];
    const valor = typeof valorRaw === 'number' ? valorRaw : parseFloat(String(valorRaw).replace(',', '.'));
    if (Number.isNaN(valor)) continue;

    const descricaoBase = idxDescricao >= 0 ? String(linha[idxDescricao] ?? '').trim() : 'Importado';

    // Parcela: "Única" → sem sufixo; "9/10" → sufixo " (9/10)" na descrição
    let descricao = descricaoBase;
    if (idxParcela >= 0) {
      const parcela = String(linha[idxParcela] ?? '').trim();
      if (parcela && parcela !== 'Única' && parcela !== 'Unica' && /^\d+\/\d+$/.test(parcela)) {
        descricao = `${descricaoBase} (${parcela})`;
      }
    }

    const ehCredito = valor < 0;
    const ehPagamentoFatura = DESCRICAO_PAGAMENTO.test(descricaoBase);

    transacoes.push({
      data: dataISO,
      valor: Math.abs(valor),
      tipo: ehCredito ? 'entrada' : 'saida',
      descricao,
      referencia_externa: null,
      ehCredito,
      ehPagamentoFatura,
      incluir: !ehCredito,
      categoria: '',
      categoriaOrigem: null,
    });
  }

  return transacoes;
}
