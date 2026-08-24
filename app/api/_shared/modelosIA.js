// Modelo Groq ativo para todas as rotas de IA.
// Trocar aqui reflete em extrair-gasto, extrair-extrato, gerar-orcamento,
// assistente e enviarInsights de uma só vez.
// qwen3.6-27b é multimodal (texto + visão), substituindo os modelos descontinuados:
//   llama-3.2-11b-vision-preview (EOL 04/2025) e llama-3.3-70b-versatile (EOL 08/2026).
export const MODELO_TEXTO = 'qwen/qwen3.6-27b';
export const MODELO_VISAO = 'qwen/qwen3.6-27b';
export const MODELO_IA    = 'qwen/qwen3.6-27b';
