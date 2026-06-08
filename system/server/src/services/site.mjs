import { execute, queryOne } from '../db.mjs';
import { listNews } from './news.mjs';
import { listProducts, searchProducts } from './products.mjs';

export function getSiteConfig() {
  return (
    queryOne(`
      SELECT
        id,
        web_name,
        web_url,
        company_name,
        company_address,
        postal_code,
        company_phone,
        company_fax,
        contact_person,
        company_email,
        icp_number,
        web_qq,
        web_mobile,
        web_copyright,
        web_author,
        legacy_extra
      FROM site_config
      WHERE id = 1
    `) || {
      id: 1,
      web_name: 'Spirax Sarco CN',
      web_url: '',
      company_name: '',
      company_address: '',
      postal_code: '',
      company_phone: '',
      company_fax: '',
      contact_person: '',
      company_email: '',
      icp_number: '',
      web_qq: '',
      web_mobile: '',
      web_copyright: '',
      web_author: '',
      legacy_extra: null
    }
  );
}

export function updateSiteConfig(input) {
  const existing = getSiteConfig();
  const payload = normalizeSiteConfigInput({ ...existing, ...input });

  execute(
    `
      INSERT INTO site_config (
        id,
        web_name,
        web_url,
        company_name,
        company_address,
        postal_code,
        company_phone,
        company_fax,
        contact_person,
        company_email,
        icp_number,
        web_qq,
        web_mobile,
        web_copyright,
        web_author,
        legacy_extra
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        web_name = excluded.web_name,
        web_url = excluded.web_url,
        company_name = excluded.company_name,
        company_address = excluded.company_address,
        postal_code = excluded.postal_code,
        company_phone = excluded.company_phone,
        company_fax = excluded.company_fax,
        contact_person = excluded.contact_person,
        company_email = excluded.company_email,
        icp_number = excluded.icp_number,
        web_qq = excluded.web_qq,
        web_mobile = excluded.web_mobile,
        web_copyright = excluded.web_copyright,
        web_author = excluded.web_author,
        legacy_extra = excluded.legacy_extra
    `,
    [
      1,
      payload.web_name,
      payload.web_url,
      payload.company_name,
      payload.company_address,
      payload.postal_code,
      payload.company_phone,
      payload.company_fax,
      payload.contact_person,
      payload.company_email,
      payload.icp_number,
      payload.web_qq,
      payload.web_mobile,
      payload.web_copyright,
      payload.web_author,
      payload.legacy_extra
    ]
  );

  return getSiteConfig();
}

export { listNews, listProducts, searchProducts };

function normalizeSiteConfigInput(input) {
  return {
    web_name: toNullableString(input.web_name),
    web_url: toNullableString(input.web_url),
    company_name: toNullableString(input.company_name),
    company_address: toNullableString(input.company_address),
    postal_code: toNullableString(input.postal_code),
    company_phone: toNullableString(input.company_phone),
    company_fax: toNullableString(input.company_fax),
    contact_person: toNullableString(input.contact_person),
    company_email: toNullableString(input.company_email),
    icp_number: toNullableString(input.icp_number),
    web_qq: toNullableString(input.web_qq),
    web_mobile: toNullableString(input.web_mobile),
    web_copyright: toNullableString(input.web_copyright),
    web_author: toNullableString(input.web_author),
    legacy_extra: toNullableString(input.legacy_extra)
  };
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}
