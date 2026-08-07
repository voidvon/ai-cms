import '../src/load-env.mjs';
import { execute, getDb, queryOne } from '../src/db.mjs';
import { ensureInquiryCaptchaSchema } from '../src/services/slider-captcha.mjs';

const TEMPLATE_ID = 27;
const CONTACT_COLUMN_ID = 87;
const LANGUAGE_CODE = 'zh-CN';
const SCRIPT_MARKER = 'const INQUIRY_FORM_SCRIPT =';
const COMPONENT_MARKER = 'function InquiryForm({ config, renderButton }) {';
const CSS_MARKER = '/* contact inquiry form */';

ensureInquiryCaptchaSchema();

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

  function setCaptchaStatus(form, message, state) {
    const status = form.querySelector('[data-inquiry-captcha-status]');
    if (!(status instanceof HTMLElement)) return;
    status.textContent = message || '';
    status.dataset.state = state || '';
  }

  function waitForSliderCaptchaScript() {
    if (typeof window.SliderCaptcha === 'function') return Promise.resolve();
    const script = document.querySelector('[data-sg-slider-captcha]');
    if (!(script instanceof HTMLScriptElement)) {
      return Promise.reject(new Error('人机验证组件未加载，请刷新页面后重试。'));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => finish(reject, new Error('人机验证组件加载超时，请刷新页面后重试。')), 8000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        script.removeEventListener('load', onLoad);
        script.removeEventListener('error', onError);
      };
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };
      const onLoad = () => {
        if (typeof window.SliderCaptcha === 'function') {
          finish(resolve);
        } else {
          finish(reject, new Error('人机验证组件不可用，请刷新页面后重试。'));
        }
      };
      const onError = () => finish(reject, new Error('人机验证组件加载失败，请刷新页面后重试。'));

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', onError, { once: true });
      if (typeof window.SliderCaptcha === 'function') onLoad();
    });
  }

  function resolveCaptchaEndpoint(form, dataName, fallback) {
    return String(form.dataset[dataName] || fallback).trim();
  }

  async function requestCaptchaChallenge(form, root) {
    const endpoint = resolveCaptchaEndpoint(form, 'captchaRequestEndpoint', '/api/public/inquiry-captcha');
    const url = new URL(endpoint, window.location.href);
    const width = Math.round(root.getBoundingClientRect().width || 320);
    url.searchParams.set('width', String(Math.min(320, Math.max(240, width))));
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success || !result?.data?.captcha_id || !result?.data?.bg_url || !result?.data?.puzzle_url) {
      throw new Error(result?.message || form.dataset.captchaUnavailable || '人机验证服务暂时不可用，请稍后再试。');
    }
    return result.data;
  }

  async function initializeInquiryCaptcha(form) {
    const existing = form.__sgInquiryCaptcha;
    if (existing?.ready) return existing.ready;

    const root = form.querySelector('[data-inquiry-captcha]');
    const tokenInput = form.querySelector('input[name="captcha_token"]');
    if (!(root instanceof HTMLElement) || !(tokenInput instanceof HTMLInputElement)) {
      throw new Error(form.dataset.captchaUnavailable || '人机验证组件不可用，请刷新页面后重试。');
    }

    const state = {
      challengeId: '',
      token: '',
      instance: null,
      ready: null
    };
    state.ready = (async () => {
      await waitForSliderCaptchaScript();
      const captcha = new window.SliderCaptcha({
        root,
        width: form.dataset.captchaWidth || '100%',
        height: Number(form.dataset.captchaHeight || 160),
        theme: 'light',
        successText: form.dataset.captchaSuccess || '验证通过',
        failText: form.dataset.captchaFail || '验证未通过，请重试',
        request: async () => {
          state.challengeId = '';
          state.token = '';
          tokenInput.value = '';
          setCaptchaStatus(form, form.dataset.captchaLoading || '验证中...', '');
          try {
            const challenge = await requestCaptchaChallenge(form, root);
            state.challengeId = String(challenge.captcha_id).trim();
            setCaptchaStatus(form, form.dataset.captchaDragLabel || '请拖动滑块完成验证', '');
            return { bgUrl: challenge.bg_url, puzzleUrl: challenge.puzzle_url };
          } catch (error) {
            setCaptchaStatus(form, error?.message || form.dataset.captchaUnavailable || '人机验证服务暂时不可用，请稍后再试。', 'error');
            throw error;
          }
        },
        onVerify: async (data) => {
          if (!state.challengeId) {
            throw new Error(form.dataset.captchaUnavailable || '人机验证服务暂时不可用，请稍后再试。');
          }
          const endpoint = resolveCaptchaEndpoint(form, 'captchaVerifyEndpoint', '/api/public/inquiry-captcha/verify');
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ ...data, captcha_id: state.challengeId })
          });
          const result = await response.json().catch(() => null);
          const token = String(result?.data?.token || '').trim();
          if (!response.ok || !result?.success || !token) {
            throw new Error(result?.message || form.dataset.captchaRequired || '请完成人机验证后再提交。');
          }
          state.token = token;
          tokenInput.value = token;
        },
        onSuccess: () => {
          setCaptchaStatus(form, form.dataset.captchaSuccess || '验证通过，可以提交询价。', 'success');
        },
        onFail: () => {
          state.token = '';
          tokenInput.value = '';
          setCaptchaStatus(form, form.dataset.captchaRequired || '请拖动滑块完成验证。', 'error');
        },
        onRefresh: () => {
          state.token = '';
          tokenInput.value = '';
          const sliderStatus = root.querySelector('.slider-captcha-status');
          if (sliderStatus instanceof HTMLElement) {
            sliderStatus.textContent = form.dataset.captchaDragLabel || '请拖动滑块完成验证';
          }
        }
      });
      state.instance = captcha;
      const refreshButton = root.querySelector('.slider-captcha-refresh');
      if (refreshButton instanceof HTMLElement) {
        refreshButton.setAttribute('aria-label', '刷新验证码');
        refreshButton.setAttribute('role', 'button');
        refreshButton.title = '刷新验证码';
      }
      return state;
    })();
    form.__sgInquiryCaptcha = state;

    try {
      return await state.ready;
    } catch (error) {
      delete form.__sgInquiryCaptcha;
      setCaptchaStatus(form, error?.message || form.dataset.captchaUnavailable || '人机验证服务暂时不可用，请稍后再试。', 'error');
      throw error;
    }
  }

  document.querySelectorAll('[data-inquiry-form]').forEach((form) => {
    const startedAt = form.querySelector('input[name="form_started_at"]');
    if (startedAt instanceof HTMLInputElement) startedAt.value = String(Date.now());
    if (form.dataset.captchaEnabled === 'true') {
      initializeInquiryCaptcha(form).catch(() => {});
    }
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
    if (form.dataset.captchaMode === 'turnstile') {
      if (!String(formData.get('cf-turnstile-response') || '').trim()) {
        setStatus(form, form.dataset.captchaRequired || '请完成人机验证后再提交。', 'error');
        return;
      }
    } else if (form.dataset.captchaEnabled !== 'true') {
      setStatus(form, form.dataset.captchaUnavailable || '人机验证服务暂时不可用，请稍后再试。', 'error');
      return;
    }

    const submitButton = form.querySelector('[data-inquiry-submit]');
    const originalLabel = submitButton instanceof HTMLElement ? submitButton.textContent : '';
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
    if (submitButton instanceof HTMLElement) submitButton.textContent = form.dataset.submittingLabel || '提交中...';
    setStatus(form, '', '');

    let captchaState;
    try {
      if (form.dataset.captchaMode === 'turnstile') {
        const payload = Object.fromEntries(formData.entries());
        const response = await fetch(form.action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), credentials: 'same-origin' });
        const result = await response.json().catch(() => null);
        if (!response.ok || !result?.success) throw new Error(result?.message || form.dataset.errorMessage || '提交失败，请稍后再试。');
        form.reset();
        setStatus(form, result.message || form.dataset.successMessage || '感谢您的询价，我们会尽快与您联系。', 'success');
        return;
      }
      captchaState = await initializeInquiryCaptcha(form);
      if (!captchaState.token) {
        throw new Error(form.dataset.captchaRequired || '请拖动滑块完成验证后再提交。');
      }
      formData.set('captcha_token', captchaState.token);
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
      captchaState.token = '';
      const nextStartedAt = form.querySelector('input[name="form_started_at"]');
      if (nextStartedAt instanceof HTMLInputElement) nextStartedAt.value = String(Date.now());
      const successMessage = result.message || form.dataset.successMessage || '感谢您的询价，我们会尽快与您联系。';
      setStatus(form, successMessage, 'success');
      window.dispatchEvent(new CustomEvent('sg-ui-toast:show', { detail: { text: successMessage, duration: 3200 } }));
      await captchaState.instance?.refresh?.();
    } catch (error) {
      if (captchaState) {
        captchaState.token = '';
        const tokenInput = form.querySelector('input[name="captcha_token"]');
        if (tokenInput instanceof HTMLInputElement) tokenInput.value = '';
        if (captchaState.instance && !String(error?.message || '').includes('请拖动滑块完成验证')) {
          await captchaState.instance.refresh();
        }
      }
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
  const captcha = config.sliderCaptcha && typeof config.sliderCaptcha === 'object' ? config.sliderCaptcha : null;
  const turnstile = config.turnstile && typeof config.turnstile === 'object' ? config.turnstile : null;
  const captchaEnabled = Boolean(captcha?.enabled);
  const turnstileEnabled = Boolean(turnstile?.enabled && text(turnstile?.siteKey));
  const captchaMode = turnstileEnabled ? 'turnstile' : (captchaEnabled ? 'slider' : '');
  const statusId = 'sg-inquiry-form-status';
  const captchaStatusId = 'sg-inquiry-captcha-status';
  const Button = renderButton || ((buttonProps) => <button {...buttonProps}>{buttonProps.children}</button>);

  return (
    <section className="sg-inquiry-form-section" aria-labelledby="sg-inquiry-form-title">
      <div className="sg-inquiry-form-section__header">
        <h3 id="sg-inquiry-form-title">{text(config.title) || '提交询价'}</h3>
      </div>
      <form
        action={endpoint}
        aria-describedby={statusId + ' ' + captchaStatusId}
        className="sg-inquiry-form"
        data-captcha-enabled={captchaEnabled ? 'true' : 'false'}
        data-captcha-mode={captchaMode}
        data-captcha-required={text((turnstileEnabled ? turnstile : captcha)?.requiredMessage)}
        data-captcha-fail={text(captcha?.failMessage)}
        data-captcha-height={text(captcha?.height) || '160'}
        data-captcha-loading={text(captcha?.loadingMessage)}
        data-captcha-request-endpoint={text(captcha?.requestEndpoint)}
        data-captcha-success={text(captcha?.successMessage)}
        data-captcha-verify-endpoint={text(captcha?.verifyEndpoint)}
        data-captcha-width={text(captcha?.width) || '100%'}
        data-captcha-drag-label={text(captcha?.label)}
        data-captcha-required={text(captcha?.requiredMessage)}
        data-captcha-unavailable={text(captcha?.unavailableMessage)}
        data-contact-error={text(config.contactRequiredMessage)}
        data-error-message={text(config.errorMessage)}
        data-inquiry-form
        data-submitting-label={text(config.submittingLabel)}
        data-success-message={text(config.successMessage)}
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
          <input autoComplete="email" id="inquiry-email" maxLength="254" name="email" required type="email" />
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
        {turnstileEnabled ? (
          <div className="sg-inquiry-form__turnstile sg-inquiry-form__field--full"><div className="cf-turnstile" data-inquiry-turnstile data-sitekey={text(turnstile.siteKey)} data-theme={text(turnstile.theme) || 'light'}></div></div>
        ) : captchaEnabled ? (
          <div className="sg-inquiry-form__captcha sg-inquiry-form__field--full">
            <div data-inquiry-captcha></div>
            <p aria-live="polite" className="sg-inquiry-form__captcha-status" data-inquiry-captcha-status id={captchaStatusId}>{text(captcha?.label) || '请拖动滑块完成验证'}</p>
            <input name="captcha_token" type="hidden" />
          </div>
        ) : null}
        <input name="form_started_at" type="hidden" />
        <input name="language_code" type="hidden" value={text(config.languageCode) || 'zh-CN'} />
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
      {captchaEnabled ? <link data-sg-slider-captcha-style href={text(captcha?.styleUrl) || '/assets/captcha/slider-captcha.css'} rel="stylesheet" /> : null}
      {renderScript(INQUIRY_FORM_SCRIPT)}
      {captchaEnabled ? <script async defer data-sg-slider-captcha src={text(captcha?.scriptUrl) || '/assets/captcha/slider-captcha.umd.js'}></script> : null}
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
.sg-contact-page .sg-inquiry-form__captcha {
  max-width: 320px;
  gap: 6px;
}
.sg-contact-page .sg-inquiry-form__captcha > [data-inquiry-captcha] {
  width: min(320px, 100%);
  max-width: 100%;
}
.sg-contact-page .sg-inquiry-form__captcha .slider-captcha-stage > img:first-of-type {
  width: 100% !important;
  height: 100% !important;
}
.sg-contact-page .sg-inquiry-form__captcha .slider-captcha-stage > img:nth-of-type(2) {
  top: 0;
  left: 0;
  width: 60px !important;
  height: 160px !important;
}
.sg-contact-page .sg-inquiry-form__captcha .slider-captcha-bar {
  width: 100% !important;
}
.sg-contact-page .sg-inquiry-form__captcha-status {
  min-height: 20px;
  margin: 0;
  color: #5b6872;
  font-size: 14px;
  line-height: 1.5;
}
.sg-contact-page .sg-inquiry-form__captcha-status[data-state="success"] {
  color: #167447;
}
.sg-contact-page .sg-inquiry-form__captcha-status[data-state="error"] {
  color: #b42318;
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
  .sg-contact-page .sg-inquiry-form__captcha {
    width: 100%;
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
  sliderCaptcha: {
    enabled: true,
    width: '100%',
    height: 160,
    requestEndpoint: '/api/public/inquiry-captcha',
    verifyEndpoint: '/api/public/inquiry-captcha/verify',
    scriptUrl: '/assets/captcha/slider-captcha.umd.js',
    styleUrl: '/assets/captcha/slider-captcha.css',
    label: '请拖动滑块完成验证',
    loadingMessage: '验证中...',
    requiredMessage: '请拖动滑块完成验证后再提交。',
    successMessage: '验证通过，可以提交询价。',
    failMessage: '验证未通过，请重试。',
    unavailableMessage: '人机验证服务暂时不可用，请稍后再试。'
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
if (String(template.tsx_source || '').includes('type="radio"')) {
  throw new Error('当前联系页已是新版询价表单，请使用专用恢复脚本，禁止旧迁移覆盖表单界面');
}

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
      hadInquiryForm ? '中文版询价表单改用自托管图片拖拽验证码并优化布局' : '中文版联系页增加自托管图片拖拽验证码询价表单',
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
