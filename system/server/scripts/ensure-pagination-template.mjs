import { createTemplate, ensureTemplatesSchema, getPublishedTemplateByCode, publishTemplate } from '../src/services/templates.mjs';
import { getSelectedTemplateVariant } from '../src/services/template-variants.mjs';

ensureTemplatesSchema();

const selectedTheme = getSelectedTemplateVariant();
const themeId = selectedTheme?.id || 1;
const existing = getPublishedTemplateByCode('pagination', themeId);

if (!existing) {
  const template = createTemplate({
    theme_id: themeId,
    name: '分页组件',
    type: 'component',
    code: 'pagination',
    engine: 'tsx',
    tsx_source: `export default function Template(props) {
  const pagination = props.pagination || {};
  const pagerText = props.pagerText || {};
  return (
    <table width="90%" border="0" align="center" cellPadding="0" cellSpacing="0">
      <tbody>
        <tr>
          <td height="45" align="center">
            {pagerText.recordsPrefix} <strong>{pagination.totalRecords || 0}</strong> {pagerText.recordsSuffix}
            {' '}
            <a href={pagination.firstHref || '#'}>{pagerText.first}</a>
            {' '}
            {pagination.previousHref ? <a href={pagination.previousHref}>{pagerText.previous}</a> : <span>{pagerText.previous}</span>}
            {' '}
            {pagination.nextHref ? <a href={pagination.nextHref}>{pagerText.next}</a> : <span>{pagerText.next}</span>}
            {' '}
            <a href={pagination.lastHref || '#'}>{pagerText.last}</a>
            {' '}
            {pagerText.pageLabel}<strong> {pagination.pageNumber || 1}/{pagination.pageCount || 1} </strong> <strong>{pagination.pageSize || 0}</strong>{pagerText.perPageSuffix}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
`,
    css_source: '',
    status: 'draft',
    sort_order: 1
  });
  publishTemplate(template.id, '初始化分页模板');
  console.log(`Created pagination template #${template.id} for theme ${themeId}.`);
} else {
  console.log(`Pagination template already exists for theme ${themeId}.`);
}
