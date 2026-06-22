/**
 * SEO元数据服务
 * 提供构建SEO meta标签、Open Graph、Twitter Card、结构化数据等功能
 */

export function buildSeoMeta({
  title,
  description,
  url,
  image,
  type = 'website',
  site
}) {
  const siteConfig = site || {};
  const baseUrl = normalizeBaseUrl(siteConfig.resolved_web_url || siteConfig.web_url);
  const canonicalUrl = toAbsoluteUrl(url, baseUrl) || baseUrl || '/';
  const siteName = siteConfig.web_name || siteConfig.company_name || '';

  const finalTitle = title || siteName;
  const finalDescription = description || '';
  const finalImage = toAbsoluteUrl(image, baseUrl) || '';

  return {
    basic: {
      description: finalDescription,
      robots: 'index, follow',
      canonical: canonicalUrl
    },
    openGraph: {
      title: finalTitle,
      site_name: siteName || finalTitle,
      locale: normalizeOgLocale(resolveSiteLanguageSignal(siteConfig)),
      localeAlternates: buildLocaleAlternates(siteConfig),
      description: finalDescription,
      url: canonicalUrl,
      type,
      image: finalImage,
      imageSecureUrl: finalImage,
      imageWidth: finalImage ? 1440 : null,
      imageHeight: finalImage ? 810 : null,
      imageAlt: finalTitle,
      imageType: finalImage ? inferImageMimeType(finalImage) : null
    },
    twitter: {
      card: finalImage ? 'summary_large_image' : 'summary',
      title: finalTitle,
      description: finalDescription,
      image: finalImage,
      imageAlt: finalTitle
    }
  };
}

export function buildHreflangLinks(site) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const siteLanguage = resolveSiteLanguageSignal(site);
  return baseUrl ? [{ lang: siteLanguage || 'x-default', url: baseUrl }] : [];
}

export function buildJsonLdOrganization(site) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const organizationName = site?.company_name || site?.web_name || '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: organizationName,
    url: baseUrl || '',
    logo: baseUrl ? `${baseUrl}/logo.svg` : '/logo.svg',
    contactPoint: {
      telephone: site?.company_phone || '',
      contactType: 'customer service',
      availableLanguage: collectAvailableLanguages(site)
    }
  };
}

export function buildJsonLdStructuredContent(content, site, options = {}) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const imageValue = content?.photo_url || content?.primary_image || null;
  const imageUrl = toAbsoluteUrl(imageValue, baseUrl);
  const organizationName = site?.company_name || site?.web_name || '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: content?.seo_title || content?.title || content?.name || '',
    description: content?.seo_description || content?.description || content?.summary || '',
    image: imageUrl,
    url: toAbsoluteUrl(options.url, baseUrl) || '',
    brand: {
      '@type': 'Brand',
      name: organizationName
    },
    manufacturer: {
      '@type': 'Organization',
      name: organizationName
    }
  };
}

export function buildJsonLdSectionEntry(entry, site, options = {}) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const imageValue = entry?.photo_url || entry?.picture || entry?.primary_image || null;
  const imageUrl = toAbsoluteUrl(imageValue, baseUrl);
  const organizationName = site?.company_name || site?.web_name || '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: entry?.seo_title || entry?.title || entry?.name || '',
    description: entry?.seo_description || entry?.summary || entry?.description || '',
    image: imageUrl,
    mainEntityOfPage: toAbsoluteUrl(options.url, baseUrl) || '',
    datePublished: entry?.created_at || entry?.add_date || '',
    dateModified: entry?.updated_at || entry?.add_date || entry?.created_at || '',
    author: {
      '@type': 'Organization',
      name: organizationName
    },
    publisher: {
      '@type': 'Organization',
      name: organizationName,
      logo: {
        '@type': 'ImageObject',
        url: baseUrl ? `${baseUrl}/logo.svg` : '/logo.svg'
      }
    }
  };
}

export function generateFaviconLinks() {
  return [
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
    { rel: 'manifest', href: '/site.webmanifest' },
    { rel: 'mask-icon', href: '/safari-pinned-tab.svg', color: '#002d72' },
    { rel: 'shortcut icon', href: '/favicon.ico' }
  ];
}

export function generateThemeColorMetas() {
  return [
    { name: 'msapplication-TileColor', content: '#002d72' },
    { name: 'msapplication-config', content: '/browserconfig.xml' },
    { name: 'theme-color', content: '#ffffff' }
  ];
}

export function buildStructuredContentSeoMeta(content, site, options = {}) {
  const contentName = content?.name || content?.title || '';
  const organizationName = site?.company_name || site?.web_name || '';
  return buildSeoMeta({
    title: content?.seo_title || (contentName && organizationName ? `${contentName} | ${organizationName}` : contentName),
    description: content?.seo_description || content?.summary || content?.description || '',
    url: options.url || '',
    image: content?.photo_url || content?.primary_image || null,
    type: 'website',
    site
  });
}

export function buildSectionEntrySeoMeta(entry, site, options = {}) {
  const title = entry?.seo_title || entry?.title || entry?.name || '';
  return buildSeoMeta({
    title,
    description: entry?.seo_description || entry?.summary || entry?.description || '',
    url: options.url || '',
    image: entry?.photo_url || entry?.picture || entry?.primary_image || null,
    type: 'article',
    site
  });
}

function normalizeBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/g, '');
  return normalized || '';
}

function toAbsoluteUrl(value, baseUrl) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  if (!baseUrl) {
    return normalized;
  }
  return normalized.startsWith('/') ? `${baseUrl}${normalized}` : `${baseUrl}/${normalized}`;
}

function normalizeOgLocale(languageCode) {
  const normalized = String(languageCode || '').trim();
  if (!normalized) {
    return 'zh_CN';
  }
  return normalized.replace('-', '_');
}

function buildLocaleAlternates(site) {
  return buildHreflangLinks(site)
    .map((item) => normalizeOgLocale(item.lang))
    .filter((item) => item !== normalizeOgLocale(resolveSiteLanguageSignal(site)));
}

function collectAvailableLanguages(site) {
  const langs = buildHreflangLinks(site)
    .map((item) => String(item.lang || '').trim())
    .filter(Boolean)
    .filter((item) => item !== 'x-default')
    .map((item) => item.split('-')[0]);
  return Array.from(new Set(langs));
}

function resolveSiteLanguageSignal(site) {
  return String(site?.requested_language_code || site?.current_language_code || '').trim() || 'zh-CN';
}

function inferImageMimeType(url) {
  const value = String(url || '').toLowerCase();
  if (value.endsWith('.png')) {
    return 'image/png';
  }
  if (value.endsWith('.webp')) {
    return 'image/webp';
  }
  if (value.endsWith('.gif')) {
    return 'image/gif';
  }
  return 'image/jpeg';
}
