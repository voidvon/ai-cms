export interface Admin {
  id: number;
  username: string;
  created_at: string;
  last_login_at?: string;
}

export interface LanguageSite {
  id?: number | null;
  host?: string;
  path_prefix: string;
  output_dir: string;
  is_primary: number;
}

export interface Language {
  id: number;
  code: string;
  name: string;
  native_name?: string;
  is_default: number;
  is_enabled: number;
  sort_order: number;
  site: LanguageSite;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: number;
  column_id?: number | null;
  name: string;
  code?: string;
  summary?: string;
  content_html?: string;
  images?: string[];
  primary_image?: string;
  keywords?: string;
  is_featured_home: number;
  is_visible: number;
  sort_order: number;
  category_name?: string;
  current_language_code?: string;
  translation_statuses?: ProductTranslationStatus[];
  translations?: Record<string, ProductTranslation>;
}

export interface ProductTranslation {
  name: string;
  summary?: string;
  content_html?: string;
  keywords?: string;
  seo_title?: string;
  seo_keywords?: string;
  seo_description?: string;
  publish_status: 'draft' | 'published';
  published_at?: string | null;
}

export interface ProductTranslationStatus {
  language_code: string;
  publish_status: 'draft' | 'published';
  published_at?: string | null;
  has_content: boolean;
}

export interface News {
  id: number;
  column_id?: number | null;
  title: string;
  summary?: string;
  content_html?: string;
  image?: string;
  picture?: string;
  keywords?: string;
  is_featured?: number;
  is_featured_home?: number;
  sort_order: number;
  created_at: string;
  category_name?: string;
  current_language_code?: string;
  translation_statuses?: NewsTranslationStatus[];
  translations?: Record<string, NewsTranslation>;
}

export interface NewsTranslation {
  title: string;
  summary?: string;
  content_html?: string;
  keywords?: string;
  seo_title?: string;
  seo_keywords?: string;
  seo_description?: string;
  publish_status: 'draft' | 'published';
  published_at?: string | null;
}

export interface NewsTranslationStatus {
  language_code: string;
  publish_status: 'draft' | 'published';
  published_at?: string | null;
  has_content: boolean;
}

export interface ProductCategory {
  id: number;
  column_id?: number;
  source_id?: number;
  name: string;
  parent_id: number;
  sort_order: number;
  seo_keywords?: string;
  seo_description?: string;
  current_language_code?: string;
  translations?: Record<string, ProductCategoryTranslation>;
}

export interface NewsCategory {
  id: number;
  column_id?: number;
  source_id?: number;
  name: string;
  parent_id: number;
  sort_order: number;
  current_language_code?: string;
  translations?: Record<string, NewsCategoryTranslation>;
}

export interface ProductCategoryTranslation {
  name: string;
  seo_keywords?: string;
  seo_description?: string;
}

export interface NewsCategoryTranslation {
  name: string;
}

export interface CorporationCategory {
  id: number;
  name: string;
  parent_id: number;
  sort_order: number;
  is_external: number;
  external_url?: string;
}

export interface TemplateVariant {
  id: number;
  template_name: string;
  is_selected: number;
  theme_templates?: Template[];
}

export interface Template {
  id: number;
  theme_id?: number | null;
  name: string;
  type: 'home' | 'list' | 'content' | 'component';
  code: string;
  engine: 'tsx';
  content: string;
  published_content?: string | null;
  status: 'draft' | 'published';
  is_default: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  published_at?: string | null;
}

export interface TemplateBinding {
  id: number;
  theme_id?: number;
  target_type: 'site' | 'product_category' | 'news_category' | 'corporation_category' | 'content_type' | 'column';
  target_id?: number | null;
  template_type: 'home' | 'list' | 'content';
  template_id: number;
  template_name?: string;
  template_code?: string;
}

export interface TemplateDependencyRef {
  code: string;
  exists: boolean;
  template_id?: number | null;
  name?: string;
  type?: Template['type'] | '';
  status?: Template['status'] | '';
}

export interface TemplateDependencyUser {
  id: number;
  code: string;
  name: string;
  type: Template['type'];
  status: Template['status'];
}

export interface TemplateDependencyInfo {
  template: Pick<Template, 'id' | 'code' | 'name' | 'type' | 'status'>;
  references: TemplateDependencyRef[];
  referenced_by: TemplateDependencyUser[];
  bindings: TemplateBinding[];
}

export interface TemplateVersion {
  id: number;
  template_id: number;
  version_no: number;
  engine: Template['engine'];
  content: string;
  note?: string | null;
  created_at?: string;
}

export interface TemplatePreview {
  html: string;
}

export interface ContentModelField {
  id: number;
  model_id: number;
  config_id?: number | null;
  field_name: string;
  field_label: string;
  field_type: 'text' | 'richtext' | 'image' | 'boolean' | 'datetime' | 'number' | string;
  db_type?: string;
  is_required: number;
  is_primary: number;
  is_system: number;
  is_listed?: number;
  is_editable?: number;
  is_translatable?: number;
  settings_json?: string | null;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ContentModel {
  id: number;
  code: string;
  name: string;
  source_table?: string;
  description?: string;
  is_system: number;
  sort_order: number;
  bound_column_count?: number;
  bound_columns?: Array<{
    id: number;
    parent_id?: number | null;
    source_type: string;
    route_path?: string | null;
    sort_order: number;
  }>;
  fields: ContentModelField[];
  created_at?: string;
  updated_at?: string;
}

export interface Column {
  id: number;
  name: string;
  parent_id?: number | null;
  content_model_id?: number | null;
  source_type: 'product_root' | 'product_category' | 'news_category' | 'corporation_root' | 'corporation_category' | 'contact_page' | 'custom_link' | 'single_page' | string;
  source_id: number;
  custom_url?: string | null;
  route_path?: string | null;
  open_in_new_tab?: number;
  content_html?: string;
  seo_title?: string | null;
  seo_keywords?: string | null;
  seo_description?: string | null;
  sort_order: number;
  current_language_code?: string;
  translations?: Record<string, ColumnTranslation>;
  created_at?: string;
  updated_at?: string;
}

export interface ColumnTranslation {
  name: string;
  content_html?: string;
  seo_title?: string | null;
  seo_keywords?: string | null;
  seo_description?: string | null;
}

export interface SiteConfigTranslation {
  web_name: string;
  company_name?: string | null;
  company_address?: string | null;
  contact_person?: string | null;
  company_email?: string | null;
  web_copyright?: string | null;
  web_author?: string | null;
  seo_default_title?: string | null;
  seo_default_description?: string | null;
  seo_home_title?: string | null;
  seo_home_description?: string | null;
}

export interface SiteHreflangLink {
  lang: string;
  url: string;
}

export interface SiteConfig {
  id?: number;
  web_name: string;
  web_url: string;
  company_name: string;
  company_address: string;
  postal_code: string;
  company_phone: string;
  company_fax: string;
  contact_person: string;
  company_email: string;
  icp_number: string;
  web_qq: string;
  web_mobile: string;
  web_copyright: string;
  web_author: string;
  seo_default_image?: string | null;
  seo_site_name?: string | null;
  seo_twitter_handle?: string | null;
  seo_organization_name?: string | null;
  seo_same_as?: string[];
  seo_same_as_text?: string;
  seo_hreflang_links?: SiteHreflangLink[];
  seo_hreflang_links_text?: string;
  seo_default_title?: string | null;
  seo_default_description?: string | null;
  seo_home_title?: string | null;
  seo_home_description?: string | null;
  legacy_extra?: string | null;
  current_language_code?: string;
  translations?: Record<string, SiteConfigTranslation>;
}

export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MediaAsset {
  id: number;
  storage_driver: string;
  purpose: string;
  original_name?: string;
  mime_type?: string;
  file_ext?: string;
  file_size: number;
  relative_path: string;
  fs_path: string;
  status: 'active' | 'orphaned' | string;
  file_exists?: boolean;
  created_at?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  items?: T[];
  pagination?: PaginationInfo;
  message?: string;
}
