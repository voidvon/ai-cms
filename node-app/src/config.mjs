import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const APP_ROOT = path.resolve(__dirname, '..');
export const PROJECT_ROOT = path.resolve(APP_ROOT, '..');
export const DATA_DIR = path.join(APP_ROOT, 'data');
export const IMPORT_DIR = path.join(APP_ROOT, 'import');
export const DATABASE_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'site.sqlite');
export const PORT = Number.parseInt(process.env.PORT || '3000', 10);
export const HOST = process.env.HOST || '127.0.0.1';
export const UPLOAD_MAX_SIZE_KB = Number.parseInt(process.env.UPLOAD_MAX_SIZE_KB || '400', 10);
export const UPLOAD_ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif']);

export const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.htm', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.xml', 'application/xml; charset=utf-8'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
  ['.eot', 'application/vnd.ms-fontobject'],
  ['.map', 'application/json; charset=utf-8'],
  ['.swf', 'application/x-shockwave-flash']
]);
