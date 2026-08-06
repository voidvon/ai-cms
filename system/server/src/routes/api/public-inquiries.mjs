import { getClientIp, requireSameOrigin } from '../../middleware/auth.mjs';
import { buildColumnPublicPath } from '../../services/column-paths.mjs';
import { listColumns } from '../../services/columns.mjs';
import {
  assertInquiryRateLimit,
  createInquiry,
  hashInquirySubmitterIp
} from '../../services/inquiries.mjs';
import { getDefaultLanguage } from '../../services/languages.mjs';
import { verifyTurnstileToken } from '../../services/turnstile.mjs';

const CONTACT_PUBLIC_PATH = '/contact-us/';
const SUCCESS_MESSAGE = '感谢您的询价，我们会尽快与您联系。';

export default async function publicInquiryRoutes(app) {
  app.post('/public/inquiries', {
    onRequest: [requireSameOrigin],
    bodyLimit: 32 * 1024
  }, async (request, reply) => {
    const body = request.body && typeof request.body === 'object' ? request.body : {};
    if (String(body.website || '').trim()) {
      return { success: true, message: SUCCESS_MESSAGE };
    }

    try {
      assertHumanSubmissionTiming(body.form_started_at);
      const clientIp = getClientIp(request);
      const submitterIpHash = hashInquirySubmitterIp(clientIp);
      assertInquiryRateLimit(submitterIpHash);
      await verifyTurnstileToken(body['cf-turnstile-response'], { remoteIp: clientIp });
      const languageCode = resolveRequestLanguageCode(app, body);
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
        message: SUCCESS_MESSAGE
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
