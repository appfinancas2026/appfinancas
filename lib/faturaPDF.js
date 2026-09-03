// Regex: linha que começa com DD/MM seguido de espaço E contém valor monetário N,NN
const RE_DATA = /^\d{2}\/\d{2}\s/;
const RE_VALOR = /\d+,\d{2}/;

export function extrairLinhasTransacaoFatura(textoCompleto) {
  const linhas = textoCompleto.split('\n');
  const filtradas = linhas.filter((l) => RE_DATA.test(l) && RE_VALOR.test(l));
  if (filtradas.length === 0) return { texto: textoCompleto, encontradas: 0 };
  return { texto: filtradas.join('\n'), encontradas: filtradas.length };
}
