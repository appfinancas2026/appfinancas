export async function POST(request) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GOOGLE_API_KEY não configurada no servidor.' }, { status: 500 });
  }

  const body = await request.json();
  const hoje = new Date().toISOString().slice(0, 10);

  const promptSistema = `Você extrai dados de um gasto ou receita financeira a partir de uma foto de comprovante/nota fiscal ou de um texto livre em português do Brasil.
Responda APENAS com um JSON válido, sem markdown, sem crases, sem texto antes ou depois, no formato exato:
{"valor": number ou null, "data": "AAAA-MM-DD", "categoria": string, "descricao": string, "tipo": "entrada" ou "saida"}
Regras:
- Se a data não for mencionada ou não estiver visível, use "${hoje}".
- "tipo" é "saida" na grande maioria dos casos (compra, conta, gasto). Só use "entrada" se for claramente um recebimento (salário, venda, pagamento recebido).
- "categoria" deve ser uma palavra ou expressão curta (ex: "Alimentação", "Transporte", "Mercado", "Farmácia").
- "descricao" deve ser curta, com o nome do estabelecimento ou do gasto.
- Se não conseguir identificar o valor com confiança, retorne "valor": null.`;

  const parts = [];

  if (body.imagemBase64) {
    parts.push({ inlineData: { mimeType: body.tipoMime || 'image/jpeg', data: body.imagemBase64 } });
    parts.push({ text: 'Extraia os dados do gasto mostrado nesta imagem de comprovante ou nota fiscal.' });
  } else if (body.texto) {
    parts.push({ text: `Extraia os dados do seguinte gasto ou receita descrito em texto: "${body.texto}"` });
  } else {
    return Response.json({ error: 'Nenhuma imagem ou texto foi enviado.' }, { status: 400 });
  }

  let resposta;
  try {
    resposta = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: promptSistema }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.1 },
        }),
      }
    );
  } catch {
    return Response.json({ error: 'Falha ao contatar a API da IA.' }, { status: 502 });
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    return Response.json({ error: `Erro na API: ${detalhe.slice(0, 300)}` }, { status: 502 });
  }

  const dados = await resposta.json();
  const texto = dados?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

  try {
    const limpo = texto.replace(/```json|```/g, '').trim();
    return Response.json(JSON.parse(limpo));
  } catch {
    return Response.json({ error: 'Não foi possível interpretar a resposta da IA.' }, { status: 502 });
  }
}
