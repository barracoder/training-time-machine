import mysql from 'mysql2/promise';

// Defaults match the bundled database container (docker-compose.yml at the
// repo root); the credentials stay fixed even when MYSQL_DATABASE points at
// a different database (e.g. the demo dataset).
const defaults = 'strava';

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  user: process.env.MYSQL_USER ?? defaults,
  password: process.env.MYSQL_PASSWORD ?? defaults,
  database: process.env.MYSQL_DATABASE ?? defaults,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
  namedPlaceholders: false,
});

/** Run a parameterized query and return rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

/** Convenience: first row or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
