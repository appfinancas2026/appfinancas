'use client';

import { ArrowUp, ChevronDown, ChevronRight, Repeat, Calendar } from 'lucide-react';
import CampoCategoria from './CampoCategoria';
import ListaFixos from './ListaFixos';

// Card de despesas fixas. O estado do formulário de "nova fixa" é
// compartilhado com o de receitas (vive no page.js): as props nomeFixo,
// diaFixo, valorFixo, contaFixoId e categoriaFixo são as mesmas dos dois.
export default function CardDespesasFixas({
  entidadeAtual,
  contas,
  lancamentosFixos,
  ocorrenciasDoMes,
  dataAtual,
  nomeMes,
  aberto,
  onAlternarAberto,
  mostrarNovaDespesaFixa,
  setMostrarNovaDespesaFixa,
  ordenarDespesasPor,
  setOrdenarDespesasPor,
  expandirDespesas,
  setExpandirDespesas,
  alturaCheiaDespesas,
  setAlturaCheiaDespesas,
  nomeFixo,
  setNomeFixo,
  diaFixo,
  setDiaFixo,
  valorFixo,
  setValorFixo,
  contaFixoId,
  setContaFixoId,
  categoriaFixo,
  setCategoriaFixo,
  essencialidadeFixo,
  setEssencialidadeFixo,
  parceladoFixo,
  setParceladoFixo,
  totalParcelasFixo,
  setTotalParcelasFixo,
  parcelaAtualFixo,
  setParcelaAtualFixo,
  adicionarLancamentoFixo,
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
  return (
    <div className="card card-despesas">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon"><ArrowUp size={16} /></span><p className="card-title">Despesas fixas</p></span>
        <div className="card-header-actions">
          <select className="input" style={{ padding: '5px 8px', fontSize: 12 }} value={ordenarDespesasPor} onChange={(e) => setOrdenarDespesasPor(e.target.value)}>
            <option value="data">Ordenar: dia</option>
            <option value="alfabetica">Ordenar: A-Z</option>
          </select>
          <button onClick={() => setMostrarNovaDespesaFixa((v) => !v)} className="btn btn-ghost">+ Nova despesa fixa</button>
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        </div>
      </div>

      {aberto && (
        <>
          <div className={`card-limitada ${(alturaCheiaDespesas || mostrarNovaDespesaFixa) ? 'expandida' : ''}`}>
          {mostrarNovaDespesaFixa && (
            <form onSubmit={(e) => adicionarLancamentoFixo(e, 'saida')} className="form-row" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <button type="button" onClick={() => setParceladoFixo(false)} style={{ flex: 1, padding: '8px 12px', border: `2px solid ${!parceladoFixo ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', lineHeight: 1.3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}><Repeat size={13} /> Fixo Mensal</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>repete sempre</div>
                </button>
                <button type="button" onClick={() => setParceladoFixo(true)} style={{ flex: 1, padding: '8px 12px', border: `2px solid ${parceladoFixo ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left', lineHeight: 1.3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13 }}><Calendar size={13} /> Parcelado</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>acaba em N</div>
                </button>
              </div>
              <input className="input" placeholder="Nome (ex: Aluguel)" value={nomeFixo} onChange={(e) => setNomeFixo(e.target.value)} required autoFocus />
              <input className="input" style={{ width: 90 }} type="number" min="1" max="31" placeholder="Dia" value={diaFixo} onChange={(e) => setDiaFixo(e.target.value)} required />
              <input className="input" style={{ width: 110 }} type="number" step="0.01" placeholder={parceladoFixo ? 'Valor/mês' : 'Valor'} value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} required />
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
              <CampoCategoria entidadeAtual={entidadeAtual} tipo="saida" value={categoriaFixo} onChange={(e) => setCategoriaFixo(e.target.value)} placeholder="Categoria (opcional)" style={{ width: 180 }} />
              {parceladoFixo && (
                <>
                  <input className="input" style={{ width: 130 }} type="number" min="1" placeholder="Total de parcelas" value={totalParcelasFixo} onChange={(e) => setTotalParcelasFixo(e.target.value)} required />
                  <input className="input" style={{ width: 170 }} type="number" min="1" placeholder="Já está na parcela nº (opc.)" value={parcelaAtualFixo} onChange={(e) => setParcelaAtualFixo(e.target.value)} />
                </>
              )}
              <button type="submit" className="btn btn-primary">Salvar</button>
            </form>
          )}

          <ListaFixos
            tipoAlvo="saida"
            entidadeAtual={entidadeAtual}
            contas={contas}
            lancamentosFixos={lancamentosFixos}
            ocorrenciasDoMes={ocorrenciasDoMes}
            dataAtual={dataAtual}
            nomeMes={nomeMes}
            expandido={expandirDespesas}
            aoExpandir={setExpandirDespesas}
            ordenacao={ordenarDespesasPor}
            edicaoFixoId={edicaoFixoId}
            setEdicaoFixoId={setEdicaoFixoId}
            formFixo={formFixo}
            setFormFixo={setFormFixo}
            salvarEdicaoFixo={salvarEdicaoFixo}
            iniciarEdicaoFixo={iniciarEdicaoFixo}
            excluirFixo={excluirFixo}
            edicaoOcorrenciaId={edicaoOcorrenciaId}
            setEdicaoOcorrenciaId={setEdicaoOcorrenciaId}
            formOcorrencia={formOcorrencia}
            setFormOcorrencia={setFormOcorrencia}
            salvarEdicaoOcorrencia={salvarEdicaoOcorrencia}
            iniciarEdicaoOcorrencia={iniciarEdicaoOcorrencia}
            confirmarOcorrencia={confirmarOcorrencia}
            desfazerOcorrencia={desfazerOcorrencia}
            pagamentoParcialId={pagamentoParcialId}
            setPagamentoParcialId={setPagamentoParcialId}
            valorParcial={valorParcial}
            setValorParcial={setValorParcial}
            jaPagoNaOcorrencia={jaPagoNaOcorrencia}
            pendenteNaOcorrencia={pendenteNaOcorrencia}
          />
          </div>
          <button onClick={() => setAlturaCheiaDespesas((v) => !v)} className="ver-card-completo">
            {alturaCheiaDespesas ? 'Recolher' : 'Ver despesas completas'}
          </button>
        </>
      )}
    </div>
  );
}
