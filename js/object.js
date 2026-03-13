const params = new URLSearchParams(window.location.search);
const id = params.get("id");
const status = document.getElementById("status");
const objectCard = document.getElementById("objectCard");

if (!id) {
  showError("Не перададзены id аб'екта. Перайдзіце са спісу.");
  throw new Error("No ID in URL");
}

Promise.all([
  fetchJson("../data/sights.json"),
  fetchJson("../data/enterprises.json"),
  fetchJson("../data/people.json"),
])
  .then(([sights, enterprises, people]) => {
    const object = [...sights, ...enterprises, ...people].find((item) => item.id === id);

    if (!object) {
      showError("Аб'ект не знойдзены.");
      return;
    }

    renderObject(object);
  })
  .catch(() => {
    showError("Памылка загрузкі дадзеных. Паспрабуйце пазней.");
  });

function fetchJson(path) {
  return fetch(path).then((response) => {
    if (!response.ok) throw new Error("Fetch failed");
    return response.json();
  });
}

function renderObject(object) {
  const titleEl = document.getElementById("title");
  const img = document.getElementById("image");
  const descEl = document.getElementById("description");
  const audioContainer = document.getElementById("audioContainer");

  titleEl.textContent = object.title || "Без назвы";

  if (object.image) {
    img.src = object.image;
    img.alt = object.title;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }

  descEl.innerHTML = object.description || "<p>Апісанне адсутнічае.</p>";

  if (object.audio) {
    audioContainer.innerHTML = `
      <audio class="object-card__audio" controls controlslist="nodownload" style="width: 100%;">
        <source src="${object.audio}" type="audio/ogg">
        Ваш браўзер не падтрымлівае аўдыёэлемент.
      </audio>
    `;
  } else {
    audioContainer.innerHTML = "<p class='object-card__meta'>Аўдыязапіс адсутнічае.</p>";
  }

  status.style.display = "none";
  objectCard.hidden = false;
}

function showError(message) {
  status.innerHTML = `${message}<br><br><a href="../index.html">Вярнуцца на галоўную</a>`;
  status.className = "status status--error";
  objectCard.hidden = true;
}
