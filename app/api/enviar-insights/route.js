import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { processarEntidade } from '../_shared/enviarInsights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Aceita o cron do Vercel (Authorization: Bearer $CRON_SECRET) e também
// chamada manual por ?secret= / header (compat com o teste do Passo 1).
function autorizado(request) {
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const secretQuery = searchParams.get('secret');
  const secretHeader = request.headers.get('x-insights-secret');

  const cronSecret = process.env.CRON_SECRET;
  const manualSecret = process.env.INSIGHTS_CRON_SECRET; // fallback do Passo 1
  const aceitos = [cronSecret, manualSecret].filter(Boolean);

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  if (aceitos.includes(secretQuery) || aceitos.includes(secretHeader)) return true;
  return false;
}

export async function GET(request) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!autorizado(request)) return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!RESEND_API_KEY) return Response.json({ error: 'RESEND_API_KEY não configurada.' }, { status: 500 });
  if (!SERVICE_ROLE) return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 500 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const resend = new Resend(RESEND_API_KEY);
  const hoje = new Date();

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim();

  // Mapa usuario_id -> email (uma chamada admin, reutilizada nos dois modos).
  const { data: listaUsers, error: erroUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (erroUsers) return Response.json({ error: 'Falha ao consultar usuários.' }, { status: 500 });
  const emailPorUsuario = {};
  (listaUsers?.users || []).forEach((u) => { if (u.email) emailPorUsuario[u.id] = u.email; });

  // ---- Modo teste: um único e-mail (?email=) ----
  if (email) {
    const usuario = (listaUsers?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (!usuario) return Response.json({ error: 'Usuário não encontrado para esse e-mail.' }, { status: 404 });

    const { data: entidades } = await supabase.from('entidades')
      .select('id, padrao').eq('usuario_id', usuario.id).eq('tipo', 'PF');
    const entidade = (entidades || []).find((e) => e.padrao) || (entidades || [])[0];
    if (!entidade) return Response.json({ error: 'Entidade PF não encontrada.' }, { status: 404 });

    const r = await processarEntidade({ supabase, resend, entidadeId: entidade.id, email: usuario.email, hoje });
    return Response.json({ ok: !r.erro, modo: 'teste', ...r });
  }

  // ---- Modo lote (cron): todas as entidades PF padrão ----
  const { data: entidadesPF } = await supabase.from('entidades')
    .select('id, usuario_id').eq('tipo', 'PF').eq('padrao', true);

  const resultados = [];
  for (const ent of (entidadesPF || [])) {
    const emailUsuario = emailPorUsuario[ent.usuario_id];
    if (!emailUsuario) continue; // sem e-mail conhecido → pula
    resultados.push(await processarEntidade({ supabase, resend, entidadeId: ent.id, email: emailUsuario, hoje }));
  }

  return Response.json({
    ok: true,
    modo: 'lote',
    entidades: (entidadesPF || []).length,
    enviados: resultados.filter((r) => r.enviado).length,
    semInsights: resultados.filter((r) => !r.enviado && !r.erro).length,
    erros: resultados.filter((r) => r.erro).length,
  });
}
