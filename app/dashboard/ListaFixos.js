'use client';

import { Repeat, Calendar } from 'lucide-react';
import { formatarMoeda, parcelaAtivaNoMes } from '../../lib/financeiro';
import CampoCategoria from './CampoCategoria';

const LIMITE_LISTA = 6;

// Lista de lançamentos fixos de um tipo (entrada ou saída), com edição do
// molde, da ocorrência do mês e pagamento parcial. Compartilhada pelos cards
// de receitas e despesas fixas — a única parte realmente idêntica entre eles.
export default function ListaFixos({
  tipoAlvo,
  entidadeAtual,
  contas,
  lancamentosFixos,
  ocorrenciasDoMes,
  dataAtual,
  nomeMes,
  expandido,
  aoExpandir,
  ordenacao,
  edicaoFixoId,
  setEdicaoFixoId,
  formFixo,
  setFormFixo,
  salvarEdicaoFixo,
  iniciarEdicaoFixo,
  excluirFixo,
  edicaoOcorrenciaId,
  setEdicaoOcorrenciaId,
  formOcorrencia,
  setFormOcorrencia,
  salvarEdicaoOcorrencia,
  iniciarEdicaoOcorrencia,
  confirmarOcorrencia,
  desfazerOcorrencia,
  pagamentoParcialId,
  setPagamentoParcialId,
  valorParcial,
  setValorParcial,
  jaPagoNaOcorrencia,
  pendenteNaOcorrencia,
}) {
  const listaCompleta = lancamentosFixos.filter((f) => {
    if (f.tipo !== tipoAlvo) return false;
    return parcelaAtivaNoMes(f, dataAtual.ano, dataAtual.mes);
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
          <CampoCategoria entidadeAtual={entidadeAtual} tipo={tipoAlvo === 'entrada' ? 'entrada' : 'saida'} value={formFixo.categoria} onChange={(e) => setFormFixo({ ...formFixo, categoria: e.target.value })} placeholder="Categoria (opcional)" style={{ width: 180 }} />
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
          <span style={{ fontSize: 13 }}>{f.nome} ({nomeMes}):</span>
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
              {f.parcelado
                ? <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle', marginLeft: 6, background: 'var(--accent-tint)', color: 'var(--accent-text)', fontSize: 11, padding: '2px 7px' }}><Calendar size={10} />Parcelado</span>
                : <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle', marginLeft: 6, background: 'var(--surface-alt)', color: 'var(--text-muted)', fontSize: 11, padding: '2px 7px' }}><Repeat size={10} />Fixo</span>
              }
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
