// Extrai o primeiro bloco JSON válido do texto, mesmo que venha com
// texto antes/depois ou entre crases. Mais robusto que replace simples.
export function extrairJSON(texto) {
  // Tenta o texto limpo direto
  const limpo = texto.replace(/```json|```/g, '').trim();
  try { return JSON.parse(limpo); } catch {}

  // Procura o primeiro { ou [ e tenta parsear a partir daí
  const inicio = limpo.search(/[{[]/);
  if (inicio === -1) throw new Error('Nenhum JSON encontrado');

  // Tenta do primeiro { até o fim
  try { return JSON.parse(limpo.slice(inicio)); } catch {}

  // Procura o último } ou ] e tenta o bloco entre { e }
  const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
  if (fim === -1) throw new Error('JSON incompleto');

  return JSON.parse(limpo.slice(inicio, fim + 1));
}
