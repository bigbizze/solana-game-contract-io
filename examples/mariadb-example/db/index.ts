import mariadb, { PoolConnection } from "mariadb";
import config from "../config.json";

const timezone = new Date().toString().split(" ").reduce((a, b) => a.includes("-") || a.includes("+") ? a : b);

const maria_pool = mariadb.createPool({
  ...config,
  timezone,
  connectionLimit: 25
});

const db_conn = (): Promise<PoolConnection> => maria_pool.getConnection();

export default db_conn;
