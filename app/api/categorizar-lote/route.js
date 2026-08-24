import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../_shared/rateLimit.js';
import { extrairJSON } from '../_shared/extrairJSON.js';
import { MODELO_IA } from '../_shared/modelosIA.js';

const TAMANHO_BLOCO = 40;

// Chama a IA para um bloco de até 40 descrições.
// Retorna [{descricao, categoria}] na mesma ordem. Em caso de falha por item,
// usa 'Outros' para aquela linha — nunca quebra o lote inteiro.
async function categorizarBloco(descricoes, categorias, apiKey) {
  const listaCategs = categorias.join(', ');
  const listaDesc = descricoes.map((d, i) => `${i + 1}. "${d}"`).join('\n');

  const sistema = `Você categoriza transações financeiras brasileiras.
Categorias disponíveis: ${listaCategs}.
Retorne APENAS JSON válido, sem markdown, sem crases:
{"categorias":[{"descricao":string,"categoria":string}]}
Regras:
- Escolha APENAS uma categoria da lista acima para cada item.
- Se nenhuma se encaixar, use "Outros".
- Mantenha a MESMA ordem e a MESMA quantidade das descrições recebidas.
- Não adicione campos extras.`;

  let resposta;
  try {
    resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELO_IA,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: `Categorize estas transações:\n${listaDesc}` },
        ],
        max_tokens: 1024,
        temperature: 0.1,
      }),
    });
  } catch {
    return descricoes.map((d) => ({ descricao: d, categoria: 'Outros' }));
  }

  if (!resposta.ok) {
    return descricoes.map((d) => ({ descricao: d, categoria: 'Outros' }));
  }

  const dados = await resposta.json();
  const texto = dados?.choices?.[0]?.message?.content || '{}';

  try {
    const extraido = extrairJSON(texto);
    const cats = extraido.categorias || [];
    // Alinha pelo índice; se a IA devolveu menos itens, completa com 'Outros'.
    return descricoes.map((d, i) => ({
      descricao: d,
      categoria: cats[i]?.categoria || 'Outros',
    }));
  } catch {
    return descricoes.map((d) => ({ descricao: d, categoria: 'Outros' }));
  }
}

export async function POST(request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GROQ_API_KEY não configurada.' }, { status: 500 });
  }

  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!checkRateLimit(user.id)) return Response.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });

  const { descricoes, categorias } = await request.json();

  if (!Array.isArray(descricoes) || descricoes.length === 0) {
    return Response.json({ error: 'Lista de descrições vazia.' }, { status: 400 });
  }
  if (!Array.isArray(categorias) || categorias.length === 0) {
    return Response.json({ error: 'Lista de categorias vazia.' }, { status: 400 });
  }

  // Lotes de TAMANHO_BLOCO para não estourar contexto em faturas grandes.
  // As chamadas são sequenciais dentro da rota — rate limit por usuário aplica.
  const blocos = [];
  for (let i = 0; i < descricoes.length; i += TAMANHO_BLOCO) {
    blocos.push(descricoes.slice(i, i + TAMANHO_BLOCO));
  }

  const resultados = [];
  for (const bloco of blocos) {
    const res = await categorizarBloco(bloco, categorias, apiKey);
    resultados.push(...res);
  }

  return Response.json({ categorias: resultados });
}
