import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { apiGet, PeriodAgg, YearAgg } from '../api';
import { CHART, DataState, useApi } from '../components/common';
import { duration, int, km } from '../format';

type MetricKey = 'distance' | 'time' | 'elevation' | 'count' | 'speed';

const METRICS: { key: MetricKey; label: string; unit: string; of: (r: PeriodAgg) => number }[] = [
  { key: 'distance', label: 'Distance', unit: 'km', of: (r) => Math.round(Number(r.distance_m) / 100) / 10 },
  { key: 'time', label: 'Moving time', unit: 'h', of: (r) => Math.round(Number(r.moving_time_s) / 360) / 10 },
  { key: 'elevation', label: 'Elevation', unit: 'm', of: (r) => Math.round(Number(r.elevation_gain_m)) },
  { key: 'count', label: 'Activities', unit: '', of: (r) => Number(r.count) },
  { key: 'speed', label: 'Avg speed', unit: 'km/h', of: (r) => Math.round(Number(r.avg_speed_kmh) * 10) / 10 },
];

export default function Trends() {
  const [granularity, setGranularity] = useState<'monthly' | 'weekly'>('monthly');
  const [metric, setMetric] = useState<MetricKey>('distance');
  const [type, setType] = useState('');

  const types = useApi(() => apiGet<string[]>('/types'), []);
  const agg = useApi(
    () => apiGet<PeriodAgg[]>(`/${granularity}`, { type }),
    [granularity, type]
  );
  const yearly = useApi(() => apiGet<YearAgg[]>('/yearly', { type }), [type]);

  const m = METRICS.find((x) => x.key === metric)!;
  const chartData = (agg.data ?? []).map((r) => ({ period: r.period, value: m.of(r) }));

  return (
    <>
      <h1>Trends</h1>
      <p className="subtitle">Aggregated training volume over time</p>

      <div className="controls">
        <div className="btn-group">
          {(['monthly', 'weekly'] as const).map((g) => (
            <button key={g} className={granularity === g ? 'active' : ''} onClick={() => setGranularity(g)}>
              {g === 'monthly' ? 'Monthly' : 'Weekly'}
            </button>
          ))}
        </div>
        <div className="btn-group">
          {METRICS.map((mm) => (
            <button key={mm.key} className={metric === mm.key ? 'active' : ''} onClick={() => setMetric(mm.key)}>
              {mm.label}
            </button>
          ))}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {(types.data ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="panel">
        <DataState loading={agg.loading} error={agg.error}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="period" stroke={CHART.axis} tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis stroke={CHART.axis} tick={{ fontSize: 11 }} width={55} />
              <Tooltip
                {...CHART.tooltip}
                formatter={(v: number) => [`${v.toLocaleString()} ${m.unit}`.trim(), m.label]}
                cursor={{ fill: 'rgba(252,76,2,0.08)' }}
              />
              <Bar dataKey="value" fill={CHART.accent} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DataState>
      </div>

      <h2>Year over year</h2>
      <div className="panel">
        <DataState loading={yearly.loading} error={yearly.error}>
          <table className="data">
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">Activities</th>
                <th className="num">Distance</th>
                <th className="num">Moving time</th>
                <th className="num">Elevation</th>
                <th className="num">Avg speed</th>
                <th className="num">Longest</th>
                <th className="num">vs prev</th>
              </tr>
            </thead>
            <tbody>
              {(yearly.data ?? []).map((y, i, all) => {
                const prev = i > 0 ? Number(all[i - 1].distance_m) : null;
                const delta = prev != null && prev > 0 ? ((Number(y.distance_m) - prev) / prev) * 100 : null;
                return (
                  <tr key={y.year}>
                    <td>
                      <strong>{y.year}</strong>
                    </td>
                    <td className="num">{int(y.count)}</td>
                    <td className="num">{km(y.distance_m, 0)}</td>
                    <td className="num">{duration(y.moving_time_s)}</td>
                    <td className="num">{int(y.elevation_gain_m)} m</td>
                    <td className="num">{Number(y.avg_speed_kmh).toFixed(1)} km/h</td>
                    <td className="num">{km(y.longest_m)}</td>
                    <td className="num" style={{ color: delta == null ? undefined : delta >= 0 ? 'var(--green)' : '#ff7a6b' }}>
                      {delta == null ? '–' : `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DataState>
      </div>
    </>
  );
}
