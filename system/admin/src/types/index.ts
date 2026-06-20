// 发布状态枚举类型
export type PublishStatus = 'draft' | 'pending_review' | 'published';

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
  custom_url?: string | null;
  name: string;
  code?: string;
  summary?: string;
  content_html?: string;
  seo_title?: string;
  seo_description?: string;
  template_data_json?: string | null;
  template_data?: Record<string, unknown> | null;
  images?: string[];
  primary_image?: string;
  is_featured_home: number;
  is_visible: number;
  sort_order: number;
  column_name?: string;
  current_language_code?: string;
  translation_statuses?: ProductTranslationStatus[];
  translations?: Record<string, ProductTranslation>;
}

export interface ProductTranslation {
  name: string;
  summary?: string;
  content_html?: string;
  template_data_json?: string | null;
  template_data?: Record<string, unknown> | null;
  seo_title?: string;
  seo_description?: string;
  publish_status: PublishStatus;
}

export interface ProductTranslationStatus {
  language_code: string;
  publish_status: PublishStatus;
  has_content: boolean;
}

export interface News {
  id: number;
  column_id?: number | null;
  custom_url?: string | null;
  title: string;
  summary?: string;
  content_html?: string;
  seo_title?: string;
  seo_description?: string;
  template_data_json?: string | null;
  template_data?: Record<string, unknown> | null;
  image?: string;
  picture?: string;
  is_featured?: number;
  is_featured_home?: number;
  sort_order: number;
  created_at: string;
  column_name?: string;
  current_language_code?: string;
  translation_statuses?: NewsTranslationStatus[];
  translations?: Record<string, NewsTranslation>;
}

export interface NewsTranslation {
  title: string;
  summary?: string;
  content_html?: string;
  template_data_json?: string | null;
  template_data?: Record<string, unknown> | null;
  seo_title?: string;
  seo_description?: string;
  publish_status: PublishStatus;
}

export interface NewsTranslationStatus {
  language_code: string;
  publish_status: PublishStatus;
  has_content: boolean;
}

export interface ColumnNode {
  id: number;
  column_id?: number;
  name: string;
  parent_id: number;
  dir_name?: string | null;
  images?: string[];
  detail_rule?: string | null;
  sort_order: number;
  seo_title?: string;
  seo_description?: string;
  current_language_code?: string;
  translations?: Record<string, ColumnNodeTranslation>;
}

export interface ColumnNodeTranslation {
  name: string;
  seo_title?: string;
  seo_description?: string;
}




export interface TemplateVariant {
  id: number;
  template_name: string;
  is_selected: number;
  source_theme_id?: number | null;
  theme_templates?: Template[];
}

export interface Template {
  id: number;
  theme_id?: number | null;
  name: string;
  type: 'home' | 'list' | 'content' | 'single' | 'component';
  code: string;
  engine: 'tsx';
  tsx_source: string;
  css_source: string;
  published_tsx_source?: string | null;
  published_css_source?: string | null;
  status: 'draft' | 'published';
  is_default: number;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface TemplateBinding {
  id: number;
  theme_id?: number;
  target_type: 'site' | 'content_type' | 'column';
  target_id?: number | null;
  template_type: 'home' | 'list' | 'content' | 'single';
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
  tsx_source: string;
  css_source: string;
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
  is_searchable?: number;
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
    column_type: 'single' | 'list' | 'link' | string;
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
  column_type: 'single' | 'list' | 'link' | string;
  custom_url?: string | null;
  dir_name?: string | null;
  route_path?: string | null;
  detail_rule?: string | null;
  is_visible?: number;
  content_html?: string;
  template_data_json?: string | null;
  template_data?: Record<string, unknown> | null;
  seo_title?: string | null;
  seo_description?: string | null;
  sort_order: number;
  model_code?: string | null;
  column_semantics?: {
    structure_kind?: string;
    render_driver?: string;
    generation_modes?: string[];
    is_root?: boolean;
    root_column_id?: number | null;
    model_code?: string | null;
    column_type?: string;
  };
  current_language_code?: string;
  translations?: Record<string, ColumnTranslation>;
  created_at?: string;
  updated_at?: string;
}

export interface ColumnTranslation {
  name: string;
  content_html?: string;
  template_data_json?: string | null;
  template_data?: Record<string, unknown> | null;
  seo_title?: string | null;
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
  seo_default_title?: string | null;
  seo_default_description?: string | null;
  seo_home_title?: string | null;
  seo_home_description?: string | null;
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
  items?: T extends Array<infer Item> ? Item[] : T[];
  pagination?: PaginationInfo;
  message?: string;
}
