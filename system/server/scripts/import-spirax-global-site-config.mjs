import { updateSiteConfig } from '../src/services/site.mjs';

const payload = {
  base: {
    web_name: 'Spirax Sarco',
    web_url: 'https://www.spiraxsteam.cn',
    company_name: '斯派莎克中国区',
    company_address: '上海市闵行区浦江高科技园区新骏环路800号',
    postal_code: null,
    company_phone: '+86 157 9019 6438',
    company_fax: '021-24163688',
    contact_person: '斯派莎克中国区',
    company_email: 'sales@spiraxsteam.com',
    icp_number: null,
    web_qq: null,
    web_mobile: '+86 157 9019 6438',
    web_copyright: 'Spirax Sarco',
    web_author: 'Spirax Sarco',
    legacy_extra: JSON.stringify({ import_source: 'spirax-global', type: 'site-config' })
  },
  translations: {
    'zh-CN': {
      web_name: 'Spirax Sarco',
      company_name: '斯派莎克中国区',
      company_address: '上海市闵行区浦江高科技园区新骏环路800号',
      contact_person: '斯派莎克中国区',
      company_email: 'sales@spiraxsteam.com',
      web_copyright: 'Spirax Sarco',
      web_author: 'Spirax Sarco'
    }
  }
};

const result = updateSiteConfig(payload);
console.log(JSON.stringify(result, null, 2));
