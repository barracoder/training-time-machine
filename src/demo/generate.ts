#!/usr/bin/env node
/**
 * Generate a synthetic training-data export for demos and screenshots:
 * a fictional rider who commutes Wilmslow -> central Manchester on
 * weekdays, with occasional weekend loops. Entirely fabricated data —
 * safe to publish.
 *
 * Usage: node dist/demo/generate.js [output-dir]   (default /tmp/demo-export)
 *
 * The output is a Strava-bulk-export-shaped directory; import it with:
 *   MYSQL_DATABASE=demo node dist/extract.js <output-dir>
 */
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] ?? "/tmp/demo-export";

/** Deterministic PRNG (mulberry32) so the demo is reproducible. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260702);

interface Anchor {
  lat: number;
  lon: number;
  ele: number;
}

// Wilmslow station -> A34 corridor -> Didsbury -> Oxford Road -> city centre
const COMMUTE: Anchor[] = [
  { lat: 53.3269, lon: -2.2295, ele: 88 },
  { lat: 53.3355, lon: -2.2245, ele: 84 },
  { lat: 53.348, lon: -2.217, ele: 80 },
  { lat: 53.356, lon: -2.211, ele: 78 },
  { lat: 53.3705, lon: -2.209, ele: 72 },
  { lat: 53.3835, lon: -2.2115, ele: 66 },
  { lat: 53.3946, lon: -2.2138, ele: 60 },
  { lat: 53.4035, lon: -2.2225, ele: 55 },
  { lat: 53.409, lon: -2.232, ele: 52 },
  { lat: 53.416, lon: -2.226, ele: 48 },
  { lat: 53.4245, lon: -2.231, ele: 46 },
  { lat: 53.4315, lon: -2.2295, ele: 45 },
  { lat: 53.437, lon: -2.228, ele: 44 },
  { lat: 53.4435, lon: -2.224, ele: 43 },
  { lat: 53.4505, lon: -2.2215, ele: 42 },
  { lat: 53.4595, lon: -2.2255, ele: 41 },
  { lat: 53.466, lon: -2.233, ele: 40 },
  { lat: 53.4725, lon: -2.2395, ele: 39 },
  { lat: 53.478, lon: -2.244, ele: 38 },
  { lat: 53.4794, lon: -2.2453, ele: 38 },
];

// Weekend loop: Wilmslow -> Alderley Edge -> Mottram St Andrew -> Prestbury -> back
const WEEKEND: Anchor[] = [
  { lat: 53.3269, lon: -2.2295, ele: 88 },
  { lat: 53.3155, lon: -2.2295, ele: 95 },
  { lat: 53.304, lon: -2.238, ele: 105 },
  { lat: 53.2975, lon: -2.2245, ele: 125 },
  { lat: 53.2925, lon: -2.2045, ele: 150 },
  { lat: 53.2975, lon: -2.187, ele: 135 },
  { lat: 53.289, lon: -2.168, ele: 120 },
  { lat: 53.2825, lon: -2.1495, ele: 110 },
  { lat: 53.29, lon: -2.135, ele: 118 },
  { lat: 53.3035, lon: -2.144, ele: 100 },
  { lat: 53.3125, lon: -2.163, ele: 95 },
  { lat: 53.3095, lon: -2.185, ele: 98 },
  { lat: 53.316, lon: -2.207, ele: 92 },
  { lat: 53.3225, lon: -2.2215, ele: 90 },
  { lat: 53.3269, lon: -2.2295, ele: 88 },
];

const EARTH_M = 111320;
function distMeters(a: Anchor, b: Anchor): number {
  const dLat = (b.lat - a.lat) * EARTH_M;
  const dLon = (b.lon - a.lon) * EARTH_M * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

interface Point {
  lat: number;
  lon: number;
  ele: number;
  t: number; // seconds from start
  hr: number;
}

/** Interpolate anchors into a jittered GPS track with realistic pacing. */
function makeTrack(anchors: Anchor[], reverse: boolean): { points: Point[]; distanceM: number } {
  const route = reverse ? [...anchors].reverse() : anchors;
  const points: Point[] = [];
  let t = 0;
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    const segment = distMeters(a, b);
    const steps = Math.max(2, Math.round(segment / 25));
    // Per-segment cruising speed, occasionally slowed by "traffic"
    const speed = 4.2 + rand() * 3.2 - (rand() < 0.15 ? 2.0 : 0);
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      const jitter = 0.00012;
      points.push({
        lat: a.lat + (b.lat - a.lat) * f + (rand() - 0.5) * jitter,
        lon: a.lon + (b.lon - a.lon) * f + (rand() - 0.5) * jitter,
        ele: a.ele + (b.ele - a.ele) * f + (rand() - 0.5) * 0.4,
        t: Math.round(t + (segment / steps / speed) * s),
        hr: Math.round(105 + speed * 7 + (rand() - 0.5) * 14),
      });
    }
    t += segment / speed;
    total += segment;
  }
  const last = route[route.length - 1];
  points.push({ lat: last.lat, lon: last.lon, ele: last.ele, t: Math.round(t), hr: 120 });
  return { points, distanceM: total };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function exportDate(d: Date): string {
  let h = d.getUTCHours() % 12;
  if (h === 0) h = 12;
  const ampm = d.getUTCHours() < 12 ? "AM" : "PM";
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${h}:${mm}:${ss} ${ampm}`;
}

function gpx(name: string, start: Date, points: Point[]): string {
  const pts = points
    .map((p) => {
      const time = new Date(start.getTime() + p.t * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
      return (
        `   <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">\n` +
        `    <ele>${p.ele.toFixed(1)}</ele>\n    <time>${time}</time>\n` +
        `    <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>\n` +
        `   </trkpt>`
      );
    })
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx creator="TrainingTimeMachineDemo" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    ` <metadata><time>${start.toISOString().replace(/\.\d{3}Z$/, "Z")}</time></metadata>\n` +
    ` <trk>\n  <name>${name}</name>\n  <type>cycling</type>\n  <trkseg>\n${pts}\n  </trkseg>\n </trk>\n</gpx>\n`
  );
}

// --- generate ---
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "activities"), { recursive: true });

const csvRows: string[] = [
  "Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Commute,Activity Gear,Filename,Moving Time,Distance,Elevation Gain,Elevation Loss,Max Speed,Average Speed,Average Heart Rate,Max Heart Rate,Calories",
];

let id = 9100000;
let count = 0;
// Jan 1 – Jun 30 2026
for (let day = new Date(Date.UTC(2026, 0, 1)); day < new Date(Date.UTC(2026, 6, 1)); day.setUTCDate(day.getUTCDate() + 1)) {
  const dow = day.getUTCDay();
  const isWeekday = dow >= 1 && dow <= 5;

  const rides: Array<{ name: string; anchors: Anchor[]; reverse: boolean; hourMin: number[]; gear: string; commute: boolean }> = [];
  if (isWeekday && rand() > 0.14) {
    rides.push(
      { name: "Morning Commute", anchors: COMMUTE, reverse: false, hourMin: [7, 40], gear: "Commuter", commute: true },
      { name: "Evening Commute", anchors: COMMUTE, reverse: true, hourMin: [17, 25], gear: "Commuter", commute: true },
    );
  } else if (dow === 6 && rand() < 0.55) {
    rides.push({ name: "Alderley Edge Loop", anchors: WEEKEND, reverse: rand() < 0.5, hourMin: [9, 15], gear: "Weekender", commute: false });
  }

  for (const ride of rides) {
    const { points, distanceM } = makeTrack(ride.anchors, ride.reverse);
    const start = new Date(day.getTime());
    start.setUTCHours(ride.hourMin[0], ride.hourMin[1] + Math.floor(rand() * 25), Math.floor(rand() * 60));
    const movingS = points[points.length - 1].t;
    const elapsedS = Math.round(movingS * (1.04 + rand() * 0.1));
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < points.length; i++) {
      const d = points[i].ele - points[i - 1].ele;
      if (d > 0) gain += d;
      else loss -= d;
    }
    const avgSpeed = distanceM / movingS;
    const avgHr = Math.round(points.reduce((s, p) => s + p.hr, 0) / points.length);
    const maxHr = Math.max(...points.map((p) => p.hr));
    const file = `activities/${++id}.gpx`;
    fs.writeFileSync(path.join(OUT, file), gpx(ride.name, start, points));
    csvRows.push(
      [
        id,
        `"${exportDate(start)}"`,
        ride.name,
        "Ride",
        elapsedS,
        (distanceM / 1000).toFixed(2),
        ride.commute,
        ride.gear,
        file,
        `${movingS}.0`,
        distanceM.toFixed(1),
        gain.toFixed(1),
        loss.toFixed(1),
        (avgSpeed * 1.9).toFixed(2),
        avgSpeed.toFixed(3),
        `${avgHr}.0`,
        `${maxHr}.0`,
        `${Math.round(distanceM / 42)}.0`,
      ].join(","),
    );
    count++;
  }
}

fs.writeFileSync(path.join(OUT, "activities.csv"), csvRows.join("\n") + "\n");
fs.writeFileSync(
  path.join(OUT, "profile.csv"),
  `Athlete ID,Email Address,First Name,Last Name,Sex,Description,Weight,City,State,Country\n` +
    `9000001,demo@example.com,Demo,Rider,Male,,74.0,"Wilmslow",England,United Kingdom\n`,
);
fs.writeFileSync(
  path.join(OUT, "bikes.csv"),
  `Bike Name,Bike Brand,Bike Model,Bike Default Sport Types\nCommuter,Demo Cycles,Urban 8,Ride\nWeekender,Demo Cycles,Gran Fondo,Ride\n`,
);
fs.writeFileSync(path.join(OUT, "shoes.csv"), `Shoe Name,Shoe Brand,Shoe Model,Shoe Default Sport Types\n`);
fs.writeFileSync(path.join(OUT, "routes.csv"), `Route Name,Route Filename\n`);
fs.writeFileSync(
  path.join(OUT, "goals.csv"),
  `Goal Type,Activity Type,Goal,Start Date,End Date,Segment ID,Time Period,Interval Time\n` +
    `Distance Goal,All Ride,150000.0,"Jan 1, 2026, 12:00:00 AM",,,Week\n`,
);

console.log(`Demo export written to ${OUT}: ${count} activities`);
console.log(`Import with: node dist/extract.js ${OUT}`);
console.log(
  `(importing replaces whatever is in the database — if you already imported ` +
    `your real data, use a separate database instead: MYSQL_DATABASE=demo node dist/extract.js ${OUT})`,
);
