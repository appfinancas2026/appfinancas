import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

async function getUser(request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data: { user }, error } = await adminClient().auth.getUser(token);
  return error ? null : user;
}

export async function POST(request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Corpo inválido.' }, { status: 400 }); }

  const { subscription, usuarioId, entidadeId } = body;

  if (!subscription?.endpoint || !usuarioId) {
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  if (user.id !== usuarioId) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { error } = await adminClient().from('push_subscriptions').upsert({
    usuario_id: usuarioId,
    entidade_id: entidadeId || null,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  }, { onConflict: 'usuario_id,endpoint' });

  if (error) {
    console.error('Erro ao salvar subscription:', error);
    return Response.json({ error: 'Não foi possível salvar.' }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Corpo inválido.' }, { status: 400 }); }

  const { endpoint, usuarioId } = body;

  if (!endpoint || !usuarioId) {
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  if (user.id !== usuarioId) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  await adminClient().from('push_subscriptions')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('endpoint', endpoint);

  return Response.json({ ok: true });
}
