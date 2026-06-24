function readRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

export function loadConfig() {
  return {
    cmsBaseUrl: normalizeBaseUrl(readRequiredEnv('CMS_BASE_URL')),
    cmsToken: readRequiredEnv('CMS_TOKEN')
  };
}
