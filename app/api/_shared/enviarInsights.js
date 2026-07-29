import { gerarInsights, projetarSaldoDiario } from '../../../lib/insights';
import { primeiroDiaDoMes, ultimoDiaDoMes, subtrairMeses } from '../../../lib/financeiro';

const SELECT_TX = 'data, tipo, valor, categoria, essencialidade, transferencia_id';

function escaparHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// E-mail HTML minimalista: fundo branco, texto escuro, um insight por linha.
export function montarEmailHTML(insights) {
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

// Busca do Supabase os dados de UMA entidade e devolve os insights (array).
export async function gerarInsightsDaEntidade(supabase, entidadeId, hoje = new Date()) {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-indexed
  const hojeStr = hoje.toISOString().slice(0, 10);

  const { data: transacoesMes } = await supabase.from('transacoes').select(SELECT_TX)
    .eq('entidade_id', entidadeId).is('transferencia_id', null).or('cartao_id.is.null,origem.eq.fatura')
    .gte('data', primeiroDiaDoMes(ano, mes)).lte('data', ultimoDiaDoMes(ano, mes));

  const ini = subtrairMeses(ano, mes, 3);
  const fim = subtrairMeses(ano, mes, 1);
  const { data: transacoesHistorico } = await supabase.from('transacoes').select(SELECT_TX)
    .eq('entidade_id', entidadeId).is('transferencia_id', null).or('cartao_id.is.null,origem.eq.fatura')
    .gte('data', primeiroDiaDoMes(ini.ano, ini.mes)).lte('data', ultimoDiaDoMes(fim.ano, fim.mes));

  const { data: contas } = await supabase.from('contas').select('saldo_atual').eq('entidade_id', entidadeId);
  const saldoInicial = (contas || []).reduce((s, c) => s + Number(c.saldo_atual || 0), 0);

  const { data: lancamentosFixos } = await supabase.from('lancamentos_fixos')
    .select('tipo, valor_padrao, dia_referencia, parcelado, mes_inicio, total_parcelas, nome')
    .eq('entidade_id', entidadeId);

  const inicioMedia = new Date(hoje);
  inicioMedia.setDate(inicioMedia.getDate() - 90);
  const { data: txsVar } = await supabase.from('transacoes').select('valor')
    .eq('entidade_id', entidadeId).eq('tipo', 'saida').is('transferencia_id', null).neq('origem', 'recorrente')
    .gte('data', inicioMedia.toISOString().slice(0, 10)).lte('data', hojeStr);
  const mediaDiariaVariavel = (txsVar || []).reduce((s, t) => s + Number(t.valor || 0), 0) / 90;

  const projecaoFluxo = projetarSaldoDiario({
    saldoInicial, lancamentosFixos: lancamentosFixos || [], dias: 30, mediaDiariaVariavel, hoje: hojeStr,
  });

  return gerarInsights({
    transacoesMes: transacoesMes || [],
    transacoesHistorico: transacoesHistorico || [],
    projecaoFluxo,
    lancamentosFixos: lancamentosFixos || [],
    dataAtual: { ano, mes },
  });
}

// Gera + envia para uma entidade. Nunca lança: devolve resultado estruturado.
export async function processarEntidade({ supabase, resend, entidadeId, email, hoje }) {
  const insights = await gerarInsightsDaEntidade(supabase, entidadeId, hoje);
  if (insights.length === 0) return { email, enviado: false, motivo: 'sem insights esta semana' };

  const { data, error } = await resend.emails.send({
    from: 'AppFinançasBr <onboarding@resend.dev>',
    to: email,
    subject: 'Seus insights da semana',
    html: montarEmailHTML(insights),
  });
  if (error) return { email, enviado: false, erro: error.message || 'falha no envio' };
  return { email, enviado: true, insights: insights.length, id: data?.id || null };
}
