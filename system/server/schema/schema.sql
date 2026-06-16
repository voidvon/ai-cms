PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_scheme TEXT NOT NULL DEFAULT 'legacy-md5-16',
  permission_flags TEXT NOT NULL DEFAULT '',
  last_login_at TEXT,
  last_login_ip TEXT,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  summary TEXT,
  content_html TEXT,
  small_image TEXT,
  keywords TEXT,
  is_featured_home INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  legacy_extra TEXT,
  updated_at TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  slug TEXT,
  column_id INTEGER
);

CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY,
  storage_driver TEXT NOT NULL DEFAULT 'local',
  purpose TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_ext TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  relative_path TEXT NOT NULL UNIQUE,
  fs_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_assets_purpose ON media_assets(purpose, id);
CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status, id);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  content_html TEXT,
  picture TEXT,
  keywords TEXT,
  is_featured_home INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  legacy_extra TEXT,
  column_id INTEGER
);

CREATE TABLE IF NOT EXISTS corporation_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS site_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  web_name TEXT,
  web_url TEXT,
  company_name TEXT,
  company_address TEXT,
  postal_code TEXT,
  company_phone TEXT,
  company_fax TEXT,
  contact_person TEXT,
  company_email TEXT,
  icp_number TEXT,
  web_qq TEXT,
  web_mobile TEXT,
  web_copyright TEXT,
  web_author TEXT,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS site_config_translations (
  id INTEGER PRIMARY KEY,
  site_config_id INTEGER NOT NULL,
  language_id INTEGER NOT NULL,
  web_name TEXT,
  company_name TEXT,
  company_address TEXT,
  contact_person TEXT,
  company_email TEXT,
  web_copyright TEXT,
  web_author TEXT,
  seo_default_title TEXT,
  seo_default_description TEXT,
  seo_home_title TEXT,
  seo_home_description TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(site_config_id, language_id),
  FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_config_translations_site_config_id
ON site_config_translations(site_config_id, language_id);

CREATE TABLE IF NOT EXISTS template_variants (
  id INTEGER PRIMARY KEY,
  template_name TEXT NOT NULL,
  is_selected INTEGER NOT NULL DEFAULT 0,
  home_index TEXT,
  co_index TEXT,
  produts_index TEXT,
  produts_sort1 TEXT,
  produts_sort2 TEXT,
  produts_detail TEXT,
  news_index TEXT,
  news_sort1 TEXT,
  news_detail TEXT,
  service_sort1 TEXT,
  service_detail TEXT,
  msg_index TEXT,
  contact TEXT,
  legacy_extra TEXT
);

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

CREATE INDEX IF NOT EXISTS idx_products_visible_sort ON products(is_visible, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at, id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_templates_type_sort ON templates(type, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_templates_status ON templates(status);
CREATE INDEX IF NOT EXISTS idx_template_bindings_target ON template_bindings(target_type, target_id, template_type);
CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id, version_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug) WHERE slug IS NOT NULL;

CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
  name,
  summary,
  keywords,
  content='products',
  content_rowid='id'
);

CREATE VIRTUAL TABLE IF NOT EXISTS news_fts USING fts5(
  title,
  summary,
  keywords,
  content='news',
  content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS products_ai AFTER INSERT ON products BEGIN
  INSERT INTO products_fts(rowid, name, summary, keywords)
  VALUES (new.id, coalesce(new.name, ''), coalesce(new.summary, ''), coalesce(new.keywords, ''));
END;

CREATE TRIGGER IF NOT EXISTS products_ad AFTER DELETE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, summary, keywords)
  VALUES('delete', old.id, old.name, old.summary, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS products_au AFTER UPDATE ON products BEGIN
  INSERT INTO products_fts(products_fts, rowid, name, summary, keywords)
  VALUES('delete', old.id, old.name, old.summary, old.keywords);
  INSERT INTO products_fts(rowid, name, summary, keywords)
  VALUES (new.id, coalesce(new.name, ''), coalesce(new.summary, ''), coalesce(new.keywords, ''));
END;

CREATE TRIGGER IF NOT EXISTS news_ai AFTER INSERT ON news BEGIN
  INSERT INTO news_fts(rowid, title, summary, keywords)
  VALUES (new.id, coalesce(new.title, ''), coalesce(new.summary, ''), coalesce(new.keywords, ''));
END;

CREATE TRIGGER IF NOT EXISTS news_ad AFTER DELETE ON news BEGIN
  INSERT INTO news_fts(news_fts, rowid, title, summary, keywords)
  VALUES('delete', old.id, old.title, old.summary, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS news_au AFTER UPDATE ON news BEGIN
  INSERT INTO news_fts(news_fts, rowid, title, summary, keywords)
  VALUES('delete', old.id, old.title, old.summary, old.keywords);
  INSERT INTO news_fts(rowid, title, summary, keywords)
  VALUES (new.id, coalesce(new.title, ''), coalesce(new.summary, ''), coalesce(new.keywords, ''));
END;

INSERT INTO site_config (id)
VALUES (1)
ON CONFLICT(id) DO NOTHING;
