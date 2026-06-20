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
  seo_default_title?: string | null
  seo_default_description?: string | null
  seo_home_title?: string | null
  seo_home_description?: string | null
  current_language_code?: string | null
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

export type ProductSummary = {
  id: number
  name?: string | null
  summary?: string | null
  images?: string[] | null
  primary_image?: string | null
}

export type NewsSummary = {
  id: number
  title?: string | null
  summary?: string | null
  created_at?: string | null
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
  }
  category?: CategorySummary | null
  previous?: NewsSummary | null
  next?: NewsSummary | null
}

export type HomePageProps = {
  site: SiteConfig
  featuredProducts: ProductSummary[]
  latestNews: NewsSummary[]
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
  productsMenuHtml?: string
  productsMenuCompactHtml?: string
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
  featuredProductsHtml: string
  featuredProductLinksHtml: string
  serviceIndexHtml: string
}

export type LegacyContactPageProps = LegacyPageBaseProps & {
  contactTableHtml: string
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
}

export type LegacyProductDetailPageProps = LegacyPageBaseProps & {
  title: string
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
  newsDescription: string
  typeId: number
  catName: string
  bodyHtml: string
  previousHtml: string
  nextHtml: string
}
