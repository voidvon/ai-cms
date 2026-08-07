import { consumeInquiryCaptchaToken } from './slider-captcha.mjs';
import { verifyTurnstileToken } from './turnstile.mjs';

export function isChineseInquiryLanguage(languageCode) {
  return /^zh(?:-|$)/i.test(String(languageCode || '').trim());
}

export async function verifyInquiryCaptcha({ body = {}, languageCode, remoteIp } = {}) {
  if (isChineseInquiryLanguage(languageCode)) {
    return consumeInquiryCaptchaToken(body.captcha_token, { remoteIp });
  }

  return verifyTurnstileToken(body['cf-turnstile-response'], { remoteIp });
}
