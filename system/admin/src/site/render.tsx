import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LegacyContactPage,
  LegacyContentPage,
  LegacyHomePage,
  LegacyArticleDetailPage,
  LegacyArticleListPage,
  LegacyCollectionDetailPage,
  LegacyCollectionListPage,
} from './pages/LegacyPages'
import type {
  LegacyArticleDetailPageProps,
  LegacyArticleListPageProps,
  LegacyContactPageProps,
  LegacyCollectionDetailPageProps,
  LegacyCollectionListPageProps,
  LegacyContentPageProps,
  LegacyHomePageProps,
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
  | LegacyCollectionListPageProps
  | LegacyCollectionDetailPageProps
  | LegacyArticleListPageProps
  | LegacyArticleDetailPageProps

export function renderPage(pageName: PageName, props: PageProps): string {
  const page = resolveLegacyPage(pageName, props)
  const markup = renderToStaticMarkup(page)
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">${injectHtmlLang(markup, props)}`
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
      return <LegacyCollectionListPage {...props as LegacyCollectionListPageProps} />
    case 'legacy-product-detail':
      return <LegacyCollectionDetailPage {...props as LegacyCollectionDetailPageProps} />
    case 'legacy-article-list':
      return <LegacyArticleListPage {...props as LegacyArticleListPageProps} />
    case 'legacy-article-detail':
      return <LegacyArticleDetailPage {...props as LegacyArticleDetailPageProps} />
    default:
      throw new Error(`Unknown legacy site page: ${pageName}`)
  }
}

function injectHtmlLang(markup: string, props: PageProps): string {
  const languageCode = String(
    props?.site?.requested_language_code
    || props?.site?.current_language_code
    || ''
  ).trim()

  if (!languageCode) {
    return markup
  }

  return markup.replace(/<html\b([^>]*)>/i, (match, attrs = '') => {
    if (/\slang\s*=/i.test(attrs)) {
      return match.replace(/\slang\s*=\s*(['"])(.*?)\1/i, ` lang="${languageCode}"`)
    }
    return `<html lang="${languageCode}"${attrs}>`
  })
}
