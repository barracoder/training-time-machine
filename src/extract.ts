#!/usr/bin/env node
/**
 * Load a Strava bulk-export archive into MySQL.
 *
 * Usage: node dist/extract.js <strava-export.zip | extracted-dir>
 *
 * Drops and recreates the strava tables, so re-running with a newer export
 * replaces the data. MySQL connection comes from src/db.ts env defaults
 * (matching docker-compose.yml).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
import { dbConfig } from "./db.js";
import { StravaExport, parseExportDate, type Activity } from "./export.js";

const input = process.argv[2];
if (!input) {
  console.error("Usage: node dist/extract.js <strava-export.zip | extracted-dir>");
  process.exit(1);
}

let dir = input;
let tempDir: string | null = null;
if (input.endsWith(".zip")) {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "strava-export-"));
  console.log(`Extracting ${input} ...`);
  execFileSync("unzip", ["-oq", input, "-d", tempDir]);
  dir = tempDir;
}

const data = new StravaExport(dir);
console.log(`Export loaded: ${data.activities.length} activities`);

const toNum = (s: string | undefined): number | null =>
  s === undefined || s === "" || Number.isNaN(Number(s)) ? null : Number(s);

const toDateTime = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 19).replace("T", " ") : null;

/** Meters; the second Distance column is meters, the first is km. */
function distanceMeters(a: Activity): number | null {
  const detailed = toNum(a.fields["Distance 2"]);
  if (detailed !== null) return detailed;
  const km = toNum(a.fields["Distance"]);
  return km === null ? null : km * 1000;
}

const SCHEMA = `
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

// --- athlete + gear ---
const profile = data.readCsv("profile.csv")[0];
if (profile) {
  await conn.execute(
    `INSERT INTO athlete (id, email, first_name, last_name, sex, weight, city, state, country)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      toNum(profile["Athlete ID"]),
      profile["Email Address"] || null,
      profile["First Name"] || null,
      profile["Last Name"] || null,
      profile["Sex"] || null,
      toNum(profile["Weight"]),
      profile["City"] || null,
      profile["State"] || null,
      profile["Country"] || null,
    ],
  );
}

for (const [file, kind, prefix] of [
  ["bikes.csv", "bike", "Bike"],
  ["shoes.csv", "shoe", "Shoe"],
] as const) {
  for (const row of data.readCsv(file)) {
    await conn.execute(
      `INSERT INTO gear (name, kind, brand, model, default_sport_types) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE kind = VALUES(kind)`,
      [
        row[`${prefix} Name`],
        kind,
        row[`${prefix} Brand`] || null,
        row[`${prefix} Model`] || null,
        row[`${prefix} Default Sport Types`] || null,
      ],
    );
  }
}
console.log("Athlete and gear loaded");

// --- activities ---
for (const a of data.activities) {
  await conn.execute(
    `INSERT INTO activities (id, start_time, name, type, description, distance_m, moving_time_s,
       elapsed_time_s, elevation_gain_m, elevation_loss_m, average_speed_ms, max_speed_ms,
       average_heartrate, max_heartrate, average_watts, max_watts, average_cadence, calories,
       gear, commute, filename, fields)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      toNum(a.id),
      toDateTime(a.date),
      a.name || null,
      a.type || null,
      a.fields["Activity Description"] || null,
      distanceMeters(a),
      toNum(a.fields["Moving Time"]),
      toNum(a.fields["Elapsed Time"]),
      toNum(a.fields["Elevation Gain"]),
      toNum(a.fields["Elevation Loss"]),
      toNum(a.fields["Average Speed"]),
      toNum(a.fields["Max Speed"]),
      toNum(a.fields["Average Heart Rate"]),
      toNum(a.fields["Max Heart Rate"]) ?? toNum(a.fields["Max Heart Rate 2"]),
      toNum(a.fields["Average Watts"]),
      toNum(a.fields["Max Watts"]),
      toNum(a.fields["Average Cadence"]),
      toNum(a.fields["Calories"]),
      a.fields["Activity Gear"] || null,
      a.fields["Commute"] === "true",
      a.fields["Filename"] || null,
      JSON.stringify(Object.fromEntries(Object.entries(a.fields).filter(([, v]) => v !== ""))),
    ],
  );
}
console.log(`${data.activities.length} activities loaded`);

// --- activity points (GPX streams) ---
let totalPoints = 0;
let skipped = 0;
for (const a of data.activities) {
  if (!a.fields["Filename"]) continue;
  let points;
  try {
    points = data.readStreams(a);
  } catch {
    skipped++;
    continue;
  }
  const BATCH = 1000;
  for (let start = 0; start < points.length; start += BATCH) {
    const batch = points.slice(start, start + BATCH);
    const values = batch.map((p, i) => [
      toNum(a.id),
      start + i,
      p.time ? p.time.replace("T", " ").replace("Z", "") : null,
      p.lat ?? null,
      p.lon ?? null,
      p.altitude ?? null,
      p.heartrate ?? null,
      p.cadence ?? null,
      p.watts ?? null,
      p.temp ?? null,
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
  `${totalPoints} track points loaded${skipped ? ` (${skipped} activities skipped: non-GPX track files)` : ""}`,
);

// --- routes + goals ---
for (const r of data.readCsv("routes.csv")) {
  await conn.execute(`INSERT INTO routes (name, filename) VALUES (?, ?)`, [
    r["Route Name"] || null,
    r["Route Filename"] || null,
  ]);
}
for (const g of data.readCsv("goals.csv")) {
  await conn.execute(
    `INSERT INTO goals (goal_type, activity_type, goal, start_date, end_date, time_period)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      g["Goal Type"] || null,
      g["Activity Type"] || null,
      toNum(g["Goal"]),
      toDateTime(parseExportDate(g["Start Date"] ?? "")),
      toDateTime(parseExportDate(g["End Date"] ?? "")),
      g["Time Period"] || null,
    ],
  );
}
console.log("Routes and goals loaded");

await conn.end();
if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
console.log("Done.");
