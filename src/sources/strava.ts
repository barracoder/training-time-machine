/** Strava bulk-export adapter: normalizes a Strava archive into SourceData. */
import fs from "node:fs";
import path from "node:path";
import { StravaExport, parseExportDate, type Activity as ExportActivity } from "../export.js";
import type { Activity, SourceData, TrainingDataSource } from "./types.js";

const toNum = (s: string | undefined): number | null =>
  s === undefined || s === "" || Number.isNaN(Number(s)) ? null : Number(s);

const toDateTime = (d: Date | null): string | null =>
  d ? d.toISOString().slice(0, 19).replace("T", " ") : null;

/** Meters; the second Distance column is meters, the first is km. */
function distanceMeters(a: ExportActivity): number | null {
  const detailed = toNum(a.fields["Distance 2"]);
  if (detailed !== null) return detailed;
  const km = toNum(a.fields["Distance"]);
  return km === null ? null : km * 1000;
}

function normalizeActivity(a: ExportActivity): Activity {
  return {
    id: toNum(a.id),
    startTime: a.date,
    name: a.name || null,
    type: a.type || null,
    description: a.fields["Activity Description"] || null,
    distanceM: distanceMeters(a),
    movingTimeS: toNum(a.fields["Moving Time"]),
    elapsedTimeS: toNum(a.fields["Elapsed Time"]),
    elevationGainM: toNum(a.fields["Elevation Gain"]),
    elevationLossM: toNum(a.fields["Elevation Loss"]),
    averageSpeedMs: toNum(a.fields["Average Speed"]),
    maxSpeedMs: toNum(a.fields["Max Speed"]),
    averageHeartrate: toNum(a.fields["Average Heart Rate"]),
    maxHeartrate: toNum(a.fields["Max Heart Rate"]) ?? toNum(a.fields["Max Heart Rate 2"]),
    averageWatts: toNum(a.fields["Average Watts"]),
    maxWatts: toNum(a.fields["Max Watts"]),
    averageCadence: toNum(a.fields["Average Cadence"]),
    calories: toNum(a.fields["Calories"]),
    gear: a.fields["Activity Gear"] || null,
    commute: a.fields["Commute"] === "true",
    filename: a.fields["Filename"] || null,
    raw: Object.fromEntries(Object.entries(a.fields).filter(([, v]) => v !== "")),
  };
}

export const stravaSource: TrainingDataSource = {
  name: "strava",

  detect(dir: string): boolean {
    return fs.existsSync(path.join(dir, "activities.csv"));
  },

  load(dir: string): SourceData {
    const data = new StravaExport(dir);
    const byId = new Map(data.activities.map((a) => [a.id, a]));

    const profile = data.readCsv("profile.csv")[0];
    const gear = (
      [
        ["bikes.csv", "bike", "Bike"],
        ["shoes.csv", "shoe", "Shoe"],
      ] as const
    ).flatMap(([file, kind, prefix]) =>
      data.readCsv(file).map((row) => ({
        name: row[`${prefix} Name`],
        kind,
        brand: row[`${prefix} Brand`] || null,
        model: row[`${prefix} Model`] || null,
        defaultSportTypes: row[`${prefix} Default Sport Types`] || null,
      })),
    );

    return {
      athlete: profile
        ? {
            id: toNum(profile["Athlete ID"]),
            email: profile["Email Address"] || null,
            firstName: profile["First Name"] || null,
            lastName: profile["Last Name"] || null,
            sex: profile["Sex"] || null,
            weight: toNum(profile["Weight"]),
            city: profile["City"] || null,
            state: profile["State"] || null,
            country: profile["Country"] || null,
          }
        : null,
      gear,
      activities: data.activities.map(normalizeActivity),
      routes: data.readCsv("routes.csv").map((r) => ({
        name: r["Route Name"] || null,
        filename: r["Route Filename"] || null,
      })),
      goals: data.readCsv("goals.csv").map((g) => ({
        goalType: g["Goal Type"] || null,
        activityType: g["Activity Type"] || null,
        goal: toNum(g["Goal"]),
        startDate: toDateTime(parseExportDate(g["Start Date"] ?? "")),
        endDate: toDateTime(parseExportDate(g["End Date"] ?? "")),
        timePeriod: g["Time Period"] || null,
      })),
      readPoints(activity: Activity): import("./types.js").TrackPoint[] {
        const source = byId.get(String(activity.id));
        if (!source) throw new Error(`Unknown activity ${activity.id}`);
        return data.readStreams(source).map((p) => ({
          time: p.time ? p.time.replace("T", " ").replace("Z", "") : null,
          lat: p.lat ?? null,
          lon: p.lon ?? null,
          altitude: p.altitude ?? null,
          heartrate: p.heartrate ?? null,
          cadence: p.cadence ?? null,
          watts: p.watts ?? null,
          temp: p.temp ?? null,
        }));
      },
    };
  },
};
