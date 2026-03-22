/* ============================================================
   app.js — LidaGid Single-Page Application
   Matches original MPA visual design exactly.
   Welcome screen is separate welcome.html.
   ============================================================ */

(function () {
  'use strict';

  const SOURCES = ['sights', 'enterprises', 'people'];

  const META = {
    sights:      { color: '#f5a623', fallback: './assets/images/lidski-zamak.jpg',     titleKey: 'sightsTitle'      },
    enterprises: { color: '#4a90d9', fallback: './assets/images/maloczny-zavod.jpg',   titleKey: 'enterprisesTitle' },
    people:      { color: '#5cb85c', fallback: './assets/images/kamandzirovaczny.jpg', titleKey: 'peopleTitle'      },
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
    updateChrome(route);
    if      (route.view === 'section') renderSection(app, route.name);
    else if (route.view === 'object')  renderObject(app, route.source, route.id);
    else                               renderHome(app);
  }

  /* ── Chrome ── */
  function updateChrome(route) {
    if (!_back) return;
    const isHome = route.view === 'home';
    _back.hidden = isHome;
    document.body.classList.toggle('has-back', !isHome);
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
            <div class="card__bg" style="background-image: url('./assets/images/kamandzirovaczny.jpg')"></div>
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
        <section id="list" class="card-grid" aria-label="${esc(I18N.t(meta.titleKey))}"></section>
      </div>
      <div id="map-root" class="map-section map-section--section"></div>
    `;

    try {
      const items = await loadData(name);
      renderList(items, name, meta.fallback);
    } catch {
      /* Fix #8: error shown in UI */
      const st = document.getElementById('status');
      if (st) { st.textContent = I18N.t('errorLoad'); st.className = 'status status--error'; }
    }
    initMap('map-root', [name]);
  }

  function renderList(data, source, fallback) {
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

    items.forEach(item => {
      const a = document.createElement('a');
      /* Fix #3: no &lang= param — language handled by localStorage only */
      a.href      = `#/object/${encodeURIComponent(source)}/${encodeURIComponent(item.id)}`;
      a.className = 'list-item';

      const img       = document.createElement('img');
      img.className   = 'list-item__image';
      /* Fix #11: per-source fallback image */
      img.src         = fixPath(item.image) || fallback;
      img.alt         = item.title;
      img.loading     = 'lazy';
      img.onerror     = () => { img.src = fallback; img.onerror = null; };

      const body      = document.createElement('div');
      body.className  = 'list-item__body';

      const title     = document.createElement('h2');
      title.className   = 'list-item__title';
      title.textContent = item.title;

      body.appendChild(title);
      a.append(img, body);
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
    populateObject(obj);
  }

  function populateObject(obj) {
    const status = document.getElementById('status');
    const card   = document.getElementById('objectCard');
    if (!status || !card) return;

    document.title = `${obj.title} ${I18N.t('pageTitle')}`;

    /* Title */
    const h1 = document.createElement('h1');
    h1.className   = 'page__title';
    h1.textContent = obj.title || I18N.t('noTitle');  /* Fix #4: all 3 langs via i18n key */

    /* Hero image */
    if (obj.image) {
      const img        = document.createElement('img');
      img.className    = 'object-card__image';
      img.src          = fixPath(obj.image);
      img.alt          = obj.title;
      card.appendChild(img);
    }

    card.appendChild(h1);

    /*
     * Audio — Fix #2: OGG + MP3 fallback for Safari/iOS
     * Fix #9: src set via DOM property, not innerHTML injection
     * Fix #12: controlslist="nodownload" kept (Chrome-only, harmless elsewhere)
     */
    const audioWrap = document.createElement('div');
    audioWrap.className = 'object-card__audio-wrap';

    if (obj.audio) {
      const audio = document.createElement('audio');
      audio.className = 'object-card__audio-player';
      audio.controls  = true;
      audio.setAttribute('controlslist', 'nodownload');

      const srcOgg = document.createElement('source');
      srcOgg.type  = 'audio/ogg';
      srcOgg.src   = fixPath(obj.audio);

      const srcMp3 = document.createElement('source');
      srcMp3.type  = 'audio/mpeg';
      srcMp3.src   = fixPath(obj.audio).replace(/\.ogg$/i, '.mp3');

      audio.append(srcOgg, srcMp3, document.createTextNode(I18N.t('audioNotSupported')));
      audioWrap.appendChild(audio);
    } else {
      const p = document.createElement('p');
      p.className   = 'object-card__meta';
      p.textContent = I18N.t('noAudio');
      audioWrap.appendChild(p);
    }
    card.appendChild(audioWrap);

    /* Description — trusted CMS HTML, intentional innerHTML */
    const desc = document.createElement('div');
    desc.className = 'object-card__text';
    desc.innerHTML = obj.description || I18N.t('noDesc');
    card.appendChild(desc);

    status.style.display = 'none';
    card.hidden = false;
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
    if (typeof L === 'undefined') return;
    const el = document.getElementById(containerId);
    if (!el) return;

    _map = L.map(containerId, { zoomControl: true }).setView([53.8918, 25.3021], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(_map);

    Promise.all(
      sources.map(src =>
        fetch(`./data/${I18N.dataFile(src)}`)
          .then(r => { if (!r.ok) throw new Error(); return r.json(); })
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
    I18N.renderToggle();

    _back           = document.createElement('a');
    _back.className = 'back-button';
    _back.href      = '#/';
    _back.hidden    = true;
    document.body.appendChild(_back);

    /* Fix #14: add class for browsers without :has() support */
    if (!CSS.supports('selector(:has(*))')) document.body.classList.add('no-has');

    window.addEventListener('hashchange', () => navigate(parseRoute()));
    navigate(parseRoute());
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', init)
    : init();

})();
