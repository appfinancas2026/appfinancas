export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY não configurada.' }, { status: 500 });
  }

  const body = await request.json();
  const { texto } = body;

  if (!texto || texto.trim().length < 20) {
    return Response.json({ error: 'Texto do extrato muito curto ou vazio.' }, { status: 400 });
  }

  const sistema = `Você interpreta extratos bancários brasileiros e extrai as transações.

Analise o texto do extrato e retorne APENAS um JSON válido, sem markdown, sem crases, sem texto antes ou depois:
{ "transacoes": [ { "data": "AAAA-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida", "referencia_externa": string | null } ] }

Regras:
- "data" sempre no formato ISO AAAA-MM-DD. Se o extrato mostrar DD/MM sem ano, deduza o ano pelo cabeçalho do período.
- "valor" sempre positivo (o tipo já indica a direção).
- "tipo": "entrada" se o valor entrou na conta (recebimento, depósito, Pix recebido). "saida" se saiu (pagamento, Pix enviado, débito, tarifa).
- "descricao" deve ser clara e curta. Remova prefixos redundantes como "Pix recebido de", "Pix enviado para" — deixe só o nome/estabelecimento e o tipo resumido. Ex: "PIX • Ricardo Meira", "Pagamento • Aluguel", "C6TAG • Pedágio".
- "referencia_externa" é o ID único da transação (se existir no extrato). Serve para evitar importações duplicadas. Se não houver, use null.
- Ignore linhas de saldo ("Saldo do dia", "Saldo final", "Saldo inicial"), cabeçalhos de mês e totais de período — essas NÃO são transações.
- Se houver ambiguidade sobre ser entrada ou saída, use o sinal do valor ou a coluna "Tipo" do extrato.
- Retorne todas as transações encontradas, sem limite.`;

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
        max_tokens: 4096,
        system: sistema,
        messages: [{ role: 'user', content: `Extrato bancário:\n\n${texto}` }],
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
  const textoResposta = dados?.content?.find((b) => b.type === 'text')?.text || '{}';

  try {
    const limpo = textoResposta.replace(/```json|```/g, '').trim();
    const extraido = JSON.parse(limpo);
    const transacoes = (extraido.transacoes || []).map((t) => ({
      ...t,
      incluir: true,
    }));
    return Response.json({ transacoes });
  } catch {
    return Response.json({ error: 'Não foi possível interpretar a resposta da IA.' }, { status: 502 });
  }
}
