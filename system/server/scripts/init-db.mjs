import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { DATA_DIR, DATABASE_PATH } from '../src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const schemaPath = path.join(appRoot, 'schema', 'schema.sql');

fs.mkdirSync(DATA_DIR, { recursive: true });

const schema = fs.readFileSync(schemaPath, 'utf8');
const db = new DatabaseSync(DATABASE_PATH);
db.exec(schema);
db.close();

console.log(`SQLite initialized: ${DATABASE_PATH}`);
