export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { verificarSecret } from '../_shared/verificarSecret.js';
import { supabaseAnon } from '../_shared/supabaseAdmin.js';
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
  if (!checkRateLimit(`login:${ip}`)) {
    return Response.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body JSON inválido.' }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return Response.json({ error: 'email e password são obrigatórios.' }, { status: 400 });
  }

  const anon = supabaseAnon();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });

  if (error) {
    return Response.json({ error: 'Credenciais inválidas.' }, { status: 401 });
  }

  const { session, user } = data;
  return Response.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    user: { id: user.id, email: user.email },
  });
}
