const params = new URLSearchParams(window.location.search);
const id     = params.get("id");
const source = params.get("source");
const status      = document.getElementById("status");
const objectCard  = document.getElementById("objectCard");

if (!id) {
  showError(I18N.t('errorNoId'));
  throw new Error("No ID in URL");
}

const SOURCES = ["sights", "enterprises", "people"];

// Determine which file(s) to fetch based on language
function langFile(src) {
  return I18N.dataFile(src);
}

const filesToFetch =
  source && SOURCES.includes(source)
    ? [`../data/${langFile(source)}`]
    : SOURCES.map((s) => `../data/${langFile(s)}`);

Promise.all(filesToFetch.map(fetchJson))
  .then((results) => {
    const object = results.flat().find((item) => item.id === id);
    if (!object) {
      showError(I18N.t('errorNotFound'));
      return;
    }
    renderObject(object);
  })
  .catch(() => {
    showError(I18N.t('errorObj'));
  });

function fetchJson(path) {
  return fetch(path).then((response) => {
    if (!response.ok) throw new Error("Fetch failed");
    return response.json();
  });
}

function renderObject(object) {
  const titleEl        = document.getElementById("title");
  const img            = document.getElementById("image");
  const descEl         = document.getElementById("description");
  const audioContainer = document.getElementById("audioContainer");

  document.title       = `${object.title} ${I18N.t('pageTitle')}`;
  titleEl.textContent  = object.title || (I18N.get() === 'en' ? 'Untitled' : 'Без назвы');

  if (object.image) {
    img.src    = object.image;
    img.alt    = object.title;
    img.hidden = false;
  }

  descEl.innerHTML = object.description || I18N.t('noDesc');

  if (object.audio) {
    audioContainer.innerHTML = `
      <audio class="object-card__audio" controls controlslist="nodownload" style="width: 100%;">
        <source src="${object.audio}" type="audio/ogg">
        ${I18N.t('audioNotSupported')}
      </audio>
    `;
  } else {
    audioContainer.innerHTML = `<p class='object-card__meta'>${I18N.t('noAudio')}</p>`;
  }

  status.style.display = "none";
  objectCard.hidden    = false;
}

function showError(message) {
  status.innerHTML  = `${message}<br><br><a href="../index.html">${I18N.t('errorGoHome')}</a>`;
  status.className  = "status status--error";
  objectCard.hidden = true;
}
