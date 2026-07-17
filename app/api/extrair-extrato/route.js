export async function POST(request) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GOOGLE_API_KEY não configurada.' }, { status: 500 });
  }

  const { texto } = await request.json();

  if (!texto || texto.trim().length < 20) {
    return Response.json({ error: 'Texto do extrato muito curto ou vazio.' }, { status: 400 });
  }

  const sistema = `Você interpreta extratos bancários brasileiros e extrai as transações.

Analise o texto do extrato e retorne APENAS um JSON válido, sem markdown, sem crases, sem texto antes ou depois:
{ "transacoes": [ { "data": "AAAA-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida", "referencia_externa": string | null } ] }

Regras:
- "data" sempre no formato ISO AAAA-MM-DD. Se o extrato mostrar DD/MM sem ano, deduza o ano pelo cabeçalho do período.
- "valor" sempre positivo (o tipo já indica a direção).
- "tipo": "entrada" se o valor entrou na conta. "saida" se saiu.
- "descricao" deve ser clara e curta. Remova prefixos redundantes como "Pix recebido de", "Pix enviado para".
- "referencia_externa" é o ID único da transação (se existir no extrato). Se não houver, use null.
- Ignore linhas de saldo, cabeçalhos de mês e totais de período.
- Retorne todas as transações encontradas, sem limite.`;

  let resposta;
  try {
    resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{ role: 'user', parts: [{ text: `Extrato bancário:\n\n${texto}` }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
        }),
      }
    );
  } catch {
    return Response.json({ error: 'Falha ao contatar a API da IA.' }, { status: 502 });
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    return Response.json({ error: `Erro na API: ${detalhe.slice(0, 200)}` }, { status: 502 });
  }

  const dados = await resposta.json();
  const textoResposta = dados?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    const limpo = textoResposta.replace(/```json|```/g, '').trim();
    const extraido = JSON.parse(limpo);
    const transacoes = (extraido.transacoes || []).map((t) => ({ ...t, incluir: true }));
    return Response.json({ transacoes });
  } catch {
    return Response.json({ error: 'Não foi possível interpretar a resposta da IA.' }, { status: 502 });
  }
}
