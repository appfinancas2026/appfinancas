import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { gerarInsights, projetarSaldoDiario } from '../../../lib/insights';
import { primeiroDiaDoMes, ultimoDiaDoMes, subtrairMeses } from '../../../lib/financeiro';

// Precisa do runtime Node (service role + SDK do Resend); não roda no edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function escaparHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// E-mail HTML minimalista: fundo branco, texto escuro, um insight por linha.
function montarEmailHTML(insights) {
  const COR = { alta: '#CA8A04', risco: '#DC2626', oportunidade: '#16A34A' };
  const linhas = insights.map((ins) => {
    const cor = COR[ins.tipo] || '#71717A';
    return `<tr><td style="padding:12px 0;border-top:1px solid #E4E4E7;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cor};margin-right:10px;vertical-align:middle;"></span>
      <span style="font-size:15px;color:#18181B;line-height:1.5;">${escaparHtml(ins.texto)}</span>
    </td></tr>`;
  }).join('');

  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
      <tr><td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" style="max-width:520px;text-align:left;">
          <tr><td style="font-size:20px;font-weight:bold;color:#18181B;padding-bottom:4px;">Seus insights da semana</td></tr>
          <tr><td style="font-size:13px;color:#71717A;padding-bottom:8px;">Um resumo rápido do que merece atenção nas suas finanças.</td></tr>
          ${linhas}
          <tr><td style="padding-top:24px;font-size:12px;color:#A1A1AA;">AppFinançasBr · Controle. Planeje. Realize.</td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim();
  const secretQuery = searchParams.get('secret');
  const secretHeader = request.headers.get('x-insights-secret');

  const SECRET = process.env.INSIGHTS_CRON_SECRET;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // --- Proteção mínima (reforçada no Passo 3) ---
  if (!SECRET || (secretQuery !== SECRET && secretHeader !== SECRET)) {
    return Response.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  if (!RESEND_API_KEY) return Response.json({ error: 'RESEND_API_KEY não configurada.' }, { status: 500 });
  if (!SERVICE_ROLE) return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 500 });
  if (!email) return Response.json({ error: 'Informe ?email=' }, { status: 400 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  // 1. Localiza o usuário pelo e-mail (auth admin). Escala de teste: 1ª página.
  const { data: listaUsers, error: erroUsers } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (erroUsers) return Response.json({ error: 'Falha ao consultar usuários.' }, { status: 500 });
  const usuario = (listaUsers?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
  if (!usuario) return Response.json({ error: 'Usuário não encontrado para esse e-mail.' }, { status: 404 });

  // 2. Entidade PF padrão desse usuário.
  const { data: entidades } = await supabase
    .from('entidades')
    .select('id, tipo, padrao')
    .eq('usuario_id', usuario.id)
    .eq('tipo', 'PF');
  const entidade = (entidades || []).find((e) => e.padrao) || (entidades || [])[0];
  if (!entidade) return Response.json({ error: 'Entidade PF não encontrada.' }, { status: 404 });
  const entidadeId = entidade.id;

  // 3. Período: mês atual real.
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-indexed
  const dataAtual = { ano, mes };
  const hojeStr = hoje.toISOString().slice(0, 10);

  const selectTx = 'data, tipo, valor, categoria, essencialidade, transferencia_id';

  // Transações do mês atual.
  const { data: transacoesMes } = await supabase
    .from('transacoes').select(selectTx)
    .eq('entidade_id', entidadeId)
    .is('transferencia_id', null)
    .or('cartao_id.is.null,origem.eq.fatura')
    .gte('data', primeiroDiaDoMes(ano, mes))
    .lte('data', ultimoDiaDoMes(ano, mes));

  // Transações dos 3 meses anteriores.
  const ini = subtrairMeses(ano, mes, 3);
  const fim = subtrairMeses(ano, mes, 1);
  const { data: transacoesHistorico } = await supabase
    .from('transacoes').select(selectTx)
    .eq('entidade_id', entidadeId)
    .is('transferencia_id', null)
    .or('cartao_id.is.null,origem.eq.fatura')
    .gte('data', primeiroDiaDoMes(ini.ano, ini.mes))
    .lte('data', ultimoDiaDoMes(fim.ano, fim.mes));

  // Projeção de 30 dias (mesma base do fluxo de caixa).
  const { data: contas } = await supabase
    .from('contas').select('saldo_atual').eq('entidade_id', entidadeId);
  const saldoInicial = (contas || []).reduce((s, c) => s + Number(c.saldo_atual || 0), 0);

  const { data: lancamentosFixos } = await supabase
    .from('lancamentos_fixos')
    .select('tipo, valor_padrao, dia_referencia, parcelado, mes_inicio, total_parcelas, nome')
    .eq('entidade_id', entidadeId);

  const inicioMedia = new Date(hoje);
  inicioMedia.setDate(inicioMedia.getDate() - 90);
  const { data: txsVar } = await supabase
    .from('transacoes').select('valor')
    .eq('entidade_id', entidadeId)
    .eq('tipo', 'saida')
    .is('transferencia_id', null)
    .neq('origem', 'recorrente')
    .gte('data', inicioMedia.toISOString().slice(0, 10))
    .lte('data', hojeStr);
  const mediaDiariaVariavel = (txsVar || []).reduce((s, t) => s + Number(t.valor || 0), 0) / 90;

  const projecaoFluxo = projetarSaldoDiario({
    saldoInicial,
    lancamentosFixos: lancamentosFixos || [],
    dias: 30,
    mediaDiariaVariavel,
    hoje: hojeStr,
  });

  // 4. Gera os insights (função pura já testada).
  const insights = gerarInsights({
    transacoesMes: transacoesMes || [],
    transacoesHistorico: transacoesHistorico || [],
    projecaoFluxo,
    lancamentosFixos: lancamentosFixos || [],
    dataAtual,
  });

  // 5. Sem insight → não envia.
  if (insights.length === 0) {
    return Response.json({ ok: true, enviado: false, motivo: 'sem insights esta semana' });
  }

  // 6. Envia via Resend (remetente de teste onboarding@resend.dev).
  const resend = new Resend(RESEND_API_KEY);
  const { data: envio, error: erroEnvio } = await resend.emails.send({
    from: 'AppFinançasBr <onboarding@resend.dev>',
    to: email,
    subject: 'Seus insights da semana',
    html: montarEmailHTML(insights),
  });

  if (erroEnvio) {
    return Response.json({ ok: false, error: erroEnvio.message || 'Falha ao enviar e-mail.' }, { status: 502 });
  }

  return Response.json({ ok: true, enviado: true, insights: insights.length, id: envio?.id || null });
}
