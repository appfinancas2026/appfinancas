export const LICOES = {
  saldo_negativo: {
    titulo: 'Por que a projeção de saldo importa',
    texto: 'Projetar o saldo é estimar quanto você terá nos próximos dias, somando o que entra e subtraindo o que já está comprometido. Ver um saldo negativo à frente é um aviso pra ajustar antes que aconteça, não depois.',
  },
  limite_comprometido: {
    titulo: 'Usar muito do limite do cartão',
    texto: 'Quando boa parte do limite já está usada, sobra pouca margem pra imprevistos, e o valor da fatura tende a pesar. O limite é uma reserva de crédito — quanto mais livre, mais flexibilidade você tem.',
  },
  concentracao_vencimentos: {
    titulo: 'Vencimentos concentrados',
    texto: 'Quando várias contas vencem juntas, o caixa daquela semana fica apertado mesmo que o mês todo esteja equilibrado. Conhecer essa concentração ajuda a se organizar pro momento certo.',
  },
  resultado_abaixo_media: {
    titulo: 'Resultado abaixo da sua média',
    texto: 'Comparar o mês com sua própria média mostra se foi um mês fora do padrão. Um resultado bem abaixo pode ser pontual (um gasto grande) ou um sinal de tendência — o número sozinho não diz qual, mas convida a olhar.',
  },
  divida_comprometimento: {
    titulo: 'Quanto da renda vai pra dívidas',
    texto: 'Quando as parcelas de dívida tomam uma fatia grande da renda, sobra menos pro resto e pra imprevistos. Acompanhar esse percentual ajuda a enxergar o espaço real que você tem no orçamento.',
  },
  fatura_acima_media: {
    titulo: 'Fatura acima do normal',
    texto: 'Uma fatura bem maior que as anteriores costuma ter uma explicação — uma compra grande, uma parcela nova, ou vários gastos pequenos que somaram. Notar o desvio é o primeiro passo pra entender a causa.',
  },
  divida_juros_cara: {
    titulo: 'Juros altos numa dívida',
    texto: 'O custo de uma dívida está na taxa de juros: quanto maior, mais você paga além do valor original. Dívidas com juros altos crescem rápido — conhecer a taxa de cada uma ajuda a comparar e priorizar.',
  },
  superfluos_altos: {
    titulo: 'O peso dos gastos supérfluos',
    texto: 'Gastos supérfluos são os que dão prazer mas não são essenciais. Não são "errados" — mas quando viram uma fatia grande do orçamento, vale saber, porque é onde há mais espaço de escolha.',
  },
  categoria_em_alta: {
    titulo: 'Uma categoria subindo',
    texto: 'Quando uma categoria cresce bem acima da sua média, algo mudou no padrão. Pode ser sazonal, um hábito novo, ou preços subindo. Perceber a alta é o que permite decidir se faz sentido.',
  },
  dinheiro_parado_fatura: {
    titulo: 'Dinheiro parado vs fatura',
    texto: 'Ter saldo suficiente pra quitar a fatura em aberto é uma posição confortável. Pagar a fatura integral evita os juros do rotativo, que estão entre os mais altos — o dinheiro parado rende mais sendo usado assim.',
  },
  resultado_acima_media: {
    titulo: 'Um mês acima da média',
    texto: 'Um resultado acima da sua média significa que sobrou mais que o normal. Momentos assim são oportunidades — reservar parte do que sobrou dá fôlego pros meses mais apertados.',
  },
  dividas_quitadas: {
    titulo: 'Dívidas quitadas',
    texto: 'Quitar dívidas libera renda que estava comprometida e reduz o custo de juros que você pagava. Cada dívida encerrada é margem que volta pro seu orçamento.',
  },
};

export function getLicao(licaoId) {
  return LICOES[licaoId] ?? null;
}
