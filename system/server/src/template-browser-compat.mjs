import { transform as transformCss, browserslistToTargets } from 'lightningcss';
import { transformSync as transformJs } from 'esbuild';
import {
  PUBLIC_BROWSER_BROWSERSLIST,
  PUBLIC_ESBUILD_TARGET
} from '../../shared/browser-targets.mjs';

const PUBLIC_LIGHTNINGCSS_TARGETS = browserslistToTargets([...PUBLIC_BROWSER_BROWSERSLIST]);

export function compileBrowserCompatibleCss(cssText, { filename = 'template.css', minify = false } = {}) {
  const normalizedCssText = String(cssText || '').trim();
  if (!normalizedCssText) {
    return '';
  }

  const result = transformCss({
    filename,
    code: Buffer.from(normalizedCssText),
    minify,
    targets: PUBLIC_LIGHTNINGCSS_TARGETS
  });
  return Buffer.from(result.code).toString('utf8');
}

export function compileBrowserCompatibleJs(jsText, { minify = false } = {}) {
  const normalizedJsText = String(jsText || '').trim();
  if (!normalizedJsText) {
    return '';
  }

  const result = transformJs(normalizedJsText, {
    loader: 'js',
    target: [...PUBLIC_ESBUILD_TARGET],
    minify,
    legalComments: 'none'
  });
  return String(result.code || '').trim() || normalizedJsText;
}
