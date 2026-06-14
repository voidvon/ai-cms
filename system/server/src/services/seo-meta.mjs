/**
 * SEO元数据服务
 * 提供构建SEO meta标签、Open Graph、Twitter Card、结构化数据等功能
 */

/**
 * 构建页面SEO元数据
 * @param {Object} options
 * @param {string} options.title - 页面标题
 * @param {string} options.description - 页面描述
 * @param {string} options.url - 页面URL
 * @param {string} options.image - 页面图片
 * @param {string} options.type - Open Graph类型 (website, article等)
 * @param {Object} options.site - 站点配置对象
 * @returns {Object} SEO元数据对象
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
  const baseUrl = siteConfig.web_url || 'https://www.spiraxsteam.cn';
  const canonicalUrl = url || baseUrl;
  const defaultImage = `${baseUrl}/images/global/generic-header-images/header_engineers_07-60993fae75.jpg`;
  const defaultTitle = '斯派莎克阀门 蒸汽系统解决方案 | SpiraxSarco 中国';
  const defaultDescription = '探索 Spirax Sarco 斯派莎克蒸汽系统解决方案，包括蒸汽疏水阀、压力控制阀、流量计、冷凝水回收以及蒸汽系统服务。';

  const finalTitle = title || defaultTitle;
  const finalDescription = description || defaultDescription;
  const finalImage = image ? `${baseUrl}${image}` : defaultImage;

  return {
    basic: {
      description: finalDescription,
      robots: 'index, follow',
      canonical: canonicalUrl
    },
    openGraph: {
      title: finalTitle,
      site_name: 'Spirax Sarco',
      locale: 'zh_CN',
      localeAlternates: ['ar', 'en', 'fr', 'pt', 'ru', 'th', 'tr'],
      description: finalDescription,
      url: canonicalUrl,
      type: type,
      image: finalImage,
      imageSecureUrl: finalImage,
      imageWidth: 1440,
      imageHeight: 810,
      imageAlt: finalTitle,
      imageType: 'image/jpeg'
    },
    twitter: {
      card: 'summary_large_image',
      site: '@spiraxsarco',
      title: finalTitle,
      description: finalDescription,
      image: finalImage,
      imageAlt: finalTitle
    }
  };
}

/**
 * 构建hreflang多语言链接
 * @returns {Array<Object>} hreflang链接数组
 */
export function buildHreflangLinks() {
  return [
    { lang: 'ar', url: 'https://www.spiraxsteam.ae/' },
    { lang: 'en', url: 'https://www.spiraxsteam.com/' },
    { lang: 'fr', url: 'https://www.spiraxsteam.com/fr/' },
    { lang: 'pt', url: 'https://www.spiraxsteam.com/pt/' },
    { lang: 'ru', url: 'https://www.spiraxsteam.ru/' },
    { lang: 'th', url: 'https://www.spiraxsteam.com/th/' },
    { lang: 'tr', url: 'https://www.spiraxsteam.com/tr/' },
    { lang: 'zh-CN', url: 'https://www.spiraxsteam.cn/' },
    { lang: 'x-default', url: 'https://www.spiraxsteam.com/' }
  ];
}

/**
 * 构建Schema.org组织结构化数据
 * @param {Object} site - 站点配置
 * @returns {Object} JSON-LD结构化数据对象
 */
export function buildJsonLdOrganization(site) {
  const baseUrl = site.web_url || 'https://www.spiraxsteam.cn';

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Spirax Sarco',
    url: baseUrl,
    logo: `${baseUrl}/logo.svg`,
    sameAs: [
      'https://www.linkedin.com/company/spirax-sarco',
      'https://twitter.com/spiraxsarco'
    ],
    contactPoint: {
      telephone: site.company_phone || '+86-157-9019-6438',
      contactType: 'customer service',
      availableLanguage: ['ar', 'en', 'zh', 'ru']
    }
  };
}

/**
 * 构建产品详情页的结构化数据
 * @param {Object} product - 产品对象
 * @param {Object} site - 站点配置
 * @returns {Object} JSON-LD产品结构化数据
 */
export function buildJsonLdProduct(product, site) {
  const baseUrl = site.web_url || 'https://www.spiraxsteam.cn';
  const imageUrl = product.photo_url ? `${baseUrl}${product.photo_url}` : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title || product.name,
    description: product.description || product.summary,
    image: imageUrl,
    brand: {
      '@type': 'Brand',
      name: 'Spirax Sarco'
    },
    manufacturer: {
      '@type': 'Organization',
      name: 'Spirax Sarco'
    }
  };
}

/**
 * 构建新闻/文章的结构化数据
 * @param {Object} article - 文章对象
 * @param {Object} site - 站点配置
 * @returns {Object} JSON-LD文章结构化数据
 */
export function buildJsonLdArticle(article, site) {
  const baseUrl = site.web_url || 'https://www.spiraxsteam.cn';
  const imageUrl = article.photo_url ? `${baseUrl}${article.photo_url}` : null;

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.summary || article.description,
    image: imageUrl,
    datePublished: article.created_at || article.add_date,
    dateModified: article.updated_at || article.add_date,
    author: {
      '@type': 'Organization',
      name: 'Spirax Sarco'
    },
    publisher: {
      '@type': 'Organization',
      name: 'Spirax Sarco',
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/logo.svg`
      }
    }
  };
}

/**
 * 生成Favicon链接数组
 * @returns {Array<Object>} Favicon链接配置数组
 */
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

/**
 * 生成主题颜色meta标签数组
 * @returns {Array<Object>} 主题颜色配置数组
 */
export function generateThemeColorMetas() {
  return [
    { name: 'msapplication-TileColor', content: '#002d72' },
    { name: 'msapplication-config', content: '/browserconfig.xml' },
    { name: 'theme-color', content: '#ffffff' }
  ];
}

/**
 * 为产品详情页构建SEO元数据
 * @param {Object} product - 产品对象
 * @param {Object} site - 站点配置
 * @returns {Object} SEO元数据
 */
export function buildProductSeoMeta(product, site) {
  const baseUrl = site.web_url || 'https://www.spiraxsteam.cn';
  const title = `${product.title || product.name} | Spirax Sarco 斯派莎克`;
  const description = product.summary || product.description || `了解 Spirax Sarco 斯派莎克 ${product.title || product.name}，提供专业的蒸汽系统解决方案。`;
  const url = `${baseUrl}/product/${product.id}.html`;
  const image = product.photo_url || null;

  return buildSeoMeta({
    title,
    description,
    url,
    image,
    type: 'website',
    site
  });
}

/**
 * 为新闻详情页构建SEO元数据
 * @param {Object} article - 文章对象
 * @param {Object} site - 站点配置
 * @returns {Object} SEO元数据
 */
export function buildArticleSeoMeta(article, site) {
  const baseUrl = site.web_url || 'https://www.spiraxsteam.cn';
  const title = `${article.title} | Spirax Sarco 斯派莎克`;
  const description = article.summary || article.description || `阅读 Spirax Sarco 斯派莎克关于蒸汽系统的专业文章：${article.title}`;
  const url = `${baseUrl}/news/detail/${article.id}.html`;
  const image = article.photo_url || null;

  return buildSeoMeta({
    title,
    description,
    url,
    image,
    type: 'article',
    site
  });
}
