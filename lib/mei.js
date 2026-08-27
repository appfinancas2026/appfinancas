export const TETO_MEI_ANUAL = 81000;
export const TOLERANCIA_MEI = 0.20; // 20% de tolerância antes do desenquadramento

/**
 * Calcula o status do teto de faturamento MEI para o ano corrente.
 *
 * @param {number} receitaAcumuladaAno  - Soma de todas as entradas do ano até mesReferencia.
 * @param {number} ano                  - Ano-calendário sendo avaliado (ex: 2026).
 * @param {string|null} dataAbertura    - Data de abertura da empresa ('YYYY-MM-DD') ou null.
 * @param {string} mesReferencia        - Mês atual no formato 'YYYY-MM-01'.
 * @returns {object} Status completo do teto MEI.
 */
export function calcularStatusTetoMEI({ receitaAcumuladaAno, ano, dataAbertura, mesReferencia }) {
  // 1. Teto: proporcional no 1º ano (mês de abertura conta como cheio)
  let teto = TETO_MEI_ANUAL;
  let tetoProporcional = false;

  if (dataAbertura) {
    const anoAbertura = parseInt(dataAbertura.slice(0, 4), 10);
    if (anoAbertura === ano) {
      const mesAbertura = parseInt(dataAbertura.slice(5, 7), 10); // 1-based
      const mesesDeAtividade = 12 - mesAbertura + 1;
      teto = (TETO_MEI_ANUAL / 12) * mesesDeAtividade;
      tetoProporcional = true;
    }
  }

  const acumulado = receitaAcumuladaAno;
  const limiteTolerancia = teto * (1 + TOLERANCIA_MEI);
  const percentual = teto > 0 ? acumulado / teto : 0;

  // 2. Zona: amarelo cobre [80% teto, 120% teto]
  let zona;
  if (acumulado > limiteTolerancia) {
    zona = 'vermelho';
  } else if (acumulado >= teto * 0.80) {
    zona = 'amarelo'; // aproximando (>= 80%) ou estourou dentro da tolerância (> 100%)
  } else {
    zona = 'verde';
  }

  // 3. Projeção de estouro no ritmo atual
  const mesAtual = parseInt(mesReferencia.slice(5, 7), 10); // 1-based

  let mediaMensal = 0;
  let mesEstouro = null;
  let vaiEstourar = false;

  if (mesAtual > 0) {
    mediaMensal = acumulado / mesAtual;

    if (mediaMensal > 0) {
      // Busca o primeiro mês (1-12) em que mediaMensal * m ultrapassa o teto.
      // Se acumulado já superou o teto, mediaMensal * mesAtual = acumulado > teto,
      // então o loop encontra mesAtual (ou mês anterior se ritmo for muito alto).
      for (let m = 1; m <= 12; m++) {
        if (mediaMensal * m > teto) {
          mesEstouro = m;
          vaiEstourar = true;
          break;
        }
      }
    }
  }

  return {
    teto,
    tetoProporcional,
    acumulado,
    percentual,
    zona,
    limiteTolerancia,
    projecao: {
      mediaMensal,
      mesEstouro,
      vaiEstourar,
    },
  };
}
