'use client';

import { useEffect, useState, useId } from 'react';
import { supabase } from '../../lib/supabase';

export default function CampoDescricao({
  entidadeAtual,
  tipo,
  value,
  onChange,
  placeholder = 'Descrição',
  style,
  className = 'input',
}) {
  const [opcoes, setOpcoes] = useState([]);
  const id = useId();

  useEffect(() => {
    if (!entidadeAtual) return;

    async function carregarDescricoes() {
      let query = supabase
        .from('transacoes')
        .select('descricao')
        .eq('entidade_id', entidadeAtual)
        .not('descricao', 'is', null)
        .neq('descricao', '')
        .is('transferencia_id', null)
        .order('data', { ascending: false })
        .limit(300);

      if (tipo) query = query.eq('tipo', tipo);

      const { data } = await query;
      if (!data) return;

      // Descrições mais usadas primeiro, sem repetição.
      const contagem = {};
      data.forEach(({ descricao }) => {
        const d = (descricao || '').trim();
        if (d) contagem[d] = (contagem[d] || 0) + 1;
      });

      const ordenadas = Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .map(([d]) => d);

      setOpcoes(ordenadas);
    }

    carregarDescricoes();
  }, [entidadeAtual, tipo]);

  return (
    <>
      <input
        className={className}
        list={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
      <datalist id={id}>
        {opcoes.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </>
  );
}
