import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { runLegacyEncodingRepair } from './repair-legacy-encoding.mjs';
import { DATABASE_PATH } from '../src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const importDir = path.join(appRoot, 'import');
const dbPath = DATABASE_PATH;
const encoding = process.env.CSV_ENCODING || 'utf-8';
const resetTables = process.env.RESET_TABLES === '1';
const repairLegacyEncoding = process.env.REPAIR_LEGACY_ENCODING !== '0';

const TABLES = [
  {
    file: 'benming_master.csv',
    table: 'admins',
    key: 'id',
    columns: {
      id: fromInt('Id'),
      username: fromText('UserName'),
      password_hash: fromText('PassWord'),
      password_scheme: () => 'legacy-md5-16',
      permission_flags: fromText('Flag'),
      last_login_at: fromText('LastLogin'),
      last_login_ip: fromText('LastLoginIp')
    }
  },
  {
    file: 'benming_ch_ProdCat.csv',
    table: 'product_categories',
    key: 'id',
    columns: {
      id: fromInt('id'),
      name: fromText('CatName'),
      parent_id: fromInt('Root', 0),
      sort_order: fromInt('Orderid', 0),
      seo_keywords: fromText('key'),
      seo_description: fromText('desc')
    }
  },
  {
    file: 'benming_ch_prod.csv',
    table: 'products',
    key: 'id',
    columns: {
      id: fromInt('id'),
      category_id: fromNullablePositiveInt('CatId'),
      name: fromText('prodName'),
      code: fromText('prodCode'),
      summary: fromText('remark'),
      content_html: fromText('itemize'),
      small_image: fromText('smallpic'),
      large_image: fromText('bigpic'),
      keywords: fromText('key'),
      is_featured_home: fromBoolLike('tjhome'),
      is_visible: fromLegacyVisibility('show', 1),
      sort_order: fromInt('orderid', 0)
    }
  },
  {
    file: 'benming_ch_prodphoto.csv',
    table: 'product_photos',
    key: 'id',
    columns: {
      id: fromInt('id'),
      product_id: fromNullablePositiveInt('prodid'),
      name: fromText('photoName'),
      image_path: fromText('photopic'),
      created_at: fromText('date')
    }
  },
  {
    file: 'benming_ch_NewsCat.csv',
    table: 'news_categories',
    key: 'id',
    columns: {
      id: fromInt('id'),
      name: fromText('CatName'),
      parent_id: fromInt('Root', 0),
      sort_order: fromInt('ORderID', 0)
    }
  },
  {
    file: 'benming_ch_news.csv',
    table: 'news',
    key: 'id',
    columns: {
      id: fromInt('newsid'),
      category_id: fromNullablePositiveInt('Typeid'),
      title: fromText('Title'),
      summary: fromText('desc'),
      content_html: fromText('Content'),
      picture: fromText('Picture'),
      keywords: fromText('key'),
      is_featured_home: fromBoolLike('tjhome'),
      created_at: fromText('Dateandtime')
    }
  },
  {
    file: 'benming_ch_job.csv',
    table: 'jobs',
    key: 'id',
    columns: {
      id: fromInt('id'),
      name: fromText('jobName'),
      address: fromText('address'),
      openings: fromText('jobnob'),
      contact_person: fromText('linkren'),
      phone: fromText('phone'),
      is_active: fromBoolLike('state', 1),
      requirements_html: fromText('jobneed'),
      created_at: fromText('date')
    }
  },
  {
    file: 'benming_ch_Msg.csv',
    table: 'messages',
    key: 'id',
    columns: {
      id: fromInt('id'),
      contact_name: fromText('linkren'),
      phone: fromText('phone'),
      title: fromText('Title'),
      content: fromText('content'),
      product_id: fromNullablePositiveInt('prodid'),
      address: fromText('address'),
      mobile: fromText('mobile'),
      fax: fromText('fax'),
      email: fromText('email'),
      status: fromBoolLike('state', 0),
      created_at: fromText('date')
    }
  },
  {
    file: 'benming_ch_Contact.csv',
    table: 'contacts',
    key: 'id',
    columns: {
      id: fromInt('id'),
      office_name: fromText('offname'),
      address: fromText('address'),
      phone: fromText('phone'),
      fax: fromText('fax'),
      contact_person: fromText('linkren'),
      email: fromText('Email'),
      postal_code: fromText('Post')
    }
  },
  {
    file: 'benming_ch_Cocat.csv',
    table: 'corporation_categories',
    key: 'id',
    columns: {
      id: fromInt('id'),
      name: fromText('coname'),
      parent_id: fromInt('root', 0),
      sort_order: fromInt('orderid', 0),
      is_external: fromBoolLike('sitepath'),
      external_url: fromText('siteurl')
    }
  },
  {
    file: 'benming_ch_MetaType.csv',
    table: 'meta_types',
    key: 'id',
    columns: {
      id: fromInt('id'),
      title: fromText('title'),
      meta_keywords: fromText('meta_keywords'),
      meta_descriptions: fromText('meta_descriptions')
    }
  },
  {
    file: 'benming_ch_config.csv',
    table: 'site_config',
    key: 'id',
    columns: {
      id: fromInt('id'),
      web_name: fromText('WebName'),
      web_url: fromText('WebUrl'),
      company_name: fromText('CoName'),
      company_address: fromText('CoAdd'),
      postal_code: fromText('CoPost'),
      company_phone: fromText('CoPhone'),
      company_fax: fromText('CoFax'),
      contact_person: fromText('CoRen'),
      company_email: fromText('CoEmail'),
      icp_number: fromText('WebIcp'),
      web_qq: fromText('WebQQ'),
      web_mobile: fromText('WebMsn'),
      web_copyright: fromText('WebCopyright'),
      web_author: fromText('Webauthor')
    }
  },
  {
    file: 'benming_ch_worldec_Temp.csv',
    table: 'template_variants',
    key: 'id',
    columns: {
      id: fromInt('id'),
      template_name: fromText('tempname'),
      is_selected: fromBoolLike('selected'),
      home_index: fromText('home_index'),
      co_index: fromText('Co_index'),
      produts_index: fromText('produts_index'),
      produts_sort1: fromText('produts_sort1'),
      produts_sort2: fromText('produts_sort2'),
      produts_detail: fromText('produts_detail'),
      news_index: fromText('news_index'),
      news_sort1: fromText('News_sort1'),
      news_detail: fromText('news_detail'),
      service_sort1: fromText('service_sort1'),
      service_detail: fromText('service_detail'),
      job_index: fromText('job_index'),
      job_detail: fromText('Job_detail'),
      msg_index: fromText('msg_index'),
      contact: fromText('contact')
    }
  },
  {
    file: 'benming_ch_cuskind.csv',
    table: 'custom_label_kinds',
    key: 'id',
    columns: {
      id: fromInt('id'),
      name: fromText('kindname')
    }
  },
  {
    file: 'benming_ch_cuslabel.csv',
    table: 'custom_labels',
    key: 'id',
    columns: {
      id: fromInt('id'),
      kind_id: fromNullableInt('lkind'),
      name: fromText('lname'),
      content: fromText('lcontent')
    }
  }
];

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = OFF;');

if (resetTables) {
  clearImportedTables(db);
}

ensureLegacySentinels(db);

let importedTables = 0;

for (const definition of TABLES) {
  const filePath = path.join(importDir, definition.file);
  if (!fs.existsSync(filePath)) {
    continue;
  }

  const rows = parseCsv(fs.readFileSync(filePath), encoding);
  if (rows.length === 0) {
    continue;
  }

  importRows(db, definition, rows);
  importedTables += 1;
  console.log(`Imported ${definition.table}: ${rows.length} rows`);
}

db.exec('PRAGMA foreign_keys = ON;');
db.close();
if (repairLegacyEncoding && importedTables > 0) {
  runLegacyEncodingRepair({ write: true });
}
console.log(importedTables === 0 ? 'No CSV files imported.' : 'CSV import complete.');

function clearImportedTables(database) {
  const tables = ['admin_sessions', ...new Set(TABLES.map((definition) => definition.table))];
  for (const table of tables) {
    database.prepare(`DELETE FROM ${table}`).run();
  }
  console.log(`Cleared tables: ${tables.join(', ')}`);
}

function ensureLegacySentinels(database) {
  database.prepare(`
    INSERT OR IGNORE INTO product_categories (
      id,
      name,
      parent_id,
      sort_order,
      seo_keywords,
      seo_description
    ) VALUES (0, '__root__', 0, 0, NULL, NULL)
  `).run();

  database.prepare(`
    INSERT OR IGNORE INTO news_categories (
      id,
      name,
      parent_id,
      sort_order
    ) VALUES (0, '__root__', 0, 0)
  `).run();
}

function importRows(database, definition, rows) {
  const targetColumns = Object.keys(definition.columns);
  const updateColumns = targetColumns.filter((column) => column !== definition.key);
  const sql = `
    INSERT INTO ${definition.table} (${targetColumns.join(', ')}, legacy_extra)
    VALUES (${targetColumns.map(() => '?').join(', ')}, ?)
    ON CONFLICT(${definition.key}) DO UPDATE SET
      ${updateColumns.map((column) => `${column} = excluded.${column}`).join(', ')},
      legacy_extra = excluded.legacy_extra
  `;
  const statement = database.prepare(sql);

  for (const row of rows) {
    const payload = {};
    for (const [column, mapper] of Object.entries(definition.columns)) {
      payload[column] = mapper(row);
    }

    const knownHeaders = new Set(
      Object.values(definition.columns)
        .map((mapper) => mapper.sourceHeader)
        .filter(Boolean)
    );

    const extra = {};
    for (const [header, value] of Object.entries(row)) {
      if (!knownHeaders.has(header) && value !== '') {
        extra[header] = value;
      }
    }

    const values = targetColumns.map((column) => payload[column]);
    statement.run(...values, Object.keys(extra).length > 0 ? JSON.stringify(extra) : null);
  }
}

function fromText(header) {
  const fn = (row) => sanitizeText(row[header]);
  fn.sourceHeader = header;
  return fn;
}

function fromInt(header, fallback = null) {
  const fn = (row) => toInteger(row[header], fallback);
  fn.sourceHeader = header;
  return fn;
}

function fromNullableInt(header) {
  const fn = (row) => toInteger(row[header], null);
  fn.sourceHeader = header;
  return fn;
}

function fromNullablePositiveInt(header) {
  const fn = (row) => {
    const parsed = toInteger(row[header], null);
    return parsed && parsed > 0 ? parsed : null;
  };
  fn.sourceHeader = header;
  return fn;
}

function fromBoolLike(header, fallback = 0) {
  const fn = (row) => toBooleanInt(row[header], fallback);
  fn.sourceHeader = header;
  return fn;
}

function fromInvertedCheckbox(header, checkedValue = 1) {
  const fn = (row) => {
    const value = row[header];
    if (value === undefined || value === null || value === '') {
      return checkedValue;
    }
    return toBooleanInt(value, checkedValue) === 1 ? 0 : 1;
  };
  fn.sourceHeader = header;
  return fn;
}

function fromLegacyVisibility(header, fallback = 1) {
  const fn = (row) => {
    const value = row[header];
    if (value === undefined || value === null || String(value).trim() === '') {
      return fallback;
    }

    const normalized = String(value).trim().toLowerCase();
    if (normalized === '0' || normalized === 'false' || normalized === 'hidden' || normalized === 'hide') {
      return 0;
    }
    return 1;
  };
  fn.sourceHeader = header;
  return fn;
}

function sanitizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function toInteger(value, fallback = null) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', '-1'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 0;
  }
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed === 0 ? 0 : 1;
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
