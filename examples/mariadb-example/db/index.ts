import mariadb, { PoolConnection } from "mariadb";
import config from "../config.json";
import mysqlTz from "mysql-tz";

const maria_pool = mariadb.createPool({
  ...config,
  timezone: mysqlTz(),
  connectionLimit: 25
});

const db_conn = (): Promise<PoolConnection> => maria_pool.getConnection();

export default db_conn;
