import mysql from "mysql2/promise";

/** Connection settings matching docker-compose.yml defaults; override via env. */
export function dbConfig(): mysql.PoolOptions {
  return {
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "strava",
    password: process.env.MYSQL_PASSWORD ?? "strava",
    database: process.env.MYSQL_DATABASE ?? "strava",
    // All export timestamps are UTC; keep them verbatim as strings.
    dateStrings: true,
    timezone: "Z",
  };
}

export function createPool(): mysql.Pool {
  return mysql.createPool({ ...dbConfig(), connectionLimit: 5 });
}
