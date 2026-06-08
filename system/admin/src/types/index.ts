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
  large_image?: string;
  keywords?: string;
  is_featured_home: number;
  is_visible: number;
  sort_order: number;
}

export interface News {
  id: number;
  category_id: number;
  title: string;
  summary?: string;
  content_html?: string;
  image?: string;
  keywords?: string;
  is_featured: number;
  sort_order: number;
  created_at: string;
}

export interface Job {
  id: number;
  title: string;
  location?: string;
  description?: string;
  requirements?: string;
  visible: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
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

export interface Contact {
  id: number;
  office_name: string;
  address?: string;
  phone?: string;
  fax?: string;
  contact_person?: string;
  email?: string;
  postal_code?: string;
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

export interface CustomLabelKind {
  id: number;
  name: string;
}

export interface CustomLabel {
  id: number;
  kind_id?: number;
  name: string;
  content?: string;
}

export interface MetaType {
  id: number;
  title?: string;
  meta_keywords?: string;
  meta_descriptions?: string;
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
  job_index?: string;
  job_detail?: string;
  msg_index?: string;
  contact?: string;
}

export interface ProductPhoto {
  id: number;
  product_id?: number;
  name?: string;
  image_path: string;
  created_at?: string;
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
