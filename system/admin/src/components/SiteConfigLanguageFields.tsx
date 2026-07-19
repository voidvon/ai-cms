import SiteConfigTranslationField from '@/components/SiteConfigTranslationField'
import type { Language, SiteConfigTranslation } from '@/types'

interface SiteConfigLanguageFieldsProps {
  language: Pick<Language, 'code'>
  translation: SiteConfigTranslation
  fallbackTranslation: SiteConfigTranslation
  fallbackLanguageName: string
  isFallbackLanguage: boolean
  onChange: (patch: Partial<SiteConfigTranslation>) => void
}

export default function SiteConfigLanguageFields({
  language,
  translation,
  fallbackTranslation,
  fallbackLanguageName,
  isFallbackLanguage,
  onChange,
}: SiteConfigLanguageFieldsProps) {
  const field = (
    name: keyof SiteConfigTranslation,
    label: string,
    options: { type?: 'text' | 'email' | 'textarea'; rows?: number; placeholder?: string; className?: string; required?: boolean; alwaysShowInput?: boolean } = {}
  ) => (
    <SiteConfigTranslationField
      key={`${language.code}:${String(name)}`}
      id={`${language.code}_${String(name)}`}
      label={label}
      value={String(translation[name] || '')}
      inheritedValue={fallbackTranslation[name] == null ? '' : String(fallbackTranslation[name])}
      fallbackLanguageName={fallbackLanguageName}
      isFallbackLanguage={isFallbackLanguage}
      onChange={(value) => onChange({ [name]: value })}
      {...options}
    />
  )

  return (
    <div className="space-y-8 border-t pt-6">
      <section className="space-y-4">
        <div>
          <h3 className="font-medium">网站与公司</h3>
          <p className="text-sm text-muted-foreground">
            {isFallbackLanguage ? '这些字段为其他语言提供兜底值。' : `留空字段自动继承 ${fallbackLanguageName}。`}
          </p>
        </div>
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
          {field('web_name', '网站名称', { required: isFallbackLanguage, className: 'md:col-span-2', placeholder: '请输入网站名称' })}
          {field('company_name', '公司名称', { placeholder: '请输入公司名称', alwaysShowInput: true })}
          {field('contact_person', '联系人', { placeholder: '请输入联系人' })}
          {field('company_address', '公司地址', { className: 'md:col-span-2', placeholder: '请输入公司地址' })}
          {field('company_email', '公司邮箱', { type: 'email', placeholder: 'sales@example.com' })}
          {field('company_phone', '公司电话', { placeholder: '请输入公司电话' })}
          {field('company_fax', '公司传真', { placeholder: '请输入公司传真' })}
          {field('web_mobile', '手机号', { placeholder: '请输入手机号' })}
          {field('postal_code', '邮政编码', { placeholder: '请输入邮政编码' })}
          {field('web_qq', 'QQ号', { placeholder: '请输入QQ号' })}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <h3 className="font-medium">SEO</h3>
          <p className="text-sm text-muted-foreground">在页面没有单独配置 SEO 时使用。</p>
        </div>
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
          {field('seo_default_title', '默认 SEO 标题', { className: 'md:col-span-2' })}
          {field('seo_default_description', '默认 SEO 描述', { type: 'textarea', rows: 3, className: 'md:col-span-2' })}
          {field('seo_home_title', '首页 SEO 标题', { className: 'md:col-span-2' })}
          {field('seo_home_description', '首页 SEO 描述', { type: 'textarea', rows: 3, className: 'md:col-span-2' })}
        </div>
      </section>

      <section className="space-y-4 border-t pt-6">
        <div>
          <h3 className="font-medium">高级配置</h3>
          <p className="text-sm text-muted-foreground">数据库模板使用的语言化 UI 数据。</p>
        </div>
        <div className="grid gap-x-4 gap-y-5 md:grid-cols-2">
          {field('template_data_json', '全站 UI JSON', { type: 'textarea', rows: 10, className: 'md:col-span-2', placeholder: '{"ui":{...}}' })}
        </div>
      </section>
    </div>
  )
}
