import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { UPLOADS_IMAGES_ROOT } from '../config.mjs';
import { normalizeUploadedRelativePath, resolveUploadedFilePath } from './uploads.mjs';

const SITE_ICON_ROOT = path.join(UPLOADS_IMAGES_ROOT, 'site-icons');
const REQUIRED_SOURCE_SIZE = 180;
const PNG_SIZES = [16, 32, 48, 180];

export async function prepareSiteIconConfig(sourcePath, existingManifestJson = null) {
  const normalizedSourcePath = normalizeUploadedRelativePath(sourcePath);
  if (!String(sourcePath || '').trim()) {
    return { sourcePath: null, manifestJson: null };
  }
  if (!normalizedSourcePath) {
    throw new Error('站点图标必须使用媒体库中的上传图片');
  }

  const sourceFile = resolveUploadedFilePath(normalizedSourcePath);
  if (!sourceFile || !fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
    throw new Error('站点图标源图不存在，请重新上传');
  }

  const sourceBuffer = fs.readFileSync(sourceFile);
  const version = createHash('sha256').update(sourceBuffer).digest('hex').slice(0, 16);
  const existingManifest = parseSiteIconManifest(existingManifestJson);
  if (existingManifest?.version === version && siteIconManifestFilesExist(existingManifest)) {
    return { sourcePath: normalizedSourcePath, manifestJson: JSON.stringify(existingManifest) };
  }

  await validateSiteIconSource(sourceBuffer);
  const manifest = await generateSiteIconFiles(sourceBuffer, version);
  return { sourcePath: normalizedSourcePath, manifestJson: JSON.stringify(manifest) };
}

export function parseSiteIconManifest(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const links = Array.isArray(parsed.links)
      ? parsed.links.filter((item) => item && typeof item === 'object' && normalizeUploadedRelativePath(item.href))
      : [];
    return String(parsed.version || '').trim() && links.length > 0
      ? { version: String(parsed.version).trim(), links }
      : null;
  } catch {
    return null;
  }
}

export function cleanupSupersededSiteIconFiles(previousManifestJson, currentManifestJson) {
  const previous = parseSiteIconManifest(previousManifestJson);
  const current = parseSiteIconManifest(currentManifestJson);
  if (!previous?.version || previous.version === current?.version) {
    return;
  }
  const previousDir = path.resolve(SITE_ICON_ROOT, previous.version);
  const resolvedRoot = path.resolve(SITE_ICON_ROOT);
  if (previousDir.startsWith(`${resolvedRoot}${path.sep}`)) {
    fs.rmSync(previousDir, { recursive: true, force: true });
  }
}

async function validateSiteIconSource(buffer) {
  let metadata;
  try {
    metadata = await sharp(buffer, { failOn: 'error' }).rotate().metadata();
  } catch {
    throw new Error('无法读取站点图标，请上传 PNG、JPEG 或 WebP 图片');
  }
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (width < REQUIRED_SOURCE_SIZE || height < REQUIRED_SOURCE_SIZE) {
    throw new Error(`站点图标源图不得小于 ${REQUIRED_SOURCE_SIZE}x${REQUIRED_SOURCE_SIZE} 像素`);
  }
  if (width !== height) {
    throw new Error('站点图标源图必须为正方形');
  }
}

async function generateSiteIconFiles(sourceBuffer, version) {
  fs.mkdirSync(SITE_ICON_ROOT, { recursive: true });
  const targetDir = path.join(SITE_ICON_ROOT, version);
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  const temporaryDir = path.join(SITE_ICON_ROOT, `.${version}.${randomBytes(6).toString('hex')}.tmp`);
  fs.mkdirSync(temporaryDir, { recursive: true });

  try {
    const pngPaths = new Map();
    for (const size of PNG_SIZES) {
      const filePath = path.join(temporaryDir, `favicon-${size}x${size}.png`);
      await sharp(sourceBuffer, { failOn: 'error' })
        .rotate()
        .resize(size, size, { fit: 'fill' })
        .png({ compressionLevel: 9, palette: size <= 48 })
        .toFile(filePath);
      pngPaths.set(size, filePath);
    }

    const icoBuffer = await pngToIco([pngPaths.get(16), pngPaths.get(32), pngPaths.get(48)]);
    fs.writeFileSync(path.join(temporaryDir, 'favicon.ico'), icoBuffer);
    fs.renameSync(temporaryDir, targetDir);
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
  }

  const publicRoot = `/uploads/images/site-icons/${version}`;
  return {
    version,
    links: [
      { rel: 'apple-touch-icon', sizes: '180x180', href: `${publicRoot}/favicon-180x180.png` },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: `${publicRoot}/favicon-32x32.png` },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: `${publicRoot}/favicon-16x16.png` },
      { rel: 'shortcut icon', type: 'image/x-icon', href: `${publicRoot}/favicon.ico` }
    ]
  };
}

function siteIconManifestFilesExist(manifest) {
  return manifest.links.every((item) => {
    const filePath = resolveUploadedFilePath(item.href);
    return Boolean(filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile());
  });
}
