import { createApp } from './app.mjs';
import { listStandaloneLanguageSites } from './services/languages.mjs';
import { resolveContentRootByLanguageSite } from './static-file-handler.mjs';
import { withPortConflictDetails } from './utils/port-diagnostics.mjs';

export function createSiteListenerManager({ logger = console } = {}) {
  const listeners = new Map();

  return {
    async sync() {
      const sites = listStandaloneLanguageSites();
      const activeKeys = new Set();

      for (const language of sites) {
        const listenerKey = buildListenerKey(language);
        activeKeys.add(listenerKey);
        const descriptor = buildListenerDescriptor(language);
        const existing = listeners.get(listenerKey);

        if (existing && isSameDescriptor(existing.descriptor, descriptor)) {
          continue;
        }

        if (existing) {
          await closeListener(existing, logger);
          listeners.delete(listenerKey);
        }

        const app = await createApp({
          publicSite: {
            languageCode: language.code,
            languageSiteId: language.site.id,
            contentRoot: resolveContentRootByLanguageSite(language)
          }
        });

        try {
          await app.listen({ port: descriptor.port, host: descriptor.host });
          listeners.set(listenerKey, { app, descriptor });
          logger.info?.(`[site-listener] ${language.code} listening on http://${descriptor.host}:${descriptor.port}`);
        } catch (error) {
          const enrichedError = withPortConflictDetails(error, descriptor.port);
          logger.error?.(enrichedError);
          await safeCloseApp(app);
          throw new Error(`独立站点 ${language.code} 启动失败：${enrichedError.message || enrichedError}`);
        }
      }

      for (const [listenerKey, entry] of listeners.entries()) {
        if (activeKeys.has(listenerKey)) {
          continue;
        }
        await closeListener(entry, logger);
        listeners.delete(listenerKey);
      }
    },

    async closeAll() {
      for (const entry of listeners.values()) {
        await closeListener(entry, logger);
      }
      listeners.clear();
    }
  };
}

function buildListenerKey(language) {
  return String(language?.code || '').trim().toLowerCase();
}

function buildListenerDescriptor(language) {
  return {
    code: language.code,
    host: String(language?.site?.bind_host || '127.0.0.1').trim() || '127.0.0.1',
    port: Number(language?.site?.access_port || 0),
    siteId: Number(language?.site?.id || 0),
    contentRoot: resolveContentRootByLanguageSite(language)
  };
}

function isSameDescriptor(left, right) {
  return (
    left?.host === right?.host
    && Number(left?.port || 0) === Number(right?.port || 0)
    && Number(left?.siteId || 0) === Number(right?.siteId || 0)
    && String(left?.contentRoot || '') === String(right?.contentRoot || '')
  );
}

async function closeListener(entry, logger) {
  if (!entry?.app) {
    return;
  }
  try {
    await entry.app.close();
    logger.info?.(`[site-listener] stopped ${entry?.descriptor?.code || 'site'}`);
  } catch (error) {
    logger.error?.(error);
  }
}

async function safeCloseApp(app) {
  try {
    await app.close();
  } catch {
    // ignore close failures during partial startup
  }
}
