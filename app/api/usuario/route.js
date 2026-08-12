import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
}

// DELETE /api/usuario
// Remove todos os dados do usuário autenticado (LGPD — direito ao esquecimento).
// Ordem: filhos antes de pais para respeitar constraints de FK.
export async function DELETE(request) {
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_ROLE) return Response.json({ error: 'Configuração incompleta.' }, { status: 500 });

  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const supabase = adminClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const userId = user.id;
  const removido = {};

  // 1. Entidades cujo dono é o usuário
  const { data: entidades } = await supabase
    .from('entidades')
    .select('id')
    .eq('usuario_id', userId);

  const entidadeIds = (entidades || []).map((e) => e.id);

  if (entidadeIds.length > 0) {
    // 1a. dividas_pagamentos (filho de dividas)
    const { data: dividas } = await supabase
      .from('dividas')
      .select('id')
      .in('entidade_id', entidadeIds);

    const dividaIds = (dividas || []).map((d) => d.id);
    if (dividaIds.length > 0) {
      const { count: cpCount } = await supabase
        .from('dividas_pagamentos')
        .delete()
        .in('divida_id', dividaIds)
        .select('id', { count: 'exact', head: true });
      removido.dividas_pagamentos = cpCount ?? 0;
    }

    // 1b. Tabelas com entidade_id direto
    const tabelas = [
      'lancamentos_fixos_mensal',
      'transacoes',
      'dividas',
      'lancamentos_fixos',
      'contas',
      'cartoes',
      'convites',
      'entidade_membros',
    ];

    for (const tabela of tabelas) {
      const { count } = await supabase
        .from(tabela)
        .delete()
        .in('entidade_id', entidadeIds)
        .select('id', { count: 'exact', head: true });
      removido[tabela] = count ?? 0;
    }

    // 1c. Entidades em si
    const { count: eCount } = await supabase
      .from('entidades')
      .delete()
      .eq('usuario_id', userId)
      .select('id', { count: 'exact', head: true });
    removido.entidades = eCount ?? 0;
  }

  // 2. Memberships em entidades alheias
  const { count: memCount } = await supabase
    .from('entidade_membros')
    .delete()
    .eq('usuario_id', userId)
    .select('id', { count: 'exact', head: true });
  removido.entidade_membros_proprios = memCount ?? 0;

  // 3. Push subscriptions
  const { count: psCount } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('usuario_id', userId)
    .select('id', { count: 'exact', head: true });
  removido.push_subscriptions = psCount ?? 0;

  // 4. Registro público do usuário
  await supabase.from('usuarios').delete().eq('id', userId);
  removido.usuarios = 1;

  // 5. Conta de autenticação (auth.users) — invalida o token imediatamente
  const { error: deleteAuthError } = await supabase.auth.admin.deleteUser(userId);
  if (deleteAuthError) {
    console.error('[DELETE /api/usuario] erro ao remover auth.users:', deleteAuthError);
    return Response.json({ error: 'Dados removidos mas falha ao excluir conta de autenticação.' }, { status: 500 });
  }

  return Response.json({ ok: true, removido });
}
