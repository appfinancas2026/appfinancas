'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { supabase } from '../../lib/supabase';

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const CORES_GRAFICO = ['#0F6E56', '#C68A2E', '#B4472F', '#3B6E8F', '#7A5C9E', '#5C8A3A', '#A6763F', '#4A5A6B'];

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

  const [pinConfigurado, setPinConfigurado] = useState(false);
  const [pinDesbloqueado, setPinDesbloqueado] = useState(true);
  const [pinDigitado, setPinDigitado] = useState('');
  const [pinErro, setPinErro] = useState(false);
  const [criandoPin, setCriandoPin] = useState(false);
  const [pinNovoPrimeiraEtapa, setPinNovoPrimeiraEtapa] = useState('');

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

  const [mostrarNovaReceitaFixa, setMostrarNovaReceitaFixa] = useState(false);
  const [mostrarNovaDespesaFixa, setMostrarNovaDespesaFixa] = useState(false);
  const [nomeFixo, setNomeFixo] = useState('');
  const [diaFixo, setDiaFixo] = useState('');
  const [valorFixo, setValorFixo] = useState('');
  const [contaFixoId, setContaFixoId] = useState('');
  const [parceladoFixo, setParceladoFixo] = useState(false);
  const [totalParcelasFixo, setTotalParcelasFixo] = useState('');
  const [parcelaAtualFixo, setParcelaAtualFixo] = useState('');
  const [edicaoFixoId, setEdicaoFixoId] = useState(null);
  const [formFixo, setFormFixo] = useState({ nome: '', dia_referencia: '', valor_padrao: '', conta_padrao_id: '' });

  const [edicaoOcorrenciaId, setEdicaoOcorrenciaId] = useState(null);
  const [formOcorrencia, setFormOcorrencia] = useState({ valor: '', conta_id: '' });

  const [tipo, setTipo] = useState('saida');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataLancamento, setDataLancamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [contaLancamentoId, setContaLancamentoId] = useState('');
  const [sugestao, setSugestao] = useState(null);

  const [alertas, setAlertas] = useState([]);

  const [secaoAberta, setSecaoAberta] = useState({ contas: true, receitas: true, despesas: true, lancamentos: true });
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

  const carregarComparativoPFPJ = useCallback(async (listaEntidades, ano, mes) => {
    if (!listaEntidades || listaEntidades.length < 2) { setComparativoPFPJ([]); return; }

    const resultados = await Promise.all(listaEntidades.map(async (ent) => {
      const { data } = await supabase
        .from('transacoes')
        .select('valor, tipo')
        .eq('entidade_id', ent.id)
        .is('transferencia_id', null)
        .gte('data', primeiroDiaDoMes(ano, mes))
        .lte('data', ultimoDiaDoMes(ano, mes));

      const entradas = (data || []).filter((t) => t.tipo === 'entrada').reduce((s, t) => s + Number(t.valor), 0);
      const saidas = (data || []).filter((t) => t.tipo === 'saida').reduce((s, t) => s + Number(t.valor), 0);
      return { nome: ent.nome_entidade, Entradas: entradas, Saídas: saidas };
    }));

    setComparativoPFPJ(resultados);
  }, []);

  const carregarEvolucaoPatrimonio = useCallback(async (entidadeId, listaContas, ano) => {
    if (!entidadeId || !listaContas || listaContas.length === 0) { setEvolucaoPatrimonio([]); return; }

    const { data: todasTransacoes } = await supabase
      .from('transacoes')
      .select('valor, tipo, data, conta_id')
      .eq('entidade_id', entidadeId)
      .not('conta_id', 'is', null)
      .order('data', { ascending: true });

    const porConta = {};
    listaContas.forEach((c) => { porConta[c.id] = Number(c.saldo_inicial); });

    const aplicadas = new Set();
    const hoje = new Date();
    const pontos = [];

    for (let mes = 0; mes < 12; mes++) {
      if (ano === hoje.getFullYear() && mes > hoje.getMonth()) break;
      const fimDoMes = ultimoDiaDoMes(ano, mes);

      (todasTransacoes || []).forEach((t, idx) => {
        if (!aplicadas.has(idx) && t.data <= fimDoMes && porConta[t.conta_id] !== undefined) {
          porConta[t.conta_id] += t.tipo === 'entrada' ? Number(t.valor) : -Number(t.valor);
          aplicadas.add(idx);
        }
      });

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
    });
  }, [router, carregarEntidades]);

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

  function alternarTema() {
    const novo = tema === 'dark' ? 'light' : 'dark';
    setTema(novo);
    localStorage.setItem('financas-tema', novo);
    if (novo === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
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
    }
  }, [entidadeAtual, carregarContas, carregarLancamentosFixos]);

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
      carregarResumoAnual(entidadeAtual, dataAtual.ano);
      carregarComparativoPFPJ(entidades, dataAtual.ano, dataAtual.mes);
      carregarEvolucaoPatrimonio(entidadeAtual, contas, dataAtual.ano);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadeAtual, aba, dataAtual.ano, dataAtual.mes, entidades, contas]);

  useEffect(() => {
    if (contas.length > 0 && !contaLancamentoId) {
      setContaLancamentoId(contaPadraoParaLancamento());
    }
  }, [contas, contaLancamentoId]);

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
    });

    if (!error) {
      setNomeFixo('');
      setDiaFixo('');
      setValorFixo('');
      setContaFixoId('');
      setParceladoFixo(false);
      setTotalParcelasFixo('');
      setParcelaAtualFixo('');
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

  if (!montado) return null;

  if (criandoPin) {
    const confirmando = !!pinNovoPrimeiraEtapa;
    return (
      <div className="lock-screen">
        <div className="lock-card">
          <span className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}><span className="brand-mark">R$</span></span>
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
          <span className="brand" style={{ justifyContent: 'center', marginBottom: 6 }}><span className="brand-mark">R$</span></span>
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

  const dadosBarras = resumoAnual.map((m, i) => ({ mes: NOMES_MESES[i].slice(0, 3), Entradas: m.entradas, Saídas: m.saidas }));

  const saidasDoMes = transacoes.filter((t) => t.tipo === 'saida' && !t.transferencia_id);
  const totalSaidasMes = saidasDoMes.reduce((s, t) => s + Number(t.valor), 0);
  const saidasFixasMes = saidasDoMes.filter((t) => t.origem === 'recorrente').reduce((s, t) => s + Number(t.valor), 0);
  const saidasVariaveisMes = totalSaidasMes - saidasFixasMes;
  const pctFixas = totalSaidasMes > 0 ? (saidasFixasMes / totalSaidasMes) * 100 : 0;

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
    <div className={`app-shell ${valoresOcultos ? 'valores-ocultos' : ''}`}>
      <div className="topbar">
        <div className="topbar-row">
          <span className="brand"><span className="brand-mark">R$</span><span className="brand-text">Controle Financeiro</span></span>
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
          {comparativoPFPJ.length > 1 && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 4 }}>Comparativo PF x PJ — {NOMES_MESES[dataAtual.mes]}</p>
              <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Quanto cada entidade recebeu e gastou neste mês.</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={comparativoPFPJ}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-alt)" />
                  <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={40} />
                  <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Entradas" fill="#0F6E56" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Saídas" fill="#B4472F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <p className="card-title" style={{ marginBottom: 4 }}>Entradas x saídas — {dataAtual.ano}</p>
            <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Transferências entre contas não entram nesse total.</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dadosBarras}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-alt)" />
                <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} width={40} />
                <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Entradas" fill="#0F6E56" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Saídas" fill="#B4472F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {evolucaoPatrimonio.length > 1 && (
            <div className="card">
              <p className="card-title" style={{ marginBottom: 4 }}>Evolução do patrimônio — {dataAtual.ano}</p>
              <p className="empty-hint" style={{ marginTop: 0, marginBottom: 12 }}>Soma do saldo de todas as contas ao fim de cada mês.</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={evolucaoPatrimonio}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-alt)" />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={50} />
                  <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                  <Bar dataKey="Patrimônio" fill="#0F6E56" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="card">
            <p className="card-title">Despesas por categoria — {NOMES_MESES[dataAtual.mes]}</p>
            {despesasPorCategoria.length === 0 ? (
              <p className="empty-hint">Nenhuma despesa neste mês ainda.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={despesasPorCategoria} dataKey="valor" nameKey="categoria" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {despesasPorCategoria.map((entry, index) => (
                      <Cell key={entry.categoria} fill={CORES_GRAFICO[index % CORES_GRAFICO.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
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
            <table className="report-table">
              <thead>
                <tr><th>Mês</th><th>Entradas</th><th>Saídas</th><th>Saldo do mês</th></tr>
              </thead>
              <tbody>
                {resumoAnual.map((m, i) => {
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
          </div>
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

          <div className={`receipt-card ${saldoConsolidado < 0 ? 'receipt-card-negative' : ''}`}>
            <p className="receipt-label">Saldo consolidado</p>
            <p className="receipt-amount">{formatarMoeda(saldoConsolidado)}</p>
            <p className="receipt-detail">
              {formatarMoeda(saldoContas)} em contas − {formatarMoeda(despesasFixasPendentes)} de despesas fixas pendentes
              {receitasFixasPendentes > 0 && ` · ${formatarMoeda(receitasFixasPendentes)} a receber`}
            </p>
          </div>

          <div className="card card-contas">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">🏦</span><p className="card-title">Contas</p></span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {contas.length >= 2 && <button onClick={() => setMostrarTransferencia((v) => !v)} className="btn btn-ghost">⇄ Transferir</button>}
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

          <div className="card card-receitas">
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

          <div className="card card-despesas">
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

          <div className="card card-lancamentos">
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
  );
}
