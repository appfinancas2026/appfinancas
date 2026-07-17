'use client';

import { useEffect, useState, useId } from 'react';
import { supabase } from '../../lib/supabase';

// Categorias padrão que aparecem mesmo pra quem ainda não tem lançamentos.
// Ficam misturadas com as do histórico — sem repetição.
const CATEGORIAS_PADRAO = [
  'Alimentação', 'Mercado', 'Transporte', 'Moradia', 'Saúde',
  'Educação', 'Lazer', 'Vestuário', 'Pets', 'Assinaturas',
  'Farmácia', 'Combustível', 'Academia', 'Restaurante', 'Salário',
  'Freelance', 'Investimento', 'Transferência', 'Outros',
];

export default function CampoCategoria({
  entidadeAtual,
  tipo,           // 'entrada' | 'saida' | null (mostra todos)
  value,
  onChange,
  placeholder = 'Categoria',
  style,
  className = 'input',
}) {
  const [opcoes, setOpcoes] = useState(CATEGORIAS_PADRAO);
  const id = useId();

  useEffect(() => {
    if (!entidadeAtual) return;

    async function carregarCategorias() {
      let query = supabase
        .from('transacoes')
        .select('categoria')
        .eq('entidade_id', entidadeAtual)
        .not('categoria', 'is', null)
        .neq('categoria', '')
        .order('data', { ascending: false })
        .limit(200);

      if (tipo) query = query.eq('tipo', tipo);

      const { data } = await query;
      if (!data) return;

      // Categorias do histórico, ordenadas por frequência de uso.
      const contagem = {};
      data.forEach(({ categoria }) => {
        const c = (categoria || '').trim();
        if (c) contagem[c] = (contagem[c] || 0) + 1;
      });

      const doHistorico = Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .map(([c]) => c);

      // Une histórico + padrão sem repetir, preservando a ordem de frequência.
      const todas = [...new Set([...doHistorico, ...CATEGORIAS_PADRAO])];
      setOpcoes(todas);
    }

    carregarCategorias();
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
        {opcoes.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
    </>
  );
}
