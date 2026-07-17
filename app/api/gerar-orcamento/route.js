export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY não configurada.' }, { status: 500 });
  }

  const { historico, rendaMedia, mesesAnalisados } = await request.json();

  if (!historico || historico.length === 0) {
    return Response.json({ error: 'Sem histórico suficiente para análise.' }, { status: 400 });
  }

  const sistema = `Você é um consultor financeiro pessoal especializado em finanças brasileiras.
Analise o histórico de gastos e receitas de um usuário e gere um orçamento mensal saudável e realista.

Responda APENAS com JSON válido, sem markdown, sem crases, no formato exato:
{
  "resumo": string (2-3 frases sobre a situação financeira atual),
  "alertas": [ string ] (até 3 alertas mais importantes — seja direto e específico),
  "recomendacoes": [ string ] (até 3 ações práticas para melhorar — comece com verbo),
  "categorias": [
    {
      "categoria": string,
      "media_gasta": number,
      "sugestao": number,
      "status": "saudável" | "atenção" | "crítico",
      "justificativa": string (1 frase curta explicando o limite sugerido)
    }
  ],
  "sobra_sugerida": number (o que deveria sobrar por mês após o orçamento)
}

Regras para o orçamento:
- Use a regra 50/30/20 como referência (50% necessidades, 30% desejos, 20% reserva/poupança), adaptada à realidade brasileira.
- Essenciais (moradia, alimentação, transporte, saúde): aceite até 60% da renda se necessário, mas alerte se passar de 50%.
- Desejos (lazer, restaurante, vestuário): limite a 30%.
- A "sugestao" deve ser REALISTA — não corte mais de 30% do que a pessoa gasta, a menos que seja crítico.
- "status": saudável = dentro do limite saudável para a categoria; atenção = acima do recomendado mas controlável; crítico = muito acima ou comprometendo a saúde financeira.
- Se uma categoria for claramente eventual (presente, viagem), estime um valor mensal proporcional.
- Calcule a "sobra_sugerida" como: renda - soma das sugestões. Se negativa, avise no resumo.
- Escreva em português do Brasil, tom consultivo mas direto. Sem jargões.`;

  const histFormatado = historico.map((h) =>
    `${h.categoria}: média R$ ${h.media.toFixed(2)}/mês (essencialidade: ${h.essencialidade || 'não classificada'})`
  ).join('\n');

  const prompt = `Período analisado: últimos ${mesesAnalisados} meses
Renda média mensal: R$ ${rendaMedia.toFixed(2)}

Gastos médios mensais por categoria:
${histFormatado}

Gere o orçamento inteligente.`;

  let resposta;
  try {
    resposta = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: sistema,
        messages: [{ role: 'user', content: prompt }],
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
  const texto = dados?.content?.find((b) => b.type === 'text')?.text || '{}';

  try {
    const limpo = texto.replace(/```json|```/g, '').trim();
    return Response.json(JSON.parse(limpo));
  } catch {
    return Response.json({ error: 'Não foi possível interpretar a resposta da IA.' }, { status: 502 });
  }
}
