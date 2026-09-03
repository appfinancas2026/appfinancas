import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '../_shared/rateLimit.js';
import { extrairJSON } from '../_shared/extrairJSON.js';
import { MODELO_IA } from '../_shared/modelosIA.js';

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

  const { texto, tipo } = await request.json();

  if (!texto || texto.trim().length < 20) {
    return Response.json({ error: 'Texto do extrato muito curto ou vazio.' }, { status: 400 });
  }

  const ehFatura = tipo === 'fatura';

  const sistemaExtrato = `Você interpreta extratos bancários brasileiros e extrai as transações.

Retorne APENAS um JSON válido, sem markdown, sem crases:
{ "transacoes": [ { "data": "AAAA-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida", "referencia_externa": string | null } ] }

Regras:
- "data" sempre no formato ISO AAAA-MM-DD. Se mostrar DD/MM sem ano, deduza pelo cabeçalho do período.
- "valor" sempre positivo (o tipo já indica a direção).
- "tipo": "entrada" se o valor entrou na conta, "saida" se saiu.
- "descricao" curta — remova prefixos como "Pix recebido de", "Pix enviado para".
- "referencia_externa" é o ID único da transação, ou null se não houver.
- Ignore linhas de saldo, cabeçalhos de mês e totais de período.
- Retorne TODAS as transações encontradas.`;

  const sistemaFatura = `Você extrai transações de faturas de cartão de crédito brasileiras.

Retorne APENAS um JSON válido, sem markdown, sem crases:
{ "transacoes": [ { "data": "AAAA-MM-DD", "descricao": string, "valor": number, "tipo": "entrada" | "saida", "referencia_externa": null } ] }

Regras:
- Cada linha no formato "DD/MM DESCRIÇÃO VALOR" é uma transação — extraia todas.
- "data" sempre ISO AAAA-MM-DD. DD/MM sem ano: use o ano do contexto ou o ano atual.
- "valor" sempre positivo.
- "tipo": "saida" para compras. "entrada" para pagamentos, créditos e estornos (valor com "-" no final ou negativo).
- "descricao" curta — mantenha o nome do estabelecimento, remova prefixos desnecessários.
- "referencia_externa" sempre null.
- IGNORE completamente: tabelas de juros (CET, % a.m., % a.a.), IOF, opções de parcelamento, código de barras, boleto, resumo de encargos, limites disponíveis, totais de período, cabeçalhos.
- Retorne TODAS as linhas de transação encontradas.`;

  const sistema = ehFatura ? sistemaFatura : sistemaExtrato;
  const rotulo = ehFatura ? 'Fatura de cartão' : 'Extrato bancário';

  let resposta;
  try {
    resposta = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        // openai/gpt-oss-20b: sem thinking chain, TPM maior — adequado pra extração JSON
        model: 'openai/gpt-oss-20b',
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: `${rotulo}:\n\n${texto}` },
        ],
        max_tokens: 4096,
        temperature: 0.1,
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
  const textoResposta = dados?.choices?.[0]?.message?.content || '{}';

  try {
    const extraido = extrairJSON(textoResposta);
    const transacoes = (extraido.transacoes || []).map((t) => ({ ...t, incluir: true }));
    return Response.json({ transacoes });
  } catch {
    return Response.json({ error: `Não foi possível interpretar a resposta da IA. Resposta bruta: ${String(textoResposta).slice(0, 300)}` }, { status: 502 });
  }
}
