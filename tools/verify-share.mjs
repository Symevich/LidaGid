/* Validates the share-modal markup and the stylesheet.
   Run: node tools/verify-share.mjs */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
};

/* ── 1. every brand icon must be well-formed SVG ── */
const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>',
  { url: 'http://localhost/', runScripts: 'outside-only' });
const { window } = dom;
const ctx = dom.getInternalVMContext();
window.fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
vm.runInContext(read('js/i18n.js'), ctx, { filename: 'i18n.js' });
vm.runInContext(read('js/vendor/qrcode.js'), ctx, { filename: 'qrcode.js' });
vm.runInContext(read('js/app.js'), ctx, { filename: 'app.js' });

const doc = window.document;
const shareBtn = await (async () => {
  for (let i = 0; i < 60; i++) {
    const b = doc.querySelector('.share-button');
    if (b) return b;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('share button never appeared');
})();

shareBtn.click();
await new Promise((r) => setTimeout(r, 50));

const parser = new window.DOMParser();
const icons = [...doc.querySelectorAll('.share-social__icon svg')];
check('modal produced social icons', icons.length === 7, String(icons.length));
for (const svg of icons) {
  const name = svg.parentElement.parentElement.querySelector('.share-social__name').textContent;
  const parsed = parser.parseFromString(svg.outerHTML, 'image/svg+xml');
  const bad = parsed.querySelector('parsererror');
  check(`icon ${name} is well-formed SVG`, !bad, bad ? bad.textContent.slice(0, 60) : svg.outerHTML.replace(/\s+/g, ' ').slice(0, 70));
  check(`icon ${name} has drawing content`, parsed.querySelector('svg').children.length > 0);
}

/* the QR in the modal must be a valid standalone SVG too */
const qr = doc.querySelector('.share-modal__qr svg');
const qrParsed = parser.parseFromString(qr.outerHTML, 'image/svg+xml');
check('modal QR is well-formed SVG', !qrParsed.querySelector('parsererror'));
check('modal QR carries a title for screen readers', !!qrParsed.querySelector('title'));

/* ── 2. stylesheet sanity ── */
const css = read('css/style.css');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
check('css braces are balanced',
  (code.match(/\{/g) || []).length === (code.match(/\}/g) || []).length,
  `${(code.match(/\{/g) || []).length} vs ${(code.match(/\}/g) || []).length}`);
check('no removed share-card selectors left',
  !/\.btn-action|\.qr-panel|\.badge-progress|\.list-item__badge|\.object-card__actions/.test(css));
check('lang switcher is no longer fixed (lives in the chrome)',
  !/\.lang-switcher\s*\{[^}]*position:\s*fixed/s.test(css));
check('toast stays above the share modal',
  /\.share-modal\s*\{[^}]*z-index:\s*70/s.test(css) && /\.toast\s*\{[^}]*z-index:\s*80/s.test(css));
check('share button is hidden on the home screen via css',
  /\.share-button\[hidden\]\s*\{\s*display:\s*none/.test(css));

/* every class the modal builds must be styled */
for (const cls of ['share-modal', 'share-modal__backdrop', 'share-modal__dialog',
  'share-modal__close', 'share-modal__qr', 'share-modal__hint', 'share-modal__divider',
  'share-modal__label', 'share-modal__socials', 'share-modal__copy', 'share-social',
  'share-social__icon', 'share-social__name', 'share-button', 'top-chrome']) {
  check(`css styles .${cls}`, css.includes('.' + cls));
}

console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
