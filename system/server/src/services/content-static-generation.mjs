import { CONTENT_ROOT } from '../config.mjs';
import { listColumns } from './columns.mjs';
import { getContentItemById } from './content-items.mjs';
import { runStaticBuild } from './static-build-executor.mjs';
import { isSupportedStaticBuildSection } from '../static-builder.mjs';

export async function regenerateContentItemStaticPages(modelCode, id) {
  const normalizedModelCode = String(modelCode || '').trim();
  const contentItemId = Number.parseInt(id, 10);
  if (!normalizedModelCode || !Number.isInteger(contentItemId) || contentItemId <= 0) {
    throw createHttpError('内容参数无效', 400);
  }

  const item = getContentItemById(normalizedModelCode, contentItemId);
  if (!item) {
    throw createHttpError('内容不存在', 404);
  }

  const section = resolveContentDetailBuildSection(item.column_id);
  if (!section) {
    throw createHttpError('当前内容所属栏目不支持生成详情静态页', 400);
  }

  const result = await runStaticBuild({
    outputRoot: CONTENT_ROOT,
    sections: [section],
    contentItemId,
    cleanExisting: false
  });

  const generatedLanguageCodes = (result.languageBuilds || [])
    .filter((build) => hasGeneratedContentDetail(build, section))
    .map((build) => build.languageCode);
  const skippedLanguageCodes = (result.languageBuilds || [])
    .filter((build) => !hasGeneratedContentDetail(build, section))
    .map((build) => build.languageCode);

  return {
    contentItemId,
    modelCode: normalizedModelCode,
    section,
    languageCodes: generatedLanguageCodes,
    skippedLanguageCodes,
    totalFiles: result.totalFiles || 0,
    totalRecords: result.totalRecords || 0
  };
}

function hasGeneratedContentDetail(languageBuild, section) {
  return (languageBuild?.results || []).some((result) => (
    result.key === section && Number(result.recordsProcessed || 0) > 0
  ));
}

function resolveContentDetailBuildSection(columnId) {
  const columns = listColumns({ includeTranslations: false });
  const columnById = new Map(columns.map((column) => [Number(column.id), column]));
  const visited = new Set();
  let currentColumnId = Number(columnId || 0);

  while (currentColumnId > 0 && !visited.has(currentColumnId)) {
    visited.add(currentColumnId);
    const section = `column:${currentColumnId}:detail`;
    if (isSupportedStaticBuildSection(section, { columns })) {
      return section;
    }
    currentColumnId = Number(columnById.get(currentColumnId)?.parent_id || 0);
  }

  return null;
}

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
