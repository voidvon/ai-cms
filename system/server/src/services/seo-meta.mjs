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
  const baseUrl = normalizeBaseUrl(siteConfig.web_url);
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
      locale: normalizeOgLocale(siteConfig.current_language_code),
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
  const baseUrl = normalizeBaseUrl(site?.web_url);
  return baseUrl ? [{ lang: site?.current_language_code || 'x-default', url: baseUrl }] : [];
}

export function buildJsonLdOrganization(site) {
  const baseUrl = normalizeBaseUrl(site?.web_url);
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

export function buildJsonLdProduct(product, site, options = {}) {
  const baseUrl = normalizeBaseUrl(site?.web_url);
  const imageValue = product?.photo_url || product?.primary_image || null;
  const imageUrl = toAbsoluteUrl(imageValue, baseUrl);
  const organizationName = site?.company_name || site?.web_name || '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product?.seo_title || product?.title || product?.name || '',
    description: product?.seo_description || product?.description || product?.summary || '',
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

export function buildJsonLdArticle(article, site, options = {}) {
  const baseUrl = normalizeBaseUrl(site?.web_url);
  const imageValue = article?.photo_url || article?.picture || null;
  const imageUrl = toAbsoluteUrl(imageValue, baseUrl);
  const organizationName = site?.company_name || site?.web_name || '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article?.seo_title || article?.title || '',
    description: article?.seo_description || article?.summary || article?.description || '',
    image: imageUrl,
    mainEntityOfPage: toAbsoluteUrl(options.url, baseUrl) || '',
    datePublished: article?.created_at || article?.add_date || '',
    dateModified: article?.updated_at || article?.add_date || article?.created_at || '',
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

export function buildProductSeoMeta(product, site, options = {}) {
  const productName = product?.name || product?.title || '';
  const organizationName = site?.company_name || site?.web_name || '';
  return buildSeoMeta({
    title: product?.seo_title || (productName && organizationName ? `${productName} | ${organizationName}` : productName),
    description: product?.seo_description || product?.summary || product?.description || '',
    url: options.url || '',
    image: product?.photo_url || product?.primary_image || null,
    type: 'website',
    site
  });
}

export function buildArticleSeoMeta(article, site, options = {}) {
  const title = article?.seo_title || article?.title || '';
  return buildSeoMeta({
    title,
    description: article?.seo_description || article?.summary || article?.description || '',
    url: options.url || '',
    image: article?.photo_url || article?.picture || null,
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
    .filter((item) => item !== normalizeOgLocale(site?.current_language_code));
}

function collectAvailableLanguages(site) {
  const langs = buildHreflangLinks(site)
    .map((item) => String(item.lang || '').trim())
    .filter(Boolean)
    .filter((item) => item !== 'x-default')
    .map((item) => item.split('-')[0]);
  return Array.from(new Set(langs));
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
