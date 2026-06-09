import { execute, getDb, queryAll, queryOne } from '../db.mjs';

export const TEMPLATE_TYPES = ['home', 'list', 'content', 'component'];
export const TEMPLATE_ENGINES = ['html', 'tsx'];
const MAX_TEMPLATE_VERSIONS = 10;

const DEFAULT_PAGE_TEMPLATES = [
  {
    type: 'home',
    code: 'home_default',
    name: '默认首页模板',
    sort_order: 10,
    content: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>{{meta.1.title}}</title>
  <meta name="robots" content="all" />
  <meta name="keywords" content="{{meta.1.meta_keywords}}" />
  <meta name="description" content="{{meta.1.meta_descriptions}}" />
  <meta http-equiv="X-UA-Compatible" content="IE=EmulateIE7" />
  <link rel="icon" href="/favicon.ico" type="image/x-icon" />
  <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
  <link href="css/webmain.css" rel="stylesheet" type="text/css" />
  <base target="_blank" />
</head>
<body>
#component("indextop")#
<div id="index_main" class="clearfix">
  <div class="index-left">
    <div class="index-news">
      <h2><span>新闻中心</span><a href="/news"><img src="images/more.gif" width="32" height="5" alt="新闻中心" /></a></h2>
      <ul>{{{newsIndexHtml}}}</ul>
    </div>
    <div class="index-about">
      <h2><span>关于我们</span><a href="/about"><img src="images/more.gif" width="32" height="5" alt="关于我们" /></a></h2>
      <p><img src="images/index_aboutpic.jpg" alt="关于我们" width="145" height="181" />#component("about")#</p>
    </div>
    <div class="index-newproducts">
      <h2><a href="/valve"><img src="images/more.gif" width="32" height="5" alt="产品展示" /></a></h2>
      <div class="productsroll"><ul id="ScrollBox" class="clearfix">{{{featuredProductsHtml}}}</ul></div>
    </div>
    <div class="index-products">
      <h2><span>产品展示</span><a href="/valve"><img src="images/more.gif" width="32" height="5" alt="产品展示" /></a></h2>
      <ul class="clearfix">{{{featuredProductLinksHtml}}}</ul>
    </div>
  </div>
  <div class="index-right">
    <div class="index-search"><h2><span>站内搜索</span></h2>#component("search")#</div>
    <div class="index-jobs">
      <h2><span>阀门知识</span><a href="/service/"><img src="images/more.gif" width="32" height="5" alt="阀门知识" /></a></h2>
      <ul>{{{serviceIndexHtml}}}</ul>
    </div>
    <div class="index-contact">
      <h2><span>联系我们</span></h2>
      <p>地址: {{site.company_address}}<br />电话: {{site.company_phone}}<br />传真: {{site.company_fax}}<br />手机: {{site.web_mobile}}<br />邮箱: {{site.company_email}}</p>
    </div>
  </div>
</div>
#component("indexfoot")#
</body>
</html>`
  },
  {
    type: 'list',
    code: 'list_product',
    name: '产品列表模板',
    engine: 'tsx',
    sort_order: 20,
    content: `export default function ListTemplate({
  site,
  smallName,
  bigName,
  prodKeywords,
  productsSmallCatHtml,
  fragments,
  items,
  pagerHtml,
  component,
  Raw,
}) {
  const rows = []
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2))
  }

  return (
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta httpEquiv="Content-Type" content="text/html; charset=utf-8" />
        <title>{smallName + '|' + smallName + '型号|' + smallName + '尺寸|' + site.web_name}</title>
        <meta name="keywords" content={prodKeywords || ''} />
        <meta name="description" content={smallName + '制造标准：中国GB、美标API、德标DIN等标准生产。'} />
        <link href="/css/c.css" rel="stylesheet" type="text/css" />
      </head>
      <body>
        <Raw html={component('indextop')} />
        <div id="page_main" className="clearfix">
          <div className="page-right">
            <div className="site-nav">
              <span>当前位置 : </span>
              <a href="/index.html">公司主页</a> - <a href="/valve/">产品展示</a> - {bigName} - {smallName}
            </div>
            <table width="100%" border={0} cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr><td><Raw html={productsSmallCatHtml} /></td></tr>
              </tbody>
            </table>
            <div className="page-products">
              <ul className="clearfix">
                <table width="98%" border={0} cellPadding={0} cellSpacing={0} align="center">
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((item) => (
                          <td key={item.id} width="50%" valign="top" className="in6" height="100">
                            <table width="100%" height="100" border={0} cellPadding={0} cellSpacing={0}>
                              <tbody>
                                <tr>
                                  <td width="39%" rowSpan={2}>
                                    <img src={item.image} alt={item.name} width="180" height="138" />
                                  </td>
                                  <td width="61%" height="20">
                                    <a href={item.url} className="Font_2E4690_a in4">{item.name}</a>
                                  </td>
                                </tr>
                                <tr><td valign="top"><Raw html={item.summary} /></td></tr>
                              </tbody>
                            </table>
                          </td>
                        ))}
                        {row.length === 1 && <td width="50%" valign="top" className="in6" height="100">&nbsp;</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Raw html={pagerHtml} />
              </ul>
            </div>
          </div>
          <div className="page-left">
            <div className="left-products">
              <h2><span>产品展示 TSX</span></h2>
              <div id="LeftMenu" className="ddsmoothmenu-v">
                <ul><Raw html={fragments.productsMenuHtml} /></ul>
              </div>
            </div>
          </div>
        </div>
        <Raw html={component('botten')} />
      </body>
    </html>
  )
}`
  },
  {
    type: 'list',
    code: 'list_article',
    name: '文章列表模板',
    sort_order: 30,
    content: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>{{title}}_{{site.web_name}}</title>
  <meta name="keywords" content="{{title}}" />
  <meta name="description" content="{{title}}" />
  <link href="/img/css.css" type="text/css" rel="stylesheet" />
  <link href="/css/webmain.css" rel="stylesheet" type="text/css" />
</head>
<body>
#component("top")#
<table width="972" border="0" align="center" cellpadding="0" cellspacing="0">
  <tr>
    <td width="173" valign="top"><div class="Corporation_left">{{{sectionCategoryHtml}}}</div><div class="Corporation_left">{{{fragments.productsMenuHtml}}}</div></td>
    <td width="812" valign="top">
      <div class="site-nav"><a href="/">首页</a> - <a href="/{{sectionDir}}/">{{sectionLabel}}</a> - {{title}}</div>
      <div class="page-products">
        #loop(items)#
          #component("article_list_item")#
        #/loop#
        {{{pagerHtml}}}
      </div>
    </td>
  </tr>
</table>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'list',
    code: 'list_job',
    name: '招聘列表模板',
    sort_order: 40,
    content: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>{{meta.5.title}} - {{site.web_name}}</title>
  <meta name="keywords" content="{{meta.5.meta_keywords}}" />
  <meta name="description" content="{{meta.5.meta_descriptions}}" />
  <link href="/img/css.css" type="text/css" rel="stylesheet" />
</head>
<body>
#component("top")#
<table width="986" border="0" align="center" cellpadding="0" cellspacing="0">
  <tr><td width="173" valign="top">{{{fragments.productsMenuHtml}}}</td><td width="824" valign="top">
    <table width="100%" border="1" cellpadding="0" cellspacing="0" bordercolor="#CCCCCC">
      #loop(items)#
        #component("job_list_item")#
      #/loop#
    </table>
    {{{pagerHtml}}}
  </td></tr>
</table>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'content',
    code: 'content_default',
    name: '默认内容模板',
    sort_order: 50,
    content: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>{{title}}_{{site.web_name}}</title>
  <meta name="keywords" content="{{title}}" />
  <meta name="description" content="{{title}}" />
  <link href="/css/c.css" rel="stylesheet" type="text/css" />
</head>
<body>
#component("indextop")#
<div id="page_main" class="clearfix">
  <div class="page-right">
    <div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> &gt;&gt; {{title}}</div>
    <div class="page-products"><ul class="clearfix">{{{contentHtml}}}</ul></div>
  </div>
  <div class="page-left">{{{fragments.aboutCategoryHtml}}}</div>
</div>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'content',
    code: 'content_product',
    name: '产品内容模板',
    sort_order: 60,
    content: `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>{{title}}|{{prodKeywords}}</title>
  <meta name="keywords" content="{{prodKeywords}}" />
  <meta name="description" content="{{prodDescription}}" />
  <link href="/css/c.css" rel="stylesheet" type="text/css" />
</head>
<body>
#component("indextop")#
<div id="page_main" class="clearfix">
  <div class="page-right">
    <div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> - <a href="/valve/">产品展示</a> - {{title}}</div>
    <table width="100%" border="0" cellpadding="0" cellspacing="0" class="in4">
      <tr><td width="19%" align="center" valign="top"><img src="{{image}}" alt="{{title}}" width="160" height="134" /></td><td valign="top"><strong>{{title}}</strong><br />产品型号：{{code}}<br />咨询电话：{{site.company_phone}}</td><td width="40%" valign="top">{{{relatedProductsHtml}}}</td></tr>
    </table>
    <div class="page-products"><ul class="clearfix"><table width="100%" border="0"><tr><td height="30" class="prod_bottom_dasheds">产品介绍</td></tr><tr><td class="prod_sp">{{{bodyHtml}}}</td></tr></table></ul></div>
  </div>
  <div class="page-left"><div id="LeftMenu" class="ddsmoothmenu-v"><ul>{{{fragments.productsMenuHtml}}}</ul></div></div>
</div>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'content',
    code: 'content_article',
    name: '文章内容模板',
    sort_order: 70,
    content: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>{{title}}_{{site.web_name}}</title>
  <meta name="keywords" content="{{title}},{{newsKeywords}}" />
  <meta name="description" content="{{newsDescription}}" />
  <link href="/img/css.css" type="text/css" rel="stylesheet" />
  <link href="/css/webmain.css" rel="stylesheet" type="text/css" />
</head>
<body>
#component("top")#
<table width="972" border="0" align="center" cellpadding="0" cellspacing="0">
  <tr><td width="173" valign="top"><div class="Corporation_left">{{{sectionCategoryHtml}}}</div><div class="Corporation_left">{{{fragments.productsMenuHtml}}}</div></td>
  <td width="812" valign="top">
    <div class="site-nav"><a href="/">首页</a> - <a href="/{{sectionDir}}/">{{sectionLabel}}</a> - {{catName}}</div>
    <h1 class="Font-Weight Font_Size in4" align="center">{{title}}</h1>
    <div class="news_sp in4">{{{bodyHtml}}}</div>
    <table width="95%" border="0" align="center"><tr><td height="30" class="Font-Weight">&nbsp;上一条：{{{previousHtml}}} &nbsp;&nbsp;&nbsp;&nbsp; 下一条：{{{nextHtml}}}</td></tr></table>
  </td></tr>
</table>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'content',
    code: 'content_contact',
    name: '联系页面模板',
    sort_order: 80,
    content: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>联系{{site.web_name}}</title>
  <meta name="keywords" content="{{meta.1.meta_keywords}}" />
  <meta name="description" content="{{meta.1.meta_descriptions}}" />
  <link href="/css/c.css" rel="stylesheet" type="text/css" />
</head>
<body>
#component("indextop")#
<div id="page_main" class="clearfix"><div class="page-right"><div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> &gt;&gt; 联系我们</div><div class="page-products">{{{contactTableHtml}}}</div></div><div class="page-left">{{{fragments.productsMenuHtml}}}</div></div>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'content',
    code: 'content_message',
    name: '留言页面模板',
    sort_order: 90,
    content: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>在线留言_{{site.web_name}}</title>
  <meta name="keywords" content="{{meta.12.meta_keywords}}" />
  <meta name="description" content="{{meta.12.meta_descriptions}}" />
  <link href="/css/c.css" rel="stylesheet" type="text/css" />
</head>
<body>
#component("indextop")#
<div id="page_main" class="clearfix"><div class="page-right"><div class="site-nav"><span>当前位置 : </span><a href="/index.html">公司主页</a> &gt;&gt; 在线留言</div><form id="addform" name="addform" method="post" action="/ajaxcode/prodmsg?action=msgadd"><table width="98%" border="0" align="center"><tr><td>姓名：</td><td><input name="name" type="text" id="name" /></td></tr><tr><td>电话：</td><td><input name="phone" type="text" id="phone" /></td></tr><tr><td>Email：</td><td><input name="email" type="text" id="email" /></td></tr><tr><td>主题：</td><td><input name="Title" type="text" id="Title" size="62" /></td></tr><tr><td>内容：</td><td><textarea name="content" cols="60" rows="6" id="content"></textarea></td></tr><tr><td colspan="2" align="center"><input type="submit" value="提交留言" /></td></tr></table></form></div><div class="page-left">{{{messageSidebarProductsHtml}}}</div></div>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'content',
    code: 'content_job',
    name: '招聘内容模板',
    sort_order: 100,
    content: `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <title>{{title}} - {{site.web_name}}</title>
  <meta name="keywords" content="{{meta.5.meta_keywords}}" />
  <meta name="description" content="{{meta.5.meta_descriptions}}" />
  <link href="/img/css.css" type="text/css" rel="stylesheet" />
</head>
<body>
#component("top")#
<table width="986" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td width="173" valign="top">{{{fragments.productsMenuHtml}}}</td><td width="824" valign="top"><table width="95%" border="1" align="center" cellpadding="0" cellspacing="0"><tr><td width="11%" height="25">职位名称</td><td>{{title}}</td></tr><tr><td>工作地点</td><td>{{address}}</td></tr><tr><td>需求人数</td><td>{{openings}}</td></tr><tr><td>发布日期</td><td>{{date}}</td></tr><tr><td>联系人</td><td>{{contactPerson}}</td></tr><tr><td>联系电话</td><td>{{phone}}</td></tr><tr><td>具体要求</td><td>{{{requirementsHtml}}}</td></tr></table></td></tr></table>
#component("botten")#
</body>
</html>`
  },
  {
    type: 'component',
    code: 'search',
    name: '站内搜索组件',
    sort_order: 200,
    content: `<form id="form2" name="form2" method="post" action="/search"><p><input name="ProductsName" type="text" id="ProductsName" value="找找看" size="18" class="Font_666666_a" onfocus="this.value='';" /><input name="searchbutton" type="submit" id="searchbutton" value="" /></p></form>`
  },
  {
    type: 'component',
    code: 'product_list_item',
    name: '产品列表项组件',
    sort_order: 210,
    content: `{{{item.rowOpenHtml}}}
<td width="50%" valign="top" class="in6" height="100">
  <table width="100%" height="100" border="0" cellpadding="0" cellspacing="0">
    <tr>
      <td width="39%" rowspan="2"><img src="{{item.image}}" alt="{{item.name}}" width="180" height="138" /></td>
      <td width="61%" height="20"><a href="{{item.url}}" class="Font_2E4690_a in4">{{item.name}}</a></td>
    </tr>
    <tr><td valign="top">{{{item.summary}}}</td></tr>
  </table>
</td>
{{{item.placeholderHtml}}}
{{{item.rowCloseHtml}}}`
  },
  {
    type: 'component',
    code: 'article_list_item',
    name: '文章列表项组件',
    sort_order: 220,
    content: `<table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">
  <tr>
    <td width="19" height="20" align="center" valign="middle" class="news_bottom_line">&nbsp;<img src="../../Skin/blue/Images/triangle.jpg" width="3" height="5" /></td>
    <td width="726" valign="middle" class="news_bottom_line Font-Weight"><a href="{{item.url}}" class="Font_2e4690_a ">{{item.title}}</a> | {{item.date}}  </td>
  </tr>
  <tr>
    <td height="50" colspan="2" valign="middle" class="news_bottom_line news_sp {{item.summaryClassName}}" >{{{item.summary}}}</td>
  </tr>
</table>`
  },
  {
    type: 'component',
    code: 'job_list_item',
    name: '招聘列表项组件',
    sort_order: 230,
    content: `<tr>
  <td width="59%" height="30">&nbsp;&nbsp;◆&nbsp;&nbsp;<a href="{{item.url}}" class="Font_000000_B_a">{{item.title}}</a></td>
  <td width="13%" align="center">{{item.openings}}</td>
  <td width="18%" align="center">{{item.address}}</td>
  <td width="10%" align="center">{{item.date}}</td>
</tr>`
  }
];

const LEGACY_COMPONENT_NAMES = [
  ['#BM_indextop#', 'indextop', '首页头部组件'],
  ['#BM_top#', 'top', '通用头部组件'],
  ['#BM_botten#', 'botten', '底部组件'],
  ['#BM_indexfoot#', 'indexfoot', '首页底部组件'],
  ['#BM_about#', 'about', '关于我们组件']
];

let schemaEnsured = false;
let defaultsEnsured = false;

export function ensureTemplatesSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('home', 'list', 'content', 'component')),
      code TEXT NOT NULL UNIQUE,
      engine TEXT NOT NULL DEFAULT 'html' CHECK (engine IN ('html', 'tsx')),
      content TEXT NOT NULL DEFAULT '',
      published_content TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      is_default INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT
    );

    CREATE TABLE IF NOT EXISTS template_bindings (
      id INTEGER PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_id INTEGER,
      template_type TEXT NOT NULL CHECK (template_type IN ('home', 'list', 'content')),
      template_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (target_type, target_id, template_type),
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_versions (
      id INTEGER PRIMARY KEY,
      template_id INTEGER NOT NULL,
      version_no INTEGER NOT NULL,
      engine TEXT NOT NULL DEFAULT 'html',
      content TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_templates_type_sort ON templates(type, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
    CREATE INDEX IF NOT EXISTS idx_template_bindings_target ON template_bindings(target_type, target_id, template_type);
    CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id, version_no);
  `);

  addColumnIfMissing('templates', 'engine', "TEXT NOT NULL DEFAULT 'html'");
  addColumnIfMissing('template_versions', 'engine', "TEXT NOT NULL DEFAULT 'html'");

  schemaEnsured = true;
}

export function ensureDefaultTemplates() {
  ensureTemplatesSchema();
  if (defaultsEnsured) {
    return;
  }

  for (const template of DEFAULT_PAGE_TEMPLATES) {
    insertTemplateIfMissing(template);
  }

  for (const [labelName, code, fallbackName] of LEGACY_COMPONENT_NAMES) {
    const label = queryOne('SELECT content FROM custom_labels WHERE lower(name) = lower(?) LIMIT 1', [labelName]);
    insertTemplateIfMissing({
      type: 'component',
      code,
      name: fallbackName,
      sort_order: 150,
      content: label?.content || ''
    });
  }

  const labels = queryAll('SELECT name, content FROM custom_labels ORDER BY id ASC');
  for (const label of labels) {
    const code = legacyLabelNameToComponentCode(label.name);
    if (!code) {
      continue;
    }
    insertTemplateIfMissing({
      type: 'component',
      code,
      name: `${code} 组件`,
      sort_order: 300,
      content: label.content || ''
    });
  }

  defaultsEnsured = true;
}

export function listTemplates({ type } = {}) {
  ensureDefaultTemplates();
  const params = [];
  let where = '';
  if (type) {
    if (!TEMPLATE_TYPES.includes(type)) {
      throw new Error('invalid template type');
    }
    where = 'WHERE type = ?';
    params.push(type);
  }

  return queryAll(
    `
      SELECT id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      ${where}
      ORDER BY type ASC, sort_order ASC, id ASC
    `,
    params
  );
}

export function getTemplateById(id) {
  ensureDefaultTemplates();
  return queryOne(
    `
      SELECT id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      WHERE id = ?
    `,
    [id]
  ) || null;
}

export function getPublishedTemplateByCode(code) {
  ensureDefaultTemplates();
  return queryOne(
    `
      SELECT id, name, type, code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE code = ? AND status = 'published'
      LIMIT 1
    `,
    [normalizeCode(code)]
  ) || null;
}

export function getPublishedTemplateById(id) {
  ensureDefaultTemplates();
  return queryOne(
    `
      SELECT id, name, type, code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE id = ? AND status = 'published'
      LIMIT 1
    `,
    [id]
  ) || null;
}

export function resolvePublishedTemplate({ templateType, targets = [], fallbackCode }) {
  ensureDefaultTemplates();

  for (const target of targets) {
    const binding = getTemplateBinding(target.target_type, target.target_id ?? null, templateType);
    if (!binding?.template_id) {
      continue;
    }
    const template = getPublishedTemplateById(binding.template_id);
    if (template) {
      return template;
    }
  }

  return getPublishedTemplateByCode(fallbackCode);
}

export function listPublishedComponents() {
  ensureDefaultTemplates();
  return queryAll(
    `
      SELECT code, engine, coalesce(published_content, content) AS content
      FROM templates
      WHERE type = 'component' AND status = 'published'
      ORDER BY sort_order ASC, id ASC
    `
  );
}

export function listTemplateBindings() {
  ensureDefaultTemplates();
  return queryAll(
    `
      SELECT
        b.id,
        b.target_type,
        b.target_id,
        b.template_type,
        b.template_id,
        b.created_at,
        b.updated_at,
        t.name AS template_name,
        t.code AS template_code
      FROM template_bindings b
      LEFT JOIN templates t ON t.id = b.template_id
      ORDER BY b.target_type ASC, coalesce(b.target_id, 0) ASC, b.template_type ASC
    `
  );
}

export function getTemplateBinding(targetType, targetId, templateType) {
  ensureTemplatesSchema();
  const normalized = normalizeBindingTarget(targetType, targetId, templateType);
  const whereTargetId = normalized.target_id == null ? 'target_id IS NULL' : 'target_id = ?';
  const params = normalized.target_id == null
    ? [normalized.target_type, normalized.template_type]
    : [normalized.target_type, normalized.target_id, normalized.template_type];

  return queryOne(
    `
      SELECT id, target_type, target_id, template_type, template_id, created_at, updated_at
      FROM template_bindings
      WHERE target_type = ? AND ${whereTargetId} AND template_type = ?
      LIMIT 1
    `,
    params
  ) || null;
}

export function upsertTemplateBinding(input) {
  ensureTemplatesSchema();
  const payload = normalizeBindingInput(input);
  const existing = getTemplateBinding(payload.target_type, payload.target_id, payload.template_type);
  const now = new Date().toISOString();

  if (existing) {
    execute(
      `
        UPDATE template_bindings
        SET template_id = ?, updated_at = ?
        WHERE id = ?
      `,
      [payload.template_id, now, existing.id]
    );
    return getTemplateBinding(payload.target_type, payload.target_id, payload.template_type);
  }

  const result = execute(
    `
      INSERT INTO template_bindings (target_type, target_id, template_type, template_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [payload.target_type, payload.target_id, payload.template_type, payload.template_id, now, now]
  );
  return queryOne(
    `
      SELECT id, target_type, target_id, template_type, template_id, created_at, updated_at
      FROM template_bindings
      WHERE id = ?
    `,
    [result.lastInsertRowid]
  );
}

export function deleteTemplateBinding(id) {
  ensureTemplatesSchema();
  const existing = queryOne(
    'SELECT id, target_type, target_id, template_type, template_id FROM template_bindings WHERE id = ?',
    [id]
  );
  if (!existing) {
    return null;
  }
  execute('DELETE FROM template_bindings WHERE id = ?', [id]);
  return existing;
}

export function createTemplate(input) {
  ensureTemplatesSchema();
  const payload = normalizeTemplateInput(input);
  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO templates (name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.name,
      payload.type,
      payload.code,
      payload.engine,
      payload.content,
      payload.status === 'published' ? payload.content : null,
      payload.status,
      payload.is_default,
      payload.sort_order,
      now,
      now,
      payload.status === 'published' ? now : null
    ]
  );
  return getTemplateById(result.lastInsertRowid);
}

export function updateTemplate(id, input) {
  const existing = getTemplateById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeTemplateInput({ ...existing, ...input }, { existing });
  execute(
    `
      UPDATE templates
      SET name = ?, type = ?, code = ?, engine = ?, content = ?, is_default = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      payload.name,
      payload.type,
      payload.code,
      payload.engine,
      payload.content,
      payload.is_default,
      payload.sort_order,
      new Date().toISOString(),
      id
    ]
  );
  return getTemplateById(id);
}

export function publishTemplate(id, note = null) {
  const existing = getTemplateById(id);
  if (!existing) {
    return null;
  }

  const nextVersion = (queryOne('SELECT coalesce(max(version_no), 0) + 1 AS next_version FROM template_versions WHERE template_id = ?', [id])?.next_version) || 1;
  if (existing.published_content != null) {
    execute(
      'INSERT INTO template_versions (template_id, version_no, engine, content, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, nextVersion, existing.engine || 'html', existing.published_content, note || '发布前版本', new Date().toISOString()]
    );
    pruneTemplateVersions(id);
  }

  const now = new Date().toISOString();
  execute(
    `
      UPDATE templates
      SET published_content = ?, status = 'published', published_at = ?, updated_at = ?
      WHERE id = ?
    `,
    [existing.content || '', now, now, id]
  );
  return getTemplateById(id);
}

export function deleteTemplate(id) {
  const existing = getTemplateById(id);
  if (!existing) {
    return null;
  }
  if (existing.is_default === 1) {
    throw new Error('default template cannot be deleted');
  }
  execute('DELETE FROM templates WHERE id = ?', [id]);
  return existing;
}

export function listTemplateVersions(templateId) {
  ensureTemplatesSchema();
  return queryAll(
    `
      SELECT id, template_id, version_no, engine, content, note, created_at
      FROM template_versions
      WHERE template_id = ?
      ORDER BY version_no DESC, id DESC
    `,
    [templateId]
  );
}

function normalizeBindingInput(input) {
  const payload = normalizeBindingTarget(input.target_type, input.target_id ?? null, input.template_type);
  const templateId = toInteger(input.template_id, 0);
  if (!templateId) {
    throw new Error('template_id is required');
  }
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error('template does not exist');
  }
  if (template.type !== payload.template_type) {
    throw new Error('template type does not match binding type');
  }

  return {
    ...payload,
    template_id: templateId
  };
}

function normalizeBindingTarget(targetType, targetId, templateType) {
  const normalizedTargetType = String(targetType || '').trim().toLowerCase();
  if (!['site', 'product_category', 'news_category', 'corporation_category', 'content_type'].includes(normalizedTargetType)) {
    throw new Error('invalid binding target type');
  }
  if (!['home', 'list', 'content'].includes(templateType)) {
    throw new Error('invalid binding template type');
  }

  return {
    target_type: normalizedTargetType,
    target_id: targetId == null || String(targetId).trim() === '' ? null : toInteger(targetId, null),
    template_type: templateType
  };
}

function insertTemplateIfMissing(template) {
  const code = normalizeCode(template.code);
  const existing = queryOne('SELECT id FROM templates WHERE code = ? LIMIT 1', [code]);
  if (existing) {
    return;
  }
  const now = new Date().toISOString();
  execute(
    `
      INSERT INTO templates (name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, 'published', 1, ?, ?, ?, ?)
    `,
    [
      template.name,
      template.type,
      code,
      template.engine || 'html',
      template.content || '',
      template.content || '',
      template.sort_order || 0,
      now,
      now,
      now
    ]
  );
}

function normalizeTemplateInput(input) {
  const type = String(input.type || '').trim();
  if (!TEMPLATE_TYPES.includes(type)) {
    throw new Error('invalid template type');
  }
  const name = String(input.name || '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const code = normalizeCode(input.code);
  if (!code) {
    throw new Error('code is required');
  }

  return {
    name,
    type,
    code,
    engine: normalizeTemplateEngine(input.engine),
    content: String(input.content ?? ''),
    status: input.status === 'published' ? 'published' : 'draft',
    is_default: toBooleanInt(input.is_default, 0),
    sort_order: toInteger(input.sort_order, 0)
  };
}

function normalizeTemplateEngine(value) {
  const engine = String(value || 'html').trim().toLowerCase();
  if (!TEMPLATE_ENGINES.includes(engine)) {
    throw new Error('invalid template engine');
  }
  return engine;
}

function pruneTemplateVersions(templateId) {
  const staleRows = queryAll(
    `
      SELECT id
      FROM template_versions
      WHERE template_id = ?
      ORDER BY version_no DESC, id DESC
      LIMIT -1 OFFSET ?
    `,
    [templateId, MAX_TEMPLATE_VERSIONS]
  );
  for (const row of staleRows) {
    execute('DELETE FROM template_versions WHERE id = ?', [row.id]);
  }
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function normalizeCode(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function legacyLabelNameToComponentCode(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/^#/, '')
    .replace(/#$/, '')
    .replace(/^BM_/i, '');
  return normalizeCode(normalized);
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase()) ? 1 : 0;
}
