import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  const { subscription, usuarioId, entidadeId } = await request.json();

  if (!subscription?.endpoint || !usuarioId) {
    return Response.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const { error } = await supabase.from('push_subscriptions').upsert({
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
  const { endpoint, usuarioId } = await request.json();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  await supabase.from('push_subscriptions')
    .delete()
    .eq('usuario_id', usuarioId)
    .eq('endpoint', endpoint);

  return Response.json({ ok: true });
}
