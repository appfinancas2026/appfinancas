import { gerarInsights, projetarSaldoDiario } from '../../../lib/insights';
import { primeiroDiaDoMes, ultimoDiaDoMes, subtrairMeses } from '../../../lib/financeiro';
import { MODELO_IA } from './modelosIA.js';

const SELECT_TX = 'data, tipo, valor, categoria, essencialidade, transferencia_id';

function escaparHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Assunto/preheader dinâmicos (item 1) ----
export function assuntoDinamico(insights) {
  if (insights.some((i) => i.tipo === 'risco')) return '⚠️ Seus insights da semana — algo precisa de atenção';
  if (insights.some((i) => i.tipo === 'oportunidade')) return 'Seus insights da semana — há uma oportunidade';
  return 'Seus insights da semana';
}

export function montarEmailHTML(insights) {
  const COR = { alta: '#CA8A04', risco: '#DC2626', oportunidade: '#16A34A' };
  const preheader = insights[0]?.texto ? escaparHtml(insights[0].texto.slice(0, 110)) : '';
  const linhas = insights.map((ins) => {
    const cor = COR[ins.tipo] || '#71717A';
    return `<tr><td style="padding:12px 0;border-top:1px solid #E4E4E7;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cor};margin-right:10px;vertical-align:middle;"></span>
      <span style="font-size:15px;color:#18181B;line-height:1.5;">${escaparHtml(ins.texto)}</span>
    </td></tr>`;
  }).join('');

  return `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
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

// ---- Textos com IA (item 2), com fallback para os textos-template ----
function extrairArrayJSON(texto) {
  const limpo = String(texto).replace(/```json|```/g, '').trim();
  const ini = limpo.indexOf('[');
  const fim = limpo.lastIndexOf(']');
  if (ini === -1 || fim === -1 || fim < ini) return null;
  try { return JSON.parse(limpo.slice(ini, fim + 1)); } catch { return null; }
}

export async function humanizarInsights(insights) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || insights.length === 0) return insights;

  const sistema = `Você reescreve alertas financeiros curtos para um app brasileiro (AppFinançasBr).
Regras:
- Mantenha EXATAMENTE os números, valores em reais, datas e percentuais de cada item.
- Português do Brasil, tom acolhedor mas direto, no máximo 1 frase por item.
- Não invente informação nova nem remova a existente.
- Responda APENAS com um array JSON de strings, na mesma ordem e quantidade, sem markdown.`;
  const lista = insights.map((ins, i) => `${i + 1}. ${ins.texto}`).join('\n');

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODELO_IA,
        messages: [
          { role: 'system', content: sistema },
          { role: 'user', content: `Reescreva cada item mantendo o sentido e os números:\n${lista}` },
        ],
        max_tokens: 700,
        temperature: 0.4,
      }),
    });
    if (!resp.ok) return insights;
    const dados = await resp.json();
    const arr = extrairArrayJSON(dados?.choices?.[0]?.message?.content || '');
    if (!Array.isArray(arr) || arr.length !== insights.length) return insights;
    return insights.map((ins, i) => ({ ...ins, texto: (String(arr[i] || '').trim() || ins.texto) }));
  } catch {
    return insights; // qualquer falha → mantém os textos-template
  }
}

// ---- Anti-repetição (item 4) ----
function chaveSemana(hoje) {
  const d = new Date(hoje);
  d.setHours(0, 0, 0, 0);
  const segunda = (d.getDay() + 6) % 7; // 0 = segunda-feira
  d.setDate(d.getDate() - segunda);
  return d.toISOString().slice(0, 10);
}

function assinaturaInsights(insights) {
  const base = insights.map((i) => `${i.tipo}:${i.texto}`).join('|');
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

async function jaEnviadoNaSemana(supabase, entidadeId, semana) {
  const { data, error } = await supabase
    .from('insights_enviados').select('id')
    .eq('entidade_id', entidadeId).eq('semana', semana).limit(1);
  if (error) return false; // tabela ausente / erro → não bloqueia o envio
  return (data || []).length > 0;
}

async function registrarEnvio(supabase, registro) {
  const { error } = await supabase.from('insights_enviados').insert(registro);
  if (error) console.warn('[insights] falha ao registrar envio:', error.message);
}

// ---- Geração dos insights de uma entidade ----
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

// ---- Orquestra: gera → anti-repetição → IA → envia → registra ----
export async function processarEntidade({ supabase, resend, entidadeId, email, hoje, usarIA = true }) {
  let insights = await gerarInsightsDaEntidade(supabase, entidadeId, hoje);
  if (insights.length === 0) return { email, enviado: false, motivo: 'sem insights esta semana' };

  const semana = chaveSemana(hoje);
  const assinatura = assinaturaInsights(insights); // do conteúdo determinístico (pré-IA)

  if (await jaEnviadoNaSemana(supabase, entidadeId, semana)) {
    return { email, enviado: false, motivo: 'já enviado esta semana' };
  }

  if (usarIA) insights = await humanizarInsights(insights);

  const { data, error } = await resend.emails.send({
    from: 'AppFinançasBr <onboarding@resend.dev>',
    to: email,
    subject: assuntoDinamico(insights),
    html: montarEmailHTML(insights),
  });
  if (error) return { email, enviado: false, erro: error.message || 'falha no envio' };

  await registrarEnvio(supabase, { entidade_id: entidadeId, email, semana, assinatura });
  return { email, enviado: true, insights: insights.length, id: data?.id || null };
}
