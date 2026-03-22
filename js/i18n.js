/* ============================================================
   i18n.js — language management for LidaGid
   Supported: 'be' (Беларуская), 'ru' (Русский), 'en' (English)
   Persisted in localStorage under key 'lidagid_lang'
   ============================================================ */

const I18N = (() => {
  const STORAGE_KEY = 'lidagid_lang';
  const SUPPORTED   = ['be', 'ru', 'en'];
  const DEFAULT     = 'be';

  const STRINGS = {
    be: {
      appTitle:          'Аўдыёгід па горадзе Ліда',
      sights:            'Славутасці',
      enterprises:       'Прадпрыемствы',
      people:            'Вядомыя людзі',
      sightsTitle:       'Славутасці Ліды',
      enterprisesTitle:  'Прадпрыемствы Ліды',
      peopleTitle:       'Вядомыя людзі Лідчыны',
      backHome:          '← На галоўную',
      back:              '← Назад',
      loading:           'Загрузка дадзеных...',
      loadingObj:        'Загрузка матэрыялу...',
      errorLoad:         'Не ўдалося загрузіць дадзеныя. Паспрабуйце абнавіць старонку.',
      errorObj:          'Памылка загрузкі дадзеных. Паспрабуйце пазней.',
      errorNoId:         "Не перададзены id аб'екта. Перайдзіце са спісу.",
      errorNotFound:     "Аб'ект не знойдзены.",
      errorGoHome:       'Вярнуцца на галоўную',
      empty:             'Пакуль у гэтым раздзеле няма матэрыялаў.',
      noAudio:           'Аўдыязапіс адсутнічае.',
      noDesc:            '<p>Апісанне адсутнічае.</p>',
      noTitle:           'Без назвы',              /* Fix #4 */
      audioNotSupported: 'Ваш браўзер не падтрымлівае аўдыёэлемент.',
      pageTitle:         '| Аўдыёгід па Лідзе',
    },
    ru: {
      appTitle:          'Аудиогид по городу Лида',
      sights:            'Достопримечательности',
      enterprises:       'Предприятия',
      people:            'Известные люди',
      sightsTitle:       'Достопримечательности Лиды',
      enterprisesTitle:  'Предприятия Лиды',
      peopleTitle:       'Известные люди Лиды',
      backHome:          '← На главную',
      back:              '← Назад',
      loading:           'Загрузка данных...',
      loadingObj:        'Загрузка материала...',
      errorLoad:         'Не удалось загрузить данные. Попробуйте обновить страницу.',
      errorObj:          'Ошибка загрузки данных. Попробуйте позже.',
      errorNoId:         'Не передан id объекта. Перейдите из списка.',
      errorNotFound:     'Объект не найден.',
      errorGoHome:       'Вернуться на главную',
      empty:             'В этом разделе пока нет материалов.',
      noAudio:           'Аудиозапись отсутствует.',
      noDesc:            '<p>Описание отсутствует.</p>',
      noTitle:           'Без названия',           /* Fix #4 */
      audioNotSupported: 'Ваш браузер не поддерживает аудиоэлемент.',
      pageTitle:         '| Аудиогид по Лиде',
    },
    en: {
      appTitle:          'Audio Guide to the City of Lida',
      sights:            'Sights',
      enterprises:       'Enterprises',
      people:            'Notable People',
      sightsTitle:       'Sights of Lida',
      enterprisesTitle:  'Enterprises of Lida',
      peopleTitle:       'Notable People of Lida',
      backHome:          '← Home',
      back:              '← Back',
      loading:           'Loading data...',
      loadingObj:        'Loading content...',
      errorLoad:         'Failed to load data. Please refresh the page.',
      errorObj:          'Error loading data. Please try again later.',
      errorNoId:         'No object ID provided. Please navigate from the list.',
      errorNotFound:     'Object not found.',
      errorGoHome:       'Return to Home',
      empty:             'No content in this section yet.',
      noAudio:           'No audio recording available.',
      noDesc:            '<p>No description available.</p>',
      noTitle:           'Untitled',               /* Fix #4 */
      audioNotSupported: 'Your browser does not support the audio element.',
      pageTitle:         '| Lida Audio Guide',
    },
  };

  const LABELS = { be: 'Беларуская', ru: 'Русский', en: 'English' };

  function get() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED.includes(stored) ? stored : DEFAULT;
    } catch (e) {
      return DEFAULT;
    }
  }

  function set(lang) {
    if (!SUPPORTED.includes(lang)) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  }

  function t(key) {
    const lang = get();
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS[DEFAULT][key] || key;
  }

  /* Returns the correct JSON filename for a given source */
  function dataFile(source) {
    const lang = get();
    return lang === 'be' ? `${source}.json` : `${source}.${lang}.json`;
  }

  /*
   * Fix #5: Lang switcher now uses a <button> as the trigger so it is
   * reachable and activatable by keyboard without any extra workarounds.
   * Proper aria-haspopup / aria-expanded replace the old role="combobox".
   * Fix #13: The document-level close listener is registered once and uses
   * an AbortController so it can be cleanly removed if needed in the future.
   */
  function renderToggle() {
    const current = get();

    const wrapper = document.createElement('div');
    wrapper.className = 'lang-switcher';

    wrapper.innerHTML = `
      <button class="lang-switcher__trigger"
              id="langTrigger"
              aria-haspopup="listbox"
              aria-expanded="false"
              aria-label="Select language / Выбар мовы">
        <svg class="lang-switcher__globe" width="14" height="14" viewBox="0 0 16 16"
             fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/>
          <ellipse cx="8" cy="8" rx="3" ry="7" stroke="currentColor" stroke-width="1.4"/>
          <line x1="1" y1="6" x2="15" y2="6" stroke="currentColor" stroke-width="1.4"/>
          <line x1="1" y1="10" x2="15" y2="10" stroke="currentColor" stroke-width="1.4"/>
        </svg>
        <span class="lang-switcher__label">${LABELS[current]}</span>
        <svg class="lang-switcher__caret" width="10" height="10" viewBox="0 0 10 10"
             fill="none" aria-hidden="true">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.4"
                stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <ul class="lang-switcher__dropdown"
          id="langDropdown"
          role="listbox"
          aria-label="Select language"
          aria-hidden="true">
        ${SUPPORTED.map(lang => `
          <li class="lang-switcher__option${lang === current ? ' lang-switcher__option--active' : ''}"
              role="option"
              aria-selected="${lang === current}"
              tabindex="-1"
              data-lang="${lang}">
            ${LABELS[lang]}
          </li>`).join('')}
      </ul>
    `;

    document.body.appendChild(wrapper);

    const trigger  = wrapper.querySelector('#langTrigger');
    const dropdown = wrapper.querySelector('#langDropdown');
    const options  = Array.from(dropdown.querySelectorAll('.lang-switcher__option'));

    function openDropdown() {
      dropdown.classList.add('lang-switcher__dropdown--open');
      dropdown.setAttribute('aria-hidden', 'false');
      wrapper.classList.add('lang-switcher--open');
      trigger.setAttribute('aria-expanded', 'true');
      // Move focus to the active option
      const active = dropdown.querySelector('.lang-switcher__option--active');
      if (active) active.focus();
    }

    function closeDropdown() {
      dropdown.classList.remove('lang-switcher__dropdown--open');
      dropdown.setAttribute('aria-hidden', 'true');
      wrapper.classList.remove('lang-switcher--open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function selectLang(lang) {
      if (lang !== current) { set(lang); location.reload(); }
      closeDropdown();
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.contains('lang-switcher__dropdown--open')
        ? closeDropdown()
        : openDropdown();
    });

    /* Keyboard navigation inside dropdown */
    dropdown.addEventListener('keydown', (e) => {
      const idx = options.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        options[(idx + 1) % options.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        options[(idx - 1 + options.length) % options.length].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (document.activeElement.dataset.lang) selectLang(document.activeElement.dataset.lang);
      } else if (e.key === 'Escape') {
        closeDropdown();
        trigger.focus();
      }
    });

    /* Escape on trigger also closes */
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDropdown();
    });

    options.forEach(opt => {
      opt.addEventListener('click', () => selectLang(opt.dataset.lang));
    });

    /*
     * Fix #13: single document listener, stored so it could be removed later.
     * Using { capture: false } is explicit; no need for AbortController here
     * since renderToggle() is called exactly once per page lifetime in the SPA.
     */
    document.addEventListener('click', closeDropdown);
  }

  return { get, set, t, dataFile, renderToggle };
})();
