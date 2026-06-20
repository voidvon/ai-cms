import { getDb } from '../src/db.mjs';
import { ensureTemplatesSchema, getTemplateById, publishTemplate, updateTemplate } from '../src/services/templates.mjs';

const TEMPLATE_ID = 1;

const UTILITY_HELPER_SOURCE = `function renderUtilityItems(items = []) {
  return items
    .filter((item) => item?.url)
    .map((item, index) => (
      <li key={item.url || item.name || index}>
        <a
          className="sg-global-nav__utility-link"
          href={item.url || '#'}
          target={item.openInNewTab ? '_blank' : undefined}
          rel={item.openInNewTab ? 'noreferrer' : undefined}
        >
          {item.name}
        </a>
      </li>
    ));
}

`;

const UTILITY_ARRAY_SOURCE = `                      {[
                        { href: '/about-us/', label: '关于我们' },
                        { href: '/learn-about-steam/', label: '了解蒸汽' },
                        { href: '/resources-and-design-tools/', label: '资源和设计工具' },
                        { href: '/knowledge-exchange/', label: '知识交流' }
                      ].map((item) => (
                        <li key={item.href}>
                          <a className="sg-global-nav__utility-link" href={item.href}>{item.label}</a>
                        </li>
                      ))}
`;

const UTILITY_RENDER_SOURCE = `                      {renderUtilityItems(utilityColumns)}
`;

const CONTACT_BUTTON_SOURCE = `                  <a className="sg-global-nav__contact-button sg-ui-button sg-ui-button--secondary sg-ui-button--sm" href="/contact-us/">
                    联系我们
                  </a>
`;

const CONTACT_BUTTON_CSS = `.sg-global-nav__contact-button {
  white-space: nowrap;
}
`;

const CONTACT_BUTTON_MOBILE_CSS = `  .sg-global-nav__contact-button {
    display: none;
  }
`;

function assertReplace(source, search, replacement) {
  if (source.includes(replacement)) {
    return source;
  }
  if (!source.includes(search)) {
    throw new Error(`未找到待替换内容:\n${search}`);
  }
  return source.replace(search, replacement);
}

function assertInsertBefore(source, needle, insertText) {
  if (source.includes(insertText.trim())) {
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) {
    throw new Error(`未找到插入位置:\n${needle}`);
  }
  return `${source.slice(0, index)}${insertText}${source.slice(index)}`;
}

function assertInsertAfter(source, needle, insertText) {
  if (source.includes(insertText.trim())) {
    return source;
  }
  const index = source.indexOf(needle);
  if (index === -1) {
    throw new Error(`未找到插入位置:\n${needle}`);
  }
  return `${source.slice(0, index + needle.length)}\n${insertText}${source.slice(index + needle.length)}`;
}

getDb();
ensureTemplatesSchema();

const template = getTemplateById(TEMPLATE_ID);
if (!template) {
  throw new Error(`未找到模板 ${TEMPLATE_ID}`);
}

let nextTsxSource = String(template.tsx_source || '');
nextTsxSource = assertInsertBefore(nextTsxSource, '\nfunction renderFooterLinks(columns = []) {', `${UTILITY_HELPER_SOURCE}\n`);
nextTsxSource = assertReplace(nextTsxSource, '  siteColumns = [],  currentPage,\n', '  siteColumns = [],\n  utilityColumns = [],\n  currentPage,\n');
nextTsxSource = assertReplace(nextTsxSource, UTILITY_ARRAY_SOURCE, UTILITY_RENDER_SOURCE);
nextTsxSource = assertInsertBefore(nextTsxSource, '                  <div className="sg-global-nav__search">\n', CONTACT_BUTTON_SOURCE);

let nextCssSource = String(template.css_source || '');
nextCssSource = assertInsertAfter(nextCssSource, `.sg-global-nav__search {
  display: flex;
  align-items: center;
}`, CONTACT_BUTTON_CSS);
nextCssSource = assertInsertAfter(nextCssSource, `  .sg-global-nav__utility--inline {
    display: none;
  }`, CONTACT_BUTTON_MOBILE_CSS);

updateTemplate(TEMPLATE_ID, {
  ...template,
  tsx_source: nextTsxSource,
  css_source: nextCssSource
});

publishTemplate(TEMPLATE_ID, '恢复头部联系我们按钮并移除顶部菜单模板硬编码');

console.log('Shell template updated.');
