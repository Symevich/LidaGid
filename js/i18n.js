/* ============================================================
   i18n.js — language management for LidaGid
   Supported: 'be' (Беларуская), 'ru' (Русский), 'en' (English)
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
      back:              '← Назад',
      loading:           'Загрузка дадзеных...',
      loadingObj:        'Загрузка матэрыялу...',
      errorLoad:         'Не ўдалося загрузіць дадзеныя. Паспрабуйце абнавіць старонку.',
      errorObj:          'Памылка загрузкі дадзеных. Паспрабуйце пазней.',
      errorNoId:         "Не перададзены id аб'екта. Перайдзіце са спісу.",
      errorNotFound:     "Аб'ект не знойдзены.",
      errorGoHome:       'Вярнуцца на галоўную',
      empty:             'Пакуль у гэтым раздзеле няма матэрыялаў.',
      noDesc:            '<p>Апісанне адсутнічае.</p>',
      noTitle:           'Без назвы',
      audioNotSupported: 'Ваш браўзер не падтрымлівае аўдыёэлемент.',
      pageTitle:         '| Аўдыёгід па Лідзе',
      /* Share — chrome button + modal (offline: no network request) */
      share:             'Падзяліцца',
      shareAria:         'Падзяліцца спасылкай на гэтую старонку',
      shareTo:           'Падзяліцца ў…',
      shareToNetwork:    'Падзяліцца ў {network}',
      shareCopyLink:     'Скапіяваць спасылку',
      shareMore:         'Яшчэ…',
      shareClose:        'Зачыніць акно',
      qrAlt:             'QR-код са спасылкай на гэтую старонку',
      qrTitle:           'Спасылка на старонку',
      qrHint:            'Навядзіце камеру тэлефона на код, каб адкрыць старонку',
      qrUnavailable:     'Не ўдалося згенераваць QR-код.',
      linkCopied:        'Спасылка скапіравана',
      shareFailed:       'Не ўдалося скапіраваць спасылку',
      /* Mini quiz / gamification — only the quiz itself is on the
         object page; these counter strings are kept for the moment the
         "X of N" progress badge is switched back on. */
      quizTitle:         'Праверце сябе',
      quizCorrect:       'Правільна!',
      quizWrong:         'Няправільна.',
      quizAnswer:        'Правільны адказ: {answer}',
      quizBadge:         'Квіз пройдзены',
      quizProgress:      'Квізы: {done} з {total}',
      quizProgressAria:  'Прагрэс па квізах',
      /* Photo carousel — only used by records that carry more than one picture */
      galleryLabel:      'Фотаздымкі: {total}',
      galleryAlt:        '{title} — фота {n} з {total}',
      galleryGoTo:       'Паказаць фота {n} з {total}',
      galleryPrev:       'Папярэдняе фота',
      galleryNext:       'Наступнае фота',
    },
    ru: {
      appTitle:          'Аудиогид по городу Лида',
      sights:            'Достопримечательности',
      enterprises:       'Предприятия',
      people:            'Известные люди',
      sightsTitle:       'Достопримечательности Лиды',
      enterprisesTitle:  'Предприятия Лиды',
      peopleTitle:       'Известные люди Лиды',
      back:              '← Назад',
      loading:           'Загрузка данных...',
      loadingObj:        'Загрузка материала...',
      errorLoad:         'Не удалось загрузить данные. Попробуйте обновить страницу.',
      errorObj:          'Ошибка загрузки данных. Попробуйте позже.',
      errorNoId:         'Не передан id объекта. Перейдите из списка.',
      errorNotFound:     'Объект не найден.',
      errorGoHome:       'Вернуться на главную',
      empty:             'В этом разделе пока нет материалов.',
      noDesc:            '<p>Описание отсутствует.</p>',
      noTitle:           'Без названия',
      audioNotSupported: 'Ваш браузер не поддерживает аудиоэлемент.',
      pageTitle:         '| Аудиогид по Лиде',
      /* Share — chrome button + modal (offline: no network request) */
      share:             'Поделиться',
      shareAria:         'Поделиться ссылкой на эту страницу',
      shareTo:           'Поделиться в…',
      shareToNetwork:    'Поделиться в {network}',
      shareCopyLink:     'Скопировать ссылку',
      shareMore:         'Ещё…',
      shareClose:        'Закрыть окно',
      qrAlt:             'QR-код со ссылкой на эту страницу',
      qrTitle:           'Ссылка на страницу',
      qrHint:            'Наведите камеру телефона на код, чтобы открыть страницу',
      qrUnavailable:     'Не удалось сгенерировать QR-код.',
      linkCopied:        'Ссылка скопирована',
      shareFailed:       'Не удалось скопировать ссылку',
      /* Mini quiz / gamification — only the quiz itself is on the
         object page; these counter strings are kept for the moment the
         "X of N" progress badge is switched back on. */
      quizTitle:         'Проверьте себя',
      quizCorrect:       'Правильно!',
      quizWrong:         'Неправильно.',
      quizAnswer:        'Правильный ответ: {answer}',
      quizBadge:         'Квиз пройден',
      quizProgress:      'Квизы: {done} из {total}',
      quizProgressAria:  'Прогресс по квизам',
      /* Photo carousel — only used by records that carry more than one picture */
      galleryLabel:      'Фотографии: {total}',
      galleryAlt:        '{title} — фото {n} из {total}',
      galleryGoTo:       'Показать фото {n} из {total}',
      galleryPrev:       'Предыдущее фото',
      galleryNext:       'Следующее фото',
    },
    en: {
      appTitle:          'Audio Guide to the City of Lida',
      sights:            'Sights',
      enterprises:       'Enterprises',
      people:            'Notable People',
      sightsTitle:       'Sights of Lida',
      enterprisesTitle:  'Enterprises of Lida',
      peopleTitle:       'Notable People of Lida',
      back:              '← Back',
      loading:           'Loading data...',
      loadingObj:        'Loading content...',
      errorLoad:         'Failed to load data. Please refresh the page.',
      errorObj:          'Error loading data. Please try again later.',
      errorNoId:         'No object ID provided. Please navigate from the list.',
      errorNotFound:     'Object not found.',
      errorGoHome:       'Return to Home',
      empty:             'No content in this section yet.',
      noDesc:            '<p>No description available.</p>',
      noTitle:           'Untitled',
      audioNotSupported: 'Your browser does not support the audio element.',
      pageTitle:         '| Lida Audio Guide',
      /* Share — chrome button + modal (offline: no network request) */
      share:             'Share',
      shareAria:         'Share a link to this page',
      shareTo:           'Share to...',
      shareToNetwork:    'Share to {network}',
      shareCopyLink:     'Copy link',
      shareMore:         'More…',
      shareClose:        'Close the window',
      qrAlt:             'QR code with the link to this page',
      qrTitle:           'Link to the page',
      qrHint:            'Point your phone camera at the code to open this page',
      qrUnavailable:     'Could not generate the QR code.',
      linkCopied:        'Link copied',
      shareFailed:       'Could not copy the link',
      /* Mini quiz / gamification — only the quiz itself is on the
         object page; these counter strings are kept for the moment the
         "X of N" progress badge is switched back on. */
      quizTitle:         'Test yourself',
      quizCorrect:       'Correct!',
      quizWrong:         'Not quite.',
      quizAnswer:        'The correct answer is: {answer}',
      quizBadge:         'Quiz completed',
      quizProgress:      'Quizzes: {done} of {total}',
      quizProgressAria:  'Quiz progress',
      /* Photo carousel — only used by records that carry more than one picture */
      galleryLabel:      'Photographs: {total}',
      galleryAlt:        '{title} — photo {n} of {total}',
      galleryGoTo:       'Show photo {n} of {total}',
      galleryPrev:       'Previous photo',
      galleryNext:       'Next photo',
    },
  };

  const LABELS = { be: 'Беларуская', ru: 'Русский', en: 'English' };

  function get() {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED.includes(s) ? s : DEFAULT;
    } catch(e) { return DEFAULT; }
  }

  function set(lang) {
    if (!SUPPORTED.includes(lang)) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch(e) {}
  }

  function t(key, vars) {
    const lang  = get();
    const value = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS[DEFAULT][key] || key;
    if (!vars) return value;
    /* {name} placeholders, e.g. t('quizProgress', { done: 3, total: 8 }) */
    return String(value).replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
    );
  }

  function dataFile(source) {
    const lang = get();
    return lang === 'be' ? `${source}.json` : `${source}.${lang}.json`;
  }

  /* ── Lang switcher
     Fix #5: <button> trigger with full keyboard nav (Arrow/Enter/Escape)
     Fix #13: document listener registered once per renderToggle() call ── */
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
      <ul class="lang-switcher__dropdown" id="langDropdown"
          role="listbox" aria-label="Select language" aria-hidden="true">
        ${SUPPORTED.map(lang => `
          <li class="lang-switcher__option${lang === current ? ' lang-switcher__option--active' : ''}"
              role="option" aria-selected="${lang === current}"
              tabindex="-1" data-lang="${lang}">
            ${LABELS[lang]}
          </li>`).join('')}
      </ul>
    `;

    document.body.appendChild(wrapper);

    const trigger  = wrapper.querySelector('#langTrigger');
    const dropdown = wrapper.querySelector('#langDropdown');
    const options  = Array.from(dropdown.querySelectorAll('.lang-switcher__option'));

    const open = () => {
      dropdown.classList.add('lang-switcher__dropdown--open');
      dropdown.setAttribute('aria-hidden', 'false');
      wrapper.classList.add('lang-switcher--open');
      trigger.setAttribute('aria-expanded', 'true');
      (dropdown.querySelector('.lang-switcher__option--active') || options[0]).focus();
    };
    const close = () => {
      dropdown.classList.remove('lang-switcher__dropdown--open');
      dropdown.setAttribute('aria-hidden', 'true');
      wrapper.classList.remove('lang-switcher--open');
      trigger.setAttribute('aria-expanded', 'false');
    };
    const pick = (lang) => {
      if (lang !== current) { set(lang); location.reload(); }
      close();
    };

    trigger.addEventListener('click', e => {
      e.stopPropagation();
      dropdown.classList.contains('lang-switcher__dropdown--open') ? close() : open();
    });

    dropdown.addEventListener('keydown', e => {
      const i = options.indexOf(document.activeElement);
      if      (e.key === 'ArrowDown') { e.preventDefault(); options[(i + 1) % options.length].focus(); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); options[(i - 1 + options.length) % options.length].focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (document.activeElement.dataset.lang) pick(document.activeElement.dataset.lang); }
      else if (e.key === 'Escape')    { close(); trigger.focus(); }
    });

    trigger.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    options.forEach(o => o.addEventListener('click', () => pick(o.dataset.lang)));
    document.addEventListener('click', close);

    return wrapper;
  }

  return { get, set, t, dataFile, renderToggle };
})();
