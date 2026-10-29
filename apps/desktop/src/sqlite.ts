import { createRequire } from 'node:module';
import type { Database, SqlJsStatic } from 'sql.js';

const require = createRequire(import.meta.url);

let sqlPromise: Promise<SqlJsStatic> | undefined;

/**
 * Loads sql.js (WASM SQLite, no native build). sql.js is CJS; under ESM we go through
 * createRequire so both the module and the .wasm path resolve from the installed package.
 */
export function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const initSqlJs = require('sql.js') as (cfg?: object) => Promise<SqlJsStatic>;
      return initSqlJs({ locateFile: (f: string) => require.resolve('sql.js/dist/' + f) });
    })();
  }
  return sqlPromise;
}

/** Run a query and return rows as plain objects. */
export function rows<T = Record<string, unknown>>(db: Database, sql: string): T[] {
  const out: T[] = [];
  const stmt = db.prepare(sql);
  try { while (stmt.step()) out.push(stmt.getAsObject() as T); }
  finally { stmt.free(); }
  return out;
}
