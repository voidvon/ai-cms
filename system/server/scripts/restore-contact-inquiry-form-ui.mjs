import '../src/load-env.mjs';
import { execute, queryOne } from '../src/db.mjs';

const template = queryOne('SELECT * FROM templates WHERE id = 27');
const baseline = queryOne('SELECT * FROM template_versions WHERE template_id = 27 AND version_no = 19');
if (!template || !baseline) throw new Error('联系页模板或版本 19 不存在');

function block(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error(`缺少模板标记：${startMarker}`);
  return source.slice(start, end);
}

const currentScript = block(template.tsx_source, 'const INQUIRY_FORM_SCRIPT =', '\n`;\n\n') + '\n`;\n\n';
let nextTsx = baseline.tsx_source;
const oldScript = block(nextTsx, 'const INQUIRY_FORM_SCRIPT =', '\n`;\n\n') + '\n`;\n\n';
nextTsx = nextTsx.replace(oldScript, currentScript);

nextTsx = nextTsx.replace(
  "  const captcha = config.sliderCaptcha && typeof config.sliderCaptcha === 'object' ? config.sliderCaptcha : null;\n  const captchaEnabled = Boolean(captcha?.enabled);",
  "  const captcha = config.sliderCaptcha && typeof config.sliderCaptcha === 'object' ? config.sliderCaptcha : null;\n  const turnstile = config.turnstile && typeof config.turnstile === 'object' ? config.turnstile : null;\n  const captchaEnabled = Boolean(captcha?.enabled);\n  const turnstileEnabled = Boolean(turnstile?.enabled && text(turnstile?.siteKey));\n  const captchaMode = turnstileEnabled ? 'turnstile' : (captchaEnabled ? 'slider' : '');"
);
nextTsx = nextTsx.replace(
  "        data-captcha-enabled={captchaEnabled ? 'true' : 'false'}",
  "        data-captcha-enabled={captchaEnabled ? 'true' : 'false'}\n        data-captcha-mode={captchaMode}"
);
nextTsx = nextTsx.replace(
  "        data-captcha-required={text(captcha?.requiredMessage)}",
  "        data-captcha-required={text((turnstileEnabled ? turnstile : captcha)?.requiredMessage)}"
);
nextTsx = nextTsx.replace(
  "        {captchaEnabled ? (\n          <div className=\"sg-inquiry-form__captcha sg-inquiry-form__field--full\">",
  "        {turnstileEnabled ? (\n          <div className=\"sg-inquiry-form__turnstile sg-inquiry-form__field--full\"><div className=\"cf-turnstile\" data-inquiry-turnstile data-sitekey={text(turnstile.siteKey)} data-theme={text(turnstile.theme) || 'light'}></div></div>\n        ) : captchaEnabled ? (\n          <div className=\"sg-inquiry-form__captcha sg-inquiry-form__field--full\">"
);
nextTsx = nextTsx.replace(
  "      {captchaEnabled ? <script async defer data-sg-slider-captcha src={text(captcha?.scriptUrl) || '/assets/captcha/slider-captcha.umd.js'}></script> : null}",
  "      {captchaEnabled ? <script async defer data-sg-slider-captcha src={text(captcha?.scriptUrl) || '/assets/captcha/slider-captcha.umd.js'}></script> : null}\n      {turnstileEnabled ? <script async defer src=\"https://challenges.cloudflare.com/turnstile/v0/api.js\"></script> : null}"
);

for (const marker of ['type="radio"', 'namePlaceholder', 'turnstileEnabled', 'data-captcha-mode']) {
  if (!nextTsx.includes(marker)) throw new Error(`恢复后模板缺少：${marker}`);
}

const nextCss = baseline.css_source;
execute('UPDATE templates SET tsx_source = ?, css_source = ?, published_tsx_source = ?, published_css_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 27', [nextTsx, nextCss, nextTsx, nextCss]);
execute("INSERT INTO template_versions (template_id, version_no, engine, tsx_source, css_source, note, created_at) VALUES (27, (SELECT coalesce(max(version_no), 0) + 1 FROM template_versions WHERE template_id = 27), 'tsx', ?, ?, ?, CURRENT_TIMESTAMP)", [nextTsx, nextCss, '恢复新版询价表单界面并保留按语言切换验证码']);
console.log(JSON.stringify({ success: true, templateId: 27 }));
