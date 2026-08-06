import '../src/load-env.mjs';
import { execute, getDb, queryOne } from '../src/db.mjs';

const TEMPLATE_ID = 27;
const CONTACT_COLUMN_ID = 87;
const LANGUAGE_CODE = 'zh-CN';
const SCRIPT_MARKER = 'const INQUIRY_FORM_SCRIPT =';
const COMPONENT_MARKER = 'function InquiryForm({ config, renderButton }) {';
const CSS_MARKER = '/* contact inquiry form */';

const INQUIRY_SCRIPT_BLOCK = `const INQUIRY_FORM_SCRIPT = \`
(() => {
  if (typeof window === 'undefined' || window.__sgInquiryFormBound) return;
  window.__sgInquiryFormBound = true;

  function setStatus(form, message, state) {
    const status = form.querySelector('[data-inquiry-form-status]');
    if (!(status instanceof HTMLElement)) return;
    status.textContent = message || '';
    status.dataset.state = state || '';
  }

  function resetTurnstile(form) {
    const widget = form.querySelector('[data-inquiry-turnstile]');
    if (widget && window.turnstile && typeof window.turnstile.reset === 'function') {
      window.turnstile.reset(widget);
    }
  }

  document.querySelectorAll('[data-inquiry-form]').forEach((form) => {
    const startedAt = form.querySelector('input[name="form_started_at"]');
    if (startedAt instanceof HTMLInputElement) startedAt.value = String(Date.now());
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-inquiry-form]')) return;
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const formData = new FormData(form);
    const email = String(formData.get('email') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    if (!email && !phone) {
      setStatus(form, form.dataset.contactError || '请至少填写邮箱或电话其中一项。', 'error');
      return;
    }
    if (!String(formData.get('cf-turnstile-response') || '').trim()) {
      setStatus(form, form.dataset.turnstileError || '请完成人机验证后再提交。', 'error');
      return;
    }

    const submitButton = form.querySelector('[data-inquiry-submit]');
    const originalLabel = submitButton instanceof HTMLElement ? submitButton.textContent : '';
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
    if (submitButton instanceof HTMLElement) submitButton.textContent = form.dataset.submittingLabel || '提交中...';
    setStatus(form, '', '');

    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'same-origin'
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || form.dataset.errorMessage || '提交失败，请稍后再试。');
      }

      form.reset();
      resetTurnstile(form);
      const nextStartedAt = form.querySelector('input[name="form_started_at"]');
      if (nextStartedAt instanceof HTMLInputElement) nextStartedAt.value = String(Date.now());
      const successMessage = result.message || form.dataset.successMessage || '感谢您的询价，我们会尽快与您联系。';
      setStatus(form, successMessage, 'success');
      window.dispatchEvent(new CustomEvent('sg-ui-toast:show', { detail: { text: successMessage, duration: 3200 } }));
    } catch (error) {
      resetTurnstile(form);
      setStatus(form, error?.message || form.dataset.errorMessage || '提交失败，请稍后再试。', 'error');
    } finally {
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
      if (submitButton instanceof HTMLElement) submitButton.textContent = originalLabel || '提交询价';
    }
  });
})();
\`;

`;

const INQUIRY_COMPONENT_BLOCK = `function InquiryForm({ config, renderButton }) {
  if (!config?.enabled) return null;
  const types = asArray(config.types).filter((item) => text(item?.value) && text(item?.label));
  const endpoint = text(config.endpoint) || '/api/public/inquiries';
  const turnstile = config.turnstile && typeof config.turnstile === 'object' ? config.turnstile : null;
  const turnstileEnabled = Boolean(turnstile?.enabled && text(turnstile?.siteKey));
  const statusId = 'sg-inquiry-form-status';
  const Button = renderButton || ((buttonProps) => <button {...buttonProps}>{buttonProps.children}</button>);

  return (
    <section className="sg-inquiry-form-section" aria-labelledby="sg-inquiry-form-title">
      <div className="sg-inquiry-form-section__header">
        <h3 id="sg-inquiry-form-title">{text(config.title) || '提交询价'}</h3>
      </div>
      <form
        action={endpoint}
        aria-describedby={statusId}
        className="sg-inquiry-form"
        data-contact-error={text(config.contactRequiredMessage)}
        data-error-message={text(config.errorMessage)}
        data-inquiry-form
        data-submitting-label={text(config.submittingLabel)}
        data-success-message={text(config.successMessage)}
        data-turnstile-error={text(turnstile?.requiredMessage)}
        method="post"
      >
        <div className="sg-inquiry-form__field sg-inquiry-form__field--full">
          <label htmlFor="inquiry-type">{text(config.typeLabel) || '询价类型'}</label>
          <select id="inquiry-type" name="inquiry_type" required defaultValue="">
            <option disabled value="">{text(config.typePlaceholder) || '请选择询价类型'}</option>
            {types.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </div>
        <div className="sg-inquiry-form__field">
          <label htmlFor="inquiry-name">{text(config.nameLabel) || '姓名'}</label>
          <input autoComplete="name" id="inquiry-name" maxLength="100" name="contact_name" required type="text" />
        </div>
        <div className="sg-inquiry-form__field">
          <label htmlFor="inquiry-company">{text(config.companyLabel) || '公司名称'}</label>
          <input autoComplete="organization" id="inquiry-company" maxLength="200" name="company" type="text" />
        </div>
        <div className="sg-inquiry-form__field">
          <label htmlFor="inquiry-email">{text(config.emailLabel) || '邮箱'}</label>
          <input autoComplete="email" id="inquiry-email" maxLength="254" name="email" type="email" />
        </div>
        <div className="sg-inquiry-form__field">
          <label htmlFor="inquiry-phone">{text(config.phoneLabel) || '电话'}</label>
          <input autoComplete="tel" id="inquiry-phone" maxLength="60" name="phone" type="tel" />
        </div>
        <div className="sg-inquiry-form__field sg-inquiry-form__field--full">
          <label htmlFor="inquiry-requirements">{text(config.requirementsLabel) || '具体需求'}</label>
          <textarea id="inquiry-requirements" maxLength="5000" name="requirements" required rows="6"></textarea>
        </div>
        <div aria-hidden="true" className="sg-inquiry-form__honeypot">
          <label htmlFor="inquiry-website">Website</label>
          <input autoComplete="off" id="inquiry-website" name="website" tabIndex="-1" type="text" />
        </div>
        <input name="form_started_at" type="hidden" />
        <input name="language_code" type="hidden" value={text(config.languageCode) || 'zh-CN'} />
        {turnstileEnabled ? (
          <div className="sg-inquiry-form__turnstile sg-inquiry-form__field--full">
            <div
              className="cf-turnstile"
              data-inquiry-turnstile
              data-sitekey={text(turnstile.siteKey)}
              data-theme={text(turnstile.theme) || 'light'}
            ></div>
          </div>
        ) : null}
        <div className="sg-inquiry-form__footer sg-inquiry-form__field--full">
          {Button({
            className: 'sg-inquiry-form__submit',
            'data-inquiry-submit': true,
            type: 'submit',
            variant: 'primary',
            children: text(config.submitLabel) || '提交询价'
          })}
          <p aria-live="polite" className="sg-inquiry-form__status" data-inquiry-form-status id={statusId}></p>
        </div>
      </form>
      {renderScript(INQUIRY_FORM_SCRIPT)}
      {turnstileEnabled ? <script async defer src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script> : null}
    </section>
  );
}

`;

const INQUIRY_CSS_BLOCK = `

/* contact inquiry form */
.sg-contact-page .sg-inquiry-form-section {
  box-sizing: border-box;
  height: 100%;
  margin: 0;
  padding: 36px;
  background: #fff;
}
.sg-contact-page .sg-contact-page__grid--inquiry-layout {
  align-items: stretch;
  background: #fff;
}
.sg-contact-page .sg-contact-page__grid--inquiry-layout > .sg-contact-page__contact-column > .bg--white {
  height: 100%;
}
.sg-contact-page .sg-contact-page__grid--inquiry-layout .sg-contact-page__sidebar-shell {
  box-sizing: border-box;
  width: 100%;
  padding: 36px;
}
.sg-contact-page .sg-inquiry-form-section__header {
  margin-bottom: 26px;
}
.sg-contact-page .sg-inquiry-form-section__header h3 {
  margin: 0;
  color: #17324d;
  font-size: 28px;
  font-weight: 600;
  line-height: 1.25;
  text-align: left;
}
.sg-contact-page .sg-inquiry-form {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 22px 24px;
}
.sg-contact-page .sg-inquiry-form__field {
  display: flex;
  flex: 1 1 calc(50% - 12px);
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}
.sg-contact-page .sg-inquiry-form__field--full {
  flex-basis: 100%;
}
.sg-contact-page .sg-inquiry-form__field label {
  color: #253746;
  font-size: 15px;
  font-weight: 600;
}
.sg-contact-page .sg-inquiry-form__field input,
.sg-contact-page .sg-inquiry-form__field select,
.sg-contact-page .sg-inquiry-form__field textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #9aa9b5;
  border-radius: 4px;
  background: #fff;
  color: #172b3a;
  font: inherit;
  outline: none;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.sg-contact-page .sg-inquiry-form__field input,
.sg-contact-page .sg-inquiry-form__field select {
  min-height: 48px;
  padding: 0 14px;
}
.sg-contact-page .sg-inquiry-form__field textarea {
  min-height: 148px;
  padding: 12px 14px;
  resize: vertical;
}
.sg-contact-page .sg-inquiry-form__field input:focus,
.sg-contact-page .sg-inquiry-form__field select:focus,
.sg-contact-page .sg-inquiry-form__field textarea:focus {
  border-color: #006f8b;
  box-shadow: 0 0 0 3px rgba(0, 111, 139, 0.16);
}
.sg-contact-page .sg-inquiry-form__footer {
  display: flex;
  min-height: 42px;
  align-items: flex-start;
  flex-direction: column;
  justify-content: flex-start;
  gap: 8px;
}
.sg-contact-page .sg-inquiry-form__status {
  min-height: 24px;
  margin: 0;
  color: #5b6872;
  font-size: 14px;
  line-height: 1.5;
}
.sg-contact-page .sg-inquiry-form__status[data-state="success"] {
  color: #167447;
}
.sg-contact-page .sg-inquiry-form__status[data-state="error"] {
  color: #b42318;
}
.sg-contact-page .sg-inquiry-form__turnstile {
  display: flex;
  flex-basis: 100%;
  justify-content: flex-start;
  min-height: 65px;
}
.sg-contact-page .sg-inquiry-form__submit {
  min-width: 132px;
}
.sg-contact-page .sg-inquiry-form__honeypot {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
@media (max-width: 720px) {
  .sg-contact-page .sg-inquiry-form-section {
    padding: 26px 20px;
  }
  .sg-contact-page .sg-inquiry-form-section__header h3 {
    font-size: 24px;
  }
  .sg-contact-page .sg-inquiry-form {
    gap: 18px;
  }
  .sg-contact-page .sg-inquiry-form__field {
    flex-basis: 100%;
  }
  .sg-contact-page .sg-inquiry-form__footer {
    align-items: stretch;
  }
  .sg-contact-page .sg-inquiry-form__submit {
    width: 100%;
  }
}
`;

const FORM_CONFIG = {
  enabled: true,
  title: '提交询价',
  endpoint: '/api/public/inquiries',
  languageCode: 'zh-CN',
  typeLabel: '询价类型',
  typePlaceholder: '请选择询价类型',
  types: [
    { value: 'product', label: '产品询价' },
    { value: 'technical', label: '技术咨询' },
    { value: 'service', label: '服务支持' },
    { value: 'other', label: '其他' }
  ],
  nameLabel: '姓名',
  companyLabel: '公司名称',
  emailLabel: '邮箱',
  phoneLabel: '电话',
  requirementsLabel: '具体需求',
  submitLabel: '提交询价',
  submittingLabel: '提交中...',
  successMessage: '感谢您的询价，我们会尽快与您联系。',
  errorMessage: '提交失败，请稍后再试。',
  contactRequiredMessage: '请至少填写邮箱或电话其中一项。',
  turnstile: {
    enabled: true,
    siteKey: '',
    theme: 'light',
    requiredMessage: '请完成人机验证后再提交。'
  }
};

const template = queryOne(
  `
    SELECT id, engine, tsx_source, css_source, published_tsx_source, published_css_source
    FROM templates
    WHERE id = ?
  `,
  [TEMPLATE_ID]
);
if (!template) throw new Error(`模板 ${TEMPLATE_ID} 不存在`);
if (template.engine !== 'tsx') throw new Error(`模板 ${TEMPLATE_ID} 不是 TSX 引擎`);

const hadInquiryForm = String(template.tsx_source || '').includes(COMPONENT_MARKER);
const nextTsxSource = updateTsxSource(template.tsx_source);
const nextPublishedTsxSource = updateTsxSource(template.published_tsx_source || template.tsx_source);
const nextCssSource = updateCssSource(template.css_source);
const nextPublishedCssSource = updateCssSource(template.published_css_source || template.css_source);

const translation = queryOne(
  `
    SELECT ct.id, ct.template_data_json
    FROM column_translations ct
    JOIN languages l ON l.id = ct.language_id
    WHERE ct.column_id = ? AND l.code = ?
  `,
  [CONTACT_COLUMN_ID, LANGUAGE_CODE]
);
if (!translation) throw new Error(`栏目 ${CONTACT_COLUMN_ID} 缺少 ${LANGUAGE_CODE} 翻译`);
const templateData = parseJsonObject(translation.template_data_json);
FORM_CONFIG.turnstile.siteKey = String(
  process.env.TURNSTILE_SITE_KEY
  || templateData.inquiryForm?.turnstile?.siteKey
  || ''
).trim();
if (!FORM_CONFIG.turnstile.siteKey) {
  throw new Error('请通过 TURNSTILE_SITE_KEY 配置 Cloudflare Turnstile Site Key');
}
templateData.inquiryForm = FORM_CONFIG;

const db = getDb();
db.exec('BEGIN IMMEDIATE');
try {
  const now = new Date().toISOString();
  execute(
    `
      UPDATE templates
      SET tsx_source = ?, css_source = ?, published_tsx_source = ?, published_css_source = ?, updated_at = ?
      WHERE id = ?
    `,
    [nextTsxSource, nextCssSource, nextPublishedTsxSource, nextPublishedCssSource, now, TEMPLATE_ID]
  );
  execute(
    `UPDATE column_translations SET template_data_json = ?, updated_at = ? WHERE id = ?`,
    [JSON.stringify(templateData), now, translation.id]
  );
  execute(
    `
      INSERT INTO template_versions (template_id, version_no, engine, tsx_source, css_source, note, created_at)
      VALUES (?, (SELECT coalesce(max(version_no), 0) + 1 FROM template_versions WHERE template_id = ?), 'tsx', ?, ?, ?, ?)
    `,
    [
      TEMPLATE_ID,
      TEMPLATE_ID,
      nextTsxSource,
      nextCssSource,
      hadInquiryForm ? '优化中文版询价表单布局与控件尺寸' : '中文版联系页增加询价表单',
      now
    ]
  );
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

console.log(JSON.stringify({ success: true, templateId: TEMPLATE_ID, columnId: CONTACT_COLUMN_ID, languageCode: LANGUAGE_CODE }));

function updateTsxSource(source) {
  let output = String(source || '');
  if (output.includes(SCRIPT_MARKER)) {
    output = replaceUntil(output, SCRIPT_MARKER, 'function asArray(value) {', INQUIRY_SCRIPT_BLOCK);
  } else {
    output = insertBefore(output, 'function asArray(value) {', INQUIRY_SCRIPT_BLOCK);
  }
  if (output.includes(COMPONENT_MARKER)) {
    output = replaceUntil(output, COMPONENT_MARKER, 'function Toast() {', INQUIRY_COMPONENT_BLOCK);
  } else {
    output = insertBefore(output, 'function Toast() {', INQUIRY_COMPONENT_BLOCK);
  }
  if (!output.includes('const inquiryForm = data.inquiryForm')) {
    output = replaceOnce(
      output,
      '  const appendixHtml = text(data.appendixHtml);',
      '  const appendixHtml = text(data.appendixHtml);\n  const inquiryForm = data.inquiryForm && typeof data.inquiryForm === \'object\' ? data.inquiryForm : null;'
    );
  }
  const inquiryFormElement = '<InquiryForm config={inquiryForm} renderButton={(buttonProps) => props.component(\'button\', buttonProps)} />';
  const oldInquiryLayout = `        <div className="sg-contact-page__content-shell">
          ${inquiryFormElement}
          <div className="grid sg-contact-page__grid--single-column">`;
  const nextInquiryLayout = `        <div className="sg-contact-page__content-shell">
          <div className="grid sg-contact-page__grid--inquiry-layout">
            ${inquiryFormElement}`;
  if (output.includes(oldInquiryLayout)) {
    output = replaceOnce(output, oldInquiryLayout, nextInquiryLayout);
  } else if (!output.includes('<InquiryForm config={inquiryForm}')) {
    output = replaceOnce(
      output,
      '        <div className="sg-contact-page__content-shell">\n          <div className="grid sg-contact-page__grid--single-column">',
      nextInquiryLayout
    );
  }
  const oldFooter = `        <div className="sg-inquiry-form__footer sg-inquiry-form__field--full">
          <p aria-live="polite" className="sg-inquiry-form__status" data-inquiry-form-status id={statusId}></p>
          {Button({
            className: 'sg-inquiry-form__submit',
            'data-inquiry-submit': true,
            type: 'submit',
            variant: 'primary',
            children: text(config.submitLabel) || '提交询价'
          })}
        </div>`;
  const nextFooter = `        <div className="sg-inquiry-form__footer sg-inquiry-form__field--full">
          {Button({
            className: 'sg-inquiry-form__submit',
            'data-inquiry-submit': true,
            type: 'submit',
            variant: 'primary',
            children: text(config.submitLabel) || '提交询价'
          })}
          <p aria-live="polite" className="sg-inquiry-form__status" data-inquiry-form-status id={statusId}></p>
        </div>`;
  if (output.includes(oldFooter)) output = replaceOnce(output, oldFooter, nextFooter);
  return output;
}

function updateCssSource(source) {
  const output = String(source || '');
  const markerIndex = output.indexOf(CSS_MARKER);
  return markerIndex < 0
    ? `${output.trimEnd()}${INQUIRY_CSS_BLOCK}\n`
    : `${output.slice(0, markerIndex).trimEnd()}${INQUIRY_CSS_BLOCK}\n`;
}

function insertBefore(source, marker, block) {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`模板中找不到插入标记：${marker}`);
  return `${source.slice(0, index)}${block}${source.slice(index)}`;
}

function replaceOnce(source, search, replacement) {
  const index = source.indexOf(search);
  if (index < 0) throw new Error(`模板中找不到替换标记：${search}`);
  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}

function replaceUntil(source, startMarker, endMarker, replacement) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker, startIndex);
  if (startIndex < 0 || endIndex < 0) throw new Error(`模板中找不到代码块：${startMarker}`);
  return `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

function parseJsonObject(value) {
  if (!value) return {};
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}
