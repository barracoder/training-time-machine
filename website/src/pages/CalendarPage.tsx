import { useEffect, useMemo, useState } from 'react';
import { apiGet, CalendarDay } from '../api';
import { DataState, useApi } from '../components/common';
import { duration, int, km, MONTHS } from '../format';

const LEVELS = ['#1e2128', '#5a2a12', '#93400f', '#c94a07', '#fc4c02'];

function levelFor(distanceM: number, maxM: number): string {
  if (distanceM <= 0) return LEVELS[0];
  const frac = distanceM / Math.max(maxM, 1);
  if (frac > 0.75) return LEVELS[4];
  if (frac > 0.5) return LEVELS[3];
  if (frac > 0.25) return LEVELS[2];
  return LEVELS[1];
}

export default function CalendarPage() {
  const years = useApi(() => apiGet<number[]>('/years'), []);
  const [year, setYear] = useState<number | null>(null);
  useEffect(() => {
    if (year == null && years.data && years.data.length > 0) setYear(years.data[0]);
  }, [years.data, year]);

  const cal = useApi(
    () => (year != null ? apiGet<CalendarDay[]>('/calendar', { year }) : Promise.resolve([])),
    [year]
  );

  const { cells, monthLabels, totals, maxM } = useMemo(() => {
    const byDate = new Map((cal.data ?? []).map((d) => [d.date, d]));
    const y = year ?? new Date().getFullYear();
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const dec31 = new Date(Date.UTC(y, 11, 31));
    // Grid starts on the Monday on/before Jan 1.
    const start = new Date(jan1);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));

    const cells: { date: string | null; day: CalendarDay | null }[] = [];
    const monthLabels: { index: number; label: string }[] = [];
    let lastMonth = -1;
    const cursor = new Date(start);
    while (cursor <= dec31 || cells.length % 7 !== 0) {
      const inYear = cursor.getUTCFullYear() === y;
      const iso = cursor.toISOString().slice(0, 10);
      cells.push({ date: inYear ? iso : null, day: inYear ? (byDate.get(iso) ?? null) : null });
      if (inYear && cursor.getUTCMonth() !== lastMonth && cursor.getUTCDay() === 1) {
        lastMonth = cursor.getUTCMonth();
        monthLabels.push({ index: Math.floor((cells.length - 1) / 7), label: MONTHS[lastMonth] });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    let distM = 0;
    let count = 0;
    let time = 0;
    let maxM = 0;
    for (const d of cal.data ?? []) {
      distM += Number(d.distance_m);
      count += Number(d.count);
      time += Number(d.moving_time_s);
      maxM = Math.max(maxM, Number(d.distance_m));
    }
    return { cells, monthLabels, totals: { distM, count, time, days: (cal.data ?? []).length }, maxM };
  }, [cal.data, year]);

  const weekCount = Math.ceil(cells.length / 7);

  return (
    <>
      <h1>Calendar</h1>
      <p className="subtitle">Daily distance, GitHub-contribution style</p>

      <div className="controls">
        <select value={year ?? ''} onChange={(e) => setYear(Number(e.target.value))}>
          {(years.data ?? []).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {cal.data && (
          <span style={{ color: 'var(--text-dim)' }}>
            {int(totals.count)} activities · {km(totals.distM, 0)} · {duration(totals.time)} · {totals.days} active days
          </span>
        )}
      </div>

      <div className="panel">
        <DataState loading={cal.loading || years.loading} error={cal.error ?? years.error}>
          <div style={{ position: 'relative', paddingTop: 18 }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 16 }}>
              {monthLabels.map((m) => (
                <span
                  key={m.label + m.index}
                  style={{
                    position: 'absolute',
                    left: m.index * 16,
                    fontSize: 11,
                    color: 'var(--text-dim)',
                  }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className="cal-grid" style={{ gridTemplateColumns: `repeat(${weekCount}, 13px)` }}>
              {cells.map((c, i) => {
                const d = c.day;
                const title = c.date
                  ? d
                    ? `${c.date}: ${km(Number(d.distance_m))} in ${d.count} activit${Number(d.count) === 1 ? 'y' : 'ies'}`
                    : `${c.date}: rest day`
                  : '';
                return (
                  <div
                    key={i}
                    className="cal-cell"
                    title={title}
                    style={{
                      background: c.date ? levelFor(Number(d?.distance_m ?? 0), maxM) : 'transparent',
                    }}
                  />
                );
              })}
            </div>
            <div className="cal-legend">
              Less
              {LEVELS.map((c) => (
                <span key={c} className="cal-cell" style={{ background: c }} />
              ))}
              More
            </div>
          </div>
        </DataState>
      </div>
    </>
  );
}
