'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatarMoeda, parseOFX, parseCSVExtrato, calcularMesFaturaCompra } from '../../lib/financeiro';
import { recalcularSaldoConta } from '../../lib/saldos';
import { sugerirCategoriasEmLote } from '../../lib/categorizacao';

const CATEGORIAS_PADRAO = [
  'Alimentação', 'Mercado', 'Transporte', 'Moradia', 'Saúde',
  'Educação', 'Lazer', 'Vestuário', 'Pets', 'Assinaturas',
  'Farmácia', 'Combustível', 'Academia', 'Restaurante', 'Salário',
  'Freelance', 'Investimento', 'Transferência', 'Outros',
];

// Painel de importação usado nos dois contextos:
//   modo="conta"  → extrato bancário: vincula à conta e recalcula o saldo.
//   modo="fatura" → fatura de cartão: vincula ao cartão + mes_fatura, não mexe em saldo.
// O modo é conhecido ANTES de ler o arquivo, então o preview já sai coerente
// com o destino (numa fatura, crédito/pagamento não é compra).
export default function ImportadorExtrato({ modo, entidadeAtual, contas, cartoes, onConcluido }) {
  const ehFatura = modo === 'fatura';

  const [destinoId, setDestinoId] = useState('');
  const [preview, setPreview] = useState([]);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [importando, setImportando] = useState(false);
  const [processandoPDF, setProcessandoPDF] = useState(false);
  const [erroPDF, setErroPDF] = useState('');
  const [categorizandoIA, setCategorizandoIA] = useState(false);

  const lista = ehFatura ? (cartoes || []) : (contas || []);

  // Busca o histórico de transações categorizadas e aplica sugestões por correspondência.
  // Retorna os itens do preview com `categoria` e `categoriaOrigem` preenchidos
  // quando há match, ou vazios quando não há.
  async function aplicarHistorico(itensRaw) {
    if (!entidadeAtual) return itensRaw.map((t) => ({ ...t, categoria: '', categoriaOrigem: null }));

    const { data } = await supabase
      .from('transacoes')
      .select('descricao, categoria, essencialidade')
      .eq('entidade_id', entidadeAtual)
      .not('categoria', 'is', null)
      .neq('categoria', '')
      .neq('categoria', 'importado')
      .is('transferencia_id', null)
      .order('data', { ascending: false })
      .limit(500);

    const historico = data || [];
    const sugestoes = sugerirCategoriasEmLote(itensRaw.map((t) => t.descricao || ''), historico);

    return itensRaw.map((t, i) => {
      const s = sugestoes[i].sugestao;
      return { ...t, categoria: s ? s.categoria : '', categoriaOrigem: s ? 'historico' : null };
    });
  }

  async function handleArquivo(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    setNomeArquivo(arquivo.name);
    setErroPDF('');
    const extensao = arquivo.name.split('.').pop().toLowerCase();

    // PDF só no modo conta (fatura em PDF fica para uma próxima fase).
    if (extensao === 'pdf') {
      if (ehFatura) {
        setErroPDF('Fatura em PDF ainda não é suportada. Use o CSV/OFX do cartão.');
        return;
      }
      extrairPDF(arquivo);
      return;
    }

    const texto = await lerTextoDoArquivo(arquivo);
    const resultado = extensao === 'csv' ? parseCSVExtrato(texto) : parseOFX(texto);

    // Numa fatura, crédito (pagamento da fatura anterior, estorno) não é compra:
    // aparece no preview, mas já desmarcado.
    const raw = ehFatura ? resultado.map((t) => (t.ehCredito ? { ...t, incluir: false } : t)) : resultado;
    const comCategorias = await aplicarHistorico(raw);
    setPreview(comCategorias);
  }

  // Encoding do arquivo: hoje os bancos exportam em UTF-8 (o C6 exporta), mas
  // alguns ainda mandam Windows-1252. Ler tudo como latin1 nunca falha — só
  // corrompe silenciosamente ("Descrição" vira "DescriÃ§Ã£o"). Por isso tenta
  // UTF-8 em modo estrito e só cai no legado quando ele realmente não é UTF-8.
  async function lerTextoDoArquivo(arquivo) {
    const buffer = await arquivo.arrayBuffer();
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^﻿/, '');
    } catch {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  async function extrairPDF(arquivo) {
    setProcessandoPDF(true);
    setPreview([]);

    try {
      // Extrai o texto do PDF no browser usando PDF.js (carregado via CDN no html).
      // O texto extraído vai pra IA que identifica as transações independente do
      // layout — funciona com Mercado Pago, C6 e qualquer outro banco.
      const arrayBuffer = await arquivo.arrayBuffer();
      const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const paginas = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const pagina = await pdf.getPage(i);
        const conteudo = await pagina.getTextContent();
        paginas.push(conteudo.items.map((item) => item.str).join(' '));
      }
      const textoCompleto = paginas.join('\n');

      if (textoCompleto.trim().length < 20) {
        setErroPDF('Não foi possível extrair texto deste PDF. Ele pode ser uma imagem escaneada.');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      const resposta = await fetch('/api/extrair-extrato', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ texto: textoCompleto }),
      });

      const json = await resposta.json();

      if (json.error) { setErroPDF(json.error); return; }
      if (!json.transacoes || json.transacoes.length === 0) {
        setErroPDF('Nenhuma transação encontrada no extrato. Verifique se o arquivo está correto.');
        return;
      }

      const comCategorias = await aplicarHistorico(json.transacoes);
      setPreview(comCategorias);
    } catch (e) {
      setErroPDF('Erro ao processar o PDF. Tente novamente.');
      console.error(e);
    } finally {
      setProcessandoPDF(false);
    }
  }

  function alternarInclusao(index) {
    setPreview((l) => l.map((t, i) => (i === index ? { ...t, incluir: !t.incluir } : t)));
  }

  function marcarTodos(valor) {
    setPreview((l) => l.map((t) => ({ ...t, incluir: valor })));
  }

  function atualizarCategoria(index, valor) {
    setPreview((l) => l.map((t, i) => (i === index ? { ...t, categoria: valor } : t)));
  }

  // Coleta as linhas incluídas sem categoria e pede sugestões à IA em lote.
  async function sugerirComIA() {
    const semCategoria = preview
      .map((t, i) => ({ ...t, _index: i }))
      .filter((t) => t.incluir && !t.categoria);
    if (semCategoria.length === 0) return;

    setCategorizandoIA(true);
    try {
      // Amplia a lista de categorias com as que já aparecem no preview (do histórico).
      const catsDoPreview = [...new Set(preview.map((t) => t.categoria).filter(Boolean))];
      const todasCats = [...new Set([...CATEGORIAS_PADRAO, ...catsDoPreview])];

      const { data: { session } } = await supabase.auth.getSession();
      const resposta = await fetch('/api/categorizar-lote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          descricoes: semCategoria.map((t) => t.descricao),
          categorias: todasCats,
        }),
      });

      const json = await resposta.json();
      if (json.error || !json.categorias) return;

      const mapaResultado = {};
      json.categorias.forEach((r, i) => {
        if (semCategoria[i]) mapaResultado[semCategoria[i]._index] = r.categoria;
      });

      setPreview((prev) =>
        prev.map((t, i) =>
          mapaResultado[i] ? { ...t, categoria: mapaResultado[i], categoriaOrigem: 'ia' } : t
        )
      );
    } catch {
      // Falha silenciosa — usuário preenche manual.
    } finally {
      setCategorizandoIA(false);
    }
  }

  async function confirmarImportacao() {
    if (!destinoId || preview.length === 0) return;
    setImportando(true);

    const cartaoSelecionado = ehFatura ? (cartoes || []).find((c) => c.id === destinoId) : null;

    // Numa fatura, crédito é pagamento/estorno — nunca compra. O pagamento da
    // fatura é registrado pelo fluxo próprio do cartão, então importar aqui
    // contaria duas vezes.
    const selecionadas = preview
      .filter((t) => t.incluir)
      .filter((t) => !(ehFatura && t.ehCredito));
    const referencias = selecionadas.map((t) => t.referencia_externa).filter(Boolean);

    let existentes = new Set();
    if (referencias.length > 0) {
      let consulta = supabase.from('transacoes').select('referencia_externa').in('referencia_externa', referencias);
      consulta = ehFatura ? consulta.eq('cartao_id', destinoId) : consulta.eq('conta_id', destinoId);
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
          categoria: t.categoria || 'importado',
          descricao: t.descricao,
          data: t.data,
          origem: 'importado',
          status: 'pago',
          referencia_externa: t.referencia_externa,
        };

        if (ehFatura) {
          return { ...base, tipo: 'saida', cartao_id: destinoId, mes_fatura: calcularMesFaturaCompra(cartaoSelecionado, t.data) };
        }
        return { ...base, conta_id: destinoId };
      });

    const ignoradas = selecionadas.length - novas.length;

    if (novas.length > 0) {
      await supabase.from('transacoes').insert(novas);
      if (!ehFatura) await recalcularSaldoConta(destinoId);
    }

    setImportando(false);
    setPreview([]);
    setNomeArquivo('');
    onConcluido();

    window.alert(`${novas.length} lançamento(s) importado(s).${ignoradas > 0 ? ` ${ignoradas} já existiam e foram ignorados.` : ''}`);
  }

  const semCategoriaCount = preview.filter((t) => t.incluir && !t.categoria).length;

  return (
    <div style={{ marginBottom: 12, padding: 12, background: 'var(--surface-alt)', borderRadius: 'var(--radius-sm)' }}>
      <div className="form-row" style={{ marginBottom: preview.length > 0 ? 12 : 0 }}>
        <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)} required>
          <option value="">{ehFatura ? 'Importar para o cartão...' : 'Importar para a conta...'}</option>
          {lista.map((item) => (<option key={item.id} value={item.id}>{item.nome}</option>))}
        </select>
        <label className={`btn btn-ghost ${processandoPDF ? 'disabled' : ''}`} style={{ cursor: processandoPDF ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {processandoPDF ? <><Loader2 size={14} className="spin" /> Lendo extrato...</> : (nomeArquivo || (ehFatura ? 'Escolher arquivo .csv ou .ofx' : 'Escolher arquivo .ofx, .csv ou .pdf'))}
          <input
            type="file"
            accept={ehFatura ? '.ofx,.csv' : '.ofx,.csv,.pdf'}
            onChange={handleArquivo}
            style={{ display: 'none' }}
            disabled={processandoPDF}
          />
        </label>
      </div>

      {processandoPDF && (
        <p className="empty-hint" style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> A IA está lendo o extrato... pode levar alguns segundos.</p>
      )}

      {erroPDF && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--negative)' }}>{erroPDF}</p>}

      {ehFatura && preview.length > 0 && (
        <p className="empty-hint" style={{ margin: '0 0 8px' }}>
          Todos os itens selecionados entram como compras (despesa) na fatura correspondente à data de cada um.
          Pagamentos e estornos vêm desmarcados.
        </p>
      )}

      {preview.length > 0 && (
        <>
          <p className="empty-hint" style={{ margin: '0 0 8px' }}>
            {preview.length} lançamento(s) encontrado(s). Confira antes de importar.
          </p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={() => marcarTodos(true)} className="btn-link">marcar todos</button>
            <button onClick={() => marcarTodos(false)} className="btn-link">desmarcar todos</button>
            {semCategoriaCount > 0 && (
              <button
                onClick={sugerirComIA}
                className="btn btn-ghost"
                disabled={categorizandoIA}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                {categorizandoIA
                  ? <><Loader2 size={13} className="spin" /> Consultando IA...</>
                  : <><Sparkles size={13} /> Sugerir categorias com IA ({semCategoriaCount})</>}
              </button>
            )}
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
            {preview.map((t, i) => (
              <div key={i} className="row row-main" style={{ opacity: t.incluir ? 1 : 0.4, flexWrap: 'wrap', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flex: 1, minWidth: 180 }}>
                  <input type="checkbox" checked={t.incluir} onChange={() => alternarInclusao(i)} />
                  <span>{t.data} · {t.descricao}</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {t.categoriaOrigem === 'historico' && (
                    <span style={{ fontSize: 10, color: 'var(--primary-dark, #2563eb)', whiteSpace: 'nowrap', opacity: 0.8 }}>↗ hist.</span>
                  )}
                  {t.categoriaOrigem === 'ia' && (
                    <span style={{ fontSize: 10, color: 'var(--accent, #7c3aed)', whiteSpace: 'nowrap', opacity: 0.9 }}>✦ IA</span>
                  )}
                  <input
                    className="input"
                    style={{ width: 130, fontSize: 12, padding: '3px 8px' }}
                    value={t.categoria || ''}
                    onChange={(e) => atualizarCategoria(i, e.target.value)}
                    placeholder="Categoria"
                    list="categorias-padrao"
                  />
                </div>
                <span className={`amount ${t.tipo === 'entrada' ? 'amount-positive' : ''}`}>
                  {t.tipo === 'entrada' ? '+' : '−'} {formatarMoeda(t.valor)}
                </span>
              </div>
            ))}
          </div>
          <datalist id="categorias-padrao">
            {CATEGORIAS_PADRAO.map((c) => <option key={c} value={c} />)}
          </datalist>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button onClick={confirmarImportacao} className="btn btn-primary" disabled={!destinoId || importando}>
              {importando ? 'Importando...' : `Importar ${preview.filter((t) => t.incluir).length} selecionado(s)`}
            </button>
            <button onClick={() => { setPreview([]); setNomeArquivo(''); setErroPDF(''); }} className="btn-link">Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}
