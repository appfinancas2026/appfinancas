'use client';
import { LineChart, Line } from 'recharts';

export default function Sparkline({ data, dataKey, color = 'var(--primary)', width = 80, height = 36 }) {
  if (!data || data.length < 2) return null;
  return (
    <LineChart width={width} height={height} data={data}>
      <Line
        type="monotone"
        dataKey={dataKey}
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
