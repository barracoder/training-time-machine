import { Link } from 'react-router-dom';
import { ActivityRow, apiGet } from '../api';
import { DataState, useApi } from '../components/common';
import { dateStr, hours, int, km } from '../format';

interface RecordActivity extends ActivityRow {
  avg_kmh?: number;
}

interface PeriodBest {
  period: string | number;
  starts?: string;
  count: number;
  distance_m: number;
}

interface RecordsResponse {
  longest: RecordActivity | null;
  biggestClimb: RecordActivity | null;
  fastest: RecordActivity | null;
  bestDay: PeriodBest | null;
  bestWeek: PeriodBest | null;
  bestMonth: PeriodBest | null;
  bestYear: PeriodBest | null;
  milestones: { km: number; reached_at: string; activity_id: number; activity_name: string }[];
  perGear: {
    name: string;
    kind: string | null;
    brand: string | null;
    model: string | null;
    activities: number;
    distance_m: number;
    moving_time_s: number;
    elevation_gain_m: number;
  }[];
  lifetime_km: number;
}

interface Goal {
  goal_type: string | null;
  activity_type: string | null;
  goal: number | null;
  start_date: string | null;
  end_date: string | null;
  time_period: string | null;
  active: boolean;
  period_start: string | null;
  progress: { actual: number; unit: string; target: number; pct: number | null };
}

function ActivityRecord({ what, big, act }: { what: string; big: string; act: RecordActivity | null }) {
  if (!act) return null;
  return (
    <div className="record-item">
      <div>
        <div className="what">{what}</div>
        <Link className="row-link" to={`/activities/${act.id}`}>
          {act.name}
        </Link>{' '}
        <span style={{ color: 'var(--text-dim)' }}>· {dateStr(act.start_time)}</span>
      </div>
      <div className="big">{big}</div>
    </div>
  );
}

function PeriodRecord({ what, best }: { what: string; best: PeriodBest | null }) {
  if (!best) return null;
  return (
    <div className="record-item">
      <div>
        <div className="what">{what}</div>
        <strong>{best.period}</strong>{' '}
        <span style={{ color: 'var(--text-dim)' }}>· {int(best.count)} activities</span>
      </div>
      <div className="big">{km(best.distance_m, 0)}</div>
    </div>
  );
}

export default function Records() {
  const rec = useApi(() => apiGet<RecordsResponse>('/records'), []);
  const goals = useApi(() => apiGet<Goal[]>('/goals'), []);

  const r = rec.data;

  return (
    <>
      <h1>Records</h1>
      <p className="subtitle">
        Personal bests and milestones{r ? ` — ${int(r.lifetime_km)} km lifetime` : ''}
      </p>

      <DataState loading={rec.loading} error={rec.error}>
        {r && (
          <>
            <div className="grid-2">
              <div className="panel">
                <ActivityRecord what="Longest ride" big={km(r.longest?.distance_m ?? null)} act={r.longest} />
                <ActivityRecord
                  what="Biggest climb"
                  big={`${int(r.biggestClimb?.elevation_gain_m ?? null)} m`}
                  act={r.biggestClimb}
                />
                <ActivityRecord
                  what="Fastest avg speed (≥ 5 km)"
                  big={`${Number(r.fastest?.avg_kmh ?? 0).toFixed(1)} km/h`}
                  act={r.fastest}
                />
              </div>
              <div className="panel">
                <PeriodRecord what="Biggest day" best={r.bestDay} />
                <PeriodRecord what="Biggest week" best={r.bestWeek} />
                <PeriodRecord what="Biggest month" best={r.bestMonth} />
                <PeriodRecord what="Biggest year" best={r.bestYear} />
              </div>
            </div>

            <h2>Distance milestones</h2>
            <div className="panel">
              {r.milestones.length === 0 ? (
                <div className="status-note">No milestones crossed yet.</div>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th className="num">Milestone</th>
                      <th>Reached</th>
                      <th>During</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.milestones.map((m) => (
                      <tr key={m.km}>
                        <td className="num">
                          <span className="badge">{int(m.km)} km</span>
                        </td>
                        <td>{dateStr(m.reached_at)}</td>
                        <td>
                          <Link className="row-link" to={`/activities/${m.activity_id}`}>
                            {m.activity_name}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <h2>Per-gear totals</h2>
            <div className="panel">
              <table className="data">
                <thead>
                  <tr>
                    <th>Gear</th>
                    <th>Kind</th>
                    <th className="num">Activities</th>
                    <th className="num">Distance</th>
                    <th className="num">Time</th>
                    <th className="num">Elevation</th>
                  </tr>
                </thead>
                <tbody>
                  {r.perGear.map((g) => (
                    <tr key={g.name}>
                      <td>
                        <strong>{g.name}</strong>
                        {g.brand || g.model ? (
                          <span style={{ color: 'var(--text-dim)' }}>
                            {' '}
                            · {[g.brand, g.model].filter(Boolean).join(' ')}
                          </span>
                        ) : null}
                      </td>
                      <td>{g.kind ? <span className="badge dim">{g.kind}</span> : '–'}</td>
                      <td className="num">{int(g.activities)}</td>
                      <td className="num">{km(g.distance_m, 0)}</td>
                      <td className="num">{hours(g.moving_time_s)}</td>
                      <td className="num">{int(g.elevation_gain_m)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DataState>

      <h2>Goals</h2>
      <div className="panel">
        <DataState loading={goals.loading} error={goals.error}>
          {(goals.data ?? []).length === 0 ? (
            <div className="status-note">No goals configured.</div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Goal</th>
                  <th>Applies to</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="num">Target</th>
                  <th className="num">Current period</th>
                  <th>Progress</th>
                </tr>
              </thead>
              <tbody>
                {(goals.data ?? []).map((g, i) => (
                  <tr key={i}>
                    <td>{g.goal_type ?? '–'}</td>
                    <td>
                      <span className="badge dim">{g.activity_type ?? 'All'}</span>
                    </td>
                    <td>{g.time_period ?? '–'}</td>
                    <td>
                      {g.active ? <span className="badge">active</span> : <span className="badge dim">ended {dateStr(g.end_date)}</span>}
                    </td>
                    <td className="num">
                      {int(g.progress.target)} {g.progress.unit}
                    </td>
                    <td className="num">
                      {g.progress.actual.toLocaleString()} {g.progress.unit}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="progress-track" style={{ flex: 1 }}>
                          <div
                            className="progress-fill"
                            style={{ width: `${Math.min(100, g.progress.pct ?? 0)}%` }}
                          />
                        </div>
                        <span style={{ color: 'var(--text-dim)', fontSize: 12, minWidth: 42 }}>
                          {g.progress.pct != null ? `${g.progress.pct}%` : '–'}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataState>
      </div>
    </>
  );
}
