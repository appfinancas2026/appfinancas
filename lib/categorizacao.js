// Lógica pura de categorização por histórico — sem acesso ao banco, sem React.
//
// Estratégia de casamento (em ordem de prioridade):
//   1. Match EXATO: descrição normalizada idêntica a alguma entrada do histórico.
//   2. Match por TOKENS: ao menos 1 token significativo (≥ 3 chars) em comum.
// Em ambos os casos, a categoria é escolhida por moda (mais frequente entre os
// matches). Retorna null se não houver nenhum match com tokens.

import { normalizarDescricao } from './financeiro.js';

// Tokens com menos de 3 chars são ignorados (artigos, preposições, siglas curtas).
const MIN_TOKEN_LEN = 3;

function tokenizar(textoNormalizado) {
  return textoNormalizado.split(' ').filter((t) => t.length >= MIN_TOKEN_LEN);
}

// Retorna { categoria, essencialidade } | null pelo maior número de votos.
// `entradas` é array de { categoria, essencialidade }.
function modaPorCategoria(entradas) {
  if (entradas.length === 0) return null;

  // Conta votos por categoria.
  const votos = {};
  for (const e of entradas) {
    const cat = (e.categoria || '').trim();
    if (!cat) continue;
    votos[cat] = (votos[cat] || 0) + 1;
  }

  const melhorCat = Object.entries(votos).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!melhorCat) return null;

  // Essencialidade mais frequente entre os matches da categoria vencedora.
  const essVotos = {};
  for (const e of entradas) {
    if ((e.categoria || '').trim() !== melhorCat) continue;
    const ess = (e.essencialidade || '').trim();
    if (ess) essVotos[ess] = (essVotos[ess] || 0) + 1;
  }
  const melhorEss = Object.entries(essVotos).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  return { categoria: melhorCat, essencialidade: melhorEss };
}

/**
 * Sugere categoria para uma transação com base no histórico já categorizado.
 *
 * @param {string} descricao - Descrição da transação a categorizar.
 * @param {Array<{descricao: string, categoria: string, essencialidade?: string}>} historico
 * @returns {{ categoria: string, essencialidade: string|null, origem: 'historico', confianca: 'alta'|'media' } | null}
 */
export function sugerirCategoriaPorHistorico(descricao, historico) {
  if (!descricao || !historico || historico.length === 0) return null;

  const descNorm = normalizarDescricao(descricao);
  if (!descNorm) return null;

  const tokensDesc = tokenizar(descNorm);

  // Pré-processa o histórico uma vez: normaliza + tokeniza.
  const hist = historico
    .filter((h) => h.categoria && h.descricao)
    .map((h) => ({
      ...h,
      _norm: normalizarDescricao(h.descricao),
      _tokens: null, // lazy
    }));

  // ── Passo 1: match exato ──────────────────────────────────────────────────
  const matchesExatos = hist.filter((h) => h._norm === descNorm);
  if (matchesExatos.length > 0) {
    const moda = modaPorCategoria(matchesExatos);
    if (moda) return { ...moda, origem: 'historico', confianca: 'alta' };
  }

  // ── Passo 2: match por tokens ─────────────────────────────────────────────
  if (tokensDesc.length === 0) return null;
  const tokensSet = new Set(tokensDesc);

  const matchesToken = hist.filter((h) => {
    const tokH = tokenizar(h._norm);
    return tokH.some((t) => tokensSet.has(t));
  });

  if (matchesToken.length === 0) return null;

  const moda = modaPorCategoria(matchesToken);
  if (!moda) return null;

  return { ...moda, origem: 'historico', confianca: 'media' };
}

/**
 * Aplica sugerirCategoriaPorHistorico para um lote de descrições.
 * As entradas com sugestao=null são candidatas à categorização por IA.
 *
 * @param {string[]} descricoes
 * @param {Array<{descricao: string, categoria: string, essencialidade?: string}>} historico
 * @returns {Array<{ descricao: string, sugestao: ReturnType<typeof sugerirCategoriaPorHistorico> }>}
 */
export function sugerirCategoriasEmLote(descricoes, historico) {
  return descricoes.map((descricao) => ({
    descricao,
    sugestao: sugerirCategoriaPorHistorico(descricao, historico),
  }));
}
