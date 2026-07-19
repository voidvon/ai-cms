import { getDb } from '../src/db.mjs';
import { ensureTemplatesSchema, getTemplateById, publishTemplate, updateTemplate } from '../src/services/templates.mjs';

const TEMPLATE_ID = 1;

const FOOTER_META_HELPER_SOURCE = `function renderFooterMetaRecords(footerMeta = {}, site) {
  const configuredRecords = Array.isArray(footerMeta?.records)
    ? footerMeta.records.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const fallbackRecords = [
    site?.company_name || site?.web_name || '',
    site?.icp_number || '',
    site?.company_phone || '',
    site?.company_address || ''
  ].map((item) => String(item || '').trim()).filter(Boolean);
  const records = configuredRecords.length > 0 ? configuredRecords : fallbackRecords;
  return records.map((record, index) => <p key={index}>{record}</p>);
}

`;

function assertReplace(source, search, replacement) {
  if (source.includes(replacement)) {
    return source;
  }
  if (!source.includes(search)) {
    throw new Error(`未找到待替换内容:\\n${search}`);
  }
  return source.replace(search, replacement);
}

function assertInsertBefore(source, needle, insertText) {
  if (source.includes(insertText.trim())) {
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) {
    throw new Error(`未找到插入位置:\\n${needle}`);
  }
  return `${source.slice(0, index)}${insertText}${source.slice(index)}`;
}

getDb();
ensureTemplatesSchema();

const template = getTemplateById(TEMPLATE_ID);
if (!template) {
  throw new Error(`未找到模板 ${TEMPLATE_ID}`);
}

let nextTsxSource = String(template.tsx_source || '');
nextTsxSource = assertInsertBefore(nextTsxSource, '\nfunction renderFooterLinks(columns = []) {', `${FOOTER_META_HELPER_SOURCE}`);
nextTsxSource = assertReplace(
  nextTsxSource,
  'export default function Template({ site, siteColumns = [], utilityColumns = [], footerColumns = [], languageSwitcher = null, currentPage, currentContent, currentColumn, currentSection, children, slots = {}, component }) {',
  'export default function Template({ site, siteColumns = [], utilityColumns = [], footerColumns = [], footerMeta = null, languageSwitcher = null, currentPage, currentContent, currentColumn, currentSection, children, slots = {}, component }) {'
);
nextTsxSource = assertReplace(
  nextTsxSource,
  `                <div className="sg-site-footer__records">
                  <p>{site?.company_name || site?.web_name || ''}</p>
                  {site?.icp_number ? <p>{site.icp_number}</p> : null}
                  {site?.company_phone ? <p>{site.company_phone}</p> : null}
                  {site?.company_address ? <p>{site.company_address}</p> : null}
                </div>`,
  `                <div className="sg-site-footer__records">
                  {renderFooterMetaRecords(footerMeta, site)}
                </div>`
);

updateTemplate(TEMPLATE_ID, {
  ...template,
  tsx_source: nextTsxSource,
});

publishTemplate(TEMPLATE_ID, '为壳模板增加可配置 footerMeta 展示');

console.log('Shell footer template updated.');
