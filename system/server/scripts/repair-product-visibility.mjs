import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { execute } from '../src/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, '../import/benming_ch_prod.csv');

export function runProductVisibilityRepair() {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`missing import file: ${csvPath}`);
  }

  const rows = parseCsv(fs.readFileSync(csvPath), 'utf-8');
  let touched = 0;

  for (const row of rows) {
    const id = Number.parseInt(String(row.id || '').trim(), 10);
    if (Number.isNaN(id)) {
      continue;
    }

    const isVisible = parseLegacyVisibility(row.show, 1);
    const result = execute(
      `
        UPDATE products
        SET is_visible = ?
        WHERE id = ?
          AND coalesce(is_visible, -1) <> ?
      `,
      [isVisible, id, isVisible]
    );
    touched += result.changes || 0;
  }

  return {
    rows: rows.length,
    touched
  };
}

function parseLegacyVisibility(value, fallback = 1) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === '0' || normalized === 'false' || normalized === 'hidden' || normalized === 'hide') {
    return 0;
  }
  return 1;
}

function parseCsv(buffer, charset) {
  const decoder = new TextDecoder(charset);
  const text = decoder.decode(buffer);
  const rows = [];

  let headers = null;
  let field = '';
  let record = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (current === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && current === ',') {
      record.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (current === '\n' || current === '\r')) {
      if (current === '\r' && next === '\n') {
        index += 1;
      }
      record.push(field);
      field = '';

      if (record.some((item) => item !== '')) {
        if (!headers) {
          headers = record.map((item) => item.replace(/^\uFEFF/, '').trim());
        } else {
          rows.push(toObject(headers, record));
        }
      }
      record = [];
      continue;
    }

    field += current;
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field);
    if (!headers) {
      headers = record.map((item) => item.replace(/^\uFEFF/, '').trim());
    } else if (record.some((item) => item !== '')) {
      rows.push(toObject(headers, record));
    }
  }

  return rows;
}

function toObject(headers, record) {
  const row = {};
  for (let index = 0; index < headers.length; index += 1) {
    row[headers[index]] = (record[index] ?? '').trim();
  }
  return row;
}

const result = runProductVisibilityRepair();
console.log(`Repaired product visibility for ${result.touched} rows from ${result.rows} CSV records.`);
