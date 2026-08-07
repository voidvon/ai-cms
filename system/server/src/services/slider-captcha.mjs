import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import createPuzzle from 'node-puzzle';
import { execute, getDb, queryOne } from '../db.mjs';
import { hashInquirySubmitterIp } from './inquiries.mjs';

export const SLIDER_CAPTCHA_WIDTH = 320;
export const SLIDER_CAPTCHA_MIN_WIDTH = 240;
export const SLIDER_CAPTCHA_HEIGHT = 160;
export const SLIDER_CAPTCHA_PIECE_SIZE = 60;

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_CHALLENGES_PER_IP = 20;
const MAX_ATTEMPTS = 5;
const COORDINATE_TOLERANCE = 8;
const MIN_GESTURE_DURATION_MS = 120;
const MIN_TRAIL_POINTS = 2;
const MIN_TRAIL_DISTANCE = 12;
const MAX_TRAIL_POINTS = 1000;
const MAX_TRAIL_COORDINATE = 10000;
let schemaEnsured = false;

export function ensureInquiryCaptchaSchema() {
  if (schemaEnsured) return;

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS inquiry_captcha_challenges (
      id TEXT PRIMARY KEY,
      solution_x INTEGER NOT NULL,
      client_ip_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      verified_at TEXT,
      verification_token_hash TEXT,
      consumed_at TEXT,
      attempts INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_inquiry_captcha_ip_created
    ON inquiry_captcha_challenges(client_ip_hash, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_inquiry_captcha_expires
    ON inquiry_captcha_challenges(expires_at);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_inquiry_captcha_token_hash
    ON inquiry_captcha_challenges(verification_token_hash)
    WHERE verification_token_hash IS NOT NULL;
  `);

  schemaEnsured = true;
}

export async function createInquiryCaptcha({ remoteIp, width } = {}) {
  ensureInquiryCaptchaSchema();
  const captchaWidth = normalizeRequestedWidth(width);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS).toISOString();
  const clientIpHash = hashInquirySubmitterIp(remoteIp);

  purgeExpiredChallenges(nowIso);
  assertCaptchaCreationRateLimit(clientIpHash, now);

  const sourceImage = await createCaptchaBackground(captchaWidth);
  let puzzle;
  try {
    puzzle = await createPuzzle(sourceImage, {
      width: SLIDER_CAPTCHA_PIECE_SIZE,
      height: SLIDER_CAPTCHA_PIECE_SIZE,
      bgWidth: captchaWidth,
      bgHeight: SLIDER_CAPTCHA_HEIGHT,
      equalHeight: true,
      format: 'png',
      bgFormat: 'jpeg',
      bgQuality: 86,
      borderColor: 'rgba(255,255,255,0.92)',
      fillColor: 'rgba(255,255,255,0.48)',
      margin: 2
    });
  } catch {
    throw createSliderCaptchaError(
      '人机验证服务暂时不可用，请稍后重试',
      'SLIDER_CAPTCHA_UNAVAILABLE',
      503
    );
  }

  const id = randomUUID();
  execute(
    `
      INSERT INTO inquiry_captcha_challenges (
        id, solution_x, client_ip_hash, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?)
    `,
    [id, puzzle.x, clientIpHash, nowIso, expiresAt]
  );

  return {
    id,
    bgUrl: toDataUrl(puzzle.bg, 'image/jpeg'),
    puzzleUrl: toDataUrl(puzzle.puzzle, 'image/png'),
    width: captchaWidth,
    height: SLIDER_CAPTCHA_HEIGHT,
    expiresAt
  };
}

export function verifyInquiryCaptchaChallenge({
  captchaId,
  x,
  duration,
  trail,
  remoteIp
} = {}) {
  ensureInquiryCaptchaSchema();
  const id = normalizeCaptchaId(captchaId);
  const clientIpHash = hashInquirySubmitterIp(remoteIp);
  const challenge = queryOne(
    `
      SELECT id, solution_x, client_ip_hash, expires_at, verified_at,
             verification_token_hash, consumed_at, attempts
      FROM inquiry_captcha_challenges
      WHERE id = ?
    `,
    [id]
  );

  if (!challenge || challenge.client_ip_hash !== clientIpHash) {
    throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_CHALLENGE_INVALID', 400);
  }
  if (challenge.consumed_at || challenge.verified_at || challenge.verification_token_hash) {
    throw createSliderCaptchaError('人机验证信息已使用，请刷新后重试', 'SLIDER_CAPTCHA_CHALLENGE_USED', 400);
  }
  if (Date.parse(String(challenge.expires_at || '')) <= Date.now()) {
    throw createSliderCaptchaError('人机验证已过期，请刷新后重试', 'SLIDER_CAPTCHA_CHALLENGE_EXPIRED', 400);
  }
  if (Number(challenge.attempts || 0) >= MAX_ATTEMPTS) {
    throw createSliderCaptchaError('验证次数过多，请刷新后重试', 'SLIDER_CAPTCHA_ATTEMPTS_EXCEEDED', 400);
  }

  const normalizedX = normalizeCoordinate(x);
  const normalizedDuration = normalizeDuration(duration);
  const normalizedTrail = normalizeTrail(trail);
  const basicGestureValid = (
    normalizedDuration >= MIN_GESTURE_DURATION_MS
    && normalizedTrail.length >= MIN_TRAIL_POINTS
    && getTrailDistance(normalizedTrail) >= MIN_TRAIL_DISTANCE
  );
  const coordinateValid = Math.abs(normalizedX - Number(challenge.solution_x)) <= COORDINATE_TOLERANCE;

  execute(
    `UPDATE inquiry_captcha_challenges SET attempts = attempts + 1 WHERE id = ?`,
    [id]
  );

  if (!basicGestureValid || !coordinateValid) {
    throw createSliderCaptchaError('人机验证未通过，请重试', 'SLIDER_CAPTCHA_VERIFICATION_FAILED', 400);
  }

  const token = randomBytes(32).toString('base64url');
  const updated = execute(
    `
      UPDATE inquiry_captcha_challenges
      SET verified_at = ?, verification_token_hash = ?
      WHERE id = ? AND verified_at IS NULL AND consumed_at IS NULL
    `,
    [new Date().toISOString(), hashToken(token), id]
  );
  if (Number(updated.changes || 0) !== 1) {
    throw createSliderCaptchaError('人机验证信息已使用，请刷新后重试', 'SLIDER_CAPTCHA_CHALLENGE_USED', 400);
  }

  return { token };
}

export function consumeInquiryCaptchaToken(token, { remoteIp } = {}) {
  ensureInquiryCaptchaSchema();
  const normalizedToken = normalizeVerificationToken(token);
  const nowIso = new Date().toISOString();
  const result = execute(
    `
      UPDATE inquiry_captcha_challenges
      SET consumed_at = ?
      WHERE verification_token_hash = ?
        AND client_ip_hash = ?
        AND verified_at IS NOT NULL
        AND consumed_at IS NULL
        AND expires_at > ?
    `,
    [nowIso, hashToken(normalizedToken), hashInquirySubmitterIp(remoteIp), nowIso]
  );

  if (Number(result.changes || 0) !== 1) {
    throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_TOKEN_INVALID', 400);
  }

  return true;
}

function purgeExpiredChallenges(nowIso) {
  execute('DELETE FROM inquiry_captcha_challenges WHERE expires_at <= ?', [nowIso]);
}

function assertCaptchaCreationRateLimit(clientIpHash, now) {
  const windowStart = new Date(now.getTime() - CHALLENGE_RATE_WINDOW_MS).toISOString();
  const count = Number(queryOne(
    `
      SELECT COUNT(*) AS total
      FROM inquiry_captcha_challenges
      WHERE client_ip_hash = ? AND created_at > ?
    `,
    [clientIpHash, windowStart]
  )?.total || 0);
  if (count >= MAX_CHALLENGES_PER_IP) {
    throw createSliderCaptchaError('验证请求过于频繁，请稍后重试', 'SLIDER_CAPTCHA_RATE_LIMIT', 429);
  }
}

async function createCaptchaBackground(width) {
  const palettes = [
    ['#174a5c', '#4f9da6', '#f1d6a8'],
    ['#234b70', '#6d9dc5', '#e8c07d'],
    ['#375b4a', '#85a87d', '#e6c98d'],
    ['#6b3f4c', '#c47f74', '#f0d2a3'],
    ['#3c4670', '#8296c4', '#e8c1b8']
  ];
  const [start, end, accent] = palettes[randomInt(0, palettes.length)];
  const circles = Array.from({ length: 7 }, (_, index) => {
    const cx = randomInt(20, width - 20);
    const cy = randomInt(18, SLIDER_CAPTCHA_HEIGHT - 18);
    const radius = randomInt(10, 42);
    const opacity = (0.12 + index * 0.025).toFixed(2);
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${accent}" opacity="${opacity}"/>`;
  }).join('');
  const lines = Array.from({ length: 9 }, (_, index) => {
    const x1 = randomInt(-40, width - 20);
    const y1 = randomInt(0, SLIDER_CAPTCHA_HEIGHT);
    const x2 = x1 + randomInt(40, 130);
    const y2 = y1 + randomInt(-50, 50);
    return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#ffffff" stroke-width="${index % 3 + 1}" opacity="0.16" fill="none"/>`;
  }).join('');
  const svg = `
    <svg width="${width}" height="${SLIDER_CAPTCHA_HEIGHT}" viewBox="0 0 ${width} ${SLIDER_CAPTCHA_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="captcha-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${start}"/>
          <stop offset="100%" stop-color="${end}"/>
        </linearGradient>
        <pattern id="captcha-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.08"/>
        </pattern>
      </defs>
      <rect width="${width}" height="${SLIDER_CAPTCHA_HEIGHT}" fill="url(#captcha-bg)"/>
      <rect width="${width}" height="${SLIDER_CAPTCHA_HEIGHT}" fill="url(#captcha-grid)"/>
      ${circles}
      ${lines}
      <path d="M0 132 C58 102 90 156 146 126 S${Math.max(180, width - 76)} 88 ${width} 126 V160 H0 Z" fill="#0b2638" opacity="0.18"/>
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function normalizeRequestedWidth(value) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(normalized)) return SLIDER_CAPTCHA_WIDTH;
  return Math.min(SLIDER_CAPTCHA_WIDTH, Math.max(SLIDER_CAPTCHA_MIN_WIDTH, normalized));
}

function normalizeCaptchaId(value) {
  const normalized = String(value || '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(normalized)) {
    throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_CHALLENGE_INVALID', 400);
  }
  return normalized;
}

function normalizeCoordinate(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > SLIDER_CAPTCHA_WIDTH) {
    throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_COORDINATE_INVALID', 400);
  }
  return normalized;
}

function normalizeDuration(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 120000) {
    throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_GESTURE_INVALID', 400);
  }
  return normalized;
}

function normalizeTrail(value) {
  if (!Array.isArray(value) || value.length > MAX_TRAIL_POINTS) {
    throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_GESTURE_INVALID', 400);
  }
  return value.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_GESTURE_INVALID', 400);
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > MAX_TRAIL_COORDINATE || Math.abs(y) > MAX_TRAIL_COORDINATE) {
      throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_GESTURE_INVALID', 400);
    }
    return [x, y];
  });
}

function getTrailDistance(trail) {
  let distance = 0;
  for (let index = 1; index < trail.length; index += 1) {
    const previous = trail[index - 1];
    const current = trail[index];
    distance += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
  }
  return distance;
}

function normalizeVerificationToken(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw createSliderCaptchaError('请完成人机验证后再提交', 'SLIDER_CAPTCHA_TOKEN_REQUIRED', 400);
  }
  if (normalized.length > 256) {
    throw createSliderCaptchaError('人机验证信息无效，请刷新后重试', 'SLIDER_CAPTCHA_TOKEN_INVALID', 400);
  }
  return normalized;
}

function hashToken(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function toDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString('base64')}`;
}

function createSliderCaptchaError(message, code, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}
