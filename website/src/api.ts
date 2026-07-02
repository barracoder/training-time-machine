export interface ApiError {
  error: string;
  message: string;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString());
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body && typeof body.message === 'string' ? body.message : `HTTP ${res.status}`;
    throw new HttpError(res.status, msg);
  }
  return body as T;
}

// ------------------------------------------------------------------- types

export interface ActivityRow {
  id: number;
  start_time: string;
  name: string;
  type: string;
  distance_m: number | null;
  moving_time_s: number | null;
  elapsed_time_s?: number | null;
  elevation_gain_m: number | null;
  average_speed_ms: number | null;
  max_speed_ms?: number | null;
  average_heartrate: number | null;
  calories: number | null;
  gear?: string | null;
  commute?: number | null;
}

export interface Summary {
  totals: {
    activities: number;
    distance_m: number;
    moving_time_s: number;
    elapsed_time_s: number;
    elevation_gain_m: number;
    calories: number;
    first_activity: string | null;
    last_activity: string | null;
  };
  byType: { type: string; activities: number; distance_m: number; moving_time_s: number; elevation_gain_m: number }[];
  recent: ActivityRow[];
}

export interface PeriodAgg {
  period: string;
  year?: number;
  month?: number;
  week_start?: string;
  count: number;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number;
  calories: number;
  avg_speed_kmh: number;
}

export interface YearAgg extends PeriodAgg {
  longest_m: number;
}

export interface CalendarDay {
  date: string;
  count: number;
  distance_m: number;
  moving_time_s: number;
  elevation_gain_m: number;
}

export interface TrackPoint {
  seq: number;
  elapsed_s: number | null;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  dist_m: number;
  speed_kmh: number | null;
  heartrate: number | null;
  cadence: number | null;
  watts: number | null;
  temp: number | null;
}

export interface PointsResponse {
  activity_id: number;
  total_points: number;
  points: TrackPoint[];
}

export interface HeatmapResponse {
  cells: number;
  points: [number, number, number][];
}
