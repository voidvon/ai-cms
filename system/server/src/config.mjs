import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SERVER_ROOT = path.resolve(__dirname, '..');
export const SYSTEM_ROOT = path.resolve(SERVER_ROOT, '..');
export const PROJECT_ROOT = path.resolve(SYSTEM_ROOT, '..');
export const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
export const CONTENT_ROOT = path.join(PROJECT_ROOT, 'html');
export const UPLOADS_ROOT = path.join(PROJECT_ROOT, 'uploads');
export const UPLOADS_IMAGES_ROOT = path.join(UPLOADS_ROOT, 'images');
export const UPLOADS_PDFS_ROOT = path.join(UPLOADS_ROOT, 'pdfs');
export const UPLOADS_FILES_ROOT = path.join(UPLOADS_ROOT, 'files');
export const UPLOADS_SKIN_ROOT = path.join(UPLOADS_ROOT, 'skin');
export const ADMIN_APP_ROOT = path.join(SYSTEM_ROOT, 'admin');
export const ADMIN_DIST_ROOT = path.join(ADMIN_APP_ROOT, 'dist');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const IMPORT_DIR = path.join(SERVER_ROOT, 'import');
export const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'site.sqlite');
export const PORT = Number.parseInt(process.env.PORT || '1231', 10);
export const HOST = process.env.HOST || '127.0.0.1';
export const UPLOAD_MAX_SIZE_KB = Number.parseInt(process.env.UPLOAD_MAX_SIZE_KB || '400', 10);
export const IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB = Number.parseInt(process.env.IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB || '10240', 10);
export const ATTACHMENT_UPLOAD_MAX_SIZE_KB = Number.parseInt(process.env.ATTACHMENT_UPLOAD_MAX_SIZE_KB || '10240', 10);
export const UPLOAD_ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
export const ATTACHMENT_ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.zip',
  '.rar',
  '.7z',
  '.csv',
  '.mp3',
  '.mp4',
  '.webm',
  '.svg',
  '.webp',
]);

export const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.csv', 'text/csv; charset=utf-8'],
  ['.zip', 'application/zip'],
  ['.rar', 'application/vnd.rar'],
  ['.7z', 'application/x-7z-compressed'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.map', 'application/json; charset=utf-8'],
  ['.swf', 'application/x-shockwave-flash']
]);
