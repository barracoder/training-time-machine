import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ActivityRow, apiGet } from '../api';
import { DataState, useApi } from '../components/common';
import { dateStr, duration, int, km, kmh } from '../format';

interface ListResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: ActivityRow[];
}

const COLUMNS: { key: string; label: string; num?: boolean }[] = [
  { key: 'start_time', label: 'Date' },
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'distance_m', label: 'Distance', num: true },
  { key: 'moving_time_s', label: 'Time', num: true },
  { key: 'elevation_gain_m', label: 'Elev', num: true },
  { key: 'average_speed_ms', label: 'Avg speed', num: true },
  { key: 'average_heartrate', label: 'Avg HR', num: true },
  { key: 'calories', label: 'Calories', num: true },
];

export default function Activities() {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('start_time');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const types = useApi(() => apiGet<string[]>('/types'), []);
  const list = useApi(
    () => apiGet<ListResponse>('/activities', { search, type, from, to, sort, dir, page, pageSize }),
    [search, type, from, to, sort, dir, page]
  );

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / pageSize)) : 1;

  const clickSort = (key: string) => {
    if (sort === key) setDir(dir === 'desc' ? 'asc' : 'desc');
    else {
      setSort(key);
      setDir('desc');
    }
    setPage(1);
  };

  return (
    <>
      <h1>Activities</h1>
      <p className="subtitle">{list.data ? `${int(list.data.total)} matching activities` : 'Browse the full archive'}</p>

      <div className="controls">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All types</option>
          {(types.data ?? []).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <span style={{ color: 'var(--text-dim)' }}>to</span>
        <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
      </div>

      <div className="panel">
        <DataState loading={list.loading} error={list.error}>
          <table className="data">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`sortable${c.num ? ' num' : ''}`}
                    onClick={() => clickSort(c.key)}
                  >
                    {c.label}
                    {sort === c.key ? (dir === 'desc' ? ' ▾' : ' ▴') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(list.data?.rows ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{dateStr(a.start_time)}</td>
                  <td>
                    <Link className="row-link" to={`/activities/${a.id}`}>
                      {a.name}
                    </Link>
                    {a.commute ? <span className="badge dim" style={{ marginLeft: 8 }}>commute</span> : null}
                  </td>
                  <td>
                    <span className="badge dim">{a.type}</span>
                  </td>
                  <td className="num">{km(a.distance_m)}</td>
                  <td className="num">{duration(a.moving_time_s)}</td>
                  <td className="num">{a.elevation_gain_m != null ? `${int(a.elevation_gain_m)} m` : '–'}</td>
                  <td className="num">{kmh(a.average_speed_ms)}</td>
                  <td className="num">{a.average_heartrate != null ? int(a.average_heartrate) : '–'}</td>
                  <td className="num">{a.calories != null ? int(a.calories) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="controls" style={{ marginTop: 14, marginBottom: 0 }}>
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Prev
            </button>
            <span style={{ color: 'var(--text-dim)' }}>
              Page {page} of {totalPages}
            </span>
            <button className="page-btn" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              Next →
            </button>
          </div>
        </DataState>
      </div>
    </>
  );
}
