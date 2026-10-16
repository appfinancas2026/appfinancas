export function verificarSecret(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace('Bearer ', '');
  return token && token === process.env.INTEGRACAO_SECRET;
}
