import fs from 'node:fs';
import path from 'node:path';
import { getSiteConfig } from './site.mjs';

export function buildRobotsTxt({ outputRoot }) {
  const site = getSiteConfig();
  const siteUrl = normalizeSiteUrl(site.web_url);
  const lines = ['User-agent: *', 'Allow: /'];

  if (siteUrl) {
    lines.push(`Sitemap: ${siteUrl}/sitemap.xml`);
  }

  const filePath = path.resolve(outputRoot, 'robots.txt');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');

  return {
    key: 'robots',
    label: 'Robots 协议',
    recordsProcessed: lines.length,
    filesWritten: 1
  };
}

function normalizeSiteUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}
