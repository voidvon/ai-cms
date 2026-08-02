import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { resolveLanguageSiteBaseUrlFromLanguages } from '../src/services/site.mjs';
import { resolveCrossHostLanguageRedirect } from '../src/static-file-handler.mjs';

const configuredLanguages = [
  {
    code: 'en',
    is_enabled: 1,
    site: { host: 'www.spiraxsteam.com', path_prefix: '/', site_mode: 'standalone', is_primary: 1 }
  },
  {
    code: 'fr',
    is_enabled: 1,
    site: { host: '', path_prefix: '/fr', site_mode: 'subdir', is_primary: 0 }
  },
  {
    code: 'zh-CN',
    is_enabled: 1,
    site: { host: 'www.spiraxsteam.cn', path_prefix: '/', site_mode: 'standalone', is_primary: 0 }
  }
];

test('subdirectory language sites inherit the primary standalone host', () => {
  assert.equal(
    resolveLanguageSiteBaseUrlFromLanguages('fr', configuredLanguages),
    'https://www.spiraxsteam.com/fr'
  );
  assert.equal(
    resolveLanguageSiteBaseUrlFromLanguages('zh-CN', configuredLanguages),
    'https://www.spiraxsteam.cn'
  );
});

test('language URL resolution fails closed without a valid primary host', () => {
  const withoutPrimaryHost = configuredLanguages.map((language) => (
    language.code === 'en'
      ? { ...language, site: { ...language.site, host: '' } }
      : language
  ));

  assert.equal(resolveLanguageSiteBaseUrlFromLanguages('fr', withoutPrimaryHost), '');
  assert.equal(resolveLanguageSiteBaseUrlFromLanguages('missing', configuredLanguages), '');
});

test('known subdirectory paths permanently leave standalone regional hosts', () => {
  assert.equal(
    resolveCrossHostLanguageRedirect({
      hostname: 'www.spiraxsteam.cn',
      pathname: '/fr/services/',
      search: '?campaign=test',
      languages: configuredLanguages
    }),
    'https://www.spiraxsteam.com/fr/services/?campaign=test'
  );
  assert.equal(
    resolveCrossHostLanguageRedirect({
      hostname: 'www.spiraxsteam.com',
      pathname: '/fr/services/',
      languages: configuredLanguages
    }),
    ''
  );
  assert.equal(
    resolveCrossHostLanguageRedirect({
      hostname: 'localhost',
      pathname: '/fr/services/',
      languages: configuredLanguages
    }),
    ''
  );
});

test('legacy multiple-primary data migrates to one enabled fallback standalone site', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-cms-language-sites-'));
  const databasePath = path.join(temporaryRoot, 'site.sqlite');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE languages (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      native_name TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_fallback INTEGER NOT NULL DEFAULT 0,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE language_sites (
      id INTEGER PRIMARY KEY,
      language_id INTEGER NOT NULL,
      host TEXT,
      path_prefix TEXT,
      output_dir TEXT,
      site_mode TEXT NOT NULL DEFAULT 'subdir',
      access_port INTEGER,
      bind_host TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO languages (id, code, name, is_default, is_fallback, is_enabled, sort_order)
    VALUES
      (1, 'zh-CN', 'Chinese', 1, 0, 1, 0),
      (2, 'en', 'English', 0, 1, 1, 1),
      (3, 'fr', 'French', 0, 0, 1, 2);
    INSERT INTO language_sites (language_id, host, path_prefix, output_dir, site_mode, is_primary)
    VALUES
      (1, 'www.spiraxsteam.cn', '/', 'html_zh_cn', 'standalone', 1),
      (2, 'www.spiraxsteam.com', '/', 'html', 'standalone', 1),
      (3, NULL, '/fr', 'html/fr', 'subdir', 1);
  `);
  database.close();

  const serviceUrl = new URL('../src/services/languages.mjs', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '--eval', `import { listLanguages } from ${JSON.stringify(serviceUrl)}; console.log(JSON.stringify(listLanguages()));`],
    {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_PATH: databasePath }
    }
  );

  try {
    assert.equal(result.status, 0, result.stderr);
    const languages = JSON.parse(result.stdout.trim());
    assert.equal(languages.filter((language) => language.site.is_primary === 1).length, 1);
    assert.equal(languages.find((language) => language.site.is_primary === 1)?.code, 'en');

    const migratedDatabase = new DatabaseSync(databasePath);
    const primaryIndex = migratedDatabase.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_language_sites_primary'"
    ).get();
    migratedDatabase.close();
    assert.equal(primaryIndex?.name, 'idx_language_sites_primary');
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
