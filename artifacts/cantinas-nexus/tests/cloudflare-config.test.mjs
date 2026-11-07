import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Cloudflare Pages serves index.html for SPA routes when there is no 404.html.
// A GitHub Pages redirect file would break direct /cozinha and /acompanhar URLs.
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const headersPath = fileURLToPath(new URL('../public/_headers', import.meta.url));
const legacy404 = fileURLToPath(new URL('../public/404.html', import.meta.url));
const viteConfig = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');

test('Cloudflare staging uses native SPA route fallback', () => {
  assert.equal(existsSync(legacy404), false, 'GitHub Pages 404 fallback must not be shipped to Cloudflare');
  assert.match(viteConfig, /process\.env\.BASE_PATH\s*\|\|\s*'\/'/, 'Vite must support root base path');
});

test('staging supplies security headers and is not indexed', () => {
  const headers = readFileSync(headersPath, 'utf8');
  assert.match(headers, /X-Content-Type-Options:\s*nosniff/);
  assert.match(headers, /X-Frame-Options:\s*DENY/);
  assert.match(headers, /X-Robots-Tag:\s*noindex,\s*nofollow/);
});
