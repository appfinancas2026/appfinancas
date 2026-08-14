import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../_shared/rateLimit.js';
import { extrairJSON } from '../_shared/extrairJSON.js';

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

  const { historico, rendaMedia, mesesAnalisados, mesesReais } = await request.json();

  if (!historico || historico.length === 0) {
    return Response.json({ error: 'Sem histórico suficiente para análise.' }, { status: 400 });
  }

  const sistema = `Você é um consultor financeiro pessoal especializado em finanças brasileiras.
Analise o histórico de gastos e gere um orçamento mensal saudável e realista.

Responda APENAS com JSON válido, sem markdown, sem crases:
{
  "resumo": string (2-3 frases sobre a situação financeira atual),
  "alertas": [ string ] (até 3 alertas importantes — direto e específico),
  "recomendacoes": [ string ] (até 3 ações práticas — comece com verbo),
  "categorias": [
    {
      "categoria": string,
      "media_gasta": number,
      "sugestao": number,
      "status": "saudável" | "atenção" | "crítico",
      "justificativa": string (1 frase curta)
    }
  ],
  "sobra_sugerida": number
}

Regras:
- Use a regra 50/30/20 como referência, adaptada à realidade brasileira.
- Essenciais (moradia, alimentação, transporte, saúde): aceite até 60% da renda, alerte se passar de 50%.
- A "sugestao" deve ser realista — não corte mais de 30% do que a pessoa gasta, salvo caso crítico.
- "status": saudável = dentro do recomendado; atenção = acima mas controlável; crítico = muito acima.
- "sobra_sugerida" = renda - soma das sugestões.
- Escreva em português do Brasil, tom consultivo mas direto.`;

  const histFormatado = historico.map((h) =>
    `${h.categoria}: média R$ ${h.media.toFixed(2)}/mês (essencialidade: ${h.essencialidade || 'não classificada'})`
  ).join('\n');

  const aviso = mesesReais < 3
    ? `\nATENÇÃO: O histórico tem apenas ${mesesReais} ${mesesReais === 1 ? 'mês' : 'meses'} de dados (o ideal é 3). Mencione isso no resumo e seja conservador nas sugestões — elas ficarão mais precisas com mais histórico.`
    : '';

  const prompt = `Período analisado: ${mesesReais} ${mesesReais === 1 ? 'mês' : 'meses'} de histórico real
Renda média mensal: R$ ${rendaMedia.toFixed(2)}

Gastos médios mensais por categoria:
${histFormatado}
${aviso}
Gere o orçamento inteligente.`;

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
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: prompt },
        ],
        max_tokens: 2048,
        temperature: 0.2,
      }),
    });
  } catch {
    return Response.json({ error: 'Falha ao contatar a API da IA.' }, { status: 502 });
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    return Response.json({ error: `Erro na API: ${detalhe.slice(0, 200)}` }, { status: 502 });
  }

  const dados = await resposta.json();
  const texto = dados?.choices?.[0]?.message?.content || '{}';

  try {
    const extraido = extrairJSON(texto);
    return Response.json(extraido);
  } catch {
    return Response.json({ error: `Não foi possível interpretar a resposta da IA. Resposta bruta: ${String(texto || '').slice(0, 300)}` }, { status: 502 });
  }
}
