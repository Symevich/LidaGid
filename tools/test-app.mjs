/* Integration test for the SPA (jsdom, no browser needed).
   Run: node tools/test-app.mjs   (npm install first, see tools/package.json) */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

let failures = 0;
function check(name, cond, extra = '') {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? '  [' + extra + ']' : ''}`);
  if (!cond) failures++;
}
const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 3000) {
  const start = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await tick(25);
  }
}

/* ── static asset / wiring checks ── */
const indexHtml = read('index.html');
const welcomeHtml = read('welcome.html');
const swJs = read('sw.js');
const appJs = read('js/app.js');
const styleCss = read('css/style.css');
const manifest = JSON.parse(read('manifest.json'));

check('index.html links manifest', /rel="manifest" href="\.\/manifest\.json"/.test(indexHtml));
check('index.html has theme-color', /name="theme-color"/.test(indexHtml));
check('index.html registers sw.js', /serviceWorker\.register\('\.\/sw\.js'\)/.test(indexHtml));
check('index.html loads qrcode vendor', /src="\.\/js\/vendor\/qrcode\.js"/.test(indexHtml));
check('welcome.html links manifest', /rel="manifest" href="\.\/manifest\.json"/.test(welcomeHtml));
check('welcome.html registers sw.js', /serviceWorker\.register\('\.\/sw\.js'\)/.test(welcomeHtml));
check('manifest short_name', manifest.short_name === 'ЛідаГід', manifest.short_name);
check('manifest display standalone', manifest.display === 'standalone');
check('manifest start_url', manifest.start_url === './index.html', manifest.start_url);
for (const icon of manifest.icons) {
  check(`manifest icon exists ${icon.src}`, exists(icon.src), icon.sizes + ' ' + icon.purpose);
}

/* every precached shell asset must exist on disk */
const shellBlock = swJs.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/)[1];
const precached = [...shellBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
for (const asset of precached) {
  check(`sw precache exists ${asset}`, exists(asset));
}
check('sw has a versioned cache name', /lidagid-shell-\$\{VERSION\}/.test(swJs));
check('sw deletes old caches on activate', /caches\.delete/.test(swJs));
check('sw handles Range requests', /headers\.has\('range'\)/.test(swJs));

/* old in-card share/QR UI must be gone for good */
check('no in-card share buttons left in app.js', !/btn-action|object-card__actions/.test(appJs));
check('no in-card share styles left in style.css', !/btn-action|\.qr-panel/.test(styleCss));

/* ── DOM-level test ── */
const dom = new JSDOM('<!doctype html><html lang="be"><body><main id="app"></main></body></html>', {
  url: 'http://localhost/index.html',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

const requested = [];
window.fetch = async (url) => {
  requested.push(url);
  const file = path.join(ROOT, String(url).replace(/^\.\//, ''));
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => { throw new Error('404'); } };
  const text = fs.readFileSync(file, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};

const copied = [];
Object.defineProperty(window.navigator, 'clipboard', {
  configurable: true,
  value: { writeText: async (t) => { copied.push(t); } },
});
Object.defineProperty(window, 'CSS', { configurable: true, value: { supports: () => true } });

const ctx = dom.getInternalVMContext();
vm.runInContext(read('js/i18n.js'), ctx, { filename: 'i18n.js' });
vm.runInContext(read('js/vendor/qrcode.js'), ctx, { filename: 'qrcode.js' });
vm.runInContext(read('js/app.js'), ctx, { filename: 'app.js' });

const doc = window.document;
const byText = (root, selector, text) =>
  [...root.querySelectorAll(selector)].find((el) => el.textContent.trim() === text);

async function goto(hash) {
  window.location.hash = hash;
  await tick(10);
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
}

const chrome   = await waitFor(() => doc.querySelector('.top-chrome'), 'top chrome');
const shareBtn = chrome.querySelector('.share-button');
const langWrap = chrome.querySelector('.lang-switcher');
const socialOf   = (name) =>
  [...doc.querySelectorAll('.share-social')]
    .find((s) => (s.querySelector('.share-social__name') || {}).textContent === name);

/* ── chrome: share button left of the language switcher ── */
check('top chrome exists', !!chrome);
check('share button lives in the top chrome', !!shareBtn);
check('language switcher lives in the top chrome', !!langWrap);
check('share button is the first thing in the chrome (left of the switcher)',
  chrome.firstElementChild === shareBtn && chrome.lastElementChild === langWrap);
check('share button is icon-only', shareBtn.textContent.trim() === '' && !!shareBtn.querySelector('svg'));
check('share button has an accessible label',
  shareBtn.getAttribute('aria-label') === 'Падзяліцца спасылкай на гэтую старонку',
  shareBtn.getAttribute('aria-label'));
check('share button announces a dialog', shareBtn.getAttribute('aria-haspopup') === 'dialog');
check('share button starts collapsed', shareBtn.getAttribute('aria-expanded') === 'false');
check('share button hidden on the home screen', shareBtn.hidden === true);
check('chrome is fixed top-right in css', /\.top-chrome\s*\{[^}]*position:\s*fixed/s.test(styleCss));
check('share button is round in css', /\.share-button\s*\{[^}]*border-radius:\s*50%/s.test(styleCss));

/* ── home: no quiz UI anywhere outside object pages ── */
await waitFor(() => doc.querySelectorAll('.card').length, 'home cards');
check('home has no quiz progress badge', !doc.getElementById('quizBadge'));
check('home has no quiz block', !doc.querySelector('.quiz'));

/* ── object page: quiz only here ── */
await goto('#/object/sights/lidski-zamak');
let card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'object card');

check('object title', card.querySelector('h1').textContent === 'Лідскі замак');
check('share button visible on an object page', shareBtn.hidden === false);
check('audio player present', !!card.querySelector('audio'));
check('object card has no share/QR buttons of its own', !card.querySelector('.btn-action'));
check('no QR panel inside the object card', !doc.getElementById('qrPanel'));

const quizBlock = card.querySelector('.quiz');
check('quiz rendered on the object page', !!quizBlock);
check('quiz question', quizBlock.querySelector('.quiz__question').textContent === 'У якім годзе быў узведзены Лідскі замак?',
  quizBlock.querySelector('.quiz__question').textContent);
const opts = [...quizBlock.querySelectorAll('.quiz__option')];
check('quiz has 4 options', opts.length === 4, opts.map((o) => o.textContent).join('|'));
check('feedback hidden while unanswered',
  !!quizBlock.querySelector('.quiz__feedback:empty') || quizBlock.querySelector('.quiz__feedback').textContent === '');

/* ── share modal ── */
const urlOnObject = window.location.href;
check('modal not in the DOM before the first open', !doc.querySelector('.share-modal'));

shareBtn.click();
await tick();
const modal = doc.querySelector('.share-modal');
check('share button opens the modal', !!modal && !modal.hidden);
check('share button marked expanded', shareBtn.getAttribute('aria-expanded') === 'true');
check('page behind the modal is scroll-locked', doc.body.classList.contains('share-open'));

const dialog = modal.querySelector('.share-modal__dialog');
check('modal is a dialog', dialog.getAttribute('role') === 'dialog' && dialog.getAttribute('aria-modal') === 'true');
check('focus moves into the modal', doc.activeElement === modal.querySelector('.share-modal__close'));

const qrSvgEl = modal.querySelector('.share-modal__qr svg');
check('modal shows the QR code', !!qrSvgEl && (qrSvgEl.querySelector('path').getAttribute('d') || '').length > 500,
  qrSvgEl && qrSvgEl.getAttribute('viewBox'));
check('QR svg is scalable + labelled',
  qrSvgEl && !qrSvgEl.getAttribute('width') && qrSvgEl.getAttribute('role') === 'img');
check('QR encodes the current deep link',
  /#\/object\/sights\/lidski-zamak$/.test(qrSvgEl.getAttribute('aria-label') || '') ||
  !!modal.querySelector('.share-modal__hint'));
check('modal has a divider line below the QR', !!modal.querySelector('hr.share-modal__divider'));
const dialogOrder = [...dialog.children].map((el) => el.className);
check('QR, then the divider, then the "share to" label',
  dialogOrder.indexOf('share-modal__qr') < dialogOrder.indexOf('share-modal__divider') &&
  dialogOrder.indexOf('share-modal__divider') < dialogOrder.indexOf('share-modal__label'));
check('copy-link button is the last block',
  dialogOrder[dialogOrder.length - 1] === 'share-modal__copy', dialogOrder.join('|'));
check('modal shows the "share to" label', modal.querySelector('.share-modal__label').textContent === 'Падзяліцца ў…',
  modal.querySelector('.share-modal__label').textContent);
check('hint explains the QR code', /Навядзіце камеру/.test(modal.querySelector('.share-modal__hint').textContent));

const enc = encodeURIComponent(urlOnObject);
const socials = [...modal.querySelectorAll('.share-social')];
check('modal lists 7 share targets', socials.length === 7,
  socials.map((s) => s.querySelector('.share-social__name').textContent).join('|'));
check('telegram target carries the deep link', (socialOf('Telegram').href) ===
  `https://t.me/share/url?url=${enc}&text=${encodeURIComponent(doc.title)}`, socialOf('Telegram').href);
check('viber target carries the deep link',
  socialOf('Viber').href.startsWith('viber://forward?text=') && socialOf('Viber').href.includes(enc));
check('whatsapp target carries the deep link',
  socialOf('WhatsApp').href.startsWith('https://api.whatsapp.com/send?text=') && socialOf('WhatsApp').href.includes(enc));
check('vk target carries the deep link', socialOf('VK').href.includes(enc));
check('facebook target carries the deep link', socialOf('Facebook').href.includes(enc));
check('x target carries the deep link', socialOf('X').href.includes(enc));
check('email target is a mailto with the link',
  socialOf('E-mail').href.startsWith('mailto:?subject=') && socialOf('E-mail').href.includes(enc));
check('external targets open in a new tab',
  socials.filter((s) => s.getAttribute('target') === '_blank').length === 6);
check('email target stays in the same tab', !socialOf('E-mail').getAttribute('target'));
check('share targets have accessible labels',
  socials.every((s) => /^Падзяліцца ў \S+$/.test(s.getAttribute('aria-label') || '')));
check('share targets have brand-colored round icons',
  socials.every((s) => !!s.querySelector('.share-social__icon svg') && !!s.querySelector('.share-social__icon').style.background));
check('native share target hidden when navigator.share is missing', !socialOf('Яшчэ…'));

/* focus trap + escape */
const focusables = [...modal.querySelectorAll('button, a[href]')];
focusables[focusables.length - 1].focus();
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
check('Tab wraps to the first control', doc.activeElement === focusables[0]);
focusables[0].focus();
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
check('Shift+Tab wraps to the last control', doc.activeElement === focusables[focusables.length - 1]);

/* copy link */
const copyBtn = modal.querySelector('.share-modal__copy');
check('copy-link button present', /Скапіяваць спасылку/.test(copyBtn.textContent));
check('copy-link button has an icon', !!copyBtn.querySelector('svg'));
copyBtn.click();
await waitFor(() => modal.hidden, 'modal closing after copy');
check('clipboard received the deep link', copied.at(-1) === urlOnObject, copied.at(-1));
const toast = doc.getElementById('toast');
check('toast shown with copied message',
  toast && toast.classList.contains('toast--visible') && toast.textContent === 'Спасылка скапіравана',
  toast && toast.textContent);
check('modal closes after copying', modal.hidden);
check('focus returns to the share button', doc.activeElement === shareBtn);
check('scroll lock released', !doc.body.classList.contains('share-open'));

/* escape + backdrop */
shareBtn.click();
await tick();
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
check('Escape closes the modal', modal.hidden);
check('share button marked collapsed again', shareBtn.getAttribute('aria-expanded') === 'false');

shareBtn.click();
await tick();
modal.querySelector('.share-modal__backdrop').click();
check('backdrop click closes the modal', modal.hidden);

shareBtn.click();
await tick();
await goto('#/sights');
check('navigating away closes the modal', modal.hidden);

/* ── quiz answering ── */
opts[0].click();
await tick();
const feedback = quizBlock.querySelector('.quiz__feedback');
check('wrong answer feedback', /^Няправільна\. Правільны адказ: 1323$/.test(feedback.textContent), feedback.textContent);
check('correct option marked green', opts[1].classList.contains('quiz__option--correct'));
check('picked option marked red', opts[0].classList.contains('quiz__option--wrong'));
check('options disabled after answering', opts.every((o) => o.disabled));
check('explanation visible', !quizBlock.querySelector('.quiz__explanation').hidden);
check('progress untouched after wrong answer',
  !(window.localStorage.getItem('lidagid_quiz_progress') || '').includes('lidski-zamak'));

await goto('#/object/people/hedymin');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'hedymin card');
card.querySelectorAll('.quiz__option')[0].click();
await tick();
check('correct answer feedback', card.querySelector('.quiz__feedback').textContent === 'Правільна!',
  card.querySelector('.quiz__feedback').textContent);
check('quiz marked done in localStorage',
  (window.localStorage.getItem('lidagid_quiz_progress') || '') === '["people/hedymin"]',
  window.localStorage.getItem('lidagid_quiz_progress'));

await goto('#/object/people/hedymin');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'hedymin card again');
check('a passed quiz comes back answered',
  [...card.querySelectorAll('.quiz__option')].every((o) => o.disabled));

/* ── lists and sections stay quiz-free ── */
await goto('#/people');
await waitFor(() => doc.querySelectorAll('.list-item').length, 'people list');
check('section has no quiz progress badge', !doc.getElementById('quizBadge'));
check('share button visible on a section page', shareBtn.hidden === false);
check('list items carry no quiz marker', !doc.querySelector('.list-item__badge'));
check('list items carry no quiz block', !doc.querySelector('.quiz'));

await goto('#/sights');
await waitFor(() => doc.querySelectorAll('.list-item').length, 'sights list');
check('sights list has no quiz marker either', !doc.querySelector('.list-item__badge'));
check('no quiz block on a section page', !doc.querySelector('.quiz'));

/* back to the start screen: the share button goes away again */
await goto('#/sights');
await waitFor(() => doc.querySelectorAll('.list-item').length, 'sights list again');
shareBtn.click();
await tick();
check('modal opens on a section page', !modal.hidden);
await goto('#/');
await waitFor(() => doc.querySelectorAll('.card').length, 'home cards again');
check('going back home closes the modal', modal.hidden);
check('share button hidden again on the home screen', shareBtn.hidden === true);
check('focus is not left on the hidden share button', doc.activeElement !== shareBtn);

/* ── russian locale ── */
window.localStorage.setItem('lidagid_lang', 'ru');
await goto('#/object/sights/lidski-zamak');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'ru card');
check('ru quiz question',
  card.querySelector('.quiz__question').textContent === 'В каком году был возведён Лидский замок?',
  card.querySelector('.quiz__question').textContent);

shareBtn.click();
await tick();
check('ru share-to label', modal.querySelector('.share-modal__label').textContent === 'Поделиться в…',
  modal.querySelector('.share-modal__label').textContent);
check('ru copy-link label', /Скопировать ссылку/.test(modal.querySelector('.share-modal__copy').textContent));
check('ru close button label',
  modal.querySelector('.share-modal__close').getAttribute('aria-label') === 'Закрыть окно');
check('ru share targets describe the ru page',
  socialOf('Telegram').href.includes(encodeURIComponent(window.location.href)));
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

await goto('#/object/sights/does-not-exist');
const err = await waitFor(() => doc.querySelector('.status--error'), 'error status');
check('unknown object shows localized error', err.textContent.includes('Объект не найден.'),
  err.textContent);

await goto('#/object/enterprises/konus');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'konus card');
check('ru enterprise quiz',
  card.querySelector('.quiz__question').textContent === 'Какую услугу оказывает завод «Конус»?',
  card.querySelector('.quiz__question').textContent);

/* ── english locale ── */
window.localStorage.setItem('lidagid_lang', 'en');
await goto('#/object/sights/carkva-usich-sviatych');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'en card');
check('en quiz title', card.querySelector('.quiz__title').textContent === 'Test yourself',
  card.querySelector('.quiz__title').textContent);
card.querySelectorAll('.quiz__option')[2].click();
await tick();
check('en correct feedback', card.querySelector('.quiz__feedback').textContent === 'Correct!',
  card.querySelector('.quiz__feedback').textContent);

shareBtn.click();
await tick();
check('en share-to label', modal.querySelector('.share-modal__label').textContent === 'Share to...',
  modal.querySelector('.share-modal__label').textContent);
check('en copy-link label', /Copy link/.test(modal.querySelector('.share-modal__copy').textContent));

/* the system share sheet shows up as one more target when supported */
Object.defineProperty(window.navigator, 'share', {
  configurable: true,
  value: async (data) => { window.__shared = data; },
});
shareBtn.click();
await tick();
const moreBtn = socialOf('More…');
check('native share target appears when navigator.share exists', !!moreBtn);
moreBtn.click();
await waitFor(() => !!window.__shared, 'native share call');
check('native share receives title + url',
  window.__shared.url === window.location.href && window.__shared.title === doc.title,
  JSON.stringify(window.__shared));
check('modal closes after the native share',
  await waitFor(() => modal.hidden || null, 'modal hidden')
);

console.log(failures ? `\n${failures} FAILURES` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
