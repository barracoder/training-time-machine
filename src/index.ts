#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StravaExport, nonEmpty, type Activity } from "./export.js";

const defaultDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const exportDir = process.argv[2] ?? process.env.STRAVA_EXPORT_DIR ?? defaultDir;

let data: StravaExport;
try {
  data = new StravaExport(exportDir);
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const server = new McpServer({
  name: "strava-mcp",
  version: "0.2.0",
});

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function call(fn: () => unknown): ToolResult {
  try {
    const result = fn();
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

const num = (s: string | undefined): number => (s ? Number(s) : 0);

/** Meters; the second Distance column is meters, the first is km. */
function distanceMeters(a: Activity): number {
  const detailed = a.fields["Distance 2"];
  if (detailed) return num(detailed);
  return num(a.fields["Distance"]) * 1000;
}

function summarize(a: Activity) {
  return nonEmpty({
    id: a.id,
    date: a.date?.toISOString() ?? a.fields["Activity Date"],
    name: a.name,
    type: a.type,
    distance_m: distanceMeters(a) ? String(Math.round(distanceMeters(a))) : "",
    moving_time_s: a.fields["Moving Time"],
    elapsed_time_s: a.fields["Elapsed Time"],
    elevation_gain_m: a.fields["Elevation Gain"],
    average_speed_ms: a.fields["Average Speed"],
    average_heart_rate: a.fields["Average Heart Rate"],
    gear: a.fields["Activity Gear"],
    has_track: a.fields["Filename"] ? "true" : "",
  });
}

server.registerTool(
  "get_athlete",
  {
    title: "Get athlete",
    description: "The athlete's profile from the export: name, location, weight, plus bikes and shoes.",
    inputSchema: {},
  },
  () =>
    call(() => ({
      profile: data.readCsv("profile.csv").map(nonEmpty)[0] ?? {},
      bikes: data.readCsv("bikes.csv").map(nonEmpty),
      shoes: data.readCsv("shoes.csv").map(nonEmpty),
    })),
);

server.registerTool(
  "get_athlete_stats",
  {
    title: "Get athlete stats",
    description:
      "Totals per activity type (count, distance, moving time, elevation gain) for the last 4 weeks, year to date, and all time — computed from the export.",
    inputSchema: {},
  },
  () =>
    call(() => {
      const now = Date.now();
      const fourWeeksAgo = now - 28 * 24 * 3600 * 1000;
      const yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);

      const aggregate = (filter: (a: Activity) => boolean) => {
        const byType: Record<
          string,
          { count: number; distance_km: number; moving_time_h: number; elevation_gain_m: number }
        > = {};
        for (const a of data.activities) {
          if (!filter(a)) continue;
          const t = (byType[a.type] ??= {
            count: 0,
            distance_km: 0,
            moving_time_h: 0,
            elevation_gain_m: 0,
          });
          t.count++;
          t.distance_km += distanceMeters(a) / 1000;
          t.moving_time_h += num(a.fields["Moving Time"]) / 3600;
          t.elevation_gain_m += num(a.fields["Elevation Gain"]);
        }
        for (const t of Object.values(byType)) {
          t.distance_km = Math.round(t.distance_km * 10) / 10;
          t.moving_time_h = Math.round(t.moving_time_h * 10) / 10;
          t.elevation_gain_m = Math.round(t.elevation_gain_m);
        }
        return byType;
      };

      return {
        recent_4_weeks: aggregate((a) => (a.date?.getTime() ?? 0) >= fourWeeksAgo),
        year_to_date: aggregate((a) => (a.date?.getTime() ?? 0) >= yearStart),
        all_time: aggregate(() => true),
      };
    }),
);

server.registerTool(
  "list_activities",
  {
    title: "List activities",
    description:
      "List activities from the export, most recent first, with date/type/name filtering and paging.",
    inputSchema: {
      after: z
        .string()
        .optional()
        .describe("ISO date (e.g. 2026-01-01); only activities on or after this date"),
      before: z.string().optional().describe("ISO date; only activities before this date"),
      type: z.string().optional().describe('Activity type filter, e.g. "Ride", "Run", "Walk"'),
      query: z.string().optional().describe("Case-insensitive substring match on activity name"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      per_page: z.number().int().min(1).max(200).optional().describe("Results per page (default 30)"),
    },
  },
  ({ after, before, type, query, page = 1, per_page = 30 }) =>
    call(() => {
      let list = data.activities;
      if (after) {
        const t = Date.parse(after);
        list = list.filter((a) => (a.date?.getTime() ?? 0) >= t);
      }
      if (before) {
        const t = Date.parse(before);
        list = list.filter((a) => (a.date?.getTime() ?? 0) < t);
      }
      if (type) list = list.filter((a) => a.type.toLowerCase() === type.toLowerCase());
      if (query) {
        const q = query.toLowerCase();
        list = list.filter((a) => a.name.toLowerCase().includes(q));
      }
      const start = (page - 1) * per_page;
      return {
        total: list.length,
        page,
        activities: list.slice(start, start + per_page).map(summarize),
      };
    }),
);

server.registerTool(
  "get_activity",
  {
    title: "Get activity",
    description:
      "All recorded fields for one activity: times, speeds, elevation, power, weather, gear, etc. Duplicated export columns are suffixed with \" 2\" (the detailed block; e.g. \"Distance\" is km, \"Distance 2\" is meters).",
    inputSchema: {
      activity_id: z.string().describe("Activity id (from list_activities)"),
    },
  },
  ({ activity_id }) =>
    call(() => {
      const a = data.findActivity(activity_id);
      if (!a) throw new Error(`No activity with id ${activity_id} in the export.`);
      return { ...nonEmpty(a.fields), date_utc: a.date?.toISOString() };
    }),
);

server.registerTool(
  "get_activity_streams",
  {
    title: "Get activity streams",
    description:
      "Time-series track data for an activity parsed from its GPX file: GPS, altitude, and heart rate/cadence/power/temperature where recorded. Downsampled to max_points evenly spaced samples.",
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
    call(() => {
      const a = data.findActivity(activity_id);
      if (!a) throw new Error(`No activity with id ${activity_id} in the export.`);
      const points = data.readStreams(a);
      const stride = Math.max(1, Math.ceil(points.length / max_points));
      const sampled = points.filter((_, i) => i % stride === 0);
      return { total_points: points.length, returned_points: sampled.length, points: sampled };
    }),
);

server.registerTool(
  "list_routes",
  {
    title: "List routes",
    description: "Saved routes in the export.",
    inputSchema: {},
  },
  () => call(() => data.readCsv("routes.csv").map(nonEmpty)),
);

server.registerTool(
  "list_goals",
  {
    title: "List goals",
    description: "The athlete's distance/time goals from the export.",
    inputSchema: {},
  },
  () => call(() => data.readCsv("goals.csv").map(nonEmpty)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`strava-mcp serving export at ${exportDir} (${data.activities.length} activities)`);
