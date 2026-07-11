import sharp from 'sharp';
import convertHeic from 'heic-convert';

const IMAGE_MIME_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

const PASSTHROUGH_EXTENSIONS = new Set(['.gif']);
const CONVERT_ONLY_EXTENSIONS = new Set(['.heic', '.heif']);
const MIN_BYTES_SAVED_FOR_REENCODE = 512;

export async function optimizeUploadedImage({ buffer, extension }) {
  const normalizedExtension = normalizeExtension(extension);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || PASSTHROUGH_EXTENSIONS.has(normalizedExtension)) {
    return buildOriginalResult(buffer, normalizedExtension);
  }

  const mustConvert = CONVERT_ONLY_EXTENSIONS.has(normalizedExtension);
  const sourceBuffer = mustConvert ? await decodeHeicImage(buffer) : buffer;
  const sourceExtension = mustConvert ? '.jpg' : normalizedExtension;

  const image = sharp(sourceBuffer, {
    animated: true,
    failOn: 'none',
  }).rotate();
  const metadata = await image.metadata();
  const hasAlpha = Boolean(metadata.hasAlpha);
  const candidates = [buildOriginalResult(sourceBuffer, sourceExtension)];

  await appendCandidate(candidates, 'webp', async () => image.clone().webp({
    quality: hasAlpha ? 78 : 80,
    effort: 6,
    smartSubsample: true,
  }).toBuffer());

  if (!hasAlpha) {
    await appendCandidate(candidates, 'jpg', async () => image.clone().jpeg({
      quality: 82,
      mozjpeg: true,
    }).toBuffer());
  }

  await appendCandidate(candidates, 'png', async () => image.clone().png({
    palette: true,
    quality: 80,
    compressionLevel: 9,
    effort: 10,
  }).toBuffer());

  candidates.sort((left, right) => left.buffer.length - right.buffer.length);
  const best = candidates[0];
  if (mustConvert) {
    return best;
  }
  const original = candidates.find((candidate) => candidate.original) || candidates[candidates.length - 1];
  if (best !== original && original.buffer.length - best.buffer.length < MIN_BYTES_SAVED_FOR_REENCODE) {
    return original;
  }

  return best;
}

async function decodeHeicImage(buffer) {
  try {
    const converted = await convertHeic({
      buffer,
      format: 'JPEG',
      quality: 0.92,
    });
    const output = Buffer.from(converted);
    if (output.length === 0) {
      throw new Error('empty converted image');
    }
    return output;
  } catch {
    throw new Error('HEIC/HEIF 图片转换失败');
  }
}

function buildOriginalResult(buffer, extension) {
  const normalizedExtension = normalizeExtension(extension);
  return {
    buffer,
    extension: normalizedExtension,
    mimeType: IMAGE_MIME_TYPES.get(normalizedExtension) || 'image/jpeg',
    optimized: false,
    original: true,
  };
}

async function appendCandidate(candidates, format, buildBuffer) {
  try {
    const buffer = await buildBuffer();
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      return;
    }
    const extension = format === 'jpg' ? '.jpg' : `.${format}`;
    candidates.push({
      buffer,
      extension,
      mimeType: IMAGE_MIME_TYPES.get(extension) || `image/${format}`,
      optimized: true,
      original: false,
    });
  } catch {
    // Some source/format pairs are not encodable on every sharp build. Other candidates can still win.
  }
}

function normalizeExtension(extension) {
  const normalized = String(extension || '').trim().toLowerCase();
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}
