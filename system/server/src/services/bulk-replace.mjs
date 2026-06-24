import { getDb, queryAll } from '../db.mjs';
import { ensureContentModelStorageSchema, getContentTableName, getTranslationTableName } from './content-model-storage.mjs';
import { ensureContentModelsSchema, getContentModelByCode, listContentModels } from './content-models.mjs';

const CONTENT_MAIN_SCOPE = 'content_main';
const CONTENT_TRANSLATION_SCOPE = 'content_translation';
const TEMPLATE_SCOPE = 'template';

const TEMPLATE_FIELD_OPTIONS = [
  'tsx_source',
  'css_source',
  'published_tsx_source',
  'published_css_source'
];

const TEMPLATE_TYPE_OPTIONS = ['home', 'list', 'content', 'single', 'component'];

export function listBulkReplaceOptions() {
  ensureContentModelsSchema();
  ensureContentModelStorageSchema();

  const contentModels = listContentModels().map((model) => {
    const fields = Array.isArray(model.fields) ? model.fields : [];
    return {
      code: model.code,
      name: model.name,
      mainFields: fields
        .filter((field) => Number(field.is_translatable || 0) === 0)
        .map((field) => ({
          field_name: field.field_name,
          field_label: field.field_label || field.field_name,
          field_type: field.field_type || ''
        })),
      translationFields: fields
        .filter((field) => Number(field.is_translatable || 0) === 1)
        .map((field) => ({
          field_name: field.field_name,
          field_label: field.field_label || field.field_name,
          field_type: field.field_type || ''
        }))
    };
  });

  return {
    contentModels,
    templateFields: TEMPLATE_FIELD_OPTIONS.map((value) => ({ value, label: value })),
    templateTypes: TEMPLATE_TYPE_OPTIONS.map((value) => ({ value, label: value }))
  };
}

export function previewBulkReplace(input) {
  const plan = normalizeBulkReplaceInput(input, { requireConfirmation: false });
  return executeBulkReplacePlan(plan, { dryRun: true });
}

export function runBulkReplace(input) {
  const plan = normalizeBulkReplaceInput(input, { requireConfirmation: true });
  return executeBulkReplacePlan(plan, { dryRun: false });
}

function executeBulkReplacePlan(plan, { dryRun }) {
  if (plan.target === 'content') {
    return executeContentBulkReplace(plan, { dryRun });
  }
  return executeTemplateBulkReplace(plan, { dryRun });
}

function executeContentBulkReplace(plan, { dryRun }) {
  const model = getContentModelByCode(plan.modelCode);
  if (!model) {
    throw new Error(`内容模型不存在：${plan.modelCode}`);
  }

  const scope = plan.scope === CONTENT_MAIN_SCOPE ? CONTENT_MAIN_SCOPE : CONTENT_TRANSLATION_SCOPE;
  const tableName = scope === CONTENT_MAIN_SCOPE
    ? getContentTableName(plan.modelCode)
    : getTranslationTableName(plan.modelCode);
  const idColumn = scope === CONTENT_MAIN_SCOPE ? 'id' : 'entry_id';
  const selectSql = buildContentSelectSql({
    tableName,
    fieldName: plan.fieldName,
    idColumn,
    languageCode: plan.languageCode,
    scope
  });
  const selectParams = buildContentSelectParams(plan, scope);
  const rows = queryAll(selectSql, selectParams);
  const matchedRows = [];
  let totalHits = 0;

  rows.forEach((row) => {
    const sourceValue = row?.field_value == null ? '' : String(row.field_value);
    const evaluation = evaluateReplacement(sourceValue, plan);
    if (!evaluation.matched) {
      return;
    }

    totalHits += evaluation.hitCount;
    matchedRows.push({
      rowId: Number(row.row_id || 0),
      displayId: Number(row.display_id || row.row_id || 0),
      languageCode: row.language_code || null,
      nextValue: evaluation.nextValue,
      hitCount: evaluation.hitCount,
      beforeExcerpt: buildExcerpt(sourceValue, plan.search, evaluation.firstMatchIndex),
      afterExcerpt: buildExcerpt(evaluation.nextValue, plan.replace, evaluation.firstReplacementIndex)
    });
  });

  const matches = matchedRows.map((item) => ({
      id: item.displayId,
      language_code: item.languageCode,
      before_excerpt: item.beforeExcerpt,
      after_excerpt: item.afterExcerpt,
      hit_count: item.hitCount
  }));

  const summary = {
    target: 'content',
    mode: dryRun ? 'preview' : 'execute',
    scope,
    model_code: plan.modelCode,
    model_name: model.name,
    field_name: plan.fieldName,
    field_label: resolveContentFieldLabel(model, plan.fieldName),
    match_mode: plan.matchMode,
    replace_mode: plan.replaceMode,
    match_case: plan.matchCase,
    language_code: plan.languageCode,
    total_rows: matches.length,
    total_hits: totalHits,
    affected_ids: matches.map((item) => item.id),
    matches: matches.slice(0, 50)
  };

  if (dryRun || matches.length === 0) {
    return summary;
  }

  const db = getDb();
  db.exec('BEGIN TRANSACTION');
  try {
    const updateSql = `UPDATE ${quoteIdentifier(tableName)} SET ${quoteIdentifier(plan.fieldName)} = ? WHERE id = ?`;
    const updateStatement = db.prepare(updateSql);

    matchedRows.forEach((match) => {
      updateStatement.run(match.nextValue, match.rowId);
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return summary;
}

function executeTemplateBulkReplace(plan, { dryRun }) {
  const whereParts = [];
  const params = [];

  if (plan.templateType) {
    whereParts.push('type = ?');
    params.push(plan.templateType);
  }

  const sql = `
    SELECT
      id,
      name,
      code,
      type,
      ${quoteIdentifier(plan.templateField)} AS field_value
    FROM templates
    ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
    ORDER BY id ASC
  `;

  const rows = queryAll(sql, params);
  const matches = [];
  let totalHits = 0;

  rows.forEach((row) => {
    const sourceValue = row?.field_value == null ? '' : String(row.field_value);
    const evaluation = evaluateReplacement(sourceValue, plan);
    if (!evaluation.matched) {
      return;
    }

    totalHits += evaluation.hitCount;
    matches.push({
      id: Number(row.id || 0),
      language_code: row.language_code || null,
      name: row.name || '',
      code: row.code || '',
      type: row.type || '',
      before_excerpt: buildExcerpt(sourceValue, plan.search, evaluation.firstMatchIndex),
      after_excerpt: buildExcerpt(evaluation.nextValue, plan.replace, evaluation.firstReplacementIndex),
      hit_count: evaluation.hitCount
    });
  });

  const summary = {
    target: 'template',
    mode: dryRun ? 'preview' : 'execute',
    template_field: plan.templateField,
    template_type: plan.templateType || null,
    match_mode: plan.matchMode,
    replace_mode: plan.replaceMode,
    match_case: plan.matchCase,
    total_rows: matches.length,
    total_hits: totalHits,
    affected_ids: matches.map((item) => item.id),
    matches: matches.slice(0, 50)
  };

  if (dryRun || matches.length === 0) {
    return summary;
  }

  const db = getDb();
  db.exec('BEGIN TRANSACTION');
  try {
    const updateStatement = db.prepare(`
      UPDATE templates
      SET ${quoteIdentifier(plan.templateField)} = ?,
          updated_at = ?
      WHERE id = ?
    `);
    const now = new Date().toISOString();

    matches.forEach((match) => {
      const sourceRow = rows.find((row) => Number(row.id || 0) === match.id);
      if (!sourceRow) {
        return;
      }
      const sourceValue = sourceRow?.field_value == null ? '' : String(sourceRow.field_value);
      const evaluation = evaluateReplacement(sourceValue, plan);
      if (!evaluation.matched) {
        return;
      }
      updateStatement.run(evaluation.nextValue, now, match.id);
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return summary;
}

function normalizeBulkReplaceInput(input, { requireConfirmation }) {
  const target = String(input?.target || '').trim();
  if (target !== 'content' && target !== 'template') {
    throw new Error('请选择有效的替换目标');
  }

  const search = String(input?.search ?? '');
  const replace = String(input?.replace ?? '');
  const replaceMode = String(input?.replace_mode || 'replace').trim() === 'overwrite' ? 'overwrite' : 'replace';
  const matchMode = String(input?.match_mode || 'plain').trim() === 'regex' ? 'regex' : 'plain';
  const matchCase = toBoolean(input?.match_case);
  const confirmExecution = toBoolean(input?.confirm_execution);

  if (requireConfirmation && !confirmExecution) {
    throw new Error('执行批量替换前必须确认');
  }
  if (replaceMode === 'replace' && !search) {
    throw new Error('替换模式下原字符不能为空');
  }

  if (target === 'content') {
    ensureContentModelsSchema();
    ensureContentModelStorageSchema();
    const modelCode = String(input?.model_code || '').trim();
    const model = getContentModelByCode(modelCode);
    if (!model) {
      throw new Error('请选择有效的内容模型');
    }

    const scope = String(input?.scope || '').trim();
    if (scope !== CONTENT_MAIN_SCOPE && scope !== CONTENT_TRANSLATION_SCOPE) {
      throw new Error('请选择有效的内容字段作用域');
    }

    const fieldName = String(input?.field_name || '').trim();
    const fields = Array.isArray(model.fields) ? model.fields : [];
    const matchedField = fields.find((field) => field.field_name === fieldName);
    if (!matchedField) {
      throw new Error('请选择有效的内容字段');
    }

    const isTranslatable = Number(matchedField.is_translatable || 0) === 1;
    if (scope === CONTENT_MAIN_SCOPE && isTranslatable) {
      throw new Error('该字段属于翻译表字段，请选择翻译字段作用域');
    }
    if (scope === CONTENT_TRANSLATION_SCOPE && !isTranslatable) {
      throw new Error('该字段属于主表字段，请选择主表字段作用域');
    }

    const languageCode = scope === CONTENT_TRANSLATION_SCOPE
      ? String(input?.language_code || '').trim() || null
      : null;

    return {
      target,
      search,
      replace,
      replaceMode,
      matchMode,
      matchCase,
      modelCode,
      scope,
      fieldName,
      languageCode
    };
  }

  const templateField = String(input?.template_field || '').trim();
  if (!TEMPLATE_FIELD_OPTIONS.includes(templateField)) {
    throw new Error('请选择有效的模板字段');
  }
  const templateType = String(input?.template_type || '').trim() || null;
  if (templateType && !TEMPLATE_TYPE_OPTIONS.includes(templateType)) {
    throw new Error('请选择有效的模板类型');
  }

  return {
    target,
    search,
    replace,
    replaceMode,
    matchMode,
    matchCase,
    templateField,
    templateType
  };
}

function buildContentSelectSql({ tableName, fieldName, idColumn, languageCode, scope }) {
  const languageJoin = scope === CONTENT_TRANSLATION_SCOPE
    ? 'LEFT JOIN languages lang ON lang.id = source.language_id'
    : '';
  const languageFilter = scope === CONTENT_TRANSLATION_SCOPE && languageCode
    ? 'WHERE lang.code = ?'
    : '';
  return `
    SELECT
      source.${quoteIdentifier(idColumn)} AS row_id,
      ${scope === CONTENT_TRANSLATION_SCOPE ? 'source.entry_id' : 'source.id'} AS display_id,
      source.${quoteIdentifier(fieldName)} AS field_value,
      ${scope === CONTENT_TRANSLATION_SCOPE ? 'lang.code' : 'NULL'} AS language_code
    FROM ${quoteIdentifier(tableName)} source
    ${languageJoin}
    ${languageFilter}
    ORDER BY source.${quoteIdentifier(idColumn)} ASC
  `;
}

function buildContentSelectParams(plan, scope) {
  if (scope === CONTENT_TRANSLATION_SCOPE && plan.languageCode) {
    return [plan.languageCode];
  }
  return [];
}

function evaluateReplacement(sourceValue, plan) {
  const value = String(sourceValue ?? '');

  if (plan.replaceMode === 'overwrite') {
    return {
      matched: value !== plan.replace,
      nextValue: plan.replace,
      hitCount: value === plan.replace ? 0 : 1,
      firstMatchIndex: 0,
      firstReplacementIndex: 0
    };
  }

  if (plan.matchMode === 'regex') {
    const regex = buildRegex(plan.search, plan.matchCase);
    const matches = Array.from(value.matchAll(regex));
    if (matches.length === 0) {
      return { matched: false, nextValue: value, hitCount: 0, firstMatchIndex: -1, firstReplacementIndex: -1 };
    }
    const nextValue = value.replace(regex, plan.replace);
    return {
      matched: nextValue !== value,
      nextValue,
      hitCount: matches.length,
      firstMatchIndex: Number(matches[0]?.index ?? -1),
      firstReplacementIndex: Number(matches[0]?.index ?? -1)
    };
  }

  const searchNeedle = plan.matchCase ? plan.search : plan.search.toLowerCase();
  const haystack = plan.matchCase ? value : value.toLowerCase();
  const firstIndex = haystack.indexOf(searchNeedle);
  if (firstIndex === -1) {
    return { matched: false, nextValue: value, hitCount: 0, firstMatchIndex: -1, firstReplacementIndex: -1 };
  }

  let hitCount = 0;
  let cursor = firstIndex;
  while (cursor !== -1) {
    hitCount += 1;
    cursor = haystack.indexOf(searchNeedle, cursor + Math.max(searchNeedle.length, 1));
  }

  const nextValue = replacePlainText(value, plan.search, plan.replace, plan.matchCase);
  return {
    matched: nextValue !== value,
    nextValue,
    hitCount,
    firstMatchIndex: firstIndex,
    firstReplacementIndex: firstIndex
  };
}

function replacePlainText(value, search, replacement, matchCase) {
  if (!search) {
    return value;
  }
  const escaped = escapeRegex(search);
  const flags = matchCase ? 'g' : 'gi';
  return value.replace(new RegExp(escaped, flags), replacement);
}

function buildRegex(source, matchCase) {
  try {
    return new RegExp(source, matchCase ? 'g' : 'gi');
  } catch (error) {
    throw new Error(`正则表达式无效：${error.message}`);
  }
}

function buildExcerpt(value, keyword, index) {
  const text = String(value ?? '');
  if (!text) {
    return '';
  }
  if (index < 0) {
    return text.slice(0, 140);
  }
  const start = Math.max(index - 40, 0);
  const end = Math.min(index + Math.max(String(keyword || '').length, 20) + 40, text.length);
  const excerpt = text.slice(start, end);
  return `${start > 0 ? '...' : ''}${excerpt}${end < text.length ? '...' : ''}`;
}

function resolveContentFieldLabel(model, fieldName) {
  const fields = Array.isArray(model?.fields) ? model.fields : [];
  const matched = fields.find((field) => field.field_name === fieldName);
  return matched?.field_label || fieldName;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}
