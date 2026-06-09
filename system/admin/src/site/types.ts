export type SiteConfig = {
  web_name?: string | null
  web_url?: string | null
  company_name?: string | null
  company_address?: string | null
  postal_code?: string | null
  company_phone?: string | null
  company_fax?: string | null
  contact_person?: string | null
  company_email?: string | null
  icp_number?: string | null
  web_qq?: string | null
  web_mobile?: string | null
  web_author?: string | null
  web_copyright?: string | null
}

export type ProductSummary = {
  id: number
  name?: string | null
  summary?: string | null
  small_image?: string | null
}

export type NewsSummary = {
  id: number
  title?: string | null
  summary?: string | null
  created_at?: string | null
}

export type Contact = {
  id: number
  office_name?: string | null
  address?: string | null
  phone?: string | null
  fax?: string | null
  contact_person?: string | null
  email?: string | null
  postal_code?: string | null
}

export type CategorySummary = {
  id: number
  name?: string | null
  parent_id?: number | null
}

export type Pagination = {
  pageNumber: number
  pageCount: number
  totalRecords: number
  pageSize: number
  firstHref: string
  previousHref?: string | null
  nextHref?: string | null
  lastHref: string
}

export type ContentPageProps = {
  site: SiteConfig
  title: string
  contentHtml: string
}

export type ProductListPageProps = {
  site: SiteConfig
  title: string
  products: ProductSummary[]
  categories: CategorySummary[]
  pagination: Pagination
}

export type ProductDetailPageProps = {
  site: SiteConfig
  product: ProductSummary & {
    code?: string | null
    keywords?: string | null
    content_html?: string | null
  }
  relatedProducts: ProductSummary[]
}

export type ArticleListPageProps = {
  site: SiteConfig
  title: string
  sectionLabel: string
  sectionPath: string
  articles: NewsSummary[]
  categories: CategorySummary[]
  pagination: Pagination
}

export type ArticleDetailPageProps = {
  site: SiteConfig
  title: string
  sectionLabel: string
  sectionPath: string
  article: NewsSummary & {
    content_html?: string | null
    keywords?: string | null
  }
  category?: CategorySummary | null
  previous?: NewsSummary | null
  next?: NewsSummary | null
}

export type JobSummary = {
  id: number
  name?: string | null
  address?: string | null
  openings?: string | number | null
  contact_person?: string | null
  phone?: string | null
  requirements_html?: string | null
  created_at?: string | null
}

export type JobListPageProps = {
  site: SiteConfig
  jobs: JobSummary[]
  pagination: Pagination
}

export type JobDetailPageProps = {
  site: SiteConfig
  job: JobSummary
}

export type HomePageProps = {
  site: SiteConfig
  featuredProducts: ProductSummary[]
  latestNews: NewsSummary[]
}

export type ContactPageProps = {
  site: SiteConfig
  contacts: Contact[]
}

export type MessagePageProps = {
  site: SiteConfig
}

export type RawHtmlPageProps = {
  html: string
}

export type LegacyCommonFragments = {
  indextopHtml?: string
  topHtml?: string
  bottomHtml?: string
  indexFootHtml?: string
  aboutHtml?: string
  productsMenuHtml?: string
  productsMenuCompactHtml?: string
  aboutCategoryHtml?: string
  newsCategoryHtml?: string
  serviceCategoryHtml?: string
}

export type LegacyMetaMap = Record<string, {
  title?: string | null
  meta_keywords?: string | null
  meta_descriptions?: string | null
}>

export type LegacyPageBaseProps = {
  site: SiteConfig
  fragments: LegacyCommonFragments
  meta: LegacyMetaMap
}

export type LegacyHomePageProps = LegacyPageBaseProps & {
  newsIndexHtml: string
  featuredProductsHtml: string
  featuredProductLinksHtml: string
  serviceIndexHtml: string
}

export type LegacyContactPageProps = LegacyPageBaseProps & {
  contactTableHtml: string
}

export type LegacyMessagePageProps = LegacyPageBaseProps & {
  messageSidebarProductsHtml: string
}

export type LegacyContentPageProps = LegacyPageBaseProps & {
  title: string
  contentHtml: string
}

export type LegacyProductListPageProps = LegacyPageBaseProps & {
  smallName: string
  bigId: number
  bigName: string
  productsSmallCatHtml: string
  bodyHtml: string
  prodKeywords: string
}

export type LegacyProductDetailPageProps = LegacyPageBaseProps & {
  title: string
  prodKeywords: string
  prodDescription: string
  image: string
  code: string
  relatedProductsHtml: string
  bodyHtml: string
}

export type LegacyArticleListPageProps = LegacyPageBaseProps & {
  section: 'news' | 'service'
  categoryId: number
  title: string
  bodyHtml: string
}

export type LegacyArticleDetailPageProps = LegacyPageBaseProps & {
  section: 'news' | 'service'
  title: string
  newsKeywords: string
  newsDescription: string
  typeId: number
  catName: string
  bodyHtml: string
  previousHtml: string
  nextHtml: string
}

export type LegacyJobListPageProps = LegacyPageBaseProps & {
  bodyHtml: string
}

export type LegacyJobDetailPageProps = LegacyPageBaseProps & {
  title: string
  address: string
  openings: string | number
  requirementsHtml: string
  contactPerson: string
  phone: string
  date: string
}
