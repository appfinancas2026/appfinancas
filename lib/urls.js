// URL pública do app.
//
// Por que isso existe: usar window.location.origin direto quebra quando o app
// é aberto por uma URL de preview da Vercel (ex: projeto-abc123-time.vercel.app),
// que é protegida por autenticação de equipe. Um link de convite gerado dali
// leva o convidado para uma tela de "Request Sent" da Vercel, não para o app.
//
// Defina NEXT_PUBLIC_APP_URL nas variáveis de ambiente com o domínio oficial.
// Sem ela, cai no comportamento antigo (origin atual), que funciona em
// desenvolvimento local e quando já se está no domínio de produção.

const URL_CONFIGURADA = process.env.NEXT_PUBLIC_APP_URL;

export function urlDoApp() {
  if (URL_CONFIGURADA) return URL_CONFIGURADA.replace(/\/+$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function linkDeConvite(token) {
  return `${urlDoApp()}/convite/${token}`;
}
