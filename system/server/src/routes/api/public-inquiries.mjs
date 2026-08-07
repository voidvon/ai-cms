import { getClientIp, requireSameOrigin } from '../../middleware/auth.mjs';
import { buildColumnPublicPath } from '../../services/column-paths.mjs';
import { listColumns } from '../../services/columns.mjs';
import {
  assertInquiryRateLimit,
  createInquiry,
  hashInquirySubmitterIp
} from '../../services/inquiries.mjs';
import { getDefaultLanguage } from '../../services/languages.mjs';
import { verifyInquiryCaptcha } from '../../services/inquiry-captcha.mjs';
import {
  createInquiryCaptcha,
  verifyInquiryCaptchaChallenge
} from '../../services/slider-captcha.mjs';

const CONTACT_PUBLIC_PATH = '/contact-us/';
const SUCCESS_MESSAGE = '感谢您的询价，我们会尽快与您联系。';
const SUCCESS_MESSAGES = new Map([
  ['zh-cn', SUCCESS_MESSAGE],
  ['ru', 'Спасибо за ваш запрос. Мы свяжемся с вами в ближайшее время.'],
  ['en', 'Thank you for your enquiry. We will contact you shortly.'],
  ['fr', 'Merci pour votre demande. Nous vous contacterons prochainement.'],
  ['tr', 'Talebiniz için teşekkür ederiz. En kısa sürede sizinle iletişime geçeceğiz.'],
  ['es', 'Gracias por su consulta. Nos pondremos en contacto con usted lo antes posible.'],
  ['id', 'Terima kasih atas pertanyaan Anda. Kami akan segera menghubungi Anda.'],
  ['pt', 'Obrigado pela sua consulta. Entraremos em contacto consigo em breve.'],
  ['th', 'ขอบคุณสำหรับคำถามของคุณ เราจะติดต่อกลับโดยเร็วที่สุด'],
  ['vi', 'Cảm ơn yêu cầu của bạn. Chúng tôi sẽ sớm liên hệ với bạn.'],
  ['ar', 'شكرًا لاستفسارك. سنتواصل معك قريبًا.'],
  ['ar-me', 'شكرًا لاستفسارك. سنتواصل معك قريبًا.']
]);

export default async function publicInquiryRoutes(app) {
  app.get('/public/inquiry-captcha', {
    onRequest: [requireSameOrigin],
    bodyLimit: 4 * 1024
  }, async (request, reply) => {
    if (reply.sent) return;

    try {
      const challenge = await createInquiryCaptcha({
        remoteIp: getClientIp(request),
        width: request.query?.width
      });
      reply.header('cache-control', 'no-store, max-age=0');
      return {
        success: true,
        data: {
          captcha_id: challenge.id,
          bg_url: challenge.bgUrl,
          puzzle_url: challenge.puzzleUrl,
          width: challenge.width,
          height: challenge.height,
          expires_at: challenge.expiresAt
        }
      };
    } catch (error) {
      reply.code(error?.statusCode || 503);
      return {
        success: false,
        message: error?.message || '人机验证服务暂时不可用，请稍后重试'
      };
    }
  });

  app.post('/public/inquiry-captcha/verify', {
    onRequest: [requireSameOrigin],
    bodyLimit: 24 * 1024
  }, async (request, reply) => {
    if (reply.sent) return;

    const body = request.body && typeof request.body === 'object' ? request.body : {};
    try {
      const result = verifyInquiryCaptchaChallenge({
        captchaId: body.captcha_id,
        x: body.x,
        duration: body.duration,
        trail: body.trail,
        remoteIp: getClientIp(request)
      });
      reply.header('cache-control', 'no-store, max-age=0');
      return {
        success: true,
        data: { token: result.token }
      };
    } catch (error) {
      reply.code(error?.statusCode || 400);
      return {
        success: false,
        message: error?.message || '人机验证未通过，请重试'
      };
    }
  });

  app.post('/public/inquiries', {
    onRequest: [requireSameOrigin],
    bodyLimit: 32 * 1024
  }, async (request, reply) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (String(body.website || '').trim()) {
      return { success: true, message: getInquirySuccessMessage(body.language_code) };
    }

    try {
      assertHumanSubmissionTiming(body.form_started_at);
      const clientIp = getClientIp(request);
      const submitterIpHash = hashInquirySubmitterIp(clientIp);
      assertInquiryRateLimit(submitterIpHash);
      const languageCode = resolveRequestLanguageCode(app, body);
      await verifyInquiryCaptcha({ body, languageCode, remoteIp: clientIp });
      const sourceColumn = resolveContactColumn(languageCode);

      const inquiry = await createInquiry({
        inquiry_type: body.inquiry_type,
        contact_name: body.contact_name,
        company: body.company,
        email: body.email,
        phone: body.phone,
        requirements: body.requirements,
        source_column_id: sourceColumn?.id || null,
        language_code: languageCode,
        source_url: request.headers.referer || CONTACT_PUBLIC_PATH,
        submitter_ip_hash: submitterIpHash
      });

      reply.code(201);
      return {
        success: true,
        data: { reference_no: inquiry.reference_no },
        message: getInquirySuccessMessage(languageCode)
      };
    } catch (error) {
      reply.code(error?.statusCode || (error?.code === 'INQUIRY_RATE_LIMIT' ? 429 : 400));
      return {
        success: false,
        message: error?.message || '提交失败，请稍后再试。'
      };
    }
  });
}

function getInquirySuccessMessage(languageCode) {
  return SUCCESS_MESSAGES.get(String(languageCode || '').trim().toLowerCase()) || SUCCESS_MESSAGE;
}

function resolveRequestLanguageCode(app, body) {
  return String(
    app.publicSite?.languageCode
    || body.language_code
    || getDefaultLanguage()?.code
    || 'zh-CN'
  ).trim();
}

function resolveContactColumn(languageCode) {
  const columns = listColumns({ languageCode, includeTranslations: false });
  const columnMap = new Map(columns.map((column) => [Number(column.id), column]));
  return columns.find((column) => buildColumnPublicPath(column, columnMap) === CONTACT_PUBLIC_PATH) || null;
}

function assertHumanSubmissionTiming(value) {
  const startedAt = Number(value);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return;
  if (Date.now() - startedAt < 800) {
    const error = new Error('提交过快，请检查内容后重试');
    error.code = 'INQUIRY_SUBMISSION_TOO_FAST';
    throw error;
  }
}
