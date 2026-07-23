import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACCESS_LOG_RETENTION_DAYS,
  getAccessLogRetentionCutoff,
  summarizeUserAgent
} from '../src/services/access-logs.mjs';

test('keeps the current day and previous two Beijing calendar days', () => {
  const result = getAccessLogRetentionCutoff(new Date('2026-07-23T08:00:00.000Z'));

  assert.equal(ACCESS_LOG_RETENTION_DAYS, 3);
  assert.deepEqual(result, {
    dayKey: '2026-07-23',
    cutoff: '2026-07-20 16:00:00'
  });
});

test('classifies desktop and mobile browsers while keeping bots separate', () => {
  const desktop = summarizeUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
  );
  const mobile = summarizeUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1'
  );
  const tablet = summarizeUserAgent(
    'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
  );
  const bot = summarizeUserAgent(
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) Googlebot/2.1; +http://www.google.com/bot.html'
  );

  assert.equal(desktop.deviceKind, 'desktop');
  assert.equal(mobile.deviceKind, 'mobile');
  assert.equal(tablet.deviceKind, 'mobile');
  assert.equal(bot.kind, 'bot');
  assert.equal(bot.deviceKind, 'other');
});

test('moves the cleanup boundary at Beijing midnight', () => {
  const beforeMidnight = getAccessLogRetentionCutoff(new Date('2026-07-23T15:59:59.999Z'));
  const atMidnight = getAccessLogRetentionCutoff(new Date('2026-07-23T16:00:00.000Z'));

  assert.equal(beforeMidnight.dayKey, '2026-07-23');
  assert.equal(beforeMidnight.cutoff, '2026-07-20 16:00:00');
  assert.equal(atMidnight.dayKey, '2026-07-24');
  assert.equal(atMidnight.cutoff, '2026-07-21 16:00:00');
});
