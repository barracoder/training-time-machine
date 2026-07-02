import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { parseCsv, csvToObjects } from "./csv.js";

export interface Activity {
  id: string;
  /** UTC start time, null if unparseable */
  date: Date | null;
  name: string;
  type: string;
  fields: Record<string, string>;
}

export interface StreamPoint {
  time: string;
  lat?: number;
  lon?: number;
  altitude?: number;
  heartrate?: number;
  cadence?: number;
  watts?: number;
  temp?: number;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Export dates look like "Jul 2, 2026, 5:03:49 PM" and are UTC. */
export function parseExportDate(s: string): Date | null {
  const m = s.match(/^(\w{3}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/);
  if (!m) return null;
  const month = MONTHS[m[1]];
  if (month === undefined) return null;
  let hour = Number(m[4]) % 12;
  if (m[7] === "PM") hour += 12;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[2]), hour, Number(m[5]), Number(m[6])));
}

/** Drop empty values so tool output only carries populated fields. */
export function nonEmpty(fields: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, v]) => v !== "" && v !== "\"\""),
  );
}

export class StravaExport {
  readonly dir: string;
  readonly activities: Activity[];

  constructor(dir: string) {
    this.dir = dir;
    if (!fs.existsSync(path.join(dir, "activities.csv"))) {
      throw new Error(
        `${dir} does not look like an extracted Strava export (no activities.csv). ` +
          `Unzip your export from https://www.strava.com/athlete/delete_your_account there, ` +
          `or point STRAVA_EXPORT_DIR at it.`,
      );
    }
    this.activities = this.readCsv("activities.csv")
      .map((fields) => ({
        id: fields["Activity ID"],
        date: parseExportDate(fields["Activity Date"]),
        name: fields["Activity Name"],
        type: fields["Activity Type"],
        fields,
      }))
      .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  }

  readCsv(file: string): Record<string, string>[] {
    const full = path.join(this.dir, file);
    if (!fs.existsSync(full)) return [];
    return csvToObjects(parseCsv(fs.readFileSync(full, "utf8")));
  }

  findActivity(id: string): Activity | undefined {
    return this.activities.find((a) => a.id === id);
  }

  /**
   * Parse the activity's GPX track into stream points. Handles .gpx and
   * gzipped files; .fit files are not supported.
   */
  readStreams(activity: Activity): StreamPoint[] {
    const filename = activity.fields["Filename"];
    if (!filename) {
      throw new Error(`Activity ${activity.id} has no track file (manual or trainer entry).`);
    }
    const full = path.join(this.dir, filename);
    if (!fs.existsSync(full)) throw new Error(`Track file missing from export: ${filename}`);

    let content: string;
    if (filename.endsWith(".gz")) {
      content = zlib.gunzipSync(fs.readFileSync(full)).toString("utf8");
    } else if (filename.endsWith(".fit")) {
      throw new Error(
        `Activity ${activity.id} is stored as a binary FIT file (${filename}); only GPX parsing is supported.`,
      );
    } else {
      content = fs.readFileSync(full, "utf8");
    }
    if (!content.includes("<gpx")) {
      throw new Error(`Track file ${filename} is not GPX; only GPX parsing is supported.`);
    }

    const points: StreamPoint[] = [];
    const trkptRe = /<trkpt lat="([-\d.]+)" lon="([-\d.]+)">([\s\S]*?)<\/trkpt>/g;
    let m: RegExpExecArray | null;
    while ((m = trkptRe.exec(content)) !== null) {
      const inner = m[3];
      const tag = (name: string): string | undefined =>
        inner.match(new RegExp(`<${name}>([^<]+)</${name}>`))?.[1];
      const point: StreamPoint = {
        time: tag("time") ?? "",
        lat: Number(m[1]),
        lon: Number(m[2]),
      };
      const ele = tag("ele");
      if (ele !== undefined) point.altitude = Number(ele);
      const hr = tag("gpxtpx:hr");
      if (hr !== undefined) point.heartrate = Number(hr);
      const cad = tag("gpxtpx:cad");
      if (cad !== undefined) point.cadence = Number(cad);
      const watts = tag("power");
      if (watts !== undefined) point.watts = Number(watts);
      const temp = tag("gpxtpx:atemp");
      if (temp !== undefined) point.temp = Number(temp);
      points.push(point);
    }
    return points;
  }
}
