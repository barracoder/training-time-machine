#!/usr/bin/env node
/**
 * Load a training-data export archive into MySQL.
 *
 * Usage: node dist/extract.js <export.zip | extracted-dir>
 *
 * The provider is auto-detected from the archive contents (see
 * src/sources/ — Strava's bulk export is the built-in source; add adapters
 * there to support others). Drops and recreates the tables, so re-running
 * with a newer export replaces the data. MySQL connection comes from
 * src/db.ts env defaults (matching docker-compose.yml).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { dbConfig } from "./db.js";
import { detectSource } from "./sources/index.js";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node dist/extract.js <export.zip | extracted-dir>");
  process.exit(1);
}

let dir = input;
let tempDir: string | null = null;
if (input.endsWith(".zip")) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "training-export-"));
  console.log(`Extracting ${input} ...`);
  if (process.platform === "win32") {
    execFileSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      `Expand-Archive -LiteralPath '${input}' -DestinationPath '${tempDir}' -Force`,
    ]);
  } else {
    execFileSync("unzip", ["-oq", input, "-d", tempDir]);
  }
  dir = tempDir;
}

const source = detectSource(dir);
console.log(`Detected source: ${source.name}`);
const data = source.load(dir);
console.log(`Export loaded: ${data.activities.length} activities`);

const toDateTime = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 19).replace("T", " ") : null;

const SCHEMA = `
DROP TABLE IF EXISTS activity_media;
DROP TABLE IF EXISTS activity_points;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS athlete;
DROP TABLE IF EXISTS gear;
DROP TABLE IF EXISTS routes;
DROP TABLE IF EXISTS goals;

CREATE TABLE athlete (
  id BIGINT PRIMARY KEY,
  email VARCHAR(255),
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  sex VARCHAR(32),
  weight DOUBLE,
  city VARCHAR(255),
  state VARCHAR(255),
  country VARCHAR(255)
);

CREATE TABLE gear (
  name VARCHAR(255) PRIMARY KEY,
  kind ENUM('bike', 'shoe') NOT NULL,
  brand VARCHAR(255),
  model VARCHAR(255),
  default_sport_types VARCHAR(255)
);

CREATE TABLE activities (
  id BIGINT PRIMARY KEY,
  start_time DATETIME,
  name VARCHAR(512),
  type VARCHAR(64),
  description TEXT,
  distance_m DOUBLE,
  moving_time_s DOUBLE,
  elapsed_time_s DOUBLE,
  elevation_gain_m DOUBLE,
  elevation_loss_m DOUBLE,
  average_speed_ms DOUBLE,
  max_speed_ms DOUBLE,
  average_heartrate DOUBLE,
  max_heartrate DOUBLE,
  average_watts DOUBLE,
  max_watts DOUBLE,
  average_cadence DOUBLE,
  calories DOUBLE,
  gear VARCHAR(255),
  commute BOOLEAN,
  filename VARCHAR(255),
  fields JSON,
  INDEX idx_start_time (start_time),
  INDEX idx_type (type)
);

CREATE TABLE activity_points (
  activity_id BIGINT NOT NULL,
  seq INT NOT NULL,
  time DATETIME,
  lat DOUBLE,
  lon DOUBLE,
  altitude DOUBLE,
  heartrate DOUBLE,
  cadence DOUBLE,
  watts DOUBLE,
  temp DOUBLE,
  PRIMARY KEY (activity_id, seq)
);

CREATE TABLE activity_media (
  activity_id BIGINT NOT NULL,
  seq INT NOT NULL,
  filename VARCHAR(255),
  mime VARCHAR(64),
  data LONGBLOB,
  PRIMARY KEY (activity_id, seq)
);

CREATE TABLE routes (
  name VARCHAR(255),
  filename VARCHAR(255)
);

CREATE TABLE goals (
  goal_type VARCHAR(64),
  activity_type VARCHAR(64),
  goal DOUBLE,
  start_date DATETIME,
  end_date DATETIME,
  time_period VARCHAR(32)
);
`;

const conn = await mysql.createConnection({ ...dbConfig(), multipleStatements: true });
await conn.query(SCHEMA);
console.log("Schema created");

if (data.athlete) {
  const a = data.athlete;
  await conn.execute(
    `INSERT INTO athlete (id, email, first_name, last_name, sex, weight, city, state, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [a.id, a.email, a.firstName, a.lastName, a.sex, a.weight, a.city, a.state, a.country],
  );
}

for (const g of data.gear) {
  await conn.execute(
    `INSERT INTO gear (name, kind, brand, model, default_sport_types) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE kind = VALUES(kind)`,
    [g.name, g.kind, g.brand, g.model, g.defaultSportTypes],
  );
}
console.log("Athlete and gear loaded");

for (const a of data.activities) {
  await conn.execute(
    `INSERT INTO activities (id, start_time, name, type, description, distance_m, moving_time_s,
       elapsed_time_s, elevation_gain_m, elevation_loss_m, average_speed_ms, max_speed_ms,
       average_heartrate, max_heartrate, average_watts, max_watts, average_cadence, calories,
       gear, commute, filename, fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.id,
      toDateTime(a.startTime),
      a.name,
      a.type,
      a.description,
      a.distanceM,
      a.movingTimeS,
      a.elapsedTimeS,
      a.elevationGainM,
      a.elevationLossM,
      a.averageSpeedMs,
      a.maxSpeedMs,
      a.averageHeartrate,
      a.maxHeartrate,
      a.averageWatts,
      a.maxWatts,
      a.averageCadence,
      a.calories,
      a.gear,
      a.commute,
      a.filename,
      JSON.stringify(a.raw),
    ],
  );
}
console.log(`${data.activities.length} activities loaded`);

let totalPoints = 0;
let skipped = 0;
for (const a of data.activities) {
  if (!a.filename) continue;
  let points;
  try {
    points = data.readPoints(a);
  } catch {
    skipped++;
    continue;
  }
  const BATCH = 1000;
  for (let start = 0; start < points.length; start += BATCH) {
    const values = points
      .slice(start, start + BATCH)
      .map((p, i) => [
        a.id,
        start + i,
        p.time,
        p.lat,
        p.lon,
        p.altitude,
        p.heartrate,
        p.cadence,
        p.watts,
        p.temp,
      ]);
    await conn.query(
      `INSERT INTO activity_points
         (activity_id, seq, time, lat, lon, altitude, heartrate, cadence, watts, temp)
       VALUES ?`,
      [values],
    );
  }
  totalPoints += points.length;
}
console.log(
  `${totalPoints} track points loaded${skipped ? ` (${skipped} activities skipped: unsupported track files)` : ""}`,
);

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};

let mediaLoaded = 0;
let mediaMissing = 0;
for (const a of data.activities) {
  for (let i = 0; i < a.media.length; i++) {
    const relPath = a.media[i];
    let bytes;
    try {
      bytes = data.readMedia(relPath);
    } catch {
      mediaMissing++;
      continue;
    }
    const ext = path.extname(relPath).toLowerCase();
    await conn.execute(
      `INSERT INTO activity_media (activity_id, seq, filename, mime, data) VALUES (?, ?, ?, ?, ?)`,
      [a.id, i, path.basename(relPath), MIME_BY_EXT[ext] ?? "application/octet-stream", bytes],
    );
    mediaLoaded++;
  }
}
console.log(
  `${mediaLoaded} media files loaded${mediaMissing ? ` (${mediaMissing} missing from archive)` : ""}`,
);

for (const r of data.routes) {
  await conn.execute(`INSERT INTO routes (name, filename) VALUES (?, ?)`, [r.name, r.filename]);
}
for (const g of data.goals) {
  await conn.execute(
    `INSERT INTO goals (goal_type, activity_type, goal, start_date, end_date, time_period)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [g.goalType, g.activityType, g.goal, g.startDate, g.endDate, g.timePeriod],
  );
}
console.log("Routes and goals loaded");

await conn.end();
if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
console.log("Done.");
