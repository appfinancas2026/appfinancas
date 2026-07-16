import { supabase } from './supabase';
import { calcularSaldoConta } from './financeiro';

// Recalcula e grava o saldo de uma conta.
//
// O saldo nunca é editado direto: é sempre saldo_inicial + soma das transações.
// O cálculo em si mora em lib/financeiro.js (puro, testável); aqui fica só o
// acesso ao banco.
export async function recalcularSaldoConta(contaId) {
  const { data: contaAtual } = await supabase
    .from('contas')
    .select('saldo_inicial')
    .eq('id', contaId)
    .single();

  if (!contaAtual) return;

  const { data: txs } = await supabase
    .from('transacoes')
    .select('valor, tipo')
    .eq('conta_id', contaId);

  await supabase
    .from('contas')
    .update({ saldo_atual: calcularSaldoConta(contaAtual.saldo_inicial, txs) })
    .eq('id', contaId);
}
