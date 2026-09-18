/* ============================================================
   app.js — LidaGid Single-Page Application
   Matches original MPA visual design exactly.
   Welcome screen is separate welcome.html.
   ============================================================ */

(function () {
  'use strict';

  const SOURCES = ['sights', 'enterprises', 'people'];

  const META = {
    sights:      { color: '#f5a623', titleKey: 'sightsTitle'      },
    enterprises: { color: '#4a90d9', titleKey: 'enterprisesTitle' },
    people:      { color: '#5cb85c', titleKey: 'peopleTitle'      },
  };

  let _map    = null;
  let _back   = null;
  const _cache = Object.create(null);

  /* ── Helpers ── */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* Fix: data files use "../assets/…" paths (written for html/ subfolder).
     In the SPA served from root they must be "./assets/…". */
  function fixPath(p) { return p ? p.replace(/^\.\.\//, './') : ''; }

  /* The first letter or digit of a title — the glyph an object without a
     photo shows instead. */
  function firstGlyph(text) {
    const found = String(text || '').match(/[\p{L}\p{N}]/u);
    return found ? found[0].toUpperCase() : '?';
  }

  /* ── Toast (non-blocking status message) ── */
  let _toastTimer = null;
  function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('toast--visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => toast.classList.remove('toast--visible'), 2600);
  }

  /* ============================================================
     SCROLL-AWARE CHROME (Safari-like)
     The floating controls (back / share / language) slide away while
     the page scrolls down and reappear on the first deliberate upward
     scroll, so they never cover the content. `scroll` fires very often,
     so the work is throttled with requestAnimationFrame.
  ============================================================ */
  const CHROME_HIDE_AFTER  = 80;   /* stay visible near the top of the page */
  const CHROME_HIDE_STEP   = 6;    /* ignore jitter / rubber-band offsets    */
  /* Hiding is cheap: the controls are in the way as soon as the page moves.
     Coming back has to be deliberate. A fling that lands at the bottom of the
     page springs back a little (iOS rubber-band, and Safari also resizes its
     own toolbars there), and that spring-back looks like "the user scrolled
     up" — which used to pop the chrome straight back in. */
  const CHROME_REVEAL_STEP = 40;

  let _lastScrollY     = 0;
  let _deepestScrollY  = 0;
  let _scrollScheduled = false;

  /* How far the page can actually scroll. Overscroll reports positions past
     the real end of the page. Under test stubs the metrics are missing, and
     skipping the clamp there keeps the plain up/down behaviour intact. */
  function maxScrollY() {
    const scroller = document.scrollingElement || document.documentElement;
    const total    = scroller.scrollHeight;
    const view     = window.innerHeight;
    if (!Number.isFinite(total) || !Number.isFinite(view) || total <= 0 || view <= 0) {
      return Infinity;
    }
    return Math.max(0, total - view);
  }

  function applyScrollChrome() {
    _scrollScheduled = false;
    const y = window.scrollY || window.pageYOffset || 0;

    /* Clamping the remembered depth to the end of the page means a bounce
       past that point never counts as ground gained, so settling back from
       it cannot be mistaken for a scroll upwards. */
    _deepestScrollY = Math.min(Math.max(_deepestScrollY, y), maxScrollY());

    /* An open dropdown or share modal owns the screen: leave the chrome
       where it is until it is dismissed. */
    if (document.body.classList.contains('share-open') ||
        document.querySelector('.lang-switcher--open')) {
      _lastScrollY = y;
      return;
    }

    /* At the top of the page the chrome always belongs on screen. */
    if (y <= CHROME_HIDE_AFTER) {
      _lastScrollY    = y;
      _deepestScrollY = y;
      document.body.classList.remove('chrome-hidden');
      return;
    }

    const delta = y - _lastScrollY;

    if (delta >= CHROME_HIDE_STEP) {
      if (!document.body.classList.contains('chrome-hidden')) {
        /* a control scrolled off the screen must not keep keyboard focus */
        const active = document.activeElement;
        const chrome = document.querySelector('.top-chrome');
        if (active && ((chrome && chrome.contains(active)) || (_back && _back.contains(active)))) {
          active.blur();
        }
        document.body.classList.add('chrome-hidden');
      }
      _lastScrollY = y;
      return;
    }

    /* Upward movement below the threshold is not dropped, it accumulates in
       `delta` (which is why _lastScrollY stays put), and the reveal itself is
       measured from the deepest point reached rather than from the previous
       event — so a twitch of a few pixels changes nothing. */
    if (delta <= -CHROME_HIDE_STEP && _deepestScrollY - y >= CHROME_REVEAL_STEP) {
      _lastScrollY = y;
      document.body.classList.remove('chrome-hidden');
    }
  }

  function onScroll() {
    if (_scrollScheduled) return;
    _scrollScheduled = true;
    requestAnimationFrame(applyScrollChrome);
  }

  /* Every view starts at the top with the chrome on screen. */
  function resetScrollChrome() {
    _lastScrollY    = window.scrollY || window.pageYOffset || 0;
    _deepestScrollY = _lastScrollY;
    document.body.classList.remove('chrome-hidden');
  }

  /* Hash navigation keeps the old scroll offset, which used to open an
     object page halfway down when the link was tapped at the end of a
     long list. */
  function scrollToTop() {
    const scroller = document.scrollingElement || document.documentElement;
    if (scroller) scroller.scrollTop = 0;
  }

  /* ============================================================
     QUIZ PROGRESS — stored in localStorage, no backend needed.
     Entries are "<source>/<id>" so ids stay unique across files.
     Quizzes live on object pages only, so the record is used there
     to restore an already answered quiz and nowhere else.
  ============================================================ */
  const QUIZ_KEY = 'lidagid_quiz_progress';

  function quizDoneList() {
    try {
      const list = JSON.parse(localStorage.getItem(QUIZ_KEY) || '[]');
      return Array.isArray(list) ? list.filter(k => typeof k === 'string') : [];
    } catch (e) { return []; }
  }

  function quizIsDone(source, id) { return quizDoneList().includes(`${source}/${id}`); }

  function quizMarkDone(source, id) {
    const list = quizDoneList();
    const key  = `${source}/${id}`;
    if (list.includes(key)) return;
    list.push(key);
    try { localStorage.setItem(QUIZ_KEY, JSON.stringify(list)); } catch (e) {}
  }

  /* ============================================================
     SHARE — round icon button in the top-right chrome, left of the
     language switcher. It opens a modal with a locally generated QR
     code (no CDN, no backend) plus the usual share targets.
     Everything here only reads the current URL, so sharing works
     offline too.
  ============================================================ */
  const SHARE_ICON = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.8"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="17.5" cy="5" r="2.6"/>
      <circle cx="6.5" cy="12" r="2.6"/>
      <circle cx="17.5" cy="19" r="2.6"/>
      <line x1="8.9" y1="10.7" x2="15.1" y2="6.3"/>
      <line x1="8.9" y1="13.3" x2="15.1" y2="17.7"/>
    </svg>`;

  const CLOSE_ICON = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <line x1="6" y1="6" x2="18" y2="18"/>
      <line x1="18" y1="6" x2="6" y2="18"/>
    </svg>`;

  const LINK_ICON = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
      <path d="M10.6 13.4a4 4 0 0 0 5.6 0l2.6-2.6a4 4 0 1 0-5.6-5.6l-1 1"/>
      <path d="M13.4 10.6a4 4 0 0 0-5.6 0l-2.6 2.6a4 4 0 1 0 5.6 5.6l1-1"/>
    </svg>`;

  const NATIVE_SHARE_ICON = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="#fff" stroke-width="1.7" stroke-linecap="round"
         stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v11"/>
      <path d="m7.8 7.2 4.2-4.2 4.2 4.2"/>
      <path d="M5.5 12.5v6a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-6"/>
    </svg>`;

  /* Carousel arrows — same stroke language as the icons above. */
  const CHEVRON_ICONS = {
    prev: `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>
      </svg>`,
    next: `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>
      </svg>`,
    down: `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m5.5 9.5 6.5 6.5 6.5-6.5"/>
      </svg>`,
  };

  /* Material-design handset, reused by the Viber and WhatsApp icons. */
  const PHONE_PATH = 'M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24' +
    ' 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5' +
    'c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z';

  /* Share targets of the modal. Network names are proper nouns and
     stay untranslated; only the accessible label is localized. */
  const SHARE_NETWORKS = [
    {
      id: 'telegram', name: 'Telegram', color: '#2aabee',
      href: (url, title) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      icon: (c) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="#fff" d="M21.9 4.1 3 11.5c-.9.3-.9 1.4 0 1.7l4.5 1.5 1.7 5.1c.2.7 1.1.9 1.6.3l2.3-2.4 4.7 3.5c.6.4 1.4.1 1.5-.6l3.3-15.1c.2-.9-.6-1.6-1.4-1.4Z"/>
        <path fill="${c}" d="m9.7 14.3 8.6-6.1-7 7-.3 3.2z"/>
      </svg>`,
    },
    {
      id: 'viber', name: 'Viber', color: '#7360f2',
      href: (url, title) => `viber://forward?text=${encodeURIComponent(title + ' ' + url)}`,
      icon: () => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="#fff" d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
      </svg>`,
    },
    {
      id: 'whatsapp', name: 'WhatsApp', color: '#25d366',
      href: (url, title) => `https://api.whatsapp.com/send?text=${encodeURIComponent(title + ' ' + url)}`,
      icon: (c) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="#fff" d="M12 2.9a9.1 9.1 0 0 0-7.8 13.6L2.8 21.2l4.8-1.3A9.1 9.1 0 1 0 12 2.9Z"/>
        <g transform="translate(4.7 4.7) scale(0.61)"><path fill="${c}" d="${PHONE_PATH}"/></g>
      </svg>`,
    },
    {
      id: 'vk', name: 'VK', color: '#4c75a3',
      href: (url, title) => `https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
      icon: () => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <text x="12" y="16.4" text-anchor="middle" font-family="Roboto, Arial, sans-serif"
              font-size="10.5" font-weight="700" fill="#fff">VK</text>
      </svg>`,
    },
    {
      id: 'facebook', name: 'Facebook', color: '#1877f2',
      href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      icon: () => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <text x="12" y="17.4" text-anchor="middle" font-family="Roboto, Arial, sans-serif"
              font-size="16" font-weight="700" fill="#fff">f</text>
      </svg>`,
    },
    {
      id: 'x', name: 'X', color: '#10151c',
      href: (url, title) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
      icon: () => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="#fff" d="M4.4 3.5h4.4l3.9 5.4 4.5-5.4h2.5l-6 7.1 6.4 9.9h-4.4l-4.2-5.7-4.8 5.7H4.2l6.4-7.6z"/>
      </svg>`,
    },
    {
      id: 'email', name: 'E-mail', color: '#58627a',
      href: (url, title) => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}`,
      icon: () => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <rect x="3" y="5.5" width="18" height="13" rx="2.5" fill="none" stroke="#fff" stroke-width="1.7"/>
        <path d="M4.6 7.4 12 12.8l7.4-5.4" fill="none" stroke="#fff" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ];

  let _shareModal  = null;
  let _shareButton = null;

  function buildShareButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'share-button';
    btn.innerHTML = SHARE_ICON;   /* static markup, no user data */
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', I18N.t('shareAria'));
    btn.setAttribute('title', I18N.t('share'));
    btn.addEventListener('click', () => openShareModal(btn));
    _shareButton = btn;
    return btn;
  }

  function ensureShareModal() {
    if (_shareModal) return _shareModal;

    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.hidden = true;

    const backdrop = document.createElement('div');
    backdrop.className = 'share-modal__backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'share-modal__dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'shareModalLabel');

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'share-modal__close';
    close.innerHTML = CLOSE_ICON;

    const qr = document.createElement('div');
    qr.className = 'share-modal__qr';

    const hint = document.createElement('p');
    hint.className = 'share-modal__hint';

    const divider = document.createElement('hr');
    divider.className = 'share-modal__divider';

    const label = document.createElement('h2');
    label.className = 'share-modal__label';
    label.id = 'shareModalLabel';

    const socials = document.createElement('div');
    socials.className = 'share-modal__socials';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'share-modal__copy';
    copy.innerHTML = LINK_ICON;
    const copyText = document.createElement('span');
    copyText.className = 'share-modal__copy-label';
    copy.appendChild(copyText);
    copy.addEventListener('click', async () => {
      try {
        await copyToClipboard(location.href);
        closeShareModal();
        showToast(I18N.t('linkCopied'));
      } catch (e) {
        showToast(I18N.t('shareFailed'));
      }
    });

    dialog.append(close, qr, hint, divider, label, socials, copy);
    modal.append(backdrop, dialog);
    document.body.appendChild(modal);

    backdrop.addEventListener('click', closeShareModal);
    close.addEventListener('click', closeShareModal);

    _shareModal = modal;
    return modal;
  }

  /* Rebuilt on every open, so the QR code, the share targets and all
     labels always describe the page the user is looking at right now. */
  function fillShareModal(modal) {
    const url   = location.href;   /* already contains #/object/<source>/<id> */
    const title = document.title;

    modal.querySelector('.share-modal__close').setAttribute('aria-label', I18N.t('shareClose'));
    modal.querySelector('.share-modal__hint').textContent = I18N.t('qrHint');
    modal.querySelector('.share-modal__label').textContent = I18N.t('shareTo');
    modal.querySelector('.share-modal__copy-label').textContent = I18N.t('shareCopyLink');

    const qr = modal.querySelector('.share-modal__qr');
    qr.innerHTML = '';
    const svg = qrSvg(url);
    if (svg) {
      qr.innerHTML = svg;   /* markup produced locally by js/vendor/qrcode.js */
    } else {
      const p = document.createElement('p');
      p.className = 'share-modal__error';
      p.textContent = I18N.t('qrUnavailable');
      qr.appendChild(p);
    }

    const socials = modal.querySelector('.share-modal__socials');
    socials.innerHTML = '';
    SHARE_NETWORKS.forEach(net => {
      const a = document.createElement('a');
      a.className = 'share-social';
      a.href = net.href(url, title);
      if (net.id !== 'email') {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.setAttribute('aria-label', I18N.t('shareToNetwork', { network: net.name }));

      const icon = document.createElement('span');
      icon.className = 'share-social__icon';
      icon.style.background = net.color;
      icon.innerHTML = net.icon(net.color);   /* static markup, no user data */

      const name = document.createElement('span');
      name.className = 'share-social__name';
      name.textContent = net.name;

      a.append(icon, name);
      socials.appendChild(a);
    });

    /* The system share sheet (Android, iOS, some desktops) is offered as
       one more target whenever the browser supports it. */
    if (navigator.share) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'share-social share-social--native';
      more.setAttribute('aria-label', I18N.t('shareMore'));
      more.addEventListener('click', async () => {
        try {
          await navigator.share({ title, url });
          closeShareModal();
        } catch (e) { /* dismissed by the user or unavailable */ }
      });

      const icon = document.createElement('span');
      icon.className = 'share-social__icon';
      icon.style.background = '#1a2233';
      icon.innerHTML = NATIVE_SHARE_ICON;

      const name = document.createElement('span');
      name.className = 'share-social__name';
      name.textContent = I18N.t('shareMore');

      more.append(icon, name);
      socials.appendChild(more);
    }
  }

  function openShareModal(trigger) {
    const modal = ensureShareModal();
    fillShareModal(modal);
    modal.hidden = false;
    document.body.classList.add('share-open');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    modal.querySelector('.share-modal__close').focus();
    document.addEventListener('keydown', onShareKeydown);
  }

  function closeShareModal() {
    if (!_shareModal || _shareModal.hidden) return;
    _shareModal.hidden = true;
    document.body.classList.remove('share-open');
    document.removeEventListener('keydown', onShareKeydown);
    if (_shareButton) {
      _shareButton.setAttribute('aria-expanded', 'false');
      /* on the home screen the button is hidden and cannot take focus */
      if (!_shareButton.hidden) _shareButton.focus();
    }
  }

  /* Escape closes the modal, Tab is kept inside it. */
  function onShareKeydown(e) {
    if (!_shareModal || _shareModal.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); closeShareModal(); return; }
    if (e.key !== 'Tab') return;

    const items = _shareModal.querySelectorAll('button, a[href]');
    if (!items.length) return;
    const first = items[0];
    const last  = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    /* Fallback for older browsers and non-secure origins */
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    if (!ok) throw new Error('copy failed');
  }

  /* The QR encodes the given URL and is generated locally (no CDN,
     no backend), so it keeps working without a network. */
  function qrSvg(text) {
    if (typeof qrcode !== 'function') return null;
    try {
      const qr = qrcode(0, 'M');   /* auto version, ~15% error correction */
      qr.addData(text, 'Byte');
      qr.make();
      return qr.createSvgTag({
        cellSize: 4,
        margin: 8,
        scalable: true,
        title: I18N.t('qrTitle'),
        alt: I18N.t('qrAlt'),
      });
    } catch (e) { return null; }
  }

  /* ── Router ── */
  function parseRoute() {
    const hash = location.hash.replace(/^#\/?/, '').trim();
    if (!hash) return { view: 'home' };
    const parts = hash.split('/');
    if (parts[0] === 'object' && SOURCES.includes(parts[1]) && parts[2])
      return { view: 'object', source: parts[1], id: decodeURIComponent(parts[2]) };
    if (SOURCES.includes(parts[0]))
      return { view: 'section', name: parts[0] };
    return { view: 'home' };
  }

  function navigate(route) {
    killMap();
    const app = document.getElementById('app');
    if (!app) return;
    /* chrome first: the share button disappears on the home screen, and the
       modal must not try to restore focus onto a hidden button */
    updateChrome(route);
    closeShareModal();
    if      (route.view === 'section') renderSection(app, route.name);
    else if (route.view === 'object')  renderObject(app, route.source, route.id);
    else                               renderHome(app);

    /* a new view always starts at the top, with the chrome on screen */
    scrollToTop();
    resetScrollChrome();
  }

  /* ── Chrome ── */
  function updateChrome(route) {
    if (!_back) return;
    const isHome = route.view === 'home';
    _back.hidden = isHome;
    /* Nothing to share on the start screen, so the button is hidden there. */
    if (_shareButton) _shareButton.hidden = isHome;
    if (!isHome) {
      _back.textContent = I18N.t('back');
      _back.href = route.view === 'object' ? `#/${route.source}` : '#/';
    }
  }

  /* ── Data ── */
  async function loadData(source) {
    const file = I18N.dataFile(source);
    const key  = `${source}/${file}`;
    if (_cache[key]) return _cache[key];
    const res = await fetch(`./data/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    _cache[key] = data;
    return data;
  }

  /* ============================================================
     HOME
  ============================================================ */
  function renderHome(app) {
    document.title = I18N.t('appTitle');
    document.documentElement.lang = I18N.get();

    app.innerHTML = `
      <div class="page">
        <header class="page__header">
          <h1 class="page__title" id="appTitle">${esc(I18N.t('appTitle'))}</h1>
        </header>
        <section class="card-grid" aria-label="${esc(I18N.t('appTitle'))}">
          <a href="#/sights" class="card">
            <div class="card__bg" style="background-image: url('./assets/images/lidski-zamak.jpg')"></div>
            <h2 class="card__title">${esc(I18N.t('sights'))}</h2>
          </a>
          <a href="#/enterprises" class="card">
            <div class="card__bg" style="background-image: url('./assets/images/maloczny-zavod.jpg')"></div>
            <h2 class="card__title">${esc(I18N.t('enterprises'))}</h2>
          </a>
          <a href="#/people" class="card">
            <div class="card__bg" style="background-image: url('./assets/images/arkadz-migdal.jpg')"></div>
            <h2 class="card__title">${esc(I18N.t('people'))}</h2>
          </a>
        </section>
      </div>
      <div id="map-root" class="map-section" data-sources="sights enterprises people" data-root="."></div>
    `;

    initMap('map-root', SOURCES);
  }

  /* ============================================================
     SECTION LIST
  ============================================================ */
  async function renderSection(app, name) {
    const meta = META[name];
    if (!meta) { renderHome(app); return; }

    document.title = `${I18N.t(meta.titleKey)} ${I18N.t('pageTitle')}`;
    document.documentElement.lang = I18N.get();

    app.innerHTML = `
      <div class="page page--section">
        <header class="page__header">
          <h1 class="page__title">${esc(I18N.t(meta.titleKey))}</h1>
        </header>
        <div id="status" class="status" role="status" aria-live="polite">
          ${esc(I18N.t('loading'))}
        </div>
        <section id="list" class="card-grid card-grid--${esc(name)}" aria-label="${esc(I18N.t(meta.titleKey))}"></section>
      </div>
      <div id="map-root" class="map-section map-section--section"></div>
    `;

    try {
      const items = await loadData(name);
      renderList(items, name, meta);
    } catch {
      /* Fix #8: error shown in UI */
      const st = document.getElementById('status');
      if (st) { st.textContent = I18N.t('errorLoad'); st.className = 'status status--error'; }
    }
    initMap('map-root', [name]);
  }

  function renderList(data, source, meta) {
    const status = document.getElementById('status');
    const list   = document.getElementById('list');
    if (!status || !list) return;

    const items = data.filter(i => i.id && i.title);
    if (!items.length) {
      status.textContent = I18N.t('empty');
      status.className   = 'status status--empty';
      return;
    }
    status.style.display = 'none';

    /* A row without a photo gets the first letter of its own title rather
       than a stand-in picture of a different object: a real photograph of
       the wrong thing reads as a mistake, a monogram reads as a choice. */
    const makeMonogram = (title) => {
      const box = document.createElement('span');
      box.className = 'list-item__image list-item__monogram';
      box.setAttribute('aria-hidden', 'true');
      if (meta.color) box.style.background = meta.color;
      box.textContent = firstGlyph(title);
      return box;
    };

    const makeThumb = (item) => {
      const img     = document.createElement('img');
      img.className = 'list-item__image';
      img.src       = fixPath(item.image);
      img.alt       = item.title;
      img.loading   = 'lazy';
      /* A file that will not load must not leave a hole in the row either. */
      img.onerror   = () => img.replaceWith(makeMonogram(item.title));
      return img;
    };

    items.forEach(item => {
      const a = document.createElement('a');
      /* Fix #3: no &lang= param — language handled by localStorage only */
      a.href      = `#/object/${encodeURIComponent(source)}/${encodeURIComponent(item.id)}`;
      a.className = 'list-item';

      const body      = document.createElement('div');
      body.className  = 'list-item__body';

      const title     = document.createElement('h2');
      title.className   = 'list-item__title';
      title.textContent = item.title;

      body.appendChild(title);
      a.append(item.image ? makeThumb(item) : makeMonogram(item.title), body);

      list.appendChild(a);
    });
  }

  /* ============================================================
     OBJECT DETAIL
  ============================================================ */
  async function renderObject(app, source, id) {
    if (!SOURCES.includes(source)) { renderHome(app); return; }
    document.documentElement.lang = I18N.get();

    app.innerHTML = `
      <div class="page page--object">
        <div id="status" class="status" role="status" aria-live="polite">
          ${esc(I18N.t('loadingObj'))}
        </div>
        <article id="objectCard" class="object-card" hidden></article>
      </div>
    `;

    let obj = null;
    try {
      const items = await loadData(source);
      obj = items.find(i => i.id === id) || null;
    } catch {
      showError(I18N.t('errorObj')); return;
    }

    if (!obj) { showError(I18N.t('errorNotFound')); return; }
    populateObject(obj, source);
  }

  function populateObject(obj, source) {
    const status = document.getElementById('status');
    const card   = document.getElementById('objectCard');
    if (!status || !card) return;

    document.title = `${obj.title} ${I18N.t('pageTitle')}`;

    /* Title */
    const h1 = document.createElement('h1');
    h1.className   = 'page__title';
    h1.textContent = obj.title || I18N.t('noTitle');  /* Fix #4: all 3 langs via i18n key */

    /* Hero photo(s) — a record with a "gallery" array turns into a photo
       carousel; a single-photo record keeps the plain <img> it always had. */
    const shots = [obj.image, ...(Array.isArray(obj.gallery) ? obj.gallery : [])].filter(Boolean);
    if (shots.length > 1) {
      card.appendChild(buildGallery(shots, obj.title));
    } else if (shots.length === 1) {
      const img        = document.createElement('img');
      img.className    = 'object-card__image';
      img.src          = fixPath(shots[0]);
      img.alt          = obj.title;
      card.appendChild(img);
    }

    card.appendChild(h1);

    /*
     * Audio — each locale points at its own recording: the path comes from
     * the language-specific data file, so sights.ru.json uses
     * "…/lidski-zamak.ru.mp3" while the English one uses "….en.mp3".
     * A record without an "audio" field simply gets no player at all — the
     * wrap stays empty and is not added to the card, so nothing is shown.
     * MP3 only: it plays in every browser including Safari/iOS, so keeping a
     * second copy in another codec would only duplicate every recording.
     * Fix #9: src set via DOM property, not innerHTML injection
     * Fix #12: controlslist="nodownload" kept (Chrome-only, harmless elsewhere)
     */
    if (obj.audio) {
      const audioWrap = document.createElement('div');
      audioWrap.className = 'object-card__audio-wrap';

      const audio = document.createElement('audio');
      audio.className = 'object-card__audio-player';
      audio.controls  = true;
      audio.setAttribute('controlslist', 'nodownload');

      const src = document.createElement('source');
      src.type = 'audio/mpeg';
      src.src  = fixPath(obj.audio);

      audio.append(src, document.createTextNode(I18N.t('audioNotSupported')));
      audioWrap.appendChild(audio);
      card.appendChild(audioWrap);
    }

    /* Description — trusted CMS HTML, intentional innerHTML */
    const desc = document.createElement('div');
    desc.className = 'object-card__text';
    desc.innerHTML = obj.description || I18N.t('noDesc');
    card.appendChild(desc);

    /* Mini quiz — optional field, records without it are simply skipped */
    const quiz = buildQuiz(obj, source);
    if (quiz) card.appendChild(quiz);

    status.style.display = 'none';
    card.hidden = false;
  }

  /*
   * Photo carousel for records that carry more than one picture.
   *
   * Built on native CSS scroll-snap rather than a JS transform slider: the
   * swipe then comes from the browser itself, so momentum scrolling, RTL and
   * touch all behave the way the platform expects. Every slide is exactly
   * one track wide, which keeps track.scrollLeft -> slide index arithmetic
   * exact and removes the need for any layout measurement.
   */
  function buildGallery(paths, title) {
    const total = paths.length;

    const wrap = document.createElement('div');
    wrap.className = 'gallery';

    /* The arrows float over the photo, so they need a positioning context of
       their own: a child of the track would slide away with the picture. */
    const viewport = document.createElement('div');
    viewport.className = 'gallery__viewport';

    const track = document.createElement('div');
    track.className = 'gallery__track';
    track.tabIndex  = 0;
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', I18N.t('galleryLabel', { total }));

    paths.forEach((path, i) => {
      const img       = document.createElement('img');
      img.className   = 'gallery__image';
      img.src         = fixPath(path);
      img.alt         = I18N.t('galleryAlt', { title, n: i + 1, total });
      img.loading     = i === 0 ? 'eager' : 'lazy';
      img.decoding    = 'async';
      img.draggable   = false;
      track.appendChild(img);
    });

    const dots = document.createElement('div');
    dots.className = 'gallery__dots';

    let shown = -1;

    /* scroll-behavior comes from the stylesheet, so the reduced-motion
       block can switch the animation off without any JS branch. */
    const goTo = (i) => {
      track.scrollLeft = track.clientWidth * Math.max(0, Math.min(total - 1, i));
    };

    const dotButtons = paths.map((_, i) => {
      const dot = document.createElement('button');
      dot.type      = 'button';
      dot.className = 'gallery__dot';
      dot.setAttribute('aria-label', I18N.t('galleryGoTo', { n: i + 1, total }));
      dot.addEventListener('click', () => goTo(i));
      dots.appendChild(dot);
      return dot;
    });

    const makeArrow = (kind, labelKey) => {
      const arrow = document.createElement('button');
      arrow.type      = 'button';
      arrow.className = `gallery__arrow gallery__arrow--${kind}`;
      arrow.innerHTML = CHEVRON_ICONS[kind];   /* static markup, no user data */
      arrow.setAttribute('aria-label', I18N.t(labelKey));
      return arrow;
    };

    const prev = makeArrow('prev', 'galleryPrev');
    const next = makeArrow('next', 'galleryNext');
    prev.addEventListener('click', () => goTo(shown - 1));
    next.addEventListener('click', () => goTo(shown + 1));

    const sync = () => {
      const width = track.clientWidth || 1;
      const index = Math.max(0, Math.min(total - 1, Math.round(track.scrollLeft / width)));
      if (index === shown) return;
      shown = index;
      dotButtons.forEach((dot, i) => {
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
      /* The arrows also carry the "there is more this way" cue, so they stay
         in place at the ends and merely fade out instead of disappearing. */
      prev.disabled = index === 0;
      next.disabled = index === total - 1;
    };

    track.addEventListener('scroll', sync, { passive: true });
    track.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      goTo(shown + step);
    });

    viewport.append(track, prev, next);
    wrap.append(viewport, dots);
    sync();
    return wrap;
  }

  function buildQuiz(obj, source) {
    const quiz = obj.quiz;
    if (!quiz || !Array.isArray(quiz.options) || !quiz.options.length) return null;

    const correctIndex = Number.isInteger(quiz.correctIndex) ? quiz.correctIndex : 0;

    /* <details> rather than a button plus a hidden panel: the toggle, the
       keyboard handling and the screen-reader semantics then come from the
       browser, and the quiz still opens if the script never runs. */
    const block = document.createElement('details');
    block.className = 'quiz';

    const summary = document.createElement('summary');
    summary.className = 'quiz__summary';

    const title = document.createElement('h2');
    title.className = 'quiz__title';
    title.textContent = I18N.t('quizTitle');

    const chevron = document.createElement('span');
    chevron.className = 'quiz__chevron';
    chevron.innerHTML = CHEVRON_ICONS.down;   /* static markup, no user data */

    summary.append(title, chevron);

    /* Everything below the title sits in one wrapper, so the panel stays a
       plain flex column and the container itself can remain a block — a
       non-block display on <details> breaks the disclosure in Safari. */
    const body = document.createElement('div');
    body.className = 'quiz__body';

    const question = document.createElement('p');
    question.className = 'quiz__question';
    question.textContent = quiz.question || '';

    const options = document.createElement('div');
    options.className = 'quiz__options';
    options.setAttribute('role', 'group');
    options.setAttribute('aria-label', quiz.question || I18N.t('quizTitle'));

    const feedback = document.createElement('p');
    feedback.className = 'quiz__feedback';
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');

    const explanation = document.createElement('p');
    explanation.className = 'quiz__explanation';
    explanation.hidden = true;
    if (quiz.explanation) explanation.textContent = quiz.explanation;

    const buttons = quiz.options.map((option, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz__option';
      btn.textContent = option;
      btn.addEventListener('click', () => answer(index, true));
      options.appendChild(btn);
      return btn;
    });

    /* Applies the answered state; also used to restore an already passed quiz */
    function answer(index, userAction) {
      const isCorrect = index === correctIndex;
      buttons.forEach((btn, i) => {
        btn.disabled = true;
        btn.classList.toggle('quiz__option--correct', i === correctIndex);
        btn.classList.toggle('quiz__option--wrong',   i === index && !isCorrect);
        if (i === index) btn.setAttribute('aria-current', 'true');
      });

      feedback.classList.toggle('quiz__feedback--correct', isCorrect);
      feedback.classList.toggle('quiz__feedback--wrong', !isCorrect);
      feedback.textContent = isCorrect
        ? I18N.t('quizCorrect')
        : I18N.t('quizWrong') + ' ' + I18N.t('quizAnswer', { answer: quiz.options[correctIndex] });

      if (quiz.explanation) explanation.hidden = false;

      if (isCorrect && userAction) quizMarkDone(source, obj.id);
    }

    if (quizIsDone(source, obj.id)) answer(correctIndex, false);

    body.append(question, options, feedback, explanation);
    block.append(summary, body);
    return block;
  }

  function showError(message) {
    const status = document.getElementById('status');
    if (!status) return;
    /* Fix #8: always visible in UI, never just thrown to console */
    status.className = 'status status--error';
    status.innerHTML = '';
    status.appendChild(document.createTextNode(message));
    status.appendChild(document.createElement('br'));
    status.appendChild(document.createElement('br'));
    const a = document.createElement('a');
    a.href = '#/'; a.textContent = I18N.t('errorGoHome');
    status.appendChild(a);
  }

  /* ============================================================
     MAP
  ============================================================ */
  function makeIcon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="#fff"/>
    </svg>`;
    return L.divIcon({ html: svg, className: '', iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38] });
  }

  function killMap() { if (_map) { _map.remove(); _map = null; } }

  function initMap(containerId, sources) {
    const el = document.getElementById(containerId);
    if (!el) return;

    /* Leaflet comes from a CDN: with no network the library is missing, so the
       map area is hidden instead of showing an empty box (known offline limit). */
    if (typeof L === 'undefined') { el.hidden = true; return; }

    _map = L.map(containerId, { zoomControl: true }).setView([53.8918, 25.3021], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_map);

    Promise.all(
      sources.map(src =>
        loadData(src)
          .then(items => ({ src, items }))
          .catch(() => ({ src, items: [] }))
      )
    ).then(results => {
      results.forEach(({ src, items }) => {
        const icon = makeIcon((META[src] || {}).color || '#4a90d9');
        items.forEach(item => {
          if (!item.lat || !item.lng) return;

          /* Popup built via DOM — no innerHTML with dynamic data */
          const popup = document.createElement('div');
          popup.className = 'map-popup';

          const imgSrc = fixPath(item.image || '');
          if (imgSrc) {
            const img = document.createElement('img');
            img.src = imgSrc; img.alt = item.title; img.className = 'map-popup__img';
            popup.appendChild(img);
          }

          /* Fix #3: no &lang= in URL */
          const lnk = document.createElement('a');
          lnk.href        = `#/object/${encodeURIComponent(src)}/${encodeURIComponent(item.id)}`;
          lnk.className   = 'map-popup__title';
          lnk.textContent = item.title;
          popup.appendChild(lnk);

          L.marker([item.lat, item.lng], { icon })
            .addTo(_map)
            .bindPopup(popup, { maxWidth: 220, className: 'map-popup-wrap' });
        });
      });
    });
  }

  /* ============================================================
     BOOTSTRAP
  ============================================================ */
  function init() {
    /* Top-right chrome: share button on the left of the language switcher */
    const chrome = document.createElement('div');
    chrome.className = 'top-chrome';
    chrome.appendChild(buildShareButton());
    chrome.appendChild(I18N.renderToggle());
    document.body.appendChild(chrome);

    _back           = document.createElement('a');
    _back.className = 'back-button';
    _back.href      = '#/';
    _back.hidden    = true;
    document.body.appendChild(_back);

    /* Safari-like chrome: hide the floating controls while the page is
       scrolled down, reveal them again on the first upward scroll. */
    window.addEventListener('scroll', onScroll, { passive: true });
    /* the SPA scrolls itself to the top on every route change */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    window.addEventListener('hashchange', () => navigate(parseRoute()));
    navigate(parseRoute());
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
