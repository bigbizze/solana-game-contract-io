import db_conn from "./index";
import { Connection } from "mariadb";
import { Option } from "../../../src/shared-types";

export const with_db = async <T>(handler_cb: (conn: Connection) => Promise<T>, _conn?: Connection): Promise<Option<T>> => {
  const conn = _conn == null ? await db_conn() : _conn;
  await conn.beginTransaction();
  try {
    const res = await handler_cb(conn);
    await conn.commit();
    return res;
  } catch (e) {
    console.error(e);
    await conn.rollback();
  } finally {
    await conn.end();
  }
};

export const first = <T>(arr: T[]): Option<T> => (
  arr.length > 0 ? arr[0] : undefined
);

export const getFirstRow = <T>(rows: T[]): Option<T> => {
  if (Array.isArray(rows) && rows.length >= 1) {
    return first(rows);
  }
};
