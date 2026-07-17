'use client';

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
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
