import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LegacyArticleDetailPage,
  LegacyArticleListPage,
  LegacyContactPage,
  LegacyContentPage,
  LegacyHomePage,
  LegacyProductDetailPage,
  LegacyProductListPage,
} from './pages/LegacyPages'
import type {
  LegacyArticleDetailPageProps,
  LegacyArticleListPageProps,
  LegacyContactPageProps,
  LegacyContentPageProps,
  LegacyHomePageProps,
  LegacyProductDetailPageProps,
  LegacyProductListPageProps,
} from './types'

type PageName =
  | 'legacy-home'
  | 'legacy-contact'
  | 'legacy-content'
  | 'legacy-product-list'
  | 'legacy-product-detail'
  | 'legacy-article-list'
  | 'legacy-article-detail'

type PageProps =
  | LegacyHomePageProps
  | LegacyContactPageProps
  | LegacyContentPageProps
  | LegacyProductListPageProps
  | LegacyProductDetailPageProps
  | LegacyArticleListPageProps
  | LegacyArticleDetailPageProps

export function renderPage(pageName: PageName, props: PageProps): string {
  const page = resolveLegacyPage(pageName, props)
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">${renderToStaticMarkup(page)}`
}

function resolveLegacyPage(pageName: PageName, props: PageProps): React.ReactElement {
  switch (pageName) {
    case 'legacy-home':
      return <LegacyHomePage {...props as LegacyHomePageProps} />
    case 'legacy-contact':
      return <LegacyContactPage {...props as LegacyContactPageProps} />
    case 'legacy-content':
      return <LegacyContentPage {...props as LegacyContentPageProps} />
    case 'legacy-product-list':
      return <LegacyProductListPage {...props as LegacyProductListPageProps} />
    case 'legacy-product-detail':
      return <LegacyProductDetailPage {...props as LegacyProductDetailPageProps} />
    case 'legacy-article-list':
      return <LegacyArticleListPage {...props as LegacyArticleListPageProps} />
    case 'legacy-article-detail':
      return <LegacyArticleDetailPage {...props as LegacyArticleDetailPageProps} />
    default:
      throw new Error(`Unknown legacy site page: ${pageName}`)
  }
}
