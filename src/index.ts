#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { StravaClient, StravaError } from "./strava.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing required environment variable ${name}. ` +
        `Run \`npm run auth\` to obtain a refresh token — see README.md.`,
    );
    process.exit(1);
  }
  return value;
}

const strava = new StravaClient({
  clientId: requireEnv("STRAVA_CLIENT_ID"),
  clientSecret: requireEnv("STRAVA_CLIENT_SECRET"),
  refreshToken: requireEnv("STRAVA_REFRESH_TOKEN"),
});

const server = new McpServer({
  name: "strava-mcp",
  version: "0.1.0",
});

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

async function call(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await fn();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    const message = err instanceof StravaError ? err.message : String(err);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

server.registerTool(
  "get_athlete",
  {
    title: "Get authenticated athlete",
    description:
      "Get the authenticated athlete's profile: name, location, weight, FTP, bikes and shoes.",
    inputSchema: {},
  },
  () => call(() => strava.get("/athlete")),
);

server.registerTool(
  "get_athlete_stats",
  {
    title: "Get athlete stats",
    description:
      "Get activity totals for an athlete: recent (last 4 weeks), year-to-date and all-time ride/run/swim totals. Use get_athlete first to find the athlete id.",
    inputSchema: {
      athlete_id: z.number().int().describe("Athlete id (from get_athlete)"),
    },
  },
  ({ athlete_id }) => call(() => strava.get(`/athletes/${athlete_id}/stats`)),
);

server.registerTool(
  "list_activities",
  {
    title: "List activities",
    description:
      "List the authenticated athlete's activities, most recent first. Supports date filtering and paging.",
    inputSchema: {
      before: z
        .number()
        .int()
        .optional()
        .describe("Unix epoch seconds; only activities before this time"),
      after: z
        .number()
        .int()
        .optional()
        .describe("Unix epoch seconds; only activities after this time"),
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Results per page, max 200 (default 30)"),
    },
  },
  (args) => call(() => strava.get("/athlete/activities", args)),
);

server.registerTool(
  "get_activity",
  {
    title: "Get activity",
    description:
      "Get a single activity in detail: splits, segment efforts, gear, description, photos.",
    inputSchema: {
      activity_id: z.number().int().describe("Activity id (from list_activities)"),
      include_all_efforts: z
        .boolean()
        .optional()
        .describe("Include all segment efforts (default false)"),
    },
  },
  ({ activity_id, include_all_efforts }) =>
    call(() =>
      strava.get(`/activities/${activity_id}`, { include_all_efforts }),
    ),
);

server.registerTool(
  "get_activity_streams",
  {
    title: "Get activity streams",
    description:
      "Get raw time-series data for an activity (heart rate, power, pace, altitude, GPS...). Streams can be large; request only the types you need.",
    inputSchema: {
      activity_id: z.number().int().describe("Activity id"),
      keys: z
        .array(
          z.enum([
            "time",
            "distance",
            "latlng",
            "altitude",
            "velocity_smooth",
            "heartrate",
            "cadence",
            "watts",
            "temp",
            "moving",
            "grade_smooth",
          ]),
        )
        .describe("Stream types to fetch"),
    },
  },
  ({ activity_id, keys }) =>
    call(() =>
      strava.get(`/activities/${activity_id}/streams`, {
        keys: keys.join(","),
        key_by_type: true,
      }),
    ),
);

server.registerTool(
  "get_activity_zones",
  {
    title: "Get activity zones",
    description:
      "Get heart rate and power zone distributions for an activity (requires a Strava subscription on the athlete's account).",
    inputSchema: {
      activity_id: z.number().int().describe("Activity id"),
    },
  },
  ({ activity_id }) => call(() => strava.get(`/activities/${activity_id}/zones`)),
);

server.registerTool(
  "list_starred_segments",
  {
    title: "List starred segments",
    description: "List segments starred by the authenticated athlete.",
    inputSchema: {
      page: z.number().int().min(1).optional().describe("Page number (default 1)"),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Results per page (default 30)"),
    },
  },
  (args) => call(() => strava.get("/segments/starred", args)),
);

server.registerTool(
  "get_segment",
  {
    title: "Get segment",
    description:
      "Get a segment in detail: distance, grade, elevation, athlete's PR effort.",
    inputSchema: {
      segment_id: z.number().int().describe("Segment id"),
    },
  },
  ({ segment_id }) => call(() => strava.get(`/segments/${segment_id}`)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("strava-mcp running on stdio");
