/**
 * Source-neutral model for training data. Every provider (Strava today,
 * anything else tomorrow) normalizes its export into these shapes; the
 * importer only knows about this module, never about a specific provider.
 */

export interface Athlete {
  id: number | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  sex: string | null;
  weight: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
}

export interface Gear {
  name: string;
  kind: "bike" | "shoe";
  brand: string | null;
  model: string | null;
  defaultSportTypes: string | null;
}

export interface Activity {
  id: number | null;
  /** UTC start time */
  startTime: Date | null;
  name: string | null;
  type: string | null;
  description: string | null;
  distanceM: number | null;
  movingTimeS: number | null;
  elapsedTimeS: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  averageSpeedMs: number | null;
  maxSpeedMs: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  averageWatts: number | null;
  maxWatts: number | null;
  averageCadence: number | null;
  calories: number | null;
  gear: string | null;
  commute: boolean;
  /** Source-relative path of the raw track file, if any */
  filename: string | null;
  /** Every field of the source's raw record, preserved verbatim */
  raw: Record<string, string>;
}

export interface TrackPoint {
  /** "YYYY-MM-DD HH:MM:SS" UTC, or null */
  time: string | null;
  lat: number | null;
  lon: number | null;
  altitude: number | null;
  heartrate: number | null;
  cadence: number | null;
  watts: number | null;
  temp: number | null;
}

export interface Route {
  name: string | null;
  filename: string | null;
}

export interface Goal {
  goalType: string | null;
  activityType: string | null;
  goal: number | null;
  /** "YYYY-MM-DD HH:MM:SS" UTC, or null */
  startDate: string | null;
  endDate: string | null;
  timePeriod: string | null;
}

/** Parsed contents of one provider's export. */
export interface SourceData {
  athlete: Athlete | null;
  gear: Gear[];
  activities: Activity[];
  routes: Route[];
  goals: Goal[];
  /**
   * Track points for one activity. Throws with a human-readable message
   * when the activity has no readable track (manual entry, unsupported
   * file format, missing file).
   */
  readPoints(activity: Activity): TrackPoint[];
}

/** A pluggable training-data provider. */
export interface TrainingDataSource {
  /** Short identifier, e.g. "strava" */
  name: string;
  /** Can this source parse the given extracted export directory? */
  detect(dir: string): boolean;
  /** Parse the directory. Only called when detect() returned true. */
  load(dir: string): SourceData;
}
