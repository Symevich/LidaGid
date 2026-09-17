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

/* ── scroll-aware chrome, mobile rows, welcome note ── */
check('app.js toggles the chrome-hidden body class',
  /classList\.add\('chrome-hidden'\)/.test(appJs) &&
  /classList\.remove\('chrome-hidden'\)/.test(appJs));
check('app.js requires a deliberate pull before showing the chrome again',
  /CHROME_REVEAL_STEP\s*=\s*\d+/.test(appJs));
check('app.js clamps the remembered depth to the end of the page',
  /Math\.min\(Math\.max\(_deepestScrollY, y\), maxScrollY\(\)\)/.test(appJs));
check('app.js throttles the scroll handler with rAF', /requestAnimationFrame\(applyScrollChrome\)/.test(appJs));
check('app.js scrolls each new view to the top', /scrollToTop\(\);/.test(appJs));
check('app.js lets the SPA own scroll restoration', /scrollRestoration = 'manual'/.test(appJs));
check('css slides the chrome away when hidden',
  /body\.chrome-hidden \.top-chrome[\s\S]*?opacity:\s*0/.test(styleCss), 'body.chrome-hidden');
check('css transitions the chrome', /\.top-chrome,\s*\n\.back-button \{[\s\S]*?transition:/.test(styleCss));
/* chrome buttons must behave alike: no UA border, and a focus ring */
check('the back button resets the UA border',
  /\.back-button \{[\s\S]*?border: none;/.test(styleCss));
check('the back button shows a focus ring',
  /\.back-button:focus-visible \{[^}]*outline: 2px/.test(styleCss));
check('list rows reveal keyboard focus', /\.list-item:focus-visible/.test(styleCss));
check('the card description drops its trailing paragraph margin',
  /\.object-card__text p:last-child \{[^}]*margin-bottom: 0/.test(styleCss));
check('reduced motion keeps focus visible',
  /prefers-reduced-motion[\s\S]*?\.card:focus-visible,[\s\S]*?outline: 2px/.test(styleCss));

/* ── design tokens: one scale, no stray values ── */
check('the spacing scale is declared',
  /--space-1:\s*4px/.test(styleCss) && /--space-7:\s*32px/.test(styleCss));
check('the radius scale is declared',
  /--radius-sm:\s*8px/.test(styleCss) && /--radius-pill:\s*999px/.test(styleCss));
check('the elevation scale is declared',
  /--shadow-hover:/.test(styleCss) && /--shadow-modal:/.test(styleCss));
check('nothing declares a raw spacing value any more',
  !/(margin|padding|gap)[a-z-]*:[^;]*\d+px/.test(styleCss));
check('no raw radius value leaks through',
  !/border-radius:[^;]*\d+px/.test(styleCss));
check('the old single radius alias is gone', !/var\(--radius\)/.test(styleCss));

/* ── photo sizing: bounded, but never cropped ── */
check('the photo ceiling is declared as a token',
  /--photo-max-h:\s*\d+px/.test(styleCss));
check('a hero photo is bounded, not cropped',
  /\.object-card__image\s*\{[^}]*max-height:\s*var\(--photo-max-h\)/.test(styleCss)
  && !/\.object-card__image[^{]*\{[^}]*object-fit:\s*cover/.test(styleCss));
check('a bounded hero photo keeps its own proportions',
  /\.object-card__image\s*\{[^}]*width:\s*auto/.test(styleCss)
  && /\.object-card__image\s*\{[^}]*margin-inline:\s*auto/.test(styleCss));
check('a carousel slide fits the photo instead of cropping it',
  /\.gallery__image\s*\{[^}]*object-fit:\s*contain/.test(styleCss)
  && /\.gallery__image\s*\{[^}]*flex:\s*0 0 100%/.test(styleCss));
check('every view declares a width ceiling',
  /--page-max:\s*\d+px/.test(styleCss) &&
  /--section-max:\s*\d+px/.test(styleCss) &&
  /--object-max:\s*\d+px/.test(styleCss));
check('the home view and its map share one ceiling',
  (styleCss.match(/max-width: var\(--page-max\)/g) || []).length === 2,
  String((styleCss.match(/max-width: var\(--page-max\)/g) || []).length));
check('a section view and its map share one ceiling',
  (styleCss.match(/max-width: var\(--section-max\)/g) || []).length === 2,
  String((styleCss.match(/max-width: var\(--section-max\)/g) || []).length));
check('the object page stops growing on a wide monitor',
  /\.page--object\s*\{[^}]*max-width:\s*var\(--object-max\)/.test(styleCss));
check('the monogram fills the round thumbnail box',
  /\.list-item__monogram\s*\{[^}]*display:\s*inline-flex/.test(styleCss) &&
  /\.list-item__monogram\s*\{[^}]*justify-content:\s*center/.test(styleCss));
check('a person thumbnail crops from the top of the frame',
  /\.card-grid--people\s+\.list-item__image\s*\{[^}]*object-position:\s*center\s+30%/.test(styleCss));
check('no section falls back to a photo of another object',
  !/fallback:\s*'\.\/assets\//.test(appJs) && /card-grid--/.test(appJs));
check('the carousel arrows are pills sized from the shared token',
  /\.gallery__arrow\s*\{[^}]*height:\s*var\(--chrome-h\)/.test(styleCss)
  && /\.gallery__arrow--prev\s*\{\s*left:/.test(styleCss)
  && /\.gallery__arrow--next\s*\{\s*right:/.test(styleCss));
check('a disabled arrow fades instead of vanishing',
  /\.gallery__arrow:disabled\s*\{[^}]*opacity:\s*0?\.\d+/.test(styleCss));
check('the disclosure drops the browser default marker',
  /\.quiz__summary\s*\{[^}]*list-style:\s*none/.test(styleCss) &&
  /\.quiz__summary::-webkit-details-marker\s*\{\s*display:\s*none/.test(styleCss));
check('the disclosure cue turns over when the quiz opens',
  /\.quiz\[open\]\s+\.quiz__chevron\s*\{[^}]*rotate\(180deg\)/.test(styleCss));
check('a view and the map below it share one bottom margin',
  /--page-gap:/.test(styleCss) &&
  !/\.map-section \{[\s\S]*?margin: 0 auto var\(--space/.test(styleCss));

/* ── safe areas ── */
check('the viewport opts into the full screen',
  /viewport-fit=cover/.test(indexHtml) && /viewport-fit=cover/.test(welcomeHtml));
check('the safe-area insets are read once',
  /--safe-top:\s*env\(safe-area-inset-top/.test(styleCss) &&
  /--safe-bottom:\s*env\(safe-area-inset-bottom/.test(styleCss));
check('the chrome steers around the notch',
  /\.top-chrome \{[\s\S]*?calc\(var\(--chrome-inset\) \+ var\(--safe-top\)\)/.test(styleCss) &&
  /\.back-button \{[\s\S]*?calc\(var\(--chrome-inset\) \+ var\(--safe-top\)\)/.test(styleCss));
check('the content clears the notch too',
  /--chrome-clearance:[\s\S]{0,200}?var\(--safe-top\)/.test(styleCss));
/* A hardcoded clearance drifts the moment a pill's padding changes: the
   height and the offset are tokens, and the clearance is computed from them. */
check('the clearance is derived from the pill box, not a magic number',
  /--chrome-clearance:[\s\S]{0,200}?var\(--chrome-inset\)[\s\S]{0,200}?var\(--chrome-h\)/.test(styleCss));
check('every pill takes its height from the same token',
  /\.share-button \{[\s\S]*?height: var\(--chrome-h\)/.test(styleCss) &&
  (styleCss.match(/min-height: var\(--chrome-h\)/g) || []).length === 2);
check('the mobile inset tightens through the token, not a copy of the rule',
  /--chrome-inset: var\(--space-3\)/.test(styleCss) &&
  !/@media \(max-width: 600px\) \{[\s\S]{0,2000}?\.top-chrome \{/.test(styleCss));
check('the page ends above the home indicator',
  /padding-bottom: var\(--safe-bottom\)/.test(styleCss));

/* ── the object card must actually be hidden while loading ── */
check('the hidden object card stays hidden',
  /\.object-card\[hidden\] \{ display: none; \}/.test(styleCss));
/* the fixed chrome floats above every view, home included */
check('mobile list rows keep the round icon beside the title',
  /\.list-item \{[^}]*flex-direction: row/.test(styleCss));
/* Every view reserves the same room for the floating controls. The offset
   lives on .page so padding cannot collapse with a child's margin — that is
   what used to leave the object card tucked under the buttons. */
check('the clearance is defined once',
  (styleCss.match(/--chrome-clearance:/g) || []).length === 1);
check('the page reserves room for the floating controls',
  /\.page \{[\s\S]*?padding-top: var\(--chrome-clearance\)/.test(styleCss));
check('no per-child offset duplicates the clearance',
  !/\.page__header \{[^}]*padding-top/.test(styleCss) &&
  !/\.object-card \{[^}]*margin-top/.test(styleCss));
check('the offset does not shift when the chrome hides',
  !/body\.chrome-hidden[^{].*\.page\b/.test(styleCss));
check('mobile keeps the clearance from the base rules',
  /padding-right: calc\(var\(--gutter\) \+ var\(--safe-right\)\)/.test(styleCss) &&
  /padding-left:\s*calc\(var\(--gutter\) \+ var\(--safe-left\)\)/.test(styleCss));
/* The card is the first element of an object view, so the one page that has
   no heading over the fold is the one that gets the extra air. */
check('the object card gets more air than a heading',
  /\.page--object \{[\s\S]*?padding-top: calc\(var\(--chrome-clearance\) \+ var\(--space-4\)\)/
    .test(styleCss));
check('mobile does not stack a second top offset',
  !/body \{ padding-top: 56px; \}/.test(styleCss));
check('no breakpoint re-adds its own top margin',
  !/margin: \d+px auto (2[04]|32)px/.test(styleCss));
check('welcome.html syncs the "around 1323" note with the tagline',
  /id="citySub"/.test(welcomeHtml) &&
  /каля 1323/.test(welcomeHtml) && /около 1323/.test(welcomeHtml) && /around 1323/.test(welcomeHtml), 'citySub');

/* ── per-locale audio: no player and no placeholder text when missing ── */
check('app.js only builds the audio wrap when a recording exists',
  /if \(obj\.audio\) \{[\s\S]*?card\.appendChild\(audioWrap\);[\s\S]*?\n    \}/.test(appJs));
check('app.js has no "no audio" placeholder left', !/noAudio/.test(appJs));
check('i18n has no unused noAudio string left', !/noAudio/.test(read('js/i18n.js')));
check('the data files may point at locale-specific recordings',
  !/\['image', 'audio', 'lat', 'lng'\]/.test(read('tools/check-data.mjs')));
/* the original recordings belong to the Belarusian locale only */
for (const lang of ['ru', 'en']) {
  const items = JSON.parse(read(`data/sights.${lang}.json`));
  const borrowed = items.filter((it) => it.audio && !new RegExp(`\\.${lang}\\.(ogg|mp3)$`, 'i').test(it.audio));
  check(`no Belarusian recording borrowed by the ${lang} locale`,
    borrowed.length === 0, borrowed.map((it) => it.audio).join(', '));
}

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
check('chrome is visible again after navigating', !doc.body.classList.contains('chrome-hidden'));
check('audio player present', !!card.querySelector('audio'));
check('the player points at the recording named in the data file',
  (card.querySelector('audio source') || {}).src ===
    new URL('./assets/audio/lidski-zamak.ogg', window.location.href).href,
  (card.querySelector('audio source') || {}).src);
check('object card has no share/QR buttons of its own', !card.querySelector('.btn-action'));
check('no QR panel inside the object card', !doc.getElementById('qrPanel'));

/* ── a record without audio shows nothing at all ── */
await goto('#/object/sights/kamandzirovaczny');
const silentCard = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden && c.querySelector('h1') ? c : null;
}, 'card without audio');
check('no audio player when the record has no recording', !silentCard.querySelector('audio'));
check('no empty audio wrap left behind', !silentCard.querySelector('.object-card__audio-wrap'));
check('no placeholder text about missing audio',
  !/аўдыязапіс|аудиозапи|no audio/i.test(silentCard.textContent), silentCard.textContent.slice(0, 80));
await goto('#/object/sights/lidski-zamak');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'object card again');

const quizBlock = card.querySelector('.quiz');
check('quiz rendered on the object page', !!quizBlock);

/* ── the quiz is a collapsed disclosure, opened by tapping its title ── */
check('the quiz starts collapsed',
  quizBlock.tagName === 'DETAILS' && quizBlock.open === false);
check('the quiz title sits inside the disclosure summary',
  !!quizBlock.querySelector('.quiz__summary > .quiz__title'));
check('the collapsed quiz shows an expand cue',
  !!quizBlock.querySelector('.quiz__summary > .quiz__chevron'));
check('the question and the options live in the panel',
  !!quizBlock.querySelector('.quiz__body > .quiz__question') &&
  !!quizBlock.querySelector('.quiz__body > .quiz__options'));
check('nothing outside the summary is a direct child of the disclosure',
  [...quizBlock.children].every((el) => el.matches('.quiz__summary, .quiz__body')),
  [...quizBlock.children].map((el) => el.className).join('|'));
check('clicking the summary opens the quiz', (() => {
  try { quizBlock.querySelector('summary').click(); return quizBlock.open === true; }
  catch (e) { return false; }
})());
check('clicking the summary again closes it', (() => {
  try { quizBlock.querySelector('summary').click(); return quizBlock.open === false; }
  catch (e) { return false; }
})());
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

/* ── the people added to the data render like the original entry ── */
await goto('#/object/people/arkadz-migdal');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'migdal card');
check('an added person page shows the heading',
  card.querySelector('.page__title').textContent === 'Аркадзь Мігдал',
  card.querySelector('.page__title').textContent);
check('an added person page has the full description',
  card.querySelectorAll('.object-card__text p').length >= 4,
  String(card.querySelectorAll('.object-card__text p').length));
check('an added person page builds a four-option quiz',
  card.querySelectorAll('.quiz__option').length === 4,
  String(card.querySelectorAll('.quiz__option').length));
/* the old recordings belong to the Belarusian objects only, and a record
   without audio must leave no player and no placeholder behind */
check('an added person page builds no audio player',
  !card.querySelector('.object-card__audio-player'));

/* ── a second photo turns the hero image into a carousel ── */
const taulaj = JSON.parse(read('data/people.json')).find((p) => p.id === 'valiancin-taulai');
const slides = 1 + taulaj.gallery.length;

await goto('#/object/people/valiancin-taulai');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && c.querySelector('.gallery__track') ? c : null;
}, 'taulaj carousel');
check('a record with extra photos builds the carousel',
  card.querySelectorAll('.gallery__image').length === slides,
  `${card.querySelectorAll('.gallery__image').length} of ${slides} slides`);
check('a carousel replaces the single hero image',
  !card.querySelector('.object-card__image'));
check('the carousel builds one dot per photo',
  card.querySelectorAll('.gallery__dot').length === slides,
  String(card.querySelectorAll('.gallery__dot').length));
check('the first dot is marked current',
  card.querySelector('.gallery__dot').getAttribute('aria-current') === 'true');
check('the other dots are not marked current',
  [...card.querySelectorAll('.gallery__dot')].slice(1)
    .every((d) => d.getAttribute('aria-current') === null));
check('every carousel photo carries its own alt text',
  new Set([...card.querySelectorAll('.gallery__image')].map((i) => i.alt)).size === slides);
check('carousel photos point at the files named in the data',
  [...card.querySelectorAll('.gallery__image')].every((img, i) =>
    img.getAttribute('src').endsWith((i === 0 ? taulaj.image : taulaj.gallery[i - 1]).replace('../', ''))),
  [...card.querySelectorAll('.gallery__image')].map((i) => i.getAttribute('src')).join(' '));
check('clicking a carousel dot does not throw', (() => {
  try { card.querySelectorAll('.gallery__dot')[1].click(); return true; } catch (e) { return false; }
})());
check('the carousel builds a previous and a next arrow',
  !!card.querySelector('.gallery__arrow--prev') && !!card.querySelector('.gallery__arrow--next'));
check('both arrows carry an accessible label',
  [...card.querySelectorAll('.gallery__arrow')].every((a) => (a.getAttribute('aria-label') || '').length > 3),
  [...card.querySelectorAll('.gallery__arrow')].map((a) => a.getAttribute('aria-label')).join(' / '));
check('both arrows are real buttons',
  [...card.querySelectorAll('.gallery__arrow')].every((a) => a.tagName === 'BUTTON' && a.type === 'button'));
check('the arrows float outside the swipeable track',
  !card.querySelector('.gallery__track .gallery__arrow') &&
  card.querySelectorAll('.gallery__viewport > .gallery__arrow').length === 2);
check('the first slide cannot go back',
  card.querySelector('.gallery__arrow--prev').disabled === true);
check('the first slide can still go forward',
  card.querySelector('.gallery__arrow--next').disabled === false);
check('clicking an arrow does not throw', (() => {
  try { card.querySelector('.gallery__arrow--next').click(); return true; } catch (e) { return false; }
})());

/* a record with a single photo keeps the plain <img> it always had */
await goto('#/object/people/pola-raksa');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'raksa card');
check('a single-photo record builds no carousel',
  !card.querySelector('.gallery__track') && !!card.querySelector('.object-card__image'));

/* ── lists and sections stay quiz-free ── */
await goto('#/people');
await waitFor(() => doc.querySelectorAll('.list-item').length, 'people list');
check('every person in the data file becomes a list row',
  doc.querySelectorAll('.list-item').length === JSON.parse(read('data/people.json')).length,
  String(doc.querySelectorAll('.list-item').length));

/* a photo that will not load must not fall back to a picture of something
   else — the row shows the first letter of its own title instead */
doc.querySelector('.list-item .list-item__image').dispatchEvent(new window.Event('error'));
const monogram = doc.querySelector('.list-item .list-item__monogram');
check('a failed photo is replaced by a monogram', !!monogram);
check('the monogram shows the first letter of the title',
  monogram.textContent ===
    doc.querySelector('.list-item .list-item__title').textContent.trim().charAt(0).toUpperCase(),
  monogram.textContent);
check('the monogram keeps the round thumbnail box',
  monogram.classList.contains('list-item__image'));
check('the monogram is hidden from assistive technology',
  monogram.getAttribute('aria-hidden') === 'true');
check('the monogram is tinted with the section colour',
  /#5cb85c|rgb\(92,\s*184,\s*92\)/i.test(monogram.style.background),
  monogram.style.background);
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

/* ── Safari-like chrome: hides on scroll down, returns on scroll up ── */
let scrollTop = 0;
const PAGE_H = 1600, VIEW_H = 768, MAX_SCROLL = PAGE_H - VIEW_H;
Object.defineProperty(window, 'scrollY', { configurable: true, get: () => scrollTop });
Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => VIEW_H });
/* jsdom has no real scroller: a stub makes both scrollToTop and the
   end-of-page clamp observable */
Object.defineProperty(doc, 'scrollingElement', {
  configurable: true,
  value: {
    scrollHeight: PAGE_H,
    get scrollTop() { return scrollTop; },
    set scrollTop(v) { scrollTop = v; },
  },
});
const scrollTo = async (y) => {
  scrollTop = y;
  window.dispatchEvent(new window.Event('scroll'));
  await tick(60);   /* the handler runs on requestAnimationFrame */
};
await scrollTo(600);
check('chrome hides after scrolling down', doc.body.classList.contains('chrome-hidden'));
await scrollTo(200);
check('chrome returns when scrolling back up', !doc.body.classList.contains('chrome-hidden'));

/* ── a fling that lands at the bottom must not pop the chrome back in ── */
await scrollTo(MAX_SCROLL);
check('chrome stays hidden at the end of the page',
  doc.body.classList.contains('chrome-hidden'));
await scrollTo(MAX_SCROLL + 90);   /* rubber-band overshoots past the end */
await scrollTo(MAX_SCROLL);        /* and springs back */
check('the spring-back from the bottom is not read as a scroll up',
  doc.body.classList.contains('chrome-hidden'));
await scrollTo(MAX_SCROLL - 10);
check('a few pixels of upward drift keep the chrome hidden',
  doc.body.classList.contains('chrome-hidden'));
await scrollTo(MAX_SCROLL - 60);
check('a deliberate pull at the bottom reveals the chrome',
  !doc.body.classList.contains('chrome-hidden'));
await scrollTo(0);
check('the chrome is back on screen at the very top',
  !doc.body.classList.contains('chrome-hidden'));

await goto('#/sights');
await waitFor(() => doc.querySelectorAll('.list-item').length, 'sights list after scroll test');
check('a new view scrolls back to the top', scrollTop === 0, String(scrollTop));
check('a new view starts with the chrome visible', !doc.body.classList.contains('chrome-hidden'));

/* ── russian locale ── */
window.localStorage.setItem('lidagid_lang', 'ru');
await goto('#/object/sights/lidski-zamak');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'ru card');
/* The Belarusian recordings have no ru/en translations yet, so the Russian
   page must show no player and no placeholder text. */
check('no audio player in the russian locale', !card.querySelector('audio'));
check('no empty audio wrap in the russian locale', !card.querySelector('.object-card__audio-wrap'));
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
/* a sight that does have a Belarusian recording: the English page must still
   show no player, proving the locales do not share the Belarusian files */
await goto('#/object/sights/lidski-zamak');
card = await waitFor(() => {
  const c = doc.getElementById('objectCard');
  return c && !c.hidden ? c : null;
}, 'en castle card');
check('no audio player in the english locale', !card.querySelector('audio'));

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
