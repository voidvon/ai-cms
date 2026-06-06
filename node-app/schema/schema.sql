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

CREATE TABLE IF NOT EXISTS product_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  seo_keywords TEXT,
  seo_description TEXT,
  legacy_extra TEXT,
  FOREIGN KEY (parent_id) REFERENCES product_categories(id) ON DELETE SET DEFAULT
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  category_id INTEGER,
  name TEXT NOT NULL,
  code TEXT,
  summary TEXT,
  content_html TEXT,
  small_image TEXT,
  large_image TEXT,
  keywords TEXT,
  is_featured_home INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  legacy_extra TEXT,
  FOREIGN KEY (category_id) REFERENCES product_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS product_photos (
  id INTEGER PRIMARY KEY,
  product_id INTEGER,
  name TEXT,
  image_path TEXT NOT NULL,
  created_at TEXT,
  legacy_extra TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS news_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  legacy_extra TEXT,
  FOREIGN KEY (parent_id) REFERENCES news_categories(id) ON DELETE SET DEFAULT
);

CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY,
  category_id INTEGER,
  title TEXT NOT NULL,
  summary TEXT,
  content_html TEXT,
  picture TEXT,
  keywords TEXT,
  is_featured_home INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  legacy_extra TEXT,
  FOREIGN KEY (category_id) REFERENCES news_categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  openings TEXT,
  contact_person TEXT,
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  requirements_html TEXT,
  created_at TEXT,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  product_id INTEGER,
  address TEXT,
  mobile TEXT,
  fax TEXT,
  email TEXT,
  status INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  legacy_extra TEXT,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  office_name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  fax TEXT,
  contact_person TEXT,
  email TEXT,
  postal_code TEXT,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS corporation_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_external INTEGER NOT NULL DEFAULT 0,
  external_url TEXT,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS meta_types (
  id INTEGER PRIMARY KEY,
  title TEXT,
  meta_keywords TEXT,
  meta_descriptions TEXT,
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
  job_index TEXT,
  job_detail TEXT,
  msg_index TEXT,
  contact TEXT,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS custom_label_kinds (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  legacy_extra TEXT
);

CREATE TABLE IF NOT EXISTS custom_labels (
  id INTEGER PRIMARY KEY,
  kind_id INTEGER,
  name TEXT NOT NULL,
  content TEXT,
  legacy_extra TEXT,
  FOREIGN KEY (kind_id) REFERENCES custom_label_kinds(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_visible_sort ON products(is_visible, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_news_category_id ON news(category_id);
CREATE INDEX IF NOT EXISTS idx_news_created_at ON news(created_at, id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at, id);
CREATE INDEX IF NOT EXISTS idx_product_categories_parent_id ON product_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_news_categories_parent_id ON news_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at);

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
