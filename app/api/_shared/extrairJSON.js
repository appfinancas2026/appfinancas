// Extrai o primeiro bloco JSON válido do texto, mesmo que venha com
// texto antes/depois, entre crases ou precedido de bloco <think>…</think>
// (modelos com raciocínio encadeado como Qwen3).
export function extrairJSON(texto) {
  // Remove bloco de thinking antes de qualquer processamento
  const semThinking = texto.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  // Tenta o texto limpo direto
  const limpo = semThinking.replace(/```json|```/g, '').trim();
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
