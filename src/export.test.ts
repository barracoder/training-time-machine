import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StravaExport, parseExportDate, nonEmpty } from "./export.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "test",
  "fixtures",
  "export",
);

test("parseExportDate: PM time is UTC", () => {
  assert.equal(
    parseExportDate("Jul 2, 2026, 5:03:49 PM")?.toISOString(),
    "2026-07-02T17:03:49.000Z",
  );
});

test("parseExportDate: 12 AM is midnight, 12 PM is noon", () => {
  assert.equal(
    parseExportDate("Jan 1, 2020, 12:15:00 AM")?.toISOString(),
    "2020-01-01T00:15:00.000Z",
  );
  assert.equal(
    parseExportDate("Jan 1, 2020, 12:15:00 PM")?.toISOString(),
    "2020-01-01T12:15:00.000Z",
  );
});

test("parseExportDate: invalid input returns null", () => {
  assert.equal(parseExportDate(""), null);
  assert.equal(parseExportDate("2026-07-02"), null);
  assert.equal(parseExportDate("Xxx 2, 2026, 5:03:49 PM"), null);
});

test("nonEmpty drops empty values", () => {
  assert.deepEqual(nonEmpty({ a: "1", b: "", c: "x" }), { a: "1", c: "x" });
});

test("StravaExport: loads and sorts activities most recent first", () => {
  const data = new StravaExport(FIXTURE_DIR);
  assert.equal(data.activities.length, 4);
  assert.deepEqual(
    data.activities.map((a) => a.id),
    ["200", "100", "400", "300"],
  );
  assert.equal(data.activities[1].name, "Test Morning Ride");
  assert.equal(data.activities[3].type, "Run");
});

test("StravaExport: duplicate Distance column exposed with suffix", () => {
  const data = new StravaExport(FIXTURE_DIR);
  const a = data.findActivity("100")!;
  assert.equal(a.fields["Distance"], "20.00");
  assert.equal(a.fields["Distance 2"], "20000.0");
});

test("StravaExport: rejects a directory that is not an export", () => {
  assert.throws(() => new StravaExport("/tmp"), /activities\.csv/);
});

test("readStreams: parses GPX points including extensions", () => {
  const data = new StravaExport(FIXTURE_DIR);
  const points = data.readStreams(data.findActivity("100")!);
  assert.equal(points.length, 3);
  assert.deepEqual(points[0], {
    time: "2026-06-01T10:00:00Z",
    lat: 51.5,
    lon: -0.1,
    altitude: 10.0,
    heartrate: 120,
    cadence: 85,
  });
  assert.equal(points[2].heartrate, 128);
});

test("readStreams: GPX without extensions has no heartrate", () => {
  const data = new StravaExport(FIXTURE_DIR);
  const points = data.readStreams(data.findActivity("200")!);
  assert.equal(points.length, 2);
  assert.equal(points[0].heartrate, undefined);
  assert.equal(points[0].altitude, 5.0);
});

test("readStreams: activity without a track file throws", () => {
  const data = new StravaExport(FIXTURE_DIR);
  assert.throws(() => data.readStreams(data.findActivity("300")!), /no track file/);
});
