import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import { apiGet, HeatmapResponse } from '../api';
import { DataState, useApi } from '../components/common';
import { int } from '../format';

function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    // Log-scale weights so daily commutes don't drown one-off routes.
    const maxW = points.reduce((m, p) => Math.max(m, p[2]), 1);
    const scaled = points.map(
      (p) => [p[0], p[1], Math.log1p(p[2]) / Math.log1p(maxW)] as [number, number, number]
    );
    const layer = L.heatLayer(scaled, {
      radius: 6,
      blur: 5,
      max: 0.6,
      minOpacity: 0.25,
      gradient: { 0.2: '#3b1204', 0.4: '#93400f', 0.65: '#fc4c02', 0.9: '#ffb199', 1: '#ffffff' },
    });
    layer.addTo(map);

    // Fit to data once.
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const [la, lo] of points) {
      minLat = Math.min(minLat, la);
      maxLat = Math.max(maxLat, la);
      minLon = Math.min(minLon, lo);
      maxLon = Math.max(maxLon, lo);
    }
    map.fitBounds([
      [minLat, minLon],
      [maxLat, maxLon],
    ]);

    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}

export default function HeatmapPage() {
  const heat = useApi(() => apiGet<HeatmapResponse>('/heatmap'), []);
  const points = useMemo(() => heat.data?.points ?? [], [heat.data]);

  return (
    <>
      <h1>Heatmap</h1>
      <p className="subtitle">
        Every GPS point from every activity
        {heat.data ? ` — ${int(heat.data.cells)} grid cells (~50 m resolution)` : ''}
      </p>
      <div className="panel" style={{ padding: 8 }}>
        <DataState loading={heat.loading} error={heat.error}>
          {points.length > 0 ? (
            <MapContainer center={[51.5, -0.1]} zoom={11} style={{ height: 'calc(100vh - 200px)', minHeight: 420, width: '100%' }} scrollWheelZoom preferCanvas>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                className="dimmed-tiles"
              />
              <HeatLayer points={points} />
            </MapContainer>
          ) : (
            <div className="status-note">No GPS points found.</div>
          )}
        </DataState>
      </div>
    </>
  );
}
