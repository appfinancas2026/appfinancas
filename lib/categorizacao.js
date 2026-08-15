// Lógica pura de categorização por histórico — sem acesso ao banco, sem React.
//
// Estratégia de casamento (em ordem de confiança decrescente):
//   1. EXATO: descrição normalizada idêntica.
//   2. SUBSTRING FORTE: uma contém a outra inteiramente (min 4 chars úteis).
//   3. MULTI-TOKEN: ≥ 2 tokens significativos em comum.
//      Exceção — TOKEN DISTINTIVO: 1 token longo (≥ 5 chars) que aparece em
//      ≤ 2 categorias distintas no histórico também qualifica.
//   → null se nenhuma camada qualificar (candidato a IA).

import { normalizarDescricao } from './financeiro.js';

const MIN_TOKEN_LEN = 3;        // tokens menores que isso são ignorados
const MIN_SUBSTRING_LEN = 4;   // entrada do histórico deve ter ≥ 4 chars para substring
const MIN_TOKEN_DISTINTIVO = 5; // token deve ter ≥ 5 chars para ser "distintivo"
const MAX_CATS_DISTINTIVO = 2;  // token aparece em no máximo 2 categorias distintas

function tokenizar(textoNormalizado) {
  return textoNormalizado.split(' ').filter((t) => t.length >= MIN_TOKEN_LEN);
}

// Pré-computa token → Set<categoria> para checagem de distintividade.
function buildTokenCatMap(hist) {
  const map = new Map();
  for (const h of hist) {
    const cat = (h.categoria || '').trim();
    for (const tok of h._tokens) {
      if (!map.has(tok)) map.set(tok, new Set());
      map.get(tok).add(cat);
    }
  }
  return map;
}

// Um token é "distintivo" se for longo o suficiente e aparecer em poucas categorias.
function eDistintivo(token, tokenCatMap) {
  if (token.length < MIN_TOKEN_DISTINTIVO) return false;
  const cats = tokenCatMap.get(token);
  return !!cats && cats.size <= MAX_CATS_DISTINTIVO;
}

// Retorna { categoria, essencialidade } | null pelo maior número de votos.
function modaPorCategoria(entradas) {
  if (entradas.length === 0) return null;

  const votos = {};
  for (const e of entradas) {
    const cat = (e.categoria || '').trim();
    if (!cat) continue;
    votos[cat] = (votos[cat] || 0) + 1;
  }

  const melhorCat = Object.entries(votos).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!melhorCat) return null;

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

  // Pré-processa o histórico: normaliza + tokeniza.
  const hist = historico
    .filter((h) => h.categoria && h.descricao)
    .map((h) => {
      const norm = normalizarDescricao(h.descricao);
      return { ...h, _norm: norm, _tokens: tokenizar(norm) };
    });

  if (hist.length === 0) return null;

  // ── Camada 1: match exato ─────────────────────────────────────────────────
  const matchesExatos = hist.filter((h) => h._norm === descNorm);
  if (matchesExatos.length > 0) {
    const moda = modaPorCategoria(matchesExatos);
    if (moda) return { ...moda, origem: 'historico', confianca: 'alta' };
  }

  // ── Camada 2: substring forte ─────────────────────────────────────────────
  // Uma contém a outra por completo. A entrada do histórico deve ter ao menos
  // MIN_SUBSTRING_LEN chars para evitar tokens triviais como "eu" ou "ok".
  const matchesSubstring = hist.filter((h) =>
    h._norm.length >= MIN_SUBSTRING_LEN &&
    (descNorm.includes(h._norm) || h._norm.includes(descNorm))
  );
  if (matchesSubstring.length > 0) {
    const moda = modaPorCategoria(matchesSubstring);
    if (moda) return { ...moda, origem: 'historico', confianca: 'alta' };
  }

  // ── Camada 3: multi-token ou token distintivo ─────────────────────────────
  const tokensDesc = tokenizar(descNorm);
  if (tokensDesc.length === 0) return null;

  const tokensSet = new Set(tokensDesc);
  const tokenCatMap = buildTokenCatMap(hist);

  const matchesToken = hist.filter((h) => {
    const comuns = h._tokens.filter((t) => tokensSet.has(t));
    if (comuns.length >= 2) return true;
    if (comuns.length === 1 && eDistintivo(comuns[0], tokenCatMap)) return true;
    return false;
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
