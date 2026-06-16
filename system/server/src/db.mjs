import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATABASE_PATH } from './config.mjs';

let database;

export function getDb() {
  if (!database) {
    fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });
    database = new DatabaseSync(DATABASE_PATH);
    database.exec(`
      PRAGMA foreign_keys = OFF;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
    `);
  }
  return database;
}

export function queryAll(sql, params = []) {
  return getDb().prepare(sql).all(...params);
}

export function queryOne(sql, params = []) {
  return getDb().prepare(sql).get(...params);
}

export function execute(sql, params = []) {
  return getDb().prepare(sql).run(...params);
}
