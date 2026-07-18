'use client';

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, ReferenceLine,
} from 'recharts';
import { formatarMoeda } from '../../lib/financeiro';

const CORES_GRAFICO = ['#0F6E56', '#C68A2E', '#B4472F', '#3B6E8F', '#7A5C9E', '#5C8A3A', '#A6763F', '#4A5A6B'];

const tooltipStyle = { borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 };

export function GraficoComparativoPFPJ({ dados }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-alt)" />
        <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={40} />
        <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Entradas" fill="#0F6E56" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Saídas" fill="#B4472F" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficoEntradasSaidas({ dados }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-alt)" />
        <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={40} />
        <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Entradas" fill="#0F6E56" radius={[4, 4, 0, 0]} />
        <Bar dataKey="Saídas" fill="#B4472F" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficoEvolucaoPatrimonio({ dados }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-alt)" />
        <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} width={50} />
        <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={tooltipStyle} />
        <Bar dataKey="Patrimônio" fill="#0F6E56" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GraficoDespesasPorCategoria({ dados }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={dados} dataKey="valor" nameKey="categoria" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {dados.map((entry, index) => (
            <Cell key={entry.categoria} fill={CORES_GRAFICO[index % CORES_GRAFICO.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => formatarMoeda(v)} contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function GraficoFluxo({ dados }) {
  if (!dados || dados.length === 0) return <p className="empty-hint">Sem dados para exibir.</p>;

  const minSaldo = Math.min(...dados.map((d) => d.saldo));
  const comProjecao = dados.some((d) => d.ehProjecao);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={dados} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gradHistorico" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#0F6E56" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#0F6E56" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradProjecao" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B6E8F" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#3B6E8F" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-alt)" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} width={55} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
        <Tooltip
          formatter={(v, name) => [formatarMoeda(v), name]}
          labelFormatter={(l) => `Dia ${l}`}
          contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
        />
        {minSaldo < 0 && <ReferenceLine y={0} stroke="var(--negative)" strokeDasharray="4 2" />}
        <Area
          type="monotone"
          dataKey="saldo"
          name="Saldo"
          stroke="#0F6E56"
          strokeWidth={2}
          fill="url(#gradHistorico)"
          dot={false}
          connectNulls
          data={dados.filter((d) => !d.ehProjecao)}
        />
        {comProjecao && (
          <Area
            type="monotone"
            dataKey="saldo"
            name="Projeção"
            stroke="#3B6E8F"
            strokeWidth={2}
            strokeDasharray="6 3"
            fill="url(#gradProjecao)"
            dot={false}
            connectNulls
            data={dados.filter((d) => d.ehProjecao)}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
