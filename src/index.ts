#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createPool } from "./db.js";

const pool = createPool();

const server = new McpServer({
  name: "strava-mcp",
  version: "0.3.0",
});

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

async function call(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const result = await fn();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    let message = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED/.test(message)) {
      message +=
        "\nMySQL is not reachable. Start it with `docker compose up -d` in the strava-mcp repo, " +
        "and load data with the strava-extract script if you haven't yet.";
    }
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

async function rows(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const [result] = await pool.query(sql, params);
  return result as Record<string, unknown>[];
}

server.registerTool(
  "get_athlete",
  {
    title: "Get athlete",
    description: "The athlete's profile (name, location, weight) plus bikes and shoes.",
    inputSchema: {},
  },
  () =>
    call(async () => ({
      profile: (await rows(`SELECT * FROM athlete`))[0] ?? null,
      gear: await rows(`SELECT * FROM gear ORDER BY kind, name`),
    })),
);

server.registerTool(
  "get_athlete_stats",
  {
    title: "Get athlete stats",
    description:
      "Totals per activity type (count, distance km, moving time hours, elevation gain m) for the last 4 weeks, year to date, and all time.",
    inputSchema: {},
  },
  () =>
    call(async () => {
      const aggregate = (where: string) =>
        rows(
          `SELECT type,
                  COUNT(*) AS count,
                  ROUND(SUM(distance_m) / 1000, 1) AS distance_km,
                  ROUND(SUM(moving_time_s) / 3600, 1) AS moving_time_h,
                  ROUND(SUM(elevation_gain_m)) AS elevation_gain_m
           FROM activities ${where}
           GROUP BY type ORDER BY count DESC`,
        );
      return {
        recent_4_weeks: await aggregate(
          `WHERE start_time >= UTC_TIMESTAMP() - INTERVAL 28 DAY`,
        ),
        year_to_date: await aggregate(
          `WHERE start_time >= MAKEDATE(YEAR(UTC_TIMESTAMP()), 1)`,
        ),
        all_time: await aggregate(``),
      };
    }),
);

server.registerTool(
  "list_activities",
  {
    title: "List activities",
    description: "List activities, most recent first, with date/type/name filtering and paging.",
    inputSchema: {
      after: z
        .string()
        .optional()
        .describe("ISO date (e.g. 2026-01-01); only activities on or after this date (UTC)"),
      before: z.string().optional().describe("ISO date; only activities before this date (UTC)"),
      type: z.string().optional().describe('Activity type filter, e.g. "Ride", "Run", "Walk"'),
      query: z.string().optional().describe("Case-insensitive substring match on activity name"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      per_page: z.number().int().min(1).max(200).optional().describe("Results per page (default 30)"),
    },
  },
  ({ after, before, type, query, page = 1, per_page = 30 }) =>
    call(async () => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (after) {
        where.push(`start_time >= ?`);
        params.push(after);
      }
      if (before) {
        where.push(`start_time < ?`);
        params.push(before);
      }
      if (type) {
        where.push(`type = ?`);
        params.push(type);
      }
      if (query) {
        where.push(`name LIKE ?`);
        params.push(`%${query}%`);
      }
      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const [{ total }] = (await rows(
        `SELECT COUNT(*) AS total FROM activities ${whereSql}`,
        params,
      )) as [{ total: number }];
      const activities = await rows(
        `SELECT id, start_time, name, type, distance_m, moving_time_s, elapsed_time_s,
                elevation_gain_m, average_speed_ms, average_heartrate, average_watts, gear,
                (filename IS NOT NULL) AS has_track
         FROM activities ${whereSql}
         ORDER BY start_time DESC
         LIMIT ? OFFSET ?`,
        [...params, per_page, (page - 1) * per_page],
      );
      return { total, page, activities };
    }),
);

server.registerTool(
  "get_activity",
  {
    title: "Get activity",
    description:
      "One activity in full: typed columns plus every raw export field (weather, power, temps...) from the `fields` JSON.",
    inputSchema: {
      activity_id: z.string().describe("Activity id (from list_activities)"),
    },
  },
  ({ activity_id }) =>
    call(async () => {
      const result = await rows(`SELECT * FROM activities WHERE id = ?`, [activity_id]);
      if (result.length === 0) throw new Error(`No activity with id ${activity_id}.`);
      return result[0];
    }),
);

server.registerTool(
  "get_activity_streams",
  {
    title: "Get activity streams",
    description:
      "Time-series track data for an activity: GPS, altitude, and heart rate/cadence/power/temperature where recorded. Downsampled to ~max_points evenly spaced samples.",
    inputSchema: {
      activity_id: z.string().describe("Activity id"),
      max_points: z
        .number()
        .int()
        .min(2)
        .max(10000)
        .optional()
        .describe("Maximum samples to return, evenly spaced over the track (default 200)"),
    },
  },
  ({ activity_id, max_points = 200 }) =>
    call(async () => {
      const [counter] = (await rows(
        `SELECT COUNT(*) AS n FROM activity_points WHERE activity_id = ?`,
        [activity_id],
      )) as [{ n: number }];
      if (counter.n === 0) {
        throw new Error(
          `No track points for activity ${activity_id} (manual entry, non-GPX file, or unknown id).`,
        );
      }
      const stride = Math.max(1, Math.ceil(counter.n / max_points));
      const points = await rows(
        `SELECT seq, time, lat, lon, altitude, heartrate, cadence, watts, temp
         FROM activity_points
         WHERE activity_id = ? AND seq % ? = 0
         ORDER BY seq`,
        [activity_id, stride],
      );
      return { total_points: counter.n, returned_points: points.length, points };
    }),
);

server.registerTool(
  "list_routes",
  {
    title: "List routes",
    description: "Saved routes from the export.",
    inputSchema: {},
  },
  () => call(() => rows(`SELECT * FROM routes ORDER BY name`)),
);

server.registerTool(
  "list_goals",
  {
    title: "List goals",
    description: "The athlete's distance/time goals from the export.",
    inputSchema: {},
  },
  () => call(() => rows(`SELECT * FROM goals ORDER BY start_date`)),
);

server.registerTool(
  "query",
  {
    title: "Run read-only SQL",
    description:
      "Run a read-only SELECT against the strava database for anything the other tools don't cover. " +
      "Tables: athlete, gear, activities (typed columns + raw `fields` JSON), " +
      "activity_points (activity_id, seq, time, lat, lon, altitude, heartrate, cadence, watts, temp), " +
      "routes, goals. Results are capped at 200 rows unless the query has its own LIMIT.",
    inputSchema: {
      sql: z.string().describe("A single SELECT (or WITH ... SELECT) statement"),
    },
  },
  ({ sql }) =>
    call(async () => {
      const trimmed = sql.trim().replace(/;\s*$/, "");
      if (!/^(select|with)\b/i.test(trimmed) || trimmed.includes(";")) {
        throw new Error("Only a single SELECT (or WITH ... SELECT) statement is allowed.");
      }
      const limited = /\blimit\s+\d+/i.test(trimmed) ? trimmed : `${trimmed} LIMIT 200`;
      return rows(limited);
    }),
);

const transport = new StdioServerTransport();
// The MySQL pool keeps the event loop alive after the client disconnects, so
// shut down when stdin closes. (transport.onclose can't be used here — the
// SDK's connect() replaces it.)
process.stdin.on("close", async () => {
  await pool.end().catch(() => {});
  process.exit(0);
});
await server.connect(transport);
console.error("strava-mcp serving MySQL-backed Strava export data on stdio");
