/* ============================================================
   app.js — LidaGid Single-Page Application
   Replaces: map.js, sections.js, object.js, html/*.html
   Router: hash-based  (#/  #/sights  #/object/sights/id)

   Bug fixes applied here:
     #2  — audio OGG + MP3 fallback (Safari/iOS)
     #3  — dead lang URL param removed; language from localStorage only
     #7  — everything in IIFE, no global namespace pollution
     #8  — no silent throw; all errors shown to user
     #9  — audio src set via DOM property, not innerHTML injection
     #10 — source comes from route parameter, no regex fragility
     #11 — per-section fallback images
     #12 — controlslist="nodownload" kept but commented (Chrome-only)
     #14 — :has() replaced with .has-back body class
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // CONSTANTS
  // ============================================================

  const SOURCES = ['sights', 'enterprises', 'people'];

  /* Fix #11: each section gets its own contextually appropriate fallback */
  const SECTION_META = {
    sights: {
      color:    '#f5a623',
      fallback: './assets/images/lidski-zamak.jpg',
      titleKey: 'sightsTitle',
    },
    enterprises: {
      color:    '#4a90d9',
      fallback: './assets/images/maloczny-zavod.jpg',
      titleKey: 'enterprisesTitle',
    },
    people: {
      color:    '#5cb85c',
      fallback: './assets/images/kamandzirovaczny.jpg',
      titleKey: 'peopleTitle',
    },
  };

  // ============================================================
  // STATE
  // ============================================================

  let _map     = null;   // active Leaflet instance — must be destroyed before re-rendering
  let _backBtn = null;   // single persistent back-button node
  const _cache = Object.create(null);  // keyed by "source/filename"

  // ============================================================
  // UTILITIES
  // ============================================================

  /**
   * Minimal HTML escaper for trusted-but-interpolated strings.
   * Used wherever we build HTML with template literals.
   */
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * The JSON data files store image/audio paths as "../assets/…"
   * because they were written for pages inside html/.
   * In the SPA (served from root) those paths must become "./assets/…".
   */
  function fixAssetPath(path) {
    if (!path) return '';
    return path.replace(/^\.\.\//, './');
  }

  // ============================================================
  // ROUTER
  // ============================================================

  function parseRoute() {
    const hash  = location.hash.replace(/^#\/?/, '').trim();
    if (!hash) return { view: 'home' };

    const parts = hash.split('/');

    if (parts[0] === 'object' && SOURCES.includes(parts[1]) && parts[2]) {
      return {
        view:   'object',
        source: parts[1],
        id:     decodeURIComponent(parts[2]),
      };
    }

    if (SOURCES.includes(parts[0])) {
      return { view: 'section', name: parts[0] };
    }

    return { view: 'home' };
  }

  function navigate(route) {
    destroyMap();

    const app = document.getElementById('app');
    if (!app) return;

    updateBackButton(route);

    switch (route.view) {
      case 'section': renderSection(app, route.name);           break;
      case 'object':  renderObject(app, route.source, route.id); break;
      default:        renderHome(app);
    }
  }

  // ============================================================
  // BACK BUTTON
  // Fix #14: use body class instead of :has() (avoids old-Firefox gap)
  // ============================================================

  function updateBackButton(route) {
    if (!_backBtn) return;

    const isHome = (route.view === 'home');
    _backBtn.hidden = isHome;
    document.body.classList.toggle('has-back', !isHome);

    if (!isHome) {
      _backBtn.textContent = I18N.t('back');
      // Navigate to logical parent: object → section, section → home
      const parent = route.view === 'object' ? `#/${route.source}` : '#/';
      _backBtn.href = parent;
    }
  }

  // ============================================================
  // DATA LAYER
  // ============================================================

  async function loadData(source) {
    const file = I18N.dataFile(source);
    const key  = `${source}/${file}`;          // Fix #3: no lang URL param needed
    if (_cache[key]) return _cache[key];

    const res = await fetch(`./data/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} loading ${file}`);

    const data = await res.json();
    _cache[key] = data;
    return data;
  }

  // ============================================================
  // HOME VIEW
  // ============================================================

  function renderHome(app) {
    document.title = I18N.t('appTitle');
    document.documentElement.lang = I18N.get();

    app.innerHTML = `
      <div class="page">
        <header class="page__header">
          <h1 class="page__title">${esc(I18N.t('appTitle'))}</h1>
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
            <div class="card__bg" style="background-image: url('./assets/images/kamandzirovaczny.jpg')"></div>
            <h2 class="card__title">${esc(I18N.t('people'))}</h2>
          </a>
        </section>
      </div>
      <div id="map-root" class="map-section" data-sources="sights enterprises people"></div>
    `;

    initMap('map-root', SOURCES);
  }

  // ============================================================
  // SECTION LIST VIEW
  // Fix #10: source comes directly from the route, no regex needed
  // ============================================================

  async function renderSection(app, name) {
    const meta = SECTION_META[name];
    if (!meta) { renderHome(app); return; }

    document.title = `${I18N.t(meta.titleKey)} ${I18N.t('pageTitle')}`;
    document.documentElement.lang = I18N.get();

    // Render the shell immediately so the user sees a loading indicator
    app.innerHTML = `
      <div class="page page--section">
        <header class="page__header">
          <h1 class="page__title">${esc(I18N.t(meta.titleKey))}</h1>
        </header>
        <div id="status" class="status" role="status" aria-live="polite">
          ${esc(I18N.t('loading'))}
        </div>
        <section id="list" class="card-grid"
                 aria-label="${esc(I18N.t(meta.titleKey))}"></section>
      </div>
      <div id="map-root" class="map-section map-section--section"
           data-sources="${esc(name)}"></div>
    `;

    try {
      const items = await loadData(name);
      renderList(items, name, meta.fallback);
    } catch {
      /* Fix #8: error is shown in the UI, not just thrown to the console */
      const status = document.getElementById('status');
      if (status) {
        status.textContent = I18N.t('errorLoad');
        status.className   = 'status status--error';
      }
    }

    initMap('map-root', [name]);
  }

  function renderList(data, source, fallback) {
    const status = document.getElementById('status');
    const list   = document.getElementById('list');
    if (!status || !list) return;

    const items = data.filter(item => item.id && item.title);

    if (!items.length) {
      status.textContent = I18N.t('empty');
      status.className   = 'status status--empty';
      return;
    }

    status.style.display = 'none';

    items.forEach(item => {
      const a       = document.createElement('a');
      /* Fix #3: no &lang= param appended — language is handled by localStorage */
      a.href        = `#/object/${encodeURIComponent(source)}/${encodeURIComponent(item.id)}`;
      a.className   = 'list-item';

      const img     = document.createElement('img');
      img.className = 'list-item__image';
      /* Fix #11: use section-specific fallback; fix asset path prefix */
      img.src       = fixAssetPath(item.image) || fallback;
      img.alt       = item.title;
      img.loading   = 'lazy';
      // Silently use fallback if the image fails to load
      img.onerror   = () => { img.src = fallback; img.onerror = null; };

      const body    = document.createElement('div');
      body.className = 'list-item__body';

      const title   = document.createElement('h2');
      title.className   = 'list-item__title';
      title.textContent = item.title;

      body.appendChild(title);
      a.append(img, body);
      list.appendChild(a);
    });
  }

  // ============================================================
  // OBJECT DETAIL VIEW
  // ============================================================

  async function renderObject(app, source, id) {
    if (!SOURCES.includes(source)) { renderHome(app); return; }

    document.documentElement.lang = I18N.get();

    // Shell with loading state
    app.innerHTML = `
      <div class="page page--object">
        <div id="status" class="status" role="status" aria-live="polite">
          ${esc(I18N.t('loadingObj'))}
        </div>
        <article id="objectCard" class="object-card" hidden>
          <h1 id="objTitle" class="page__title"></h1>
          <img id="objImage" class="object-card__image" src="" alt="" hidden />
          <div id="objAudio" class="object-card__audio-wrap"></div>
          <div id="objDesc"  class="object-card__text"></div>
        </article>
      </div>
    `;

    let object = null;
    try {
      const items = await loadData(source);
      object = items.find(item => item.id === id) || null;
    } catch {
      showObjectError(I18N.t('errorObj'));
      return;
    }

    if (!object) {
      showObjectError(I18N.t('errorNotFound'));
      return;
    }

    populateObject(object);
  }

  function populateObject(object) {
    const status  = document.getElementById('status');
    const card    = document.getElementById('objectCard');
    const titleEl = document.getElementById('objTitle');
    const imgEl   = document.getElementById('objImage');
    const audioEl = document.getElementById('objAudio');
    const descEl  = document.getElementById('objDesc');
    if (!status || !card || !titleEl || !audioEl || !descEl) return;

    document.title = `${object.title} ${I18N.t('pageTitle')}`;

    /* Fix #4: noTitle key covers all three languages */
    titleEl.textContent = object.title || I18N.t('noTitle');

    if (object.image && imgEl) {
      imgEl.src    = fixAssetPath(object.image);
      imgEl.alt    = object.title;
      imgEl.hidden = false;
    }

    /*
     * Fix #9: audio element built via DOM API, not innerHTML,
     *         so object.audio never escapes into an HTML attribute.
     * Fix #2: MP3 source added as fallback for Safari / iOS
     *         (OGG is unsupported on WebKit).
     * Fix #12: controlslist="nodownload" is Chrome-only and has no
     *          effect elsewhere — kept intentionally for Chrome UX.
     */
    if (object.audio) {
      const audioPath = fixAssetPath(object.audio);

      const audioEl2 = document.createElement('audio');
      audioEl2.className = 'object-card__audio-player';
      audioEl2.controls  = true;
      audioEl2.style.width = '100%';
      audioEl2.setAttribute('controlslist', 'nodownload'); /* Chrome-only, harmless elsewhere */

      const srcOgg  = document.createElement('source');
      srcOgg.type   = 'audio/ogg';
      srcOgg.src    = audioPath;                            /* DOM property — safe */

      const srcMp3  = document.createElement('source');
      srcMp3.type   = 'audio/mpeg';
      srcMp3.src    = audioPath.replace(/\.ogg$/i, '.mp3'); /* Fix #2: Safari fallback */

      audioEl2.append(srcOgg, srcMp3, document.createTextNode(I18N.t('audioNotSupported')));
      audioEl.appendChild(audioEl2);
    } else {
      const p = document.createElement('p');
      p.className   = 'object-card__meta';
      p.textContent = I18N.t('noAudio');
      audioEl.appendChild(p);
    }

    /*
     * description fields contain trusted CMS-authored HTML.
     * This is intentional — descriptions are static content from the data files,
     * not user input, so innerHTML is safe here.
     */
    descEl.innerHTML = object.description || I18N.t('noDesc');

    status.style.display = 'none';
    card.hidden = false;
  }

  function showObjectError(message) {
    const status = document.getElementById('status');
    if (!status) return;

    /* Fix #8: error always visible in UI */
    status.innerHTML  = '';
    status.className  = 'status status--error';
    status.appendChild(document.createTextNode(message));
    status.appendChild(document.createElement('br'));
    status.appendChild(document.createElement('br'));

    const homeLink       = document.createElement('a');
    homeLink.href        = '#/';
    homeLink.textContent = I18N.t('errorGoHome');
    status.appendChild(homeLink);
  }

  // ============================================================
  // MAP (Leaflet helper)
  // ============================================================

  function makeMarkerIcon(color) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="#fff"/>
    </svg>`;
    return L.divIcon({
      html:        svg,
      className:   '',
      iconSize:    [28, 36],
      iconAnchor:  [14, 36],
      popupAnchor: [0, -38],
    });
  }

  function destroyMap() {
    if (_map) { _map.remove(); _map = null; }
  }

  function initMap(containerId, sources) {
    if (typeof L === 'undefined') return;
    const el = document.getElementById(containerId);
    if (!el) return;

    _map = L.map(containerId, { zoomControl: true }).setView([53.8918, 25.3021], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_map);

    Promise.all(
      sources.map(source =>
        fetch(`./data/${I18N.dataFile(source)}`)
          .then(r => { if (!r.ok) throw new Error(); return r.json(); })
          .then(items => ({ source, items }))
          .catch(() => ({ source, items: [] }))
      )
    ).then(results => {
      results.forEach(({ source, items }) => {
        const meta = SECTION_META[source] || {};
        const icon = makeMarkerIcon(meta.color || '#999');

        items.forEach(item => {
          if (!item.lat || !item.lng) return;

          /* Build popup entirely via DOM — no innerHTML with dynamic data */
          const popup = document.createElement('div');
          popup.className = 'map-popup';

          const imgSrc = fixAssetPath(item.image || '');
          if (imgSrc) {
            const img     = document.createElement('img');
            img.src       = imgSrc;
            img.alt       = item.title;
            img.className = 'map-popup__img';
            popup.appendChild(img);
          }

          const link       = document.createElement('a');
          /* Fix #3: no &lang= in URL */
          link.href        = `#/object/${encodeURIComponent(source)}/${encodeURIComponent(item.id)}`;
          link.className   = 'map-popup__title';
          link.textContent = item.title;
          popup.appendChild(link);

          L.marker([item.lat, item.lng], { icon })
            .addTo(_map)
            .bindPopup(popup, { maxWidth: 220, className: 'map-popup-wrap' });
        });
      });
    });
  }

  // ============================================================
  // BOOTSTRAP
  // ============================================================

  function init() {
    /* Lang switcher is mounted once and persists across all route changes */
    I18N.renderToggle();

    /*
     * Back button is a single persistent node.
     * Shown/hidden per route; href updated to the logical parent route.
     * Fix #14: uses body.has-back class instead of :has() for broad support.
     */
    _backBtn           = document.createElement('a');
    _backBtn.className = 'back-button';
    _backBtn.href      = '#/';
    _backBtn.hidden    = true;
    document.body.appendChild(_backBtn);

    /* Fix #14: if :has() is unsupported, the CSS fallback .no-has rule kicks in */
    if (!CSS.supports('selector(:has(*))')) {
      document.body.classList.add('no-has');
    }

    window.addEventListener('hashchange', () => navigate(parseRoute()));
    navigate(parseRoute());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
