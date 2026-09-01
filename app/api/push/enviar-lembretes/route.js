import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

webpush.setVapidDetails(
  'mailto:suporte@appfinancasbr.com.br',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

// Aceita Authorization: Bearer <CRON_SECRET> (cron Vercel Pro / teste manual)
// ou ?secret=<CRON_SECRET> (workaround para Hobby e testes locais).
// Falha fechado: sem CRON_SECRET configurada → 401 (não deixa rota pública).
function autorizado(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;

  const authHeader = request.headers.get('authorization');
  if (authHeader === `Bearer ${cronSecret}`) return true;

  const { searchParams } = new URL(request.url);
  if (searchParams.get('secret') === cronSecret) return true;

  return false;
}

// Esta rota é chamada diariamente pelo cron do Vercel (vercel.json).
// Também pode ser chamada manualmente para testar.
export async function GET(request) {
  if (!autorizado(request)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const diaManha = new Date(hoje); diaManha.setDate(diaManha.getDate() + 1);
  const diaManhaDia = diaManha.getDate();
  const mesAtual = hoje.toISOString().slice(0, 7) + '-01';

  // Busca ocorrências pendentes que vencem hoje ou amanhã
  const { data: ocorrencias } = await supabase
    .from('ocorrencias_mensais')
    .select(`
      id, valor, status,
      lancamentos_fixos ( nome, dia_referencia, tipo, entidade_id ),
      entidades ( usuario_id )
    `)
    .eq('mes_referencia', mesAtual)
    .eq('status', 'pendente')
    .in('lancamentos_fixos.dia_referencia', [diaHoje, diaManhaDia]);

  if (!ocorrencias || ocorrencias.length === 0) {
    return Response.json({ enviadas: 0, mensagem: 'Nenhuma notificação necessária hoje.' });
  }

  // Agrupa por usuário
  const porUsuario = {};
  ocorrencias.forEach((o) => {
    const uid = o.entidades?.usuario_id;
    if (!uid) return;
    if (!porUsuario[uid]) porUsuario[uid] = { hoje: [], amanha: [] };
    const diaRef = o.lancamentos_fixos?.dia_referencia;
    const bucket = diaRef === diaHoje ? 'hoje' : 'amanha';
    porUsuario[uid][bucket].push(o.lancamentos_fixos?.nome || 'Lançamento');
  });

  // Busca subscriptions dos usuários afetados
  const uids = Object.keys(porUsuario);
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('usuario_id, endpoint, p256dh, auth')
    .in('usuario_id', uids);

  let enviadas = 0;
  const falhadas = [];

  for (const sub of (subs || [])) {
    const info = porUsuario[sub.usuario_id];
    if (!info) continue;

    // Monta a mensagem
    const partes = [];
    if (info.hoje.length > 0) partes.push(`Vence hoje: ${info.hoje.join(', ')}`);
    if (info.amanha.length > 0) partes.push(`Vence amanhã: ${info.amanha.join(', ')}`);
    if (partes.length === 0) continue;

    const payload = JSON.stringify({
      title: '💰 AppFinançasBr — Vencimentos',
      body: partes.join(' · '),
      url: '/dashboard',
      icon: '/icon-192.png',
      badge: '/icon-96.png',
    });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      enviadas++;
    } catch (err) {
      // Subscription expirada ou inválida — remove do banco
      if (err.statusCode === 410 || err.statusCode === 404) {
        falhadas.push({ usuario_id: sub.usuario_id, endpoint: sub.endpoint });
      }
    }
  }

  // Limpa subscriptions inválidas
  for (const s of falhadas) {
    await supabase.from('push_subscriptions').delete()
      .eq('usuario_id', s.usuario_id).eq('endpoint', s.endpoint);
  }

  return Response.json({ enviadas, removidas: falhadas.length });
}
