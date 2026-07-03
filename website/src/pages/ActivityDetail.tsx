import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MapContainer, Polyline, TileLayer, CircleMarker } from 'react-leaflet';
import { LatLngBoundsExpression } from 'leaflet';
import {
  AreaChart, Area, ComposedChart, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { apiGet, PointsResponse } from '../api';
import { CHART, DataState, useApi } from '../components/common';
import { dateTimeStr, duration, int, km, kmh } from '../format';

type Detail = Record<string, unknown>;

const STAT_LABELS: Record<string, { label: string; fmt: (v: unknown) => string }> = {
  start_time: { label: 'Start (UTC)', fmt: (v) => dateTimeStr(String(v)) },
  type: { label: 'Type', fmt: String },
  distance_m: { label: 'Distance', fmt: (v) => km(Number(v), 2) },
  moving_time_s: { label: 'Moving time', fmt: (v) => duration(Number(v)) },
  elapsed_time_s: { label: 'Elapsed time', fmt: (v) => duration(Number(v)) },
  elevation_gain_m: { label: 'Elevation gain', fmt: (v) => `${int(Number(v))} m` },
  elevation_loss_m: { label: 'Elevation loss', fmt: (v) => `${int(Number(v))} m` },
  average_speed_ms: { label: 'Avg speed', fmt: (v) => kmh(Number(v)) },
  max_speed_ms: { label: 'Max speed', fmt: (v) => kmh(Number(v)) },
  average_heartrate: { label: 'Avg heart rate', fmt: (v) => `${int(Number(v))} bpm` },
  max_heartrate: { label: 'Max heart rate', fmt: (v) => `${int(Number(v))} bpm` },
  average_watts: { label: 'Avg power', fmt: (v) => `${int(Number(v))} W` },
  max_watts: { label: 'Max power', fmt: (v) => `${int(Number(v))} W` },
  average_cadence: { label: 'Avg cadence', fmt: (v) => `${int(Number(v))} rpm` },
  calories: { label: 'Calories', fmt: (v) => `${int(Number(v))} kcal` },
  gear: { label: 'Gear', fmt: String },
  commute: { label: 'Commute', fmt: (v) => (Number(v) ? 'Yes' : 'No') },
  point_count: { label: 'GPS points', fmt: (v) => int(Number(v)) },
};

// JSON `fields` keys already covered by columns or not interesting.
const FIELDS_SKIP = new Set([
  'Activity ID', 'Activity Name', 'Activity Date', 'Activity Type', 'Filename',
  'Distance', 'Distance 2', 'Moving Time', 'Elapsed Time', 'Elapsed Time 2',
  'Commute', 'Commute 2', 'Elevation Gain', 'Elevation Loss', 'Max Speed',
  'Activity Description', 'Activity Gear', 'Media',
]);

interface MediaItem {
  seq: number;
  filename: string | null;
  mime: string | null;
}

function ProfileChart({
  data, dataKey, unit, color, name,
}: {
  data: Record<string, number | null>[];
  dataKey: string;
  unit: string;
  color: string;
  name: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis
          dataKey="km"
          type="number"
          domain={['dataMin', 'dataMax']}
          stroke={CHART.axis}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => `${v.toFixed(0)}`}
          unit=" km"
        />
        <YAxis stroke={CHART.axis} tick={{ fontSize: 11 }} width={45} domain={['auto', 'auto']} />
        <Tooltip
          {...CHART.tooltip}
          labelFormatter={(v: number) => `${v.toFixed(1)} km`}
          formatter={(v: number) => [`${v} ${unit}`, name]}
        />
        <Area dataKey={dataKey} stroke={color} strokeWidth={1.6} fill={`url(#grad-${dataKey})`} isAnimationActive={false} connectNulls />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function ActivityDetail() {
  const { id } = useParams();
  const detail = useApi(() => apiGet<Detail>(`/activities/${id}`), [id]);
  const pts = useApi(() => apiGet<PointsResponse>(`/activities/${id}/points`, { max: 500 }), [id]);

  const track = useMemo(
    () =>
      (pts.data?.points ?? [])
        .filter((p) => p.lat != null && p.lon != null)
        .map((p) => [Number(p.lat), Number(p.lon)] as [number, number]),
    [pts.data]
  );

  const bounds: LatLngBoundsExpression | undefined = useMemo(() => {
    if (track.length === 0) return undefined;
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [la, lo] of track) {
      minLat = Math.min(minLat, la);
      maxLat = Math.max(maxLat, la);
      minLon = Math.min(minLon, lo);
      maxLon = Math.max(maxLon, lo);
    }
    return [
      [minLat, minLon],
      [maxLat, maxLon],
    ];
  }, [track]);

  const chartData = useMemo(() => {
    const points = pts.data?.points ?? [];
    // GPS altitude makes per-segment grade jumpy; smooth it for display with
    // a small moving average.
    const smoothGrade = (i: number): number | null => {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - 2); j <= Math.min(points.length - 1, i + 2); j++) {
        const g = points[j].grade_pct;
        if (g != null) {
          sum += Number(g);
          n++;
        }
      }
      return n > 0 ? Math.round((sum / n) * 10) / 10 : null;
    };
    return points.map((p, i) => ({
      km: p.dist_m / 1000,
      altitude: p.altitude != null ? Math.round(Number(p.altitude)) : null,
      grade: p.grade_pct != null ? smoothGrade(i) : null,
      speed: p.speed_kmh,
      heartrate: p.heartrate != null ? Number(p.heartrate) : null,
      cadence: p.cadence != null ? Number(p.cadence) : null,
      watts: p.watts != null ? Number(p.watts) : null,
    }));
  }, [pts.data]);

  const has = (k: 'altitude' | 'grade' | 'speed' | 'heartrate' | 'cadence' | 'watts') =>
    chartData.some((d) => d[k] != null);

  const d = detail.data;
  const media = ((d?.media ?? []) as MediaItem[]).filter((m) => m.mime?.startsWith('image/'));
  const fields = (d?.fields ?? null) as Record<string, unknown> | null;
  const fieldEntries = fields
    ? Object.entries(fields).filter(
        ([k, v]) =>
          !FIELDS_SKIP.has(k) &&
          v != null &&
          v !== '' &&
          (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      )
    : [];

  return (
    <>
      <p style={{ margin: '0 0 8px' }}>
        <Link to="/activities">← All activities</Link>
      </p>
      <DataState loading={detail.loading} error={detail.error}>
        {d && (
          <>
            <h1>{String(d.name ?? `Activity ${id}`)}</h1>
            <p className="subtitle">
              <span className="badge">{String(d.type)}</span>{' '}
              {dateTimeStr(String(d.start_time))}
              {d.description ? ` — ${String(d.description)}` : ''}
            </p>

            <div className="panel">
              <div className="stat-list">
                {Object.entries(STAT_LABELS).map(([key, meta]) => {
                  const v = d[key];
                  if (v == null || v === '') return null;
                  return (
                    <div className="row" key={key}>
                      <span className="k">{meta.label}</span>
                      <span className="v">{meta.fmt(v)}</span>
                    </div>
                  );
                })}
                {d.gear_brand || d.gear_model ? (
                  <div className="row">
                    <span className="k">Gear details</span>
                    <span className="v">
                      {[d.gear_brand, d.gear_model, d.gear_kind ? `(${d.gear_kind})` : '']
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </div>
                ) : null}
                {fieldEntries.map(([k, v]) => (
                  <div className="row" key={k}>
                    <span className="k">{k}</span>
                    <span className="v">
                      {typeof v === 'number' ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {media.length > 0 && (
              <>
                <h2>Photos</h2>
                <div className="media-grid">
                  {media.map((m) => (
                    <a
                      key={m.seq}
                      href={`/api/activities/${id}/media/${m.seq}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img
                        src={`/api/activities/${id}/media/${m.seq}`}
                        alt={m.filename ?? `Photo ${m.seq + 1}`}
                        loading="lazy"
                      />
                    </a>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </DataState>

      <h2>Route</h2>
      <div className="panel" style={{ padding: 8 }}>
        <DataState loading={pts.loading} error={pts.error}>
          {track.length > 1 && bounds ? (
            <MapContainer bounds={bounds} style={{ height: 420, width: '100%' }} scrollWheelZoom>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Polyline positions={track} pathOptions={{ color: '#fc4c02', weight: 3, opacity: 0.9 }} />
              <CircleMarker center={track[0]} radius={6} pathOptions={{ color: '#4caf7d', fillColor: '#4caf7d', fillOpacity: 1 }} />
              <CircleMarker center={track[track.length - 1]} radius={6} pathOptions={{ color: '#e05a7a', fillColor: '#e05a7a', fillOpacity: 1 }} />
            </MapContainer>
          ) : (
            <div className="status-note">No GPS track recorded for this activity.</div>
          )}
        </DataState>
      </div>

      {has('altitude') && (
        <>
          <h2>Elevation profile</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="grad-altitude" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5b9bd5" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#5b9bd5" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis
                  dataKey="km"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  stroke={CHART.axis}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v.toFixed(0)}`}
                  unit=" km"
                />
                <YAxis yAxisId="alt" stroke={CHART.axis} tick={{ fontSize: 11 }} width={45} domain={['auto', 'auto']} />
                {has('grade') && (
                  <YAxis
                    yAxisId="grade"
                    orientation="right"
                    stroke={CHART.axis}
                    tick={{ fontSize: 11 }}
                    width={40}
                    unit="%"
                  />
                )}
                <Tooltip
                  {...CHART.tooltip}
                  labelFormatter={(v: number) => `${v.toFixed(1)} km`}
                  formatter={(v: number, name: string) =>
                    name === 'Grade' ? [`${v}%`, 'Grade'] : [`${v} m`, 'Altitude']
                  }
                />
                <Area yAxisId="alt" dataKey="altitude" name="Altitude" stroke="#5b9bd5" strokeWidth={1.6} fill="url(#grad-altitude)" isAnimationActive={false} connectNulls />
                {has('grade') && (
                  <Line yAxisId="grade" dataKey="grade" name="Grade" stroke="#e6b422" strokeWidth={1} strokeOpacity={0.8} dot={false} isAnimationActive={false} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {has('speed') && (
        <>
          <h2>Speed profile</h2>
          <div className="panel">
            <ProfileChart data={chartData} dataKey="speed" unit="km/h" color="#fc4c02" name="Speed" />
          </div>
        </>
      )}

      {(has('heartrate') || has('cadence') || has('watts')) && (
        <>
          <h2>Sensors</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="km" type="number" domain={['dataMin', 'dataMax']} stroke={CHART.axis} tick={{ fontSize: 11 }} unit=" km" />
                <YAxis stroke={CHART.axis} tick={{ fontSize: 11 }} width={45} />
                <Tooltip {...CHART.tooltip} labelFormatter={(v: number) => `${v.toFixed(1)} km`} />
                {has('heartrate') && <Line dataKey="heartrate" name="HR (bpm)" stroke="#e05a7a" dot={false} isAnimationActive={false} connectNulls />}
                {has('cadence') && <Line dataKey="cadence" name="Cadence (rpm)" stroke="#4caf7d" dot={false} isAnimationActive={false} connectNulls />}
                {has('watts') && <Line dataKey="watts" name="Power (W)" stroke="#e6b422" dot={false} isAnimationActive={false} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </>
  );
}
