'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { TEMAS_CORES } from '../../lib/temas';
import {
  mesReferenciaStr, primeiroDiaDoMes, ultimoDiaDoMes, subtrairMeses,
  calcularPeriodoFaturaAberta, calcularMesFaturaCompra, avancarMeses,
  parseOFX, parseCSVExtrato, calcularParcela, formatarMoeda,
} from '../../lib/financeiro';
import { recalcularSaldoConta } from '../../lib/saldos';
import TelaPin from './TelaPin';
import CompletarCadastro from './CompletarCadastro';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import MenuConfiguracoes from './MenuConfiguracoes';
import CardMetas from './CardMetas';
import CardOrcamento from './CardOrcamento';
import CardMembros from './CardMembros';
import CardAuditoria from './CardAuditoria';
import AbaRelatorios from './AbaRelatorios';
import Onboarding from './Onboarding';
import CampoCategoria from './CampoCategoria';
import CampoDescricao from './CampoDescricao';
import CapturaRapida from './CapturaRapida';
import CardContas from './CardContas';
import CardCartoes from './CardCartoes';


const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function formatarCabecalhoDia(dataISO) {
  const d = new Date(`${dataISO}T00:00:00`);
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()}`;
}

export default function Dashboard() {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('painel');

  const [montado, setMontado] = useState(false);
  const [tema, setTema] = useState('light');
  const [valoresOcultos, setValoresOcultos] = useState(false);
  const [mostrarConfiguracoes, setMostrarConfiguracoes] = useState(false);
  const refConfiguracoes = useRef(null);

  // Fecha o menu de configurações ao clicar fora dele ou apertar Esc —
  // comportamento esperado de qualquer menu suspenso.
  useEffect(() => {
    if (!mostrarConfiguracoes) return;

    function aoClicarFora(e) {
      if (refConfiguracoes.current && !refConfiguracoes.current.contains(e.target)) {
        setMostrarConfiguracoes(false);
      }
    }

    function aoTeclar(e) {
      if (e.key === 'Escape') setMostrarConfiguracoes(false);
    }

    // 'mousedown' em vez de 'click': fecha assim que o clique começa, sem
    // esperar o botão soltar, o que evita um piscar se o alvo sumir no meio.
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('touchstart', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('touchstart', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [mostrarConfiguracoes]);
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
  const [pagamentoParcialId, setPagamentoParcialId] = useState(null);
  const [valorParcial, setValorParcial] = useState('');

  const [cartoes, setCartoes] = useState([]);

  const [tipo, setTipo] = useState('saida');
  const [valor, setValor] = useState('');
  const [categoria, setCategoria] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataLancamento, setDataLancamento] = useState(() => new Date().toISOString().slice(0, 10));
  const [contaLancamentoId, setContaLancamentoId] = useState('');
  const [essencialidade, setEssencialidade] = useState('');
  const [sugestao, setSugestao] = useState(null);
  const [mostrarCapturaRapida, setMostrarCapturaRapida] = useState(false);

  const [alertas, setAlertas] = useState([]);

  // Quais cards começam abertos. Os essenciais (contas, receitas, despesas,
  // lançamentos) abrem; os de consulta ocasional (cartões, orçamento, metas,
  // acesso, atividade) começam recolhidos para não competir com o que importa.
  // Ficam a um clique, e o app lembra da escolha durante a sessão.
  const [secaoAberta, setSecaoAberta] = useState({
    contas: true,
    receitas: true,
    despesas: true,
    lancamentos: true,
    cartoes: false,
    metas: false,
    orcamento: false,
    membros: false,
    atividade: false,
  });
  const [usuarioId, setUsuarioId] = useState(null);
  const [cadastroIncompleto, setCadastroIncompleto] = useState(false);
  const [onboardingDispensado, setOnboardingDispensado] = useState(false);
  const [expandirReceitas, setExpandirReceitas] = useState(false);
  const [expandirDespesas, setExpandirDespesas] = useState(false);
  const [expandirLancamentos, setExpandirLancamentos] = useState(false);
  const [ordenarReceitasPor, setOrdenarReceitasPor] = useState('data');
  const [ordenarDespesasPor, setOrdenarDespesasPor] = useState('data');
  const [alturaCheiaReceitas, setAlturaCheiaReceitas] = useState(false);
  const [alturaCheiaDespesas, setAlturaCheiaDespesas] = useState(false);
  const LIMITE_LISTA = 6;

  const [edicaoTransacaoId, setEdicaoTransacaoId] = useState(null);
  const [formTransacao, setFormTransacao] = useState({ valor: '', categoria: '', descricao: '', data: '', essencialidade: '' });

  // ---------- Carregamento ----------

  const carregarEntidades = useCallback(async (userId) => {
    // Sem filtro por usuario_id: a RLS já devolve as entidades das quais
    // o usuário é membro (próprias ou compartilhadas com ele).
    const { data } = await supabase
      .from('entidades')
      .select('*')
      .order('padrao', { ascending: false });

    setEntidades(data || []);
    if (data && data.length > 0) {
      setEntidadeAtual((atual) => atual || data[0].id);
    }
  }, []);

  const carregarPerfil = useCallback(async (userId) => {
    const { data } = await supabase.from('usuarios').select('logo_url, nome_exibicao, cor_destaque, cpf, nome').eq('id', userId).single();
    if (data) {
      setPerfil(data);
      setNomeExibicaoInput(data.nome_exibicao || '');
      // Quem entrou por login social ainda não tem CPF: precisa completar.
      setCadastroIncompleto(!data.cpf);
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

  const carregarPendenciasVencidas = useCallback(async (entidadeId, mesInicioConfigurado) => {
    if (!entidadeId) { setPendenciasVencidas([]); return; }

    const hoje = new Date();
    const mesRefAtualReal = mesReferenciaStr(hoje.getFullYear(), hoje.getMonth());

    let consulta = supabase
      .from('lancamentos_fixos_mensal')
      .select('*, lancamentos_fixos(nome, tipo)')
      .eq('entidade_id', entidadeId)
      .eq('status', 'pendente')
      .lt('mes_referencia', mesRefAtualReal);

    if (mesInicioConfigurado) {
      consulta = consulta.gte('mes_referencia', mesInicioConfigurado);
    }

    const { data } = await consulta.order('mes_referencia', { ascending: true });

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
      // 'parcial' também está em aberto: pagar metade não quita a conta.
      .filter((item) => item.ocorrencia && item.ocorrencia.status !== 'confirmado')
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
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }

      const userId = data.session.user.id;
      setUsuarioId(userId);

      // Quem foi cadastrado por email ganha o acesso aqui, sem precisar de link.
      await supabase.rpc('sincronizar_meus_acessos');

      // Se a pessoa chegou por um link de convite antes de ter conta,
      // o token ficou guardado — agora que está logada, aceita.
      const convitePendente = window.localStorage.getItem('convite_pendente');
      if (convitePendente) {
        const { data: resultado } = await supabase.rpc('aceitar_convite', { token_convite: convitePendente });
        window.localStorage.removeItem('convite_pendente');
        if (resultado?.ok) {
          setEntidadeAtual(resultado.entidade_id);
        }
      }

      carregarEntidades(userId).finally(() => setCarregando(false));
      carregarPerfil(userId);
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
    const raiz = document.documentElement;
    const limpar = () => {
      raiz.style.removeProperty('--primary');
      raiz.style.removeProperty('--primary-dark');
      raiz.style.removeProperty('--primary-tint');
    };

    const escolhido = TEMAS_CORES[chave];
    if (!escolhido) {
      limpar();
      return;
    }

    // No escuro, usa a variante dessaturada: as cores do tema claro vibram
    // sobre fundo escuro e cansam a vista.
    const cores = temaAtual === 'dark' ? escolhido.escuro : escolhido;
    if (!cores) {
      limpar();
      return;
    }

    raiz.style.setProperty('--primary', cores.primary);
    raiz.style.setProperty('--primary-dark', cores.dark);
    raiz.style.setProperty('--primary-tint', cores.tint);
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

  useEffect(() => {
    if (entidadeAtual) {
      setContaLancamentoId('');
      carregarContas(entidadeAtual);
      carregarLancamentosFixos(entidadeAtual);
      carregarCartoes(entidadeAtual);
    }
  }, [entidadeAtual, carregarContas, carregarLancamentosFixos, carregarCartoes]);

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
      carregarPendenciasVencidas(entidadeAtual, entidadeObj?.mes_inicio_controle);
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
        .select('categoria, conta_id, tipo, essencialidade, valor, descricao')
        .eq('entidade_id', entidadeAtual)
        .is('transferencia_id', null)
        .ilike('descricao', `%${descricao.trim()}%`)
        .order('data', { ascending: false })
        .limit(10);

      if (!data || data.length === 0) { setSugestao(null); return; }

      const contagem = {};
      data.forEach((t) => {
        const chave = `${t.categoria}|${t.conta_id}|${t.tipo}|${t.essencialidade}`;
        if (!contagem[chave]) contagem[chave] = { n: 0, valores: [] };
        contagem[chave].n++;
        if (t.valor) contagem[chave].valores.push(Number(t.valor));
      });
      const [chaveMaisComum, dados] = Object.entries(contagem).sort((a, b) => b[1].n - a[1].n)[0];
      const [categoriaSugerida, contaSugerida, tipoSugerido, essencialidadeSugerida] = chaveMaisComum.split('|');
      const contaValida = contas.find((c) => c.id === contaSugerida);

      // Valor mais frequente no histórico (moda). Se todos diferentes, usa a média.
      const valorSugerido = (() => {
        if (!dados.valores.length) return null;
        const freq = {};
        dados.valores.forEach((v) => { freq[v] = (freq[v] || 0) + 1; });
        const [moda] = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        return Number(moda);
      })();

      setSugestao({
        categoria: categoriaSugerida,
        conta_id: contaValida ? contaSugerida : '',
        conta_nome: contaValida ? contaValida.nome : null,
        tipo: tipoSugerido,
        essencialidade: essencialidadeSugerida !== 'null' ? essencialidadeSugerida : '',
        valor: valorSugerido,
      });
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [descricao, entidadeAtual, edicaoTransacaoId, contas]);

  function aplicarSugestao() {
    if (!sugestao) return;
    setCategoria(sugestao.categoria || '');
    setTipo(sugestao.tipo === 'entrada' ? 'entrada' : 'saida');
    if (sugestao.conta_id) setContaLancamentoId(sugestao.conta_id);
    if (sugestao.essencialidade) setEssencialidade(sugestao.essencialidade);
    if (sugestao.valor) setValor(String(sugestao.valor));
    setSugestao(null);
  }

  function aplicarExtracaoIA(dados) {
    if (dados.valor !== null && dados.valor !== undefined) setValor(String(dados.valor));
    if (dados.data) setDataLancamento(dados.data);
    if (dados.descricao) setDescricao(dados.descricao);
    if (dados.categoria) setCategoria(dados.categoria);
    if (dados.tipo === 'entrada' || dados.tipo === 'saida') setTipo(dados.tipo);
    setMostrarCapturaRapida(false);
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
        <td style="text-align:right">${t.tipo === 'entrada' ? '+' : '−'} ${formatarMoeda(t.valor)}</td>
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
            <tr><td colspan="5">Total entradas</td><td style="text-align:right">${formatarMoeda(totalEntradasPdf)}</td></tr>
            <tr><td colspan="5">Total saídas</td><td style="text-align:right">${formatarMoeda(totalSaidasPdf)}</td></tr>
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

  async function alternarSecaoOculta(chave) {
    const entidadeAtualObjLocal = entidades.find((e) => e.id === entidadeAtual);
    const atual = entidadeAtualObjLocal?.secoes_ocultas || [];
    const nova = atual.includes(chave) ? atual.filter((s) => s !== chave) : [...atual, chave];

    const { error } = await supabase.from('entidades').update({ secoes_ocultas: nova }).eq('id', entidadeAtual);
    if (!error) {
      setEntidades((lista) => lista.map((e) => (e.id === entidadeAtual ? { ...e, secoes_ocultas: nova } : e)));
    }
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

  async function confirmarOcorrencia(fixo, ocorrencia, valorPago = null) {
    const hoje = new Date().toISOString().slice(0, 10);
    const valor = valorPago !== null ? valorPago : Number(ocorrencia.valor) - jaPagoNaOcorrencia(ocorrencia.id);

    if (!valor || valor <= 0) return;

    const novaTransacao = {
      entidade_id: entidadeAtual,
      conta_id: ocorrencia.conta_id,
      lancamento_mensal_id: ocorrencia.id,
      valor,
      tipo: fixo.tipo,
      categoria: fixo.nome,
      descricao: fixo.nome,
      essencialidade: fixo.tipo === 'saida' ? (fixo.essencialidade || null) : null,
      origem: 'recorrente',
      status: 'pago',
      data: hoje,
    };

    // O status da ocorrência (pendente/parcial/confirmado) é definido por
    // trigger no banco, a partir da soma dos pagamentos — não é escrito aqui.
    const { error } = await supabase.from('transacoes').insert(novaTransacao);
    if (error) return;

    if (ocorrencia.conta_id) await recalcularSaldoConta(ocorrencia.conta_id);

    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    garantirOcorrenciasDoMes(entidadeAtual, lancamentosFixos, dataAtual.ano, dataAtual.mes);
    carregarAlertas(entidadeAtual, lancamentosFixos);
    carregarPendenciasVencidas(entidadeAtual, entidades.find((e) => e.id === entidadeAtual)?.mes_inicio_controle);
  }

  async function desfazerOcorrencia(ocorrencia) {
    // Uma ocorrência pode ter vários pagamentos (parciais). Desfazer significa
    // remover todos e devolver o status para pendente — o trigger cuida do status.
    if (!window.confirm('Desfazer o pagamento? Os lançamentos correspondentes serão removidos.')) return;

    const { error } = await supabase.from('transacoes').delete().eq('lancamento_mensal_id', ocorrencia.id);
    if (error) return;

    // Compatibilidade: ocorrências antigas guardavam a transação neste campo.
    if (ocorrencia.transacao_id) {
      await supabase.from('transacoes').delete().eq('id', ocorrencia.transacao_id);
      await supabase.from('lancamentos_fixos_mensal').update({ transacao_id: null, status: 'pendente' }).eq('id', ocorrencia.id);
    }

    if (ocorrencia.conta_id) await recalcularSaldoConta(ocorrencia.conta_id);

    carregarContas(entidadeAtual);
    carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    garantirOcorrenciasDoMes(entidadeAtual, lancamentosFixos, dataAtual.ano, dataAtual.mes);
    carregarAlertas(entidadeAtual, lancamentosFixos);
    carregarPendenciasVencidas(entidadeAtual, entidades.find((e) => e.id === entidadeAtual)?.mes_inicio_controle);
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


  async function excluirTransacao(t) {
    if (!window.confirm('Excluir este lançamento?')) return;
    reverterTransacao(t);
  }

  function iniciarEdicaoTransacao(t) {
    setEdicaoTransacaoId(t.id);
    setFormTransacao({ valor: t.valor, categoria: t.categoria || '', descricao: t.descricao || '', data: t.data, essencialidade: t.essencialidade || '' });
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
        essencialidade: formTransacao.essencialidade || null,
      })
      .eq('id', edicaoTransacaoId);

    if (!error) {
      setEdicaoTransacaoId(null);
      if (transacaoOriginal && transacaoOriginal.conta_id) await recalcularSaldoConta(transacaoOriginal.conta_id);
      carregarContas(entidadeAtual);
      carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
    }
  }

  async function classificarEssencialidade(t, novoValor) {
    const { error } = await supabase.from('transacoes').update({ essencialidade: novoValor || null }).eq('id', t.id);
    if (!error) carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
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
      <TelaPin
        titulo={confirmando ? 'Confirme o PIN' : 'Crie um PIN de 4 dígitos'}
        subtitulo={pinErro ? 'Os PINs não coincidem, tente de novo.' : 'Usado só para reabrir o app rapidamente.'}
        logoUrl={perfil.logo_url}
        pinDigitado={pinDigitado}
        onTecla={digitarPin}
        onCancelar={cancelarCriacaoPin}
      />
    );
  }

  if (pinConfigurado && !pinDesbloqueado) {
    return (
      <TelaPin
        titulo="Digite seu PIN"
        subtitulo={pinErro ? 'PIN incorreto.' : 'Controle Financeiro bloqueado'}
        logoUrl={perfil.logo_url}
        pinDigitado={pinDigitado}
        onTecla={digitarPin}
      />
    );
  }

  if (carregando) return <p style={{ padding: 24 }}>Carregando...</p>;

  // Login social não fornece CPF: exige o preenchimento antes de liberar o app.
  if (cadastroIncompleto && usuarioId) {
    return (
      <CompletarCadastro
        usuarioId={usuarioId}
        nomeAtual={perfil.nome}
        onConcluido={() => {
          setCadastroIncompleto(false);
          carregarPerfil(usuarioId);
        }}
      />
    );
  }

  // Primeiro acesso: sem nenhuma conta cadastrada, o app não tem o que mostrar.
  // Usar a ausência de contas (e não uma flag) faz o assistente reaparecer se a
  // pessoa entrar de outro dispositivo antes de configurar, e some sozinho
  // assim que existir uma conta — inclusive para quem já usava o app antes.
  if (!onboardingDispensado && entidadeAtual && contas.length === 0 && aba === 'painel') {
    return (
      <Onboarding
        entidadeAtual={entidadeAtual}
        onConcluir={() => {
          setOnboardingDispensado(true);
          carregarContas(entidadeAtual);
          carregarLancamentosFixos(entidadeAtual);
          carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
        }}
      />
    );
  }

  // Quanto já foi pago de cada ocorrência: soma das transações vinculadas a ela.
  // Derivado das transações, nunca de um campo editável — mesmo princípio do
  // saldo das contas.
  const pagoPorOcorrencia = transacoes.reduce((mapa, t) => {
    if (t.lancamento_mensal_id) {
      mapa[t.lancamento_mensal_id] = (mapa[t.lancamento_mensal_id] || 0) + Number(t.valor);
    }
    return mapa;
  }, {});

  function jaPagoNaOcorrencia(ocorrenciaId) {
    return pagoPorOcorrencia[ocorrenciaId] || 0;
  }

  function pendenteNaOcorrencia(ocorrencia) {
    return Math.max(0, Number(ocorrencia.valor) - jaPagoNaOcorrencia(ocorrencia.id));
  }

  const saldoContas = contas.reduce((soma, c) => soma + Number(c.saldo_atual), 0);

  // Considera parciais: uma conta de 300 com 200 pagos ainda pesa 100 no consolidado.
  const despesasFixasPendentes = lancamentosFixos
    .filter((f) => f.tipo === 'saida' && ocorrenciasDoMes[f.id] && ocorrenciasDoMes[f.id].status !== 'confirmado')
    .reduce((soma, f) => soma + pendenteNaOcorrencia(ocorrenciasDoMes[f.id]), 0);
  const receitasFixasPendentes = lancamentosFixos
    .filter((f) => f.tipo === 'entrada' && ocorrenciasDoMes[f.id] && ocorrenciasDoMes[f.id].status !== 'confirmado')
    .reduce((soma, f) => soma + pendenteNaOcorrencia(ocorrenciasDoMes[f.id]), 0);
  const saldoConsolidado = saldoContas - despesasFixasPendentes;

  // Soma do que falta pagar nas contas que estão vencendo ou atrasadas.
  // Usa o pendente real, não o valor cheio: uma conta parcialmente paga
  // deve entrar só com o que resta.
  const totalEmAberto = alertas.reduce((s, a) => s + pendenteNaOcorrencia(a.ocorrencia), 0);

  const despesasPorCategoria = Object.values(
    transacoes.filter((t) => t.tipo === 'saida' && !t.transferencia_id).reduce((acc, t) => {
      const chave = t.categoria || 'outros';
      if (!acc[chave]) acc[chave] = { categoria: chave, valor: 0 };
      acc[chave].valor += Number(t.valor);
      return acc;
    }, {})
  ).sort((a, b) => b.valor - a.valor);

  const entidadeAtualObj = entidades.find((e) => e.id === entidadeAtual);
  const secoesOcultasAtual = entidadeAtualObj?.secoes_ocultas || [];

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

  // "Pago" = quitado. "Em aberto" = pendente ou parcial (ainda deve algo).
  const despesasPagasMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'saida' && i.ocorrencia.status === 'confirmado');
  const despesasAbertoMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'saida' && i.ocorrencia.status !== 'confirmado');
  const receitasRecebidasMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'entrada' && i.ocorrencia.status === 'confirmado');
  const receitasAbertoMes = ocorrenciasArray.filter((i) => i.fixo.tipo === 'entrada' && i.ocorrencia.status !== 'confirmado');

  const totalDespesasPagasMes = despesasPagasMes.reduce((s, i) => s + Number(i.ocorrencia.valor), 0);
  // Em aberto = só o que falta pagar. Uma conta de 300 com 200 pagos entra como 100.
  const totalDespesasAbertoMes = despesasAbertoMes.reduce((s, i) => s + pendenteNaOcorrencia(i.ocorrencia), 0);
  const totalReceitasRecebidasMes = receitasRecebidasMes.reduce((s, i) => s + Number(i.ocorrencia.valor), 0);
  const totalReceitasAbertoMes = receitasAbertoMes.reduce((s, i) => s + pendenteNaOcorrencia(i.ocorrencia), 0);

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

      const pago = jaPagoNaOcorrencia(ocorrencia.id);
      const pendente = pendenteNaOcorrencia(ocorrencia);
      const ehParcial = ocorrencia.status === 'parcial';

      return (
        <div key={f.id} className="row">
          <div className="row-main">
            <div>
              <p className="row-title">
                {f.nome}
                {ocorrencia.parcela_numero && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {ocorrencia.parcela_numero}/{f.total_parcelas}</span>}
              </p>
              <p className="row-subtitle">
                todo dia {f.dia_referencia}{contaVinculada ? ` · ${contaVinculada.nome}` : ''}
                {ehParcial && (
                  <span style={{ color: 'var(--accent)' }}>
                    {' '}· {formatarMoeda(pago)} {tipoAlvo === 'entrada' ? 'recebido' : 'pago'}, falta {formatarMoeda(pendente)}
                  </span>
                )}
              </p>
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
                  <span className={`badge ${ehParcial ? 'badge-partial' : 'badge-pending'}`}>
                    {ehParcial ? 'Parcial' : 'Pendente'}
                  </span>
                  <button onClick={() => iniciarEdicaoOcorrencia(ocorrencia)} className="btn-link">ajustar</button>
                  <button onClick={() => setPagamentoParcialId(pagamentoParcialId === ocorrencia.id ? null : ocorrencia.id)} className="btn-link">
                    parcial
                  </button>
                  <button onClick={() => confirmarOcorrencia(f, ocorrencia)} className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 12 }}>
                    {ehParcial ? 'Quitar' : (tipoAlvo === 'entrada' ? 'Recebido' : 'Pago')}
                  </button>
                </>
              )}
            </div>
          </div>
          {pagamentoParcialId === ocorrencia.id && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const valor = parseFloat(valorParcial);
                if (!valor || valor <= 0) return;
                confirmarOcorrencia(f, ocorrencia, valor);
                setValorParcial('');
                setPagamentoParcialId(null);
              }}
              className="form-row"
              style={{ marginTop: 8, padding: 10, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}
            >
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Falta {formatarMoeda(pendente)} —
              </span>
              <input
                className="input"
                style={{ width: 120 }}
                type="number"
                step="0.01"
                max={pendente}
                placeholder="Quanto agora?"
                value={valorParcial}
                onChange={(e) => setValorParcial(e.target.value)}
                autoFocus
                required
              />
              <button type="submit" className="btn btn-primary">
                {tipoAlvo === 'entrada' ? 'Receber' : 'Pagar'}
              </button>
              <button type="button" onClick={() => { setPagamentoParcialId(null); setValorParcial(''); }} className="btn-link">
                Cancelar
              </button>
            </form>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
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
      <Sidebar
        perfil={perfil}
        aba={aba}
        setAba={setAba}
        irParaSecao={irParaSecao}
        sair={sair}
        sidebarAberta={sidebarAberta}
        sidebarMobileAberta={sidebarMobileAberta}
        setSidebarMobileAberta={setSidebarMobileAberta}
        alternarSidebar={alternarSidebar}
        setMostrarConfiguracoes={setMostrarConfiguracoes}
        secoesOcultas={secoesOcultasAtual}
      />

      <div className="layout-content">
    <div className={`app-shell ${valoresOcultos ? 'valores-ocultos' : ''}`}>
      <div className="topbar">
        <div className="topbar-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={alternarSidebar} className="mobile-menu-btn" title="Menu">☰</button>
            <div className="entity-row" style={{ margin: 0 }}>
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
          </div>
          <div className="settings-wrap" ref={refConfiguracoes}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <button onClick={() => setMostrarConfiguracoes((v) => !v)} className="btn-icon" title="Configurações">⚙</button>
              <button onClick={sair} className="btn-link">Sair</button>
            </div>
            {mostrarConfiguracoes && (
              <MenuConfiguracoes
                tema={tema}
                alternarTema={alternarTema}
                valoresOcultos={valoresOcultos}
                alternarOcultarValores={alternarOcultarValores}
                pinConfigurado={pinConfigurado}
                alternarBloqueioPin={alternarBloqueioPin}
                perfil={perfil}
                handleUploadLogo={handleUploadLogo}
                nomeExibicaoInput={nomeExibicaoInput}
                setNomeExibicaoInput={setNomeExibicaoInput}
                salvarNomeExibicao={salvarNomeExibicao}
                selecionarTema={selecionarTema}
                secoesOcultas={entidadeAtualObj?.secoes_ocultas || []}
                alternarSecaoOculta={alternarSecaoOculta}
              />
            )}
          </div>
        </div>

        {mostrarNovaEntidade && (
          <form onSubmit={adicionarEntidadePJ} className="form-row" style={{ marginBottom: 14 }}>
            <input className="input" placeholder="Nome da empresa" value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} required autoFocus />
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
        <AbaRelatorios
          entidadeAtualObj={entidadeAtualObj}
          salvarMesInicioControle={salvarMesInicioControle}
          exportarMesCSV={exportarMesCSV}
          exportarAnoCSV={exportarAnoCSV}
          exportarPDF={exportarPDF}
          comparativoPFPJ={comparativoPFPJ}
          dataAtual={dataAtual}
          totalEntradasMes={totalEntradasMes}
          totalSaidasMes={totalSaidasMes}
          resultadoMes={resultadoMes}
          margemMes={margemMes}
          despesasPagasMes={despesasPagasMes}
          totalDespesasPagasMes={totalDespesasPagasMes}
          despesasAbertoMes={despesasAbertoMes}
          totalDespesasAbertoMes={totalDespesasAbertoMes}
          receitasRecebidasMes={receitasRecebidasMes}
          totalReceitasRecebidasMes={totalReceitasRecebidasMes}
          receitasAbertoMes={receitasAbertoMes}
          totalReceitasAbertoMes={totalReceitasAbertoMes}
          pendenciasVencidas={pendenciasVencidas}
          confirmarOcorrencia={confirmarOcorrencia}
          lancamentosFixos={lancamentosFixos}
          dadosBarras={dadosBarras}
          indicesMesesVisiveis={indicesMesesVisiveis}
          resumoAnual={resumoAnual}
          evolucaoPatrimonio={evolucaoPatrimonio}
          despesasPorCategoria={despesasPorCategoria}
          saidasFixasMes={saidasFixasMes}
          saidasVariaveisMes={saidasVariaveisMes}
          pctFixas={pctFixas}
          pctRendaComprometida={pctRendaComprometida}
          corComprometimento={corComprometimento}
          despesasEssenciais={despesasEssenciais}
          despesasDesejaveis={despesasDesejaveis}
          despesasSuperfluas={despesasSuperfluas}
          despesasNaoClassificadas={despesasNaoClassificadas}
          compromissosFuturos={compromissosFuturos}
          totalCompromissosFuturos={totalCompromissosFuturos}
          maioresLancamentos={maioresLancamentos}
        />
      ) : (
        <>
          {(alertas.length > 0 || pctRendaComprometida > 70) && (
            <div className="atencao-card">
              <div className="atencao-header">
                <span className="atencao-titulo">Precisa de você</span>
                {alertas.length > 0 && (
                  <span className="atencao-total">{formatarMoeda(totalEmAberto)}</span>
                )}
              </div>

              {alertas.map(({ fixo, ocorrencia, diasRestantes }) => {
                const pendente = pendenteNaOcorrencia(ocorrencia);
                const ehParcial = ocorrencia.status === 'parcial';
                return (
                  <div key={fixo.id} className="atencao-linha">
                    <div className="atencao-linha-info">
                      <span className="atencao-nome">{fixo.nome}</span>
                      <span className={`atencao-prazo ${diasRestantes < 0 ? 'atrasado' : ''}`}>
                        {diasRestantes < 0
                          ? `atrasada há ${Math.abs(diasRestantes)} dia${Math.abs(diasRestantes) > 1 ? 's' : ''}`
                          : diasRestantes === 0
                            ? 'vence hoje'
                            : `vence em ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}`}
                        {ehParcial && ` · falta ${formatarMoeda(pendente)}`}
                      </span>
                    </div>
                    <div className="atencao-linha-acao">
                      <span className="atencao-valor">{formatarMoeda(pendente)}</span>
                      <button onClick={() => confirmarOcorrencia(fixo, ocorrencia)} className="btn btn-primary atencao-btn">
                        Pagar
                      </button>
                    </div>
                  </div>
                );
              })}

              {pctRendaComprometida > 70 && (
                <p className="atencao-observacao">
                  {pctRendaComprometida.toFixed(0)}% da renda de {NOMES_MESES[dataAtual.mes]} está comprometida com despesas essenciais (recomendado: até ~50%).
                </p>
              )}
            </div>
          )}

          <div className={`saldo-hero ${saldoConsolidado < 0 ? 'saldo-hero-negativo' : ''}`}>
            <p className="saldo-hero-label">Disponível hoje</p>
            <p className="saldo-hero-valor">{formatarMoeda(saldoConsolidado)}</p>
            <p className="saldo-hero-detalhe">
              {formatarMoeda(saldoContas)} em contas
              {despesasFixasPendentes > 0 && <> · <span className="saldo-hero-menos">−{formatarMoeda(despesasFixasPendentes)}</span> a pagar</>}
              {receitasFixasPendentes > 0 && <> · <span className="saldo-hero-mais">+{formatarMoeda(receitasFixasPendentes)}</span> a receber</>}
            </p>
          </div>

          <div className="acoes-rapidas">
            <button onClick={() => irParaSecao('secao-lancamentos')} className="acao-rapida acao-rapida-principal">
              <span className="acao-rapida-icone">+</span>
              Novo lançamento
            </button>
            <button onClick={() => { setMostrarCapturaRapida(true); irParaSecao('secao-lancamentos'); }} className="acao-rapida">
              <span className="acao-rapida-icone">✨</span>
              Capturar com IA
            </button>
            <button onClick={() => irParaSecao('secao-contas')} className="acao-rapida">
              <span className="acao-rapida-icone">🏦</span>
              Contas
            </button>
            <button onClick={() => setAba('relatorios')} className="acao-rapida">
              <span className="acao-rapida-icone">📊</span>
              Relatórios
            </button>
          </div>

          <div className="cards-grid">
          <CardContas
            entidadeAtual={entidadeAtual}
            contas={contas}
            cartoes={cartoes}
            aberto={secaoAberta.contas}
            onAlternarAberto={() => setSecaoAberta({ ...secaoAberta, contas: !secaoAberta.contas })}
            onContasAlteradas={() => {
              carregarContas(entidadeAtual);
              carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
            }}
          />

          {!secoesOcultasAtual.includes('cartoes') && (
            <CardCartoes
              entidadeAtual={entidadeAtual}
              contas={contas}
              cartoes={cartoes}
              aberto={secaoAberta.cartoes}
              onAlternarAberto={() => setSecaoAberta({ ...secaoAberta, cartoes: !secaoAberta.cartoes })}
              onAtualizar={() => {
                carregarCartoes(entidadeAtual);
                carregarContas(entidadeAtual);
                carregarTransacoesDoMes(entidadeAtual, dataAtual.ano, dataAtual.mes);
              }}
            />
          )}
          <div className="card card-receitas" id="secao-receitas">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">⬇</span><p className="card-title">Receitas fixas</p></span>
              <div className="card-header-actions">
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
                <div className={`card-limitada ${(alturaCheiaReceitas || mostrarNovaReceitaFixa) ? 'expandida' : ''}`}>
                {mostrarNovaReceitaFixa && (
                  <form onSubmit={(e) => adicionarLancamentoFixo(e, 'entrada')} className="form-row" style={{ marginBottom: 12 }}>
                    <input className="input" placeholder="Nome (ex: Salário)" value={nomeFixo} onChange={(e) => setNomeFixo(e.target.value)} required autoFocus />
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
                </div>
                <button onClick={() => setAlturaCheiaReceitas((v) => !v)} className="ver-card-completo">
                  {alturaCheiaReceitas ? 'Recolher' : 'Ver receitas completas'}
                </button>
              </>
            )}
          </div>

          <div className="card card-despesas" id="secao-despesas">
            <div className="card-header">
              <span className="card-title-group"><span className="card-icon">⬆</span><p className="card-title">Despesas fixas</p></span>
              <div className="card-header-actions">
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
                <div className={`card-limitada ${(alturaCheiaDespesas || mostrarNovaDespesaFixa) ? 'expandida' : ''}`}>
                {mostrarNovaDespesaFixa && (
                  <form onSubmit={(e) => adicionarLancamentoFixo(e, 'saida')} className="form-row" style={{ marginBottom: 12 }}>
                    <input className="input" placeholder="Nome (ex: Aluguel)" value={nomeFixo} onChange={(e) => setNomeFixo(e.target.value)} required autoFocus />
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
                </div>
                <button onClick={() => setAlturaCheiaDespesas((v) => !v)} className="ver-card-completo">
                  {alturaCheiaDespesas ? 'Recolher' : 'Ver despesas completas'}
                </button>
              </>
            )}
          </div>

          {!secoesOcultasAtual.includes('orcamento') && (
            <CardOrcamento
              entidadeAtual={entidadeAtual}
              transacoesDoMes={transacoes}
              ano={dataAtual.ano}
              mes={dataAtual.mes}
              aberto={secaoAberta.orcamento}
              onAlternarAberto={() => setSecaoAberta({ ...secaoAberta, orcamento: !secaoAberta.orcamento })}
            />
          )}

          {!secoesOcultasAtual.includes('metas') && (
            <CardMetas
              entidadeAtual={entidadeAtual}
              contas={contas}
              aberto={secaoAberta.metas}
              onAlternarAberto={() => setSecaoAberta({ ...secaoAberta, metas: !secaoAberta.metas })}
            />
          )}

          {!secoesOcultasAtual.includes('membros') && (
            <CardMembros
              entidadeAtual={entidadeAtual}
              usuarioId={usuarioId}
              aberto={secaoAberta.membros}
              onAlternarAberto={() => setSecaoAberta({ ...secaoAberta, membros: !secaoAberta.membros })}
            />
          )}

          {!secoesOcultasAtual.includes('atividade') && (
            <CardAuditoria
              entidadeAtual={entidadeAtual}
              aberto={secaoAberta.atividade}
              onAlternarAberto={() => setSecaoAberta({ ...secaoAberta, atividade: !secaoAberta.atividade })}
            />
          )}
          </div>

          <div className="card card-lancamentos" id="secao-lancamentos">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <span className="card-title-group" style={{ marginBottom: 0 }}><span className="card-icon">🧾</span><p className="card-title">Novo lançamento</p></span>
              {!mostrarCapturaRapida && (
                <button onClick={() => setMostrarCapturaRapida(true)} className="btn btn-ghost">✨ Capturar com IA</button>
              )}
            </div>
            {mostrarCapturaRapida && (
              <CapturaRapida onExtraido={aplicarExtracaoIA} onFechar={() => setMostrarCapturaRapida(false)} />
            )}
            {sugestao && (
              <div className="suggestion-banner">
                <span>
                  Histórico sugere: <strong>{sugestao.tipo === 'entrada' ? 'Entrada' : 'Saída'}</strong>
                  {sugestao.valor && <> · <strong>{formatarMoeda(sugestao.valor)}</strong></>}
                  {sugestao.categoria && <> · {sugestao.categoria}</>}
                  {sugestao.conta_nome && <> · {sugestao.conta_nome}</>}
                  {sugestao.essencialidade && <> · {sugestao.essencialidade}</>}
                </span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
              <CampoDescricao entidadeAtual={entidadeAtual} tipo={tipo} value={descricao} onChange={(e) => setDescricao(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <CampoCategoria entidadeAtual={entidadeAtual} tipo={tipo} value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ width: 140 }} />
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
                {(() => {
                  let dataAnterior = null;
                  return (expandirLancamentos ? transacoes : transacoes.slice(0, LIMITE_LISTA)).map((t) => {
                    const novoDia = t.data !== dataAnterior;
                    dataAnterior = t.data;
                    return (
                      <div key={t.id}>
                        {novoDia && <p className="date-header">{formatarCabecalhoDia(t.data)}</p>}
                        {edicaoTransacaoId === t.id ? (
                          <form onSubmit={salvarEdicaoTransacao} className="form-row" style={{ padding: '10px 0' }}>
                            <input className="input" style={{ width: 100 }} type="number" step="0.01" value={formTransacao.valor} onChange={(e) => setFormTransacao({ ...formTransacao, valor: e.target.value })} required />
                            <CampoDescricao entidadeAtual={entidadeAtual} tipo={formTransacao.tipo} value={formTransacao.descricao} onChange={(e) => setFormTransacao({ ...formTransacao, descricao: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                            <CampoCategoria entidadeAtual={entidadeAtual} tipo={formTransacao.tipo} value={formTransacao.categoria} onChange={(e) => setFormTransacao({ ...formTransacao, categoria: e.target.value })} style={{ width: 120 }} />
                            <input className="input" style={{ width: 140 }} type="date" value={formTransacao.data} onChange={(e) => setFormTransacao({ ...formTransacao, data: e.target.value })} />
                            {t.tipo === 'saida' && (
                              <select className="input" value={formTransacao.essencialidade} onChange={(e) => setFormTransacao({ ...formTransacao, essencialidade: e.target.value })}>
                                <option value="">Essencialidade (opc.)</option>
                                <option value="essencial">Essencial</option>
                                <option value="desejavel">Desejável</option>
                                <option value="superfluo">Supérfluo</option>
                              </select>
                            )}
                            <button type="submit" className="btn btn-primary">Salvar</button>
                            <button type="button" onClick={() => setEdicaoTransacaoId(null)} className="btn-link">Cancelar</button>
                          </form>
                        ) : (
                          <div className="row row-main">
                            <div>
                              <p className="row-title">{t.transferencia_id && '⇄ '}{t.descricao || t.categoria}</p>
                              <p className="row-subtitle">{t.transferencia_id ? 'transferência entre contas' : t.categoria}</p>
                            </div>
                            <div className="row-actions">
                              {t.tipo === 'saida' && !t.transferencia_id && !t.essencialidade && (
                                <select
                                  className="input"
                                  style={{ fontSize: 11, padding: '4px 6px', borderColor: 'var(--accent)' }}
                                  value=""
                                  onChange={(e) => classificarEssencialidade(t, e.target.value)}
                                >
                                  <option value="">Classificar</option>
                                  <option value="essencial">Essencial</option>
                                  <option value="desejavel">Desejável</option>
                                  <option value="superfluo">Supérfluo</option>
                                </select>
                              )}
                              <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>
                                {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                              </span>
                              {!t.transferencia_id && <button onClick={() => iniciarEdicaoTransacao(t)} className="btn-link">editar</button>}
                              <button onClick={() => excluirTransacao(t)} className="btn-link">excluir</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
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
      <BottomNav aba={aba} setAba={setAba} irParaSecao={irParaSecao} onAbrirMenu={() => setSidebarMobileAberta(true)} />
    </div>
  );
}
