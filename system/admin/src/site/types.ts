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
  assets_bind_host?: string | null
  assets_port?: number | null
  assets_public_base_url?: string | null
  seo_default_title?: string | null
  seo_default_description?: string | null
  seo_home_title?: string | null
  seo_home_description?: string | null
  current_language_code?: string | null
  requested_language_code?: string | null
  resolved_language_code?: string | null
  fallback_language_code?: string | null
  is_language_fallback?: boolean | null
}

export type SeoMetaPayload = {
  basic?: {
    description?: string | null
    robots?: string | null
    canonical?: string | null
  }
  openGraph?: {
    title?: string | null
    site_name?: string | null
    locale?: string | null
    localeAlternates?: string[] | null
    description?: string | null
    url?: string | null
    type?: string | null
    image?: string | null
    imageSecureUrl?: string | null
    imageWidth?: number | null
    imageHeight?: number | null
    imageAlt?: string | null
    imageType?: string | null
  }
  twitter?: {
    card?: string | null
    site?: string | null
    title?: string | null
    description?: string | null
    image?: string | null
    imageAlt?: string | null
  }
}

export type HreflangLink = {
  lang?: string | null
  url?: string | null
}

export type ManagedContentSummary = {
  id: number
  name?: string | null
  summary?: string | null
  images?: string[] | null
  primary_image?: string | null
}

export type SectionContentSummary = {
  id: number
  title?: string | null
  summary?: string | null
  created_at?: string | null
}

export type ColumnSummary = {
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

export type ManagedColumnListPageProps = {
  site: SiteConfig
  title: string
  products: ManagedContentSummary[]
  categories: ColumnSummary[]
  pagination: Pagination
}

export type ManagedColumnDetailPageProps = {
  site: SiteConfig
  managedItem: ManagedContentSummary & {
    code?: string | null
    content_html?: string | null
  }
  relatedManagedItems: ManagedContentSummary[]
}

export type SectionListPageProps = {
  site: SiteConfig
  title: string
  sectionLabel: string
  sectionPath: string
  articles: SectionContentSummary[]
  categories: ColumnSummary[]
  pagination: Pagination
}

export type SectionDetailPageProps = {
  site: SiteConfig
  title: string
  sectionLabel: string
  sectionPath: string
  article: SectionContentSummary & {
    content_html?: string | null
  }
  column?: ColumnSummary | null
  previous?: SectionContentSummary | null
  next?: SectionContentSummary | null
}

export type HomePageProps = {
  site: SiteConfig
  featuredProducts: ManagedContentSummary[]
  latestNews: SectionContentSummary[]
}

export type ContactPageProps = {
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
  managedMenuHtml?: string
  managedMenuCompactHtml?: string
  aboutCategoryHtml?: string
  newsCategoryHtml?: string
  serviceCategoryHtml?: string
}

export type LegacyPageBaseProps = {
  site: SiteConfig
  fragments: LegacyCommonFragments
  seoMeta?: SeoMetaPayload | null
  jsonLd?: Record<string, unknown> | null
  hreflangLinks?: HreflangLink[] | null
  faviconLinks?: Array<Record<string, string>> | null
  themeColorMetas?: Array<Record<string, string>> | null
}

export type LegacyHomePageProps = LegacyPageBaseProps & {
  newsIndexHtml: string
  featuredManagedItemsHtml: string
  featuredManagedItemLinksHtml: string
  serviceIndexHtml: string
}

export type LegacyContactPageProps = LegacyPageBaseProps & {
  contactTableHtml: string
}

export type LegacyContentPageProps = LegacyPageBaseProps & {
  title: string
  contentHtml: string
}

export type LegacyCollectionListPageProps = LegacyPageBaseProps & {
  smallName: string
  bigId: number
  bigName: string
  collectionCategoryHtml: string
  bodyHtml: string
}

export type LegacyCollectionDetailPageProps = LegacyPageBaseProps & {
  title: string
  itemDescription: string
  image: string
  code: string
  relatedItemsHtml: string
  bodyHtml: string
}

export type LegacyArticleListPageProps = LegacyPageBaseProps & {
  section: 'news' | 'service'
  columnId: number
  title: string
  bodyHtml: string
}

export type LegacyArticleDetailPageProps = LegacyPageBaseProps & {
  section: 'news' | 'service'
  title: string
  itemDescription: string
  columnId: number
  columnName: string
  bodyHtml: string
  previousHtml: string
  nextHtml: string
}
