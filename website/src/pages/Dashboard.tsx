import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { apiGet, PeriodAgg, Summary } from '../api';
import { CHART, DataState, StatCard, useApi } from '../components/common';
import { dateStr, duration, hours, int, km, kmh, MONTHS } from '../format';

export default function Dashboard() {
  const summary = useApi(() => apiGet<Summary>('/summary'), []);
  const monthly = useApi(() => apiGet<PeriodAgg[]>('/monthly'), []);
  const cumulative = useApi(
    () => apiGet<Record<string, { doy: number; cum_km: number }[]>>('/cumulative'),
    []
  );

  const t = summary.data?.totals;

  // Merge per-year cumulative series onto a common day-of-year axis.
  let cumChart: Record<string, number>[] = [];
  let cumYears: string[] = [];
  if (cumulative.data) {
    cumYears = Object.keys(cumulative.data).sort();
    const byDoy = new Map<number, Record<string, number>>();
    for (const y of cumYears) {
      for (const p of cumulative.data[y]) {
        const row = byDoy.get(p.doy) ?? { doy: p.doy };
        row[y] = p.cum_km;
        byDoy.set(p.doy, row);
      }
    }
    cumChart = [...byDoy.values()].sort((a, b) => a.doy - b.doy);
    // Forward-fill so lines don't gap between activity days.
    const last: Record<string, number> = {};
    for (const row of cumChart) {
      for (const y of cumYears) {
        if (row[y] != null) last[y] = row[y];
        else if (last[y] != null) row[y] = last[y];
      }
    }
  }

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">
        {t?.first_activity ? `Every activity from ${dateStr(t.first_activity)} to ${dateStr(t.last_activity)}` : 'All-time overview'}
      </p>

      <DataState loading={summary.loading} error={summary.error}>
        {t && (
          <div className="cards">
            <StatCard label="Distance" value={km(t.distance_m, 0)} sub="all time" />
            <StatCard label="Activities" value={int(t.activities)} sub={`${summary.data!.byType[0]?.type ?? ''} and more`} />
            <StatCard label="Moving time" value={hours(t.moving_time_s)} sub={duration(t.moving_time_s)} />
            <StatCard label="Elevation gain" value={`${int(t.elevation_gain_m)} m`} sub={`${(Number(t.elevation_gain_m) / 8849).toFixed(1)}× Everest`} />
            <StatCard label="Calories" value={int(t.calories)} sub="kcal burned" />
          </div>
        )}
      </DataState>

      <h2>Distance per month</h2>
      <div className="panel">
        <DataState loading={monthly.loading} error={monthly.error}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={(monthly.data ?? []).map((r) => ({ ...r, km: Math.round(Number(r.distance_m) / 100) / 10 }))}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="period" stroke={CHART.axis} tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis stroke={CHART.axis} tick={{ fontSize: 11 }} width={50} />
              <Tooltip {...CHART.tooltip} formatter={(v: number) => [`${v} km`, 'Distance']} cursor={{ fill: 'rgba(252,76,2,0.08)' }} />
              <Bar dataKey="km" fill={CHART.accent} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DataState>
      </div>

      <h2>Cumulative distance by year</h2>
      <div className="panel">
        <DataState loading={cumulative.loading} error={cumulative.error}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={cumChart}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis
                dataKey="doy"
                type="number"
                domain={[1, 366]}
                ticks={[1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]}
                tickFormatter={(d: number) => MONTHS[new Date(2023, 0, d).getMonth()]}
                stroke={CHART.axis}
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke={CHART.axis} tick={{ fontSize: 11 }} width={50} unit="" />
              <Tooltip
                {...CHART.tooltip}
                labelFormatter={(d: number) => `Day ${d}`}
                formatter={(v: number, name: string) => [`${v} km`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {cumYears.map((y, i) => (
                <Line
                  key={y}
                  dataKey={y}
                  type="monotone"
                  dot={false}
                  strokeWidth={y === cumYears[cumYears.length - 1] ? 2.5 : 1.3}
                  stroke={CHART.yearColors[i % CHART.yearColors.length]}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </DataState>
      </div>

      <h2>Recent activities</h2>
      <div className="panel">
        <DataState loading={summary.loading} error={summary.error}>
          <table className="data">
            <thead>
              <tr>
                <th>Date</th>
                <th>Name</th>
                <th>Type</th>
                <th className="num">Distance</th>
                <th className="num">Time</th>
                <th className="num">Elev</th>
                <th className="num">Avg speed</th>
              </tr>
            </thead>
            <tbody>
              {(summary.data?.recent ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{dateStr(a.start_time)}</td>
                  <td>
                    <Link className="row-link" to={`/activities/${a.id}`}>
                      {a.name}
                    </Link>
                  </td>
                  <td>
                    <span className="badge dim">{a.type}</span>
                  </td>
                  <td className="num">{km(a.distance_m)}</td>
                  <td className="num">{duration(a.moving_time_s)}</td>
                  <td className="num">{a.elevation_gain_m != null ? `${int(a.elevation_gain_m)} m` : '–'}</td>
                  <td className="num">{kmh(a.average_speed_ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataState>
      </div>
    </>
  );
}
