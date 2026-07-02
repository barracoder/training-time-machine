import type { TrainingDataSource } from "./types.js";
import { stravaSource } from "./strava.js";

/** All known providers. Add new adapters here. */
export const sources: TrainingDataSource[] = [stravaSource];

/** Pick the source that recognises the extracted export directory. */
export function detectSource(dir: string): TrainingDataSource {
  const source = sources.find((s) => s.detect(dir));
  if (!source) {
    throw new Error(
      `No data source recognises ${dir} (known sources: ${sources.map((s) => s.name).join(", ")}). ` +
        `For Strava, the directory must contain activities.csv — get your archive from ` +
        `https://www.strava.com/athlete/download_my_account`,
    );
  }
  return source;
}

export * from "./types.js";
