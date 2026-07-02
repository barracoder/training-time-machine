import { useEffect, useState, DependencyList, ReactNode } from 'react';

export function useApi<T>(fn: () => Promise<T>, deps: DependencyList): {
  data: T | null;
  error: string | null;
  loading: boolean;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading };
}

export function DataState({ loading, error, children }: { loading: boolean; error: string | null; children?: ReactNode }) {
  if (error) return <div className="status-note error">Failed to load: {error}</div>;
  if (loading) return <div className="status-note">Loading…</div>;
  return <>{children}</>;
}

export function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub ? <div className="sub">{sub}</div> : null}
    </div>
  );
}

export const CHART = {
  grid: '#262a33',
  axis: '#9aa0aa',
  accent: '#fc4c02',
  tooltip: {
    contentStyle: {
      background: '#16181d',
      border: '1px solid #262a33',
      borderRadius: 8,
      color: '#e8eaed',
      fontSize: 13,
    },
    labelStyle: { color: '#9aa0aa' },
  },
  yearColors: [
    '#fc4c02', '#4caf7d', '#5b9bd5', '#e6b422', '#b07fd6', '#e05a7a',
    '#4cc3c9', '#9acD32', '#f08a4b', '#7a86e8', '#d0d666', '#c96a6a',
    '#6ac9a3', '#c98adf',
  ],
};
