import { getDb } from '../src/db.mjs';

const db = getDb();

function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function nextManualSourceId(sourceType) {
  const row = queryOne(
    'SELECT coalesce(max(source_id), 0) AS max_source_id FROM columns WHERE source_type = ?',
    [sourceType]
  );
  return Number(row?.max_source_id || 0) + 1;
}

function getColumn(id) {
  return queryOne(
    `
      SELECT id, parent_id, model_code, source_type, source_id, node_type, column_kind, content_type,
             custom_url, route_path, open_in_new_tab, show_in_nav, content_html, summary, code, images,
             primary_image, keywords, seo_title, seo_keywords, seo_description, slug, publish_status,
             published_at, is_visible, is_featured_home, legacy_extra, sort_order, is_system
      FROM columns
      WHERE id = ?
    `,
    [id]
  );
}

function getName(columnId) {
  return queryOne(
    'SELECT name FROM column_translations WHERE column_id = ? AND language_id = 1',
    [columnId]
  )?.name || '';
}

function setName(columnId, name) {
  run(
    `
      UPDATE column_translations
      SET name = ?, updated_at = CURRENT_TIMESTAMP
      WHERE column_id = ? AND language_id = 1
    `,
    [name, columnId]
  );
}

function setBase(columnId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    return;
  }
  const assignments = keys.map((key) => `${key} = ?`).join(', ');
  run(
    `UPDATE columns SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...keys.map((key) => fields[key]), columnId]
  );
}

function createManualNode({
  name,
  parentId = null,
  modelCode = 'page',
  sourceType = 'single_page',
  sourceId = null,
  nodeType = 'page',
  columnKind = 'single',
  contentType = 'page',
  routePath = null,
  customUrl = null,
  showInNav = 1,
  openInNewTab = 0,
  sortOrder = 0
}) {
  run(
    `
      INSERT INTO columns (
        parent_id, model_code, source_type, source_id, node_type, column_kind, content_type,
        custom_url, route_path, open_in_new_tab, show_in_nav, content_html, summary, code, images,
        primary_image, keywords, seo_title, seo_keywords, seo_description, slug, publish_status,
        published_at, is_visible, is_featured_home, legacy_extra, sort_order, is_system
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', '[]', '', '', '', '', '', NULL, 'published', NULL, 1, 0, NULL, ?, 0)
    `,
    [
      parentId,
      modelCode,
      sourceType,
      sourceId ?? nextManualSourceId(sourceType),
      nodeType,
      columnKind,
      contentType,
      customUrl,
      routePath,
      openInNewTab,
      showInNav,
      sortOrder
    ]
  );
  const id = Number(db.prepare('SELECT last_insert_rowid() AS id').get().id);
  const languageIds = queryAll('SELECT id FROM languages');
  for (const row of languageIds) {
    run(
      `
        INSERT INTO column_translations (
          column_id, language_id, name, content_html, seo_title, seo_keywords, seo_description,
          summary, keywords, publish_status, published_at
        ) VALUES (?, ?, ?, '', '', '', '', '', '', 'published', NULL)
      `,
      [id, row.id, row.id === 1 ? name : '']
    );
  }
  return id;
}

function findByRoute(routePath) {
  return queryOne('SELECT id FROM columns WHERE route_path = ? LIMIT 1', [routePath])?.id || null;
}

function ensureSinglePageNode({ name, routePath, parentId = null, showInNav = 1, sortOrder = 0 }) {
  const existingId = findByRoute(routePath);
  if (existingId) {
    setBase(existingId, {
      parent_id: parentId,
      show_in_nav: showInNav,
      sort_order: sortOrder,
      model_code: 'page',
      source_type: 'single_page',
      node_type: 'page',
      column_kind: 'single',
      content_type: 'page',
      open_in_new_tab: 0
    });
    setName(existingId, name);
    return existingId;
  }
  return createManualNode({
    name,
    parentId,
    modelCode: 'page',
    sourceType: 'single_page',
    sourceId: nextManualSourceId('single_page'),
    nodeType: 'page',
    columnKind: 'single',
    contentType: 'page',
    routePath,
    showInNav,
    sortOrder
  });
}

function ensureLinkNode({ name, customUrl, parentId = null, showInNav = 1, sortOrder = 0 }) {
  const existingId = queryOne('SELECT id FROM columns WHERE source_type = ? AND custom_url = ? LIMIT 1', ['custom_link', customUrl])?.id || null;
  if (existingId) {
    setBase(existingId, {
      parent_id: parentId,
      show_in_nav: showInNav,
      sort_order: sortOrder,
      model_code: 'link',
      source_type: 'custom_link',
      node_type: 'link',
      column_kind: 'link',
      content_type: 'link',
      open_in_new_tab: 0
    });
    setName(existingId, name);
    return existingId;
  }
  return createManualNode({
    name,
    parentId,
    modelCode: 'link',
    sourceType: 'custom_link',
    sourceId: nextManualSourceId('custom_link'),
    nodeType: 'link',
    columnKind: 'link',
    contentType: 'link',
    customUrl,
    showInNav,
    sortOrder
  });
}

function ensureContactChild(name, parentId, sortOrder) {
  const existingId = queryOne('SELECT id FROM columns WHERE source_type = ? LIMIT 1', ['contact_page'])?.id || null;
  if (!existingId) {
    throw new Error('contact_page 节点不存在');
  }
  setBase(existingId, {
    parent_id: parentId,
    show_in_nav: 1,
    sort_order: sortOrder
  });
  setName(existingId, name);
  return existingId;
}

function moveAndRename(id, { parentId = null, name = null, showInNav = undefined, sortOrder = undefined }) {
  const payload = {};
  if (parentId !== undefined) payload.parent_id = parentId;
  if (showInNav !== undefined) payload.show_in_nav = showInNav;
  if (sortOrder !== undefined) payload.sort_order = sortOrder;
  setBase(id, payload);
  if (name) {
    setName(id, name);
  }
}

function ensureTopMenuParent() {
  const existingId = queryOne(
    `
      SELECT id
      FROM columns
      WHERE parent_id IS NULL
        AND (
          custom_url = '#top-menu'
          OR route_path = '/top-menu/'
        )
      LIMIT 1
    `
  )?.id || null;
  if (existingId) {
    setBase(existingId, {
      parent_id: null,
      model_code: 'link',
      source_type: 'custom_link',
      node_type: 'link',
      column_kind: 'link',
      content_type: 'link',
      custom_url: '#top-menu',
      route_path: null,
      open_in_new_tab: 0,
      show_in_nav: 0,
      sort_order: 400
    });
    setName(existingId, '顶部菜单');
    return existingId;
  }
  return ensureLinkNode({
    name: '顶部菜单',
    customUrl: '#top-menu',
    parentId: null,
    showInNav: 0,
    sortOrder: 400
  });
}

function ensureOtherParent() {
  const existingId = queryOne(
    `
      SELECT id
      FROM columns
      WHERE parent_id IS NULL
        AND (
          custom_url = '#misc-links'
          OR route_path = '/misc-links/'
        )
      LIMIT 1
    `
  )?.id || null;
  if (existingId) {
    setBase(existingId, {
      parent_id: null,
      model_code: 'link',
      source_type: 'custom_link',
      node_type: 'link',
      column_kind: 'link',
      content_type: 'link',
      custom_url: '#misc-links',
      route_path: null,
      open_in_new_tab: 0,
      show_in_nav: 0,
      sort_order: 410
    });
    setName(existingId, '其他');
    return existingId;
  }
  return ensureLinkNode({
    name: '其他',
    customUrl: '#misc-links',
    parentId: null,
    showInNav: 0,
    sortOrder: 410
  });
}

function ensureAboutGroupParent() {
  const existingId = queryOne(
    `
      SELECT id
      FROM columns
      WHERE parent_id IS NULL
        AND source_type = 'custom_link'
        AND custom_url = '/about-us/'
      LIMIT 1
    `
  )?.id || null;
  if (existingId) {
    setBase(existingId, {
      parent_id: null,
      model_code: 'link',
      source_type: 'custom_link',
      node_type: 'link',
      column_kind: 'link',
      content_type: 'link',
      custom_url: '/about-us/',
      route_path: null,
      open_in_new_tab: 0,
      show_in_nav: 0,
      sort_order: 420
    });
    setName(existingId, '关于我们');
    return existingId;
  }
  return ensureLinkNode({
    name: '关于我们',
    customUrl: '/about-us/',
    parentId: null,
    showInNav: 0,
    sortOrder: 420
  });
}

function convertHv3CategoryToProductContent() {
  const hv3 = getColumn(49);
  if (!hv3) {
    return;
  }

  setBase(49, {
    model_code: 'product',
    source_type: 'product_item',
    node_type: 'content',
    column_kind: 'content',
    content_type: 'product',
    parent_id: 10,
    show_in_nav: 0,
    sort_order: 999,
    slug: 'hv3-stop-valve'
  });

  const translation = queryOne(
    'SELECT id, summary, seo_title, seo_description FROM column_translations WHERE column_id = 49 AND language_id = 1',
    []
  );
  if (translation) {
    run(
      `
        UPDATE column_translations
        SET name = ?, summary = ?, seo_title = ?, seo_description = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [
        'HV3截止阀',
        translation.summary || '斯派莎克HV3截止阀是一种安全、精确和坚固的截止阀，有多种尺寸可供选择，以满足不同的应用要求',
        translation.seo_title || 'HV3截止阀',
        translation.seo_description || '斯派莎克HV3截止阀是一种安全、精确和坚固的截止阀，有多种尺寸可供选择，以满足不同的应用要求',
        translation.id
      ]
    );
  }
}

function main() {
  db.exec('BEGIN');
  try {
    const aboutGroupParent = ensureAboutGroupParent();
    const topMenuParent = ensureTopMenuParent();
    const otherParent = ensureOtherParent();

    moveAndRename(117, { parentId: null, name: '首页', showInNav: 1, sortOrder: 10 });
    moveAndRename(112, { parentId: null, name: '您的目标', showInNav: 1, sortOrder: 20 });
    moveAndRename(94, { parentId: null, name: '行业', showInNav: 1, sortOrder: 40 });
    moveAndRename(70, { parentId: null, name: '服务', showInNav: 1, sortOrder: 50 });
    moveAndRename(111, { parentId: null, name: '培训', showInNav: 1, sortOrder: 60 });
    moveAndRename(69, { parentId: null, name: '公司新闻', showInNav: 1, sortOrder: 70 });

    moveAndRename(113, { parentId: 112, name: '改进或扩建蒸汽系统', showInNav: 1, sortOrder: 10 });
    moveAndRename(114, { parentId: 112, name: '提高生产率', showInNav: 1, sortOrder: 20 });
    moveAndRename(115, { parentId: 112, name: '系统可靠性', showInNav: 1, sortOrder: 30 });
    moveAndRename(116, { parentId: 112, name: '节能', showInNav: 1, sortOrder: 40 });

    moveAndRename(95, { parentId: 94, name: '酿造和蒸馏行业', showInNav: 1, sortOrder: 10 });
    moveAndRename(96, { parentId: 94, name: '食品与饮料行业', showInNav: 1, sortOrder: 20 });
    moveAndRename(97, { parentId: 94, name: '医院', showInNav: 1, sortOrder: 30 });
    moveAndRename(99, { parentId: 94, name: '石化行业', showInNav: 1, sortOrder: 40 });
    moveAndRename(100, { parentId: 94, name: '制药', showInNav: 1, sortOrder: 50 });
    moveAndRename(101, { parentId: 94, name: '造纸', showInNav: 1, sortOrder: 60 });
    moveAndRename(102, { parentId: 94, name: '制糖', showInNav: 1, sortOrder: 70 });
    moveAndRename(98, { parentId: 94, name: 'OEM', showInNav: 1, sortOrder: 80 });

    moveAndRename(89, { parentId: aboutGroupParent, name: '关于我们', showInNav: 1, sortOrder: 10 });
    ensureContactChild('联系我们', aboutGroupParent, 20);

    moveAndRename(90, { parentId: 89, showInNav: 0, sortOrder: 100 });
    moveAndRename(91, { parentId: 90, showInNav: 0, sortOrder: 10 });
    moveAndRename(92, { parentId: 91, showInNav: 0, sortOrder: 10 });

    const topAbout = ensureLinkNode({
      name: '关于我们',
      customUrl: '/about-us/',
      parentId: topMenuParent,
      showInNav: 0,
      sortOrder: 40
    });
    moveAndRename(105, { parentId: topMenuParent, name: '资源和设计工具', showInNav: 0, sortOrder: 30 });
    moveAndRename(108, { parentId: topMenuParent, name: '了解蒸汽', showInNav: 0, sortOrder: 20 });
    ensureLinkNode({
      name: '知识中心',
      customUrl: '/knowledge-exchange/',
      parentId: topMenuParent,
      showInNav: 0,
      sortOrder: 10
    });
    setBase(topAbout, { show_in_nav: 0 });

    moveAndRename(103, { parentId: otherParent, name: '网站隐私政策', showInNav: 0, sortOrder: 10 });
    ensureLinkNode({
      name: '销售和服务条款',
      customUrl: '/pdfs/sxs-cn-sales-and-service-terms.pdf',
      parentId: otherParent,
      showInNav: 0,
      sortOrder: 20
    });

    moveAndRename(4, { name: '压缩空气疏水阀' });
    moveAndRename(6, { name: '控制系统' });
    moveAndRename(9, { name: '加湿器' });
    moveAndRename(11, { name: '管道附件' });
    moveAndRename(52, { name: '泄放压阀' });

    moveAndRename(157, { parentId: 70, name: '疏水阀无线监测', sortOrder: 10 });
    moveAndRename(152, { parentId: 70, name: '蒸汽系统调研', sortOrder: 20 });
    moveAndRename(153, { parentId: 70, name: '安装调试交钥匙', sortOrder: 30 });
    moveAndRename(154, { parentId: 70, name: '预防性维护保养', sortOrder: 40 });
    moveAndRename(155, { parentId: 70, name: '蒸汽品质检测', sortOrder: 50 });
    moveAndRename(156, { parentId: 70, name: '疏水阀调研和管理', sortOrder: 60 });

    convertHv3CategoryToProductContent();

    db.exec('COMMIT');

    const summary = {
      aboutGroupParent,
      topMenuParent,
      otherParent,
      hv3: getColumn(49),
      topMenuChildren: queryAll(
        `
          SELECT c.id, ct.name, c.parent_id, c.source_type, c.route_path, c.custom_url
          FROM columns c
          LEFT JOIN column_translations ct ON ct.column_id = c.id AND ct.language_id = 1
          WHERE c.parent_id = ?
          ORDER BY c.sort_order, c.id
        `,
        [topMenuParent]
      ),
      otherChildren: queryAll(
        `
          SELECT c.id, ct.name, c.parent_id, c.source_type, c.route_path, c.custom_url
          FROM columns c
          LEFT JOIN column_translations ct ON ct.column_id = c.id AND ct.language_id = 1
          WHERE c.parent_id = ?
          ORDER BY c.sort_order, c.id
        `,
        [otherParent]
      )
    };
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    db.exec('ROLLBACK');
    console.error(error);
    process.exitCode = 1;
  }
}

main();
