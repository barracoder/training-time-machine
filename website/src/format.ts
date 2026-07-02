export function km(m: number | null | undefined, digits = 1): string {
  if (m == null) return '–';
  return `${(Number(m) / 1000).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} km`;
}

export function metres(m: number | null | undefined): string {
  if (m == null) return '–';
  return `${Math.round(Number(m)).toLocaleString()} m`;
}

export function duration(s: number | null | undefined): string {
  if (s == null) return '–';
  const sec = Math.round(Number(s));
  const hrs = Math.floor(sec / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (hrs >= 100) return `${hrs.toLocaleString()} h ${min} m`;
  if (hrs > 0) return `${hrs}h ${String(min).padStart(2, '0')}m`;
  return `${min}m ${String(sec % 60).padStart(2, '0')}s`;
}

export function hours(s: number | null | undefined): string {
  if (s == null) return '–';
  return `${Math.round(Number(s) / 3600).toLocaleString()} h`;
}

export function kmh(ms: number | null | undefined, digits = 1): string {
  if (ms == null) return '–';
  return `${(Number(ms) * 3.6).toFixed(digits)} km/h`;
}

export function int(v: number | null | undefined): string {
  if (v == null) return '–';
  return Math.round(Number(v)).toLocaleString();
}

export function dateStr(dt: string | null | undefined): string {
  if (!dt) return '–';
  return dt.slice(0, 10);
}

export function dateTimeStr(dt: string | null | undefined): string {
  if (!dt) return '–';
  const d = new Date(dt.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
