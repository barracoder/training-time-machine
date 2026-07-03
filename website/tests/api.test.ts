/**
 * API integration tests. They run against the real MySQL database configured
 * via MYSQL_* env vars (defaults: 127.0.0.1:3306, see server/db.ts).
 * Assertions check shapes and status codes, not dataset-specific values.
 */
import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { pool } from '../server/db.js';

const app = createApp();

afterAll(async () => {
  await pool.end();
});

describe('GET /api/summary', () => {
  it('returns totals, byType and recent activities', async () => {
    const res = await request(app).get('/api/summary');
    expect(res.status).toBe(200);
    expect(res.body.totals).toBeDefined();
    expect(Number(res.body.totals.activities)).toBeGreaterThan(0);
    expect(Number(res.body.totals.distance_m)).toBeGreaterThan(0);
    expect(res.body.totals.first_activity).toBeTypeOf('string');
    expect(Array.isArray(res.body.byType)).toBe(true);
    expect(res.body.byType.length).toBeGreaterThan(0);
    expect(res.body.byType[0]).toHaveProperty('type');
    expect(Array.isArray(res.body.recent)).toBe(true);
    expect(res.body.recent.length).toBeGreaterThan(0);
    expect(res.body.recent[0]).toHaveProperty('id');
    expect(res.body.recent[0]).toHaveProperty('start_time');
    expect(res.body.recent[0]).toHaveProperty('name');
  });
});

describe('GET /api/monthly and /api/weekly', () => {
  it('returns monthly aggregates with all metrics', async () => {
    const res = await request(app).get('/api/monthly');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const row = res.body[0];
    for (const key of ['period', 'count', 'distance_m', 'moving_time_s', 'elevation_gain_m', 'avg_speed_kmh']) {
      expect(row).toHaveProperty(key);
    }
    expect(row.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it('filters by type', async () => {
    const types = await request(app).get('/api/types');
    expect(types.status).toBe(200);
    const type = types.body[0];
    const res = await request(app).get('/api/monthly').query({ type });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns weekly aggregates', async () => {
    const res = await request(app).get('/api/weekly');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].period).toMatch(/^\d{4}-W\d{2}$/);
    expect(res.body[0]).toHaveProperty('week_start');
  });
});

describe('GET /api/yearly', () => {
  it('returns per-year table rows', async () => {
    const res = await request(app).get('/api/yearly');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(Number(res.body[0].year)).toBeGreaterThan(2000);
    expect(res.body[0]).toHaveProperty('longest_m');
  });
});

describe('GET /api/cumulative', () => {
  it('returns per-year monotonically increasing series', async () => {
    const res = await request(app).get('/api/cumulative');
    expect(res.status).toBe(200);
    const years = Object.keys(res.body);
    expect(years.length).toBeGreaterThan(0);
    const series = res.body[years[0]];
    expect(Array.isArray(series)).toBe(true);
    expect(series.length).toBeGreaterThan(0);
    for (let i = 1; i < series.length; i++) {
      expect(series[i].cum_km).toBeGreaterThanOrEqual(series[i - 1].cum_km);
      expect(series[i].doy).toBeGreaterThan(series[i - 1].doy);
    }
  });
});

describe('GET /api/years and /api/calendar', () => {
  it('lists available years descending', async () => {
    const res = await request(app).get('/api/years');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect([...res.body].sort((a: number, b: number) => b - a)).toEqual(res.body);
  });

  it('returns daily rows for a year', async () => {
    const years = await request(app).get('/api/years');
    const year = years.body[0];
    const res = await request(app).get('/api/calendar').query({ year });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].date).toMatch(new RegExp(`^${year}-\\d{2}-\\d{2}$`));
    expect(res.body[0]).toHaveProperty('distance_m');
  });

  it('rejects a missing year param', async () => {
    const res = await request(app).get('/api/calendar');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('bad_request');
  });
});

describe('GET /api/types', () => {
  it('returns distinct type strings', async () => {
    const res = await request(app).get('/api/types');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(typeof res.body[0]).toBe('string');
  });
});

describe('GET /api/activities', () => {
  it('returns paginated rows with a total', async () => {
    const res = await request(app).get('/api/activities').query({ pageSize: 10 });
    expect(res.status).toBe(200);
    expect(Number(res.body.total)).toBeGreaterThan(0);
    expect(res.body.rows.length).toBeLessThanOrEqual(10);
    expect(res.body.rows.length).toBeGreaterThan(0);
    for (const key of ['id', 'start_time', 'name', 'type', 'distance_m']) {
      expect(res.body.rows[0]).toHaveProperty(key);
    }
  });

  it('sorts by distance ascending', async () => {
    const res = await request(app)
      .get('/api/activities')
      .query({ sort: 'distance_m', dir: 'asc', pageSize: 20 });
    expect(res.status).toBe(200);
    const dists = res.body.rows.map((r: { distance_m: number | null }) => Number(r.distance_m ?? 0));
    const sorted = [...dists].sort((a, b) => a - b);
    expect(dists).toEqual(sorted);
  });

  it('filters by search / type / date range without error', async () => {
    const res = await request(app)
      .get('/api/activities')
      .query({ search: 'a', type: 'Ride', from: '2000-01-01', to: '2099-12-31' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.rows)).toBe(true);
    for (const row of res.body.rows) {
      expect(row.type).toBe('Ride');
    }
  });
});

describe('GET /api/activities/:id', () => {
  it('returns full detail with parsed fields and gear join', async () => {
    const list = await request(app).get('/api/activities').query({ pageSize: 1 });
    const id = list.body.rows[0].id;
    const res = await request(app).get(`/api/activities/${id}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.id)).toBe(Number(id));
    expect(res.body).toHaveProperty('start_time');
    expect(res.body).toHaveProperty('point_count');
    expect(Array.isArray(res.body.media)).toBe(true);
    if (res.body.fields != null) {
      expect(typeof res.body.fields).toBe('object');
    }
  });

  it('404s for a nonexistent id', async () => {
    const res = await request(app).get('/api/activities/1');
    // id 1 may or may not exist in any dataset; use an impossible id instead.
    const res2 = await request(app).get('/api/activities/999999999999999');
    expect([200, 404]).toContain(res.status);
    expect(res2.status).toBe(404);
    expect(res2.body.error).toBe('not_found');
  });

  it('400s for a non-numeric id', async () => {
    const res = await request(app).get('/api/activities/abc');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/activities/:id/media/:seq', () => {
  it('serves media bytes with the stored content type', async () => {
    // Find an activity that has media attached; skip the byte check if none do.
    const list = await request(app).get('/api/activities').query({ pageSize: 100 });
    let withMedia: { id: number; mime: string | null } | null = null;
    for (const a of list.body.rows) {
      const d = await request(app).get(`/api/activities/${a.id}`);
      if (d.body.media.length > 0) {
        withMedia = { id: a.id, mime: d.body.media[0].mime };
        break;
      }
    }
    if (withMedia == null) return;
    const res = await request(app).get(`/api/activities/${withMedia.id}/media/0`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(withMedia.mime);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('404s for nonexistent media', async () => {
    const res = await request(app).get('/api/activities/999999999999999/media/0');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('400s for non-numeric refs', async () => {
    const res = await request(app).get('/api/activities/abc/media/xyz');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/activities/:id/points', () => {
  it('downsamples to the requested max and enriches points', async () => {
    // Find an activity that actually has GPS points.
    const summary = await request(app).get('/api/summary');
    let withPoints: number | null = null;
    for (const a of summary.body.recent) {
      const d = await request(app).get(`/api/activities/${a.id}`);
      if (Number(d.body.point_count) > 100) {
        withPoints = a.id;
        break;
      }
    }
    if (withPoints == null) {
      // Fall back: scan the first page of activities.
      const list = await request(app).get('/api/activities').query({ pageSize: 50 });
      for (const a of list.body.rows) {
        const d = await request(app).get(`/api/activities/${a.id}`);
        if (Number(d.body.point_count) > 100) {
          withPoints = a.id;
          break;
        }
      }
    }
    expect(withPoints).not.toBeNull();

    const res = await request(app).get(`/api/activities/${withPoints}/points`).query({ max: 100 });
    expect(res.status).toBe(200);
    expect(res.body.total_points).toBeGreaterThan(100);
    expect(res.body.points.length).toBeLessThanOrEqual(101); // stride + final point
    expect(res.body.points.length).toBeGreaterThan(10);
    const p = res.body.points[Math.floor(res.body.points.length / 2)];
    for (const key of ['seq', 'lat', 'lon', 'dist_m', 'elapsed_s', 'speed_kmh', 'grade_pct']) {
      expect(p).toHaveProperty(key);
    }
    // Grade must be finite where present, and present on at least one point
    // for a real GPS track.
    const grades = res.body.points
      .map((x: { grade_pct: number | null }) => x.grade_pct)
      .filter((g: number | null): g is number => g != null);
    expect(grades.length).toBeGreaterThan(0);
    for (const g of grades) {
      expect(Number.isFinite(g)).toBe(true);
    }
    // Cumulative distance must be non-decreasing.
    const dists = res.body.points.map((x: { dist_m: number }) => x.dist_m);
    for (let i = 1; i < dists.length; i++) {
      expect(dists[i]).toBeGreaterThanOrEqual(dists[i - 1]);
    }
  });

  it('returns an empty list for an activity with no points', async () => {
    const res = await request(app).get('/api/activities/999999999999999/points');
    expect(res.status).toBe(200);
    expect(res.body.points).toEqual([]);
    expect(res.body.total_points).toBe(0);
  });
});

describe('GET /api/heatmap', () => {
  it('returns aggregated [lat, lon, weight] cells', async () => {
    const res = await request(app).get('/api/heatmap');
    expect(res.status).toBe(200);
    expect(res.body.cells).toBeGreaterThan(0);
    expect(res.body.points.length).toBe(res.body.cells);
    const [lat, lon, w] = res.body.points[0];
    expect(lat).toBeGreaterThanOrEqual(-90);
    expect(lat).toBeLessThanOrEqual(90);
    expect(lon).toBeGreaterThanOrEqual(-180);
    expect(lon).toBeLessThanOrEqual(180);
    expect(w).toBeGreaterThan(0);
  });
});

describe('GET /api/records', () => {
  it('returns all record categories', async () => {
    const res = await request(app).get('/api/records');
    expect(res.status).toBe(200);
    for (const key of ['longest', 'biggestClimb', 'fastest', 'bestDay', 'bestWeek', 'bestMonth', 'bestYear']) {
      expect(res.body[key]).toBeTruthy();
      expect(res.body[key]).toBeTypeOf('object');
    }
    expect(Number(res.body.longest.distance_m)).toBeGreaterThan(0);
    expect(Number(res.body.fastest.distance_m)).toBeGreaterThanOrEqual(5000);
    expect(Array.isArray(res.body.milestones)).toBe(true);
    expect(Array.isArray(res.body.perGear)).toBe(true);
    expect(res.body.lifetime_km).toBeGreaterThan(0);
    if (res.body.milestones.length > 1) {
      expect(res.body.milestones[0].km).toBeLessThan(res.body.milestones[1].km);
    }
  });
});

describe('GET /api/gear', () => {
  it('returns gear with usage totals', async () => {
    const res = await request(app).get('/api/gear');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      for (const key of ['name', 'kind', 'activities', 'distance_m']) {
        expect(res.body[0]).toHaveProperty(key);
      }
    }
  });
});

describe('GET /api/goals', () => {
  it('returns goals with computed progress', async () => {
    const res = await request(app).get('/api/goals');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const g of res.body) {
      expect(g).toHaveProperty('goal_type');
      expect(g).toHaveProperty('progress');
      expect(g.progress).toHaveProperty('actual');
      expect(g.progress).toHaveProperty('target');
      expect(g.progress).toHaveProperty('unit');
    }
  });
});

describe('GET /api/athlete', () => {
  it('returns the athlete profile', async () => {
    const res = await request(app).get('/api/athlete');
    expect(res.status).toBe(200);
    expect(res.body).toBeTypeOf('object');
  });
});

describe('unknown API routes', () => {
  it('returns JSON 404', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
