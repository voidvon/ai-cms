export interface Admin {
  id: number;
  username: string;
  created_at: string;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  code?: string;
  summary?: string;
  content_html?: string;
  small_image?: string;
  keywords?: string;
  is_featured_home: number;
  is_visible: number;
  sort_order: number;
  category_name?: string;
}

export interface News {
  id: number;
  category_id: number;
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
}

export interface Message {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  content?: string;
  status: number;
  created_at: string;
  updated_at?: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  parent_id: number;
  sort_order: number;
  seo_keywords?: string;
  seo_description?: string;
}

export interface NewsCategory {
  id: number;
  name: string;
  parent_id: number;
  sort_order: number;
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
  home_index?: string;
  co_index?: string;
  produts_index?: string;
  produts_sort1?: string;
  produts_sort2?: string;
  produts_detail?: string;
  news_index?: string;
  news_sort1?: string;
  news_detail?: string;
  service_sort1?: string;
  service_detail?: string;
  msg_index?: string;
  contact?: string;
}

export interface Template {
  id: number;
  name: string;
  type: 'home' | 'list' | 'content' | 'component';
  code: string;
  engine: 'html' | 'tsx';
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
  target_type: 'site' | 'product_category' | 'news_category' | 'corporation_category' | 'content_type';
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
  field_name: string;
  field_label: string;
  field_type: 'text' | 'richtext' | 'image' | 'boolean' | 'datetime' | 'number' | string;
  db_type?: string;
  is_required: number;
  is_primary: number;
  is_system: number;
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
  fields: ContentModelField[];
  created_at?: string;
  updated_at?: string;
}

export interface Column {
  id: number;
  name: string;
  parent_id?: number | null;
  model_code: 'product' | 'news' | string;
  source_type: 'product_root' | 'product_category' | 'news_category' | string;
  source_id: number;
  sort_order: number;
  is_system: number;
  created_at?: string;
  updated_at?: string;
}

export interface PaginationInfo {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  items?: T[];
  pagination?: PaginationInfo;
  message?: string;
}
