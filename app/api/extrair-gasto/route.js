
// Extrai o primeiro bloco JSON válido do texto, mesmo que venha com
// texto antes/depois ou entre crases. Mais robusto que replace simples.
function extrairJSON(texto) {
  // Tenta o texto limpo direto
  const limpo = texto.replace(/```json|```/g, '').trim();
  try { return JSON.parse(limpo); } catch {}

  // Procura o primeiro { ou [ e tenta parsear a partir daí
  const inicio = limpo.search(/[{[]/);
  if (inicio === -1) throw new Error('Nenhum JSON encontrado');

  // Tenta do primeiro { até o fim
  try { return JSON.parse(limpo.slice(inicio)); } catch {}

  // Procura o último } ou ] e tenta o bloco entre { e }
  const fim = Math.max(limpo.lastIndexOf('}'), limpo.lastIndexOf(']'));
  if (fim === -1) throw new Error('JSON incompleto');

  return JSON.parse(limpo.slice(inicio, fim + 1));
}

export async function POST(request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'GROQ_API_KEY não configurada no servidor.' }, { status: 500 });
  }

  const body = await request.json();
  const hoje = new Date().toISOString().slice(0, 10);

  const promptSistema = `Você extrai dados de um gasto ou receita financeira a partir de uma foto de comprovante/nota fiscal ou de um texto livre em português do Brasil.
Responda APENAS com um JSON válido, sem markdown, sem crases, sem texto antes ou depois, no formato exato:
{"valor": number ou null, "data": "AAAA-MM-DD", "categoria": string, "descricao": string, "tipo": "entrada" ou "saida"}
Regras:
- Se a data não for mencionada, use "${hoje}".
- "tipo" é "saida" na grande maioria dos casos. Só use "entrada" se for claramente um recebimento.
- "categoria" deve ser curta (ex: "Alimentação", "Transporte", "Mercado", "Farmácia").
- "descricao" deve ser curta, com o nome do estabelecimento ou do gasto.
- Se não conseguir identificar o valor com confiança, retorne "valor": null.`;

  const messages = [];

  if (body.imagemBase64) {
    // Groq suporta visão via llama-3.2-11b-vision-preview
    messages.push({
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${body.tipoMime || 'image/jpeg'};base64,${body.imagemBase64}` } },
        { type: 'text', text: 'Extraia os dados do gasto mostrado nesta imagem de comprovante ou nota fiscal.' },
      ],
    });
  } else if (body.texto) {
    messages.push({ role: 'user', content: `Extraia os dados do seguinte gasto ou receita: "${body.texto}"` });
  } else {
    return Response.json({ error: 'Nenhuma imagem ou texto foi enviado.' }, { status: 400 });
  }

  // Usa modelo com visão se tiver imagem, texto se não
  const modelo = body.imagemBase64 ? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile';

  let resposta;
  try {
    resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages: [{ role: 'system', content: promptSistema }, ...messages],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });
  } catch {
    return Response.json({ error: 'Falha ao contatar a API da IA.' }, { status: 502 });
  }

  if (!resposta.ok) {
    const detalhe = await resposta.text();
    return Response.json({ error: `Erro na API: ${detalhe.slice(0, 300)}` }, { status: 502 });
  }

  const dados = await resposta.json();
  const texto = dados?.choices?.[0]?.message?.content || '{}';

  try {
    const extraido = extrairJSON(textoResposta !== undefined ? textoResposta : texto);
    return Response.json(extraido);
  } catch {
    return Response.json({ error: `Não foi possível interpretar a resposta da IA. Resposta bruta: ${String(texto || textoResposta || '').slice(0, 300)}` }, { status: 502 });
  }
}
