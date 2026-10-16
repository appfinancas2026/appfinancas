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
  if (!checkRateLimit(`admin-create:${ip}`)) {
    return Response.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  const { email, nome, cpf } = body;

  if (!email) {
    return Response.json({ error: 'email é obrigatório.' }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: criadoData, error: criadoError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { nome: nome || '', cpf: cpf ? String(cpf).replace(/\D/g, '') : '' },
  });

  if (criadoError) {
    const jaExiste =
      criadoError.message?.toLowerCase().includes('already registered') ||
      criadoError.message?.toLowerCase().includes('already been registered') ||
      criadoError.code === 'email_exists';
    return Response.json(
      { error: jaExiste ? 'Email já cadastrado.' : criadoError.message },
      { status: jaExiste ? 409 : 422 },
    );
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
  });

  if (linkError) {
    console.error('[admin-create-user] generateLink falhou:', linkError.message);
    return Response.json(
      { success: true, user: { id: criadoData.user.id, email: criadoData.user.email }, link_definicao_senha: null, aviso: 'Usuário criado mas não foi possível gerar o link de definição de senha.' },
    );
  }

  return Response.json({
    success: true,
    user: { id: criadoData.user.id, email: criadoData.user.email },
    link_definicao_senha: linkData.properties?.action_link ?? null,
  });
}
