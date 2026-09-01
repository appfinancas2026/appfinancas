import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { checkRateLimit } from '../_shared/rateLimit.js';
import { parseFaturaC6 } from '../../../lib/parseFaturaC6.js';

export const dynamic = 'force-dynamic';

// ─── RIGOR COM O CPF ────────────────────────────────────────────────────────
// O CPF é a senha do .xls. Ele é recebido no corpo (nunca na URL), usado
// apenas para descriptografar em memória, zerado imediatamente após o uso
// e nunca gravado, logado ou retornado. O arquivo descriptografado vive
// apenas como variável local e é descartado com o escopo da função.
// ────────────────────────────────────────────────────────────────────────────

export async function POST(request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!checkRateLimit(user.id)) return Response.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });

  // ── Parse do corpo ────────────────────────────────────────────────────────
  let cpf, arquivoBase64;
  try {
    const body = await request.json();
    cpf = body.cpf;
    arquivoBase64 = body.arquivo;
  } catch {
    // Sem log do corpo — pode conter o CPF
    return Response.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  if (!cpf || !arquivoBase64) {
    return Response.json({ error: 'Arquivo e senha são obrigatórios.' }, { status: 400 });
  }

  // ── Descriptografia e leitura ─────────────────────────────────────────────
  let transacoes;
  try {
    const buffer = Buffer.from(arquivoBase64, 'base64');
    arquivoBase64 = null; // Libera o base64 — não precisa mais

    // Descriptografa em memória; CPF como senha e zerado logo após
    const workbook = XLSX.read(buffer, { type: 'buffer', password: cpf });
    cpf = null; // Descarta imediatamente após a descriptografia

    const nomePlanilha = workbook.SheetNames[0];
    if (!nomePlanilha) {
      return Response.json({ error: 'Planilha vazia ou formato não reconhecido.' }, { status: 400 });
    }

    // sheet_to_json com header:1 → array de arrays, formato esperado por parseFaturaC6
    const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[nomePlanilha], {
      header: 1,
      defval: '',
    });

    transacoes = parseFaturaC6(linhas);
  } catch {
    // Sem log do erro — a mensagem do SheetJS pode conter info do arquivo.
    // Erro genérico para o cliente, sem ecoar a senha ou o arquivo.
    return Response.json(
      { error: 'Não foi possível abrir o arquivo — verifique a senha (CPF) ou o formato do arquivo.' },
      { status: 400 },
    );
  }

  return Response.json({ transacoes });
}
