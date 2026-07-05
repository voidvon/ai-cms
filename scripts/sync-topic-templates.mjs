import {
  createTemplate,
  listTemplates,
  publishTemplate,
  updateTemplate,
  upsertTemplateBinding
} from '../system/server/src/services/templates.mjs';
import { listColumns } from '../system/server/src/services/columns.mjs';
import { getContentModelByCode } from '../system/server/src/services/content-models.mjs';
import { ensureContentModelStorageSchema } from '../system/server/src/services/content-model-storage.mjs';

const THEME_ID = 1;

const TOPIC_LIST_TSX = String.raw`import React from 'react';

function uniqueItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter((item) => {
    const key = item.url || item.id || item.title;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export default function Template(props) {
  const cards = uniqueItems(props.articleCardItems || props.items || []);
  const column = props.currentColumnItem || {};
  const description = props.currentColumnDescription || column.seoDescription || props.itemDescription || props.description || '';
  const masthead = props.component('short_masthead', {
    eyebrow: props.sectionLabel || 'Topics',
    title: props.title || column.name || 'Topics',
    image: props.currentColumnHeroImage || props.currentSectionHeroImage || '',
    imageAlt: props.title || column.name || 'Topics',
    className: 'short-masthead topic-masthead'
  });
  const shell = props.component('shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const content = (
    <main className="sg-content-shell topic-page">
      <section className="topic-list bg--white">
        <div className="topic-wrap">
          <div className="topic-list__header">
            <div>
              <p className="topic-kicker">Product and solution topics</p>
              <h1 className="topic-title">{props.title || column.name || 'Topics'}</h1>
            </div>
            {description ? <p className="topic-description">{description}</p> : null}
          </div>

          {cards.length > 0 ? (
            <div className="topic-grid">
              {cards.map((item, index) => (
                <article className="topic-card" key={item.url || item.title || index}>
                  <div className="topic-card__body">
                    <h2 className="topic-card__title"><a href={item.url || '#'}>{item.title}</a></h2>
                    {item.summary ? <p className="topic-card__summary">{item.summary}</p> : null}
                  </div>
                  <a className="topic-card__link" href={item.url || '#'}>View topic</a>
                </article>
              ))}
            </div>
          ) : (
            <div className="topic-empty">No topic content has been published for this column.</div>
          )}

          {props.pagination?.pageCount > 1 ? props.component('pagination', { pagination: props.pagination, pagerText: props.pagerText }) : null}
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}`;

const TOPIC_DETAIL_TSX = String.raw`import React from 'react';

function parseLines(value) {
  return String(value || '')
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function Template(props) {
  const topic = props.currentArticle || props.currentContent || {};
  const title = topic.title || props.title || 'Topic';
  const summary = topic.summary || props.itemDescription || '';
  const keywords = parseLines(topic.keyword_group || topic.keywordGroup || '');
  const masthead = props.component('short_masthead', {
    eyebrow: props.currentColumnItem?.name || props.sectionLabel || 'Topics',
    title,
    image: topic.image || props.currentColumnHeroImage || props.currentSectionHeroImage || '',
    imageAlt: title,
    className: 'short-masthead topic-masthead'
  });
  const shell = props.component('shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const content = (
    <main className="sg-content-shell topic-page">
      <section className="topic-detail bg--white">
        <div className="topic-wrap topic-detail__layout">
          <article className="topic-detail__main">
            {summary ? <p className="topic-lead">{summary}</p> : null}
            {props.bodyHtml ? (
              <div className="topic-body" dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />
            ) : (
              <div className="topic-body">
                <p>This topic page is ready for SEO copy, product selection guidance, related resources, and FAQs.</p>
              </div>
            )}
          </article>
          <aside className="topic-detail__aside">
            <div className="topic-panel">
              <h2>Topic data</h2>
              <dl>
                <dt>Section</dt>
                <dd>{props.sectionLabel || 'Topics'}</dd>
                <dt>Column</dt>
                <dd>{props.columnName || props.currentColumnItem?.name || '-'}</dd>
              </dl>
            </div>
            {keywords.length > 0 ? (
              <div className="topic-panel">
                <h2>Keywords</h2>
                <div className="topic-tags">
                  {keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}`;

const TOPIC_CSS = String.raw`.topic-page {
  background: #fff;
}

.topic-wrap {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
}

.topic-list,
.topic-detail {
  padding: 48px 0 64px;
}

.topic-list__header {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(280px, 0.7fr);
  gap: 32px;
  align-items: end;
  margin-bottom: 32px;
}

.topic-kicker {
  margin: 0 0 8px;
  color: #b02a30;
  font-size: 0.875rem;
  font-weight: 700;
  text-transform: uppercase;
}

.topic-title {
  margin: 0;
  color: #202020;
  font-size: 2.25rem;
  line-height: 1.15;
  font-weight: 700;
}

.topic-description,
.topic-lead {
  margin: 0;
  color: #4c4c4c;
  font-size: 1.05rem;
  line-height: 1.65;
}

.topic-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.topic-card {
  display: flex;
  min-height: 220px;
  flex-direction: column;
  justify-content: space-between;
  border: 1px solid #d8d8d8;
  border-top: 4px solid #b02a30;
  background: #fff;
  padding: 24px;
}

.topic-card__title {
  margin: 0 0 12px;
  color: #202020;
  font-size: 1.25rem;
  line-height: 1.3;
}

.topic-card__title a {
  color: inherit;
  text-decoration: none;
}

.topic-card__title a:hover {
  color: #b02a30;
}

.topic-card__summary {
  margin: 0;
  color: #555;
  line-height: 1.55;
}

.topic-card__link {
  margin-top: 20px;
  color: #b02a30;
  font-weight: 700;
  text-decoration: none;
}

.topic-empty {
  border: 1px solid #e1e1e1;
  padding: 24px;
  color: #666;
}

.topic-detail__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 40px;
  align-items: start;
}

.topic-detail__main {
  min-width: 0;
}

.topic-body {
  margin-top: 24px;
  color: #333;
  line-height: 1.7;
}

.topic-body h2,
.topic-body h3 {
  color: #202020;
}

.topic-detail__aside {
  display: grid;
  gap: 16px;
}

.topic-panel {
  border: 1px solid #d8d8d8;
  padding: 20px;
  background: #f8f8f8;
}

.topic-panel h2 {
  margin: 0 0 16px;
  font-size: 1rem;
  color: #202020;
}

.topic-panel dl {
  display: grid;
  gap: 10px;
  margin: 0;
}

.topic-panel dt {
  color: #666;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
}

.topic-panel dd {
  margin: 0;
  color: #202020;
}

.topic-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.topic-tags span {
  border: 1px solid #d1d1d1;
  background: #fff;
  padding: 6px 10px;
  color: #333;
  font-size: 0.875rem;
}

@media (max-width: 900px) {
  .topic-list__header,
  .topic-detail__layout,
  .topic-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .topic-wrap {
    width: min(100% - 24px, 1180px);
  }

  .topic-list,
  .topic-detail {
    padding: 32px 0 48px;
  }

  .topic-title {
    font-size: 1.75rem;
  }

  .topic-card {
    min-height: 0;
  }
}`;

ensureContentModelStorageSchema();

const topicModel = getContentModelByCode('topic');
if (!topicModel?.id) {
  throw new Error('topic 内容模型不存在');
}

const topicList = upsertTemplate({
  name: 'Spirax 专题列表模板',
  code: 'topic_list',
  type: 'list',
  tsx_source: TOPIC_LIST_TSX,
  css_source: TOPIC_CSS,
  sort_order: 65
});
const topicDetail = upsertTemplate({
  name: 'Spirax 专题详情模板',
  code: 'topic_detail',
  type: 'content',
  tsx_source: TOPIC_DETAIL_TSX,
  css_source: TOPIC_CSS,
  sort_order: 66
});

const topicColumns = listColumns({ languageCode: null })
  .filter((column) => Number(column.content_model_id || 0) === Number(topicModel.id));

for (const column of topicColumns) {
  upsertTemplateBinding({
    theme_id: THEME_ID,
    target_type: 'column',
    target_id: column.id,
    template_type: 'list',
    template_id: topicList.id
  });
  upsertTemplateBinding({
    theme_id: THEME_ID,
    target_type: 'column',
    target_id: column.id,
    template_type: 'content',
    template_id: topicDetail.id
  });
}

console.log(JSON.stringify({
  topicListTemplateId: topicList.id,
  topicDetailTemplateId: topicDetail.id,
  boundTopicColumns: topicColumns.length
}, null, 2));

function upsertTemplate(input) {
  const existing = listTemplates({ themeId: THEME_ID })
    .find((template) => template.code === input.code);
  if (!existing) {
    return createTemplate({
      theme_id: THEME_ID,
      engine: 'tsx',
      status: 'published',
      is_default: 0,
      ...input
    });
  }

  updateTemplate(existing.id, {
    theme_id: THEME_ID,
    engine: 'tsx',
    status: existing.status || 'published',
    is_default: existing.is_default || 0,
    ...input
  });
  return publishTemplate(existing.id, '同步专题模板');
}
