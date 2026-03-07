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
    const allData = [...sights, ...enterprises, ...people];
    const object = allData.find((item) => item.id === id);

    if (!object) {
      showError("Аб'ект не знойдзены. Магчыма, ён быў выдалены або id некарэктны.");
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
    img.alt = object.title || "Ілюстрацыя аб'екта";
  } else {
    img.remove();
  }

  if (object.description) {
    descEl.innerHTML = object.description;
  } else {
    descEl.innerHTML = "<p>Апісанне пакуль не дададзена.</p>";
  }

  if (object.audio) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.style.width = "100%";

    const source = document.createElement("source");
    source.src = object.audio;
    source.type = "audio/mpeg";

    audio.appendChild(source);
    audioContainer.appendChild(audio);
  } else {
    audioContainer.innerHTML = "<p class='obj-meta'>Аўдыязапіс пакуль не дададзены.</p>";
  }

  status.style.display = "none";
  objectCard.hidden = false;
}

function showError(message) {
  status.innerHTML = `${message}<br><a class="home-link" href="../index.html">Вярнуцца на галоўную</a>`;
  status.className = "loading error-state";
  objectCard.hidden = true;
}