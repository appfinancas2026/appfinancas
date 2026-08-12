import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../_shared/rateLimit.js';

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

  const { pergunta, contexto, historico } = await request.json();

  if (!pergunta?.trim()) {
    return Response.json({ error: 'Pergunta vazia.' }, { status: 400 });
  }

  const sistema = `Você é o assistente financeiro do AppFinançasBr, um app de controle financeiro pessoal e empresarial brasileiro.

Seu papel é responder perguntas sobre as finanças do usuário com base nos dados reais fornecidos abaixo.
Seja direto, objetivo e fale em português do Brasil. Use valores em reais (R$) no formato brasileiro (R$ 1.234,56).

Regras:
- Responda apenas com base nos dados fornecidos. Se não tiver dados suficientes para responder, diga isso claramente.
- Para perguntas de análise (quanto gastei, qual categoria mais pesou, etc.), calcule e apresente os números.
- Para perguntas de conselho, baseie-se nos dados reais antes de dar sugestões.
- Seja conciso: 2-5 frases na maioria dos casos. Use listas só quando realmente ajudar.
- Nunca invente dados. Se não souber, diga que não tem essa informação disponível.
- Tom: consultor financeiro amigável, não robótico.

DADOS FINANCEIROS DO USUÁRIO:
${contexto}`;

  // Formata o histórico de conversa para o modelo
  const mensagens = [];
  for (const msg of (historico || [])) {
    mensagens.push({ role: msg.papel, content: msg.texto });
  }
  mensagens.push({ role: 'user', content: pergunta });

  let resposta;
  try {
    resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: sistema }, ...mensagens],
        max_tokens: 1024,
        temperature: 0.3,
      }),
    });
  } catch {
    return Response.json({ error: 'Falha ao contatar a IA.' }, { status: 502 });
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    return Response.json({ error: `Erro na API: ${detalhe.slice(0, 200)}` }, { status: 502 });
  }

  const dados = await resposta.json();
  const texto = dados?.choices?.[0]?.message?.content || '';

  return Response.json({ resposta: texto });
}
