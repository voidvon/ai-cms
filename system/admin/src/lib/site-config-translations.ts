import type { SiteConfigTranslation } from '@/types'

export function createEmptySiteConfigTranslation(patch: Partial<SiteConfigTranslation> = {}): SiteConfigTranslation {
  return {
    web_name: '',
    company_name: '',
    company_address: '',
    postal_code: '',
    company_phone: '',
    company_fax: '',
    contact_person: '',
    company_email: '',
    web_qq: '',
    web_mobile: '',
    seo_default_title: '',
    seo_default_description: '',
    seo_home_title: '',
    seo_home_description: '',
    template_data_json: '',
    ...patch,
  }
}
