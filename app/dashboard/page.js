'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';

const GraficoComparativoPFPJ = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoComparativoPFPJ), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });
const GraficoEntradasSaidas = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoEntradasSaidas), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });
const GraficoEvolucaoPatrimonio = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoEvolucaoPatrimonio), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });
const GraficoDespesasPorCategoria = dynamic(() => import('./RelatoriosCharts').then((m) => m.GraficoDespesasPorCategoria), { ssr: false, loading: () => <p className="empty-hint">Carregando gráfico...</p> });

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const TEMAS_CORES = {
  teal: { primary: '#0F6E56', dark: '#0A4F3D', tint: '#E1F1EA' },
  azul: { primary: '#1B5FA8', dark: '#123F73', tint: '#E1EBF7' },
  roxo: { primary: '#6B4FA0', dark: '#4A3573', tint: '#ECE6F5' },
  vinho: { primary: '#8A3350', dark: '#5E2136', tint: '#F5E3EA' },
  oliva: { primary: '#5C7A3A', dark: '#3E5527', tint: '#EAF0DF' },
  grafite: { primary: '#3B5568', dark: '#263845', tint: '#E4EAEE' },
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function mesReferenciaStr(ano, mes) {
  return `${ano}-${pad2(mes + 1)}-01`;
}

function primeiroDiaDoMes(ano, mes) {
  return `${ano}-${pad2(mes + 1)}-01`;
}

function ultimoDiaDoMes(ano, mes) {
  return new Date(ano, mes + 1, 0).toISOString().slice(0, 10);
}

function subtrairMeses(ano, mes, quantidade) {
  const totalMeses = ano * 12 + mes - quantidade;
  const anoResultado = Math.floor(totalMeses / 12);
  const mesResultado = totalMeses - anoResultado * 12;
  return { ano: anoResultado, mes: mesResultado };
}

function calcularPeriodoFaturaAberta(cartao, hoje) {
  const dia = hoje.getDate();
  if (dia <= cartao.dia_fechamento) return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  return subtrairMeses(hoje.getFullYear(), hoje.getMonth(), -1);
}

function calcularMesFaturaCompra(cartao, dataStr) {
  const [anoStr, mesStr, diaStr] = dataStr.split('-');
  const ano = parseInt(anoStr, 10);
  const mesIdx = parseInt(mesStr, 10) - 1;
  const dia = parseInt(diaStr, 10);
  if (dia <= cartao.dia_fechamento) return mesReferenciaStr(ano, mesIdx);
  const proximo = subtrairMeses(ano, mesIdx, -1);
  return mesReferenciaStr(proximo.ano, proximo.mes);
}

function avancarMeses(mesRef, quantidade) {
  const [anoStr, mesStr] = mesRef.split('-');
  const resultado = subtrairMeses(parseInt(anoStr, 10), parseInt(mesStr, 10) - 1, -quantidade);
  return mesReferenciaStr(resultado.ano, resultado.mes);
}

function parseOFX(texto) {
  const blocos = texto.split(/<STMTTRN>/i).slice(1);
  const transacoes = [];

  blocos.forEach((bloco) => {
    const corpo = bloco.split(/<\/STMTTRN>/i)[0];
    const extrair = (tag) => {
      const m = corpo.match(new RegExp(`<${tag}>([^\\r\\n<]*)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const dataRaw = extrair('DTPOSTED');
    const valorRaw = extrair('TRNAMT');
    const memo = extrair('MEMO') || extrair('NAME');
    const fitid = extrair('FITID');

    if (!dataRaw || !valorRaw) return;

    const ano = dataRaw.slice(0, 4);
    const mes = dataRaw.slice(4, 6);
    const dia = dataRaw.slice(6, 8);
    const valor = parseFloat(valorRaw);
    if (Number.isNaN(valor)) return;

    transacoes.push({
      data: `${ano}-${mes}-${dia}`,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      descricao: memo || 'Importado do extrato',
      referencia_externa: fitid || null,
      incluir: true,
    });
  });

  return transacoes;
}

function parseCSVExtrato(texto) {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];

  const separador = linhas[0].includes(';') ? ';' : ',';
  const cabecalho = linhas[0].split(separador).map((h) => h.trim().toLowerCase());

  const idxData = cabecalho.findIndex((h) => h.includes('data') || h.includes('date'));
  const idxValor = cabecalho.findIndex((h) => h.includes('valor') || h.includes('amount'));
  const idxDescricao = cabecalho.findIndex((h) => h.includes('desc') || h.includes('histor') || h.includes('memo') || h.includes('titulo'));

  if (idxData === -1 || idxValor === -1) return [];

  const transacoes = [];
  for (let i = 1; i < linhas.length; i++) {
    const campos = linhas[i].split(separador);
    const dataTexto = (campos[idxData] || '').trim();
    const valorTexto = (campos[idxValor] || '').trim().replace(/\./g, '').replace(',', '.');
    const valor = parseFloat(valorTexto);
    if (!dataTexto || Number.isNaN(valor)) continue;

    let dataISO = dataTexto;
    const partesData = dataTexto.split('/');
    if (partesData.length === 3) {
      const anoTexto = partesData[2].length === 2 ? `20${partesData[2]}` : partesData[2];
      dataISO = `${anoTexto}-${partesData[1].padStart(2, '0')}-${partesData[0].padStart(2, '0')}`;
    }

    transacoes.push({
      data: dataISO,
      valor: Math.abs(valor),
      tipo: valor >= 0 ? 'entrada' : 'saida',
      descricao: idxDescricao >= 0 ? (campos[idxDescricao] || '').trim() : 'Importado do extrato',
      referencia_externa: null,
      incluir: true,
    });
  }
  return transacoes;
}

function calcularParcela(fixo, ano, mes) {
  if (!fixo.parcelado || !fixo.mes_inicio) return null;
  const [anoInicio, mesInicioStr] = fixo.mes_inicio.split('-');
  const mesInicioIdx = parseInt(mesInicioStr, 10) - 1;
  const diffMeses = (ano - parseInt(anoInicio, 10)) * 12 + (mes - mesInicioIdx);
  const numero = diffMeses + 1;
  if (numero < 1 || (fixo.total_parcelas && numero > fixo.total_parcelas)) return null;
  return numero;
}

function formatarMoeda(v) {
  return `R$ ${Number(v).toFixed(2)}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('painel');

  const [montado, setMontado] = useState(false);
  const [tema, setTema] = useState('light');
  const [valoresOcultos, setValoresOcultos] = useState(false);
  const [mostrarConfiguracoes, setMostrarConfiguracoes] = useState(false);
  const [sidebarAberta, setSidebarAberta] = useState(true);
  const [sidebarMobileAberta, setSidebarMobileAberta] = useState(false);

  const [pinConfigurado, setPinConfigurado] = useState(false);
  const [pinDesbloqueado, setPinDesbloqueado] = useState(true);
  const [pinDigitado, setPinDigitado] = useState('');
  const [pinErro, setPinErro] = useState(false);
  const [criandoPin, setCriandoPin] = useState(false);
  const [pinNovoPrimeiraEtapa, setPinNovoPrimeiraEtapa] = useState('');

  const [perfil, setPerfil] = useState({ logo_url: null, nome_exibicao: null, cor_destaque: null });
  const [nomeExibicaoInput, setNomeExibicaoInput] = useState('');

  const [entidades, setEntidades] = useState([]);
  const [entidadeAtual, setEntidadeAtual] = useState(null);

  const [contas, setContas] = useState([]);
  const [lancamentosFixos, setLancamentosFixos] = useState([]);
  const [ocorrenciasDoMes, setOcorrenciasDoMes] = useState({});
  const [transacoes, setTransacoes] = useState([]);
  const [resumoAnual, setResumoAnual] = useState(
    Array.from({ length: 12 }, () => ({ entradas: 0, saidas: 0 }))
  );
  const [comparativoPFPJ, setComparativoPFPJ] = useState([]);
  const [evolucaoPatrimonio, setEvolucaoPatrimonio] = useState([]);
  const [pendenciasVencidas, setPendenciasVencidas] = useState([]);
  const [primeiroMovimento, setPrimeiroMovimento] = useState(null);

  const [dataAtual, setDataAtual] = useState(() => {
    const hoje = new Date();
    return { ano: hoje.getFullYear(), mes: hoje.getMonth() };
  });

  const [mostrarNovaEntidade, setMostrarNovaEntidade] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [nomeEmpresa, setNomeEmpresa] = useState('');

  const [mostrarNovaConta, setMostrarNovaConta] = useState(false);
  const [nomeConta, setNomeConta] = useState('');
  const [saldoConta, setSaldoConta] = useState('');
  const [edicaoContaId, setEdicaoContaId] = useState(null);
  const [formConta, setFormConta] = useState({ nome: '', saldo_inicial: '' });

  const [mostrarTransferencia, setMostrarTransferencia] = useState(false);
  const [contaOrigemId, setContaOrigemId] = useState('');
  const [contaDestinoId, setContaDestinoId] = useState('');
  const [valorTransferencia, setValorTransferencia] = useState('');

  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [destinoImportacaoId, setDestinoImportacaoId] = useState('');
  const [previewImportacao, setPreviewImportacao] = useState([]);
  const [nomeArquivoImportado, setNomeArquivoImportado] = useState('');
  const [importando, setImportando] = useState(false);

  const [mostrarNovaReceitaFixa, setMostrarNovaReceitaFixa] = useState(false);
  const [mostrarNovaDespesaFixa, setMostrarNovaDespesaFixa] = useState(false);
  const [nomeFixo, setNomeFixo] = useState('');
  const [diaFixo, setDiaFixo] = useState('');
  const [valorFixo, setValorFixo] = useState('');
  const [contaFixoId, setContaFixoId] = useState('');
  const [parceladoFixo, setParceladoFixo] = useState(false);
  const [totalParcelasFixo, setTotalParcelasFixo] = useState('');
  const [parcelaAtualFixo, setParcelaAtualFixo] = useState('');
  const [essencialidadeFixo, setEssencialidadeFixo] = useState('');
  const [edicaoFixoId, setEdicaoFixoId] = useState(null);
  const [formFixo, setFormFixo] = useState({ nome: '', dia_referencia: '', valor_padrao: '', conta_padrao_id: '' });

  const [edicaoOcorrenciaId, setEdicaoOcorrenciaId] = useState(null);
  const [formOcorrencia, setFormOcorrencia] = useState({ valor: '', conta_id: '' });

  const [metas, setMetas] = useState([]);
  const [mostrarNovaMeta, setMostrarNovaMeta] = useState(false);
  const [nomeMeta, setNomeMeta] = useState('');
  const [valorAlvoMeta, setValorAlvoMeta] = useState('');
  const [dataAlvoMeta, setDataAlvoMeta] = useState('');
  const [contaMetaId, setContaMetaId] = useState('');
  const [edicaoMetaId, setEdicaoMetaId] = useState(null);
  const [formMeta, setFormMeta] = useState({ nome: '', valor_alvo: '', data_alvo: '', conta_id: '' });
  const [expandirMetas, setExpandirMetas] = useState(false);
  const [aporteMetaId, setAporteMetaId] = useState(null);
  const [valorAporte, setValorAporte] = useState('');

  const [cartoes, setCartoes] = useState([]);
  const [faturasPorCartao, setFaturasPorCartao] = useState({});
  const [mostrarNovoCartao, setMostrarNovoCartao] = useState(false);
  const [nomeCartao, setNomeCartao] = useState('');
  const [diaFechamentoCartao, setDiaFechamentoCartao] = useState('');
  const [diaVencimentoCartao, setDiaVencimentoCartao] = useState('');
  const [contaPagamentoCartaoId, setContaPagamentoCartaoId] = useState('');
  const [edicaoCartaoId, setEdicaoCartaoId] = useState(null);
  const [formCartao, setFormCartao] = useState({ nome: '', dia_fechamento: '', dia_vencimento: '', conta_pagamento_id: '' });
  const [mostrarCompraCartaoId, setMostrarCompraCartaoId] = useState(null);
  const [valorCompraCartao, setValorCompraCartao] = useState('');
  const [categoriaCompraCartao, setCategoriaCompraCartao] = useState('');
  const [descricaoCompraCartao, setDescricaoCompraCartao] = useState('');
  const [dataCompraCartao, setDataCompraCartao] = useState(() => new Date().toISOString().slice(0, 10));
  const [essencialidadeCompraCartao, setEssencialidadeCompraCartao] = useState('');
  const [parceladoCompraCartao, setParceladoCompraCartao] = useState(false);
  const [totalParcelasCompraCartao, setTotalParcelasCompraCartao] = useState('');
  const [parcelaAtualCompraCartao, setParcelaAtualCompraCartao] = useState('');
  const [comprasCartaoVisivelId, setComprasCartaoVisivelId] = useState(null);
  const [comprasDoCartao, setComprasDoCartao] = useState([]);
  const [edicaoCompraCartaoId, setEdicaoCompraCartaoId] = useState(null);
  const [formCompraCartao, setFormCompraCartao] = useState({ valor: '', categoria: '', descricao: '', data: '', essencialidade: '' });

  const [tipo, setTipo] = useState('saida');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataLancamento, setDataLancamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [contaLancamentoId, setContaLancamentoId] = useState('');
  const [essencialidade, setEssencialidade] = useState('');
  const [sugestao, setSugestao] = useState(null);

  const [alertas, setAlertas] = useState([]);

  const [secaoAberta, setSecaoAberta] = useState({ contas: true, receitas: true, despesas: true, lancamentos: true, metas: true });
  const [expandirContas, setExpandirContas] = useState(false);
  const [expandirReceitas, setExpandirReceitas] = useState(false);
  const [expandirDespesas, setExpandirDespesas] = useState(false);
  const [expandirLancamentos, setExpandirLancamentos] = useState(false);
  const [ordenarReceitasPor, setOrdenarReceitasPor] = useState('data');
  const [ordenarDespesasPor, setOrdenarDespesasPor] = useState('data');
  const LIMITE_LISTA = 6;

  const [edicaoTransacaoId, setEdicaoTransacaoId] = useState(null);
  const [formTransacao, setFormTransacao] = useState({ valor: '', categoria: '', descricao: '', data: '' });

  // ---------- Carregamento ----------

  const carregarEntidades = useCallback(async (userId) => {
    const { data } = await supabase
      .from('entidades')
      .select('*')
      .eq('usuario_id', userId)
      .order('padrao', { ascending: false });

    setEntidades(data || []);
    if (data && data.length > 0) {
      setEntidadeAtual((atual) => atual || data[0].id);
    }
  }, []);

  const carregarPerfil = useCallback(async (userId) => {
    const { data } = await supabase.from('usuarios').select('logo_url, nome_exibicao, cor_destaque').eq('id', userId).single();
    if (data) {
      setPerfil(data);
      setNomeExibicaoInput(data.nome_exibicao || '');
    }
  }, []);

  const carregarContas = useCallback(async (entidadeId) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('contas')
      .select('*')
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: true });

    setContas(data || []);
  }, []);

  const carregarLancamentosFixos = useCallback(async (entidadeId) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('lancamentos_fixos')
      .select('*')
      .eq('entidade_id', entidadeId)
      .eq('ativo', true)
      .order('dia_referencia', { ascending: true });

    setLancamentosFixos(data || []);
  }, []);

  const carregarMetas = useCallback(async (entidadeId) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('metas')
      .select('*')
      .eq('entidade_id', entidadeId)
      .order('created_at', { ascending: true });

    setMetas(data || []);
  }, []);

  const carregarCartoes = useCallback(async (entidadeId) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('cartoes')
      .select('*')
      .eq('entidade_id', entidadeId)
      .eq('ativo', true)
      .order('created_at', { ascending: true });

    setCartoes(data || []);
  }, []);

  const carregarFaturas = useCallback(async (entidadeId, listaCartoes) => {
    if (!entidadeId || !listaCartoes || listaCartoes.length === 0) { setFaturasPorCartao({}); return; }

    const hoje = new Date();
    const resultado = {};

    await Promise.all(listaCartoes.map(async (cartao) => {
      const aberta = calcularPeriodoFaturaAberta(cartao, hoje);
      const fechada = subtrairMeses(aberta.ano, aberta.mes, 1);

      const mesRefAberta = mesReferenciaStr(aberta.ano, aberta.mes);
      const mesRefFechada = mesReferenciaStr(fechada.ano, fechada.mes);

      const { data } = await supabase
        .from('transacoes')
        .select('valor, mes_fatura, origem')
        .eq('cartao_id', cartao.id)
        .in('mes_fatura', [mesRefAberta, mesRefFechada]);

      const compras = (data || []).filter((t) => t.origem !== 'fatura');
      const pagamentos = (data || []).filter((t) => t.origem === 'fatura');

      const totalAberta = compras.filter((t) => t.mes_fatura === mesRefAberta).reduce((s, t) => s + Number(t.valor), 0);
      const totalFechada = compras.filter((t) => t.mes_fatura === mesRefFechada).reduce((s, t) => s + Number(t.valor), 0);
      const fechadaPaga = pagamentos.some((t) => t.mes_fatura === mesRefFechada);

      resultado[cartao.id] = {
        aberta: { mesRef: mesRefAberta, total: totalAberta },
        fechada: { mesRef: mesRefFechada, total: totalFechada, paga: fechadaPaga },
      };
    }));

    setFaturasPorCartao(resultado);
  }, []);

  const garantirOcorrenciasDoMes = useCallback(async (entidadeId, fixos, ano, mes) => {
    if (!entidadeId) return;
    if (!fixos || fixos.length === 0) {
      setOcorrenciasDoMes({});
      return;
    }

    const mesRef = mesReferenciaStr(ano, mes);

    const { data: existentes } = await supabase
      .from('lancamentos_fixos_mensal')
      .select('*')
      .eq('entidade_id', entidadeId)
      .eq('mes_referencia', mesRef);

    const mapa = {};
    (existentes || []).forEach((o) => { mapa[o.lancamento_fixo_id] = o; });

    const elegiveis = fixos.filter((f) => !f.parcelado || calcularParcela(f, ano, mes) !== null);
    const faltantes = elegiveis.filter((f) => !mapa[f.id]);

    if (faltantes.length > 0) {
      const novos = faltantes.map((f) => ({
        lancamento_fixo_id: f.id,
        entidade_id: entidadeId,
        mes_referencia: mesRef,
        valor: f.valor_padrao,
        conta_id: f.conta_padrao_id,
        status: 'pendente',
        parcela_numero: calcularParcela(f, ano, mes),
      }));
      const { data: inseridos } = await supabase.from('lancamentos_fixos_mensal').insert(novos).select();
      (inseridos || []).forEach((o) => { mapa[o.lancamento_fixo_id] = o; });
    }

    setOcorrenciasDoMes(mapa);
  }, []);

  const carregarTransacoesDoMes = useCallback(async (entidadeId, ano, mes) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('transacoes')
      .select('*')
      .eq('entidade_id', entidadeId)
      .or('cartao_id.is.null,origem.eq.fatura')
      .gte('data', primeiroDiaDoMes(ano, mes))
      .lte('data', ultimoDiaDoMes(ano, mes))
      .order('data', { ascending: false });

    setTransacoes(data || []);
  }, []);

  const carregarResumoAnual = useCallback(async (entidadeId, ano) => {
    if (!entidadeId) return;
    const { data } = await supabase
      .from('transacoes')
      .select('valor, tipo, data')
      .eq('entidade_id', entidadeId)
      .is('transferencia_id', null)
      .or('cartao_id.is.null,origem.eq.fatura')
      .gte('data', `${ano}-01-01`)
      .lte('data', `${ano}-12-31`);

    const porMes = Array.from({ length: 12 }, () => ({ entradas: 0, saidas: 0 }));
    (data || []).forEach((t) => {
      const idx = parseInt(t.data.slice(5, 7), 10) - 1;
      if (idx < 0 || idx > 11) return;
      if (t.tipo === 'entrada') porMes[idx].entradas += Number(t.valor);
      else porMes[idx].saidas += Number(t.valor);
    });
    setResumoAnual(porMes);
  }, []);

  const carregarPrimeiroMovimento = useCallback(async (entidadeId) => {
    if (!entidadeId) { setPrimeiroMovimento(null); return; }
    const { data } = await supabase
      .from('transacoes')
      .select('data')
      .eq('entidade_id', entidadeId)
      .order('data', { ascending: true })
      .limit(1);
    setPrimeiroMovimento(data && data.length > 0 ? data[0].data : null);
  }, []);

  const carregarPendenciasVencidas = useCallback(async (entidadeId) => {
    if (!entidadeId) { setPendenciasVencidas([]); return; }

    const hoje = new Date();
    const mesRefAtualReal = mesReferenciaStr(hoje.getFullYear(), hoje.getMonth());

    const { data } = await supabase
      .from('lancamentos_fixos_mensal')
      .select('*, lancamentos_fixos(nome, tipo)')
      .eq('entidade_id', entidadeId)
      .eq('status', 'pendente')
      .lt('mes_referencia', mesRefAtualReal)
      .order('mes_referencia', { ascending: true });

    setPendenciasVencidas(data || []);
  }, []);

  const carregarComparativoPFPJ = useCallback(async (listaEntidades, ano, mes) => {
    if (!listaEntidades || listaEntidades.length < 2) { setComparativoPFPJ([]); return; }

    const resultados = await Promise.all(listaEntidades.map(async (ent) => {
      const { data } = await supabase
        .from('transacoes')
        .select('valor, tipo')
        .eq('entidade_id', ent.id)
        .is('transferencia_id', null)
        .or('cartao_id.is.null,origem.eq.fatura')
        .gte('data', primeiroDiaDoMes(ano, mes))
        .lte('data', ultimoDiaDoMes(ano, mes));

      const entradas = (data || []).filter((t) => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor), 0);
      const saidas = (data || []).filter((t) => t.tipo === 'saida').reduce((s, t) => s + Number(t.valor), 0);
      return { nome: ent.nome_entidade, Entradas: entradas, Saídas: saidas };
    }));

    setComparativoPFPJ(resultados);
  }, []);

  const carregarEvolucaoPatrimonio = useCallback(async (entidadeId, listaContas, ano, mesInicioConfigurado) => {
    if (!entidadeId || !listaContas || listaContas.length === 0) { setEvolucaoPatrimonio([]); return; }

    const { data: todasTransacoes } = await supabase
      .from('transacoes')
      .select('valor, tipo, data, conta_id')
      .eq('entidade_id', entidadeId)
      .not('conta_id', 'is', null)
      .order('data', { ascending: true });

    const porConta = {};
    listaContas.forEach((c) => { porConta[c.id] = Number(c.saldo_inicial); });

    // Determina o mês de início: configurado manualmente tem prioridade;
    // senão, a mais antiga entre a criação de uma conta e a primeira transação.
    let inicio = mesInicioConfigurado || null;
    if (!inicio) {
      const dataContaMaisAntiga = listaContas.reduce((min, c) => (!min || c.created_at < min ? c.created_at : min), null);
      const dataPrimeiraTransacao = todasTransacoes && todasTransacoes.length > 0 ? todasTransacoes[0].data : null;
      inicio = dataContaMaisAntiga ? dataContaMaisAntiga.slice(0, 10) : null;
      if (dataPrimeiraTransacao && (!inicio || dataPrimeiraTransacao < inicio)) inicio = dataPrimeiraTransacao;
    }

    const anoInicio = inicio ? parseInt(inicio.slice(0, 4), 10) : ano;
    const mesInicio = inicio ? parseInt(inicio.slice(5, 7), 10) - 1 : 0;

    if (ano < anoInicio) { setEvolucaoPatrimonio([]); return; }

    const aplicadas = new Set();
    const hoje = new Date();
    const pontos = [];

    for (let mes = 0; mes < 12; mes++) {
      if (ano === hoje.getFullYear() && mes > hoje.getMonth()) break;
      const fimDoMes = ultimoDiaDoMes(ano, mes);

      // Aplica o efeito de TODAS as transações até aqui, mesmo as de meses que não serão desenhados —
      // senão o primeiro mês exibido começaria sem refletir o que já aconteceu antes dele.
      (todasTransacoes || []).forEach((t, idx) => {
        if (!aplicadas.has(idx) && t.data <= fimDoMes && porConta[t.conta_id] !== undefined) {
          porConta[t.conta_id] += t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor);
          aplicadas.add(idx);
        }
      });

      if (ano === anoInicio && mes < mesInicio) continue;

      const total = Object.values(porConta).reduce((s, v) => s + v, 0);
      pontos.push({ mes: NOMES_MESES[mes].slice(0, 3), Patrimônio: Number(total.toFixed(2)) });
    }

    setEvolucaoPatrimonio(pontos);
  }, []);

  async function recalcularSaldoConta(contaId) {
    const { data: contaAtual } = await supabase.from('contas').select('saldo_inicial').eq('id', contaId).single();
    if (!contaAtual) return;

    const { data: txs } = await supabase.from('transacoes').select('valor, tipo').eq('conta_id', contaId);
    const soma = (txs || []).reduce((s, t) => s + (t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor)), 0);

    await supabase.from('contas').update({ saldo_atual: Number(contaAtual.saldo_inicial) + soma }).eq('id', contaId);
  }

  const carregarAlertas = useCallback(async (entidadeId, fixos) => {
    if (!entidadeId || !fixos || fixos.length === 0) { setAlertas([]); return; }

    const hoje = new Date();
    const anoReal = hoje.getFullYear();
    const mesReal = hoje.getMonth();
    const diaReal = hoje.getDate();

    const despesas = fixos.filter((f) => f.tipo === 'saida' && (!f.parcelado || calcularParcela(f, anoReal, mesReal) !== null));
    if (despesas.length === 0) { setAlertas([]); return; }

    const mesRef = mesReferenciaStr(anoReal, mesReal);
    const { data: existentes } = await supabase
      .from('lancamentos_fixos_mensal')
      .select('*')
      .eq('entidade_id', entidadeId)
      .eq('mes_referencia', mesRef);

    const mapa = {};
    (existentes || []).forEach((o) => { mapa[o.lancamento_fixo_id] = o; });

    const faltantes = despesas.filter((f) => !mapa[f.id]);
    if (faltantes.length > 0) {
      const novos = faltantes.map((f) => ({
        lancamento_fixo_id: f.id,
        entidade_id: entidadeId,
        mes_referencia: mesRef,
        valor: f.valor_padrao,
        conta_id: f.conta_padrao_id,
        status: 'pendente',
        parcela_numero: calcularParcela(f, anoReal, mesReal),
      }));
      const { data: inseridos } = await supabase.from('lancamentos_fixos_mensal').insert(novos).select();
      (inseridos || []).forEach((o) => { mapa[o.lancamento_fixo_id] = o; });
    }

    const lista = despesas
      .map((f) => ({ fixo: f, ocorrencia: mapa[f.id] }))
      .filter((item) => item.ocorrencia && item.ocorrencia.status === 'pendente')
      .map((item) => ({ ...item, diasRestantes: item.fixo.dia_referencia - diaReal }))
      .filter((item) => item.diasRestantes <= 5)
      .sort((a, b) => a.diasRestantes - b.diasRestantes);

    setAlertas(lista);
  }, []);

  function recarregarTudo() {
    if (!entidadeAtual) return;
    carregarContas(entidadeAtual);
    carregarLancamentosFixos(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    carregarAlertas(entidadeAtual, lancamentosFixos);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      carregarEntidades(data.session.user.id).finally(() => setCarregando(false));
      carregarPerfil(data.session.user.id);
    });
  }, [router, carregarEntidades, carregarPerfil]);

  useEffect(() => {
    const temaSalvo = localStorage.getItem('financas-tema') || 'light';
    const ocultarSalvo = localStorage.getItem('financas-ocultar-valores') === '1';
    const pinSalvo = localStorage.getItem('financas-pin');
    setTema(temaSalvo);
    setValoresOcultos(ocultarSalvo);
    setPinConfigurado(!!pinSalvo);
    setPinDesbloqueado(!pinSalvo);
    setMontado(true);
  }, []);

  function aplicarCorPersonalizada(chave, temaAtual) {
    if (temaAtual === 'dark') {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-dark');
      document.documentElement.style.removeProperty('--primary-tint');
      return;
    }
    const escolhido = TEMAS_CORES[chave];
    if (!escolhido) {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-dark');
      document.documentElement.style.removeProperty('--primary-tint');
      return;
    }
    document.documentElement.style.setProperty('--primary', escolhido.primary);
    document.documentElement.style.setProperty('--primary-dark', escolhido.dark);
    document.documentElement.style.setProperty('--primary-tint', escolhido.tint);
  }

  async function selecionarTema(chave) {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;
    await supabase.from('usuarios').update({ cor_destaque: chave }).eq('id', userId);
    setPerfil((p) => ({ ...p, cor_destaque: chave }));
    aplicarCorPersonalizada(chave, tema);
  }

  async function salvarNomeExibicao(valor) {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;
    await supabase.from('usuarios').update({ nome_exibicao: valor || null }).eq('id', userId);
    setPerfil((p) => ({ ...p, nome_exibicao: valor || null }));
  }

  async function handleUploadLogo(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;
    const extensao = arquivo.name.split('.').pop();
    const caminho = `${userId}/logo.${extensao}`;

    const { error: erroUpload } = await supabase.storage.from('logos').upload(caminho, arquivo, { upsert: true });
    if (erroUpload) return;

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(caminho);
    const novaUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    await supabase.from('usuarios').update({ logo_url: novaUrl }).eq('id', userId);
    setPerfil((p) => ({ ...p, logo_url: novaUrl }));
  }

  function alternarTema() {
    const novo = tema === 'dark' ? 'light' : 'dark';
    setTema(novo);
    localStorage.setItem('financas-tema', novo);
    if (novo === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    aplicarCorPersonalizada(perfil.cor_destaque, novo);
  }

  function alternarOcultarValores() {
    const novo = !valoresOcultos;
    setValoresOcultos(novo);
    localStorage.setItem('financas-ocultar-valores', novo ? '1' : '0');
  }

  function alternarBloqueioPin() {
    if (pinConfigurado) {
      if (window.confirm('Desativar o bloqueio por PIN?')) {
        localStorage.removeItem('financas-pin');
        setPinConfigurado(false);
        setPinDesbloqueado(true);
      }
    } else {
      setCriandoPin(true);
      setPinDigitado('');
      setPinNovoPrimeiraEtapa('');
      setMostrarConfiguracoes(false);
    }
  }

  function cancelarCriacaoPin() {
    setCriandoPin(false);
    setPinNovoPrimeiraEtapa('');
    setPinDigitado('');
    setPinErro(false);
  }

  function processarPinCompleto(novo) {
    if (criandoPin) {
      if (!pinNovoPrimeiraEtapa) {
        setPinNovoPrimeiraEtapa(novo);
        setPinDigitado('');
      } else if (novo === pinNovoPrimeiraEtapa) {
        localStorage.setItem('financas-pin', novo);
        setPinConfigurado(true);
        setPinDesbloqueado(true);
        setCriandoPin(false);
        setPinNovoPrimeiraEtapa('');
        setPinDigitado('');
      } else {
        setPinErro(true);
        setPinNovoPrimeiraEtapa('');
        setPinDigitado('');
      }
    } else {
      const salvo = localStorage.getItem('financas-pin');
      if (novo === salvo) {
        setPinDesbloqueado(true);
        setPinDigitado('');
      } else {
        setPinErro(true);
        setPinDigitado('');
      }
    }
  }

  useEffect(() => {
    if (montado && perfil.cor_destaque) {
      aplicarCorPersonalizada(perfil.cor_destaque, tema);
    }
  }, [montado, perfil.cor_destaque, tema]);

  function digitarPin(digito) {
    if (digito === '⌫') {
      setPinDigitado((p) => p.slice(0, -1));
      setPinErro(false);
      return;
    }
    const novo = (pinDigitado + digito).slice(0, 4);
    setPinDigitado(novo);
    setPinErro(false);
    if (novo.length === 4) {
      setTimeout(() => processarPinCompleto(novo), 120);
    }
  }

  function renderTeclado() {
    const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
    return (
      <div className="pin-keypad">
        {teclas.map((t, i) => (t === '' ? <span key={i} /> : (
          <button key={i} type="button" className="pin-key" onClick={() => digitarPin(t)}>{t}</button>
        )))}
      </div>
    );
  }

  useEffect(() => {
    if (entidadeAtual) {
      setContaLancamentoId('');
      carregarContas(entidadeAtual);
      carregarLancamentosFixos(entidadeAtual);
      carregarMetas(entidadeAtual);
      carregarCartoes(entidadeAtual);
    }
  }, [entidadeAtual, carregarContas, carregarLancamentosFixos, carregarMetas, carregarCartoes]);

  useEffect(() => {
    if (entidadeAtual) {
      carregarFaturas(entidadeAtual, cartoes);
    }
  }, [entidadeAtual, cartoes, carregarFaturas]);

  useEffect(() => {
    if (entidadeAtual) {
      garantirOcorrenciasDoMes(entidadeAtual, lancamentosFixos, dataAtual.ano, dataAtual.mes);
      carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
      carregarAlertas(entidadeAtual, lancamentosFixos);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeAtual, lancamentosFixos, dataAtual.ano, dataAtual.mes]);

  useEffect(() => {
    if (entidadeAtual && aba === 'relatorios') {
      const entidadeObj = entidades.find((e) => e.id === entidadeAtual);
      carregarResumoAnual(entidadeAtual, dataAtual.ano);
      carregarComparativoPFPJ(entidades, dataAtual.ano, dataAtual.mes);
      carregarEvolucaoPatrimonio(entidadeAtual, contas, dataAtual.ano, entidadeObj?.mes_inicio_controle);
      carregarPendenciasVencidas(entidadeAtual);
      carregarPrimeiroMovimento(entidadeAtual);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeAtual, aba, dataAtual.ano, dataAtual.mes, entidades, contas]);

  useEffect(() => {
    if (contas.length > 0 && !contaLancamentoId) {
      setContaLancamentoId(contaPadraoParaLancamento());
    }
  }, [contas, contaLancamentoId]);

  useEffect(() => {
    if (contas.length > 0 && !contaFixoId) {
      setContaFixoId(contaPadraoParaLancamento());
    }
  }, [contas, contaFixoId]);

  // Sugestão de categoria/conta com base no histórico de descrições parecidas.
  useEffect(() => {
    if (!entidadeAtual || descricao.trim().length < 3 || edicaoTransacaoId) {
      setSugestao(null);
      return;
    }
    const timeoutId = setTimeout(async () => {
      const { data } = await supabase
        .from('transacoes')
        .select('categoria, conta_id, tipo')
        .eq('entidade_id', entidadeAtual)
        .is('transferencia_id', null)
        .ilike('descricao', `%${descricao.trim()}%`)
        .order('data', { ascending: false })
        .limit(10);

      if (!data || data.length === 0) { setSugestao(null); return; }

      const contagem = {};
      data.forEach((t) => {
        const chave = `${t.categoria}|${t.conta_id}|${t.tipo}`;
        contagem[chave] = (contagem[chave] || 0) + 1;
      });
      const [chaveMaisComum] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
      const [categoriaSugerida, contaSugerida, tipoSugerido] = chaveMaisComum.split('|');
      const contaValida = contas.find((c) => c.id === contaSugerida);

      setSugestao({
        categoria: categoriaSugerida,
        conta_id: contaValida ? contaSugerida : '',
        conta_nome: contaValida ? contaValida.nome : null,
        tipo: tipoSugerido,
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [descricao, entidadeAtual, edicaoTransacaoId, contas]);

  function aplicarSugestao() {
    if (!sugestao) return;
    setCategoria(sugestao.categoria || '');
    setTipo(sugestao.tipo === 'entrada' ? 'entrada' : 'saida');
    if (sugestao.conta_id) setContaLancamentoId(sugestao.conta_id);
    setSugestao(null);
  }

  // ---------- Navegação de mês/ano ----------

  function baixarArquivo(conteudo, nomeArquivo, tipoMime) {
    const blob = new Blob([conteudo], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function gerarCSV(lista) {
    const cabecalho = ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Conta'];
    const linhas = lista.map((t) => {
      const conta = contas.find((c) => c.id === t.conta_id);
      const valorFormatado = Number(t.valor).toFixed(2).replace('.', ',');
      return [
        t.data,
        t.tipo === 'entrada' ? 'Entrada' : 'Saída',
        (t.categoria || '').replace(/;/g, ','),
        (t.descricao || '').replace(/;/g, ','),
        valorFormatado,
        conta ? conta.nome : '',
      ].join(';');
    });
    return '\uFEFF' + [cabecalho.join(';'), ...linhas].join('\n');
  }

  function exportarMesCSV() {
    const csv = gerarCSV(transacoes);
    baixarArquivo(csv, `lancamentos_${NOMES_MESES[dataAtual.mes].toLowerCase()}_${dataAtual.ano}.csv`, 'text/csv;charset=utf-8;');
  }

  async function exportarAnoCSV() {
    const { data } = await supabase
      .from('transacoes')
      .select('*')
      .eq('entidade_id', entidadeAtual)
      .or('cartao_id.is.null,origem.eq.fatura')
      .gte('data', `${dataAtual.ano}-01-01`)
      .lte('data', `${dataAtual.ano}-12-31`)
      .order('data', { ascending: true });

    const csv = gerarCSV(data || []);
    baixarArquivo(csv, `lancamentos_${dataAtual.ano}.csv`, 'text/csv;charset=utf-8;');
  }

  function exportarPDF() {
    const entidadeNome = entidades.find((e) => e.id === entidadeAtual)?.nome_entidade || '';

    const linhasHtml = transacoes.map((t) => {
      const conta = contas.find((c) => c.id === t.conta_id);
      return `<tr>
        <td>${t.data}</td>
        <td>${t.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td>
        <td>${t.categoria || ''}</td>
        <td>${t.descricao || ''}</td>
        <td>${conta ? conta.nome : ''}</td>
        <td style="text-align:right">${t.tipo === 'entrada' ? '+' : '−'} R$ ${Number(t.valor).toFixed(2)}</td>
      </tr>`;
    }).join('');

    const totalEntradasPdf = transacoes.filter((t) => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor), 0);
    const totalSaidasPdf = transacoes.filter((t) => t.tipo === 'saida').reduce((s, t) => s + Number(t.valor), 0);

    const janela = window.open('', '_blank');
    if (!janela) return;

    janela.document.write(`
      <html>
      <head>
        <title>Lancamentos ${NOMES_MESES[dataAtual.mes]} ${dataAtual.ano}</title>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #1D2A22; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          p.sub { color: #666; font-size: 13px; margin-top: 0; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 16px; }
          th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
          th { background: #f2f2f2; }
          tfoot td { font-weight: bold; border-top: 2px solid #333; }
        </style>
      </head>
      <body>
        <h1>${entidadeNome}</h1>
        <p class="sub">Lançamentos de ${NOMES_MESES[dataAtual.mes]} de ${dataAtual.ano}</p>
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Categoria</th><th>Descrição</th><th>Conta</th><th style="text-align:right">Valor</th></tr></thead>
          <tbody>${linhasHtml}</tbody>
          <tfoot>
            <tr><td colspan="5">Total entradas</td><td style="text-align:right">R$ ${totalEntradasPdf.toFixed(2)}</td></tr>
            <tr><td colspan="5">Total saídas</td><td style="text-align:right">R$ ${totalSaidasPdf.toFixed(2)}</td></tr>
          </tfoot>
        </table>
        <script>window.onload = function () { window.print(); };</script>
      </body>
      </html>
    `);
    janela.document.close();
  }

  function mesAnterior() {
    setDataAtual((d) => (d.mes === 0 ? { ano: d.ano - 1, mes: 11 } : { ano: d.ano, mes: d.mes - 1 }));
  }

  function mesProximo() {
    setDataAtual((d) => (d.mes === 11 ? { ano: d.ano + 1, mes: 0 } : { ano: d.ano, mes: d.mes + 1 }));
  }

  function irParaHoje() {
    const hoje = new Date();
    setDataAtual({ ano: hoje.getFullYear(), mes: hoje.getMonth() });
  }

  // ---------- Entidades ----------

  async function adicionarEntidadePJ(e) {
    e.preventDefault();
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session.user.id;

    const { error } = await supabase.from('entidades').insert({
      usuario_id: userId, tipo: 'PJ', cnpj, nome_entidade: nomeEmpresa, padrao: false,
    });

    if (!error) {
      setCnpj('');
      setNomeEmpresa('');
      setMostrarNovaEntidade(false);
      carregarEntidades(userId);
    }
  }

  async function excluirEntidade(ent) {
    if (!window.confirm(`Remover a empresa "${ent.nome_entidade}"? Isso apaga contas, contas fixas e lançamentos dela.`)) return;
    const { error } = await supabase.from('entidades').delete().eq('id', ent.id);
    if (error) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (entidadeAtual === ent.id) setEntidadeAtual(null);
    carregarEntidades(sessionData.session.user.id);
  }

  async function salvarMesInicioControle(valorMesInput) {
    const dataCompleta = valorMesInput ? `${valorMesInput}-01` : null;
    const { error } = await supabase.from('entidades').update({ mes_inicio_controle: dataCompleta }).eq('id', entidadeAtual);
    if (!error) {
      setEntidades((lista) => lista.map((e) => (e.id === entidadeAtual ? { ...e, mes_inicio_controle: dataCompleta } : e)));
    }
  }

  // ---------- Contas ----------

  async function adicionarConta(e) {
    e.preventDefault();
    if (!entidadeAtual || !nomeConta) return;
    const valorInicial = parseFloat(saldoConta || '0');
    const ehPrimeira = contas.length === 0;

    const { error } = await supabase.from('contas').insert({
      entidade_id: entidadeAtual, nome: nomeConta, saldo_inicial: valorInicial, saldo_atual: valorInicial, principal: ehPrimeira,
    });

    if (!error) {
      setNomeConta('');
      setSaldoConta('');
      setMostrarNovaConta(false);
      carregarContas(entidadeAtual);
    }
  }

  function iniciarEdicaoConta(c) {
    setEdicaoContaId(c.id);
    setFormConta({ nome: c.nome, saldo_inicial: c.saldo_inicial });
  }

  async function salvarEdicaoConta(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('contas')
      .update({ nome: formConta.nome, saldo_inicial: parseFloat(formConta.saldo_inicial || '0') })
      .eq('id', edicaoContaId);

    if (!error) {
      await recalcularSaldoConta(edicaoContaId);
      setEdicaoContaId(null);
      recarregarTudo();
    }
  }

  async function excluirConta(id) {
    if (!window.confirm('Excluir esta conta? Lançamentos fixos vinculados a ela ficam sem conta de origem.')) return;
    const { error } = await supabase.from('contas').delete().eq('id', id);
    if (!error) recarregarTudo();
  }

  async function alternarPrincipal(conta) {
    if (conta.principal) {
      await supabase.from('contas').update({ principal: false }).eq('id', conta.id);
    } else {
      await supabase.from('contas').update({ principal: false }).eq('entidade_id', entidadeAtual).neq('id', conta.id);
      await supabase.from('contas').update({ principal: true }).eq('id', conta.id);
    }
    carregarContas(entidadeAtual);
  }

  // ---------- Metas financeiras ----------

  async function adicionarMeta(e) {
    e.preventDefault();
    if (!entidadeAtual || !nomeMeta || !valorAlvoMeta) return;

    const { error } = await supabase.from('metas').insert({
      entidade_id: entidadeAtual,
      nome: nomeMeta,
      valor_alvo: parseFloat(valorAlvoMeta),
      data_alvo: dataAlvoMeta || null,
      conta_id: contaMetaId || null,
    });

    if (!error) {
      setNomeMeta('');
      setValorAlvoMeta('');
      setDataAlvoMeta('');
      setContaMetaId('');
      setMostrarNovaMeta(false);
      carregarMetas(entidadeAtual);
    }
  }

  function iniciarEdicaoMeta(m) {
    setEdicaoMetaId(m.id);
    setFormMeta({ nome: m.nome, valor_alvo: m.valor_alvo, data_alvo: m.data_alvo || '', conta_id: m.conta_id || '' });
  }

  async function salvarEdicaoMeta(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('metas')
      .update({
        nome: formMeta.nome,
        valor_alvo: parseFloat(formMeta.valor_alvo),
        data_alvo: formMeta.data_alvo || null,
        conta_id: formMeta.conta_id || null,
      })
      .eq('id', edicaoMetaId);

    if (!error) {
      setEdicaoMetaId(null);
      carregarMetas(entidadeAtual);
    }
  }

  async function excluirMeta(id) {
    if (!window.confirm('Excluir esta meta?')) return;
    const { error } = await supabase.from('metas').delete().eq('id', id);
    if (!error) carregarMetas(entidadeAtual);
  }

  function iniciarAporte(meta) {
    setAporteMetaId(meta.id);
    setValorAporte('');
  }

  async function confirmarAporte(e, meta) {
    e.preventDefault();
    const incremento = parseFloat(valorAporte);
    if (!incremento) return;

    const { error } = await supabase
      .from('metas')
      .update({ valor_atual: Number(meta.valor_atual) + incremento })
      .eq('id', meta.id);

    if (!error) {
      setAporteMetaId(null);
      setValorAporte('');
      carregarMetas(entidadeAtual);
    }
  }

  // ---------- Cartões de crédito ----------

  async function adicionarCartao(e) {
    e.preventDefault();
    if (!entidadeAtual || !nomeCartao || !diaFechamentoCartao || !diaVencimentoCartao) return;

    const { error } = await supabase.from('cartoes').insert({
      entidade_id: entidadeAtual,
      nome: nomeCartao,
      dia_fechamento: parseInt(diaFechamentoCartao, 10),
      dia_vencimento: parseInt(diaVencimentoCartao, 10),
      conta_pagamento_id: contaPagamentoCartaoId || null,
    });

    if (!error) {
      setNomeCartao('');
      setDiaFechamentoCartao('');
      setDiaVencimentoCartao('');
      setContaPagamentoCartaoId('');
      setMostrarNovoCartao(false);
      carregarCartoes(entidadeAtual);
    }
  }

  function iniciarEdicaoCartao(c) {
    setEdicaoCartaoId(c.id);
    setFormCartao({
      nome: c.nome,
      dia_fechamento: c.dia_fechamento,
      dia_vencimento: c.dia_vencimento,
      conta_pagamento_id: c.conta_pagamento_id || '',
    });
  }

  async function salvarEdicaoCartao(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('cartoes')
      .update({
        nome: formCartao.nome,
        dia_fechamento: parseInt(formCartao.dia_fechamento, 10),
        dia_vencimento: parseInt(formCartao.dia_vencimento, 10),
        conta_pagamento_id: formCartao.conta_pagamento_id || null,
      })
      .eq('id', edicaoCartaoId);

    if (!error) {
      setEdicaoCartaoId(null);
      carregarCartoes(entidadeAtual);
    }
  }

  async function excluirCartao(id) {
    if (!window.confirm('Excluir este cartão? Compras já lançadas continuam no histórico, sem vínculo com o cartão.')) return;
    const { error } = await supabase.from('cartoes').delete().eq('id', id);
    if (!error) carregarCartoes(entidadeAtual);
  }

  async function carregarComprasCartao(cartaoId) {
    const { data } = await supabase
      .from('transacoes')
      .select('*')
      .eq('cartao_id', cartaoId)
      .neq('origem', 'fatura')
      .order('data', { ascending: false });

    setComprasDoCartao(data || []);
  }

  function alternarComprasCartao(cartaoId) {
    if (comprasCartaoVisivelId === cartaoId) {
      setComprasCartaoVisivelId(null);
      setComprasDoCartao([]);
    } else {
      setComprasCartaoVisivelId(cartaoId);
      carregarComprasCartao(cartaoId);
    }
  }

  function iniciarEdicaoCompraCartao(compra) {
    setEdicaoCompraCartaoId(compra.id);
    setFormCompraCartao({
      valor: compra.valor,
      categoria: compra.categoria || '',
      descricao: compra.descricao || '',
      data: compra.data,
      essencialidade: compra.essencialidade || '',
    });
  }

  async function salvarEdicaoCompraCartao(e, cartao) {
    e.preventDefault();
    const novaMesFatura = calcularMesFaturaCompra(cartao, formCompraCartao.data);

    const { error } = await supabase
      .from('transacoes')
      .update({
        valor: parseFloat(formCompraCartao.valor),
        categoria: formCompraCartao.categoria || 'outros',
        descricao: formCompraCartao.descricao,
        data: formCompraCartao.data,
        essencialidade: formCompraCartao.essencialidade || null,
        mes_fatura: novaMesFatura,
      })
      .eq('id', edicaoCompraCartaoId);

    if (!error) {
      setEdicaoCompraCartaoId(null);
      carregarComprasCartao(cartao.id);
      carregarFaturas(entidadeAtual, cartoes);
    }
  }

  async function excluirCompraCartao(compra) {
    if (!window.confirm('Excluir esta compra?')) return;
    const { error } = await supabase.from('transacoes').delete().eq('id', compra.id);
    if (!error) {
      carregarComprasCartao(compra.cartao_id);
      carregarFaturas(entidadeAtual, cartoes);
    }
  }

  async function adicionarCompraCartao(e, cartao) {
    e.preventDefault();
    if (!valorCompraCartao) return;
    if (parceladoCompraCartao && !totalParcelasCompraCartao) return;

    const data = dataCompraCartao || new Date().toISOString().slice(0, 10);
    const mesFaturaBase = calcularMesFaturaCompra(cartao, data);

    const base = {
      entidade_id: entidadeAtual,
      cartao_id: cartao.id,
      valor: parseFloat(valorCompraCartao),
      tipo: 'saida',
      categoria: categoriaCompraCartao || 'outros',
      descricao: descricaoCompraCartao,
      essencialidade: essencialidadeCompraCartao || null,
      origem: 'texto',
      status: 'pago',
      data,
    };

    let linhas;
    if (parceladoCompraCartao) {
      const total = parseInt(totalParcelasCompraCartao, 10);
      const parcelaInicial = parcelaAtualCompraCartao ? parseInt(parcelaAtualCompraCartao, 10) : 1;
      const compraParceladaId = crypto.randomUUID();

      linhas = [];
      for (let n = parcelaInicial; n <= total; n++) {
        linhas.push({
          ...base,
          mes_fatura: avancarMeses(mesFaturaBase, n - parcelaInicial),
          parcela_atual: n,
          parcela_total: total,
          compra_parcelada_id: compraParceladaId,
        });
      }
    } else {
      linhas = [{ ...base, mes_fatura: mesFaturaBase }];
    }

    const { error } = await supabase.from('transacoes').insert(linhas);

    if (!error) {
      setValorCompraCartao('');
      setCategoriaCompraCartao('');
      setDescricaoCompraCartao('');
      setEssencialidadeCompraCartao('');
      setDataCompraCartao(new Date().toISOString().slice(0, 10));
      setParceladoCompraCartao(false);
      setTotalParcelasCompraCartao('');
      setParcelaAtualCompraCartao('');
      setMostrarCompraCartaoId(null);
      carregarFaturas(entidadeAtual, cartoes);
      if (comprasCartaoVisivelId === cartao.id) carregarComprasCartao(cartao.id);
    }
  }

  async function pagarFatura(cartao) {
    const info = faturasPorCartao[cartao.id];
    if (!info || info.fechada.total <= 0) return;
    if (!window.confirm(`Confirmar pagamento da fatura de ${cartao.nome} (${formatarMoeda(info.fechada.total)})?`)) return;

    const { error } = await supabase.from('transacoes').insert({
      entidade_id: entidadeAtual,
      cartao_id: cartao.id,
      conta_id: cartao.conta_pagamento_id,
      valor: info.fechada.total,
      tipo: 'saida',
      categoria: 'Fatura cartão',
      descricao: `Fatura ${cartao.nome}`,
      origem: 'fatura',
      status: 'pago',
      mes_fatura: info.fechada.mesRef,
      data: new Date().toISOString().slice(0, 10),
    });

    if (error) return;

    if (cartao.conta_pagamento_id) await recalcularSaldoConta(cartao.conta_pagamento_id);

    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    carregarFaturas(entidadeAtual, cartoes);
  }

  // ---------- Lançamentos fixos (molde) ----------

  async function adicionarLancamentoFixo(e, tipoAlvo) {
    e.preventDefault();
    if (!entidadeAtual || !nomeFixo || !diaFixo || !valorFixo) return;
    if (parceladoFixo && !totalParcelasFixo) return;

    let mesInicio = null;
    if (tipoAlvo === 'saida' && parceladoFixo) {
      const parcelaAtual = parcelaAtualFixo ? parseInt(parcelaAtualFixo, 10) : 1;
      const inicio = subtrairMeses(dataAtual.ano, dataAtual.mes, parcelaAtual - 1);
      mesInicio = mesReferenciaStr(inicio.ano, inicio.mes);
    }

    const { error } = await supabase.from('lancamentos_fixos').insert({
      entidade_id: entidadeAtual,
      tipo: tipoAlvo,
      nome: nomeFixo,
      dia_referencia: parseInt(diaFixo, 10),
      valor_padrao: parseFloat(valorFixo),
      conta_padrao_id: contaFixoId || null,
      parcelado: tipoAlvo === 'saida' ? parceladoFixo : false,
      total_parcelas: tipoAlvo === 'saida' && parceladoFixo ? parseInt(totalParcelasFixo, 10) : null,
      mes_inicio: mesInicio,
      essencialidade: tipoAlvo === 'saida' ? (essencialidadeFixo || null) : null,
    });

    if (!error) {
      setNomeFixo('');
      setDiaFixo('');
      setValorFixo('');
      setContaFixoId(contaPadraoParaLancamento());
      setParceladoFixo(false);
      setTotalParcelasFixo('');
      setParcelaAtualFixo('');
      setEssencialidadeFixo('');
      setMostrarNovaReceitaFixa(false);
      setMostrarNovaDespesaFixa(false);
      carregarLancamentosFixos(entidadeAtual);
    }
  }

  function iniciarEdicaoFixo(f) {
    setEdicaoFixoId(f.id);
    setFormFixo({ nome: f.nome, dia_referencia: f.dia_referencia, valor_padrao: f.valor_padrao, conta_padrao_id: f.conta_padrao_id || '' });
  }

  async function salvarEdicaoFixo(e) {
    e.preventDefault();
    const { error } = await supabase
      .from('lancamentos_fixos')
      .update({
        nome: formFixo.nome,
        dia_referencia: parseInt(formFixo.dia_referencia, 10),
        valor_padrao: parseFloat(formFixo.valor_padrao),
        conta_padrao_id: formFixo.conta_padrao_id || null,
      })
      .eq('id', edicaoFixoId);

    if (!error) {
      setEdicaoFixoId(null);
      recarregarTudo();
    }
  }

  async function excluirFixo(f) {
    if (!window.confirm(`Excluir "${f.nome}"? Isso remove o molde recorrente; lançamentos já confirmados continuam no histórico.`)) return;
    const { error } = await supabase.from('lancamentos_fixos').delete().eq('id', f.id);
    if (!error) recarregarTudo();
  }

  // ---------- Ocorrência mensal de um lançamento fixo ----------

  function iniciarEdicaoOcorrencia(ocorrencia) {
    setEdicaoOcorrenciaId(ocorrencia.id);
    setFormOcorrencia({ valor: ocorrencia.valor, conta_id: ocorrencia.conta_id || '' });
  }

  async function salvarEdicaoOcorrencia(e, ocorrenciaId) {
    e.preventDefault();
    await supabase
      .from('lancamentos_fixos_mensal')
      .update({ valor: parseFloat(formOcorrencia.valor), conta_id: formOcorrencia.conta_id || null })
      .eq('id', ocorrenciaId);

    setEdicaoOcorrenciaId(null);
    garantirOcorrenciasDoMes(entidadeAtual, lancamentosFixos, dataAtual.ano, dataAtual.mes);
  }

  async function confirmarOcorrencia(fixo, ocorrencia) {
    const hoje = new Date().toISOString().slice(0, 10);

    const novaTransacao = {
      entidade_id: entidadeAtual,
      conta_id: ocorrencia.conta_id,
      valor: ocorrencia.valor,
      tipo: fixo.tipo,
      categoria: fixo.nome,
      descricao: fixo.nome,
      essencialidade: fixo.tipo === 'saida' ? (fixo.essencialidade || null) : null,
      origem: 'recorrente',
      status: 'pago',
      data: hoje,
    };

    const { data: inserida, error } = await supabase.from('transacoes').insert(novaTransacao).select().single();
    if (error) return;

    await supabase.from('lancamentos_fixos_mensal').update({ status: 'confirmado', transacao_id: inserida.id }).eq('id', ocorrencia.id);

    if (ocorrencia.conta_id) await recalcularSaldoConta(ocorrencia.conta_id);

    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    garantirOcorrenciasDoMes(entidadeAtual, lancamentosFixos, dataAtual.ano, dataAtual.mes);
    carregarAlertas(entidadeAtual, lancamentosFixos);
    carregarPendenciasVencidas(entidadeAtual);
  }

  function desfazerOcorrencia(ocorrencia) {
    if (!ocorrencia.transacao_id) return;
    reverterTransacao({ id: ocorrencia.transacao_id, conta_id: ocorrencia.conta_id });
  }

  // ---------- Transações ----------

  function contaPadraoParaLancamento() {
    const principal = contas.find((c) => c.principal);
    return principal ? principal.id : (contas[0] ? contas[0].id : '');
  }

  async function adicionarTransacao(e) {
    e.preventDefault();
    if (!entidadeAtual || !valor || !contaLancamentoId) return;

    const novaTransacao = {
      entidade_id: entidadeAtual,
      conta_id: contaLancamentoId,
      valor: parseFloat(valor),
      tipo,
      categoria: categoria || (tipo === 'entrada' ? 'receita' : 'outros'),
      descricao,
      essencialidade: tipo === 'saida' ? (essencialidade || null) : null,
      data: dataLancamento || new Date().toISOString().slice(0, 10),
      origem: 'texto',
      status: 'pago',
    };

    const { error } = await supabase.from('transacoes').insert(novaTransacao);
    if (error) return;

    await recalcularSaldoConta(contaLancamentoId);

    setValor('');
    setCategoria('');
    setDescricao('');
    setDataLancamento(new Date().toISOString().slice(0, 10));
    setEssencialidade('');
    setSugestao(null);
    setContaLancamentoId(contaPadraoParaLancamento());
    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
  }

  async function reverterTransacao(t) {
    await supabase.from('lancamentos_fixos_mensal').update({ status: 'pendente', transacao_id: null }).eq('transacao_id', t.id);

    const contasParaRecalcular = new Set();
    if (t.conta_id) contasParaRecalcular.add(t.conta_id);

    if (t.transferencia_id) {
      const { data: par } = await supabase.from('transacoes').select('*').eq('transferencia_id', t.transferencia_id).neq('id', t.id);
      if (par && par.length > 0) {
        if (par[0].conta_id) contasParaRecalcular.add(par[0].conta_id);
        await supabase.from('transacoes').delete().eq('id', par[0].id);
      }
    }

    const { error } = await supabase.from('transacoes').delete().eq('id', t.id);
    if (error) return;

    for (const contaId of contasParaRecalcular) {
      await recalcularSaldoConta(contaId);
    }

    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    garantirOcorrenciasDoMes(entidadeAtual, lancamentosFixos, dataAtual.ano, dataAtual.mes);
    carregarAlertas(entidadeAtual, lancamentosFixos);
  }

  async function realizarTransferencia(e) {
    e.preventDefault();
    if (!entidadeAtual || !contaOrigemId || !contaDestinoId || !valorTransferencia) return;
    if (contaOrigemId === contaDestinoId) return;

    const contaOrigem = contas.find((c) => c.id === contaOrigemId);
    const contaDestino = contas.find((c) => c.id === contaDestinoId);
    const valorNum = parseFloat(valorTransferencia);
    const transferenciaId = crypto.randomUUID();

    const { error } = await supabase.from('transacoes').insert([
      { entidade_id: entidadeAtual, conta_id: contaOrigemId, valor: valorNum, tipo: 'saida', categoria: 'transferencia', descricao: `Transferência para ${contaDestino ? contaDestino.nome : 'outra conta'}`, origem: 'transferencia', status: 'pago', transferencia_id: transferenciaId },
      { entidade_id: entidadeAtual, conta_id: contaDestinoId, valor: valorNum, tipo: 'entrada', categoria: 'transferencia', descricao: `Transferência de ${contaOrigem ? contaOrigem.nome : 'outra conta'}`, origem: 'transferencia', status: 'pago', transferencia_id: transferenciaId },
    ]);

    if (error) return;

    await recalcularSaldoConta(contaOrigemId);
    await recalcularSaldoConta(contaDestinoId);

    setContaOrigemId('');
    setContaDestinoId('');
    setValorTransferencia('');
    setMostrarTransferencia(false);
    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
  }

  // ---------- Importação de extrato (OFX/CSV) ----------

  function handleArquivoExtrato(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    setNomeArquivoImportado(arquivo.name);
    const extensao = arquivo.name.split('.').pop().toLowerCase();

    const leitor = new FileReader();
    leitor.onload = (evento) => {
      const texto = evento.target.result;
      const resultado = extensao === 'csv' ? parseCSVExtrato(texto) : parseOFX(texto);
      setPreviewImportacao(resultado);
    };
    leitor.readAsText(arquivo, 'ISO-8859-1');
  }

  function alternarInclusaoPreview(index) {
    setPreviewImportacao((lista) => lista.map((t, i) => (i === index ? { ...t, incluir: !t.incluir } : t)));
  }

  function marcarTodosPreview(valor) {
    setPreviewImportacao((lista) => lista.map((t) => ({ ...t, incluir: valor })));
  }

  async function confirmarImportacao() {
    if (!destinoImportacaoId || previewImportacao.length === 0) return;
    setImportando(true);

    const [tipoDestino, idDestino] = destinoImportacaoId.split(':');
    const cartaoSelecionado = tipoDestino === 'cartao' ? cartoes.find((c) => c.id === idDestino) : null;

    const selecionadas = previewImportacao.filter((t) => t.incluir);
    const referencias = selecionadas.map((t) => t.referencia_externa).filter(Boolean);

    let existentes = new Set();
    if (referencias.length > 0) {
      let consulta = supabase.from('transacoes').select('referencia_externa').in('referencia_externa', referencias);
      consulta = tipoDestino === 'cartao' ? consulta.eq('cartao_id', idDestino) : consulta.eq('conta_id', idDestino);
      const { data } = await consulta;
      existentes = new Set((data || []).map((t) => t.referencia_externa));
    }

    const novas = selecionadas
      .filter((t) => !t.referencia_externa || !existentes.has(t.referencia_externa))
      .map((t) => {
        const base = {
          entidade_id: entidadeAtual,
          valor: t.valor,
          tipo: t.tipo,
          categoria: 'importado',
          descricao: t.descricao,
          data: t.data,
          origem: 'importado',
          status: 'pago',
          referencia_externa: t.referencia_externa,
        };

        if (tipoDestino === 'cartao') {
          return { ...base, tipo: 'saida', cartao_id: idDestino, mes_fatura: calcularMesFaturaCompra(cartaoSelecionado, t.data) };
        }
        return { ...base, conta_id: idDestino };
      });

    const ignoradas = selecionadas.length - novas.length;

    if (novas.length > 0) {
      await supabase.from('transacoes').insert(novas);
      if (tipoDestino === 'conta') await recalcularSaldoConta(idDestino);
    }

    setImportando(false);
    setPreviewImportacao([]);
    setNomeArquivoImportado('');
    setMostrarImportar(false);
    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    if (tipoDestino === 'cartao') carregarFaturas(entidadeAtual, cartoes);

    window.alert(`${novas.length} lançamento(s) importado(s).${ignoradas > 0 ? ` ${ignoradas} já existiam e foram ignorados.` : ''}`);
  }

  async function excluirTransacao(t) {
    if (!window.confirm('Excluir este lançamento?')) return;
    reverterTransacao(t);
  }

  function iniciarEdicaoTransacao(t) {
    setEdicaoTransacaoId(t.id);
    setFormTransacao({ valor: t.valor, categoria: t.categoria || '', descricao: t.descricao || '', data: t.data });
  }

  async function salvarEdicaoTransacao(e) {
    e.preventDefault();
    const transacaoOriginal = transacoes.find((t) => t.id === edicaoTransacaoId);

    const { error } = await supabase
      .from('transacoes')
      .update({
        valor: parseFloat(formTransacao.valor),
        categoria: formTransacao.categoria || 'outros',
        descricao: formTransacao.descricao,
        data: formTransacao.data,
      })
      .eq('id', edicaoTransacaoId);

    if (!error) {
      setEdicaoTransacaoId(null);
      if (transacaoOriginal && transacaoOriginal.conta_id) await recalcularSaldoConta(transacaoOriginal.conta_id);
      carregarContas(entidadeAtual);
      carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    }
  }

  async function sair() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  function irParaSecao(idSecao) {
    setAba('painel');
    setSidebarMobileAberta(false);
    setTimeout(() => {
      document.getElementById(idSecao)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function alternarSidebar() {
    if (window.innerWidth <= 620) {
      setSidebarMobileAberta((v) => !v);
    } else {
      setSidebarAberta((v) => !v);
    }
  }

  if (!montado) return null;

  if (criandoPin) {
    const confirmando = !!pinNovoPrimeiraEtapa;
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <span className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>{perfil.logo_url ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}</span>
          <p className="card-title" style={{ marginTop: 10 }}>{confirmando ? 'Confirme o PIN' : 'Crie um PIN de 4 dígitos'}</p>
          <p className="empty-hint">{pinErro ? 'Os PINs não coincidem, tente de novo.' : 'Usado só para reabrir o app rapidamente.'}</p>
          <div className="pin-dots">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`pin-dot ${i < pinDigitado.length ? 'pin-dot-filled' : ''}`} />)}
          </div>
          {renderTeclado()}
          <button onClick={cancelarCriacaoPin} className="btn-link" style={{ marginTop: 14 }}>Cancelar</button>
        </div>
      </div>
    );
  }

  if (pinConfigurado && !pinDesbloqueado) {
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <span className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}>{perfil.logo_url ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}</span>
          <p className="card-title" style={{ marginTop: 10 }}>Digite seu PIN</p>
          <p className="empty-hint">{pinErro ? 'PIN incorreto.' : 'Controle Financeiro bloqueado'}</p>
          <div className="pin-dots">
            {[0, 1, 2, 3].map((i) => <span key={i} className={`pin-dot ${i < pinDigitado.length ? 'pin-dot-filled' : ''}`} />)}
          </div>
          {renderTeclado()}
        </div>
      </div>
    );
  }

  if (carregando) return <p style={{ padding: 24 }}>Carregando...</p>;

  const saldoContas = contas.reduce((soma, c) => soma + Number(c.saldo_atual), 0);
  const despesasFixasPendentes = lancamentosFixos
    .filter((f) => f.tipo === 'saida' && ocorrenciasDoMes[f.id] && ocorrenciasDoMes[f.id].status === 'pendente')
    .reduce((soma, f) => soma + Number(ocorrenciasDoMes[f.id].valor), 0);
  const receitasFixasPendentes = lancamentosFixos
    .filter((f) => f.tipo === 'entrada' && ocorrenciasDoMes[f.id] && ocorrenciasDoMes[f.id].status === 'pendente')
    .reduce((soma, f) => soma + Number(ocorrenciasDoMes[f.id].valor), 0);
  const saldoConsolidado = saldoContas - despesasFixasPendentes;

  const despesasPorCategoria = Object.values(
    transacoes.filter((t) => t.tipo === 'saida' && !t.transferencia_id).reduce((acc, t) => {
      const chave = t.categoria || 'outros';
      if (!acc[chave]) acc[chave] = { categoria: chave, valor: 0 };
      acc[chave].valor += Number(t.valor);
      return acc;
    }, {})
  ).sort((a, b) => b.valor - a.valor);

  const entidadeAtualObj = entidades.find((e) => e.id === entidadeAtual);

  const mesInicioVisivel = (() => {
    const referencia = entidadeAtualObj?.mes_inicio_controle || primeiroMovimento;
    if (!referencia) return 0;
    const anoReferencia = parseInt(referencia.slice(0, 4), 10);
    if (dataAtual.ano < anoReferencia) return 12; // ano inteiro antes do início: nenhum mês visível
    if (dataAtual.ano > anoReferencia) return 0;
    return parseInt(referencia.slice(5, 7), 10) - 1;
  })();

  const indicesMesesVisiveis = Array.from({ length: 12 - mesInicioVisivel }, (_, i) => mesInicioVisivel + i);

  const dadosBarras = indicesMesesVisiveis.map((i) => ({ mes: NOMES_MESES[i].slice(0, 3), Entradas: resumoAnual[i].entradas, Saídas: resumoAnual[i].saidas }));

  const saidasDoMes = transacoes.filter((t) => t.tipo === 'saida' && !t.transferencia_id);
  const totalSaidasMes = saidasDoMes.reduce((s, t) => s + Number(t.valor), 0);
  const saidasFixasMes = saidasDoMes.filter((t) => t.origem === 'recorrente').reduce((s, t) => s + Number(t.valor), 0);
  const saidasVariaveisMes = totalSaidasMes - saidasFixasMes;
  const pctFixas = totalSaidasMes > 0 ? (saidasFixasMes / totalSaidasMes) * 100 : 0;

  const entradasDoMes = transacoes.filter((t) => t.tipo === 'entrada' && !t.transferencia_id);
  const totalEntradasMes = entradasDoMes.reduce((s, t) => s + Number(t.valor), 0);
  const resultadoMes = totalEntradasMes - totalSaidasMes;
  const margemMes = totalEntradasMes > 0 ? (resultadoMes / totalEntradasMes) * 100 : 0;

  const despesasEssenciais = saidasDoMes.filter((t) => t.essencialidade === 'essencial').reduce((s, t) => s + Number(t.valor), 0);
  const despesasDesejaveis = saidasDoMes.filter((t) => t.essencialidade === 'desejavel').reduce((s, t) => s + Number(t.valor), 0);
  const despesasSuperfluas = saidasDoMes.filter((t) => t.essencialidade === 'superfluo').reduce((s, t) => s + Number(t.valor), 0);
  const despesasNaoClassificadas = totalSaidasMes - despesasEssenciais - despesasDesejaveis - despesasSuperfluas;
  const pctRendaComprometida = totalEntradasMes > 0 ? (despesasEssenciais / totalEntradasMes) * 100 : 0;
  const corComprometimento = pctRendaComprometida > 70 ? 'var(--negative)' : pctRendaComprometida > 50 ? 'var(--accent)' : 'var(--primary)';

  const ocorrenciasArray = Object.entries(ocorrenciasDoMes).map(([fixoId, ocorrencia]) => {
    const fixo = lancamentosFixos.find((f) => f.id === fixoId);
    return { fixo, ocorrencia };
  }).filter((item) => item.fixo);

  const despesasPagasMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'saida' && i.ocorrencia.status === 'confirmado');
  const despesasAbertoMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'saida' && i.ocorrencia.status === 'pendente');
  const receitasRecebidasMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'entrada' && i.ocorrencia.status === 'confirmado');
  const receitasAbertoMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'entrada' && i.ocorrencia.status === 'pendente');

  const totalDespesasPagasMes = despesasPagasMes.reduce((s, i) => s + Number(i.ocorrencia.valor), 0);
  const totalDespesasAbertoMes = despesasAbertoMes.reduce((s, i) => s + Number(i.ocorrencia.valor), 0);
  const totalReceitasRecebidasMes = receitasRecebidasMes.reduce((s, i) => s + Number(i.ocorrencia.valor), 0);
  const totalReceitasAbertoMes = receitasAbertoMes.reduce((s, i) => s + Number(i.ocorrencia.valor), 0);

  const hojeReal = new Date();
  const compromissosFuturos = lancamentosFixos
    .filter((f) => f.tipo === 'saida' && f.parcelado && f.mes_inicio)
    .map((f) => {
      const [anoInicio, mesInicioStr] = f.mes_inicio.split('-');
      const mesInicioIdx = parseInt(mesInicioStr, 10) - 1;
      const numero = (hojeReal.getFullYear() - parseInt(anoInicio, 10)) * 12 + (hojeReal.getMonth() - mesInicioIdx) + 1;
      let restantes;
      if (numero < 1) restantes = f.total_parcelas;
      else if (numero > f.total_parcelas) restantes = 0;
      else restantes = f.total_parcelas - numero + 1;
      return { fixo: f, restantes, total: restantes * Number(f.valor_padrao) };
    })
    .filter((item) => item.restantes > 0);
  const totalCompromissosFuturos = compromissosFuturos.reduce((s, item) => s + item.total, 0);

  const maioresLancamentos = [...transacoes]
    .filter((t) => !t.transferencia_id)
    .sort((a, b) => Number(b.valor) - Number(a.valor))
    .slice(0, 5);

  function renderListaFixos(tipoAlvo, expandido, aoExpandir, ordenacao) {
    const listaCompleta = lancamentosFixos.filter((f) => {
      if (f.tipo !== tipoAlvo) return false;
      if (f.parcelado) return calcularParcela(f, dataAtual.ano, dataAtual.mes) !== null;
      return true;
    }).sort((a, b) => (
      ordenacao === 'alfabetica' ? a.nome.localeCompare(b.nome, 'pt-BR') : a.dia_referencia - b.dia_referencia
    ));

    if (listaCompleta.length === 0) {
      return <p className="empty-hint">Nenhuma {tipoAlvo === 'entrada' ? 'receita fixa' : 'despesa fixa'} neste mês.</p>;
    }

    const lista = expandido ? listaCompleta : listaCompleta.slice(0, LIMITE_LISTA);

    const linhas = lista.map((f) => {
      if (edicaoFixoId === f.id) {
        return (
          <form key={f.id} onSubmit={salvarEdicaoFixo} className="form-row" style={{ padding: '8px 0' }}>
            <input className="input" value={formFixo.nome} onChange={(e) => setFormFixo({ ...formFixo, nome: e.target.value })} required />
            <input className="input" style={{ width: 90 }} type="number" min="1" max="31" value={formFixo.dia_referencia} onChange={(e) => setFormFixo({ ...formFixo, dia_referencia: e.target.value })} required />
            <input className="input" style={{ width: 110 }} type="number" step="0.01" value={formFixo.valor_padrao} onChange={(e) => setFormFixo({ ...formFixo, valor_padrao: e.target.value })} required />
            <select className="input" value={formFixo.conta_padrao_id} onChange={(e) => setFormFixo({ ...formFixo, conta_padrao_id: e.target.value })}>
              <option value="">Conta padrão (opcional)</option>
              {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
            </select>
            <button type="submit" className="btn btn-primary">Salvar</button>
            <button type="button" onClick={() => setEdicaoFixoId(null)} className="btn-link">Cancelar</button>
          </form>
        );
      }

      const ocorrencia = ocorrenciasDoMes[f.id];
      const contaVinculada = contas.find((c) => c.id === (ocorrencia ? ocorrencia.conta_id : f.conta_padrao_id));

      if (!ocorrencia) {
        return <p key={f.id} className="empty-hint">{f.nome} — carregando mês...</p>;
      }

      if (edicaoOcorrenciaId === ocorrencia.id) {
        return (
          <form key={f.id} onSubmit={(e) => salvarEdicaoOcorrencia(e, ocorrencia.id)} className="form-row" style={{ padding: '8px 0' }}>
            <span style={{ fontSize: 13 }}>{f.nome} ({NOMES_MESES[dataAtual.mes]}):</span>
            <input className="input" style={{ width: 110 }} type="number" step="0.01" value={formOcorrencia.valor} onChange={(e) => setFormOcorrencia({ ...formOcorrencia, valor: e.target.value })} required />
            <select className="input" value={formOcorrencia.conta_id} onChange={(e) => setFormOcorrencia({ ...formOcorrencia, conta_id: e.target.value })}>
              <option value="">Sem conta</option>
              {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
            </select>
            <button type="submit" className="btn btn-primary">Salvar</button>
            <button type="button" onClick={() => setEdicaoOcorrenciaId(null)} className="btn-link">Cancelar</button>
          </form>
        );
      }

      return (
        <div key={f.id} className="row">
          <div className="row-main">
            <div>
              <p className="row-title">
                {f.nome}
                {ocorrencia.parcela_numero && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {ocorrencia.parcela_numero}/{f.total_parcelas}</span>}
              </p>
              <p className="row-subtitle">todo dia {f.dia_referencia}{contaVinculada ? ` · ${contaVinculada.nome}` : ''}</p>
            </div>
            <div className="row-actions">
              <span className="amount">{formatarMoeda(ocorrencia.valor)}</span>
              {ocorrencia.status === 'confirmado' ? (
                <>
                  <span className="badge badge-confirmed">{tipoAlvo === 'entrada' ? 'Recebido' : 'Pago'}</span>
                  <button onClick={() => desfazerOcorrencia(ocorrencia)} className="btn-link">desfazer</button>
                </>
              ) : (
                <>
                  <span className="badge badge-pending">Pendente</span>
                  <button onClick={() => iniciarEdicaoOcorrencia(ocorrencia)} className="btn-link">ajustar</button>
                  <button onClick={() => confirmarOcorrencia(f, ocorrencia)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}>
                    {tipoAlvo === 'entrada' ? 'Recebido' : 'Pago'}
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={() => iniciarEdicaoFixo(f)} className="btn-link">editar molde</button>
            <button onClick={() => excluirFixo(f)} className="btn-link">excluir</button>
          </div>
        </div>
      );
    });

    return (
      <>
        {linhas}
        {listaCompleta.length > LIMITE_LISTA && (
          <div className="show-more-row">
            <button onClick={() => aoExpandir((v) => !v)} className="btn-link">
              {expandido ? 'ver menos' : `ver mais (${listaCompleta.length - LIMITE_LISTA})`}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="layout-root">
      <div className={`sidebar-backdrop ${sidebarMobileAberta ? 'mobile-open' : ''}`} onClick={() => setSidebarMobileAberta(false)} />
      <aside className={`sidebar ${sidebarAberta ? '' : 'collapsed'} ${sidebarMobileAberta ? 'mobile-open' : ''}`}>
        <button onClick={alternarSidebar} className="sidebar-toggle" title="Recolher/expandir menu">☰</button>
        <div className="sidebar-brand">
          {perfil.logo_url ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}
          <span className="brand-text" style={{ fontWeight: 700, fontSize: 14 }}>{perfil.nome_exibicao || 'Finanças'}</span>
        </div>

        <button onClick={() => { setAba('painel'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'painel' ? 'active' : ''}`}>
          <span className="sidebar-icon">🏠</span><span className="sidebar-label">Painel</span>
        </button>
        <button onClick={() => { setAba('relatorios'); setSidebarMobileAberta(false); }} className={`sidebar-link ${aba === 'relatorios' ? 'active' : ''}`}>
          <span className="sidebar-icon">📊</span><span className="sidebar-label">Relatórios</span>
        </button>

        <div className="sidebar-divider" />

        <button onClick={() => irParaSecao('secao-contas')} className="sidebar-link"><span className="sidebar-icon">🏦</span><span className="sidebar-label">Contas</span></button>
        <button onClick={() => irParaSecao('secao-cartoes')} className="sidebar-link"><span className="sidebar-icon">💳</span><span className="sidebar-label">Cartões</span></button>
        <button onClick={() => irParaSecao('secao-receitas')} className="sidebar-link"><span className="sidebar-icon">⬇</span><span className="sidebar-label">Receitas fixas</span></button>
        <button onClick={() => irParaSecao('secao-despesas')} className="sidebar-link"><span className="sidebar-icon">⬆</span><span className="sidebar-label">Despesas fixas</span></button>
        <button onClick={() => irParaSecao('secao-metas')} className="sidebar-link"><span className="sidebar-icon">🎯</span><span className="sidebar-label">Metas</span></button>
        <button onClick={() => irParaSecao('secao-lancamentos')} className="sidebar-link"><span className="sidebar-icon">🧾</span><span className="sidebar-label">Lançamentos</span></button>

        <div className="sidebar-footer">
          <div className="sidebar-divider" />
          <button onClick={() => setMostrarConfiguracoes((v) => !v)} className="sidebar-link"><span className="sidebar-icon">⚙</span><span className="sidebar-label">Configurações</span></button>
          <button onClick={sair} className="sidebar-link"><span className="sidebar-icon">🚪</span><span className="sidebar-label">Sair</span></button>
        </div>
      </aside>

      <div className="layout-content">
    <div className={`app-shell ${valoresOcultos ? 'valores-ocultos' : ''}`}>
      <div className="topbar">
        <div className="topbar-row">
          <span className="brand">
            {perfil.logo_url ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}
            <span className="brand-text">{perfil.nome_exibicao || 'Controle Financeiro'}</span>
          </span>
          <div className="settings-wrap">
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <button onClick={() => setMostrarConfiguracoes((v) => !v)} className="btn-icon" title="Configurações">⚙</button>
              <button onClick={sair} className="btn-link">Sair</button>
            </div>
            {mostrarConfiguracoes && (
              <div className="settings-menu">
                <div className="settings-item">
                  <span>Modo escuro</span>
                  <button onClick={alternarTema} className={`toggle-switch ${tema === 'dark' ? 'on' : ''}`} />
                </div>
                <div className="settings-item">
                  <span>Ocultar valores</span>
                  <button onClick={alternarOcultarValores} className={`toggle-switch ${valoresOcultos ? 'on' : ''}`} />
                </div>
                <div className="settings-item">
                  <span>Bloqueio por PIN</span>
                  <button onClick={alternarBloqueioPin} className={`toggle-switch ${pinConfigurado ? 'on' : ''}`} />
                </div>

                <div className="settings-divider" />

                <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span>Logo</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {perfil.logo_url ? <img src={perfil.logo_url} alt="Logo" className="brand-logo" /> : <span className="brand-mark">R$</span>}
                    <label className="btn-link" style={{ cursor: 'pointer' }}>
                      alterar
                      <input type="file" accept="image/*" onChange={handleUploadLogo} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>

                <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span>Nome de exibição</span>
                  <input
                    className="input"
                    style={{ fontSize: 12, padding: '6px 8px', width: '100%' }}
                    placeholder="Controle Financeiro"
                    value={nomeExibicaoInput}
                    onChange={(e) => setNomeExibicaoInput(e.target.value)}
                    onBlur={() => salvarNomeExibicao(nomeExibicaoInput)}
                  />
                </div>

                <div className="settings-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                  <span>Cor do tema</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Object.entries(TEMAS_CORES).map(([chave, t]) => (
                      <button
                        key={chave}
                        onClick={() => selecionarTema(chave)}
                        title={chave}
                        className={`color-swatch ${(perfil.cor_destaque || 'teal') === chave ? 'selected' : ''}`}
                        style={{ background: t.primary }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="entity-row">
          {entidades.map((ent) => (
            <div key={ent.id} className="entity-pill-group">
              <button
                onClick={() => setEntidadeAtual(ent.id)}
                className={`pill ${entidadeAtual === ent.id ? 'pill-active' : ''}`}
                style={ent.tipo === 'PJ' ? { borderRadius: '999px 0 0 999px' } : undefined}
              >
                {ent.nome_entidade}
              </button>
              {ent.tipo === 'PJ' && (
                <button onClick={() => excluirEntidade(ent)} title="Remover empresa" className="pill-remove">×</button>
              )}
            </div>
          ))}
          <button onClick={() => setMostrarNovaEntidade((v) => !v)} className="btn btn-ghost">+ Adicionar CNPJ</button>
        </div>

        {mostrarNovaEntidade && (
          <form onSubmit={adicionarEntidadePJ} className="form-row" style={{ marginBottom: 14 }}>
            <input className="input" placeholder="Nome da empresa" value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} required />
            <input className="input" placeholder="CNPJ" value={cnpj} onChange={(e) => setCnpj(e.target.value)} required />
            <button type="submit" className="btn btn-primary">Salvar</button>
          </form>
        )}

        <div className="month-row">
          <div className="month-nav">
            <button onClick={mesAnterior} className="btn-icon">‹</button>
            <span className="month-label">{NOMES_MESES[dataAtual.mes]} de {dataAtual.ano}</span>
            <button onClick={mesProximo} className="btn-icon">›</button>
            <button onClick={irParaHoje} className="btn btn-ghost">Hoje</button>
          </div>
          <div className="tabs">
            <button onClick={() => setAba('painel')} className={`tab ${aba === 'painel' ? 'tab-active' : ''}`}>Painel</button>
            <button onClick={() => setAba('relatorios')} className={`tab ${aba === 'relatorios' ? 'tab-active' : ''}`}>Relatórios</button>
          </div>
        </div>
      </div>

      {aba === 'relatorios' ? (
        <>
          <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="card-title" style={{ marginRight: 4 }}>Considerando dados a partir de</span>
            <input
              className="input"
              type="month"
              style={{ width: 160 }}
              value={entidadeAtualObj?.mes_inicio_controle ? entidadeAtualObj.mes_inicio_controle.slice(0, 7) : ''}
              onChange={(e) => salvarMesInicioControle(e.target.value)}
            />
            {entidadeAtualObj?.mes_inicio_controle && (
              <button onClick={() => salvarMesInicioControle('')} className="btn-link">usar detecção automática</button>
            )}
            <p className="empty-hint" style={{ margin: 0, width: '100%' }}>
              Meses anteriores a essa data ficam fora dos relatórios, mas continuam acessíveis navegando pelo Painel.
            </p>
          </div>

          <div className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="card-title" style={{ marginRight: 4 }}>Exportar</span>
            <button onClick={exportarMesCSV} className="btn btn-ghost">CSV do mês</button>
            <button onClick={exportarAnoCSV} className="btn btn-ghost">CSV do ano</button>
            <button onClick={exportarPDF} className="btn btn-ghost">PDF do mês</button>
          </div>

          {comparativoPFPJ.length > 1 && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 4 }}>Comparativo PF x PJ — {NOMES_MESES[dataAtual.mes]}</p>
              <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Quanto cada entidade recebeu e gastou neste mês.</p>
              <GraficoComparativoPFPJ dados={comparativoPFPJ} />
            </div>
          )}

          <div className="card">
            <p className="card-title" style={{ marginBottom: 12 }}>DRE simplificado — {NOMES_MESES[dataAtual.mes]}</p>
            <div className="row row-main"><span className="row-title">Receitas</span><span className="amount amount-positive">{formatarMoeda(totalEntradasMes)}</span></div>
            <div className="row row-main"><span className="row-title">Despesas</span><span className="amount">{formatarMoeda(totalSaidasMes)}</span></div>
            <div className="row row-main">
              <span className="row-title" style={{ fontWeight: 700 }}>Resultado</span>
              <span className="amount" style={{ fontSize: 18, color: resultadoMes >= 0 ? 'var(--primary)' : 'var(--negative)' }}>{formatarMoeda(resultadoMes)}</span>
            </div>
            {totalEntradasMes > 0 && (
              <p className="empty-hint" style={{ marginTop: 6, marginBottom: 0 }}>Margem: {margemMes.toFixed(1)}% da receita</p>
            )}
          </div>

          <div className="card">
            <p className="card-title" style={{ marginBottom: 12 }}>Pagas x em aberto — {NOMES_MESES[dataAtual.mes]}</p>
            <div className="row row-main">
              <span className="row-title">Despesas pagas</span>
              <span>{despesasPagasMes.length} · <span className="amount">{formatarMoeda(totalDespesasPagasMes)}</span></span>
            </div>
            <div className="row row-main">
              <span className="row-title">Despesas em aberto</span>
              <span>{despesasAbertoMes.length} · <span className="amount">{formatarMoeda(totalDespesasAbertoMes)}</span></span>
            </div>
            <div className="row row-main">
              <span className="row-title">Receitas recebidas</span>
              <span>{receitasRecebidasMes.length} · <span className="amount amount-positive">{formatarMoeda(totalReceitasRecebidasMes)}</span></span>
            </div>
            <div className="row row-main">
              <span className="row-title">Receitas a receber</span>
              <span>{receitasAbertoMes.length} · <span className="amount">{formatarMoeda(totalReceitasAbertoMes)}</span></span>
            </div>
          </div>

          {pendenciasVencidas.length > 0 && (
            <div className="card card-despesas">
              <p className="card-title" style={{ marginBottom: 4 }}>Atrasadas</p>
              <p className="empty-hint" style={{ marginTop: 0, marginBottom: 10 }}>Contas fixas de meses anteriores que nunca foram confirmadas.</p>
              {pendenciasVencidas.map((o) => (
                <div key={o.id} className="row row-main">
                  <div>
                    <p className="row-title">{o.lancamentos_fixos?.nome}</p>
                    <p className="row-subtitle">referente a {o.mes_referencia.slice(0, 7)}</p>
                  </div>
                  <div className="row-actions">
                    <span className="amount">{formatarMoeda(o.valor)}</span>
                    <button
                      onClick={() => confirmarOcorrencia({ id: o.lancamento_fixo_id, tipo: o.lancamentos_fixos?.tipo, nome: o.lancamentos_fixos?.nome }, o)}
                      className="btn btn-primary"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                    >
                      Confirmar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Entradas x saídas — {dataAtual.ano}</p>
            <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Transferências entre contas não entram nesse total.</p>
            <GraficoEntradasSaidas dados={dadosBarras} />
          </div>

          {evolucaoPatrimonio.length > 1 && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 4 }}>Evolução do patrimônio — {dataAtual.ano}</p>
              <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Soma do saldo de todas as contas ao fim de cada mês.</p>
              <GraficoEvolucaoPatrimonio dados={evolucaoPatrimonio} />
            </div>
          )}

          <div className="card">
            <p className="card-title">Despesas por categoria — {NOMES_MESES[dataAtual.mes]}</p>
            {despesasPorCategoria.length === 0 ? (
              <p className="empty-hint">Nenhuma despesa neste mês ainda.</p>
            ) : (
              <GraficoDespesasPorCategoria dados={despesasPorCategoria} />
            )}
          </div>

          <div className="card">
            <p className="card-title" style={{ marginBottom: 12 }}>Fixas x variáveis — {NOMES_MESES[dataAtual.mes]}</p>
            {totalSaidasMes === 0 ? (
              <p className="empty-hint">Nenhuma despesa neste mês ainda.</p>
            ) : (
              <>
                <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${pctFixas}%`, background: 'var(--negative)' }} />
                  <div style={{ width: `${100 - pctFixas}%`, background: 'var(--accent)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13 }}>
                  <span>🔴 Fixas — {formatarMoeda(saidasFixasMes)} ({pctFixas.toFixed(0)}%)</span>
                  <span>🟡 Variáveis — {formatarMoeda(saidasVariaveisMes)} ({(100 - pctFixas).toFixed(0)}%)</span>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Essencialidade dos gastos — {NOMES_MESES[dataAtual.mes]}</p>
            {totalSaidasMes === 0 ? (
              <p className="empty-hint">Nenhuma despesa neste mês ainda.</p>
            ) : (
              <>
                {totalEntradasMes > 0 && (
                  <p style={{ fontSize: 13, margin: '4px 0 12px', color: corComprometimento, fontWeight: 600 }}>
                    {pctRendaComprometida.toFixed(0)}% da renda comprometida com despesas essenciais
                    {pctRendaComprometida > 70 && ' — acima do recomendado (até ~50%)'}
                  </p>
                )}
                <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${(despesasEssenciais / totalSaidasMes) * 100}%`, background: 'var(--primary)' }} />
                  <div style={{ width: `${(despesasDesejaveis / totalSaidasMes) * 100}%`, background: 'var(--accent)' }} />
                  <div style={{ width: `${(despesasSuperfluas / totalSaidasMes) * 100}%`, background: 'var(--negative)' }} />
                  <div style={{ width: `${(despesasNaoClassificadas / totalSaidasMes) * 100}%`, background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 12 }}>
                  <span>🟢 Essencial — {formatarMoeda(despesasEssenciais)}</span>
                  <span>🟡 Desejável — {formatarMoeda(despesasDesejaveis)}</span>
                  <span>🔴 Supérfluo — {formatarMoeda(despesasSuperfluas)}</span>
                  {despesasNaoClassificadas > 0 && <span style={{ color: 'var(--text-muted)' }}>⚪ Não classificado — {formatarMoeda(despesasNaoClassificadas)}</span>}
                </div>
              </>
            )}
          </div>

          {compromissosFuturos.length > 0 && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 4 }}>Compromissos futuros em parcelas</p>
              <p className="empty-hint" style={{ marginTop: 0, marginBottom: 10 }}>Quanto ainda falta pagar nas despesas parceladas em andamento, a partir de hoje.</p>
              <p className="amount amount-hero" style={{ color: 'var(--negative)' }}>{formatarMoeda(totalCompromissosFuturos)}</p>
              {compromissosFuturos.map((item) => (
                <div key={item.fixo.id} className="row row-main">
                  <span className="row-title">{item.fixo.nome}</span>
                  <span className="row-subtitle">{item.restantes} parcela(s) restante(s) · {formatarMoeda(item.total)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Maiores lançamentos — {NOMES_MESES[dataAtual.mes]}</p>
            {maioresLancamentos.length === 0 ? (
              <p className="empty-hint">Nenhum lançamento neste mês ainda.</p>
            ) : (
              maioresLancamentos.map((t) => (
                <div key={t.id} className="row row-main">
                  <div>
                    <p className="row-title">{t.descricao || t.categoria}</p>
                    <p className="row-subtitle">{t.categoria} · {t.data}</p>
                  </div>
                  <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>{formatarMoeda(t.valor)}</span>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <p className="card-title" style={{ marginBottom: 12 }}>Resumo mês a mês — {dataAtual.ano}</p>
            {indicesMesesVisiveis.length === 0 ? (
              <p className="empty-hint">Nenhuma movimentação registrada até {dataAtual.ano}.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo do mês</th></tr>
                </thead>
                <tbody>
                  {indicesMesesVisiveis.map((i) => {
                    const m = resumoAnual[i];
                    const saldoMes = m.entradas - m.saidas;
                    return (
                      <tr key={i}>
                        <td>{NOMES_MESES[i]}</td>
                        <td style={{ color: 'var(--primary)' }}>{formatarMoeda(m.entradas)}</td>
                        <td>{formatarMoeda(m.saidas)}</td>
                        <td style={{ fontWeight: 600, color: saldoMes >= 0 ? 'var(--primary)' : 'var(--negative)' }}>{formatarMoeda(saldoMes)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}          </div>
        </>
      ) : (
        <>
          {alertas.length > 0 && (
            <div className="alert-banner">
              <span className="card-icon" style={{ background: '#fff', color: 'var(--negative)' }}>⏰</span>
              <div>
                <p className="alert-banner-title">Vencimentos próximos</p>
                {alertas.map(({ fixo, ocorrencia, diasRestantes }) => (
                  <p key={fixo.id} className={`alert-item ${diasRestantes < 0 ? 'alert-item-overdue' : ''}`}>
                    {fixo.nome} — {diasRestantes < 0 ? `atrasada há ${Math.abs(diasRestantes)} dia(s)` : diasRestantes === 0 ? 'vence hoje' : `vence em ${diasRestantes} dia(s)`} · {formatarMoeda(ocorrencia.valor)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {pctRendaComprometida > 70 && (
            <div className="alert-banner">
              <span className="card-icon" style={{ background: '#fff', color: 'var(--negative)' }}>📊</span>
              <div>
                <p className="alert-banner-title">Renda comprometida</p>
                <p className="alert-item alert-item-overdue">
                  {pctRendaComprometida.toFixed(0)}% da renda de {NOMES_MESES[dataAtual.mes]} já está comprometida só com despesas essenciais (recomendado: até ~50%).
                </p>
              </div>
            </div>
          )}

          <div className={`receipt-card ${saldoConsolidado < 0 ? 'receipt-card-negative' : ''}`}>
            <p className="receipt-label">Saldo consolidado</p>
            <p className="receipt-amount">{formatarMoeda(saldoConsolidado)}</p>
            <p className="receipt-detail">
              {formatarMoeda(saldoContas)} em contas − {formatarMoeda(despesasFixasPendentes)} de despesas fixas pendentes
              {receitasFixasPendentes > 0 && ` · ${formatarMoeda(receitasFixasPendentes)} a receber`}
            </p>
          </div>

          <div className="card card-contas" id="secao-contas">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">🏦</span><p className="card-title">Contas</p></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {contas.length >= 2 && <button onClick={() => setMostrarTransferencia((v) => !v)} className="btn btn-ghost">⇄ Transferir</button>}
                <button onClick={() => setMostrarImportar((v) => !v)} className="btn btn-ghost">⬆ Importar extrato</button>
                <button onClick={() => setMostrarNovaConta((v) => !v)} className="btn btn-ghost">+ Nova conta</button>
                <button onClick={() => setSecaoAberta({ ...secaoAberta, contas: !secaoAberta.contas })} className="collapse-btn">{secaoAberta.contas ? '▾' : '▸'}</button>
              </div>
            </div>

            {secaoAberta.contas && (
              <>
                {mostrarNovaConta && (
                  <form onSubmit={adicionarConta} className="form-row" style={{ marginBottom: 12 }}>
                    <input className="input" placeholder="Nome (ex: Nubank)" value={nomeConta} onChange={(e) => setNomeConta(e.target.value)} required />
                    <input className="input" style={{ width: 120 }} type="number" step="0.01" placeholder="Saldo inicial" value={saldoConta} onChange={(e) => setSaldoConta(e.target.value)} />
                    <button type="submit" className="btn btn-primary">Salvar</button>
                  </form>
                )}

                {mostrarTransferencia && (
                  <form onSubmit={realizarTransferencia} className="form-row" style={{ marginBottom: 12 }}>
                    <select className="input" value={contaOrigemId} onChange={(e) => setContaOrigemId(e.target.value)} required>
                      <option value="">De qual conta</option>
                      {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>→</span>
                    <select className="input" value={contaDestinoId} onChange={(e) => setContaDestinoId(e.target.value)} required>
                      <option value="">Para qual conta</option>
                      {contas.filter((c) => c.id !== contaOrigemId).map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                    <input className="input" style={{ width: 110 }} type="number" step="0.01" placeholder="Valor" value={valorTransferencia} onChange={(e) => setValorTransferencia(e.target.value)} required />
                    <button type="submit" className="btn btn-primary">Transferir</button>
                  </form>
                )}

                {mostrarImportar && (
                  <div style={{ marginBottom: 12, padding: 12, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
                    <div className="form-row" style={{ marginBottom: previewImportacao.length > 0 ? 12 : 0 }}>
                      <select className="input" value={destinoImportacaoId} onChange={(e) => setDestinoImportacaoId(e.target.value)} required>
                        <option value="">Importar para...</option>
                        {contas.length > 0 && (
                          <optgroup label="Contas">
                            {contas.map((c) => (<option key={`conta:${c.id}`} value={`conta:${c.id}`}>{c.nome}</option>))}
                          </optgroup>
                        )}
                        {cartoes.length > 0 && (
                          <optgroup label="Cartões de crédito">
                            {cartoes.map((c) => (<option key={`cartao:${c.id}`} value={`cartao:${c.id}`}>{c.nome} (fatura)</option>))}
                          </optgroup>
                        )}
                      </select>
                      <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                        {nomeArquivoImportado || 'Escolher arquivo .ofx ou .csv'}
                        <input type="file" accept=".ofx,.csv" onChange={handleArquivoExtrato} style={{ display: 'none' }} />
                      </label>
                    </div>

                    {destinoImportacaoId.startsWith('cartao:') && previewImportacao.length > 0 && (
                      <p className="empty-hint" style={{ margin: '0 0 8px' }}>
                        Todos os itens selecionados entram como compras (despesa) na fatura correspondente à data de cada um.
                      </p>
                    )}

                    {previewImportacao.length > 0 && (
                      <>
                        <p className="empty-hint" style={{ margin: '0 0 8px' }}>
                          {previewImportacao.length} lançamento(s) encontrado(s). Confira antes de importar.
                        </p>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                          <button onClick={() => marcarTodosPreview(true)} className="btn-link">marcar todos</button>
                          <button onClick={() => marcarTodosPreview(false)} className="btn-link">desmarcar todos</button>
                        </div>
                        <div style={{ maxHeight: 260, overflowY: 'auto', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
                          {previewImportacao.map((t, i) => (
                            <div key={i} className="row row-main" style={{ opacity: t.incluir ? 1 : 0.4 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                                <input type="checkbox" checked={t.incluir} onChange={() => alternarInclusaoPreview(i)} />
                                <span>{t.data} · {t.descricao}</span>
                              </label>
                              <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>
                                {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                          <button onClick={confirmarImportacao} className="btn btn-primary" disabled={!destinoImportacaoId || importando}>
                            {importando ? 'Importando...' : `Importar ${previewImportacao.filter((t) => t.incluir).length} selecionado(s)`}
                          </button>
                          <button onClick={() => { setPreviewImportacao([]); setNomeArquivoImportado(''); }} className="btn-link">Cancelar</button>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {contas.length === 0 && <p className="empty-hint">Nenhuma conta cadastrada ainda.</p>}
                {(expandirContas ? contas : contas.slice(0, LIMITE_LISTA)).map((c) => (
                  edicaoContaId === c.id ? (
                    <form key={c.id} onSubmit={salvarEdicaoConta} className="form-row" style={{ padding: '8px 0' }}>
                      <input className="input" value={formConta.nome} onChange={(e) => setFormConta({ ...formConta, nome: e.target.value })} required />
                      <input className="input" style={{ width: 130 }} type="number" step="0.01" value={formConta.saldo_inicial} onChange={(e) => setFormConta({ ...formConta, saldo_inicial: e.target.value })} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>saldo inicial</span>
                      <button type="submit" className="btn btn-primary">Salvar</button>
                      <button type="button" onClick={() => setEdicaoContaId(null)} className="btn-link">Cancelar</button>
                    </form>
                  ) : (
                    <div key={c.id} className="row-main row">
                      <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button onClick={() => alternarPrincipal(c)} className={`star-btn ${c.principal ? 'is-principal' : ''}`} title="Definir como conta principal">★</button>
                        {c.nome}
                      </span>
                      <div className="row-actions">
                        <span className={`amount ${Number(c.saldo_atual) < 0 ? 'amount-negative' : ''}`}>{formatarMoeda(c.saldo_atual)}</span>
                        <button onClick={() => iniciarEdicaoConta(c)} className="btn-link">editar</button>
                        <button onClick={() => excluirConta(c.id)} className="btn-link">excluir</button>
                      </div>
                    </div>
                  )
                ))}
                {contas.length > LIMITE_LISTA && (
                  <div className="show-more-row">
                    <button onClick={() => setExpandirContas((v) => !v)} className="btn-link">
                      {expandirContas ? 'ver menos' : `ver mais (${contas.length - LIMITE_LISTA})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card" id="secao-cartoes">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">💳</span><p className="card-title">Cartões de crédito</p></span>
              <button onClick={() => setMostrarNovoCartao((v) => !v)} className="btn btn-ghost">+ Novo cartão</button>
            </div>

            {mostrarNovoCartao && (
              <form onSubmit={adicionarCartao} className="form-row" style={{ marginBottom: 12 }}>
                <input className="input" placeholder="Nome (ex: Nubank)" value={nomeCartao} onChange={(e) => setNomeCartao(e.target.value)} required />
                <input className="input" style={{ width: 100 }} type="number" min="1" max="31" placeholder="Dia fecham." value={diaFechamentoCartao} onChange={(e) => setDiaFechamentoCartao(e.target.value)} required />
                <input className="input" style={{ width: 100 }} type="number" min="1" max="31" placeholder="Dia venc." value={diaVencimentoCartao} onChange={(e) => setDiaVencimentoCartao(e.target.value)} required />
                <select className="input" value={contaPagamentoCartaoId} onChange={(e) => setContaPagamentoCartaoId(e.target.value)}>
                  <option value="">Conta de pagamento (opcional)</option>
                  {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                </select>
                <button type="submit" className="btn btn-primary">Salvar</button>
              </form>
            )}

            {cartoes.length === 0 && <p className="empty-hint">Nenhum cartão cadastrado ainda.</p>}
            {cartoes.map((cartao) => {
              if (edicaoCartaoId === cartao.id) {
                return (
                  <form key={cartao.id} onSubmit={salvarEdicaoCartao} className="form-row" style={{ padding: '8px 0' }}>
                    <input className="input" value={formCartao.nome} onChange={(e) => setFormCartao({ ...formCartao, nome: e.target.value })} required />
                    <input className="input" style={{ width: 100 }} type="number" min="1" max="31" value={formCartao.dia_fechamento} onChange={(e) => setFormCartao({ ...formCartao, dia_fechamento: e.target.value })} required />
                    <input className="input" style={{ width: 100 }} type="number" min="1" max="31" value={formCartao.dia_vencimento} onChange={(e) => setFormCartao({ ...formCartao, dia_vencimento: e.target.value })} required />
                    <select className="input" value={formCartao.conta_pagamento_id} onChange={(e) => setFormCartao({ ...formCartao, conta_pagamento_id: e.target.value })}>
                      <option value="">Conta de pagamento (opcional)</option>
                      {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                    <button type="submit" className="btn btn-primary">Salvar</button>
                    <button type="button" onClick={() => setEdicaoCartaoId(null)} className="btn-link">Cancelar</button>
                  </form>
                );
              }

              const info = faturasPorCartao[cartao.id];
              const contaPagamento = contas.find((c) => c.id === cartao.conta_pagamento_id);

              return (
                <div key={cartao.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                  <div className="row-main">
                    <span className="row-title">{cartao.nome}</span>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => alternarComprasCartao(cartao.id)} className="btn-link">
                        {comprasCartaoVisivelId === cartao.id ? 'ocultar compras' : 'ver compras'}
                      </button>
                      <button onClick={() => setMostrarCompraCartaoId(mostrarCompraCartaoId === cartao.id ? null : cartao.id)} className="btn-link">+ compra</button>
                      <button onClick={() => iniciarEdicaoCartao(cartao)} className="btn-link">editar cartão</button>
                      <button onClick={() => excluirCartao(cartao.id)} className="btn-link">excluir</button>
                    </div>
                  </div>
                  <p className="row-subtitle">fecha dia {cartao.dia_fechamento} · vence dia {cartao.dia_vencimento}{contaPagamento ? ` · ${contaPagamento.nome}` : ''}</p>

                  {info && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                      <div>
                        <p className="row-subtitle" style={{ margin: 0 }}>Fatura aberta</p>
                        <span className="amount">{formatarMoeda(info.aberta.total)}</span>
                      </div>
                      <div>
                        <p className="row-subtitle" style={{ margin: 0 }}>Fatura fechada</p>
                        <span className="amount">{formatarMoeda(info.fechada.total)}</span>
                        {info.fechada.total > 0 && (
                          info.fechada.paga ? (
                            <span className="badge badge-confirmed" style={{ marginLeft: 8 }}>Paga</span>
                          ) : (
                            <button onClick={() => pagarFatura(cartao)} className="btn btn-primary" style={{ marginLeft: 8, padding: '4px 10px', fontSize: 12 }}>Pagar fatura</button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {comprasCartaoVisivelId === cartao.id && (
                    <div style={{ marginTop: 10, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
                      {comprasDoCartao.length === 0 && <p className="empty-hint">Nenhuma compra lançada neste cartão ainda.</p>}
                      {comprasDoCartao.map((compra) => (
                        edicaoCompraCartaoId === compra.id ? (
                          <form key={compra.id} onSubmit={(e) => salvarEdicaoCompraCartao(e, cartao)} className="form-row" style={{ padding: '8px 0' }}>
                            <input className="input" style={{ width: 100 }} type="number" step="0.01" value={formCompraCartao.valor} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, valor: e.target.value })} required />
                            <input className="input" style={{ width: 120 }} value={formCompraCartao.categoria} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, categoria: e.target.value })} />
                            <input className="input" style={{ flex: 1, minWidth: 120 }} value={formCompraCartao.descricao} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, descricao: e.target.value })} />
                            <input className="input" style={{ width: 150 }} type="date" value={formCompraCartao.data} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, data: e.target.value })} required />
                            <select className="input" value={formCompraCartao.essencialidade} onChange={(e) => setFormCompraCartao({ ...formCompraCartao, essencialidade: e.target.value })}>
                              <option value="">Essencialidade (opc.)</option>
                              <option value="essencial">Essencial</option>
                              <option value="desejavel">Desejável</option>
                              <option value="superfluo">Supérfluo</option>
                            </select>
                            <button type="submit" className="btn btn-primary">Salvar</button>
                            <button type="button" onClick={() => setEdicaoCompraCartaoId(null)} className="btn-link">Cancelar</button>
                          </form>
                        ) : (
                          <div key={compra.id} className="row row-main">
                            <div>
                              <p className="row-title">
                                {compra.descricao || compra.categoria}
                                {compra.parcela_total && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {compra.parcela_atual}/{compra.parcela_total}</span>}
                              </p>
                              <p className="row-subtitle">{compra.categoria} · {compra.data} · fatura {compra.mes_fatura?.slice(0, 7)}</p>
                            </div>
                            <div className="row-actions">
                              <span className="amount">{formatarMoeda(compra.valor)}</span>
                              <button onClick={() => iniciarEdicaoCompraCartao(compra)} className="btn-link">editar</button>
                              <button onClick={() => excluirCompraCartao(compra)} className="btn-link">excluir</button>
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  )}

                  {mostrarCompraCartaoId === cartao.id && (
                    <form onSubmit={(e) => adicionarCompraCartao(e, cartao)} className="form-row" style={{ marginTop: 10 }}>
                      <input className="input" style={{ width: 100 }} type="number" step="0.01" placeholder={parceladoCompraCartao ? 'Valor da parcela' : 'Valor'} value={valorCompraCartao} onChange={(e) => setValorCompraCartao(e.target.value)} required />
                      <input className="input" style={{ width: 130 }} placeholder="Categoria" value={categoriaCompraCartao} onChange={(e) => setCategoriaCompraCartao(e.target.value)} />
                      <input className="input" style={{ flex: 1, minWidth: 120 }} placeholder="Descrição" value={descricaoCompraCartao} onChange={(e) => setDescricaoCompraCartao(e.target.value)} />
                      <input className="input" style={{ width: 150 }} type="date" value={dataCompraCartao} onChange={(e) => setDataCompraCartao(e.target.value)} required />
                      <select className="input" value={essencialidadeCompraCartao} onChange={(e) => setEssencialidadeCompraCartao(e.target.value)}>
                        <option value="">Essencialidade (opc.)</option>
                        <option value="essencial">Essencial</option>
                        <option value="desejavel">Desejável</option>
                        <option value="superfluo">Supérfluo</option>
                      </select>
                      <label className="checkbox-label">
                        <input type="checkbox" checked={parceladoCompraCartao} onChange={(e) => setParceladoCompraCartao(e.target.checked)} />
                        Parcelado
                      </label>
                      {parceladoCompraCartao && (
                        <>
                          <input className="input" style={{ width: 130 }} type="number" min="1" placeholder="Total de parcelas" value={totalParcelasCompraCartao} onChange={(e) => setTotalParcelasCompraCartao(e.target.value)} required />
                          <input className="input" style={{ width: 170 }} type="number" min="1" placeholder="Já está na parcela nº (opc.)" value={parcelaAtualCompraCartao} onChange={(e) => setParcelaAtualCompraCartao(e.target.value)} />
                        </>
                      )}
                      <button type="submit" className="btn btn-primary">Lançar</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          <div className="card card-receitas" id="secao-receitas">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">⬇</span><p className="card-title">Receitas fixas</p></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="input" style={{ padding: '5px 8px', fontSize: 12 }} value={ordenarReceitasPor} onChange={(e) => setOrdenarReceitasPor(e.target.value)}>
                  <option value="data">Ordenar: dia</option>
                  <option value="alfabetica">Ordenar: A-Z</option>
                </select>
                <button onClick={() => setMostrarNovaReceitaFixa((v) => !v)} className="btn btn-ghost">+ Nova receita fixa</button>
                <button onClick={() => setSecaoAberta({ ...secaoAberta, receitas: !secaoAberta.receitas })} className="collapse-btn">{secaoAberta.receitas ? '▾' : '▸'}</button>
              </div>
            </div>

            {secaoAberta.receitas && (
              <>
                {mostrarNovaReceitaFixa && (
                  <form onSubmit={(e) => adicionarLancamentoFixo(e, 'entrada')} className="form-row" style={{ marginBottom: 12 }}>
                    <input className="input" placeholder="Nome (ex: Salário)" value={nomeFixo} onChange={(e) => setNomeFixo(e.target.value)} required />
                    <input className="input" style={{ width: 90 }} type="number" min="1" max="31" placeholder="Dia" value={diaFixo} onChange={(e) => setDiaFixo(e.target.value)} required />
                    <input className="input" style={{ width: 110 }} type="number" step="0.01" placeholder="Valor" value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} required />
                    <select className="input" value={contaFixoId} onChange={(e) => setContaFixoId(e.target.value)}>
                      <option value="">Conta de destino (opcional)</option>
                      {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                    <button type="submit" className="btn btn-primary">Salvar</button>
                  </form>
                )}

                {renderListaFixos('entrada', expandirReceitas, setExpandirReceitas, ordenarReceitasPor)}
              </>
            )}
          </div>

          <div className="card card-despesas" id="secao-despesas">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">⬆</span><p className="card-title">Despesas fixas</p></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="input" style={{ padding: '5px 8px', fontSize: 12 }} value={ordenarDespesasPor} onChange={(e) => setOrdenarDespesasPor(e.target.value)}>
                  <option value="data">Ordenar: dia</option>
                  <option value="alfabetica">Ordenar: A-Z</option>
                </select>
                <button onClick={() => setMostrarNovaDespesaFixa((v) => !v)} className="btn btn-ghost">+ Nova despesa fixa</button>
                <button onClick={() => setSecaoAberta({ ...secaoAberta, despesas: !secaoAberta.despesas })} className="collapse-btn">{secaoAberta.despesas ? '▾' : '▸'}</button>
              </div>
            </div>

            {secaoAberta.despesas && (
              <>
                {mostrarNovaDespesaFixa && (
                  <form onSubmit={(e) => adicionarLancamentoFixo(e, 'saida')} className="form-row" style={{ marginBottom: 12 }}>
                    <input className="input" placeholder="Nome (ex: Aluguel)" value={nomeFixo} onChange={(e) => setNomeFixo(e.target.value)} required />
                    <input className="input" style={{ width: 90 }} type="number" min="1" max="31" placeholder="Dia" value={diaFixo} onChange={(e) => setDiaFixo(e.target.value)} required />
                    <input className="input" style={{ width: 110 }} type="number" step="0.01" placeholder="Valor" value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} required />
                    <select className="input" value={contaFixoId} onChange={(e) => setContaFixoId(e.target.value)}>
                      <option value="">Conta de origem (opcional)</option>
                      {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                    </select>
                    <select className="input" value={essencialidadeFixo} onChange={(e) => setEssencialidadeFixo(e.target.value)}>
                      <option value="">Essencialidade (opc.)</option>
                      <option value="essencial">Essencial</option>
                      <option value="desejavel">Desejável</option>
                      <option value="superfluo">Supérfluo</option>
                    </select>
                    <label className="checkbox-label">
                      <input type="checkbox" checked={parceladoFixo} onChange={(e) => setParceladoFixo(e.target.checked)} />
                      Parcelado
                    </label>
                    {parceladoFixo && (
                      <>
                        <input className="input" style={{ width: 130 }} type="number" min="1" placeholder="Total de parcelas" value={totalParcelasFixo} onChange={(e) => setTotalParcelasFixo(e.target.value)} required />
                        <input className="input" style={{ width: 170 }} type="number" min="1" placeholder="Já está na parcela nº (opc.)" value={parcelaAtualFixo} onChange={(e) => setParcelaAtualFixo(e.target.value)} />
                      </>
                    )}
                    <button type="submit" className="btn btn-primary">Salvar</button>
                  </form>
                )}

                {renderListaFixos('saida', expandirDespesas, setExpandirDespesas, ordenarDespesasPor)}
              </>
            )}
          </div>

          <div className="card" id="secao-metas">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">🎯</span><p className="card-title">Metas financeiras</p></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setMostrarNovaMeta((v) => !v)} className="btn btn-ghost">+ Nova meta</button>
                <button onClick={() => setSecaoAberta({ ...secaoAberta, metas: !secaoAberta.metas })} className="collapse-btn">{secaoAberta.metas ? '▾' : '▸'}</button>
              </div>
            </div>

            {secaoAberta.metas && (
              <>
                {mostrarNovaMeta && (
                  <form onSubmit={adicionarMeta} className="form-row" style={{ marginBottom: 12 }}>
                    <input className="input" placeholder="Nome (ex: Viagem, Reserva)" value={nomeMeta} onChange={(e) => setNomeMeta(e.target.value)} required />
                    <input className="input" style={{ width: 120 }} type="number" step="0.01" placeholder="Valor alvo" value={valorAlvoMeta} onChange={(e) => setValorAlvoMeta(e.target.value)} required />
                    <input className="input" style={{ width: 150 }} type="date" value={dataAlvoMeta} onChange={(e) => setDataAlvoMeta(e.target.value)} />
                    <select className="input" value={contaMetaId} onChange={(e) => setContaMetaId(e.target.value)}>
                      <option value="">Controle manual (sem conta)</option>
                      {contas.map((c) => (<option key={c.id} value={c.id}>Vincular: {c.nome}</option>))}
                    </select>
                    <button type="submit" className="btn btn-primary">Salvar</button>
                  </form>
                )}

                {metas.length === 0 && <p className="empty-hint">Nenhuma meta cadastrada ainda.</p>}
                {(expandirMetas ? metas : metas.slice(0, LIMITE_LISTA)).map((m) => {
                  if (edicaoMetaId === m.id) {
                    return (
                      <form key={m.id} onSubmit={salvarEdicaoMeta} className="form-row" style={{ padding: '8px 0' }}>
                        <input className="input" value={formMeta.nome} onChange={(e) => setFormMeta({ ...formMeta, nome: e.target.value })} required />
                        <input className="input" style={{ width: 120 }} type="number" step="0.01" value={formMeta.valor_alvo} onChange={(e) => setFormMeta({ ...formMeta, valor_alvo: e.target.value })} required />
                        <input className="input" style={{ width: 150 }} type="date" value={formMeta.data_alvo} onChange={(e) => setFormMeta({ ...formMeta, data_alvo: e.target.value })} />
                        <select className="input" value={formMeta.conta_id} onChange={(e) => setFormMeta({ ...formMeta, conta_id: e.target.value })}>
                          <option value="">Controle manual (sem conta)</option>
                          {contas.map((c) => (<option key={c.id} value={c.id}>Vincular: {c.nome}</option>))}
                        </select>
                        <button type="submit" className="btn btn-primary">Salvar</button>
                        <button type="button" onClick={() => setEdicaoMetaId(null)} className="btn-link">Cancelar</button>
                      </form>
                    );
                  }

                  const contaVinculada = contas.find((c) => c.id === m.conta_id);
                  const progresso = contaVinculada ? Number(contaVinculada.saldo_atual) : Number(m.valor_atual);
                  const percentual = Math.max(0, Math.min(100, (progresso / Number(m.valor_alvo)) * 100));
                  const concluida = progresso >= Number(m.valor_alvo);

                  let prazoTexto = null;
                  if (m.data_alvo) {
                    const dias = Math.ceil((new Date(m.data_alvo) - new Date()) / (1000 * 60 * 60 * 24));
                    prazoTexto = dias < 0 ? `prazo vencido há ${Math.abs(dias)}d` : dias === 0 ? 'prazo é hoje' : `${dias}d restantes`;
                  }

                  return (
                    <div key={m.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-alt)' }}>
                      <div className="row-main" style={{ marginBottom: 6 }}>
                        <span className="row-title">{concluida && '🎉 '}{m.nome}{contaVinculada ? ` · ${contaVinculada.nome}` : ''}</span>
                        <span style={{ fontSize: 13 }}>{formatarMoeda(progresso)} / {formatarMoeda(m.valor_alvo)}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-alt)', overflow: 'hidden' }}>
                        <div style={{ width: `${percentual}%`, height: '100%', background: concluida ? 'var(--primary)' : 'var(--accent)' }} />
                      </div>
                      <div className="row-main" style={{ marginTop: 6 }}>
                        <span className="row-subtitle">{percentual.toFixed(0)}%{prazoTexto ? ` · ${prazoTexto}` : ''}</span>
                        <div style={{ display: 'flex', gap: 10 }}>
                          {!contaVinculada && aporteMetaId !== m.id && (
                            <button onClick={() => iniciarAporte(m)} className="btn-link">+ adicionar valor</button>
                          )}
                          <button onClick={() => iniciarEdicaoMeta(m)} className="btn-link">editar</button>
                          <button onClick={() => excluirMeta(m.id)} className="btn-link">excluir</button>
                        </div>
                      </div>
                      {aporteMetaId === m.id && (
                        <form onSubmit={(e) => confirmarAporte(e, m)} className="form-row" style={{ marginTop: 8 }}>
                          <input className="input" style={{ width: 120 }} type="number" step="0.01" placeholder="Valor" value={valorAporte} onChange={(e) => setValorAporte(e.target.value)} required autoFocus />
                          <button type="submit" className="btn btn-primary">Adicionar</button>
                          <button type="button" onClick={() => setAporteMetaId(null)} className="btn-link">Cancelar</button>
                        </form>
                      )}
                    </div>
                  );
                })}
                {metas.length > LIMITE_LISTA && (
                  <div className="show-more-row">
                    <button onClick={() => setExpandirMetas((v) => !v)} className="btn-link">
                      {expandirMetas ? 'ver menos' : `ver mais (${metas.length - LIMITE_LISTA})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="card card-lancamentos" id="secao-lancamentos">
            <span className="card-title-group" style={{ marginBottom: 14 }}><span className="card-icon">🧾</span><p className="card-title">Novo lançamento</p></span>
            {sugestao && (
              <div className="suggestion-banner">
                <span>Sugestão baseada no histórico: <strong>{sugestao.categoria}</strong>{sugestao.conta_nome && ` · ${sugestao.conta_nome}`}</span>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="button" onClick={aplicarSugestao} className="btn-link btn-link-accent">usar</button>
                  <button type="button" onClick={() => setSugestao(null)} className="btn-link">ignorar</button>
                </div>
              </div>
            )}
            <form onSubmit={adicionarTransacao} className="form-row">
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                <option value="saida">Saída (despesa)</option>
                <option value="entrada">Entrada (receita)</option>
              </select>
              <input className="input" style={{ width: 100 }} type="number" step="0.01" placeholder="Valor" value={valor} onChange={(e) => setValor(e.target.value)} required />
              <input className="input" style={{ width: 140 }} placeholder="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
              <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
              <input className="input" style={{ width: 150 }} type="date" value={dataLancamento} onChange={(e) => setDataLancamento(e.target.value)} required />
              {tipo === 'saida' && (
                <select className="input" value={essencialidade} onChange={(e) => setEssencialidade(e.target.value)}>
                  <option value="">Essencialidade (opc.)</option>
                  <option value="essencial">Essencial</option>
                  <option value="desejavel">Desejável</option>
                  <option value="superfluo">Supérfluo</option>
                </select>
              )}
              <select className="input" value={contaLancamentoId} onChange={(e) => setContaLancamentoId(e.target.value)} required>
                <option value="" disabled>Conta *</option>
                {contas.map((c) => (<option key={c.id} value={c.id}>{c.nome}{c.principal ? ' ★' : ''}</option>))}
              </select>
              <button type="submit" className="btn btn-primary" disabled={contas.length === 0}>Lançar</button>
            </form>
            {contas.length === 0 && <p className="error-hint">Cadastre uma conta antes de lançar movimentações.</p>}
          </div>

          <div className="card card-lancamentos">
            <div className="card-header">
              <p className="card-title" style={{ marginBottom: 0 }}>Lançamentos de {NOMES_MESES[dataAtual.mes]}</p>
              <button onClick={() => setSecaoAberta({ ...secaoAberta, lancamentos: !secaoAberta.lancamentos })} className="collapse-btn">{secaoAberta.lancamentos ? '▾' : '▸'}</button>
            </div>
            {secaoAberta.lancamentos && (
              <>
                {transacoes.length === 0 && <p className="empty-hint">Nenhum lançamento em {NOMES_MESES[dataAtual.mes].toLowerCase()}.</p>}
                {(expandirLancamentos ? transacoes : transacoes.slice(0, LIMITE_LISTA)).map((t) => (
                  edicaoTransacaoId === t.id ? (
                    <form key={t.id} onSubmit={salvarEdicaoTransacao} className="form-row" style={{ padding: '10px 0' }}>
                      <input className="input" style={{ width: 100 }} type="number" step="0.01" value={formTransacao.valor} onChange={(e) => setFormTransacao({ ...formTransacao, valor: e.target.value })} required />
                      <input className="input" style={{ width: 120 }} value={formTransacao.categoria} onChange={(e) => setFormTransacao({ ...formTransacao, categoria: e.target.value })} />
                      <input className="input" style={{ flex: 1, minWidth: 120 }} value={formTransacao.descricao} onChange={(e) => setFormTransacao({ ...formTransacao, descricao: e.target.value })} />
                      <input className="input" style={{ width: 140 }} type="date" value={formTransacao.data} onChange={(e) => setFormTransacao({ ...formTransacao, data: e.target.value })} />
                      <button type="submit" className="btn btn-primary">Salvar</button>
                      <button type="button" onClick={() => setEdicaoTransacaoId(null)} className="btn-link">Cancelar</button>
                    </form>
                  ) : (
                    <div key={t.id} className="row row-main">
                      <div>
                        <p className="row-title">{t.transferencia_id && '⇄ '}{t.descricao || t.categoria}</p>
                        <p className="row-subtitle">{t.transferencia_id ? 'transferência entre contas' : t.categoria} · {t.data}</p>
                      </div>
                      <div className="row-actions">
                        <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>
                          {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                        </span>
                        {!t.transferencia_id && <button onClick={() => iniciarEdicaoTransacao(t)} className="btn-link">editar</button>}
                        <button onClick={() => excluirTransacao(t)} className="btn-link">excluir</button>
                      </div>
                    </div>
                  )
                ))}
                {transacoes.length > LIMITE_LISTA && (
                  <div className="show-more-row">
                    <button onClick={() => setExpandirLancamentos((v) => !v)} className="btn-link">
                      {expandirLancamentos ? 'ver menos' : `ver mais (${transacoes.length - LIMITE_LISTA})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
      </div>
    </div>
  );
}
