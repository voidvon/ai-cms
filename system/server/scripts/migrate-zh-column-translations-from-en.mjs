import { getDb } from '../src/db.mjs';

const WRITE = process.argv.includes('--write');
const SOURCE_LANGUAGE_CODE = 'en';
const TARGET_LANGUAGE_CODE = 'zh-CN';

const db = getDb();

const sourceLanguageId = getLanguageId(SOURCE_LANGUAGE_CODE);
const targetLanguageId = getLanguageId(TARGET_LANGUAGE_CODE);

if (!sourceLanguageId || !targetLanguageId) {
  throw new Error(`未找到语言配置: source=${SOURCE_LANGUAGE_CODE} target=${TARGET_LANGUAGE_CODE}`);
}

const rows = db.prepare(`
  SELECT
    c.id AS column_id,
    c.parent_id,
    c.column_type,
    c.custom_url,
    c.route_path,
    src.id AS source_translation_id,
    src.name AS source_name,
    src.summary AS source_summary,
    src.content_html AS source_content_html,
    src.template_data_json AS source_template_data_json,
    src.seo_title AS source_seo_title,
    src.seo_description AS source_seo_description,
    dst.id AS target_translation_id,
    dst.name AS target_name,
    dst.summary AS target_summary,
    dst.content_html AS target_content_html,
    dst.template_data_json AS target_template_data_json,
    dst.seo_title AS target_seo_title,
    dst.seo_description AS target_seo_description
  FROM columns c
  JOIN column_translations src
    ON src.column_id = c.id
   AND src.language_id = ?
  JOIN column_translations dst
    ON dst.column_id = c.id
   AND dst.language_id = ?
  WHERE (
      coalesce(trim(c.route_path), '') <> ''
      OR (
        c.parent_id IS NULL
        AND coalesce(trim(c.route_path), '') = ''
        AND trim(coalesce(c.custom_url, '')) IN ('', '/')
      )
    )
  ORDER BY c.id ASC
`).all(sourceLanguageId, targetLanguageId);

const updateStatement = db.prepare(`
  UPDATE column_translations
     SET summary = ?,
         content_html = ?,
         template_data_json = ?,
         seo_title = ?,
         seo_description = ?,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = ?
`);

let changed = 0;
const details = [];

if (WRITE) {
  db.exec('BEGIN TRANSACTION;');
}

try {
  for (const row of rows) {
    const nextSummary = fillText(row.target_summary, row.source_summary);
    const nextContentHtml = fillText(row.target_content_html, row.source_content_html);
    const nextSeoTitle = fillNullableText(row.target_seo_title, row.source_seo_title);
    const nextSeoDescription = fillNullableText(row.target_seo_description, row.source_seo_description);
    const nextTemplateDataJson = mergeTemplateDataJson(row.target_template_data_json, row.source_template_data_json);

    const didChange =
      String(nextSummary) !== String(row.target_summary ?? '') ||
      String(nextContentHtml) !== String(row.target_content_html ?? '') ||
      String(nextTemplateDataJson) !== String(row.target_template_data_json ?? '') ||
      String(nextSeoTitle ?? '') !== String(row.target_seo_title ?? '') ||
      String(nextSeoDescription ?? '') !== String(row.target_seo_description ?? '');

    details.push({
      columnId: row.column_id,
      routePath: row.route_path,
      changed: didChange,
      filled: {
        summary: isBlank(row.target_summary) && !isBlank(row.source_summary),
        contentHtml: isBlank(row.target_content_html) && !isBlank(row.source_content_html),
        seoTitle: isBlank(row.target_seo_title) && !isBlank(row.source_seo_title),
        seoDescription: isBlank(row.target_seo_description) && !isBlank(row.source_seo_description),
        templateDataJson: String(nextTemplateDataJson) !== String(row.target_template_data_json ?? '')
      }
    });

    if (!didChange) {
      continue;
    }

    changed += 1;

    if (WRITE) {
      updateStatement.run(
        nextSummary,
        nextContentHtml,
        nextTemplateDataJson,
        nextSeoTitle,
        nextSeoDescription,
        row.target_translation_id
      );
    }
  }

  if (WRITE) {
    db.exec('COMMIT;');
  }
} catch (error) {
  if (WRITE) {
    db.exec('ROLLBACK;');
  }
  throw error;
}

console.log(JSON.stringify({
  write: WRITE,
  sourceLanguageCode: SOURCE_LANGUAGE_CODE,
  targetLanguageCode: TARGET_LANGUAGE_CODE,
  scanned: rows.length,
  changed,
  details
}, null, 2));

function getLanguageId(code) {
  const row = db.prepare('SELECT id FROM languages WHERE code = ? LIMIT 1').get(code);
  return row?.id ? Number(row.id) : null;
}

function isBlank(value) {
  return String(value ?? '').trim() === '';
}

function fillText(currentValue, fallbackValue) {
  return isBlank(currentValue) && !isBlank(fallbackValue)
    ? String(fallbackValue)
    : String(currentValue ?? '');
}

function fillNullableText(currentValue, fallbackValue) {
  if (isBlank(currentValue) && !isBlank(fallbackValue)) {
    return String(fallbackValue);
  }
  if (currentValue == null) {
    return null;
  }
  return String(currentValue);
}

function parseJsonObject(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function mergeTemplateDataJson(targetRaw, sourceRaw) {
  const targetParsed = parseJsonObject(targetRaw);
  const sourceParsed = parseJsonObject(sourceRaw);

  if (!sourceParsed) {
    return targetRaw ?? null;
  }
  if (!targetParsed) {
    return JSON.stringify(sourceParsed, null, 2);
  }

  const merged = deepFill(targetParsed, sourceParsed);
  return JSON.stringify(merged, null, 2);
}

function deepFill(targetValue, sourceValue) {
  if (Array.isArray(targetValue)) {
    if (targetValue.length > 0) {
      return targetValue;
    }
    return cloneValue(sourceValue);
  }

  if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
    const result = { ...targetValue };
    for (const [key, sourceChild] of Object.entries(sourceValue)) {
      const targetChild = result[key];
      if (targetChild === undefined || targetChild === null) {
        result[key] = cloneValue(sourceChild);
        continue;
      }
      if (typeof targetChild === 'string') {
        result[key] = targetChild.trim() ? targetChild : cloneValue(sourceChild);
        continue;
      }
      if (Array.isArray(targetChild)) {
        if (targetChild.length === 0) {
          result[key] = cloneValue(sourceChild);
        }
        continue;
      }
      if (isPlainObject(targetChild) && isPlainObject(sourceChild)) {
        result[key] = deepFill(targetChild, sourceChild);
        continue;
      }
      if (
        (typeof targetChild === 'number' && Number.isNaN(targetChild))
        || targetChild === false && sourceChild === true
      ) {
        result[key] = cloneValue(sourceChild);
      }
    }
    return result;
  }

  if (typeof targetValue === 'string') {
    return targetValue.trim() ? targetValue : cloneValue(sourceValue);
  }

  if (targetValue == null) {
    return cloneValue(sourceValue);
  }

  return targetValue;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }
  return JSON.parse(JSON.stringify(value));
}
