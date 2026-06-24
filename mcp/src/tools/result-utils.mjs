function omitUndefined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined)
  );
}

function summarizeTemplate(template) {
  if (!template || typeof template !== 'object') {
    return template;
  }

  return omitUndefined({
    id: template.id,
    theme_id: template.theme_id,
    name: template.name,
    type: template.type,
    code: template.code,
    engine: template.engine,
    status: template.status,
    is_default: template.is_default,
    sort_order: template.sort_order,
    created_at: template.created_at,
    updated_at: template.updated_at,
    has_draft_tsx_source: Boolean(template.tsx_source),
    has_draft_css_source: Boolean(template.css_source),
    has_published_tsx_source: Boolean(template.published_tsx_source),
    has_published_css_source: Boolean(template.published_css_source)
  });
}

function summarizeTemplateVersion(version) {
  if (!version || typeof version !== 'object') {
    return version;
  }

  return omitUndefined({
    id: version.id,
    template_id: version.template_id,
    version_no: version.version_no,
    engine: version.engine,
    note: version.note,
    created_at: version.created_at,
    has_tsx_source: Boolean(version.tsx_source),
    has_css_source: Boolean(version.css_source)
  });
}

function summarizeTemplateDependencyInfo(info) {
  if (!info || typeof info !== 'object') {
    return info;
  }

  return omitUndefined({
    template: info.template ? summarizeTemplate(info.template) : undefined,
    references: Array.isArray(info.references)
      ? info.references.map((item) => omitUndefined({
        code: item.code,
        exists: item.exists,
        template_id: item.template_id,
        name: item.name,
        type: item.type,
        status: item.status
      }))
      : undefined,
    referenced_by: Array.isArray(info.referenced_by)
      ? info.referenced_by.map((item) => omitUndefined({
        id: item.id,
        code: item.code,
        name: item.name,
        type: item.type,
        status: item.status
      }))
      : undefined,
    bindings: Array.isArray(info.bindings)
      ? info.bindings.map((item) => omitUndefined({
        id: item.id,
        target_type: item.target_type,
        target_id: item.target_id,
        template_type: item.template_type,
        template_id: item.template_id,
        created_at: item.created_at,
        updated_at: item.updated_at
      }))
      : undefined
  });
}

function summarizeTemplatePreview(preview) {
  if (!preview || typeof preview !== 'object') {
    return preview;
  }

  const html = String(preview.html || '');
  const normalizedSnippet = html
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

  return {
    html_length: html.length,
    html_snippet: normalizedSnippet
  };
}

function summarizeTemplateVariant(variant) {
  if (!variant || typeof variant !== 'object') {
    return variant;
  }

  return omitUndefined({
    id: variant.id,
    template_name: variant.template_name,
    is_selected: variant.is_selected,
    theme_templates_count: Array.isArray(variant.theme_templates) ? variant.theme_templates.length : 0,
    theme_templates: Array.isArray(variant.theme_templates)
      ? variant.theme_templates.map(summarizeTemplate)
      : undefined
  });
}

function summarizeColumn(column) {
  if (!column || typeof column !== 'object') {
    return column;
  }

  const summarizedTranslations = column.translations && typeof column.translations === 'object'
    ? Object.fromEntries(
      Object.entries(column.translations).map(([languageCode, translation]) => [
        languageCode,
        omitUndefined({
          name: translation?.name,
          title: translation?.title,
          summary: translation?.summary,
          seo_title: translation?.seo_title,
          seo_description: translation?.seo_description,
          publish_status: translation?.publish_status,
          has_content_html: Boolean(translation?.content_html),
          has_template_data: translation?.template_data != null || translation?.template_data_json != null
        })
      ])
    )
    : undefined;

  return omitUndefined({
    id: column.id,
    parent_id: column.parent_id,
    column_type: column.column_type,
    route_path: column.route_path,
    content_model_id: column.content_model_id,
    dir_name: column.dir_name,
    detail_rule: column.detail_rule,
    is_visible: column.is_visible,
    sort_order: column.sort_order,
    name: column.name,
    summary: column.summary,
    seo_title: column.seo_title,
    seo_description: column.seo_description,
    publish_status: column.publish_status,
    model_code: column.model_code,
    column_semantics: column.column_semantics,
    current_language_code: column.current_language_code,
    requested_language_code: column.requested_language_code,
    resolved_language_code: column.resolved_language_code,
    fallback_language_code: column.fallback_language_code,
    is_language_fallback: column.is_language_fallback,
    images_count: Array.isArray(column.images) ? column.images.length : undefined,
    has_content_html: Boolean(column.content_html),
    has_template_data: column.template_data != null || column.template_data_json != null,
    translations: summarizedTranslations
  });
}

function summarizeContentItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const base = {
    id: item.id,
    code: item.code,
    column_id: item.column_id,
    custom_url: item.custom_url,
    is_visible: item.is_visible,
    is_featured_home: item.is_featured_home,
    sort_order: item.sort_order,
    created_at: item.created_at,
    updated_at: item.updated_at,
    published_at: item.published_at,
    current_language_code: item.current_language_code,
    requested_language_code: item.requested_language_code,
    resolved_language_code: item.resolved_language_code,
    fallback_language_code: item.fallback_language_code,
    is_language_fallback: item.is_language_fallback
  };

  const translationKeys = [
    'title',
    'subtitle',
    'summary',
    'slug',
    'seo_title',
    'seo_description',
    'publish_status'
  ];

  for (const key of translationKeys) {
    if (item[key] !== undefined) {
      base[key] = item[key];
    }
  }

  base.images_count = Array.isArray(item.images) ? item.images.length : undefined;
  base.has_content_html = Boolean(item.content_html);
  base.has_template_data = item.template_data != null || item.template_data_json != null;
  if (item.translations !== undefined) {
    base.translations = item.translations;
  }

  return omitUndefined(base);
}

export function summarizePayload(payload, summaryType) {
  if (!summaryType) {
    return payload;
  }

  if (summaryType === 'template-variant') {
    if (Array.isArray(payload?.data)) {
      return { ...payload, data: payload.data.map(summarizeTemplateVariant) };
    }
    if (payload?.data) {
      return { ...payload, data: summarizeTemplateVariant(payload.data) };
    }
    return payload;
  }

  if (summaryType === 'template') {
    if (Array.isArray(payload?.data)) {
      return { ...payload, data: payload.data.map(summarizeTemplate) };
    }
    if (payload?.data) {
      return { ...payload, data: summarizeTemplate(payload.data) };
    }
    return payload;
  }

  if (summaryType === 'template-version') {
    if (Array.isArray(payload?.data)) {
      return { ...payload, data: payload.data.map(summarizeTemplateVersion) };
    }
    if (payload?.data) {
      return { ...payload, data: summarizeTemplateVersion(payload.data) };
    }
    return payload;
  }

  if (summaryType === 'template-dependency') {
    if (payload?.data) {
      return { ...payload, data: summarizeTemplateDependencyInfo(payload.data) };
    }
    return payload;
  }

  if (summaryType === 'template-preview') {
    if (payload?.data) {
      return { ...payload, data: summarizeTemplatePreview(payload.data) };
    }
    return payload;
  }

  if (summaryType === 'column') {
    if (Array.isArray(payload?.data)) {
      return { ...payload, data: payload.data.map(summarizeColumn) };
    }
    if (Array.isArray(payload?.items)) {
      return { ...payload, items: payload.items.map(summarizeColumn) };
    }
    if (payload?.data) {
      return { ...payload, data: summarizeColumn(payload.data) };
    }
    return payload;
  }

  if (summaryType === 'content-item') {
    if (Array.isArray(payload?.data)) {
      return { ...payload, data: payload.data.map(summarizeContentItem) };
    }
    if (Array.isArray(payload?.items)) {
      return { ...payload, items: payload.items.map(summarizeContentItem) };
    }
    if (payload?.data) {
      return { ...payload, data: summarizeContentItem(payload.data) };
    }
    return payload;
  }

  return payload;
}

export function buildToolResult(response, meta = {}, summaryType = null, options = {}) {
  const shouldSummarize = Boolean(summaryType) && options.summary !== false;
  const summarized = shouldSummarize ? summarizePayload(response, summaryType) : response;
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        ...summarized,
        mcp_meta: {
          ...meta,
          response_mode: shouldSummarize ? 'summary' : 'full'
        }
      }, null, 2)
    }]
  };
}
