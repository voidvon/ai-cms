import { listLanguages } from './languages.mjs';
import { resolveLanguageSitePublicBaseUrl } from './site.mjs';
import { normalizeUploadedRelativePath } from './uploads.mjs';

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
  robots = 'index, follow',
  site
}) {
  const siteConfig = site || {};
  const baseUrl = normalizeBaseUrl(siteConfig.resolved_web_url || siteConfig.web_url);
  const canonicalPath = normalizeSiteScopedPagePath(siteConfig, normalizeIndexDocumentUrl(url));
  const canonicalUrl = toAbsoluteUrl(canonicalPath, baseUrl, siteConfig) || baseUrl || '/';
  const siteName = siteConfig.web_name || siteConfig.company_name || '';

  const finalTitle = title || siteName;
  const finalDescription = description || '';
  const finalImage = toAbsoluteUrl(image, baseUrl, siteConfig) || '';

  return {
    basic: {
      description: finalDescription,
      robots: String(robots || 'index, follow').trim() || 'index, follow',
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

export function buildHreflangLinks(site, options = {}) {
  const pagePath = normalizeSiteScopedPagePath(site, normalizeIndexDocumentUrl(options?.url || '/'));
  const fallbackBaseUrl = normalizeBaseUrl(site?.base_web_url || site?.web_url);
  const hreflangConfig = site?.template_data?.seo?.hreflang || {};
  const links = [];

  for (const language of listLanguages().filter((item) => Number(item?.is_enabled || 0) === 1)) {
    const baseUrl = resolveLanguageSitePublicBaseUrl(language.code, fallbackBaseUrl);
    const hreflang = resolveConfiguredHreflangCode(language, hreflangConfig);
    if (!baseUrl || !hreflang) {
      continue;
    }
    links.push({
      lang: hreflang,
      url: joinUrlPath(baseUrl, pagePath)
    });
  }

  const currentLanguage = normalizeHreflangCode(resolveSiteLanguageSignal(site));
  const currentBaseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  if (links.length === 0 && currentBaseUrl) {
    links.push({
      lang: currentLanguage || 'x-default',
      url: joinUrlPath(currentBaseUrl, pagePath)
    });
  }

  const configuredDefaultLanguageCode = String(hreflangConfig?.xDefaultLanguage || hreflangConfig?.x_default_language || '').trim();
  const defaultLanguage = listLanguages().find((item) => (
    configuredDefaultLanguageCode
      ? item.code === configuredDefaultLanguageCode
      : Number(item?.is_default || 0) === 1
  ));
  const defaultBaseUrl = defaultLanguage
    ? resolveLanguageSitePublicBaseUrl(defaultLanguage.code, fallbackBaseUrl)
    : currentBaseUrl;
  if (defaultBaseUrl) {
    links.push({
      lang: 'x-default',
      url: joinUrlPath(defaultBaseUrl, pagePath)
    });
  }

  return dedupeHreflangLinks(links);
}

export function buildJsonLdOrganization(site) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const organizationConfig = site?.template_data?.seo?.organization || {};
  const organizationName = organizationConfig.name || site?.company_name || site?.web_name || '';
  const legalName = organizationConfig.legalName || organizationConfig.legal_name || '';
  const telephone = organizationConfig.telephone || organizationConfig.phone || site?.company_phone || '';
  const contactType = organizationConfig.contactType || organizationConfig.contact_type || 'customer service';
  const contactLanguages = normalizeStringArray(organizationConfig.availableLanguage || organizationConfig.availableLanguages);
  const address = buildOrganizationAddress(organizationConfig.address || site?.company_address);
  const sameAs = normalizeStringArray(organizationConfig.sameAs || organizationConfig.same_as);

  const output = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: organizationName,
    url: baseUrl || '',
    logo: baseUrl ? `${baseUrl}/logo.svg` : '/logo.svg',
    contactPoint: {
      telephone,
      contactType,
      availableLanguage: contactLanguages.length > 0 ? contactLanguages : collectAvailableLanguages(site)
    }
  };
  if (legalName) {
    output.legalName = legalName;
  }
  if (address) {
    output.address = address;
  }
  if (sameAs.length > 0) {
    output.sameAs = sameAs;
  }
  return output;
}

export function buildJsonLdPageGraph({ site, page, seoMeta, existingJsonLd, breadcrumbs, pageType, schemaType, image, description } = {}) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const canonicalUrl = normalizeAbsoluteUrl(seoMeta?.basic?.canonical)
    || toAbsoluteUrl(page?.url, baseUrl)
    || baseUrl
    || '';
  const pageTitle = String(page?.title || seoMeta?.openGraph?.title || site?.web_name || site?.company_name || '').trim();
  const pageDescription = String(description || seoMeta?.basic?.description || seoMeta?.openGraph?.description || '').trim();
  const organization = normalizeGraphNode(buildJsonLdOrganization(site));
  const organizationId = buildNodeId(baseUrl || canonicalUrl, '#organization');
  const websiteId = buildNodeId(baseUrl || canonicalUrl, '#website');
  const pageId = buildNodeId(canonicalUrl || baseUrl, '#webpage');
  const graph = [];

  if (organization.name || organization.url) {
    organization['@id'] = organizationId;
    graph.push(organization);
  }

  if (baseUrl) {
    const websiteNode = normalizeGraphNode({
      '@type': 'WebSite',
      '@id': websiteId,
      url: baseUrl,
      name: site?.web_name || site?.company_name || pageTitle,
      publisher: { '@id': organizationId },
      inLanguage: normalizeSchemaLanguage(resolveSiteLanguageSignal(site))
    });
    const searchActionUrl = resolveConfiguredSearchActionUrl(site, baseUrl);
    if (searchActionUrl) {
      websiteNode.potentialAction = {
        '@type': 'SearchAction',
        target: searchActionUrl,
        'query-input': 'required name=search_term_string'
      };
    }
    graph.push(websiteNode);
  }

  const pageNode = normalizeGraphNode({
    '@type': resolveSchemaPageType(schemaType || pageType, page, site),
    '@id': pageId,
    url: canonicalUrl,
    name: pageTitle,
    headline: pageTitle,
    description: pageDescription,
    isPartOf: baseUrl ? { '@id': websiteId } : null,
    about: organizationId ? { '@id': organizationId } : null,
    primaryImageOfPage: buildImageObject(image || seoMeta?.openGraph?.image, baseUrl),
    inLanguage: normalizeSchemaLanguage(resolveSiteLanguageSignal(site))
  });
  if (pageNode.url || pageNode.name) {
    graph.push(pageNode);
  }

  const breadcrumbNode = buildJsonLdBreadcrumbList(breadcrumbs, {
    baseUrl,
    site,
    pageUrl: canonicalUrl,
    pageTitle
  });
  if (breadcrumbNode) {
    graph.push(breadcrumbNode);
  }

  for (const node of normalizeExistingJsonLdNodes(existingJsonLd)) {
    const normalizedNode = normalizeGraphNode(node);
    if (!normalizedNode['@type']) {
      continue;
    }
    delete normalizedNode['@context'];
    if (isSameSchemaType(normalizedNode['@type'], 'Organization')) {
      continue;
    }
    if (!normalizedNode['@id']) {
      normalizedNode['@id'] = buildTypedNodeId(canonicalUrl || baseUrl, normalizedNode['@type']);
    }
    if (!normalizedNode.mainEntityOfPage && canonicalUrl) {
      normalizedNode.mainEntityOfPage = { '@id': pageId };
    }
    graph.push(normalizedNode);
  }

  return {
    '@context': 'https://schema.org',
    '@graph': dedupeGraphNodes(graph)
  };
}

export function buildJsonLdStructuredContent(content, site, options = {}) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const imageValue = content?.photo_url || content?.primary_image || null;
  const imageUrl = toAbsoluteUrl(imageValue, baseUrl, site);
  const organizationName = site?.company_name || site?.web_name || '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: content?.seo_title || content?.title || content?.name || '',
    description: content?.seo_description || content?.description || content?.summary || '',
    image: imageUrl,
    url: toAbsoluteUrl(options.url, baseUrl, site) || '',
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

export function buildJsonLdBreadcrumbList(items, options = {}) {
  const normalizedItems = normalizeBreadcrumbItems(items, options);
  if (normalizedItems.length < 2) {
    return null;
  }
  return {
    '@type': 'BreadcrumbList',
    itemListElement: normalizedItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  };
}

export function buildJsonLdSectionEntry(entry, site, options = {}) {
  const baseUrl = normalizeBaseUrl(site?.resolved_web_url || site?.web_url);
  const imageValue = entry?.photo_url || entry?.picture || entry?.primary_image || null;
  const imageUrl = toAbsoluteUrl(imageValue, baseUrl, site);
  const organizationName = site?.company_name || site?.web_name || '';

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: entry?.seo_title || entry?.title || entry?.name || '',
    description: entry?.seo_description || entry?.summary || entry?.description || '',
    image: imageUrl,
    mainEntityOfPage: toAbsoluteUrl(options.url, baseUrl, site) || '',
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

function normalizeAbsoluteUrl(value) {
  const normalized = String(value || '').trim();
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  try {
    const parsed = new URL(normalized);
    parsed.pathname = normalizeIndexDocumentPath(parsed.pathname);
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function toAbsoluteUrl(value, baseUrl, site = null) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  const normalizedUploadPath = normalizeUploadedRelativePath(normalized);
  if (normalizedUploadPath) {
    if (!baseUrl) {
      return normalizedUploadPath;
    }
    return `${baseUrl}${normalizedUploadPath}`;
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  const normalizedValue = normalizeSiteScopedPagePath(site, normalized);
  if (!baseUrl) {
    return normalizedValue;
  }
  return normalizedValue.startsWith('/') ? `${baseUrl}${normalizedValue}` : `${baseUrl}/${normalizedValue}`;
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
    .filter((item) => item.lang !== 'x-default')
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

function normalizeSchemaLanguage(value) {
  const normalized = String(value || '').trim();
  return normalized || 'zh-CN';
}

function normalizePagePath(value) {
  const normalized = String(value || '/').trim() || '/';
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      return `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    } catch {
      return '/';
    }
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeSiteScopedPagePath(site, value) {
  const pagePath = normalizePagePath(value);
  const pathPrefix = normalizeSitePathPrefix(site?.language_site_path_prefix);
  if (pathPrefix === '/' || pagePath === pathPrefix) {
    return pagePath === pathPrefix ? '/' : pagePath;
  }
  if (pagePath.startsWith(`${pathPrefix}/`)) {
    const trimmed = pagePath.slice(pathPrefix.length);
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  return pagePath;
}

function normalizeSitePathPrefix(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === '/') {
    return '/';
  }
  return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}

function normalizeIndexDocumentUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return normalized;
  }
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const parsed = new URL(normalized);
      parsed.pathname = normalizeIndexDocumentPath(parsed.pathname);
      return parsed.toString();
    } catch {
      return normalized;
    }
  }
  const [pathAndSearch, hash = ''] = normalized.split('#');
  const [pathname, search = ''] = pathAndSearch.split('?');
  const outputPath = normalizeIndexDocumentPath(pathname);
  return `${outputPath}${search ? `?${search}` : ''}${hash ? `#${hash}` : ''}`;
}

function normalizeIndexDocumentPath(value) {
  const pathname = String(value || '').trim();
  if (!pathname || pathname === 'index.html' || pathname === '/index.html') {
    return '/';
  }
  return pathname.replace(/\/index\.html$/i, '/');
}

function buildNodeId(url, suffix) {
  const normalizedUrl = normalizeAbsoluteUrl(url) || normalizeBaseUrl(url);
  if (!normalizedUrl) {
    return '';
  }
  return `${normalizedUrl.replace(/#.*$/g, '').replace(/\/+$/g, '')}${suffix}`;
}

function buildTypedNodeId(url, type) {
  const rawType = Array.isArray(type) ? type[0] : type;
  const normalizedType = String(rawType || 'thing').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'thing';
  return buildNodeId(url, `#${normalizedType}`);
}

function resolveSchemaPageType(pageType, page = {}, site = {}) {
  return normalizeSchemaType(
    page?.schemaType
      || page?.schema_type
      || page?.jsonLdType
      || page?.json_ld_type
      || pageType
      || site?.template_data?.seo?.schema?.defaultPageType
      || site?.template_data?.seo?.schema?.default_page_type
      || 'WebPage'
  );
}

function normalizeSchemaType(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const normalized = String(rawValue || '').trim();
  if (!normalized) {
    return 'WebPage';
  }
  return /^[A-Za-z][A-Za-z0-9]*$/.test(normalized) ? normalized : 'WebPage';
}

function resolveConfiguredSearchActionUrl(site, baseUrl) {
  const seoConfig = site?.template_data?.seo || {};
  const rawValue = seoConfig.searchActionUrl || seoConfig.search_action_url || '';
  const normalizedValue = String(rawValue || '').trim();
  if (!normalizedValue) {
    return '';
  }
  return toAbsoluteUrl(normalizedValue, baseUrl, site);
}

function buildImageObject(value, baseUrl) {
  const url = toAbsoluteUrl(value, baseUrl);
  if (!url) {
    return null;
  }
  return {
    '@type': 'ImageObject',
    url
  };
}

function normalizeExistingJsonLdNodes(value) {
  if (!value || typeof value !== 'object') {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeExistingJsonLdNodes(item));
  }
  if (Array.isArray(value['@graph'])) {
    return value['@graph'];
  }
  return [value];
}

function normalizeGraphNode(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, fieldValue]) => [key, normalizeGraphValue(fieldValue)])
      .filter(([, fieldValue]) => !isEmptyGraphValue(fieldValue))
  );
}

function normalizeGraphValue(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeGraphValue(item))
      .filter((item) => !isEmptyGraphValue(item));
  }
  if (value && typeof value === 'object') {
    return normalizeGraphNode(value);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

function isEmptyGraphValue(value) {
  if (value === null || value === undefined || value === '') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).length === 0;
  }
  return false;
}

function isSameSchemaType(value, expected) {
  const normalizedExpected = String(expected || '').trim().toLowerCase();
  if (Array.isArray(value)) {
    return value.some((item) => isSameSchemaType(item, expected));
  }
  return String(value || '').trim().toLowerCase() === normalizedExpected;
}

function dedupeGraphNodes(nodes) {
  const seen = new Set();
  return nodes.filter((node) => {
    const normalizedNode = normalizeGraphNode(node);
    const id = String(normalizedNode['@id'] || '').trim();
    const type = Array.isArray(normalizedNode['@type'])
      ? normalizedNode['@type'].join(',')
      : String(normalizedNode['@type'] || '').trim();
    const key = id || `${type}\n${String(normalizedNode.url || normalizedNode.name || normalizedNode.headline || '')}`;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    Object.keys(node).forEach((field) => {
      delete node[field];
    });
    Object.assign(node, normalizedNode);
    return true;
  });
}

function normalizeBreadcrumbItems(items, options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const output = [
    {
      name: 'Home',
      url: baseUrl ? `${baseUrl}/` : '/'
    }
  ];

  for (const item of Array.isArray(items) ? items : []) {
    const name = String(item?.name || item?.title || '').trim();
    const url = toAbsoluteUrl(item?.url, baseUrl, options.site);
    if (!name || !url) {
      continue;
    }
    output.push({
      name,
      url: normalizeAbsoluteUrl(url) || url
    });
  }

  const pageTitle = String(options.pageTitle || '').trim();
  const pageUrl = normalizeAbsoluteUrl(options.pageUrl) || toAbsoluteUrl(options.pageUrl, baseUrl, options.site);
  if (pageTitle && pageUrl) {
    output.push({
      name: pageTitle,
      url: pageUrl
    });
  }

  const seen = new Set();
  return output.filter((item) => {
    const url = normalizeAbsoluteUrl(item.url) || String(item.url || '').trim();
    const name = String(item.name || '').trim();
    if (!url || !name) {
      return false;
    }
    const key = url.replace(/\/+$/g, '') || '/';
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    item.url = url;
    item.name = name;
    return true;
  });
}

function joinUrlPath(baseUrl, pagePath) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) {
    return '';
  }
  const path = normalizePagePath(pagePath);
  return path === '/' ? `${base}/` : `${base}${path}`;
}

function normalizeHreflangCode(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  if (raw.toLowerCase() === 'x-default') {
    return 'x-default';
  }
  const [language, region] = raw.split('-');
  const normalizedLanguage = String(language || '').toLowerCase();
  if (!/^[a-z]{2,3}$/.test(normalizedLanguage)) {
    return '';
  }
  if (!region) {
    return normalizedLanguage;
  }
  const normalizedRegion = String(region || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalizedRegion)) {
    return normalizedLanguage;
  }
  return `${normalizedLanguage}-${normalizedRegion}`;
}

function resolveConfiguredHreflangCode(language, config = {}) {
  const languageCode = String(language?.code || '').trim();
  if (!languageCode) {
    return '';
  }
  const excluded = new Set(normalizeStringArray(config?.excludedLanguages || config?.excluded_languages));
  if (excluded.has(languageCode)) {
    return '';
  }
  const overrides = config?.codeOverrides || config?.code_overrides || {};
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides) && Object.hasOwn(overrides, languageCode)) {
    return normalizeHreflangCode(overrides[languageCode]);
  }
  return normalizeHreflangCode(languageCode);
}

function dedupeHreflangLinks(links) {
  const seen = new Set();
  return links.filter((item) => {
    const lang = String(item?.lang || '').trim();
    const url = String(item?.url || '').trim();
    if (!lang || !url) {
      return false;
    }
    const key = `${lang}\n${url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildOrganizationAddress(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const streetAddress = value.trim();
    return streetAddress
      ? { '@type': 'PostalAddress', streetAddress }
      : null;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const fields = {
    streetAddress: value.streetAddress || value.street_address || '',
    addressLocality: value.addressLocality || value.locality || '',
    addressRegion: value.addressRegion || value.region || '',
    postalCode: value.postalCode || value.postal_code || '',
    addressCountry: value.addressCountry || value.country || ''
  };
  const output = { '@type': 'PostalAddress' };
  for (const [key, fieldValue] of Object.entries(fields)) {
    const normalized = String(fieldValue || '').trim();
    if (normalized) {
      output[key] = normalized;
    }
  }
  return Object.keys(output).length > 1 ? output : null;
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  const normalized = String(value || '').trim();
  return normalized ? [normalized] : [];
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
