import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.join(appRoot, 'data');
const dbPath = path.join(dataDir, 'site.sqlite');
const schemaPath = path.join(appRoot, 'schema', 'schema.sql');

fs.mkdirSync(dataDir, { recursive: true });

const schema = fs.readFileSync(schemaPath, 'utf8');
const db = new DatabaseSync(dbPath);
db.exec(schema);
db.close();

console.log(`SQLite initialized: ${dbPath}`);
