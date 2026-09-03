// Regex: linha que começa com DD/MM seguido de espaço E contém valor monetário N,NN
const RE_DATA = /^\d{2}\/\d{2}\s/;
const RE_VALOR = /\d+,\d{2}/;

// Tolerante a variações: "Vencimento:", "Vence em", "Vence:", "Data de Vencimento"
const RE_VENCIMENTO = /(?:vencimento|vence(?:\s+em)?|data\s+de\s+vencimento)\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i;

function extrairVencimento(textoCompleto) {
  const m = RE_VENCIMENTO.exec(textoCompleto);
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  return `${aaaa}-${mm}-${dd}`;
}

export function extrairLinhasTransacaoFatura(textoCompleto) {
  const vencimento = extrairVencimento(textoCompleto);
  const linhas = textoCompleto.split('\n');
  const filtradas = linhas.filter((l) => RE_DATA.test(l) && RE_VALOR.test(l));
  if (filtradas.length === 0) return { texto: textoCompleto, encontradas: 0, vencimento };
  return { texto: filtradas.join('\n'), encontradas: filtradas.length, vencimento };
}
