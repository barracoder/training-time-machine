import express, { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { query, queryOne } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Handler = (req: Request, res: Response) => Promise<void>;

/** Wrap async handlers so rejections hit the error middleware. */
const h =
  (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const DB_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EHOSTUNREACH',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'POOL_CLOSED',
]);

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());

  const api = express.Router();

  // ---------------------------------------------------------------- summary
  api.get(
    '/summary',
    h(async (_req, res) => {
      const totals = await queryOne(
        `SELECT COUNT(*)                       AS activities,
                COALESCE(SUM(distance_m), 0)   AS distance_m,
                COALESCE(SUM(moving_time_s),0) AS moving_time_s,
                COALESCE(SUM(elapsed_time_s),0) AS elapsed_time_s,
                COALESCE(SUM(elevation_gain_m),0) AS elevation_gain_m,
                COALESCE(SUM(calories),0)      AS calories,
                MIN(start_time)                AS first_activity,
                MAX(start_time)                AS last_activity
         FROM activities`
      );
      const byType = await query(
        `SELECT type,
                COUNT(*)                       AS activities,
                COALESCE(SUM(distance_m), 0)   AS distance_m,
                COALESCE(SUM(moving_time_s),0) AS moving_time_s,
                COALESCE(SUM(elevation_gain_m),0) AS elevation_gain_m
         FROM activities
         GROUP BY type
         ORDER BY activities DESC`
      );
      const recent = await query(
        `SELECT id, start_time, name, type, distance_m, moving_time_s,
                elevation_gain_m, average_speed_ms, average_heartrate, calories
         FROM activities
         ORDER BY start_time DESC
         LIMIT 12`
      );
      res.json({ totals, byType, recent });
    })
  );

  // ------------------------------------------------------- monthly / weekly
  const AGG_SELECT = `
    COUNT(*)                                        AS count,
    COALESCE(SUM(distance_m), 0)                    AS distance_m,
    COALESCE(SUM(moving_time_s), 0)                 AS moving_time_s,
    COALESCE(SUM(elevation_gain_m), 0)              AS elevation_gain_m,
    COALESCE(SUM(calories), 0)                      AS calories,
    COALESCE(SUM(distance_m) / NULLIF(SUM(moving_time_s), 0) * 3.6, 0) AS avg_speed_kmh`;

  api.get(
    '/monthly',
    h(async (req, res) => {
      const type = typeof req.query.type === 'string' && req.query.type !== '' ? req.query.type : null;
      const where = type ? 'WHERE type = ?' : '';
      const rows = await query(
        `SELECT DATE_FORMAT(start_time, '%Y-%m') AS period,
                YEAR(start_time)  AS year,
                MONTH(start_time) AS month,
                ${AGG_SELECT}
         FROM activities ${where}
         GROUP BY period, year, month
         ORDER BY period`,
        type ? [type] : []
      );
      res.json(rows);
    })
  );

  api.get(
    '/weekly',
    h(async (req, res) => {
      const type = typeof req.query.type === 'string' && req.query.type !== '' ? req.query.type : null;
      const where = type ? 'WHERE type = ?' : '';
      const rows = await query(
        `SELECT DATE_FORMAT(start_time, '%x-W%v') AS period,
                MIN(DATE(start_time))             AS week_start,
                ${AGG_SELECT}
         FROM activities ${where}
         GROUP BY period
         ORDER BY period`,
        type ? [type] : []
      );
      res.json(rows);
    })
  );

  api.get(
    '/yearly',
    h(async (req, res) => {
      const type = typeof req.query.type === 'string' && req.query.type !== '' ? req.query.type : null;
      const where = type ? 'WHERE type = ?' : '';
      const rows = await query(
        `SELECT YEAR(start_time) AS year,
                ${AGG_SELECT},
                COALESCE(MAX(distance_m), 0) AS longest_m
         FROM activities ${where}
         GROUP BY year
         ORDER BY year`,
        type ? [type] : []
      );
      res.json(rows);
    })
  );

  // ------------------------------------------------------------- cumulative
  api.get(
    '/cumulative',
    h(async (_req, res) => {
      const rows = await query<{ year: number; doy: number; distance_m: number }>(
        `SELECT YEAR(start_time) AS year, DAYOFYEAR(start_time) AS doy,
                COALESCE(SUM(distance_m), 0) AS distance_m
         FROM activities
         GROUP BY year, doy
         ORDER BY year, doy`
      );
      const byYear: Record<string, { doy: number; cum_km: number }[]> = {};
      let curYear = -1;
      let cum = 0;
      for (const r of rows) {
        if (r.year !== curYear) {
          curYear = r.year;
          cum = 0;
          byYear[curYear] = [];
        }
        cum += num(r.distance_m);
        byYear[curYear].push({ doy: r.doy, cum_km: Math.round(cum / 100) / 10 });
      }
      res.json(byYear);
    })
  );

  // --------------------------------------------------------------- calendar
  api.get(
    '/years',
    h(async (_req, res) => {
      const rows = await query<{ year: number }>(
        `SELECT DISTINCT YEAR(start_time) AS year FROM activities ORDER BY year DESC`
      );
      res.json(rows.map((r) => r.year));
    })
  );

  api.get(
    '/calendar',
    h(async (req, res) => {
      const year = Number(req.query.year);
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        res.status(400).json({ error: 'bad_request', message: 'year query param required' });
        return;
      }
      const rows = await query(
        `SELECT DATE(start_time) AS date,
                COUNT(*) AS count,
                COALESCE(SUM(distance_m), 0) AS distance_m,
                COALESCE(SUM(moving_time_s), 0) AS moving_time_s,
                COALESCE(SUM(elevation_gain_m), 0) AS elevation_gain_m
         FROM activities
         WHERE YEAR(start_time) = ?
         GROUP BY date
         ORDER BY date`,
        [year]
      );
      res.json(rows);
    })
  );

  // ------------------------------------------------------------------ types
  api.get(
    '/types',
    h(async (_req, res) => {
      const rows = await query<{ type: string }>(
        `SELECT DISTINCT type FROM activities ORDER BY type`
      );
      res.json(rows.map((r) => r.type));
    })
  );

  // ------------------------------------------------------------- activities
  const SORTABLE = new Set([
    'start_time',
    'name',
    'type',
    'distance_m',
    'moving_time_s',
    'elevation_gain_m',
    'average_speed_ms',
    'average_heartrate',
    'calories',
  ]);

  api.get(
    '/activities',
    h(async (req, res) => {
      const q = req.query;
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (typeof q.search === 'string' && q.search.trim() !== '') {
        clauses.push('name LIKE ?');
        params.push(`%${q.search.trim()}%`);
      }
      if (typeof q.type === 'string' && q.type !== '') {
        clauses.push('type = ?');
        params.push(q.type);
      }
      if (typeof q.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.from)) {
        clauses.push('start_time >= ?');
        params.push(q.from);
      }
      if (typeof q.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
        clauses.push('start_time < DATE_ADD(?, INTERVAL 1 DAY)');
        params.push(q.to);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

      const sort = typeof q.sort === 'string' && SORTABLE.has(q.sort) ? q.sort : 'start_time';
      const dir = q.dir === 'asc' ? 'ASC' : 'DESC';
      const pageSize = Math.min(Math.max(Number(q.pageSize) || 50, 1), 200);
      const page = Math.max(Number(q.page) || 1, 1);
      const offset = (page - 1) * pageSize;

      const totalRow = await queryOne<{ total: number }>(
        `SELECT COUNT(*) AS total FROM activities ${where}`,
        params
      );
      const rows = await query(
        `SELECT id, start_time, name, type, distance_m, moving_time_s, elapsed_time_s,
                elevation_gain_m, average_speed_ms, max_speed_ms, average_heartrate,
                calories, gear, commute
         FROM activities ${where}
         ORDER BY ${sort} ${dir}, id DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      );
      res.json({ total: totalRow ? num(totalRow.total) : 0, page, pageSize, rows });
    })
  );

  api.get(
    '/activities/:id',
    h(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'bad_request', message: 'invalid activity id' });
        return;
      }
      const row = await queryOne<Record<string, unknown>>(
        `SELECT a.*,
                g.kind AS gear_kind, g.brand AS gear_brand, g.model AS gear_model,
                (SELECT COUNT(*) FROM activity_points p WHERE p.activity_id = a.id) AS point_count
         FROM activities a
         LEFT JOIN gear g ON g.name = a.gear
         WHERE a.id = ?`,
        [id]
      );
      if (!row) {
        res.status(404).json({ error: 'not_found', message: `activity ${id} not found` });
        return;
      }
      if (typeof row.fields === 'string') {
        try {
          row.fields = JSON.parse(row.fields);
        } catch {
          /* keep raw string */
        }
      }
      try {
        row.media = await query(
          `SELECT seq, filename, mime FROM activity_media WHERE activity_id = ? ORDER BY seq`,
          [id]
        );
      } catch {
        // Database imported before media support — no table, no media.
        row.media = [];
      }
      res.json(row);
    })
  );

  api.get(
    '/activities/:id/media/:seq',
    h(async (req, res) => {
      const id = Number(req.params.id);
      const seq = Number(req.params.seq);
      if (!Number.isInteger(id) || !Number.isInteger(seq)) {
        res.status(400).json({ error: 'bad_request', message: 'invalid media reference' });
        return;
      }
      const row = await queryOne<{ mime: string | null; data: Buffer }>(
        `SELECT mime, data FROM activity_media WHERE activity_id = ? AND seq = ?`,
        [id, seq]
      );
      if (!row || !row.data) {
        res.status(404).json({ error: 'not_found', message: `no media ${seq} for activity ${id}` });
        return;
      }
      res.setHeader('Content-Type', row.mime ?? 'application/octet-stream');
      // Media only changes when the whole database is re-imported.
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(row.data);
    })
  );

  // ----------------------------------------------------------------- points
  api.get(
    '/activities/:id/points',
    h(async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'bad_request', message: 'invalid activity id' });
        return;
      }
      const max = Math.min(Math.max(Number(req.query.max) || 500, 10), 5000);
      const raw = await query<{
        seq: number;
        time: string | null;
        lat: number | null;
        lon: number | null;
        altitude: number | null;
        heartrate: number | null;
        cadence: number | null;
        watts: number | null;
        temp: number | null;
      }>(
        `SELECT seq, time, lat, lon, altitude, heartrate, cadence, watts, temp
         FROM activity_points
         WHERE activity_id = ?
         ORDER BY seq`,
        [id]
      );
      if (raw.length === 0) {
        res.json({ activity_id: id, total_points: 0, points: [] });
        return;
      }

      // Cumulative distance + elapsed time over the full-resolution track.
      const t0 = raw[0].time ? Date.parse(raw[0].time.replace(' ', 'T') + 'Z') : NaN;
      let cum = 0;
      let prevLat: number | null = null;
      let prevLon: number | null = null;
      const enriched = raw.map((p) => {
        if (p.lat != null && p.lon != null) {
          if (prevLat != null && prevLon != null) {
            cum += haversineM(prevLat, prevLon, num(p.lat), num(p.lon));
          }
          prevLat = num(p.lat);
          prevLon = num(p.lon);
        }
        const tp = p.time ? Date.parse(p.time.replace(' ', 'T') + 'Z') : NaN;
        return {
          ...p,
          dist_m: Math.round(cum),
          elapsed_s: Number.isFinite(tp) && Number.isFinite(t0) ? Math.round((tp - t0) / 1000) : null,
        };
      });

      // Downsample by stride, always keeping the final point.
      const stride = Math.max(1, Math.ceil(enriched.length / max));
      const sampled = enriched.filter(
        (_, i) => i % stride === 0 || i === enriched.length - 1
      );

      // Segment speed (km/h) and grade (%) between consecutive sampled points.
      const points = sampled.map((p, i) => {
        let speed_kmh: number | null = null;
        let grade_pct: number | null = null;
        if (i > 0) {
          const prev = sampled[i - 1];
          const dd = p.dist_m - prev.dist_m;
          const dt =
            p.elapsed_s != null && prev.elapsed_s != null ? p.elapsed_s - prev.elapsed_s : 0;
          if (dt > 0) speed_kmh = Math.round((dd / dt) * 3.6 * 10) / 10;
          // Short segments make GPS altitude noise explode into absurd grades.
          if (dd >= 5 && p.altitude != null && prev.altitude != null) {
            grade_pct = Math.round(((num(p.altitude) - num(prev.altitude)) / dd) * 1000) / 10;
          }
        }
        return {
          seq: p.seq,
          elapsed_s: p.elapsed_s,
          lat: p.lat,
          lon: p.lon,
          altitude: p.altitude,
          dist_m: p.dist_m,
          speed_kmh,
          grade_pct,
          heartrate: p.heartrate,
          cadence: p.cadence,
          watts: p.watts,
          temp: p.temp,
        };
      });
      res.json({ activity_id: id, total_points: raw.length, points });
    })
  );

  // ---------------------------------------------------------------- heatmap
  api.get(
    '/heatmap',
    h(async (_req, res) => {
      // Aggregate GPS points onto a ~50 m grid (3.5 decimal places). Weight is
      // log-scaled client-side; capping COUNT keeps hot commutes from washing
      // everything else out.
      const rows = await query<{ lat: number; lon: number; w: number }>(
        `SELECT ROUND(lat * 2000) / 2000 AS lat,
                ROUND(lon * 2000) / 2000 AS lon,
                COUNT(*) AS w
         FROM activity_points
         WHERE lat IS NOT NULL AND lon IS NOT NULL
         GROUP BY 1, 2`
      );
      // Compact wire format: [lat, lon, weight]
      res.json({
        cells: rows.length,
        points: rows.map((r) => [num(r.lat), num(r.lon), num(r.w)]),
      });
    })
  );

  // ---------------------------------------------------------------- records
  api.get(
    '/records',
    h(async (_req, res) => {
      const ACT_COLS = `id, start_time, name, type, distance_m, moving_time_s,
                        elevation_gain_m, average_speed_ms`;
      const longest = await queryOne(
        `SELECT ${ACT_COLS} FROM activities
         WHERE distance_m IS NOT NULL ORDER BY distance_m DESC LIMIT 1`
      );
      const biggestClimb = await queryOne(
        `SELECT ${ACT_COLS} FROM activities
         WHERE elevation_gain_m IS NOT NULL ORDER BY elevation_gain_m DESC LIMIT 1`
      );
      const fastest = await queryOne(
        `SELECT ${ACT_COLS},
                distance_m / NULLIF(moving_time_s, 0) * 3.6 AS avg_kmh
         FROM activities
         WHERE distance_m >= 5000 AND moving_time_s > 0
         ORDER BY avg_kmh DESC LIMIT 1`
      );
      const bestWeek = await queryOne(
        `SELECT DATE_FORMAT(start_time, '%x-W%v') AS period,
                MIN(DATE(start_time)) AS starts,
                COUNT(*) AS count, SUM(distance_m) AS distance_m
         FROM activities GROUP BY period ORDER BY distance_m DESC LIMIT 1`
      );
      const bestMonth = await queryOne(
        `SELECT DATE_FORMAT(start_time, '%Y-%m') AS period,
                COUNT(*) AS count, SUM(distance_m) AS distance_m
         FROM activities GROUP BY period ORDER BY distance_m DESC LIMIT 1`
      );
      const bestYear = await queryOne(
        `SELECT YEAR(start_time) AS period,
                COUNT(*) AS count, SUM(distance_m) AS distance_m
         FROM activities GROUP BY period ORDER BY distance_m DESC LIMIT 1`
      );
      const bestDay = await queryOne(
        `SELECT DATE(start_time) AS period,
                COUNT(*) AS count, SUM(distance_m) AS distance_m
         FROM activities GROUP BY period ORDER BY distance_m DESC LIMIT 1`
      );

      // Distance milestones: first activity that pushed the lifetime total past
      // each threshold.
      const ordered = await query<{
        id: number;
        start_time: string;
        name: string;
        distance_m: number | null;
      }>(
        `SELECT id, start_time, name, distance_m FROM activities ORDER BY start_time`
      );
      const thresholdsKm = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
      const milestones: {
        km: number;
        reached_at: string;
        activity_id: number;
        activity_name: string;
      }[] = [];
      let cumM = 0;
      let ti = 0;
      for (const a of ordered) {
        cumM += num(a.distance_m);
        while (ti < thresholdsKm.length && cumM >= thresholdsKm[ti] * 1000) {
          milestones.push({
            km: thresholdsKm[ti],
            reached_at: a.start_time,
            activity_id: a.id,
            activity_name: a.name,
          });
          ti++;
        }
      }

      const perGear = await query(
        `SELECT a.gear AS name, g.kind, g.brand, g.model,
                COUNT(*) AS activities,
                COALESCE(SUM(a.distance_m), 0) AS distance_m,
                COALESCE(SUM(a.moving_time_s), 0) AS moving_time_s,
                COALESCE(SUM(a.elevation_gain_m), 0) AS elevation_gain_m
         FROM activities a
         LEFT JOIN gear g ON g.name = a.gear
         WHERE a.gear IS NOT NULL AND a.gear <> ''
         GROUP BY a.gear, g.kind, g.brand, g.model
         ORDER BY distance_m DESC`
      );

      res.json({
        longest,
        biggestClimb,
        fastest,
        bestDay,
        bestWeek,
        bestMonth,
        bestYear,
        milestones,
        perGear,
        lifetime_km: Math.round(cumM / 1000),
      });
    })
  );

  // ------------------------------------------------------------------- gear
  api.get(
    '/gear',
    h(async (_req, res) => {
      const rows = await query(
        `SELECT g.name, g.kind, g.brand, g.model, g.default_sport_types,
                COUNT(a.id) AS activities,
                COALESCE(SUM(a.distance_m), 0) AS distance_m,
                COALESCE(SUM(a.moving_time_s), 0) AS moving_time_s,
                COALESCE(SUM(a.elevation_gain_m), 0) AS elevation_gain_m
         FROM gear g
         LEFT JOIN activities a ON a.gear = g.name
         GROUP BY g.name, g.kind, g.brand, g.model, g.default_sport_types
         ORDER BY distance_m DESC`
      );
      res.json(rows);
    })
  );

  // ------------------------------------------------------------------ goals
  api.get(
    '/goals',
    h(async (_req, res) => {
      const goals = await query<{
        goal_type: string | null;
        activity_type: string | null;
        goal: number | null;
        start_date: string | null;
        end_date: string | null;
        time_period: string | null;
      }>(`SELECT goal_type, activity_type, goal, start_date, end_date, time_period FROM goals`);

      // Current-period boundaries (UTC) for recurring goals.
      const now = new Date();
      const startOfYear = `${now.getUTCFullYear()}-01-01`;
      const startOfMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
      const monday = new Date(now);
      const dow = (monday.getUTCDay() + 6) % 7; // 0 = Monday
      monday.setUTCDate(monday.getUTCDate() - dow);
      const startOfWeek = monday.toISOString().slice(0, 10);

      const out = [];
      for (const g of goals) {
        const clauses: string[] = [];
        const params: unknown[] = [];
        // "All Ride" covers Ride / E-Bike Ride / Virtual Ride etc.
        if (g.activity_type && g.activity_type.toLowerCase().startsWith('all ')) {
          clauses.push('type LIKE ?');
          params.push(`%${g.activity_type.slice(4)}%`);
        } else if (g.activity_type) {
          clauses.push('type = ?');
          params.push(g.activity_type);
        }
        // Goal active window.
        if (g.start_date) {
          clauses.push('start_time >= ?');
          params.push(g.start_date);
        }
        if (g.end_date) {
          clauses.push('start_time < ?');
          params.push(g.end_date);
        }
        // Recurring goals: measure the current week/month/year only.
        const period = (g.time_period ?? '').toLowerCase();
        const periodStart =
          period === 'week' ? startOfWeek : period === 'month' ? startOfMonth : period === 'year' ? startOfYear : null;
        if (periodStart) {
          clauses.push('start_time >= ?');
          params.push(periodStart);
        }
        const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
        const agg = await queryOne<{
          count: number;
          distance_m: number;
          moving_time_s: number;
          elevation_gain_m: number;
        }>(
          `SELECT COUNT(*) AS count,
                  COALESCE(SUM(distance_m), 0) AS distance_m,
                  COALESCE(SUM(moving_time_s), 0) AS moving_time_s,
                  COALESCE(SUM(elevation_gain_m), 0) AS elevation_gain_m
           FROM activities ${where}`,
          params
        );
        // Progress hint: pick the metric matching goal_type. Distance goals
        // store the target in metres.
        const gt = (g.goal_type ?? '').toLowerCase();
        let actual = num(agg?.count);
        let target = num(g.goal);
        let unit = 'activities';
        if (gt.includes('dist')) {
          actual = num(agg?.distance_m) / 1000;
          target = target / 1000;
          unit = 'km';
        } else if (gt.includes('time') || gt.includes('hour')) {
          actual = num(agg?.moving_time_s) / 3600;
          unit = 'hours';
        } else if (gt.includes('elev') || gt.includes('climb')) {
          actual = num(agg?.elevation_gain_m);
          unit = 'm';
        }
        out.push({
          ...g,
          active: g.end_date == null,
          period_start: periodStart,
          stats: agg,
          progress: {
            actual: Math.round(actual * 10) / 10,
            unit,
            target: Math.round(target * 10) / 10,
            pct: target > 0 ? Math.round((actual / target) * 1000) / 10 : null,
          },
        });
      }
      res.json(out);
    })
  );

  // ---------------------------------------------------------------- athlete
  api.get(
    '/athlete',
    h(async (_req, res) => {
      const row = await queryOne(`SELECT * FROM athlete LIMIT 1`);
      res.json(row ?? {});
    })
  );

  app.use('/api', api);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'unknown API endpoint' });
  });

  // Error handler — surface DB-down clearly.
  app.use((err: NodeJS.ErrnoException, _req: Request, res: Response, _next: NextFunction) => {
    if (err && err.code && DB_ERROR_CODES.has(err.code)) {
      res.status(503).json({
        error: 'database_unavailable',
        message: `Cannot reach MySQL (${err.code}). Check MYSQL_HOST/MYSQL_PORT and that the database is running.`,
      });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: err?.message ?? 'unexpected error' });
  });

  // Serve built SPA when available (production).
  const dist = path.resolve(__dirname, '..', 'dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}
