import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

export const runtime = 'nodejs';

export async function POST(request) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const FEEDBACK_EMAIL = process.env.FEEDBACK_EMAIL;

  if (!RESEND_API_KEY || !SERVICE_ROLE || !FEEDBACK_EMAIL) {
    return Response.json({ error: 'Configuração incompleta no servidor.' }, { status: 500 });
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  if (!token) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Não autorizado.' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Corpo inválido.' }, { status: 400 });
  }

  const { mensagem, view, entidade, usuario_email, usuario_nome } = body;
  if (!mensagem?.trim()) return Response.json({ error: 'Mensagem vazia.' }, { status: 400 });

  const data = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const assunto = `[Feedback AppFinançasBr] ${view || 'home'} — ${usuario_nome || usuario_email || 'usuário'}`;
  const html = `
    <p style="font-size:16px;white-space:pre-wrap">${mensagem.trim()}</p>
    <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb" />
    <p style="color:#6b7280;font-size:13px">
      View: <strong>${view || '—'}</strong> ·
      Entidade: <strong>${entidade || '—'}</strong> ·
      Data: <strong>${data}</strong> ·
      Usuário: <strong>${usuario_email || '—'}</strong>
    </p>
  `;

  const resend = new Resend(RESEND_API_KEY);
  const { error: sendError } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: FEEDBACK_EMAIL,
    subject: assunto,
    html,
  });

  if (sendError) {
    console.error('[feedback] erro ao enviar email:', sendError);
    return Response.json({ error: 'Falha ao enviar email.' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
