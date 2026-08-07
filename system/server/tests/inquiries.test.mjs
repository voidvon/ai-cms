import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const testDirectory = mkdtempSync(path.join(tmpdir(), 'ai-cms-inquiries-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'site.sqlite');

const {
  createInquiry,
  deleteInquiry,
  getInquiryById,
  getInquirySettings,
  listInquiries,
  testInquiryFeishuWebhook,
  updateInquirySettings,
  updateInquiryManagement
} = await import('../src/services/inquiries.mjs');

test('creates and manages private inquiry records', async () => {
  const inquiry = await createInquiry({
    inquiry_type: 'product',
    contact_name: '  Ada Lovelace ',
    company: 'Analytical Engines Ltd.',
    email: ' ADA@EXAMPLE.COM ',
    phone: '+44 20 0000 0000',
    requirements: '  Please quote two control valves. ',
    source_column_id: 87,
    language_code: 'en',
    source_url: 'https://example.com/contact-us/'
  });

  assert.match(inquiry.reference_no, /^INQ-\d{8}-[A-F0-9]{8}$/);
  assert.equal(inquiry.contact_name, 'Ada Lovelace');
  assert.equal(inquiry.email, 'ada@example.com');
  assert.equal(inquiry.status, 'new');
  assert.equal(inquiry.notification_status, 'disabled');

  const listed = listInquiries({ keyword: 'control valves', inquiryType: 'product' });
  assert.equal(listed.pagination.total, 1);
  assert.equal(listed.items[0].id, inquiry.id);

  const updated = updateInquiryManagement(inquiry.id, {
    status: 'processing',
    internal_note: 'Assigned to sales.'
  });
  assert.equal(updated.status, 'processing');
  assert.equal(updated.internal_note, 'Assigned to sales.');

  assert.equal(deleteInquiry(inquiry.id), true);
  assert.equal(getInquiryById(inquiry.id), null);
});

test('requires an email address and validates management values', async () => {
  await assert.rejects(() => createInquiry({
    inquiry_type: 'technical',
    contact_name: 'Grace Hopper',
    company: '',
    email: '',
    phone: '+86 138 0000 0000',
    requirements: 'Need technical information.'
  }), /邮箱不能为空/);

  const inquiry = await createInquiry({
    inquiry_type: 'other',
    contact_name: 'Grace Hopper',
    email: 'grace@example.com',
    requirements: 'Need more information.'
  });

  assert.throws(
    () => updateInquiryManagement(inquiry.id, { status: 'unknown' }),
    /询价状态不正确/
  );
});

test('stores Feishu settings and pushes new inquiries without exposing failures to creation', async () => {
  const originalFetch = globalThis.fetch;
  const webhookUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/test-webhook-id';
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ code: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  try {
    const settings = updateInquirySettings({
      feishu_webhook_url: webhookUrl,
      feishu_enabled: true
    });
    assert.equal(settings.feishu_enabled, 1);
    assert.equal(getInquirySettings().feishu_webhook_url, webhookUrl);

    await testInquiryFeishuWebhook(webhookUrl);
    const inquiry = await createInquiry({
      inquiry_type: 'product',
      contact_name: 'Lin Chen',
      company: 'Steam Co.',
      email: 'lin@example.com',
      phone: '13800000000',
      requirements: 'Please quote a steam trap.'
    });

    assert.equal(requests.length, 2);
    assert.equal(requests[1].url, webhookUrl);
    assert.match(JSON.parse(requests[1].options.body).content.text, /Lin Chen/);
    assert.equal(inquiry.notification_status, 'sent');
    assert.ok(inquiry.notified_at);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
