/**
 * Integration tests: run the extractor against the fixture export into a
 * separate `strava_test` database, then exercise the MCP server over stdio
 * against it. Requires the docker-compose MySQL to be running; the whole
 * suite skips (with a note) when it isn't, so unit tests still pass without
 * Docker.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { dbConfig } from "./db.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, "..");
const FIXTURE_DIR = path.join(REPO, "test", "fixtures", "export");
const TEST_DB = "strava_test";
const TEST_ENV = { ...process.env, MYSQL_DATABASE: TEST_DB };

let pool: mysql.Pool | null = null;
let mysqlAvailable = false;

before(async () => {
  // Create the test database with root credentials (compose defaults).
  try {
    const root = await mysql.createConnection({
      host: dbConfig().host,
      port: dbConfig().port,
      user: "root",
      password: process.env.MYSQL_ROOT_PASSWORD ?? "strava-root",
      connectTimeout: 3000,
    });
    await root.query(`CREATE DATABASE IF NOT EXISTS ${TEST_DB}`);
    await root.query(`GRANT ALL PRIVILEGES ON ${TEST_DB}.* TO '${dbConfig().user}'@'%'`);
    await root.query(`FLUSH PRIVILEGES`);
    await root.end();
    mysqlAvailable = true;
  } catch {
    mysqlAvailable = false;
    return;
  }
  execFileSync("node", [path.join(REPO, "dist", "extract.js"), FIXTURE_DIR], {
    env: TEST_ENV,
    stdio: "pipe",
  });
  pool = mysql.createPool({ ...dbConfig(), database: TEST_DB, connectionLimit: 2 });
});

after(async () => {
  await pool?.end();
});

function requireMysql(t: { skip: (msg: string) => void }): boolean {
  if (!mysqlAvailable) {
    t.skip("MySQL not reachable — start it with `docker compose up -d`");
    return false;
  }
  return true;
}

test("extract: loads fixture export into MySQL", async (t) => {
  if (!requireMysql(t)) return;
  const [acts] = (await pool!.query(
    `SELECT id, name, type, distance_m, commute FROM activities ORDER BY id`,
  )) as [Record<string, unknown>[], unknown];
  assert.equal(acts.length, 4);
  assert.equal(acts[0].name, "Test Morning Ride");
  assert.equal(acts[0].distance_m, 20000);
  assert.equal(acts[1].name, 'Ride with, comma "quoted"');
  assert.equal(acts[1].commute, 1);
  assert.equal(acts[2].type, "Run");

  const [[points]] = (await pool!.query(
    `SELECT COUNT(*) AS n FROM activity_points`,
  )) as unknown as [[{ n: number }]];
  assert.equal(points.n, 155); // 3 points in 100.gpx + 2 in 200.gpx + 150 in 400.gpx

  const [[hr]] = (await pool!.query(
    `SELECT heartrate, cadence FROM activity_points WHERE activity_id = 100 AND seq = 0`,
  )) as unknown as [[{ heartrate: number; cadence: number }]];
  assert.equal(hr.heartrate, 120);
  assert.equal(hr.cadence, 85);

  const [[athlete]] = (await pool!.query(`SELECT * FROM athlete`)) as unknown as [
    [Record<string, unknown>],
  ];
  assert.equal(athlete.first_name, "Test");
  assert.equal(athlete.city, "Testville, TS");

  // Media: activity 100 references two files, only one exists in the archive.
  const [mediaRows] = (await pool!.query(
    `SELECT activity_id, seq, filename, mime, OCTET_LENGTH(data) AS bytes FROM activity_media`,
  )) as [Record<string, unknown>[], unknown];
  assert.equal(mediaRows.length, 1);
  assert.equal(mediaRows[0].activity_id, 100);
  assert.equal(mediaRows[0].filename, "test-photo.jpg");
  assert.equal(mediaRows[0].mime, "image/jpeg");
  assert.ok(Number(mediaRows[0].bytes) > 0);
});

test("extract: re-running replaces data (idempotent)", async (t) => {
  if (!requireMysql(t)) return;
  execFileSync("node", [path.join(REPO, "dist", "extract.js"), FIXTURE_DIR], {
    env: TEST_ENV,
    stdio: "pipe",
  });
  const [[{ n }]] = (await pool!.query(
    `SELECT COUNT(*) AS n FROM activities`,
  )) as unknown as [[{ n: number }]];
  assert.equal(n, 4);
});

/** Spawn the MCP server, send JSON-RPC requests, collect responses by id. */
async function rpc(requests: object[]): Promise<Map<number, any>> {
  const child = spawn("node", [path.join(REPO, "dist", "index.js")], {
    env: TEST_ENV,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const wanted = new Set(
    requests.map((r) => (r as { id?: number }).id).filter((id): id is number => id !== undefined),
  );
  const responses = new Map<number, any>();

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MCP server response timeout")), 15000);
    let buf = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line);
        if (msg.id !== undefined) responses.set(msg.id, msg);
        if ([...wanted].every((id) => responses.has(id))) {
          clearTimeout(timer);
          resolve();
        }
      }
    });
    child.on("error", reject);
    child.on("exit", () => {
      clearTimeout(timer);
      if (![...wanted].every((id) => responses.has(id))) {
        reject(new Error("server exited before answering all requests"));
      }
    });
  });

  child.stdin.write(
    [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      ...requests.map((r) => JSON.stringify(r)),
      "",
    ].join("\n"),
  );

  try {
    await done;
  } finally {
    child.stdin.end();
    child.kill();
  }
  return responses;
}

const toolText = (msg: any): string => msg.result.content[0].text;

test("mcp server: lists all tools", async (t) => {
  if (!requireMysql(t)) return;
  const res = await rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  const names = res.get(1).result.tools.map((tool: { name: string }) => tool.name);
  assert.deepEqual(
    names.sort(),
    [
      "get_activity",
      "get_activity_streams",
      "get_athlete",
      "get_athlete_stats",
      "list_activities",
      "list_goals",
      "list_routes",
      "query",
    ],
  );
});

test("mcp server: tools return fixture data", async (t) => {
  if (!requireMysql(t)) return;
  const res = await rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_athlete", arguments: {} },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "list_activities", arguments: { type: "Ride" } },
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_activity_streams", arguments: { activity_id: "100" } },
    },
  ]);

  const athlete = JSON.parse(toolText(res.get(1)));
  assert.equal(athlete.profile.first_name, "Test");
  assert.equal(athlete.gear.length, 1);

  const list = JSON.parse(toolText(res.get(2)));
  assert.equal(list.total, 3);
  assert.equal(list.activities[0].id, 200); // most recent first

  const streams = JSON.parse(toolText(res.get(3)));
  assert.equal(streams.total_points, 3);
  assert.equal(streams.points[0].heartrate, 120);
});

test("mcp server: query tool runs SELECTs and rejects writes", async (t) => {
  if (!requireMysql(t)) return;
  const res = await rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "query",
        arguments: { sql: "SELECT type, COUNT(*) n FROM activities GROUP BY type ORDER BY n DESC" },
      },
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "query", arguments: { sql: "DELETE FROM activities" } },
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "query", arguments: { sql: "SELECT 1; DROP TABLE activities" } },
    },
  ]);

  const grouped = JSON.parse(toolText(res.get(1)));
  assert.deepEqual(grouped[0], { type: "Ride", n: 3 });

  assert.equal(res.get(2).result.isError, true);
  assert.match(toolText(res.get(2)), /Only a single SELECT/);
  assert.equal(res.get(3).result.isError, true);
});

test("mcp server: unknown activity id returns a tool error", async (t) => {
  if (!requireMysql(t)) return;
  const res = await rpc([
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_activity", arguments: { activity_id: "999999" } },
    },
  ]);
  assert.equal(res.get(1).result.isError, true);
  assert.match(toolText(res.get(1)), /No activity/);
});
