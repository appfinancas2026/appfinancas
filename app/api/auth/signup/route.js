export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { verificarSecret } from '../_shared/verificarSecret.js';
import { supabaseAdmin } from '../_shared/supabaseAdmin.js';
import { checkRateLimit } from '../../_shared/rateLimit.js';

function ipDaRequisicao(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request) {
  if (!verificarSecret(request)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const ip = ipDaRequisicao(request);
  if (!checkRateLimit(`signup:${ip}`)) {
    return Response.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  const { email, password, nome, cpf } = body;

  if (!email || !password) {
    return Response.json({ error: 'email e password são obrigatórios.' }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: nome || '', cpf: cpf ? String(cpf).replace(/\D/g, '') : '' },
  });

  if (error) {
    const jaExiste =
      error.message?.toLowerCase().includes('already registered') ||
      error.message?.toLowerCase().includes('already been registered') ||
      error.code === 'email_exists';
    return Response.json(
      { error: jaExiste ? 'Email já cadastrado.' : error.message },
      { status: jaExiste ? 409 : 422 },
    );
  }

  return Response.json({ success: true, user: { id: data.user.id, email: data.user.email } });
}
