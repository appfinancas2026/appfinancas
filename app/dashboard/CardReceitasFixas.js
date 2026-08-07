'use client';

import { ArrowDown, ChevronDown, ChevronRight } from 'lucide-react';
import CampoCategoria from './CampoCategoria';
import ListaFixos from './ListaFixos';

// Card de receitas fixas. O estado do formulário de "nova fixa" é
// compartilhado com o de despesas (vive no page.js): as props nomeFixo,
// diaFixo, valorFixo, contaFixoId e categoriaFixo são as mesmas dos dois.
export default function CardReceitasFixas({
  entidadeAtual,
  contas,
  lancamentosFixos,
  ocorrenciasDoMes,
  dataAtual,
  nomeMes,
  aberto,
  onAlternarAberto,
  mostrarNovaReceitaFixa,
  setMostrarNovaReceitaFixa,
  ordenarReceitasPor,
  setOrdenarReceitasPor,
  expandirReceitas,
  setExpandirReceitas,
  alturaCheiaReceitas,
  setAlturaCheiaReceitas,
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
    <div className="card card-receitas">
      <div className="card-header">
        <span className="card-title-group"><span className="card-icon"><ArrowDown size={16} /></span><p className="card-title">Receitas fixas</p></span>
        <div className="card-header-actions">
          <select className="input" style={{ padding: '5px 8px', fontSize: 12 }} value={ordenarReceitasPor} onChange={(e) => setOrdenarReceitasPor(e.target.value)}>
            <option value="data">Ordenar: dia</option>
            <option value="alfabetica">Ordenar: A-Z</option>
          </select>
          <button onClick={() => setMostrarNovaReceitaFixa((v) => !v)} className="btn btn-ghost">+ Nova receita fixa</button>
          <button onClick={onAlternarAberto} className="collapse-btn">{aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
        </div>
      </div>

      {aberto && (
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
              <CampoCategoria entidadeAtual={entidadeAtual} tipo="entrada" value={categoriaFixo} onChange={(e) => setCategoriaFixo(e.target.value)} placeholder="Categoria (opcional)" style={{ width: 180 }} />
              <button type="submit" className="btn btn-primary">Salvar</button>
            </form>
          )}

          <ListaFixos
            tipoAlvo="entrada"
            entidadeAtual={entidadeAtual}
            contas={contas}
            lancamentosFixos={lancamentosFixos}
            ocorrenciasDoMes={ocorrenciasDoMes}
            dataAtual={dataAtual}
            nomeMes={nomeMes}
            expandido={expandirReceitas}
            aoExpandir={setExpandirReceitas}
            ordenacao={ordenarReceitasPor}
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
          <button onClick={() => setAlturaCheiaReceitas((v) => !v)} className="ver-card-completo">
            {alturaCheiaReceitas ? 'Recolher' : 'Ver receitas completas'}
          </button>
        </>
      )}
    </div>
  );
}
